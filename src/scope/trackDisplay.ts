/**
 * Analog: CRC STARS track display state (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: per-track history buffer, full/limited datablock mode,
 * L1–L9 **leader** direction (length lives on ScopeView as a discrete px spinner), ownership color stub (T02-08
 * F3/F4), trainer **scratchpad** (0–4 A–Z0–9, not NAS FP), and display-only
 * IDENT flash live here, keyed by aircraft id — never on Aircraft kinematics
 * or intent. Not NAS STARS.
 */

import type { Aircraft, World } from "@core";
import {
  acceptInboundHandoff,
  acceptPointout,
  convertPointoutToHandoff,
  handoffFor,
  rejectPointout,
} from "@core";
import { sanitizeScratchpad, type DatablockMode } from "./datablock";
import { createHistoryBuf, recordHistoryOnReport, type HistoryBuf } from "./history";
import {
  createSurveillanceSampler,
  stepSurveillanceSampler,
  type SurveillanceMode,
  type SurveillanceReport,
} from "./surveillance";
import type { RadarSite } from "@scenario";
import { DEFAULT_LEADER_DIR, type LeaderDir } from "./leader";
import { applyDropTrack, applyInitiateTrack, NO_SEL_HINT, type TrackOwnership } from "./ownership";

/** Display IDENT stroke pulse (~2 s sim). Aircraft flag may last longer (phase 1). */
export const IDENT_DISPLAY_FLASH_MS = 2000;
export const LDB_QUERY_DURATION_MS = 5000;
export const OUTBOUND_ACCEPTED_FLASH_MS = 5000;
/** `*B` slew beaconator on one uncorrelated track (R07 Table 18). */
export const BEACONATOR_SLEW_MS = 5000;

export interface TrackDisplay {
  history: HistoryBuf;
  /** Sim time when the yellow IDENT stroke ends; 0 = inactive. */
  identUntilSimMs: number;
  /** Last seen `Aircraft.identUntilSimMs` so a new IDENT retriggers the pulse. */
  lastAircraftIdentDeadlineMs: number;
  /** Datablock mode: full (FDB), partial (PDB, line 2 only), or limited (LDB). */
  datablockMode: DatablockMode;
  /** Numpad compass L1–L9. Default L8 (north). */
  leaderDir: LeaderDir;
  /** Spawn unowned (green/PDB). F3 → owned (white/FDB). F4 → unowned. */
  ownership: TrackOwnership;
  /**
   * Trainer scratchpad on the full/partial datablock (0–4 A–Z0–9). Default empty.
   * Display state only — never Aircraft.intent / kinematics.
   */
  scratchpad: string;
  /** Primary scratchpad #1 (approach shorthand, assigned altitude, or manual). */
  sp1?: string;
  /** Secondary scratchpad #2 (assigned speed shorthand or manual). */
  sp2?: string;
  /** Manual override for scratchpad 1. */
  manualSp1?: string;
  /** Manual override for scratchpad 2. */
  manualSp2?: string;
  /** Optional display squawk override. */
  squawk?: string;
  /** Primary-only target flag (unfilled diamond, no datablock). */
  isPrimary?: boolean;
  primaryOnly?: boolean;
  surveillance?: "primary" | "secondary";
  /** Owning controller sector ID (e.g. "D", "G"). */
  sectorId?: string;
  /** Explicit tracked flag. */
  tracked?: boolean;
  /** Sim time until which LDB ground speed query is active. */
  queriedUntilSimMs?: number;
  /** Forced FDB toggle flag on unowned/PDB track. */
  forcedFdb?: boolean;
  /** Explicitly unassociated target flag. */
  unassociated?: boolean;
  /** STARS datablock Cyan highlight (#00FFFF). Toggled via middle-click or selection. */
  highlighted?: boolean;
  /** Sim time until which accepted outbound handoff flashes white (~5s). */
  outboundFlashUntilSimMs?: number;
  /** Sim time until which `*B` slew shows Mode 3/A in place of callsign. */
  beaconatorUntilSimMs?: number;
  /** Outbound accepted click step (0: flashing, 1: solid white, 2: green FDB, 3: PDB). */
  outboundClickStep?: number;
  /** Pointout accepted visual state flag. */
  pointoutAccepted?: boolean;
  /** Pointout rejected visual state flag. */
  pointoutRejected?: boolean;
  /**
   * ATPA monitor cone enable. Default on. T02-47 / T02-49 (`*BE`/`*BI`)
   * wire this; the paint gate already honors it.
   */
  atpaMonitorEnabled?: boolean;
  /**
   * ATPA warning and alert cone enable. Default on. T02-47 / T02-49
   * (`*AE`/`*AI`). Monitor uses `atpaMonitorEnabled`.
   */
  atpaWarningAlertEnabled?: boolean;
  /**
   * Per-track Intrail Distance. Default enabled. Independent of cone mileage.
   * Scope display only — never Aircraft.intent.
   */
  atpaInTrailDistanceEnabled: boolean;
  /**
   * Per-track A/TPA Mileage. Default enabled. Independent of in-trail distance.
   */
  atpaConeMileageEnabled: boolean;
  /**
   * Manual TPA J-ring radius in NM (`*J(#.#)`). Session state — not PREF.
   * Chord range is 1–30 with tenths (T02-49); DCB spinner stays 2/3/5/10.
   */
  tpaRingNm?: number;
  /**
   * Manual TPA cone length in NM (`*P(#.#)`). Session state — not PREF.
   * Axis is ground track (`Aircraft.headingDeg`), not assigned heading.
   */
  tpaConeNm?: number;
  /**
   * Size-readout digits on this track's ring/cone. Default enabled.
   * `*D+I` / inhibit via `*D+` hides digits and keeps the stroke.
   */
  tpaSizeReadoutEnabled?: boolean;
  /**
   * Last surveillance report. Display consumers use this pose; missing means
   * out of coverage (no paint, no 30 s coast).
   */
  lastReport?: SurveillanceReport;
}

