/**
 * Analog: FAA PCG **datablock** / **Mode C** (R02); CRC STARS FDB / LDB (R07);
 * FOA STARS display data (R05). Altitude on the block is hundreds of feet, not
 * raw feet. CRC analog FDB line 2/3 (scratchpad, type) — trainer fields, not NAS FP.
 *
 * Trainer delta (v1, not a field-by-field STARS clone): full datablock is
 * callsign (line 1), Mode C / assigned / GS + optional scratchpad (line 2),
 * aircraft type (line 3). Scratchpad is TrackDisplay 0–4 A–Z0–9, not a host
 * flight-plan / runway assignment. Omitted: beacon code, CSI, CHARSIZE, NAS FP.
 * Limited datablock is Mode C hundreds only (no scratchpad, no type).
 * Leader geometry (L1–L9) lives in `leader.ts`.
 * Never a label, nametag, or tooltip. Not NAS STARS.
 */

import type { TrackHandoff } from "@core";
import { DATABLOCK_LINE_HEIGHT_PX, DEFAULT_DATABLOCK_CELL_PX } from "./fonts";
import {
  DEFAULT_LEADER_DIR,
  LEADER_LENGTH_PX,
  datablockTopLeft,
  type DatablockMetrics,
  type LeaderDir,
} from "./leader";

const FIELD_GAP = "  ";

/** STARS FDB Line 2 time-sharing phase interval (~2.5 seconds). */
export const FDB_TIMESHARE_INTERVAL_MS = 2500;

/** Trainer scratchpad cell: analog CRC FDB scratchpad; not NAS FP (R27). */
export const SCRATCHPAD_MAX_LEN = 4;

export type DatablockMode = "full" | "partial" | "limited";

/**
 * Uppercase, drop anything but A–Z0–9, clamp to 4 characters.
 * Empty is valid (cleared scratchpad).
 */
export function sanitizeScratchpad(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, SCRATCHPAD_MAX_LEN);
}

/** Kinematics + intent the formatters read. Aircraft satisfies this. */
export interface DatablockSource {
  callsign: string;
  /** Mode C — reported pressure altitude (kinematics), feet MSL. */
  altitudeFt: number;
  /** Ground speed, knots (TAS=IAS in v1). */
  speedKt: number;
  intent: {
    assignedAltitudeFt: number;
    requestedAltitudeFt?: number;
  };
  /** ICAO type stub for FDB (e.g. B738). Display-only. */
  aircraftType?: string;
  /** Assigned or active squawk / beacon code (e.g. "1200", "0342"). */
  squawk?: string;
  /** Optional beacon code alias. */
  beaconCode?: string;
  /** Assigned squawk code when tracking squawk mismatch. */
  assignedSquawk?: string;
  /** Reported squawk code when tracking squawk mismatch. */
  reportedSquawk?: string;
  /** Wake turbulence or RNAV / CWT category indicator letter (e.g. "H", "B", "R", "L", "A"-"I"). */
  wakeCategory?: string;
  /** Special Purpose Code: "EM" (7700), "RF" (7600), "HJ" (7500), or explicit SPC tag. */
  spc?: string;
  /** Filed / requested cruise or entry altitude in feet MSL (e.g. 7000 for R070). */
  requestedAltitudeFt?: number;
  /** True if altitude is pilot-reported (displays *). */
  pilotReportedAltitude?: boolean;
  /** ATPA distance readout string if enabled (e.g. "2.4"). */
  atpaDistance?: string;
  /** Flight rules indicator ("VFR" or "IFR"). */
  flightRules?: "IFR" | "VFR" | string;
  /** True if aircraft is an overflight / enroute track. */
  isOverflight?: boolean;
}

export interface FullDatablockOpts {
  /** Hide the Mode C field on full blocks (`M`). Limited ignores this. */
  modeCVisible?: boolean;
  /** Trainer scratchpad (legacy SP1 alias). */
  scratchpad?: string;
  /** Primary scratchpad (SP1: approach shorthand or interim altitude). */
  sp1?: string;
  /** Secondary scratchpad (SP2: assigned speed shorthand). */
  sp2?: string;
  /** Transferring / receiving sector ID character centered on Line 2 during handoff. */
  handoffSectorId?: string;
  /** Simulation timestamp in milliseconds for time-sharing cycle. Default 0. */
  simTimeMs?: number;
  /** Explicit time-share phase override (step index 0, 1, 2, ...). */
  timeSharePhase?: number;
}

