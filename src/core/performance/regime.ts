import type { Aircraft } from "../aircraft";
import type { PerformanceRegime } from "./types";

export interface RegimeResolutionOptions {
  /** Transition altitude policy supplied by the caller/data, never by a facility rule. */
  readonly sidInitialClimbTransitionFt?: number;
}

const DEFAULT_SID_TRANSITION_FT = 10000;

/** Resolve the generic flight regime from current FMS intent, without facility knowledge. */
export function resolvePerformanceRegime(
  aircraft: Pick<Aircraft, "altitudeFt" | "intent">,
  options: RegimeResolutionOptions = {},
): PerformanceRegime {
  const lateral = aircraft.intent.lateral;
  const vertical = aircraft.intent.vertical;

  if (lateral?.type === "LANDING" || aircraft.intent.landingCleared === true) {
    return "landing";
  }
  if (lateral?.type === "MISSED" || vertical?.type === "MISSED_CLIMB") {
    return "missedApproach";
  }
  if (lateral?.type === "LOC" || lateral?.type === "INTERCEPT_LOC" || vertical?.type === "GS") {
    return "approach";
  }

  const isSid = vertical?.type === "VIA_SID" || (lateral?.type === "PROCEDURE" && !!lateral.sidId);
  if (isSid) {
    const transitionFt = options.sidInitialClimbTransitionFt ?? DEFAULT_SID_TRANSITION_FT;
    return aircraft.altitudeFt < transitionFt ? "initialClimb" : "climb";
  }

  if (vertical?.type === "VIA_STAR" || (lateral?.type === "PROCEDURE" && !!lateral.starId)) {
    return "arrival";
  }
  return "enroute";
}
