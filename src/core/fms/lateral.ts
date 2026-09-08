/**
 * Lateral FMS: DIRECT fly-over, PROCEDURE fly-by (T04-03), loc intercept (T04-05).
 *
 * Command heading = course to the active fix until sequence. Pilot owns Command
 * apply; this module sequences `lateral` when the aircraft reaches the fix or
 * captures the localizer. Positions come from `FixRegistry` / loc axis — no
 * hard-coded lat/lon. Loc capture uses position vs the loc axis, never heading
 * as a sensor.
 */

import type { Aircraft, LateralMode } from "../aircraft";
import type { SessionLog } from "../events/session-log";
import { stepAircraft } from "../kinematics";
import type { FixRegistry, RegisteredFix } from "../nav/fixRegistry";
import {
  alongTrackNm,
  courseChangeDeg,
  courseDeg,
  distanceNm,
  flyByStartNm,
  flyOverSequenceNm,
  type NmPoint,
} from "../nav/geometry";
import type { LocAxis } from "../nav/localizer";
import {
  LOC_BREAKOUT_S,
  locDeviation,
  locEnvelope,
  locShouldBreakout,
  locShouldCapture,
} from "../nav/localizer";
import { TURN_RATE_DEG_PER_S, shortestDeltaDeg } from "../kinematics";
import { clearViaOnVectors, onFixSequenced, type VerticalCatalog } from "./vertical";

/** DEMO ONE north transition then MERGE (ids only; xy from the registry). */
export const DEMO_ONE_NORTH_FIX_IDS = ["NEMAX", "NELBO", "NJOIN", "MERGE"] as const;

export interface LateralFmsContext {
  registry: FixRegistry | null | undefined;
  log?: SessionLog | null;
  simTimeMs: number;
  catalog?: VerticalCatalog | null;
  locAxisFor?: (approachId: string) => LocAxis | undefined;
}

/**
 * Update FMS mode (sequence fly-by / fly-over) and return the heading to fly
 * this tick, or `undefined` to use assigned heading.
 */
export function applyLateralFms(
  ac: Aircraft,
  dtS: number,
  ctx: LateralFmsContext,
): number | undefined {
  const captured = tryArmedLocCapture(ac, ctx);
  if (captured !== undefined) {
    return captured;
  }
  const lateral = ac.intent.lateral;
  if (!lateral) {
    return undefined;
  }
  if (lateral.type === "INTERCEPT_LOC") {
    return guideArmedLoc(ac, dtS, lateral.approachId, ctx);
  }
  if (lateral.type === "LOC") {
    return guideLoc(ac, dtS, lateral, ctx);
  }
  if (lateral.type === "LANDING") {
    return guideLanding(ac, lateral, ctx);
  }
  if (lateral.type === "MISSED") {
    return ac.intent.assignedHeadingDeg;
  }
  const registry = ctx.registry;
  if (!registry) {
    return undefined;
  }
  if (lateral.type === "DIRECT") {
    return guideDirect(ac, dtS, lateral.fixId, ctx, registry);
  }
  if (lateral.type === "PROCEDURE") {
    return guideProcedure(ac, dtS, lateral, ctx, registry);
  }
  return undefined;
}

/**
 * One physics step of a STAR PROCEDURE walker. Initializes PROCEDURE if needed.
 * Unit-test helper (spawn-on-STAR is T04-12).
 */
export function advanceStarLeg(
  ac: Aircraft,
  dtS: number,
  args: {
    registry: FixRegistry;
    routeFixIds?: readonly string[];
    starId?: string;
    sidId?: string;
    log?: SessionLog | null;
    simTimeMs?: number;
    catalog?: VerticalCatalog | null;
  },
): void {
  const routeFixIds = args.routeFixIds ?? DEMO_ONE_NORTH_FIX_IDS;
  const starId = args.sidId ?? args.starId ?? "DEM1";
  if (ac.intent.lateral?.type !== "PROCEDURE") {
    ac.intent.lateral = {
      type: "PROCEDURE",
      starId,
      toFixIndex: 0,
      routeFixIds,
    } satisfies LateralMode;
  }
  const heading = applyLateralFms(ac, dtS, {
    registry: args.registry,
    log: args.log,
    simTimeMs: args.simTimeMs ?? 0,
    catalog: args.catalog,
  });
  stepAircraft(ac, dtS, heading);
}

