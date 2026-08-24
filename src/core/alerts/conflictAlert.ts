import type { Aircraft } from "../aircraft";
import type { MsawAlert } from "./msaw";

/**
 * Analog: JO 7110.65 / FOA STARS **conflict alert (CA)** (R01, R05) — pair too
 * close laterally and vertically. Not ARV / CRDA.
 *
 * Trainer delta: lite 3 NM / 1000 ft current-position thresholds. Not NAS
 * parameters. Not certified.
 */

/** Lateral current-conflict threshold (NM). Strict `<`. */
export const CA_LATERAL_NM = 3;
/** Vertical current-conflict threshold (ft). Strict `|Δalt| <`. */
export const CA_VERTICAL_FT = 1000;
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
  const touches = ca.filter((a) => a.callsignA === callsign || a.callsignB === callsign);
  if (touches.length === 0) {
    return null;
  }
  return touches.some((a) => a.severity === "alert") ? "alert" : "caution";
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

function sortedCallsigns(a: Aircraft, b: Aircraft): { callsignA: string; callsignB: string } {
  return a.callsign < b.callsign
    ? { callsignA: a.callsign, callsignB: b.callsign }
    : { callsignA: b.callsign, callsignB: a.callsign };
}

/**
 * Pairwise CA. Undirected `{a,b}` sorted by callsign. Ignores self.
 * An alert is active only for a current `< 3 NM` and `< 1000 ft` conflict.
 * Future positions are intentionally not considered.
 */
export function evaluateConflictAlert(aircraft: readonly Aircraft[]): CaAlert[] {
  const out: CaAlert[] = [];
  for (let i = 0; i < aircraft.length; i += 1) {
    const a = aircraft[i]!;
    for (let j = i + 1; j < aircraft.length; j += 1) {
      const b = aircraft[j]!;
      const distNm = planarNm(a, b);
      const deltaAltFt = absDeltaAltFt(a, b);
      if (!isCurrentConflict(distNm, deltaAltFt)) {
        continue;
      }
      const names = sortedCallsigns(a, b);
      out.push({
        callsignA: names.callsignA,
        callsignB: names.callsignB,
        severity: "alert",
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

/**
 * Datablock / target tint priority (phase 4 README):
 * `CA alert > MSAW alert > CA caution > MSAW caution > ownership`.
 *
 * Scope maps this to paint colors; it must not recompute CA or MSAW.
 */

export type AlertTint = "ca-alert" | "msaw-alert" | "ca-caution" | "msaw-caution" | null;

export interface AlertTintTrack {
  ca?: "alert" | "caution" | null;
  msaw?: "alert" | "caution" | null;
}

/**
 * Highest-priority alert tint for a track. Scope maps this to paint colors;
 * it must not recompute conflict geometry.
 */
export function datablockAlertTint(track: AlertTintTrack): AlertTint {
  if (track.ca === "alert") {
    return "ca-alert";
  }
  if (track.msaw === "alert") {
    return "msaw-alert";
  }
  if (track.ca === "caution") {
    return "ca-caution";
  }
  if (track.msaw === "caution") {
    return "msaw-caution";
  }
  return null;
}
