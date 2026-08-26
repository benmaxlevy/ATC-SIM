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
import { createHistoryBuf, maybeSampleHistory, type HistoryBuf } from "./history";
import { DEFAULT_LEADER_DIR, type LeaderDir } from "./leader";
import { applyDropTrack, applyInitiateTrack, NO_SEL_HINT, type TrackOwnership } from "./ownership";

/** Display IDENT stroke pulse (~2 s sim). Aircraft flag may last longer (phase 1). */
export const IDENT_DISPLAY_FLASH_MS = 2000;
export const LDB_QUERY_DURATION_MS = 5000;
export const OUTBOUND_ACCEPTED_FLASH_MS = 5000;

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
  /** Outbound accepted click step (0: flashing, 1: solid white, 2: green FDB, 3: PDB). */
  outboundClickStep?: number;
  /** Pointout accepted visual state flag. */
  pointoutAccepted?: boolean;
  /** Pointout rejected visual state flag. */
  pointoutRejected?: boolean;
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
    queriedUntilSimMs: 0,
    forcedFdb: false,
  };
}

/** Set the trainer scratchpad for a track id. Sanitizes to 0–4 A–Z0–9. */
export function setScratchpad(tracks: Map<string, TrackDisplay>, id: string, raw: string): void {
  const td = ensureTrackDisplay(tracks, id);
  td.scratchpad = sanitizeScratchpad(raw);
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
export function applyInitiateTrackToSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): { applied: boolean; hint: string | null } {
  const id = selectedTrackId(world);
  if (!id) {
    return { applied: false, hint: NO_SEL_HINT };
  }
  const td = ensureTrackDisplay(tracks, id);
  acceptInboundHandoff(world, id);
  td.ownership = applyInitiateTrack(td.ownership);
  td.datablockMode = "full";
  td.forcedFdb = false;
  return { applied: true, hint: null };
}

/**
 * F4 always-on: selected owned → unowned. Unowned stays unowned.
 * Trainer sugar, not CRC terminate. Display state only — never a Command.
 */
export function applyDropTrackToSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): { applied: boolean; hint: string | null } {
  const id = selectedTrackId(world);
  if (!id) {
    return { applied: false, hint: NO_SEL_HINT };
  }
  const td = ensureTrackDisplay(tracks, id);
  td.ownership = applyDropTrack(td.ownership);
  td.datablockMode = "partial";
  td.forcedFdb = false;
  return { applied: true, hint: null };
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
    const td = ensureTrackDisplay(tracks, selected);
    td.leaderDir = dir;
    return;
  }
  for (const ac of world.aircraft) {
    const td = ensureTrackDisplay(tracks, ac.id);
    td.leaderDir = dir;
  }
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
 * Display sampler: drop despawned tracks, sample history, arm IDENT flash.
 * Call from the render path, never from `stepWorld`.
 */
export function syncTrackDisplays(tracks: Map<string, TrackDisplay>, world: World): void {
  const living = new Set(world.aircraft.map((ac) => ac.id));
  for (const id of [...tracks.keys()]) {
    if (!living.has(id)) {
      tracks.delete(id);
    }
  }
  for (const ac of world.aircraft) {
    let td = tracks.get(ac.id);
    if (!td) {
      td = createTrackDisplay();
      tracks.set(ac.id, td);
    }
    maybeSampleHistory(td.history, world.simTimeMs, ac.xNm, ac.yNm);
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