function guideDirect(
  ac: Aircraft,
  dtS: number,
  fixId: string,
  ctx: LateralFmsContext,
  registry: FixRegistry,
): number {
  const fix = registry.get(fixId);
  if (!fix) {
    return ac.intent.assignedHeadingDeg;
  }
  if (shouldSequenceFlyOver(ac, fix, dtS)) {
    if (holdFixForLocIntercept(ac, fix)) {
      return courseDeg(ac, fix);
    }
    emitDirectSequenced(ac, ctx, fix.id);
    sequenceToPresentHeading(ac);
    return ac.headingDeg;
  }
  return courseDeg(ac, fix);
}

function guideProcedure(
  ac: Aircraft,
  dtS: number,
  lateral: Extract<Aircraft["intent"]["lateral"], { type: "PROCEDURE" }>,
  ctx: LateralFmsContext,
  registry: FixRegistry,
): number {
  if (!lateral) {
    return ac.intent.assignedHeadingDeg;
  }
  const currentId = lateral.routeFixIds[lateral.toFixIndex];
  if (currentId === undefined) {
    if (lateral.starId) {
      emitStarVectors(ac, ctx, lateral.starId);
    }
    sequenceToPresentHeading(ac);
    return ac.headingDeg;
  }
  const current = registry.get(currentId);
  if (!current) {
    return ac.intent.assignedHeadingDeg;
  }
  const nextId = lateral.routeFixIds[lateral.toFixIndex + 1];
  const nextFix = nextId === undefined ? undefined : registry.get(nextId);
  const inbound = courseDeg(ac, current);
  const nextCourse = nextFix === undefined ? ac.headingDeg : courseDeg(current, nextFix);
  const startNm = flyByStartNm(ac.speedKt, courseChangeDeg(inbound, nextCourse));
  const dist = distanceNm(ac, current);
  if (dist > startNm && dist >= flyOverSequenceNm(ac.speedKt, dtS)) {
    return inbound;
  }
  if (nextFix === undefined && holdFixForLocIntercept(ac, current)) {
    return inbound;
  }
  emitDirectSequenced(ac, ctx, current.id);
  if (nextFix !== undefined && nextId !== undefined) {
    ac.intent.lateral = {
      type: "PROCEDURE",
      starId: lateral.starId,
      sidId: lateral.sidId,
      toFixIndex: lateral.toFixIndex + 1,
      routeFixIds: lateral.routeFixIds,
    };
    return nextCourse;
  }
  if (lateral.starId) {
    emitStarVectors(ac, ctx, lateral.starId);
  }
  sequenceToPresentHeading(ac);
  return ac.headingDeg;
}

function shouldSequenceFlyOver(ac: Aircraft, fix: RegisteredFix, dtS: number): boolean {
  const dist = distanceNm(ac, fix);
  if (dist < flyOverSequenceNm(ac.speedKt, dtS)) {
    return true;
  }
  const along = alongTrackNm(ac, fix, ac.headingDeg);
  return along <= 0 && dist < 2;
}

/** Stay on DCT/last STAR fix until loc capture (or the fix is behind). */
function holdFixForLocIntercept(ac: Aircraft, fix: NmPoint): boolean {
  if (!ac.intent.locInterceptApproachId) {
    return false;
  }
  return alongTrackNm(ac, fix, ac.headingDeg) > 0;
}

function sequenceToPresentHeading(ac: Aircraft): void {
  const headingDeg = ac.headingDeg;
  ac.intent.assignedHeadingDeg = headingDeg;
  ac.intent.turn = "SHORTEST";
  const interceptId = ac.intent.locInterceptApproachId;
  if (interceptId) {
    ac.intent.lateral = { type: "INTERCEPT_LOC", approachId: interceptId };
    return;
  }
  ac.intent.lateral = { type: "HEADING", headingDeg };
}

