/**
 * Analog: CRC STARS PTL (predicted track line) on the DCB and Table 24
 * per-track PTL (`R` plus slew) (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: default length is straight 1.0 min of current GS along current
 * ground track. AUX PTL spinner steps 0.5 / 1 / 2 / 4 min (includes that 1.0
 * default). Keyboard `*PTL` stores 0–15 minutes; length is always global.
 * CRC may offer a turn-radius predictor; we do not. PTL ALL draws every
 * in-filter track; PTL OWN draws F3-owned tracks only; ALL wins if both are
 * on. Per-track override is `*R` plus click (session map, not PREF); `*RR`
 * stays range rings. Per-track ON draws even when ALL and OWN are off;
 * per-track OFF hides under ALL. Not a velocity vector, heading line, or zoom.
 * Not NAS STARS.
 *
 * Heading 0 = north (T00-04 / kinematics): east += dist * sin(hdg),
 * north += dist * cos(hdg). Display only — never Command IR.
 */

export const PTL_MINUTES = 1.0;
export const PTL_MINUTE_PRESETS = [0.5, 1, 2, 4] as const;
/** AUX spinner stays 0.5/1/2/4. Keyboard `*PTL` stores 0–15 minutes. */
export type PtlMinutes = number;
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
 * T02-06: pass `!inAltitudeFilter(modeCFt, filter)` so filtered tracks keep
 * the target symbol and lose PTL (and datablock / leader).
 */
export function shouldDrawPtl(gsKt: number, altitudeFiltered = false): boolean {
  if (!Number.isFinite(gsKt) || gsKt <= 0) {
    return false;
  }
  return !altitudeFiltered;
}

export function stepPtlMinutes(current: PtlMinutes, delta: -1 | 1): PtlMinutes {
  const i = (PTL_MINUTE_PRESETS as readonly number[]).indexOf(current);
  if (i >= 0) {
    const next = i + delta;
    if (next < 0 || next >= PTL_MINUTE_PRESETS.length) {
      return current;
    }
    return PTL_MINUTE_PRESETS[next]!;
  }
  if (delta === 1) {
    return (
      PTL_MINUTE_PRESETS.find((preset) => preset > current) ??
      PTL_MINUTE_PRESETS[PTL_MINUTE_PRESETS.length - 1]!
    );
  }
  const lower = [...PTL_MINUTE_PRESETS].reverse().find((preset) => preset < current);
  return lower ?? PTL_MINUTE_PRESETS[0]!;
}

/**
 * PTL ALL (global / F7) draws every in-filter track. PTL OWN draws F3-owned
 * tracks only. If both are on, ALL wins. Both off draws none unless a
 * per-track override is ON.
 *
 * Precedence (R07 Table 24 analog; trainer session map, not PREF):
 * per-track ON forces display; per-track OFF suppresses even when ALL is on;
 * tracks without an override follow ALL / OWN (OWN unchanged).
 */
export function shouldDrawPtlForTrack(
  gsKt: number,
  altitudeFiltered: boolean,
  owned: boolean,
  ptlAll: boolean,
  ptlOwn: boolean,
  perTrackOverride?: boolean,
): boolean {
  if (!shouldDrawPtl(gsKt, altitudeFiltered)) {
    return false;
  }
  if (perTrackOverride === true) {
    return true;
  }
  if (perTrackOverride === false) {
    return false;
  }
  if (ptlAll) {
    return true;
  }
  if (ptlOwn) {
    return owned;
  }
  return false;
}

/** Flip the current effective PTL into a session override keyed by aircraft id. */
export function togglePtlByAircraftId(
  map: Map<string, boolean>,
  aircraftId: string,
  currentlyDrawn: boolean,
): boolean {
  const next = !currentlyDrawn;
  map.set(aircraftId, next);
  return next;
}

/** Session / map reset: drop every per-track PTL override. Never PREF. */
export function clearPtlByAircraftId(map: Map<string, boolean>): void {
  map.clear();
}

/** 4 px cap tick at the PTL tip, perpendicular to the ground-track line. */
export function ptlCapTickOffsets(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  capTickPx: number = PTL_CAP_TICK_PX,
): { dx: number; dy: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return { dx: capTickPx / 2, dy: 0 };
  }
  const half = capTickPx / 2;
  return { dx: (-dy / len) * half, dy: (dx / len) * half };
}

export function drawPredictedTrackLine(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  capTickPx: number = PTL_CAP_TICK_PX,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = PTL_STROKE_PX;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  const cap = ptlCapTickOffsets(fromX, fromY, toX, toY, capTickPx);
  ctx.beginPath();
  ctx.moveTo(toX - cap.dx, toY - cap.dy);
  ctx.lineTo(toX + cap.dx, toY + cap.dy);
  ctx.stroke();
}
