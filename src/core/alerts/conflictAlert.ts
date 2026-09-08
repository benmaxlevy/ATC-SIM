import type { Aircraft } from "../aircraft";
import type { AtpaPair } from "./atpa";
import type { MsawAlert } from "./msaw";
import { magneticToTrueDeg } from "../nav/headingFrames";

/**
 * STARS Conflict Alert (CA) per Raytheon STARS manual (TI 6191.409 Section 2.16 & 2.16.3).
 *
 * Implements 4 Airspace Type Areas (Runway Corridor, Approach Capture Box,
 * Core Terminal, Outer Terminal) and kinematic Closest Point of Approach (CPA)
 * lookahead projection with vertical climb/descent extrapolation.
 */

/** Lateral current-conflict threshold (NM). Retained for backward compatibility. */
export const CA_LATERAL_NM = 3;
/** Vertical current-conflict threshold (ft). Retained for backward compatibility. */
export const CA_VERTICAL_FT = 1000;

export type CaSeverity = "caution" | "alert";

export type AirspaceAreaTier = 1 | 2 | 3 | 4;

export interface AreaTierParameters {
  tier: AirspaceAreaTier;
  name: string;
  dSepNm: number;
  hSepFt: number;
  tLookS: number;
}

/**
 * 4 Airspace Type Areas per Raytheon STARS manual (TI 6191.409 Section 2.16.3):
 * - Area Type 1 (Runway Corridor): ±0.5 NM centerline, surface to 100 ft AGL. Dsep = 0.5 NM, Hsep = 100 ft, Tlook = 15 s.
 * - Area Type 2 (Runway Capture Box / Final Approach): within 6 NM, < 2500 ft. Dsep = 2.5 NM, Hsep = 500 ft, Tlook = 25 s.
 * - Area Type 3 (Core Terminal): <= 12 NM from primary airport / origin. Dsep = 3.0 NM, Hsep = 1000 ft, Tlook = 35 s.
 * - Area Type 4 (Outer Terminal): > 12 NM to boundary. Dsep = 3.0 NM, Hsep = 1000 ft, Tlook = 45 s.
 */
export const AREA_TIER_PARAMETERS: Record<AirspaceAreaTier, AreaTierParameters> = {
  1: { tier: 1, name: "Runway Corridor", dSepNm: 0.5, hSepFt: 100, tLookS: 15 },
  2: { tier: 2, name: "Approach / Runway Capture Box", dSepNm: 2.5, hSepFt: 500, tLookS: 25 },
  3: { tier: 3, name: "Core Terminal", dSepNm: 3.0, hSepFt: 1000, tLookS: 35 },
  4: { tier: 4, name: "Outer Terminal", dSepNm: 3.0, hSepFt: 1000, tLookS: 45 },
};

export interface CaAlert {
  /** Lexicographically first callsign of the undirected pair. */
  callsignA: string;
  /** Lexicographically second callsign of the undirected pair. */
  callsignB: string;
  severity: CaSeverity;
  /** Current horizontal distance in NM. */
  distNm: number;
  /** Absolute current altitude difference, feet. */
  deltaAltFt: number;
  /** Time to CPA in seconds (0 for active violations). */
  timeToCpaS?: number;
  /** Predicted horizontal distance at CPA in NM. */
  cpaDistNm?: number;
  /** Governing Airspace Area Tier (1..4). */
  areaTier?: AirspaceAreaTier;
  /** Active vs predictive violation. */
  conflictType?: "active" | "predictive";
}

export interface MciAlert {
  intruderSquawkOrCallsign: string;
  protectedCallsign: string;
}

export interface WorldAlerts {
  /** Active CA pairs. Scope reads this; it must not recompute CA. */
  ca: CaAlert[];
  /** Active MSAW set. Scope reads this; it must not recompute MSAW. */
  msaw: MsawAlert[];
  /** Active ATPA in-trail pairs. Scope reads this; it must not recompute pairing. */
  atpa: AtpaPair[];
  /** Active Mode C Intruder alerts. */
  mci?: MciAlert[];
}

