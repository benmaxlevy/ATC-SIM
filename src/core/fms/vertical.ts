/**
 * Vertical / speed FMS for descend-via, climb-via, and CROSS (T04-04).
 * Pilot sets VIA_STAR / CROSS; `stepWorld` calls these helpers each tick.
 * Parser never calls kinematics. Loc/GS is T04-05/06.
 */

import type { Aircraft, CrossConstraint, VerticalMode } from "../aircraft";
import type { SessionLog } from "../events/session-log";

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
