/**
 * Pure prediction and session-state helpers for STARS Minimum-Separation (MIN).
 *
 * Raytheon STARS TI 6191.409 Section 6.4 (p. 6-17) and Figure 6-1 (p. 6-18):
 * - Displays and dynamically updates one controller-selected minimum-separation pair.
 * - <MIN><ENTER> removes the graphics; a new selected pair replaces the old pair.
 * - Figure 6-1 shows two projected positions, joining separation graphic, boxed NM value,
 *   and "NO XING" beneath the value when horizontal distance increases.
 * - Zero predicted horizontal separation displays as 0.00 NM regardless of altitude.
 * - Note on manual text: the visual page/figure reads "NO XING", not "NO XING?".
 *
 * Explicit trainer choices (not claimed STARS internals):
 * - The manual specifies presentation and operator entry, not numerical predictor internals,
 *   forecast horizon limits, or non-finite number recovery.
 * - Predictor: straight-line constant motion from the two latest displayed surveillance reports.
 *   No future route/turn forecasting, no pilot intent extrapolation, no look-ahead horizon cap.
 * - Surveillance reports remain at their displayed poses; neither report is advanced to live
 *   truth or timestamp-synchronized by hidden extrapolation.
 * - Magnetic heading is converted to true ENU exactly once.
 * - With relative position r and velocity v:
 *     t_cpa = max(0, -dot(r, v) / dot(v, v))
 *   Equal or near-zero relative velocities use time zero and current distance.
 * - "NO XING" requires strictly increasing horizontal separation; equal-velocity parallel tracks
 *   or stationary tracks must not show the cue (isIncreasingDistance = false).
 * - Non-finite positions, headings, speeds, magnetic variation, or prediction outcomes are rejected
 *   and return null (no drawable prediction).
 * - State tracks stable aircraft IDs only; distinct pair required; duplicate track aborts pending entry
 *   atomically with "DUP TRK" while preserving any previously valid active pair.
 */

import { magneticToTrueDeg } from "@core";
import type { SurveillanceReport } from "./surveillance";
import type { ScopeView } from "./scopeView";
import { cancelPreviewArea } from "./previewArea";

/** Minimum relative velocity squared threshold (in (NM/s)^2) matching CA helper guard. */
const EPSILON_VELOCITY_SQ = 1e-12;

/**
 * Report pose input for minimum-separation prediction.
 * Extracted from SurveillanceReport or supplied synthetically.
 */
export interface MinSepTrackInput {
  aircraftId: string;
  xNm: number;
  yNm: number;
  headingDeg: number;
  speedKt: number;
  altitudeFt?: number;
}

/**
 * Calculated minimum separation prediction result.
 */
export interface MinSepPrediction {
  /** Time from report pose to closest horizontal approach in seconds (>= 0). */
  timeToCpaSec: number;
  /** Projected position for aircraft A at CPA time in local world NM. */
  posANm: { xNm: number; yNm: number };
  /** Projected position for aircraft B at CPA time in local world NM. */
  posBNm: { xNm: number; yNm: number };
  /** Horizontal distance at CPA in nautical miles (unrounded, >= 0). */
  distanceNm: number;
  /**
   * True when horizontal distance is increasing from the current report poses.
   * Per Figure 6-1, displays the "NO XING" cue beneath the separation readout.
   * Equal velocities / stationary tracks have isIncreasingDistance = false.
   */
  isIncreasingDistance: boolean;
}

/**
 * Active minimum-separation pair of distinct aircraft IDs.
 */
export interface ActiveMinSepPair {
  aircraftIdA: string;
  aircraftIdB: string;
}

/**
 * Session state for Minimum-Separation.
 */
export interface MinSepState {
  /** Currently active minimum-separation pair, or null if none. */
  activePair: ActiveMinSepPair | null;
  /** First target ID selected while waiting for second target, or null if idle. */
  pendingFirstId: string | null;
  /** Error cue if pending selection failed (e.g. "DUP TRK" or "ILL TRK"). */
  lastError: "DUP TRK" | "ILL TRK" | null;
}

/**
 * Result of attempting to select an aircraft ID in MIN entry mode.
 */
export type MinSepSelectionResult =
  | { status: "pending_first"; firstId: string }
  | { status: "pair_activated"; pair: ActiveMinSepPair }
  | { status: "error"; error: "DUP TRK" | "ILL TRK"; preservedPair: ActiveMinSepPair | null };

/**
 * Create initial empty MIN session state.
 */
