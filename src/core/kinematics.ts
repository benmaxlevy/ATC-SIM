import type { Aircraft } from "./aircraft";
import type { TurnDir } from "./command/types";
import { DEG2RAD, normalizeHeadingDeg } from "./nav/geometry";

export { PHYSICS_HZ, SIM_DT_S } from "./clock";

export const TURN_RATE_DEG_PER_S = 3;
export const CLIMB_RATE_FT_PER_MIN = 1800;
export const ACCEL_KT_PER_S = 1;

export const normalizeHeading = normalizeHeadingDeg;

/**
 * Signed delta in (-180, 180]; + = right / increasing heading.
 * A 180° difference returns +180; SHORTEST still turns LEFT (see `stepAircraft`).
 */
export function shortestDeltaDeg(from: number, to: number): number {
  const fromN = normalizeHeading(from);
  const toN = normalizeHeading(to);
  let d = toN - fromN;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Remaining turn in the commanded direction (0–360], and the heading sign
 * to apply: -1 left (decreasing), +1 right (increasing).
 * LEFT/RIGHT take that way even when it is the long arc — not shortestDelta.
 * SHORTEST uses the smaller arc; exactly 180° is LEFT.
 */
function remainingTurn(
  from: number,
  to: number,
  turn: TurnDir,
): { remainingDeg: number; sign: -1 | 0 | 1 } {
  if (turn === "LEFT") {
    const remainingDeg = (from - to + 360) % 360;
    return remainingDeg === 0 ? { remainingDeg: 0, sign: 0 } : { remainingDeg, sign: -1 };
  }
  if (turn === "RIGHT") {
    const remainingDeg = (to - from + 360) % 360;
    return remainingDeg === 0 ? { remainingDeg: 0, sign: 0 } : { remainingDeg, sign: 1 };
  }
  const delta = shortestDeltaDeg(from, to);
  if (delta === 0) return { remainingDeg: 0, sign: 0 };
  if (Math.abs(delta) === 180) {
    return { remainingDeg: 180, sign: -1 };
  }
  return {
    remainingDeg: Math.abs(delta),
    sign: delta > 0 ? 1 : -1,
  };
}

function toward(current: number, assigned: number, maxDelta: number): number {
  const remaining = assigned - current;
  if (Math.abs(remaining) <= maxDelta) {
    return assigned;
  }
  return current + Math.sign(remaining) * maxDelta;
}

/**
 * Move one aircraft toward its intent for `dtS` sim seconds.
 * Heading and speed are updated first; position uses those post-update values
 * (heading 0 = north, +x east, +y north).
 *
 * When `commandedHeadingDeg` is set (DIRECT / PROCEDURE FMS), fly that heading
 * by the shortest turn — assigned heading stays the last ATC vector until the
 * fix sequences.
 */
export function stepAircraft(
  ac: Aircraft,
  dtS: number,
  commandedHeadingDeg?: number,
  commandedAltitudeFt?: number,
  commandedSpeedKt?: number,
): void {
  const headingFrom = normalizeHeading(ac.headingDeg);
  const headingTo = normalizeHeading(
    commandedHeadingDeg !== undefined ? commandedHeadingDeg : ac.intent.assignedHeadingDeg,
  );
  const turn = commandedHeadingDeg !== undefined ? "SHORTEST" : ac.intent.turn;
  const { remainingDeg, sign } = remainingTurn(headingFrom, headingTo, turn);
  const maxTurnDeg = TURN_RATE_DEG_PER_S * dtS;
  if (remainingDeg <= maxTurnDeg + 1e-9) {
    ac.headingDeg = headingTo;
  } else {
    ac.headingDeg = normalizeHeading(headingFrom + sign * maxTurnDeg);
  }

  const maxAltFt = (CLIMB_RATE_FT_PER_MIN / 60) * dtS;
  const altitudeTo = commandedAltitudeFt ?? ac.intent.assignedAltitudeFt;
  ac.altitudeFt = toward(ac.altitudeFt, altitudeTo, maxAltFt);

  const maxSpeedKt = ACCEL_KT_PER_S * dtS;
  const speedTo = commandedSpeedKt ?? ac.intent.assignedSpeedKt;
  ac.speedKt = Math.max(0, toward(ac.speedKt, speedTo, maxSpeedKt));

  const headingRad = ac.headingDeg * DEG2RAD;
  ac.xNm += ac.speedKt * Math.sin(headingRad) * (dtS / 3600);
  ac.yNm += ac.speedKt * Math.cos(headingRad) * (dtS / 3600);
}
