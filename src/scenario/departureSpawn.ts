/**
 * Analog: JO 7110.65 Chapter 3 Section 9 / Chapter 5 Section 8 (Radar Departures).
 * Departure spawning along runway centerline with armed SID route / climb-via intent.
 */

import {
  createAircraft,
  normalizeHeadingDeg,
  offerDepartureHandoff,
  type Aircraft,
  type Intent,
  type World,
} from "@core";
import type { ProcedureCatalog } from "./procedures/types";
import { findSidProcedure, sidRouteFixIds } from "./procedures/sidHelpers";

/** Distance past the threshold along runway centerline for rolling departure spawn. */
export const DEPARTURE_SPAWN_ROLL_OFFSET_NM = 0.8;
/** Default altitude MSL for initial departure spawn. */
export const DEPARTURE_SPAWN_ALTITUDE_FT = 700;
/** Default indicated airspeed in knots for initial departure spawn. */
export const DEPARTURE_SPAWN_SPEED_KT = 180;
/** Default fallback assigned top altitude if neither specified nor in SID. */
export const DEFAULT_DEPARTURE_ALTITUDE_FT = 5000;

export interface DepartureSpawnPose {
  xNm: number;
  yNm: number;
  headingDeg: number;
  altitudeFt: number;
  speedKt: number;
  routeFixIds: string[];
  toFixIndex: 0;
  assignedAltitudeFt: number;
  sidId: string;
  runwayId: string;
  transitionId?: string;
  intent: Intent;
}

export interface DepartureSpawnConfig {
  callsign: string;
  runwayId: string;
  sidId: string;
  transitionId?: string;
  assignedAltitudeFt?: number;
  aircraftType?: string;
}

function resolveRunwayThreshold(
  catalog: ProcedureCatalog,
  runwayId: string,
): { xNm: number; yNm: number } {
  const cleanId = runwayId.replace(/^RW/i, "").trim().toUpperCase();
  const fix =
    catalog.fixes.find(
      (f) =>
        f.id.toUpperCase() === `RW${cleanId}` ||
        f.id.toUpperCase() === cleanId ||
        f.id.toUpperCase() === runwayId.toUpperCase(),
    ) ?? catalog.fixes.find((f) => f.kind === "THRESHOLD" && f.id.toUpperCase().includes(cleanId));
  if (fix) {
    return { xNm: fix.xNm, yNm: fix.yNm };
  }
  return { xNm: 0, yNm: 0 };
}

function resolveRunwayHeading(catalog: ProcedureCatalog, sidId: string, runwayId: string): number {
  const sid = findSidProcedure(catalog, sidId);
  const cleanId = runwayId.replace(/^RW/i, "").trim().toUpperCase();
  const rt = sid.runwayTransitions?.find(
    (item) => item.runwayId.replace(/^RW/i, "").trim().toUpperCase() === cleanId,
  );
  if (rt?.initialHeadingDeg !== undefined) {
    return normalizeHeadingDeg(rt.initialHeadingDeg);
  }
  const approach = catalog.approaches.find(
    (app) => app.runway.replace(/^RW/i, "").trim().toUpperCase() === cleanId,
  );
  if (approach?.courseDeg !== undefined) {
    return normalizeHeadingDeg(approach.courseDeg);
  }
  const numeric = parseInt(cleanId.replace(/\D/g, ""), 10);
  if (!Number.isNaN(numeric)) {
    return normalizeHeadingDeg(numeric * 10);
  }
  return 0;
}

/**
 * Calculate the departure spawn pose along runway centerline,
 * initializing armed SID procedure lateral intent and climb-via vertical intent.
 */
export function departureSpawnPose(
  catalog: ProcedureCatalog,
  runwayId: string,
  sidId: string,
  transitionId?: string,
  assignedAltFt?: number,
): DepartureSpawnPose {
  const sid = findSidProcedure(catalog, sidId);
  const threshold = resolveRunwayThreshold(catalog, runwayId);
  const headingDeg = resolveRunwayHeading(catalog, sidId, runwayId);
  const headingRad = (headingDeg * Math.PI) / 180;

  const xNm = threshold.xNm + DEPARTURE_SPAWN_ROLL_OFFSET_NM * Math.sin(headingRad);
  const yNm = threshold.yNm + DEPARTURE_SPAWN_ROLL_OFFSET_NM * Math.cos(headingRad);

  const routeFixIds = sidRouteFixIds(catalog, sidId, runwayId, transitionId);
  const targetAltFt =
    assignedAltFt !== undefined
      ? assignedAltFt
      : (sid.initialClimbFt ?? DEFAULT_DEPARTURE_ALTITUDE_FT);

  const intent: Intent = {
    assignedHeadingDeg: headingDeg,
    turn: "SHORTEST",
    assignedAltitudeFt: targetAltFt,
    assignedSpeedKt: DEPARTURE_SPAWN_SPEED_KT,
    expectedApproachId: null,
    clearedApproachId: null,
    locInterceptApproachId: null,
    lateral: {
      type: "PROCEDURE",
      sidId,
      starId: sidId,
      toFixIndex: 0,
      routeFixIds,
    },
    vertical: {
      type: "VIA_SID",
      sidId,
    },
  };

  return {
    xNm,
    yNm,
    headingDeg,
    altitudeFt: DEPARTURE_SPAWN_ALTITUDE_FT,
    speedKt: DEPARTURE_SPAWN_SPEED_KT,
    routeFixIds,
    toFixIndex: 0,
    assignedAltitudeFt: targetAltFt,
    sidId,
    runwayId,
    transitionId,
    intent,
  };
}

/**
 * Instantiate a departure aircraft and place it into the world with initial
 * departure handoff state offered from Local Control / Tower.
 */
export function spawnDeparture(
  world: World,
  config: DepartureSpawnConfig,
  catalog?: ProcedureCatalog,
): Aircraft {
  const cat = catalog ?? (world.catalog as unknown as ProcedureCatalog);
  if (!cat) {
    throw new Error("No procedure catalog available to spawn departure");
  }
  const pose = departureSpawnPose(
    cat,
    config.runwayId,
    config.sidId,
    config.transitionId,
    config.assignedAltitudeFt,
  );
  const ac = createAircraft({
    callsign: config.callsign,
    xNm: pose.xNm,
    yNm: pose.yNm,
    headingDeg: pose.headingDeg,
    altitudeFt: pose.altitudeFt,
    speedKt: pose.speedKt,
    aircraftType: config.aircraftType ?? "B738",
  });
  ac.intent = pose.intent;
  world.aircraft.push(ac);
  offerDepartureHandoff(world, ac, "TWR", {
    runwayId: config.runwayId,
    sidId: config.sidId,
  });
  return ac;
}
