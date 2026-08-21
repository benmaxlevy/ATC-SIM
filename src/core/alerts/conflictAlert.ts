import type { Aircraft } from "../aircraft";
import { CLIMB_RATE_FT_PER_MIN } from "../kinematics";
import type { MsawAlert } from "./msaw";

/**
 * Analog: JO 7110.65 / FOA STARS **conflict alert (CA)** (R01, R05) — pair too
 * close laterally and vertically. Not ARV / CRDA.
 *
 * Trainer delta: lite 3 NM / 1000 ft / 40 s linear lookahead. Not NAS
 * parameters. Not certified. Turning aircraft still use a straight-line
 * predictor (constant ground velocity + constant VS).
 */

/** Lateral current-conflict threshold (NM). Strict `<`. */
export const CA_LATERAL_NM = 3;
/** Vertical current-conflict threshold (ft). Strict `|Δalt| <`. */
export const CA_VERTICAL_FT = 1000;
/** Linear lookahead horizon (seconds). */
export const CA_LOOKAHEAD_S = 40;
/** Lookahead sample step (seconds). Samples `t ∈ (0, T]`. */
export const CA_LOOKAHEAD_SAMPLE_S = 1;

export type CaSeverity = "caution" | "alert";

export interface CaAlert {
  /** Lexicographically first callsign of the undirected pair. */
  callsignA: string;
  /** Lexicographically second callsign of the undirected pair. */
  callsignB: string;
  severity: CaSeverity;
  distNm: number;
  /** Absolute altitude difference, feet. */
  deltaAltFt: number;
}

export interface WorldAlerts {
  /** Active CA pairs. Scope reads this; it must not recompute CA. */
  ca: CaAlert[];
  /** Active MSAW set. Scope reads this; it must not recompute MSAW. */
  msaw: MsawAlert[];
}

export function emptyWorldAlerts(): WorldAlerts {
  return { ca: [], msaw: [] };
}

export function caPairKey(callsignA: string, callsignB: string): string {
  return callsignA < callsignB ? `${callsignA}|${callsignB}` : `${callsignB}|${callsignA}`;
}

/**
 * Highest CA severity touching this callsign, or `null`. Alert wins over
 * caution when the aircraft is in more than one pair.
 */
export function caSeverityForCallsign(ca: readonly CaAlert[], callsign: string): CaSeverity | null {
  let caution = false;
  for (const alert of ca) {
    if (alert.callsignA !== callsign && alert.callsignB !== callsign) {
      continue;
    }
    if (alert.severity === "alert") {
      return "alert";
    }
    caution = true;
  }
  return caution ? "caution" : null;
}

function planarNm(a: Aircraft, b: Aircraft): number {
  return Math.hypot(a.xNm - b.xNm, a.yNm - b.yNm);
}

function absDeltaAltFt(a: Aircraft, b: Aircraft): number {
  return Math.abs(a.altitudeFt - b.altitudeFt);
}

function isCurrentConflict(distNm: number, deltaAltFt: number): boolean {
  return distNm < CA_LATERAL_NM && deltaAltFt < CA_VERTICAL_FT;
}

/** NM/s east and north from present heading and TAS (IAS=TAS in v1). */
function groundVelocityNmPerS(ac: Aircraft): { vx: number; vy: number } {
  const rad = (ac.headingDeg * Math.PI) / 180;
  const nmPerS = ac.speedKt / 3600;
  return { vx: nmPerS * Math.sin(rad), vy: nmPerS * Math.cos(rad) };
}

/**
 * Constant VS lite model: kinematics climb rate toward assigned, or 0 when
 * already there. Does not level off inside the lookahead window.
 */
function verticalSpeedFtPerS(ac: Aircraft): number {
  const remaining = ac.intent.assignedAltitudeFt - ac.altitudeFt;
  if (Math.abs(remaining) < 1) {
    return 0;
  }
  return Math.sign(remaining) * (CLIMB_RATE_FT_PER_MIN / 60);
}

function predictedConflict(a: Aircraft, b: Aircraft): boolean {
  const va = groundVelocityNmPerS(a);
  const vb = groundVelocityNmPerS(b);
  const vsa = verticalSpeedFtPerS(a);
  const vsb = verticalSpeedFtPerS(b);
  for (let t = CA_LOOKAHEAD_SAMPLE_S; t <= CA_LOOKAHEAD_S; t += CA_LOOKAHEAD_SAMPLE_S) {
    const dx = a.xNm + va.vx * t - (b.xNm + vb.vx * t);
    const dy = a.yNm + va.vy * t - (b.yNm + vb.vy * t);
    const distNm = Math.hypot(dx, dy);
    const deltaAltFt = Math.abs(a.altitudeFt + vsa * t - (b.altitudeFt + vsb * t));
    if (isCurrentConflict(distNm, deltaAltFt)) {
      return true;
    }
  }
  return false;
}

function sortedCallsigns(a: Aircraft, b: Aircraft): { callsignA: string; callsignB: string } {
  return a.callsign < b.callsign
    ? { callsignA: a.callsign, callsignB: b.callsign }
    : { callsignA: b.callsign, callsignB: a.callsign };
}

/**
 * Pairwise CA. Undirected `{a,b}` sorted by callsign. Ignores self.
 * Red = current `< 3 NM` and `< 1000 ft`. Yellow = not red, but linear
 * lookahead of 40 s (1 s samples) would satisfy that predicate.
 */
export function evaluateConflictAlert(aircraft: readonly Aircraft[]): CaAlert[] {
  const out: CaAlert[] = [];
  for (let i = 0; i < aircraft.length; i += 1) {
    const a = aircraft[i]!;
    for (let j = i + 1; j < aircraft.length; j += 1) {
      const b = aircraft[j]!;
      if (a.id === b.id) {
        continue;
      }
      const distNm = planarNm(a, b);
      const deltaAltFt = absDeltaAltFt(a, b);
      let severity: CaSeverity | null = null;
      if (isCurrentConflict(distNm, deltaAltFt)) {
        severity = "alert";
      } else if (predictedConflict(a, b)) {
        severity = "caution";
      }
      if (severity === null) {
        continue;
      }
      const names = sortedCallsigns(a, b);
      out.push({
        callsignA: names.callsignA,
        callsignB: names.callsignB,
        severity,
        distNm,
        deltaAltFt,
      });
    }
  }
  out.sort(
    (x, y) => x.callsignA.localeCompare(y.callsignA) || x.callsignB.localeCompare(y.callsignB),
  );
  return out;
}