export function createTrackDisplay(ownership: TrackOwnership = "unowned"): TrackDisplay {
  return {
    history: createHistoryBuf(),
    identUntilSimMs: 0,
    lastAircraftIdentDeadlineMs: 0,
    datablockMode: ownership === "owned" ? "full" : "partial",
    leaderDir: DEFAULT_LEADER_DIR,
    ownership,
    scratchpad: "",
    sp1: "",
    sp2: "",
    queriedUntilSimMs: 0,
    forcedFdb: false,
    atpaMonitorEnabled: true,
    atpaWarningAlertEnabled: true,
    atpaInTrailDistanceEnabled: true,
    atpaConeMileageEnabled: true,
  };
}

/** Set the trainer scratchpad (SP1) for a track id. Sanitizes to 0–4 A–Z0–9. */
export function setScratchpad(tracks: Map<string, TrackDisplay>, id: string, raw: string): void {
  const td = ensureTrackDisplay(tracks, id);
  const sanitized = sanitizeScratchpad(raw);
  td.scratchpad = sanitized;
  td.sp1 = sanitized;
  td.manualSp1 = sanitized;
}

/** Set scratchpad 1 specifically. */
export function setScratchpad1(tracks: Map<string, TrackDisplay>, id: string, raw: string): void {
  const td = ensureTrackDisplay(tracks, id);
  const sanitized = sanitizeScratchpad(raw);
  td.sp1 = sanitized;
  td.manualSp1 = sanitized;
  td.scratchpad = sanitized;
}

/** Set scratchpad 2 specifically. */
export function setScratchpad2(tracks: Map<string, TrackDisplay>, id: string, raw: string): void {
  const td = ensureTrackDisplay(tracks, id);
  const sanitized = sanitizeScratchpad(raw);
  td.sp2 = sanitized;
  td.manualSp2 = sanitized;
}

/** Clear scratchpad 1 and restore automatic derivation. */
export function clearScratchpad1(tracks: Map<string, TrackDisplay>, id: string): void {
  const td = ensureTrackDisplay(tracks, id);
  td.manualSp1 = undefined;
  td.sp1 = "";
  td.scratchpad = "";
}

/** Clear scratchpad 2 and restore automatic derivation. */
export function clearScratchpad2(tracks: Map<string, TrackDisplay>, id: string): void {
  const td = ensureTrackDisplay(tracks, id);
  td.manualSp2 = undefined;
  td.sp2 = "";
}

