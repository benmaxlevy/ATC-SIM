/**
 * Analog: CRC STARS target / position symbol (docs.virtualnas.net/crc/stars — R07).
 * FAA 3-9-1: search/fusion symbol blue; history blue; FDB white/green by ownership.
 *
 * Target and position symbols by surveillance and ownership state:
 * - Primary-only (no transponder/beacon): unfilled diamond (`◇`) with no datablock.
 * - Unassociated secondary beacon: asterisk (`*`) default, `V` for 1200 VFR squawk,
 *   or square (`□`) if beacon code matches the beacon code select list.
 * - Controlled / Tracked: Sector ID character (e.g. `D` for departure / user TCP,
 *   `G` for generic active track, or transferring controller's ID).
 * - Fixed 8px heading tick line is removed (PTL handles velocity vector projection).
 * - Brightness modulated via TCW BRITE channels (`pos` for tracked FDB, `oth` for
 *   unassociated, `pri` for primary).
 *
 * Not a sprite (R12). Not an airplane. Not NAS STARS.
 */

import { SCOPE_FONT_STACK } from "./fonts";
import { PALETTE, historyTrailColor } from "./palette";
import { ownershipStubChar, type TrackOwnership } from "./ownership";

/** Position-symbol shape for primary targets. Axis-aligned diamond, not heading-rotated. */
export const TARGET_SHAPE = "diamond" as const;

/** Bounding box of the standard symbol (vertex to opposite vertex). 7–9 CSS px band. */
export const TARGET_SIZE_PX = 8;
/** Primary-only target diamond size (a bit larger for visibility). */
export const PRIMARY_TARGET_SIZE_PX = 11;
export const TARGET_STROKE_PX = 1;
/** @deprecated T02-34: Heading tick removed from target symbol; PTL handles vector projection. */
export const HEADING_TICK_PX = 8;
export const HISTORY_DOT_SIZE_PX = 3;
/** 1 px yellow selection box sits this far outside the symbol bounding box. */
export const SELECTION_BOX_PAD_PX = 2;

/** Stub/position font: IBM Plex Mono sized to match position symbol char size. */
export const OWNERSHIP_STUB_FONT_PX = 9;
export const OWNERSHIP_STUB_FONT = `${OWNERSHIP_STUB_FONT_PX}px ${SCOPE_FONT_STACK}`;

/** Unowned FDB / leader. CRC other-TCP green. */
export const UNOWNED_TRACK_COLOR = PALETTE.unowned;
/** Owned FDB / leader after F3. CRC owned white. */
export const OWNED_TRACK_COLOR = PALETTE.owned;
/** Selected accent / IDENT flash. Frozen phase-2 selected yellow. */
export const SELECTED_ACCENT_COLOR = PALETTE.selected;
/** Search/fusion position symbol. FAA (30,120,255). */
export const POSITION_SYMBOL_COLOR = PALETTE.positionSymbol;
/** Solid blue circle background color for target text symbols (#175dc7). */
export const TARGET_CIRCLE_BG_COLOR = PALETTE.targetCircleBg;

export type TargetSurveillanceType = "primary" | "secondary";
export type TargetSymbolKind = "diamond" | "asterisk" | "vfr" | "beacon_select" | "tracked";

export interface TargetSymbolOptions {
  isPrimary?: boolean;
  primaryOnly?: boolean;
  transponder?: string;
  surveillance?: TargetSurveillanceType | string;
  ownership?: TrackOwnership;
  tracked?: boolean;
  squawk?: string;
  beaconCode?: string;
  beaconSelect?: ReadonlySet<string> | ReadonlyArray<string>;
  sectorId?: string;
  circleBgColor?: string;
}

export interface TargetSymbolDescriptor {
  kind: TargetSymbolKind;
  shape: "diamond" | "square" | "text";
  symbol: string;
  char?: string;
}

/** Check if an aircraft/track is primary-only (no transponder/beacon). */
export function isPrimaryTarget(
  ac?: { primaryOnly?: boolean; isPrimary?: boolean; transponder?: string } | null,
  td?: { primaryOnly?: boolean; isPrimary?: boolean; surveillance?: string } | null,
): boolean {
  if (!ac && !td) {
    return false;
  }
  return (
    ac?.primaryOnly === true ||
    ac?.isPrimary === true ||
    ac?.transponder === "primary" ||
    ac?.transponder === "none" ||
    td?.primaryOnly === true ||
    td?.isPrimary === true ||
    td?.surveillance === "primary"
  );
}

