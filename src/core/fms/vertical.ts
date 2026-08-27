/**
 * Vertical / speed FMS for descend-via, climb-via, CROSS (T04-04), and GS (T04-06).
 * Pilot sets VIA_STAR / CROSS / heading-cancel; `stepWorld` calls these helpers each tick.
 * Parser never calls kinematics. GS capture is only after `lateral === LOC` or
 * `LANDING` **and** `clearedApproachId` is set (`APP`). Loc-only intercept
 * (`INTERCEPT_LOCALIZER` / `IL`) tracks the loc at assigned altitude.
 */

import type { Aircraft, CrossConstraint, VerticalMode } from "../aircraft";
import type { SessionLog } from "../events/session-log";
import { CLIMB_RATE_FT_PER_MIN } from "../kinematics";
import {
  GS_CAPTURE_ABOVE_FT,
  GS_CAPTURE_BELOW_FT,
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

export interface CatalogSidLeg {
  fixId: string;
  altConstraint?: AltConstraint;
  speedConstraint?: SpeedConstraint;
}

export interface CatalogSidRunwayTransition {
  runwayId: string;
  legs: readonly CatalogSidLeg[];
}

export interface CatalogSidEnrouteTransition {
  id: string;
  legs?: readonly CatalogSidLeg[];
  runwayTransitions?: ReadonlyArray<CatalogSidRunwayTransition>;
}

export interface CatalogSid {
  id: string;
  name?: string;
  runwayTransitions?: ReadonlyArray<CatalogSidRunwayTransition>;
  common?: readonly CatalogSidLeg[];
  enrouteTransitions?: ReadonlyArray<CatalogSidEnrouteTransition>;
  legs?: readonly CatalogSidLeg[];
  initialClimbFt?: number;
}

export interface VerticalCatalog {
  stars?: ReadonlyArray<CatalogStar>;
  sids?: ReadonlyArray<CatalogSid>;
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
  const isVia =
    (args.vertical.type === "VIA_STAR" || args.vertical.type === "VIA_SID") && args.onStar;
  if (!isVia || !args.nextConstraint) {
    return args.assignedFt ?? 0;
  }
  const isClimbVia =
    args.vertical.type === "VIA_SID" ||
    (args.vertical.type === "VIA_STAR" && args.vertical.sense === "CLIMB");
  if (isClimbVia) {
    if (args.nextConstraint.type === "AT_OR_BELOW") {
      return args.assignedFt !== undefined
        ? Math.min(args.assignedFt, args.nextConstraint.altitudeFt)
        : args.nextConstraint.altitudeFt;
    }
    if (args.nextConstraint.type === "AT_OR_ABOVE") {
      return args.assignedFt !== undefined
        ? Math.max(args.assignedFt, args.nextConstraint.altitudeFt)
        : args.nextConstraint.altitudeFt;
    }
    return args.nextConstraint.altitudeFt;
  }
  return args.nextConstraint.altitudeFt;
}

export function targetSpeedKt(args: {
  assignedKt: number;
  vertical: VerticalMode;
  nextConstraint?: SpeedConstraint;
  onStar: boolean;
}): number {
  const via =
    (args.vertical.type === "VIA_STAR" || args.vertical.type === "VIA_SID") && args.onStar;
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
  const vertical = ac.intent.vertical;
  if (vertical?.type !== "VIA_STAR" && vertical?.type !== "VIA_SID") {
    return undefined;
  }
  const lateral = ac.intent.lateral;
  if (lateral?.type !== "PROCEDURE") {
    return undefined;
  }
  const fixId = lateral.routeFixIds[lateral.toFixIndex];
  if (fixId === undefined) {
    return undefined;
  }
  if (vertical.type === "VIA_SID") {
    const sid = catalog?.sids?.find(
      (item) => item.id.trim().toUpperCase() === vertical.sidId.trim().toUpperCase(),
    );
    const leg = sid ? findSidLeg(sid, fixId) : undefined;
    return { fixId, alt: leg?.altConstraint, speed: leg?.speedConstraint };
  }
  const star = catalog?.stars?.find(
    (item) => item.id.trim().toUpperCase() === vertical.starId.trim().toUpperCase(),
  );
  if (star) {
    const leg = findLeg(star, fixId);
    return { fixId, alt: leg?.altConstraint, speed: leg?.speedConstraint };
  }
  const sid = catalog?.sids?.find(
    (item) => item.id.trim().toUpperCase() === vertical.starId.trim().toUpperCase(),
  );
  const leg = sid ? findSidLeg(sid, fixId) : undefined;
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
 * `APP` / `clearedApproachId` is required. Loc-only `IL` holds assigned altitude.
 * Once established and cleared: hold if below the GS (it comes down to meet
 * them), descend onto it if above, then follow to field elevation. Never climb
 * on GS.
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
  const gsAlt = Math.max(params.fieldElevFt, gsAltitudeFt(alongTrackNm, params));

  if (!ac.intent.clearedApproachId) {
    if (ac.intent.vertical?.type === "GS") {
      ac.intent.vertical = { type: "ASSIGNED" };
    }
    return undefined;
  }

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
  const onSlope =
    ac.altitudeFt >= gsAlt - GS_CAPTURE_BELOW_FT && ac.altitudeFt <= gsAlt + GS_CAPTURE_ABOVE_FT;
  if (
    gsShouldCapture({
      alongTrackNm,
      altFt: ac.altitudeFt,
      gsAltFt: gsAlt,
      wasBelow: gsWasBelow.get(ac) === true,
    }) ||
    (onSlope && alongTrackNm > 0)
  ) {
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

  // Established and cleared but still above the beam: descend onto the GS.
  // Do not climb to meet it (below GS, hold present / assigned until intercept).
  if (alongTrackNm > 0 && ac.altitudeFt > gsAlt + GS_CAPTURE_ABOVE_FT) {
    return followGsAltitudeFt(ac.altitudeFt, gsAlt, params.gsAngleDeg, ac.speedKt, dtS);
  }
  return undefined;
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
  if (ac.intent.vertical?.type !== "VIA_STAR" && ac.intent.vertical?.type !== "VIA_SID") {
    return;
  }
  if (ac.intent.cross) {
    return;
  }
  const last = lastProcedureConstraints(ac, catalog);
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

function findLeg(star: CatalogStar, fixId: string): CatalogStarLeg | undefined {
  const want = fixId.trim().toUpperCase();
  if (star.transitions) {
    for (const transition of star.transitions) {
      const leg = transition.legs.find((item) => item.fixId.trim().toUpperCase() === want);
      if (leg) {
        return leg;
      }
    }
  }
  return star.common?.find((item) => item.fixId.trim().toUpperCase() === want);
}

function findSidLeg(sid: CatalogSid, fixId: string): CatalogSidLeg | undefined {
  const want = fixId.trim().toUpperCase();
  if (sid.legs) {
    const leg = sid.legs.find((item) => item.fixId.trim().toUpperCase() === want);
    if (leg) {
      return leg;
    }
  }
  if (sid.runwayTransitions) {
    for (const rt of sid.runwayTransitions) {
      const leg = rt.legs.find((item) => item.fixId.trim().toUpperCase() === want);
      if (leg) {
        return leg;
      }
    }
  }
  if (sid.common) {
    const leg = sid.common.find((item) => item.fixId.trim().toUpperCase() === want);
    if (leg) {
      return leg;
    }
  }
  if (sid.enrouteTransitions) {
    for (const et of sid.enrouteTransitions) {
      if (et.legs) {
        const leg = et.legs.find((item) => item.fixId.trim().toUpperCase() === want);
        if (leg) {
          return leg;
        }
      }
      if (et.runwayTransitions) {
        for (const rt of et.runwayTransitions) {
          const leg = rt.legs.find((item) => item.fixId.trim().toUpperCase() === want);
          if (leg) {
            return leg;
          }
        }
      }
    }
  }
  return undefined;
}

function lastProcedureConstraints(
  ac: Aircraft,
  catalog?: VerticalCatalog | null,
): { alt?: AltConstraint; speed?: SpeedConstraint } | undefined {
  const vertical = ac.intent.vertical;
  if (vertical?.type !== "VIA_STAR" && vertical?.type !== "VIA_SID") {
    return undefined;
  }
  const lateral = ac.intent.lateral;
  const procedureId = vertical.type === "VIA_SID" ? vertical.sidId : vertical.starId;
  const lastId =
    lateral?.type === "PROCEDURE" ? lateral.routeFixIds[lateral.routeFixIds.length - 1] : undefined;
  if (!lastId) {
    return undefined;
  }
  if (vertical.type === "VIA_SID") {
    const sid = catalog?.sids?.find(
      (item) => item.id.trim().toUpperCase() === procedureId.trim().toUpperCase(),
    );
    if (sid) {
      const leg = findSidLeg(sid, lastId);
      return leg ? { alt: leg.altConstraint, speed: leg.speedConstraint } : undefined;
    }
  }
  const star = catalog?.stars?.find(
    (item) => item.id.trim().toUpperCase() === procedureId.trim().toUpperCase(),
  );
  if (star) {
    const leg = findLeg(star, lastId);
    return leg ? { alt: leg.altConstraint, speed: leg.speedConstraint } : undefined;
  }
  const sid = catalog?.sids?.find(
    (item) => item.id.trim().toUpperCase() === procedureId.trim().toUpperCase(),
  );
  if (sid) {
    const leg = findSidLeg(sid, lastId);
    return leg ? { alt: leg.altConstraint, speed: leg.speedConstraint } : undefined;
  }
  return undefined;
}
