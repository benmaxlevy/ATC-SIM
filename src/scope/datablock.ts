/**
 * Analog: FAA PCG **datablock** / **Mode C** (R02); CRC STARS FDB / LDB (R07);
 * FOA STARS display data (R05). Altitude on the block is hundreds of feet, not
 * raw feet.
 *
 * Trainer delta (v1, not a field-by-field STARS clone): two-line full datablock
 * is callsign + Mode C / assigned altitude / ground speed. Omitted: scratchpad,
 * beacon code, CSI, third line, CHARSIZE. Limited datablock is Mode C hundreds
 * only. Default L8 offset (north, 24 px) until T02-05 draws the leader.
 * Never a label, nametag, or tooltip. Not NAS STARS.
 */

import { DATABLOCK_LINE_HEIGHT_PX, DEFAULT_DATABLOCK_CELL_PX } from "./fonts";

/** Numpad 8 = north. Shared with T02-05 leader keypad. */
export const DEFAULT_LEADER_DIR = 8;

/** Pixel-constant leader length (phase README decision 8). T02-05 owns geometry. */
export const LEADER_LENGTH_PX = 24;

const FIELD_GAP = "  ";

export type DatablockMode = "full" | "limited";

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
}

export interface FullDatablockOpts {
  /** Hide the Mode C field on full blocks (`M`). Limited ignores this. */
  modeCVisible?: boolean;
}

export interface FullDatablock {
  line1: string;
  line2: string;
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

function assignedDiffers(modeCFt: number, assignedFt: number): boolean {
  if (!Number.isFinite(modeCFt) || !Number.isFinite(assignedFt)) {
    return false;
  }
  return Math.abs(assignedFt - modeCFt) >= 100;
}

/**
 * Full datablock: callsign on line 1; Mode C, assigned if ≥100 ft off, GS on line 2.
 * `M` hides Mode C only — assigned + GS remain when they differ; GS-only when not.
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

  return { line1: track.callsign, line2 };
}

/** Limited datablock: Mode C hundreds only. Ignores the global `M` toggle. */
export function formatLimitedDatablock(track: DatablockSource): LimitedDatablock {
  return { line1: formatAltitudeHundreds(track.altitudeFt) };
}

/** Resolve full vs limited lines for paint and hit-test. */
export function linesForDatablock(
  track: DatablockSource,
  mode: DatablockMode = "full",
  modeCVisible = true,
): { line1: string; line2?: string } {
  if (mode === "limited") {
    return formatLimitedDatablock(track);
  }
  return formatFullDatablock(track, { modeCVisible });
}

/** Default L8: datablock top-left is 24 px north (−Y) of the target. */
export function datablockTopLeft(targetX: number, targetY: number): { x: number; y: number } {
  return { x: targetX, y: targetY - LEADER_LENGTH_PX };
}

export function datablockRect(
  targetX: number,
  targetY: number,
  lines: { line1: string; line2?: string },
  cellWidthPx: number = DEFAULT_DATABLOCK_CELL_PX,
  lineHeightPx: number = DATABLOCK_LINE_HEIGHT_PX,
): DatablockRect {
  const origin = datablockTopLeft(targetX, targetY);
  const cols = Math.max(lines.line1.length, lines.line2?.length ?? 0, 1);
  const rows = lines.line2 != null ? 2 : 1;
  return {
    x: origin.x,
    y: origin.y,
    w: cols * cellWidthPx,
    h: rows * lineHeightPx,
  };
}

export function pointInDatablock(cssX: number, cssY: number, rect: DatablockRect): boolean {
  return cssX >= rect.x && cssX < rect.x + rect.w && cssY >= rect.y && cssY < rect.y + rect.h;
}