/**
 * Format an approach identifier into standard STARS shorthand:
 * - ILS -> "I" + runway (e.g. "ILS 27" -> "I27", "ILS 04R" -> "I04R", "kdem-ils27" -> "I27")
 * - RNAV / RNP / GPS -> "R" + runway (e.g. "RNAV 22L" -> "R22L")
 * - VISUAL / VIS -> "V" + runway (e.g. "VISUAL 28" -> "V28")
 * - LOC / LOCALIZER -> "L" + runway (e.g. "LOC 09" -> "L09")
 * - VOR -> "O" + runway (e.g. "VOR 15" -> "O15")
 */
export function formatApproachShorthand(approachId: string | null | undefined): string | undefined {
  if (!approachId || approachId.trim().length === 0) {
    return undefined;
  }
  const raw = approachId.toUpperCase().trim();
  const numMatch = raw.match(/(\d{1,2}\s*[RLC]?)/);
  const rwy = numMatch ? numMatch[1].replace(/\s+/g, "") : "";

  if (raw.includes("ILS")) {
    return rwy ? `I${rwy}` : "ILS";
  }
  if (raw.includes("RNAV") || raw.includes("RNP") || raw.includes("GPS")) {
    return rwy ? `R${rwy}` : "RNAV";
  }
  if (raw.includes("VISUAL") || raw.includes("VIS")) {
    return rwy ? `V${rwy}` : "VIS";
  }
  if (raw.includes("LOC") || raw.includes("LOCALIZER")) {
    return rwy ? `L${rwy}` : "LOC";
  }
  if (raw.includes("VOR")) {
    return rwy ? `O${rwy}` : "VOR";
  }
  return sanitizeScratchpad(raw);
}

export function deriveScratchpads(
  aircraft: Aircraft,
  td?: TrackDisplay,
): { sp1: string; sp2: string } {
  // Derive automatic SP1 (approach shorthand, or interim altitude if controller explicitly assigned one):
  const approachId =
    aircraft.intent?.clearedApproachId ??
    aircraft.intent?.locInterceptApproachId ??
    aircraft.intent?.expectedApproachId;
  let autoSp1 = "";
  if (approachId) {
    autoSp1 = formatApproachShorthand(approachId) ?? "";
  } else if (
    aircraft.intent?.controllerAssignedAltitudeFt != null &&
    Number.isFinite(aircraft.intent.controllerAssignedAltitudeFt) &&
    Math.abs(aircraft.intent.controllerAssignedAltitudeFt - aircraft.altitudeFt) >= 100
  ) {
    const hundreds = Math.round(aircraft.intent.controllerAssignedAltitudeFt / 100);
    const clamped = Math.max(0, Math.min(999, hundreds));
    autoSp1 = String(clamped).padStart(3, "0");
  }

  let sp1 = autoSp1;
  if (td?.manualSp1 != null && td.manualSp1.length > 0) {
    sp1 = sanitizeScratchpad(td.manualSp1);
  }

  // Derive automatic SP2 (only if controller explicitly gave a speed, not if locked by STAR/SID or default):
  let sp2 = "";
  if (td?.manualSp2 != null && td.manualSp2.length > 0) {
    sp2 = sanitizeScratchpad(td.manualSp2);
  } else if (
    aircraft.intent?.controllerAssignedSpeedKt != null &&
    Number.isFinite(aircraft.intent.controllerAssignedSpeedKt) &&
    aircraft.intent.controllerAssignedSpeedKt > 0
  ) {
    const tens = Math.max(0, Math.round(aircraft.intent.controllerAssignedSpeedKt / 10));
    sp2 = `S${String(tens).padStart(2, "0")}`;
  }

  // Sync to track display if present
  if (td) {
    td.sp1 = sp1;
    td.sp2 = sp2;
    td.scratchpad = sp1;
  }

  return { sp1, sp2 };
}

export function ensureTrackDisplay(tracks: Map<string, TrackDisplay>, id: string): TrackDisplay {
  let td = tracks.get(id);
  if (!td) {
    td = createTrackDisplay();
    tracks.set(id, td);
  }
  return td;
}

export function queryTrack(
  td: TrackDisplay,
  simTimeMs: number,
  durationMs = LDB_QUERY_DURATION_MS,
): void {
  td.queriedUntilSimMs = simTimeMs + durationMs;
}

export function isTrackQueried(td: TrackDisplay, simTimeMs: number): boolean {
  return (td.queriedUntilSimMs ?? 0) > simTimeMs;
}

