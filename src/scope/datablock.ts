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
  };
  /** ICAO type stub for FDB line 3 (e.g. B738). Display-only. */
  aircraftType?: string;
  /** Assigned or active squawk / beacon code (e.g. "1200", "0342"). */
  squawk?: string;
  /** Optional beacon code alias. */
  beaconCode?: string;
}

export interface FullDatablockOpts {
  /** Hide the Mode C field on full blocks (`M`). Limited ignores this. */
  modeCVisible?: boolean;
  /** Trainer scratchpad (sanitized to 0–4 A–Z0–9). Omitted on limited. */
  scratchpad?: string;
}

export interface PartialDatablockOpts {
  /** Hide the Mode C field (`M`). */
  modeCVisible?: boolean;
  /** Trainer scratchpad (sanitized to 0–4 A–Z0–9). */
  scratchpad?: string;
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
  /** Aircraft type (character-cell). Omitted when spawn has no type. */
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

/** Ground speed in tens of knots (e.g. 180 kt -> "18", 210 kt -> "21", 90 kt -> "09"). */
export function formatGroundSpeedTens(speedKt: number): string {
  if (!Number.isFinite(speedKt)) {
    return "00";
  }
  const tens = Math.max(0, Math.round(speedKt / 10));
  return String(tens).padStart(2, "0");
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

function appendScratchpad(line2: string, scratchpad: string | undefined): string {
  const spad = sanitizeScratchpad(scratchpad ?? "");
  return spad.length > 0 ? `${line2}${FIELD_GAP}${spad}` : line2;
}

/**
 * Full datablock: callsign on line 1; Mode C, assigned if ≥100 ft off, GS on
 * line 2 (optional scratchpad tail); aircraft type on line 3 when present.
 * `M` hides Mode C only — assigned + GS remain when they differ; GS-only when not.
 * Frozen extra line is type, not assigned H/A/S. Not a 4-line block.
 */
export function formatFullDatablock(
  track: DatablockSource,
  opts: FullDatablockOpts = {},
): FullDatablock {
  const modeCVisible = opts.modeCVisible !== false;
  const modeC = formatAltitudeHundreds(track.altitudeFt);
  const assigned = formatAltitudeHundreds(track.intent.assignedAltitudeFt);
  const gs = formatGroundSpeedKt(track.speedKt);
  const showAssigned = assignedDiffers(track.altitudeFt, track.intent.assignedAltitudeFt);

  let line2: string;
  if (modeCVisible) {
    line2 = showAssigned
      ? `${modeC}${FIELD_GAP}${assigned}${FIELD_GAP}${gs}`
      : `${modeC}${FIELD_GAP}${gs}`;
  } else if (showAssigned) {
    line2 = `${assigned}${FIELD_GAP}${gs}`;
  } else {
    line2 = gs;
  }
  line2 = appendScratchpad(line2, opts.scratchpad);

  const line3 = formatAircraftType(track.aircraftType);
  return line3 ? { line1: track.callsign, line2, line3 } : { line1: track.callsign, line2 };
}

/**
 * Partial datablock (PDB): Line 2 only (Mode C altitude + Ground speed, optional scratchpad),
 * suppressing callsign (Line 1) and aircraft type (Line 3).
 * Used for associated tracks owned by another controller.
 */
export function formatPartialDatablock(
  track: DatablockSource,
  opts: PartialDatablockOpts = {},
): PartialDatablock {
  const modeCVisible = opts.modeCVisible !== false;
  const modeC = formatAltitudeHundreds(track.altitudeFt);
  const assigned = formatAltitudeHundreds(track.intent.assignedAltitudeFt);
  const gs = formatGroundSpeedKt(track.speedKt);
  const showAssigned = assignedDiffers(track.altitudeFt, track.intent.assignedAltitudeFt);

  let line1: string;
  if (modeCVisible) {
    line1 = showAssigned
      ? `${modeC}${FIELD_GAP}${assigned}${FIELD_GAP}${gs}`
      : `${modeC}${FIELD_GAP}${gs}`;
  } else if (showAssigned) {
    line1 = `${assigned}${FIELD_GAP}${gs}`;
  } else {
    line1 = gs;
  }
  line1 = appendScratchpad(line1, opts.scratchpad);
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

/** Resolve full vs partial vs limited lines for paint and hit-test. */
export function linesForDatablock(
  track: DatablockSource,
  mode: DatablockMode = "full",
  modeCVisible = true,
  scratchpad = "",
  opts?: LimitedDatablockOpts,
): DatablockLines {
  if (mode === "limited") {
    return formatLimitedDatablock(track, opts);
  }
  if (mode === "partial") {
    return formatPartialDatablock(track, { modeCVisible, scratchpad });
  }
  return formatFullDatablock(track, { modeCVisible, scratchpad });
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