export function createMinSepState(): MinSepState {
  return {
    activePair: null,
    pendingFirstId: null,
    lastError: null,
  };
}

/**
 * Begin MIN entry sequence.
 * Preserves any active pair while resetting pending state.
 */
export function beginMinSepSelection(state: MinSepState): void {
  state.pendingFirstId = null;
  state.lastError = null;
}

/**
 * Cancel pending MIN selection.
 * Preserves any active pair.
 */
export function cancelMinSepPending(state: MinSepState): void {
  state.pendingFirstId = null;
  state.lastError = null;
}

/**
 * Clear all MIN state (<MIN><ENTER>).
 * Removes both active pair and pending selection.
 */
export function clearMinSepState(state: MinSepState): void {
  state.activePair = null;
  state.pendingFirstId = null;
  state.lastError = null;
}

/**
 * Handle selection of an aircraft ID during MIN entry.
 *
 * - If no first target is pending, stores `aircraftId` as `pendingFirstId`.
 * - If a first target is pending:
 *   - If the same ID is selected, aborts pending entry with `DUP TRK` and preserves
 *     the previously active pair (trainer recovery choice).
 *   - If distinct, replaces active pair with `{ aircraftIdA: first, aircraftIdB: second }`
 *     and clears pending state.
 */
export function selectMinSepAircraft(
  state: MinSepState,
  aircraftId: string,
): MinSepSelectionResult {
  state.lastError = null;
  if (!state.pendingFirstId) {
    state.pendingFirstId = aircraftId;
    return { status: "pending_first", firstId: aircraftId };
  }

  const firstId = state.pendingFirstId;
  if (firstId === aircraftId) {
    // Duplicate track selected: abort pending atomically and keep previous active pair.
    state.pendingFirstId = null;
    state.lastError = "DUP TRK";
    return {
      status: "error",
      error: "DUP TRK",
      preservedPair: state.activePair,
    };
  }

  // Valid second selection: replace active pair.
  const newPair: ActiveMinSepPair = {
    aircraftIdA: firstId,
    aircraftIdB: aircraftId,
  };
  state.activePair = newPair;
  state.pendingFirstId = null;
  return { status: "pair_activated", pair: newPair };
}

/**
 * Invalidate active MIN pair if an aircraft drops or becomes invalid.
 */
export function invalidateMinSepPair(state: MinSepState): void {
  state.activePair = null;
}

/**
 * Extract MinSepTrackInput from a displayed SurveillanceReport.
 */
export function minSepInputFromReport(report: SurveillanceReport): MinSepTrackInput {
  return {
    aircraftId: report.aircraftId,
    xNm: report.xNm,
    yNm: report.yNm,
    headingDeg: report.headingDeg,
    speedKt: report.speedKt,
    altitudeFt: report.altitudeFt,
  };
}

/**
 * Check if a number is finite.
 */
function isFiniteNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val);
}

/**
 * Validate that all required numerical fields on MinSepTrackInput are finite numbers.
 */
export function isValidMinSepTrackInput(input: MinSepTrackInput): boolean {
  return (
    typeof input.aircraftId === "string" &&
    input.aircraftId.length > 0 &&
    isFiniteNumber(input.xNm) &&
    isFiniteNumber(input.yNm) &&
    isFiniteNumber(input.headingDeg) &&
    isFiniteNumber(input.speedKt)
  );
}

/**
 * Pure kinematic minimum separation predictor for two tracks.
 *
 * Uses straight-line constant-motion projection from the two latest displayed report poses:
 *   r = rB - rA
 *   v = vB - vA
 *   dot = r . v
 *   vSq = v . v
 *
 * When vSq < EPSILON:
 *   Relative velocity is zero (stationary or parallel with equal speeds).
 *   t_cpa = 0, distance = current distance, isIncreasingDistance = false (no divergence).
 *
 * When vSq >= EPSILON:
 *   t_cpa_unclamped = -dot / vSq
 *   If dot > 0:
 *     Tracks are diverging (relative velocity points away from relative position).
 *     CPA occurred in the past (t_cpa_unclamped < 0).
 *     Future minimum is current distance (t_cpa = 0).
 *     Distance is increasing (isIncreasingDistance = true -> Figure 6-1 "NO XING").
 *   If dot <= 0:
 *     Tracks are converging or at CPA.
 *     t_cpa = t_cpa_unclamped >= 0.
 *     isIncreasingDistance = false.
 *
 * Altitude separation is ignored for horizontal CPA calculation.
 * Returns null if any input contains non-finite numbers or if magVarDeg is non-finite.
 */
