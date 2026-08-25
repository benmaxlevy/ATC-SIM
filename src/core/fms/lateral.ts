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
  LOC_INTERCEPT_HEADING_MAX_DEG,
  locDeviation,
  locShouldBreakout,
  locShouldCapture,
} from "../nav/localizer";
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
    return ac.intent.assignedHeadingDeg;
  }
  if (lateral.type === "LOC") {
    return guideLoc(ac, lateral, ctx);
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
  // Steep DIRECT/STAR joins would fly through the beam during a rate-one
  // turn onto inbound; snap heading so loc-guided track starts on course.
  if (
    onPublishedPath &&
    courseChangeDeg(ac.headingDeg, axis.courseDeg) > LOC_INTERCEPT_HEADING_MAX_DEG
  ) {
    ac.headingDeg = axis.courseDeg;
    ac.intent.assignedHeadingDeg = axis.courseDeg;
    ac.intent.turn = "SHORTEST";
  }
  ctx.log?.append({
    type: "nav.loc.captured",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    approachId,
  });
  return axis.courseDeg;
}

function guideLoc(
  ac: Aircraft,
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
  if (locShouldBreakout(deviation.deviationDeg)) {
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
  return axis.courseDeg;
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