export interface PartialDatablockOpts {
  /** Hide the Mode C field (`M`). */
  modeCVisible?: boolean;
  /** Trainer scratchpad (legacy SP1 alias). */
  scratchpad?: string;
  /** Primary scratchpad (SP1). */
  sp1?: string;
  /** Secondary scratchpad (SP2). */
  sp2?: string;
  /** Transferring / receiving sector ID character centered on Line 2 during handoff. */
  handoffSectorId?: string;
  /** Simulation timestamp in milliseconds. */
  simTimeMs?: number;
  /** Explicit time-share phase override (step index 0, 1, 2, ...). */
  timeSharePhase?: number;
  /** Suppress ground speed display in PDB mode. */
  suppressPdbSpeed?: boolean;
}

export interface LimitedDatablockOpts {
  /** Show beacon code if present (default true). When false/inhibited, displays Mode C only. */
  beaconVisible?: boolean;
  /** When true (queried state), displays Mode C altitude + ground speed. */
  queried?: boolean;
  /** Ground speed format when queried: "tens" (e.g. "18" for 180 kt) or "knots" (e.g. "180"). Default "tens". */
  speedFormat?: "tens" | "knots";
}

export interface FullDatablock {
  line1: string;
  line2: string;
  /** Line 3: Assigned altitude prefixed with A, squawk mismatch, or ATPA distance. */
  line3?: string;
}

export interface PartialDatablock {
  line1: string;
}

export interface LimitedDatablock {
  line1: string;
}

export interface DatablockRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mode C / assigned hundreds, zero-padded, clamped 000–999. */
export function formatAltitudeHundreds(altFt: number): string {
  if (!Number.isFinite(altFt)) {
    return "000";
  }
  const hundreds = Math.round(altFt / 100);
  const clamped = Math.max(0, Math.min(999, hundreds));
  return String(clamped).padStart(3, "0");
}

/** Ground speed knots, nearest integer, padded to 3. */
export function formatGroundSpeedKt(speedKt: number): string {
  if (!Number.isFinite(speedKt)) {
    return "000";
  }
  const kt = Math.max(0, Math.round(speedKt));
  return String(kt).padStart(3, "0");
}

export interface GroundSpeedTensOpts {
  wakeCategory?: string;
  flightRules?: "IFR" | "VFR" | string;
  isOverflight?: boolean;
}

/**
 * Ground speed in tens of knots (e.g. 180 kt -> "18", 210 kt -> "21", 90 kt -> "09").
 * Optionally appends wake/RNAV category indicator (e.g. "18H", "25R"),
 * or flight category ("V" for VFR, "E" for overflights).
 */
export function formatGroundSpeedTens(
  speedKt: number,
  opts?: GroundSpeedTensOpts | string,
): string {
  if (!Number.isFinite(speedKt)) {
    return "00";
  }
  const tens = Math.max(0, Math.round(speedKt / 10));
  const base = String(tens).padStart(2, "0");

  const wake =
    typeof opts === "string" ? formatWakeCategory(opts) : formatWakeCategory(opts?.wakeCategory);
  if (wake.length > 0) {
    return `${base}${wake}`;
  }

  if (typeof opts === "object" && opts !== null) {
    if (opts.flightRules === "VFR") {
      return `${base}V`;
    }
    if (opts.isOverflight) {
      return `${base}E`;
    }
  }

  return base;
}

function assignedDiffers(modeCFt: number, assignedFt: number): boolean {
  if (!Number.isFinite(modeCFt) || !Number.isFinite(assignedFt)) {
    return false;
  }
  return Math.abs(assignedFt - modeCFt) >= 100;
}

function formatAircraftType(type: string | undefined): string | undefined {
  if (type == null || type.length === 0) {
    return undefined;
  }
  const cell = type
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  return cell.length > 0 ? cell : undefined;
}

