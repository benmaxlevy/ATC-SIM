/**
 * Vertical / speed FMS for descend-via, climb-via, CROSS (T04-04), and GS (T04-06).
 * Pilot sets VIA_STAR / CROSS / heading-cancel; `stepWorld` calls these helpers each tick.
 * Parser never calls kinematics. GS capture is only after `lateral === LOC` or
 * `LANDING` (tower stub keeps the glidepath).
 */

import type { Aircraft, CrossConstraint, VerticalMode } from "../aircraft";
import type { SessionLog } from "../events/session-log";
import { CLIMB_RATE_FT_PER_MIN } from "../kinematics";
import {
  GS_WAS_BELOW_FT,
  gsAltitudeFt,
  gsGeometricVsFpm,
  gsShouldCapture,
  gsShouldDropCapture,
  type GsParams,
} from "../nav/glidepath";
import { locDeviation, type LocAxis } from "../nav/localizer";

export type AltConstraint =
  | { type: "AT"; altitudeFt: number }
  | { type: "AT_OR_ABOVE"; altitudeFt: number }
  | { type: "AT_OR_BELOW"; altitudeFt: number };

export type SpeedConstraint =
  | { type: "AT"; speedKt: number }
  | { type: "AT_OR_ABOVE"; speedKt: number }
  | { type: "AT_OR_BELOW"; speedKt: number };

export interface CatalogStarLeg {
  fixId: string;
  altConstraint?: AltConstraint;
  speedConstraint?: SpeedConstraint;
}

export interface CatalogStar {
  id: string;
  name?: string;
  transitions?: ReadonlyArray<{ id: string; legs: readonly CatalogStarLeg[] }>;
  common?: readonly CatalogStarLeg[];
}

export interface VerticalCatalog {
  stars?: ReadonlyArray<CatalogStar>;
}

export interface VerticalFmsContext {
  catalog?: VerticalCatalog | null;
  log?: SessionLog | null;
  simTimeMs: number;
}

export interface GlidepathFmsContext {
  locAxisFor?: (approachId: string) => LocAxis | undefined;
  gsParamsFor?: (approachId: string) => GsParams | undefined;
  log?: SessionLog | null;
  simTimeMs: number;
}

/** True after a tick with `alt < gsAlt - 20` while established on loc. */
const gsWasBelow = new WeakMap<Aircraft, boolean>();

export function isOnCourseToFix(ac: Aircraft, fixId: string): boolean {
  const lateral = ac.intent.lateral;
  if (!lateral) {
    return false;
  }
  if (lateral.type === "DIRECT") {
    return lateral.fixId === fixId;
  }
  if (lateral.type === "PROCEDURE") {
    return lateral.routeFixIds.slice(lateral.toFixIndex).includes(fixId);
  }
  return false;
}

/**
 * v1: while VIA is armed, the next unpassed constraint *is* the clearance.
 * Assigned altitude is a floor/ceiling only after VECTORS (or if never VIA).
 */
export function targetAltitudeFt(args: {
  assignedFt: number | undefined;
  vertical: VerticalMode;
  nextConstraint?: AltConstraint;
  onStar: boolean;
  cross?: CrossConstraint;
}): number {
  if (args.cross) {
    return args.cross.altitudeFt;
  }
  if (args.vertical.type === "MISSED_CLIMB") {
    return args.vertical.altitudeFt;
  }
  const via = args.vertical.type === "VIA_STAR" && args.onStar;
  if (!via || !args.nextConstraint) {
    return args.assignedFt ?? 0;
  }
  return args.nextConstraint.altitudeFt;
}

export function targetSpeedKt(args: {
  assignedKt: number;
  vertical: VerticalMode;
  nextConstraint?: SpeedConstraint;
  onStar: boolean;
}): number {
  const via = args.vertical.type === "VIA_STAR" && args.onStar;
  if (!via || !args.nextConstraint) {
    return args.assignedKt;
  }
  if (args.nextConstraint.type === "AT_OR_BELOW" || args.nextConstraint.type === "AT") {
    return Math.min(args.assignedKt, args.nextConstraint.speedKt);
  }
  return args.assignedKt;
}