function emitDirectSequenced(ac: Aircraft, ctx: LateralFmsContext, fixId: string): void {
  ctx.log?.append({
    type: "nav.direct.sequenced",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    fixId,
  });
  onFixSequenced(ac, fixId, ctx);
}

function emitStarVectors(ac: Aircraft, ctx: LateralFmsContext, starId: string): void {
  ctx.log?.append({
    type: "nav.star.vectors",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    starId,
  });
  clearViaOnVectors(ac, ctx.catalog);
}

const locBreakoutSinceMs = new WeakMap<Aircraft, number>();

function armedLocApproachId(ac: Aircraft): string | null {
  if (ac.intent.locInterceptApproachId) {
    return ac.intent.locInterceptApproachId;
  }
  const lateral = ac.intent.lateral;
  if (lateral?.type === "INTERCEPT_LOC") {
    return lateral.approachId;
  }
  return null;
}

/** Capture when able; otherwise leave DIRECT / PROCEDURE / heading in force. */
function tryArmedLocCapture(ac: Aircraft, ctx: LateralFmsContext): number | undefined {
  const approachId = armedLocApproachId(ac);
  if (!approachId) {
    return undefined;
  }
  const lateralType = ac.intent.lateral?.type;
  if (lateralType === "LOC" || lateralType === "LANDING" || lateralType === "MISSED") {
    return undefined;
  }
  const axis = ctx.locAxisFor?.(approachId);
  if (!axis) {
    return undefined;
  }
  const deviation = locDeviation({ xNm: ac.xNm, yNm: ac.yNm }, axis);
  const onPublishedPath = lateralType === "DIRECT" || lateralType === "PROCEDURE";
  if (
    !locShouldCapture({
      deviation,
      headingDeg: ac.headingDeg,
      axis,
      requireInterceptHeading: !onPublishedPath,
    })
  ) {
    return undefined;
  }
  locBreakoutSinceMs.delete(ac);
  ac.intent.lateral = { type: "LOC", approachId };
  ac.intent.locInterceptApproachId = null;
  ctx.log?.append({
    type: "nav.loc.captured",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    approachId,
  });
  return axis.courseDeg;
}

const LOC_TRACK_MAX_INTERCEPT_DEG = 12;
const LOC_TRACK_MIN_INTERCEPT_DEG = 2;

/**
 * Predict rate-one lateral travel before rolling out on final. FAA JO 7110.65
 * 5-9-2 constrains controller intercept vectors; this is trainer guidance,
 * not certified autopilot or radio-propagation behavior.
 */
function leadTurnCrossTrackNm(speedKt: number, headingErrorDeg: number): number {
  const omegaRadS = (TURN_RATE_DEG_PER_S * Math.PI) / 180;
  if (!(speedKt > 0) || !(omegaRadS > 0)) return 0;
  const radiusNm = speedKt / 3600 / omegaRadS;
  return radiusNm * (1 - Math.cos((Math.abs(headingErrorDeg) * Math.PI) / 180));
}

/** Keep the assigned vector until its rate-one rollout must begin. */
function guideArmedLoc(
  ac: Aircraft,
  dtS: number,
  approachId: string,
  ctx: LateralFmsContext,
): number {
  const axis = ctx.locAxisFor?.(approachId);
  if (!axis) return ac.intent.assignedHeadingDeg;
  const deviation = locDeviation({ xNm: ac.xNm, yNm: ac.yNm }, axis);
  if (!(deviation.alongTrackNm > 0 && deviation.alongTrackNm < axis.lengthNm)) {
    return ac.intent.assignedHeadingDeg;
  }
  const headingErrorDeg = shortestDeltaDeg(axis.courseDeg, ac.headingDeg);
  // cross-track rate has heading-error sign: negative closes positive/right error.
  const closing = deviation.crossTrackNm * Math.sin((headingErrorDeg * Math.PI) / 180) < 0;
  // Two ticks of margin keeps discrete SIM_DT_S integration from carrying the
  // aircraft across centerline after the predicted continuous rollout.
  const stepNm = (2 * Math.max(0, ac.speedKt) * dtS) / 3600;
  if (
    closing &&
    Math.abs(deviation.crossTrackNm) <= leadTurnCrossTrackNm(ac.speedKt, headingErrorDeg) + stepNm
  ) {
    return axis.courseDeg;
  }
  // A vector that is already moving away from the centerline cannot reach a
  // later lead point. Once inside the retained trainer envelope, begin the
  // same bounded recovery guidance but keep INTERCEPT_LOC until signal capture.
  const envelope = locEnvelope(deviation, axis);
  if (!closing && envelope && !locShouldBreakout(envelope.normalizedError)) {
    return locTrackingHeading(ac, dtS, deviation, axis);
  }
  return ac.intent.assignedHeadingDeg;
}