export function formatWakeCategory(wakeCategory: string | undefined): string {
  if (!wakeCategory || wakeCategory.length === 0) {
    return "";
  }
  return wakeCategory.toUpperCase().slice(0, 1);
}

export function formatRequestedAltitude(reqAltFt: number | undefined): string | undefined {
  if (reqAltFt == null || !Number.isFinite(reqAltFt)) {
    return undefined;
  }
  return `R${formatAltitudeHundreds(reqAltFt)}`;
}

export function getSpecialPurposeCode(track: DatablockSource): string | undefined {
  if (track.spc && track.spc.length > 0) {
    return track.spc.toUpperCase();
  }
  const codes = [track.reportedSquawk, track.squawk, track.beaconCode, track.assignedSquawk];
  for (const c of codes) {
    if (c === "7700") return "EM";
    if (c === "7600") return "RF";
    if (c === "7500") return "HJ";
  }
  return undefined;
}

/**
 * Full datablock (STARS CRC):
 * - Line 1: Callsign + Special Purpose Code (SPC: EM, RF, HJ, etc.)
 * - Line 2: Dynamic multi-phase time-sharing (~2.5s cycle):
 *     Left field:  Mode C altitude <-> SP1 <-> SP2
 *     Center:      Transferring/receiving sector ID character during active handoff
 *     Right field: GS (tens) <-> Aircraft Type <-> Requested Altitude (R###)
 * - Line 3: Assigned altitude prefixed with A (e.g. A040) when |assigned - altitude| >= 100 ft,
 *           squawk mismatch, or ATPA distance. Omitted when none applies.
 */
export function formatFullDatablock(
  track: DatablockSource,
  opts: FullDatablockOpts = {},
): FullDatablock {
  const modeCVisible = opts.modeCVisible !== false;
  const spc = getSpecialPurposeCode(track);
  const line1 = spc ? `${track.callsign} ${spc}` : track.callsign;

  const phaseStep =
    opts.timeSharePhase !== undefined
      ? opts.timeSharePhase
      : opts.simTimeMs != null
        ? Math.floor(opts.simTimeMs / FDB_TIMESHARE_INTERVAL_MS)
        : 0;

  // Left-field queue: [Mode C, SP1, SP2] filtered to active/non-empty entries
  const pilotReportStar = track.pilotReportedAltitude ? "*" : "";
  const modeC = modeCVisible ? `${formatAltitudeHundreds(track.altitudeFt)}${pilotReportStar}` : "";
  const rawSp1 = opts.sp1 ?? opts.scratchpad;
  const sp1 = sanitizeScratchpad(rawSp1 ?? "");
  const sp2 = sanitizeScratchpad(opts.sp2 ?? "");

  const leftQueue = [modeC, sp1, sp2].filter((s) => s.length > 0);
  const leftField =
    leftQueue.length > 0
      ? leftQueue[((phaseStep % leftQueue.length) + leftQueue.length) % leftQueue.length]
      : "";

  // Right-field queue: [GS, Type, Requested Altitude] filtered to active entries
  const gs = formatGroundSpeedTens(track.speedKt, {
    wakeCategory: track.wakeCategory,
    flightRules: track.flightRules,
    isOverflight: track.isOverflight,
  });
  const type = formatAircraftType(track.aircraftType) ?? "";
  const reqAltFt = track.requestedAltitudeFt ?? track.intent?.requestedAltitudeFt;
  const reqAlt = formatRequestedAltitude(reqAltFt) ?? "";

  const rightQueue = [gs, type, reqAlt].filter((s) => s.length > 0);
  const rightField =
    rightQueue.length > 0
      ? rightQueue[((phaseStep % rightQueue.length) + rightQueue.length) % rightQueue.length]
      : "";

  // Center field: handoff sector ID
  const centerField = opts.handoffSectorId
    ? opts.handoffSectorId.trim().toUpperCase().slice(0, 1)
    : "";

  const line2Parts = [leftField, centerField, rightField].filter((s) => s.length > 0);
  const line2 = line2Parts.join(FIELD_GAP);

  // Line 3: Special and Assigned fields
  const showAssigned = assignedDiffers(track.altitudeFt, track.intent.assignedAltitudeFt);
  const assignedField = showAssigned
    ? `A${formatAltitudeHundreds(track.intent.assignedAltitudeFt)}`
    : undefined;
  const hasSquawkMismatch =
    track.assignedSquawk && track.reportedSquawk && track.assignedSquawk !== track.reportedSquawk;
  const squawkField = hasSquawkMismatch ? track.reportedSquawk : undefined;
  const atpaField =
    track.atpaDistance && track.atpaDistance.length > 0 ? track.atpaDistance : undefined;

  const line3Parts = [assignedField, squawkField, atpaField].filter(Boolean) as string[];
  const line3 = line3Parts.length > 0 ? line3Parts.join(FIELD_GAP) : undefined;

  return line3 ? { line1, line2, line3 } : { line1, line2 };
}