export function nextUnpassedConstraints(
  ac: Aircraft,
  catalog?: VerticalCatalog | null,
): { fixId: string; alt?: AltConstraint; speed?: SpeedConstraint } | undefined {
  const cross = ac.intent.cross;
  if (cross && isOnCourseToFix(ac, cross.fixId)) {
    const current = currentProcedureFixId(ac);
    if (!current || current === cross.fixId) {
      return {
        fixId: cross.fixId,
        alt: { type: cross.restriction, altitudeFt: cross.altitudeFt },
      };
    }
  }
  if (ac.intent.vertical?.type !== "VIA_STAR") {
    return undefined;
  }
  const via = ac.intent.vertical;
  const lateral = ac.intent.lateral;
  if (lateral?.type !== "PROCEDURE") {
    return undefined;
  }
  const fixId = lateral.routeFixIds[lateral.toFixIndex];
  if (fixId === undefined) {
    return undefined;
  }
  const star = catalog?.stars?.find((item) => item.id === via.starId);
  const leg = star ? findLeg(star, fixId) : undefined;
  return { fixId, alt: leg?.altConstraint, speed: leg?.speedConstraint };
}

export function applyVerticalFms(
  ac: Aircraft,
  catalog?: VerticalCatalog | null,
): { altitudeFt: number; speedKt: number } {
  const next = nextUnpassedConstraints(ac, catalog);
  const onStar = ac.intent.lateral?.type === "PROCEDURE";
  const crossForFix =
    ac.intent.cross && next?.fixId === ac.intent.cross.fixId ? ac.intent.cross : undefined;
  const vertical = ac.intent.vertical ?? { type: "ASSIGNED" };
  return {
    altitudeFt: targetAltitudeFt({
      assignedFt: ac.intent.assignedAltitudeFt,
      vertical,
      nextConstraint: next?.alt,
      onStar,
      cross: crossForFix,
    }),
    speedKt: targetSpeedKt({
      assignedKt: ac.intent.assignedSpeedKt,
      vertical,
      nextConstraint: next?.speed,
      onStar,
    }),
  };
}

/**
 * GS after loc only (7110.65: do not start GS before established).
 * Returns a commanded altitude while `vertical === GS`; otherwise undefined
 * so STAR/assigned vertical FMS stays in charge. Never climbs on GS.
 */
export function applyGlidepathFms(
  ac: Aircraft,
  dtS: number,
  ctx: GlidepathFmsContext,
): number | undefined {
  const lateral = ac.intent.lateral;
  if (lateral?.type !== "LOC" && lateral?.type !== "LANDING") {
    gsWasBelow.delete(ac);
    if (ac.intent.vertical?.type === "GS") {
      ac.intent.vertical = { type: "ASSIGNED" };
    }
    return undefined;
  }

  const axis = ctx.locAxisFor?.(lateral.approachId);
  const params = ctx.gsParamsFor?.(lateral.approachId);
  if (!axis || !params) {
    return ac.intent.vertical?.type === "GS" ? ac.altitudeFt : undefined;
  }

  const alongTrackNm = locDeviation({ xNm: ac.xNm, yNm: ac.yNm }, axis).alongTrackNm;
  const gsAlt = gsAltitudeFt(alongTrackNm, params);

  if (ac.intent.vertical?.type === "GS") {
    if (gsShouldDropCapture(ac.altitudeFt, gsAlt)) {
      gsWasBelow.delete(ac);
      ac.intent.vertical = { type: "ASSIGNED" };
      return undefined;
    }
    return followGsAltitudeFt(ac.altitudeFt, gsAlt, params.gsAngleDeg, ac.speedKt, dtS);
  }

  if (ac.altitudeFt < gsAlt - GS_WAS_BELOW_FT) {
    gsWasBelow.set(ac, true);
  }
  if (
    !gsShouldCapture({
      alongTrackNm,
      altFt: ac.altitudeFt,
      gsAltFt: gsAlt,
      wasBelow: gsWasBelow.get(ac) === true,
    })
  ) {
    return undefined;
  }

  gsWasBelow.delete(ac);
  ac.intent.vertical = { type: "GS", approachId: lateral.approachId };
  ctx.log?.append({
    type: "nav.gs.captured",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    approachId: lateral.approachId,
  });
  return followGsAltitudeFt(ac.altitudeFt, gsAlt, params.gsAngleDeg, ac.speedKt, dtS);
}