export function targetSymbolDescriptor(
  options: TargetSymbolOptions | TrackOwnership = {},
): TargetSymbolDescriptor {
  const opts: TargetSymbolOptions = typeof options === "string" ? { ownership: options } : options;
  if (
    opts.isPrimary ||
    opts.primaryOnly ||
    opts.surveillance === "primary" ||
    opts.transponder === "primary" ||
    opts.transponder === "none"
  ) {
    return {
      kind: "diamond",
      shape: "diamond",
      symbol: "◇",
    };
  }

  const isTracked = opts.tracked ?? (opts.ownership !== undefined && opts.ownership !== "unowned");
  if (isTracked) {
    let sectorId = opts.sectorId;
    if (!sectorId) {
      if (opts.ownership === "tower") {
        sectorId = "T";
      } else if (opts.ownership === "center") {
        sectorId = "C";
      } else {
        sectorId = "D";
      }
    }
    return {
      kind: "tracked",
      shape: "text",
      char: sectorId,
      symbol: sectorId,
    };
  }

  const squawk = opts.squawk ?? opts.beaconCode ?? "";
  if (squawk === "1200") {
    return {
      kind: "vfr",
      shape: "text",
      char: "V",
      symbol: "V",
    };
  }

  if (opts.beaconSelect && squawk.length > 0) {
    const isSelected = Array.isArray(opts.beaconSelect)
      ? opts.beaconSelect.includes(squawk)
      : opts.beaconSelect instanceof Set
        ? opts.beaconSelect.has(squawk)
        : false;
    if (isSelected) {
      return {
        kind: "beacon_select",
        shape: "square",
        symbol: "□",
        char: "□",
      };
    }
  }

  return {
    kind: "asterisk",
    shape: "text",
    char: "*",
    symbol: "*",
  };
}

export function targetSymbolShape(options: TargetSymbolOptions | TrackOwnership = {}): string {
  const desc = targetSymbolDescriptor(options);
  if (desc.kind === "diamond") {
    return "diamond";
  }
  if (desc.kind === "beacon_select") {
    return "square";
  }
  return desc.symbol;
}

export function historyDotColor(indexFromOldest: number, count: number): string {
  return historyTrailColor(indexFromOldest, count);
}

export function targetTextColor(ownership?: TrackOwnership, identFlashing?: boolean): string {
  if (identFlashing) {
    return SELECTED_ACCENT_COLOR;
  }
  if (ownership === "owned") {
    return OWNED_TRACK_COLOR; // White #FFFFFF
  }
  return UNOWNED_TRACK_COLOR; // Green #00FF00
}

export function targetStrokeColor(_ownership?: TrackOwnership, identFlashing?: boolean): string {
  if (identFlashing) {
    return SELECTED_ACCENT_COLOR;
  }
  return POSITION_SYMBOL_COLOR;
}

/** North / east / south / west vertices of the axis-aligned diamond. */
export function targetDiamondVertices(
  x: number,
  y: number,
  sizePx: number = PRIMARY_TARGET_SIZE_PX,
): [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] {
  const half = sizePx / 2;
  return [
    { x, y: y - half },
    { x: x + half, y },
    { x, y: y + half },
    { x: x - half, y },
  ];
}

/** True when `points` is the four-vertex diamond centered near (cx, cy). */
export function isTargetDiamondPath(
  points: ReadonlyArray<{ x: number; y: number }>,
  cx: number,
  cy: number,
  slopPx = 3,
  sizePx?: number,
): boolean {
  if (points.length < 4) {
    return false;
  }
  const sizesToTry =
    sizePx != null ? [sizePx] : [PRIMARY_TARGET_SIZE_PX, 11, 12, 10, TARGET_SIZE_PX];
  return sizesToTry.some((sz) => {
    const expected = targetDiamondVertices(cx, cy, sz);
    for (let i = 0; i < 4; i += 1) {
      const p = points[i]!;
      const e = expected[i]!;
      if (Math.abs(p.x - e.x) > slopPx || Math.abs(p.y - e.y) > slopPx) {
        return false;
      }
    }
    return true;
  });
}

