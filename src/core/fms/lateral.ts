/**
 * Lateral FMS: DIRECT fly-over and PROCEDURE fly-by (T04-03).
 *
 * Command heading = course to the active fix until sequence. Pilot owns Command
 * apply; this module sequences `lateral` when the aircraft reaches the fix.
 * Positions come from `FixRegistry` — no hard-coded lat/lon.
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
} from "../nav/geometry";
import { clearViaOnVectors, onFixSequenced, type VerticalCatalog } from "./vertical";

/** DEMO ONE north transition then MERGE (ids only; xy from the registry). */
export const DEMO_ONE_NORTH_FIX_IDS = ["NEMAX", "NELBO", "NJOIN", "MERGE"] as const;

export interface LateralFmsContext {
  registry: FixRegistry | null | undefined;
  log?: SessionLog | null;
  simTimeMs: number;
  catalog?: VerticalCatalog | null;
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
  const lateral = ac.intent.lateral;
  const registry = ctx.registry;
  if (!lateral || !registry) {
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
    log?: SessionLog | null;
    simTimeMs?: number;
    catalog?: VerticalCatalog | null;
  },
): void {
  const routeFixIds = args.routeFixIds ?? DEMO_ONE_NORTH_FIX_IDS;
  const starId = args.starId ?? "DEM1";
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
    emitStarVectors(ac, ctx, lateral.starId);
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
  emitDirectSequenced(ac, ctx, current.id);
  if (nextFix !== undefined && nextId !== undefined) {
    ac.intent.lateral = {
      type: "PROCEDURE",
      starId: lateral.starId,
      toFixIndex: lateral.toFixIndex + 1,
      routeFixIds: lateral.routeFixIds,
    };
    return nextCourse;
  }
  emitStarVectors(ac, ctx, lateral.starId);
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

function sequenceToPresentHeading(ac: Aircraft): void {
  const headingDeg = ac.headingDeg;
  ac.intent.assignedHeadingDeg = headingDeg;
  ac.intent.turn = "SHORTEST";
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