/** Geometric GS rate; extra VS only to recapture from slightly above. Never climb. */
function followGsAltitudeFt(
  currentAltFt: number,
  gsAltFt: number,
  gsAngleDeg: number,
  groundSpeedKt: number,
  dtS: number,
): number {
  if (gsAltFt >= currentAltFt) {
    return currentAltFt;
  }
  const geoVs = Math.abs(gsGeometricVsFpm(gsAngleDeg, groundSpeedKt));
  const vsFpm = currentAltFt - gsAltFt > 20 ? Math.min(CLIMB_RATE_FT_PER_MIN, geoVs * 1.5) : geoVs;
  const maxDownFt = (vsFpm / 60) * dtS;
  return Math.max(gsAltFt, currentAltFt - maxDownFt);
}

/** Call while lateral is still PROCEDURE, before rolling out to heading. */
export function clearViaOnVectors(ac: Aircraft, catalog?: VerticalCatalog | null): void {
  if (ac.intent.vertical?.type !== "VIA_STAR") {
    return;
  }
  if (ac.intent.cross) {
    return;
  }
  const last = lastStarConstraints(ac, catalog);
  if (last?.alt) {
    ac.intent.assignedAltitudeFt = last.alt.altitudeFt;
  }
  if (last?.speed) {
    ac.intent.assignedSpeedKt = last.speed.speedKt;
  }
  ac.intent.vertical = { type: "ASSIGNED" };
}

export function onFixSequenced(
  ac: Aircraft,
  fixId: string,
  ctx: { log?: SessionLog | null; simTimeMs: number },
): void {
  if (ac.intent.cross?.fixId !== fixId) {
    return;
  }
  ctx.log?.append({
    type: "nav.constraint.met",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    fixId,
  });
  ac.intent.cross = undefined;
}

function currentProcedureFixId(ac: Aircraft): string | undefined {
  const lateral = ac.intent.lateral;
  if (lateral?.type !== "PROCEDURE") {
    return undefined;
  }
  return lateral.routeFixIds[lateral.toFixIndex];
}

function starLegs(star: CatalogStar): CatalogStarLeg[] {
  const legs: CatalogStarLeg[] = [];
  for (const transition of star.transitions ?? []) {
    legs.push(...transition.legs);
  }
  if (star.common) {
    legs.push(...star.common);
  }
  return legs;
}

function findLeg(star: CatalogStar, fixId: string): CatalogStarLeg | undefined {
  return starLegs(star).find((leg) => leg.fixId === fixId);
}

function lastStarConstraints(
  ac: Aircraft,
  catalog?: VerticalCatalog | null,
): { alt?: AltConstraint; speed?: SpeedConstraint } | undefined {
  const vertical = ac.intent.vertical;
  if (vertical?.type !== "VIA_STAR") {
    return undefined;
  }
  const star = catalog?.stars?.find((item) => item.id === vertical.starId);
  if (!star) {
    return undefined;
  }
  const lateral = ac.intent.lateral;
  const lastId =
    lateral?.type === "PROCEDURE"
      ? lateral.routeFixIds[lateral.routeFixIds.length - 1]
      : star.common?.[star.common.length - 1]?.fixId;
  if (!lastId) {
    return undefined;
  }
  const leg = findLeg(star, lastId);
  return leg ? { alt: leg.altConstraint, speed: leg.speedConstraint } : undefined;
}