/**
 * Partial datablock (PDB): Line 2 only (Mode C altitude <-> SP1 <-> SP2, optional center handoff ID, ground speed),
 * suppressing callsign (Line 1) and aircraft type (Line 3).
 * Used for associated tracks owned by another controller.
 */
export function formatPartialDatablock(
  track: DatablockSource,
  opts: PartialDatablockOpts = {},
): PartialDatablock {
  const modeCVisible = opts.modeCVisible !== false;
  const phaseStep =
    opts.timeSharePhase !== undefined
      ? opts.timeSharePhase
      : opts.simTimeMs != null
        ? Math.floor(opts.simTimeMs / FDB_TIMESHARE_INTERVAL_MS)
        : 0;

  // Left queue: [Mode C, SP1, SP2]
  const pilotReportStar = track.pilotReportedAltitude ? "*" : "";
  const modeC = modeCVisible ? `${formatAltitudeHundreds(track.altitudeFt)}${pilotReportStar}` : "";
  const rawSp1 = opts.sp1 ?? opts.scratchpad;
  const sp1 = sanitizeScratchpad(rawSp1 ?? "");
  const sp2 = sanitizeScratchpad(opts.sp2 ?? "");

  const leftQueue = [modeC, sp1, sp2].filter((s) => s.length > 0);
  const leftField =
    leftQueue.length > 0
      ? leftQueue[((phaseStep % leftQueue.length) + leftQueue.length) % leftQueue.length]
      : "";

  // Right queue: [GS] unless suppressed
  const gs = opts.suppressPdbSpeed
    ? ""
    : formatGroundSpeedTens(track.speedKt, {
        wakeCategory: track.wakeCategory,
        flightRules: track.flightRules,
        isOverflight: track.isOverflight,
      });
  const rightQueue = [gs].filter((s) => s.length > 0);
  const rightField =
    rightQueue.length > 0
      ? rightQueue[((phaseStep % rightQueue.length) + rightQueue.length) % rightQueue.length]
      : "";

  // Center field: handoff sector ID
  const centerField = opts.handoffSectorId
    ? opts.handoffSectorId.trim().toUpperCase().slice(0, 1)
    : "";

  const line1Parts = [leftField, centerField, rightField].filter((s) => s.length > 0);
  const line1 = line1Parts.join(FIELD_GAP);

  return { line1 };
}

/**
 * Limited datablock (LDB): Unassociated tracks.
 * Default: Beacon code + Mode C altitude in hundreds (e.g. `1200 045`).
 * When beacon code is inhibited: Mode C altitude only (e.g. `045`).
 * Queried state (when clicked): Mode C altitude + Ground speed (e.g. `045 18` or `045 180`).
 */
export function formatLimitedDatablock(
  track: DatablockSource,
  opts: LimitedDatablockOpts = {},
): LimitedDatablock {
  const modeC = formatAltitudeHundreds(track.altitudeFt);
  if (opts.queried) {
    const gs =
      opts.speedFormat === "knots"
        ? formatGroundSpeedKt(track.speedKt)
        : formatGroundSpeedTens(track.speedKt);
    return { line1: `${modeC} ${gs}` };
  }
  const squawk = track.squawk ?? track.beaconCode;
  if (opts.beaconVisible !== false && squawk && squawk.length > 0) {
    return { line1: `${squawk} ${modeC}` };
  }
  return { line1: modeC };
}

