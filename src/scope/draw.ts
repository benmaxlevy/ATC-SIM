import type { World } from "@core";
import { worldToCanvas, type Camera } from "./camera";

/**
 * Analog: CRC STARS PPI plan view (docs.virtualnas.net/crc/stars).
 * Trainer delta: ticks = dots + temporary callsign text; no datablocks, leaders,
 * maps, or STARS keys. Not NAS STARS.
 */

const BG = "#050708";
const RING = "rgba(124, 255, 107, 0.28)";
const AIRPORT = "rgba(124, 255, 107, 0.9)";
const TICK = "#c8ffc0";
const TICK_SELECTED = "#ffffff";
const CALLSIGN = "#d7ffe0";
const IDENT_HALO = "rgba(180, 255, 170, 0.55)";

const RING_INTERVAL_NM = 10;
const AIRPORT_CROSS_PX = 6;
const TICK_RADIUS_PX = 2.5;
const SELECTED_TICK_RADIUS_PX = 4;
const SELECTED_RING_RADIUS_PX = 7;
const IDENT_HALO_RADIUS_PX = 10;
const CALLSIGN_OFFSET_X_PX = 8;
const CALLSIGN_OFFSET_Y_PX = 4;

export function drawPpi(
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  drawRangeRings(ctx, cam, cssWidth, cssHeight);
  drawAirportMark(ctx, cam, cssWidth, cssHeight);
  drawTracks(ctx, world, cam, cssWidth, cssHeight);
}

function drawRangeRings(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
): void {
  const origin = worldToCanvas(cam.centerXNm, cam.centerYNm, cam, cssWidth, cssHeight);
  const edge = worldToCanvas(
    cam.centerXNm + RING_INTERVAL_NM,
    cam.centerYNm,
    cam,
    cssWidth,
    cssHeight,
  );
  const pxPerRing = Math.abs(edge.x - origin.x);

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
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
): void {
  const p = worldToCanvas(0, 0, cam, cssWidth, cssHeight);
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
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
): void {
  ctx.font = '12px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace';
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";

  for (const ac of world.aircraft) {
    const p = worldToCanvas(ac.xNm, ac.yNm, cam, cssWidth, cssHeight);
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
      ctx.lineWidth = 1.5;
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