export function selectionBoxRect(
  x: number,
  y: number,
  sizePx: number = TARGET_SIZE_PX,
): { x: number; y: number; w: number; h: number } {
  const half = sizePx / 2 + SELECTION_BOX_PAD_PX;
  return {
    x: x - half,
    y: y - half,
    w: sizePx + SELECTION_BOX_PAD_PX * 2,
    h: sizePx + SELECTION_BOX_PAD_PX * 2,
  };
}

export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sizePx: number = TARGET_SIZE_PX,
): void {
  const box = selectionBoxRect(x, y, sizePx);
  ctx.strokeStyle = SELECTED_ACCENT_COLOR;
  ctx.lineWidth = TARGET_STROKE_PX;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
}

/** Screen offset for the heading tick. 0° = north (up), 90° = east (right). */
export function headingTickOffset(
  headingDeg: number,
  tickPx: number = HEADING_TICK_PX,
): { dx: number; dy: number } {
  const rad = (headingDeg * Math.PI) / 180;
  return {
    dx: Math.sin(rad) * tickPx,
    dy: -Math.cos(rad) * tickPx,
  };
}

function strokeDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, sizePx: number): void {
  const verts = targetDiamondVertices(x, y, sizePx);
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  ctx.lineTo(verts[1].x, verts[1].y);
  ctx.lineTo(verts[2].x, verts[2].y);
  ctx.lineTo(verts[3].x, verts[3].y);
  ctx.closePath();
  ctx.stroke();
}

export function drawOwnershipStub(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ownership: TrackOwnership,
  color: string,
): void {
  ctx.font = OWNERSHIP_STUB_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(ownershipStubChar(ownership), x, y);
}

export function drawTargetSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  arg4: number | string,
  arg5?: string | TargetSymbolOptions | TrackOwnership,
  arg6?: TrackOwnership | number,
  arg7?: number,
): void {
  let color: string;
  let options: TargetSymbolOptions = {};
  let sizePx: number = TARGET_SIZE_PX;

  if (typeof arg4 === "number") {
    color = typeof arg5 === "string" ? arg5 : POSITION_SYMBOL_COLOR;
    if (typeof arg6 === "string") {
      options = { ownership: arg6 as TrackOwnership };
    } else if (typeof arg6 === "object" && arg6 !== null) {
      options = arg6 as TargetSymbolOptions;
    }
    if (typeof arg7 === "number") {
      sizePx = arg7;
    }
  } else {
    color = arg4;
    if (typeof arg5 === "string") {
      options = { ownership: arg5 as TrackOwnership };
    } else if (typeof arg5 === "object" && arg5 !== null) {
      options = arg5 as TargetSymbolOptions;
    }
    if (typeof arg6 === "number") {
      sizePx = arg6;
    }
  }

  const desc = targetSymbolDescriptor(options);
  if (desc.shape === "diamond") {
    ctx.strokeStyle = color;
    ctx.lineWidth = TARGET_STROKE_PX;
    const diamondSize = Math.max(PRIMARY_TARGET_SIZE_PX, Math.round(sizePx * 1.25));
    strokeDiamond(ctx, x, y, diamondSize);
  } else if (desc.shape === "square") {
    ctx.strokeStyle = color;
    ctx.lineWidth = TARGET_STROKE_PX;
    const half = sizePx / 2;
    ctx.strokeRect(x - half, y - half, sizePx, sizePx);
  } else {
    // 1. Solid blue circle background (#175dc7)
    const circleBg = options.circleBgColor ?? TARGET_CIRCLE_BG_COLOR;
    const circleRadius = Math.max(5, Math.round(sizePx * 0.65));
    ctx.beginPath();
    ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
    ctx.fillStyle = circleBg;
    ctx.fill();

    // 2. Icon letter/symbol on top (white for owned, green for unowned/other)
    let textColor = color;
    if (color === POSITION_SYMBOL_COLOR) {
      textColor = targetTextColor(options.ownership);
    }
    ctx.font = `${sizePx}px ${SCOPE_FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textColor;
    ctx.fillText(desc.char ?? desc.symbol, x, y);
  }
}

export const renderTargetSymbol = drawTargetSymbol;

export function drawHistoryDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  const half = HISTORY_DOT_SIZE_PX / 2;
  ctx.fillStyle = color;
  ctx.fillRect(x - half, y - half, HISTORY_DOT_SIZE_PX, HISTORY_DOT_SIZE_PX);
}