export function isTrackBeaconator(td: TrackDisplay | undefined, simTimeMs: number): boolean {
  return (td?.beaconatorUntilSimMs ?? 0) > simTimeMs;
}

/** F1 hold or per-track `*B` slew: squawk in place of callsign. */
export function isBeaconatorReadout(
  viewBeaconator: boolean,
  td: TrackDisplay | undefined,
  simTimeMs: number,
): boolean {
  return viewBeaconator || isTrackBeaconator(td, simTimeMs);
}

/**
 * Toggle an unowned track between PDB and Green FDB.
 */
export function toggleTrackPdbFdb(td: TrackDisplay): DatablockMode {
  if (td.datablockMode === "partial") {
    td.datablockMode = "full";
    td.forcedFdb = true;
  } else if (td.datablockMode === "full") {
    td.datablockMode = "partial";
    td.forcedFdb = false;
  }
  return td.datablockMode;
}

/**
 * Toggle Cyan highlight on a track.
 */
export function toggleTrackHighlight(td: TrackDisplay): boolean {
  td.highlighted = !td.highlighted;
  return td.highlighted;
}

/**
 * Handle middle-clicking a track on the scope to toggle Cyan highlight.
 */
export function handleTrackMiddleClick(
  tracks: Map<string, TrackDisplay>,
  _world: World,
  aircraftId: string,
): boolean {
  const td = ensureTrackDisplay(tracks, aircraftId);
  return toggleTrackHighlight(td);
}

/**
 * Handle clicking a track on the scope:
 * - Accept pending inbound handoff if present.
 * - Handle pointouts: UN rejects, ** converts to handoff, normal click accepts or reverts.
 * - Handle outbound accepted 3-click progression: 1) stop blinking, 2) green FDB, 3) PDB.
 * - If unassociated (LDB): query ground speed for 5 seconds.
 * - If unowned (PDB / forced FDB): toggle between PDB and Green FDB.
 */
export function handleTrackClick(
  tracks: Map<string, TrackDisplay>,
  world: World,
  aircraftId: string,
  commandText?: string,
): void {
  const normalizedCmd = commandText?.trim().toUpperCase();
  const ho = handoffFor(world, aircraftId);
  const td = ensureTrackDisplay(tracks, aircraftId);

  // Pointout interactions
  if (ho.kind === "pointout_inbound") {
    if (normalizedCmd === "UN") {
      rejectPointout(world, aircraftId);
      td.pointoutRejected = true;
      td.pointoutAccepted = false;
      return;
    }
    if (commandText?.trim() === "**") {
      convertPointoutToHandoff(world, aircraftId);
      td.ownership = "owned";
      td.datablockMode = "full";
      td.forcedFdb = false;
      td.pointoutAccepted = false;
      td.pointoutRejected = false;
      return;
    }
    if (ho.status === "pending") {
      acceptPointout(world, aircraftId);
      td.pointoutAccepted = true;
      td.pointoutRejected = false;
      return;
    }
    if (ho.status === "accepted" || td.pointoutAccepted) {
      world.handoffs.set(aircraftId, { kind: "none" });
      td.pointoutAccepted = false;
      td.ownership = "unowned";
      return;
    }
  }

  if (td.pointoutAccepted) {
    td.pointoutAccepted = false;
    td.ownership = "unowned";
    return;
  }

  // Inbound pending handoff: accept on click
  if (ho.kind === "inbound") {
    const accepted = acceptInboundOnClick(tracks, world, aircraftId);
    if (accepted) {
      return;
    }
  }

  // Outbound accepted handoff 3-click progression
  const isOutboundAccepted =
    (ho.kind === "outbound" && ho.status === "accepted") ||
    (td.outboundFlashUntilSimMs != null && td.outboundFlashUntilSimMs > 0) ||
    td.outboundClickStep != null;

  if (isOutboundAccepted) {
    const step = td.outboundClickStep ?? 0;
    if (step === 0) {
      td.outboundFlashUntilSimMs = 0;
      td.outboundClickStep = 1;
      return;
    }
    if (step === 1) {
      td.ownership = "unowned";
      td.datablockMode = "full";
      td.outboundClickStep = 2;
      return;
    }
    if (step === 2) {
      td.datablockMode = "partial";
      td.outboundClickStep = 3;
      world.handoffs.set(aircraftId, { kind: "none" });
      return;
    }
  }

  if (td.datablockMode === "limited" || td.unassociated) {
    queryTrack(td, world.simTimeMs);
    return;
  }
  if (td.ownership === "unowned") {
    toggleTrackPdbFdb(td);
  }
}