export function computeMinimumSeparation(
  trackA: MinSepTrackInput,
  trackB: MinSepTrackInput,
  magVarDeg = 0,
): MinSepPrediction | null {
  if (!isValidMinSepTrackInput(trackA) || !isValidMinSepTrackInput(trackB)) {
    return null;
  }
  if (!isFiniteNumber(magVarDeg)) {
    return null;
  }

  const dx = trackB.xNm - trackA.xNm;
  const dy = trackB.yNm - trackA.yNm;
  const currentDistNm = Math.hypot(dx, dy);

  // Convert magnetic headings to true ENU exactly once.
  // Speed in knots converted to NM/s (1 kt = 1 NM / 3600 s).
  const radA = (magneticToTrueDeg(trackA.headingDeg, magVarDeg) * Math.PI) / 180;
  const vAx = (trackA.speedKt / 3600) * Math.sin(radA);
  const vAy = (trackA.speedKt / 3600) * Math.cos(radA);

  const radB = (magneticToTrueDeg(trackB.headingDeg, magVarDeg) * Math.PI) / 180;
  const vBx = (trackB.speedKt / 3600) * Math.sin(radB);
  const vBy = (trackB.speedKt / 3600) * Math.cos(radB);

  const dvx = vBx - vAx;
  const dvy = vBy - vAy;
  const vSq = dvx * dvx + dvy * dvy;

  if (!Number.isFinite(vSq) || !Number.isFinite(currentDistNm)) {
    return null;
  }

  // Parallel equal velocities or stationary targets
  if (vSq < EPSILON_VELOCITY_SQ) {
    return {
      timeToCpaSec: 0,
      posANm: { xNm: trackA.xNm, yNm: trackA.yNm },
      posBNm: { xNm: trackB.xNm, yNm: trackB.yNm },
      distanceNm: currentDistNm,
      isIncreasingDistance: false,
    };
  }

  const dot = dx * dvx + dy * dvy;
  const tCpaUnclampedSec = -dot / vSq;

  if (tCpaUnclampedSec <= 0) {
    // Diverging: future minimum separation is current separation.
    // Distance rate of change d(dist^2)/dt = 2*(r . v) = 2*dot.
    // When dot > 0, distance is strictly increasing -> NO XING cue.
    return {
      timeToCpaSec: 0,
      posANm: { xNm: trackA.xNm, yNm: trackA.yNm },
      posBNm: { xNm: trackB.xNm, yNm: trackB.yNm },
      distanceNm: currentDistNm,
      isIncreasingDistance: dot > 0,
    };
  }

  // Converging in future: project both aircraft to CPA time
  const tCpaSec = tCpaUnclampedSec;
  const posANm = {
    xNm: trackA.xNm + vAx * tCpaSec,
    yNm: trackA.yNm + vAy * tCpaSec,
  };
  const posBNm = {
    xNm: trackB.xNm + vBx * tCpaSec,
    yNm: trackB.yNm + vBy * tCpaSec,
  };

  const cpaDx = posBNm.xNm - posANm.xNm;
  const cpaDy = posBNm.yNm - posANm.yNm;
  const distanceNm = Math.hypot(cpaDx, cpaDy);

  if (
    !Number.isFinite(posANm.xNm) ||
    !Number.isFinite(posANm.yNm) ||
    !Number.isFinite(posBNm.xNm) ||
    !Number.isFinite(posBNm.yNm) ||
    !Number.isFinite(distanceNm)
  ) {
    return null;
  }

  // When converging, distance is decreasing toward CPA (not increasing).
  return {
    timeToCpaSec: tCpaSec,
    posANm,
    posBNm,
    distanceNm,
    isIncreasingDistance: false,
  };
}

/**
 * Check whether Minimum-Separation (MIN) selection or entry is pending on the scope view.
 */
export function isMinSepPending(view: ScopeView): boolean {
  return view.preview.armed?.type === "minSep" || view.minSep.pendingFirstId !== null;
}

/**
 * Cancel pending MIN selection and preview if armed.
 * Preserves any active pair.
 */
export function cancelPendingMinSepIfArmed(view: ScopeView): void {
  if (view.minSep.pendingFirstId !== null || view.preview.armed?.type === "minSep") {
    cancelMinSepPending(view.minSep);
    if (view.preview.armed?.type === "minSep") {
      cancelPreviewArea(view.preview);
    }
  }
}
