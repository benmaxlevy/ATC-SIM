import type { World } from "@core";
import {
  formatRangeReadout,
  nmToScreen,
  rangeCircle,
  type ScopeCamera,
  type ScopeViewSize,
} from "./camera";

/**
 * Analog: CRC STARS RANGE / CENTER PPI (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: Canvas2D north-up; circular clip to the range inscribed circle;
 * `RNG n` readout; ticks + temporary callsign text until T02-03/T02-04.
 * Extra CRC presets 6/8/12/16/24 omitted. Not NAS STARS.
 *
 * World draw is clipped to the range circle. Square-canvas corners sit outside
 * range and stay background. Readout is painted after restore so it stays visible.
 */

const BG = "#000000";
const RING = "#006600";
const RANGE_EDGE = "#00AA00";
const AIRPORT = "#00AA00";
const TICK = "#DDDDDD";
const TICK_SELECTED = "#FFFF00";
const CALLSIGN = "#DDDDDD";
const IDENT_HALO = "rgba(180, 255, 170, 0.55)";
const READOUT = "#00AA00";

const RING_INTERVAL_NM = 10;
const AIRPORT_CROSS_PX = 6;
const TICK_RADIUS_PX = 2.5;
const SELECTED_TICK_RADIUS_PX = 4.5;
const SELECTED_RING_RADIUS_PX = 8;
const IDENT_HALO_RADIUS_PX = 10;
const CALLSIGN_OFFSET_X_PX = 8;
const CALLSIGN_OFFSET_Y_PX = 4;

export function renderScope(
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: ScopeCamera,
  cssWidth: number,
  cssHeight: number,
): void {
  const view: ScopeViewSize = { widthPx: cssWidth, heightPx: cssHeight };
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  if (cssWidth <= 0 || cssHeight <= 0) {
    return;
  }

  const circle = rangeCircle(view);
  ctx.save();
  ctx.beginPath();
  ctx.arc(circle.cx, circle.cy, circle.radiusPx, 0, Math.PI * 2);
  ctx.clip();

  drawRangeRings(ctx, cam, view);
  drawAirportMark(ctx, cam, view);
  drawTracks(ctx, world, cam, view);

  ctx.restore();

  ctx.beginPath();
  ctx.arc(circle.cx, circle.cy, circle.radiusPx, 0, Math.PI * 2);
  ctx.strokeStyle = RANGE_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawRangeReadout(ctx, cam, cssHeight);
}

function drawRangeRings(
  ctx: CanvasRenderingContext2D,
  cam: ScopeCamera,
  view: ScopeViewSize,
): void {
  const origin = nmToScreen(cam.centerEastNm, cam.centerNorthNm, cam, view);
  const edge = nmToScreen(cam.centerEastNm + RING_INTERVAL_NM, cam.centerNorthNm, cam, view);
  const pxPerRing = Math.abs(edge.x - origin.x);
  if (pxPerRing <= 0) {
    return;
  }

  ctx.strokeStyle = RING;
  ctx.lineWidth = 1;
  for (let rNm = RING_INTERVAL_NM; rNm <= cam.rangeNm + 1e-9; rNm += RING_INTERVAL_NM) {
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, pxPerRing * (rNm / RING_INTERVAL_NM), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawAirportMark(
  ctx: CanvasRenderingContext2D,
  cam: ScopeCamera,
  view: ScopeViewSize,
): void {
  const p = nmToScreen(0, 0, cam, view);
  ctx.strokeStyle = AIRPORT;
  ctx.fillStyle = AIRPORT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x - AIRPORT_CROSS_PX, p.y);
  ctx.lineTo(p.x + AIRPORT_CROSS_PX, p.y);
  ctx.moveTo(p.x, p.y - AIRPORT_CROSS_PX);
  ctx.lineTo(p.x, p.y + AIRPORT_CROSS_PX);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawTracks(
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: ScopeCamera,
  view: ScopeViewSize,
): void {
  ctx.font = '12px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace';
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";

  for (const ac of world.aircraft) {
    const p = nmToScreen(ac.xNm, ac.yNm, cam, view);
    const selected = ac.id === world.selectedAircraftId;
    const identActive = ac.identUntilSimMs > world.simTimeMs;

    if (identActive) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, IDENT_HALO_RADIUS_PX, 0, Math.PI * 2);
      ctx.strokeStyle = IDENT_HALO;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (selected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, SELECTED_RING_RADIUS_PX, 0, Math.PI * 2);
      ctx.strokeStyle = TICK_SELECTED;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, selected ? SELECTED_TICK_RADIUS_PX : TICK_RADIUS_PX, 0, Math.PI * 2);
    ctx.fillStyle = selected ? TICK_SELECTED : TICK;
    ctx.fill();

    // Temporary callsign text — not a datablock (no leader, no Mode C).
    ctx.fillStyle = selected ? TICK_SELECTED : CALLSIGN;
    ctx.fillText(ac.callsign, p.x + CALLSIGN_OFFSET_X_PX, p.y - CALLSIGN_OFFSET_Y_PX);
  }
}

function drawRangeReadout(
  ctx: CanvasRenderingContext2D,
  cam: ScopeCamera,
  cssHeight: number,
): void {
  ctx.font = '12px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace';
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillStyle = READOUT;
  ctx.fillText(formatRangeReadout(cam.rangeNm), 8, cssHeight - 8);
}