function locTrackingHeading(
  ac: Aircraft,
  dtS: number,
  deviation: ReturnType<typeof locDeviation>,
  axis: LocAxis,
): number {
  const crossTrack = deviation.crossTrackNm;
  if (Math.abs(crossTrack) < 1e-6) return axis.courseDeg;
  const headingErrorDeg = shortestDeltaDeg(axis.courseDeg, ac.headingDeg);
  const towardCenter = -Math.sign(crossTrack);
  const movingTowardCenter = headingErrorDeg * towardCenter > 0;
  const rolloutLeadNm = leadTurnCrossTrackNm(ac.speedKt, headingErrorDeg);
  const discreteMarginNm = (2 * Math.max(0, ac.speedKt) * dtS) / 3600;
  if (movingTowardCenter && Math.abs(crossTrack) <= rolloutLeadNm + discreteMarginNm) {
    return axis.courseDeg;
  }
  const envelope = locEnvelope(deviation, axis);
  const normalized = Math.abs(envelope?.normalizedError ?? 1);
  const correctionDeg = Math.min(
    LOC_TRACK_MAX_INTERCEPT_DEG,
    Math.max(LOC_TRACK_MIN_INTERCEPT_DEG, normalized * LOC_TRACK_MAX_INTERCEPT_DEG),
  );
  return axis.courseDeg + towardCenter * correctionDeg;
}

function guideLoc(
  ac: Aircraft,
  dtS: number,
  lateral: Extract<Aircraft["intent"]["lateral"], { type: "LOC" }>,
  ctx: LateralFmsContext,
): number {
  if (!lateral) {
    return ac.intent.assignedHeadingDeg;
  }
  const axis = ctx.locAxisFor?.(lateral.approachId);
  if (!axis) {
    return ac.intent.assignedHeadingDeg;
  }
  const deviation = locDeviation({ xNm: ac.xNm, yNm: ac.yNm }, axis);
  const envelope = locEnvelope(deviation, axis);
  if (envelope && locShouldBreakout(envelope.normalizedError)) {
    const since = locBreakoutSinceMs.get(ac) ?? ctx.simTimeMs;
    if (!locBreakoutSinceMs.has(ac)) {
      locBreakoutSinceMs.set(ac, ctx.simTimeMs);
    }
    if (ctx.simTimeMs - since >= LOC_BREAKOUT_S * 1000) {
      locBreakoutSinceMs.delete(ac);
      ac.intent.lateral = { type: "INTERCEPT_LOC", approachId: lateral.approachId };
      ac.intent.locInterceptApproachId = lateral.approachId;
      return ac.intent.assignedHeadingDeg;
    }
  } else {
    locBreakoutSinceMs.delete(ac);
  }
  return locTrackingHeading(ac, dtS, deviation, axis);
}

/** LANDING keeps the loc inbound course. No breakout — they are going to land. */
function guideLanding(
  ac: Aircraft,
  lateral: Extract<Aircraft["intent"]["lateral"], { type: "LANDING" }>,
  ctx: LateralFmsContext,
): number {
  if (!lateral) {
    return ac.intent.assignedHeadingDeg;
  }
  const axis = ctx.locAxisFor?.(lateral.approachId);
  if (!axis) {
    return ac.intent.assignedHeadingDeg;
  }
  locBreakoutSinceMs.delete(ac);
  return axis.courseDeg;
}