export function emptyWorldAlerts(): WorldAlerts {
  return { ca: [], msaw: [], atpa: [], mci: [] };
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

export interface CaRunwayGeometry {
  id?: string;
  thresholdXNm: number;
  thresholdYNm: number;
  headingDeg: number;
  lengthNm?: number;
  elevationFt?: number;
  captureBoxLengthNm?: number;
  captureBoxHalfWidthNm?: number;
  captureBoxMaxAltFt?: number;
}

export interface CaApproachGeometry {
  id?: string;
  thresholdXNm: number;
  thresholdYNm: number;
  courseDeg: number;
  lengthNm?: number;
  halfWidthNm?: number;
  maxAltFt?: number;
  elevationFt?: number;
}

export interface CaContext {
  originXNm?: number;
  originYNm?: number;
  fieldElevFt?: number;
  runways?: readonly CaRunwayGeometry[];
  approaches?: readonly CaApproachGeometry[];
}

export interface CaTrackPose {
  xNm: number;
  yNm: number;
  altitudeFt: number;
  headingDeg?: number;
}

export interface CaTrackKinematics {
  callsign?: string;
  xNm: number;
  yNm: number;
  headingDeg: number;
  altitudeFt: number;
  speedKt: number;
  verticalRateFps?: number;
  verticalRateFtPerMin?: number;
  climbRateFtPerMin?: number;
  intent?: {
    assignedAltitudeFt?: number;
  };
}

export interface CpaResult {
  /** Time to CPA in seconds. <= 0 if tracks are diverging or parallel. */
  tCpaS: number;
  /** Horizontal distance at CPA in NM. */
  cpaDistNm: number;
  /** Current horizontal distance in NM. */
  currentDistNm: number;
  /** Current vertical difference in feet. */
  currentDeltaAltFt: number;
  /** Predicted vertical separation at CPA in feet. */
  cpaDeltaAltFt: number;
  /** True if tracks are converging (tCpaS > 0). */
  isConverging: boolean;
  /** Relative speed between tracks in knots. */
  relSpeedKt: number;
}

/** Standard simulator climb/descent rate: 1800 ft/min (30 ft/s). */
export const CA_DEFAULT_CLIMB_RATE_FT_PER_MIN = 1800;

/**
 * Classify a single track's position into one of 4 Airspace Type Areas:
 * 1. Runway Corridor: within ±0.5 NM of runway centerline, altitude <= 100 ft AGL.
 * 2. Approach / Runway Capture Box: final approach within 6 NM, altitude < 2500 ft AGL.
 * 3. Core Terminal: <= 12 NM from primary airport / origin.
 * 4. Outer Terminal: > 12 NM to facility boundary.
 */
export function classifyAirspaceTier(track: CaTrackPose, context?: CaContext): AirspaceAreaTier {
  const fieldElev = context?.fieldElevFt ?? 0;

  // 1. Area Type 1: Runway Corridor (within 0.5 NM centerline, surface to 100 ft AGL)
  if (context?.runways && context.runways.length > 0) {
    for (const r of context.runways) {
      const rwyElev = r.elevationFt ?? fieldElev;
      const rwyLength = r.lengthNm ?? 2.5;
      const rad = (r.headingDeg * Math.PI) / 180;
      const ux = Math.sin(rad);
      const uy = Math.cos(rad);
      const nx = Math.cos(rad);
      const ny = -Math.sin(rad);

      const dx = track.xNm - r.thresholdXNm;
      const dy = track.yNm - r.thresholdYNm;
      const alongNm = dx * ux + dy * uy;
      const crossNm = Math.abs(dx * nx + dy * ny);

      const altAgl = track.altitudeFt - rwyElev;
      if (crossNm <= 0.5 && alongNm >= -0.1 && alongNm <= rwyLength + 0.1 && altAgl <= 100) {
        return 1;
      }
    }
  }

  // 2. Area Type 2: Approach / Runway Capture Box (final approach within 6 NM, altitude < 2500 ft AGL)
  if (context?.approaches && context.approaches.length > 0) {
    for (const app of context.approaches) {
      const appElev = app.elevationFt ?? fieldElev;
      const appLength = app.lengthNm ?? 6.0;
      const appHalfWidth = app.halfWidthNm ?? 1.0;
      const maxAlt = app.maxAltFt ?? 2500 + appElev;

      // Reciprocal heading points away from threshold along the approach corridor
      const recipRad = (((app.courseDeg + 180) % 360) * Math.PI) / 180;
      const ux = Math.sin(recipRad);
      const uy = Math.cos(recipRad);
      const nx = Math.cos(recipRad);
      const ny = -Math.sin(recipRad);

      const dx = track.xNm - app.thresholdXNm;
      const dy = track.yNm - app.thresholdYNm;
      const distAlong = dx * ux + dy * uy;
      const crossNm = Math.abs(dx * nx + dy * ny);

      if (
        distAlong >= -0.1 &&
        distAlong <= appLength + 0.1 &&
        crossNm <= appHalfWidth &&
        track.altitudeFt < maxAlt
      ) {
        return 2;
      }
    }
  }

  if (context?.runways && context.runways.length > 0) {
    for (const r of context.runways) {
      const rwyElev = r.elevationFt ?? fieldElev;
      const appLength = r.captureBoxLengthNm ?? 6.0;
      const appHalfWidth = r.captureBoxHalfWidthNm ?? 1.0;
      const maxAlt = r.captureBoxMaxAltFt ?? 2500 + rwyElev;

      const recipRad = (((r.headingDeg + 180) % 360) * Math.PI) / 180;
      const ux = Math.sin(recipRad);
      const uy = Math.cos(recipRad);
      const nx = Math.cos(recipRad);
      const ny = -Math.sin(recipRad);

      const dx = track.xNm - r.thresholdXNm;
      const dy = track.yNm - r.thresholdYNm;
      const distAlong = dx * ux + dy * uy;
      const crossNm = Math.abs(dx * nx + dy * ny);

      if (
        distAlong >= -0.1 &&
        distAlong <= appLength + 0.1 &&
        crossNm <= appHalfWidth &&
        track.altitudeFt < maxAlt
      ) {
        return 2;
      }
    }
  }

  // 3. Area Type 3: Core Terminal (<= 12 NM from primary airport / origin)
  const originX = context?.originXNm ?? 0;
  const originY = context?.originYNm ?? 0;
  const distFromOrigin = Math.hypot(track.xNm - originX, track.yNm - originY);
  if (distFromOrigin <= 12.0) {
    return 3;
  }

  // 4. Area Type 4: Outer Terminal (> 12 NM)
  return 4;
}

/** Governing area tier for a pair uses min(tierA, tierB). */
export function pairAirspaceTier(
  tierA: AirspaceAreaTier,
  tierB: AirspaceAreaTier,
): AirspaceAreaTier {
  return Math.min(tierA, tierB) as AirspaceAreaTier;
}

export function getAreaTierParameters(tier: AirspaceAreaTier): AreaTierParameters {
  return AREA_TIER_PARAMETERS[tier];
}

/** Get instantaneous vertical speed in ft/s from explicit fields or intent. */
export function getVerticalRateFps(ac: {
  altitudeFt: number;
  verticalRateFps?: number;
  verticalRateFtPerMin?: number;
  climbRateFtPerMin?: number;
  intent?: { assignedAltitudeFt?: number };
}): number {
  if (typeof ac.verticalRateFps === "number") {
    return ac.verticalRateFps;
  }
  if (typeof ac.verticalRateFtPerMin === "number") {
    return ac.verticalRateFtPerMin / 60;
  }
  if (typeof ac.climbRateFtPerMin === "number") {
    return ac.climbRateFtPerMin / 60;
  }
  if (ac.intent?.assignedAltitudeFt !== undefined) {
    const diff = ac.intent.assignedAltitudeFt - ac.altitudeFt;
    if (Math.abs(diff) > 1) {
      return Math.sign(diff) * (CA_DEFAULT_CLIMB_RATE_FT_PER_MIN / 60);
    }
  }
  return 0;
}

/** Predict altitude at lookahead time tS seconds. */
export function predictAltitudeFt(
  ac: {
    altitudeFt: number;
    verticalRateFps?: number;
    verticalRateFtPerMin?: number;
    climbRateFtPerMin?: number;
    intent?: { assignedAltitudeFt?: number };
  },
  tS: number,
): number {
  const vz = getVerticalRateFps(ac);
  if (vz === 0 || tS <= 0) {
    return ac.altitudeFt;
  }
  const projected = ac.altitudeFt + vz * tS;
  if (ac.intent?.assignedAltitudeFt !== undefined) {
    if (vz > 0) {
      return Math.min(ac.intent.assignedAltitudeFt, projected);
    } else {
      return Math.max(ac.intent.assignedAltitudeFt, projected);
    }
  }
  return projected;
}

/**
 * Pure kinematic Closest Point of Approach (CPA) calculation.
 *
 * Δr = rB - rA, Δv = vB - vA
 * t_cpa = -(Δr . Δv) / ||Δv||^2
 */
export function computeKinematicCpa(
  trackA: CaTrackKinematics,
  trackB: CaTrackKinematics,
  magVarDeg = 0,
): CpaResult {
  const dx = trackB.xNm - trackA.xNm;
  const dy = trackB.yNm - trackA.yNm;
  const currentDistNm = Math.hypot(dx, dy);
  const currentDeltaAltFt = Math.abs(trackB.altitudeFt - trackA.altitudeFt);

  // Convert speed in knots to NM/s (1 kt = 1 NM / 3600 s)
  const radA = (magneticToTrueDeg(trackA.headingDeg, magVarDeg) * Math.PI) / 180;
  const vAx = (trackA.speedKt / 3600) * Math.sin(radA);
  const vAy = (trackA.speedKt / 3600) * Math.cos(radA);

  const radB = (magneticToTrueDeg(trackB.headingDeg, magVarDeg) * Math.PI) / 180;
  const vBx = (trackB.speedKt / 3600) * Math.sin(radB);
  const vBy = (trackB.speedKt / 3600) * Math.cos(radB);

  const dvx = vBx - vAx;
  const dvy = vBy - vAy;
  const vSq = dvx * dvx + dvy * dvy;
  const relSpeedNmS = Math.sqrt(vSq);
  const relSpeedKt = relSpeedNmS * 3600;

  if (vSq < 1e-12) {
    return {
      tCpaS: 0,
      cpaDistNm: currentDistNm,
      currentDistNm,
      currentDeltaAltFt,
      cpaDeltaAltFt: currentDeltaAltFt,
      isConverging: false,
      relSpeedKt: 0,
    };
  }

  const dot = dx * dvx + dy * dvy;
  const tCpaS = -dot / vSq;

  if (tCpaS <= 0) {
    return {
      tCpaS,
      cpaDistNm: currentDistNm,
      currentDistNm,
      currentDeltaAltFt,
      cpaDeltaAltFt: currentDeltaAltFt,
      isConverging: false,
      relSpeedKt,
    };
  }

  const cpaDx = dx + dvx * tCpaS;
  const cpaDy = dy + dvy * tCpaS;
  const cpaDistNm = Math.hypot(cpaDx, cpaDy);

  const altAAtCpa = predictAltitudeFt(trackA, tCpaS);
  const altBAtCpa = predictAltitudeFt(trackB, tCpaS);
  const cpaDeltaAltFt = Math.abs(altBAtCpa - altAAtCpa);

  return {
    tCpaS,
    cpaDistNm,
    currentDistNm,
    currentDeltaAltFt,
    cpaDeltaAltFt,
    isConverging: true,
    relSpeedKt,
  };
}

function sortedCallsigns(
  a: { callsign: string },
  b: { callsign: string },
): {
  callsignA: string;
  callsignB: string;
} {
  return a.callsign < b.callsign
    ? { callsignA: a.callsign, callsignB: b.callsign }
    : { callsignA: b.callsign, callsignB: a.callsign };
}

/**
 * Detect conflict for a single pair of aircraft.
 *
 * An alert is declared if:
 * 1. Currently violating: ||Δr|| < Dsep and |Δz| < Hsep (active violation), OR
 * 2. Approaching violation: 0 < t_cpa <= Tlook, horizontal separation at t_cpa < Dsep,
 *    and predicted vertical separation at t_cpa < Hsep. Diverging tracks (t_cpa <= 0)
 *    do not trigger predictive alerts.
 */
export function detectPairConflict(
  trackA: Aircraft,
  trackB: Aircraft,
  context?: CaContext,
  magVarDeg = 0,
): CaAlert | null {
  const tierA = classifyAirspaceTier(trackA, context);
  const tierB = classifyAirspaceTier(trackB, context);
  const tier = pairAirspaceTier(tierA, tierB);
  const params = AREA_TIER_PARAMETERS[tier];

  const currentDistNm = Math.hypot(trackB.xNm - trackA.xNm, trackB.yNm - trackA.yNm);
  const currentDeltaAltFt = Math.abs(trackB.altitudeFt - trackA.altitudeFt);

  const isCurrentlyViolating = currentDistNm < params.dSepNm && currentDeltaAltFt < params.hSepFt;

  const cpa = computeKinematicCpa(trackA, trackB, magVarDeg);

  const isApproachingViolation =
    cpa.isConverging &&
    cpa.tCpaS <= params.tLookS &&
    cpa.cpaDistNm < params.dSepNm &&
    cpa.cpaDeltaAltFt < params.hSepFt;

  if (!isCurrentlyViolating && !isApproachingViolation) {
    return null;
  }

  const names = sortedCallsigns(trackA, trackB);
  return {
    callsignA: names.callsignA,
    callsignB: names.callsignB,
    severity: "alert",
    distNm: currentDistNm,
    deltaAltFt: currentDeltaAltFt,
    timeToCpaS: isCurrentlyViolating ? 0 : Math.round(cpa.tCpaS * 10) / 10,
    cpaDistNm: Math.round(cpa.cpaDistNm * 100) / 100,
    areaTier: tier,
    conflictType: isCurrentlyViolating ? "active" : "predictive",
  };
}

/**
 * Pairwise CA. Undirected {a, b} sorted by callsign. Ignores self.
 * Uses 4 Airspace Type Areas and kinematic CPA prediction lookahead.
 */
export function evaluateConflictAlert(
  aircraft: readonly Aircraft[],
  context?: CaContext,
  magVarDeg = 0,
): CaAlert[] {
  const out: CaAlert[] = [];
  for (let i = 0; i < aircraft.length; i += 1) {
    const a = aircraft[i]!;
    for (let j = i + 1; j < aircraft.length; j += 1) {
      const b = aircraft[j]!;
      const alert = detectPairConflict(a, b, context, magVarDeg);
      if (alert) {
        out.push(alert);
      }
    }
  }
  out.sort(
    (x, y) => x.callsignA.localeCompare(y.callsignA) || x.callsignB.localeCompare(y.callsignB),
  );
  return out;
}

/**
 * Resolve generic CaContext from scenario / facility procedure catalog data.
 */
export function resolveCaContextFromCatalog(catalog?: {
  airportId?: string;
  fieldElevFt?: number;
  arp?: { latDeg?: number; lonDeg?: number };
  originXNm?: number;
  originYNm?: number;
  fixes?: ReadonlyArray<{ id: string; xNm?: number; yNm?: number }>;
  approaches?: ReadonlyArray<{
    id: string;
    runway?: string;
    courseDeg?: number;
    publishedCourseMagneticDeg?: number;
    thresholdFixId?: string;
    lengthNm?: number;
  }>;
}, magVarDeg = 0): CaContext {
  if (!catalog) {
    return {
      originXNm: 0,
      originYNm: 0,
      fieldElevFt: 0,
      runways: [],
      approaches: [],
    };
  }

  const fieldElevFt = catalog.fieldElevFt ?? 0;
  const originXNm = catalog.originXNm ?? 0;
  const originYNm = catalog.originYNm ?? 0;
  const runways: CaRunwayGeometry[] = [];
  const approaches: CaApproachGeometry[] = [];

  if (catalog.approaches && catalog.fixes) {
    for (const app of catalog.approaches) {
      const publishedCourse = app.publishedCourseMagneticDeg ?? app.courseDeg;
      if (app.thresholdFixId && publishedCourse !== undefined) {
        const fix = catalog.fixes.find((f) => f.id === app.thresholdFixId);
        if (fix && typeof fix.xNm === "number" && typeof fix.yNm === "number") {
          approaches.push({
            id: app.id,
            thresholdXNm: fix.xNm,
            thresholdYNm: fix.yNm,
            courseDeg: magneticToTrueDeg(publishedCourse, magVarDeg),
            lengthNm: 6.0,
            halfWidthNm: 1.0,
            maxAltFt: 2500 + fieldElevFt,
            elevationFt: fieldElevFt,
          });
          runways.push({
            id: app.runway ?? app.id,
            thresholdXNm: fix.xNm,
            thresholdYNm: fix.yNm,
            headingDeg: magneticToTrueDeg(publishedCourse, magVarDeg),
            lengthNm: 2.5,
            elevationFt: fieldElevFt,
          });
        }
      }
    }
  }

  return {
    originXNm,
    originYNm,
    fieldElevFt,
    runways,
    approaches,
  };
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