export function selectedTrackId(world: World): string | null {
  const id = world.selectedAircraftId;
  if (!id || !world.aircraft.some((ac) => ac.id === id)) {
    return null;
  }
  return id;
}

/**
 * Analog: CRC STARS “To accept the handoff, simply slew the track”
 * (docs.virtualnas.net/crc/stars — R07). Owned FDB is white (`PALETTE.owned`,
 * T02-08). Trainer delta: first click on a pending inbound accepts (and the
 * click handler then selects). Not a Command. Not NAS.
 */
export function acceptInboundOnClick(
  tracks: Map<string, TrackDisplay>,
  world: World,
  aircraftId: string,
): boolean {
  const accepted = acceptInboundHandoff(world, aircraftId);
  if (!accepted) {
    return false;
  }
  const td = ensureTrackDisplay(tracks, aircraftId);
  td.ownership = applyInitiateTrack(td.ownership);
  td.datablockMode = "full";
  td.forcedFdb = false;
  return true;
}

/**
 * F3 always-on: selected unowned → owned; already owned stays owned.
 * Pending inbound HO: same key takes the track (CRC INIT CNTL analog) via
 * `acceptInboundHandoff` so radio is no longer gated. No selection: no-op.
 * Display state only — never a Command.
 */
export function applyInitiateTrackToId(
  tracks: Map<string, TrackDisplay>,
  world: World,
  aircraftId: string,
): { applied: boolean; hint: string | null } {
  if (!world.aircraft.some((ac) => ac.id === aircraftId)) {
    return { applied: false, hint: NO_SEL_HINT };
  }
  const td = ensureTrackDisplay(tracks, aircraftId);
  acceptInboundHandoff(world, aircraftId);
  td.ownership = applyInitiateTrack(td.ownership);
  td.datablockMode = "full";
  td.forcedFdb = false;
  return { applied: true, hint: null };
}

export function applyInitiateTrackToSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): { applied: boolean; hint: string | null } {
  const id = selectedTrackId(world);
  if (!id) {
    return { applied: false, hint: NO_SEL_HINT };
  }
  return applyInitiateTrackToId(tracks, world, id);
}

/**
 * F4 always-on: selected owned → unowned. Unowned stays unowned.
 * Trainer sugar, not CRC terminate. Display state only — never a Command.
 */
export function applyDropTrackToId(
  tracks: Map<string, TrackDisplay>,
  world: World,
  aircraftId: string,
): { applied: boolean; hint: string | null } {
  if (!world.aircraft.some((ac) => ac.id === aircraftId)) {
    return { applied: false, hint: NO_SEL_HINT };
  }
  const td = ensureTrackDisplay(tracks, aircraftId);
  td.ownership = applyDropTrack(td.ownership);
  td.datablockMode = "partial";
  td.forcedFdb = false;
  return { applied: true, hint: null };
}

export function applyDropTrackToSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): { applied: boolean; hint: string | null } {
  const id = selectedTrackId(world);
  if (!id) {
    return { applied: false, hint: NO_SEL_HINT };
  }
  return applyDropTrackToId(tracks, world, id);
}

function flipDatablockMode(mode: DatablockMode): DatablockMode {
  return mode === "full" ? "limited" : "full";
}

/**
 * Scope-focus `T`: selected track full ↔ limited; no selection → all tracks.
 * Display state only — never a Command.
 */
export function toggleDatablockModeForSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): void {
  const selected = world.selectedAircraftId;
  if (selected && world.aircraft.some((ac) => ac.id === selected)) {
    const td = ensureTrackDisplay(tracks, selected);
    td.datablockMode = flipDatablockMode(td.datablockMode);
    return;
  }
  for (const ac of world.aircraft) {
    const td = ensureTrackDisplay(tracks, ac.id);
    td.datablockMode = flipDatablockMode(td.datablockMode);
  }
}

/**
 * Scope-focus `L` then 1–9: selected track leader direction; no selection → all.
 * Display state only — never a Command.
 */
