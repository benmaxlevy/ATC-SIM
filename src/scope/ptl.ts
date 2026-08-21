/**
 * Analog: CRC STARS PTL (predicted track line) on the DCB
 * (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: straight 1.0 min of current GS along current ground track
 * only. CRC may offer extra minute presets and a turn-radius predictor; we
 * do not. Not a velocity vector, heading line, or zoom. Not NAS STARS.
 *
 * Heading 0 = north (T00-04 / kinematics): east += dist * sin(hdg),
 * north += dist * cos(hdg). Display only — never Command IR.
 */

export const PTL_MINUTES = 1.0;
export const PTL_STROKE_PX = 1;
export const PTL_CAP_TICK_PX = 4;

export function ptlDistanceNm(gsKt: number, minutes: number = PTL_MINUTES): number {
  return (gsKt / 60) * minutes;
}

export function ptlEndpoint(
  eastNm: number,
  northNm: number,
  headingTrueDeg: number,
  gsKt: number,
  minutes: number,
): { eastNm: number; northNm: number } {
  const distNm = ptlDistanceNm(gsKt, minutes);
  const rad = (headingTrueDeg * Math.PI) / 180;
  return {
    eastNm: eastNm + distNm * Math.sin(rad),
    northNm: northNm + distNm * Math.cos(rad),
  };
}

/**
 * Whether a track gets a PTL when the global toggle is on.
 * Missing/non-positive GS: do not draw (should not happen in v1).
 *
 * TODO(T02-06): pass the altitude-filter predicate (`inAltitudeFilter`).
 * Filtered tracks keep the target symbol and lose PTL — T02-06 will call
 * this same `shouldDrawPtl` with `altitudeFiltered`.
 */
export function shouldDrawPtl(gsKt: number, altitudeFiltered = false): boolean {
  if (!Number.isFinite(gsKt) || gsKt <= 0) {
    return false;
  }
  return !altitudeFiltered;
}

/** 4 px cap tick at the PTL tip, perpendicular to the ground-track line. */
export function ptlCapTickOffsets(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { dx: number; dy: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return { dx: PTL_CAP_TICK_PX / 2, dy: 0 };
  }
  const half = PTL_CAP_TICK_PX / 2;
  return { dx: (-dy / len) * half, dy: (dx / len) * half };
}

export function drawPredictedTrackLine(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = PTL_STROKE_PX;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  const cap = ptlCapTickOffsets(fromX, fromY, toX, toY);
  ctx.beginPath();
  ctx.moveTo(toX - cap.dx, toY - cap.dy);
  ctx.lineTo(toX + cap.dx, toY + cap.dy);
  ctx.stroke();
}