export interface DatablockLines {
  line1: string;
  line2?: string;
  line3?: string;
}

/**
 * Pending inbound HO cue on FDB line 1 (CRC transferring-sector analog).
 * Limited and partial datablocks do not show this on their main lines.
 */
export function withInboundHandoffCue(line1: string, handoff: TrackHandoff): string {
  if (handoff.kind !== "inbound") {
    return line1;
  }
  return `${line1} HO`;
}

export interface DatablockRenderOpts {
  modeCVisible?: boolean;
  scratchpad?: string;
  sp1?: string;
  sp2?: string;
  handoffSectorId?: string;
  suppressPdbSpeed?: boolean;
  timeSharePhase?: number;
  simTimeMs?: number;
  queried?: boolean;
  beaconVisible?: boolean;
  speedFormat?: "tens" | "knots";
}

/** Resolve full vs partial vs limited lines for paint and hit-test. */
export function linesForDatablock(
  track: DatablockSource,
  mode: DatablockMode = "full",
  modeCVisibleOrOpts: boolean | DatablockRenderOpts = true,
  scratchpad = "",
  limitedOpts?: LimitedDatablockOpts,
  simTimeMs = 0,
): DatablockLines {
  const opts: DatablockRenderOpts =
    typeof modeCVisibleOrOpts === "object" && modeCVisibleOrOpts !== null
      ? modeCVisibleOrOpts
      : {
          modeCVisible: modeCVisibleOrOpts,
          scratchpad,
          simTimeMs,
          ...limitedOpts,
        };

  if (mode === "limited") {
    return formatLimitedDatablock(track, {
      beaconVisible: opts.beaconVisible,
      queried: opts.queried,
      speedFormat: opts.speedFormat,
    });
  }
  if (mode === "partial") {
    return formatPartialDatablock(track, {
      modeCVisible: opts.modeCVisible,
      scratchpad: opts.scratchpad,
      sp1: opts.sp1,
      sp2: opts.sp2,
      handoffSectorId: opts.handoffSectorId,
      suppressPdbSpeed: opts.suppressPdbSpeed,
      timeSharePhase: opts.timeSharePhase,
      simTimeMs: opts.simTimeMs,
    });
  }
  return formatFullDatablock(track, {
    modeCVisible: opts.modeCVisible,
    scratchpad: opts.scratchpad,
    sp1: opts.sp1,
    sp2: opts.sp2,
    handoffSectorId: opts.handoffSectorId,
    timeSharePhase: opts.timeSharePhase,
    simTimeMs: opts.simTimeMs,
  });
}

export function datablockMetrics(
  lines: DatablockLines,
  cellWidthPx: number = DEFAULT_DATABLOCK_CELL_PX,
  lineHeightPx: number = DATABLOCK_LINE_HEIGHT_PX,
): DatablockMetrics {
  const cols = Math.max(lines.line1.length, lines.line2?.length ?? 0, lines.line3?.length ?? 0, 1);
  const rows = lines.line3 != null ? 3 : lines.line2 != null ? 2 : 1;
  return { widthPx: cols * cellWidthPx, heightPx: rows * lineHeightPx };
}

export function datablockRect(
  targetX: number,
  targetY: number,
  lines: DatablockLines,
  cellWidthPx: number = DEFAULT_DATABLOCK_CELL_PX,
  lineHeightPx: number = DATABLOCK_LINE_HEIGHT_PX,
  dir: LeaderDir = DEFAULT_LEADER_DIR,
  lengthPx: number = LEADER_LENGTH_PX,
): DatablockRect {
  const metrics = datablockMetrics(lines, cellWidthPx, lineHeightPx);
  const origin = datablockTopLeft(dir, metrics, lengthPx);
  return {
    x: targetX + origin.x,
    y: targetY + origin.y,
    w: metrics.widthPx,
    h: metrics.heightPx,
  };
}

export function pointInDatablock(cssX: number, cssY: number, rect: DatablockRect): boolean {
  return cssX >= rect.x && cssX < rect.x + rect.w && cssY >= rect.y && cssY < rect.y + rect.h;
}