export function setLeaderDirForSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
  dir: LeaderDir,
): void {
  const selected = world.selectedAircraftId;
  if (selected && world.aircraft.some((ac) => ac.id === selected)) {
    setLeaderDirForId(tracks, world, selected, dir);
    return;
  }
  for (const ac of world.aircraft) {
    setLeaderDirForId(tracks, world, ac.id, dir);
  }
}

export function setLeaderDirForId(
  tracks: Map<string, TrackDisplay>,
  world: World,
  aircraftId: string,
  dir: LeaderDir,
): boolean {
  if (!world.aircraft.some((ac) => ac.id === aircraftId)) {
    return false;
  }
  ensureTrackDisplay(tracks, aircraftId).leaderDir = dir;
  return true;
}

/**
 * `*B` slew: Mode 3/A readout for 5s on an uncorrelated (unowned / LDB) target.
 * Owned FDB is not a beaconator target — returns false so the arm stays.
 */
export function applyBeaconatorSlewToId(
  tracks: Map<string, TrackDisplay>,
  world: World,
  aircraftId: string,
  durationMs = BEACONATOR_SLEW_MS,
): boolean {
  if (!world.aircraft.some((ac) => ac.id === aircraftId)) {
    return false;
  }
  const td = ensureTrackDisplay(tracks, aircraftId);
  if (td.ownership === "owned" && td.datablockMode !== "limited" && !td.unassociated) {
    return false;
  }
  td.beaconatorUntilSimMs = world.simTimeMs + durationMs;
  return true;
}

export function isIdentFlashing(td: TrackDisplay, simTimeMs: number): boolean {
  return td.identUntilSimMs > simTimeMs;
}

/**
 * When the pilot agent accepts IDENT, `Aircraft.identUntilSimMs` jumps forward.
 * Start a ~2 s display flash. Do not re-validate and do not emit a readback.
 */
export function noteIdentAccepted(td: TrackDisplay, ac: Aircraft, simTimeMs: number): void {
  if (ac.identUntilSimMs > td.lastAircraftIdentDeadlineMs) {
    td.lastAircraftIdentDeadlineMs = ac.identUntilSimMs;
    td.identUntilSimMs = simTimeMs + IDENT_DISPLAY_FLASH_MS;
  }
}

/**
 * Display sampler: drop despawned tracks, issue surveillance reports, record
 * history on report arrival, arm IDENT flash. Call from the render path,
 * never from `stepWorld`. World / FMS / CA / MSAW stay 20 Hz truth.
 */
export function syncTrackDisplays(
  tracks: Map<string, TrackDisplay>,
  world: World,
  surveillance?: { mode?: SurveillanceMode; sites?: readonly RadarSite[] },
): void {
  const living = new Set(world.aircraft.map((ac) => ac.id));
  for (const id of [...tracks.keys()]) {
    if (!living.has(id)) {
      tracks.delete(id);
    }
  }
  const sampler = createSurveillanceSampler({
    mode: surveillance?.mode,
    sites: surveillance?.sites,
  });
  for (const ac of world.aircraft) {
    let td = tracks.get(ac.id);
    if (!td) {
      td = createTrackDisplay();
      tracks.set(ac.id, td);
    }
    if (td.lastReport) {
      sampler.reports.set(ac.id, td.lastReport);
    }
  }
  const issued = new Set(
    stepSurveillanceSampler(sampler, world.aircraft, world.simTimeMs).map(
      (report) => report.aircraftId,
    ),
  );
  for (const ac of world.aircraft) {
    const td = tracks.get(ac.id)!;
    const report = sampler.reports.get(ac.id);
    if (report) {
      td.lastReport = report;
      if (issued.has(ac.id)) {
        recordHistoryOnReport(td.history, report.reportedAtSimMs, report.xNm, report.yNm);
      }
    } else {
      delete td.lastReport;
    }
    noteIdentAccepted(td, ac, world.simTimeMs);
    const ho = handoffFor(world, ac.id);
    if (
      ho.kind === "outbound" &&
      ho.status === "accepted" &&
      td.outboundFlashUntilSimMs === undefined
    ) {
      td.outboundFlashUntilSimMs =
        (ho.acceptedAtSimMs ?? world.simTimeMs) + OUTBOUND_ACCEPTED_FLASH_MS;
      td.outboundClickStep = td.outboundClickStep ?? 0;
    }
  }
}
