import type { Aircraft, ClassBClearanceState } from "./aircraft";
import { msawFloorFt, type MvaChart } from "./alerts/msaw";
import type { SessionLog } from "./events/session-log";
import type { FixRegistry } from "./nav/fixRegistry";
import {
  isPointInsideAvoidanceVolumes,
  isSafeVfrContinuationAvailable,
  isSegmentUnsafeFromAvoidance,
  isVfrAvoidanceVolume,
  planSafeVfrContinuation,
  type Point3D,
} from "./vfrNavigation";
import type { World } from "./world";
import type { Instruction } from "./command/types";
import type { RegionalFacility, RegionalAirspaceVolume } from "../scenario/regional";

export type ClassBOperation = "THROUGH" | "TO_ENTER" | "OUT_OF";

const ACTUAL_BOUNDARY = { horizontalMarginNm: 0, verticalMarginFt: 0 };

function classBVolumes(regional?: RegionalFacility | null): RegionalAirspaceVolume[] {
  return regional?.airspaces.filter(isVfrAvoidanceVolume) ?? [];
}

export function aircraftInsideClassB(
  aircraft: Aircraft,
  regional?: RegionalFacility | null,
): boolean {
  return isPointInsideAvoidanceVolumes(
    { xNm: aircraft.xNm, yNm: aircraft.yNm, altitudeFt: aircraft.altitudeFt },
    classBVolumes(regional),
  );
}

function routePoints(
  aircraft: Aircraft,
  routeFixIds: readonly string[],
  registry: FixRegistry | null | undefined,
  routeAltitudeFt: number,
): Point3D[] | null {
  const points: Point3D[] = [
    { xNm: aircraft.xNm, yNm: aircraft.yNm, altitudeFt: aircraft.altitudeFt },
  ];
  for (const fixId of routeFixIds) {
    const fix = registry?.get(fixId);
    if (!fix) return null;
    points.push({ xNm: fix.xNm, yNm: fix.yNm, altitudeFt: routeAltitudeFt });
  }
  return points;
}

function routeIntersectsClassB(
  points: readonly Point3D[],
  volumes: readonly RegionalAirspaceVolume[],
): boolean {
  for (let i = 1; i < points.length; i += 1) {
    if (isSegmentUnsafeFromAvoidance(points[i - 1]!, points[i]!, volumes, ACTUAL_BOUNDARY)) {
      return true;
    }
  }
  return false;
}

function pointInsideActualClassB(
  point: Point3D,
  volumes: readonly RegionalAirspaceVolume[],
): boolean {
  return isPointInsideAvoidanceVolumes(point, volumes, ACTUAL_BOUNDARY);
}

export interface ClassBValidationOptions {
  regional?: RegionalFacility | null;
  fixRegistry?: FixRegistry | null;
  mvaChart?: MvaChart | null;
}

export function validateClassBInstruction(
  aircraft: Aircraft,
  instruction: Extract<
    Instruction,
    { type: "CLASS_B_CLEARANCE" | "REMAIN_OUTSIDE_BRAVO" | "RESUME_APPROPRIATE_VFR_ALTITUDES" }
  >,
  options: ClassBValidationOptions,
): { ok: true } | { ok: false; detail: string } {
  if (aircraft.flightRules !== "VFR" || aircraft.activeClearance !== undefined) {
    return { ok: false, detail: "CLEARANCE: VFR aircraft required" };
  }

  const volumes = classBVolumes(options.regional);
  if (instruction.type === "RESUME_APPROPRIATE_VFR_ALTITUDES") {
    return aircraft.classBAltitudeSnapshot
      ? { ok: true }
      : { ok: false, detail: "CLEARANCE: no Class B altitude assignment to resume" };
  }

  if (instruction.type === "REMAIN_OUTSIDE_BRAVO") {
    if (aircraftInsideClassB(aircraft, options.regional)) {
      return { ok: false, detail: "CLEARANCE: aircraft is inside Class B airspace" };
    }
    if (!isSafeVfrContinuationAvailable(aircraft, options.regional)) {
      return { ok: false, detail: "CLEARANCE: unable to remain outside Bravo" };
    }
    return { ok: true };
  }

  const inside = aircraftInsideClassB(aircraft, options.regional);
  if (instruction.operation === "TO_ENTER" && inside) {
    return { ok: false, detail: "CLEARANCE: aircraft is already inside Class B airspace" };
  }
  if (instruction.operation === "OUT_OF" && !inside) {
    return { ok: false, detail: "CLEARANCE: aircraft is not inside Class B airspace" };
  }

  if (instruction.altitudeFt !== undefined) {
    if (!options.mvaChart) {
      return { ok: false, detail: "CLEARANCE: altitude does not meet Class B minimums" };
    }
    const floor = msawFloorFt(aircraft.xNm, aircraft.yNm, options.mvaChart);
    if (!Number.isFinite(instruction.altitudeFt) || instruction.altitudeFt < floor) {
      return { ok: false, detail: "CLEARANCE: altitude does not meet Class B minimums" };
    }
  }

  if (instruction.route === undefined) return { ok: true };
  const points = routePoints(
    aircraft,
    instruction.route.map((leg) => leg.fixId),
    options.fixRegistry,
    instruction.altitudeFt ?? aircraft.altitudeFt,
  );
  if (!points) return { ok: false, detail: "CLEARANCE: route does not satisfy Class B clearance" };
  const intersects = routeIntersectsClassB(points, volumes);
  const endsInside = pointInsideActualClassB(points.at(-1)!, volumes);
  const operationValid =
    instruction.operation === "TO_ENTER" ? intersects || endsInside : intersects && !endsInside;
  return operationValid
    ? { ok: true }
    : { ok: false, detail: "CLEARANCE: route does not satisfy Class B clearance" };
}

function appendClearanceEvent(
  log: SessionLog | null | undefined,
  aircraft: Aircraft,
  simTimeMs: number,
  type: "class_b.clearance.issued" | "class_b.clearance.accepted",
  instruction: Extract<Instruction, { type: "CLASS_B_CLEARANCE" }>,
): void {
  log?.append({
    type,
    atSimMs: simTimeMs,
    atWallMs: 0,
    callsign: aircraft.callsign,
    operation: instruction.operation,
    ...(instruction.route ? { routeFixIds: instruction.route.map((leg) => leg.fixId) } : {}),
    ...(instruction.altitudeFt === undefined ? {} : { altitudeFt: instruction.altitudeFt }),
  });
}

export function applyClassBInstruction(
  aircraft: Aircraft,
  instruction: Extract<
    Instruction,
    { type: "CLASS_B_CLEARANCE" | "REMAIN_OUTSIDE_BRAVO" | "RESUME_APPROPRIATE_VFR_ALTITUDES" }
  >,
  world: World,
  log?: SessionLog | null,
): void {
  if (instruction.type === "RESUME_APPROPRIATE_VFR_ALTITUDES") {
    const snapshot = aircraft.classBAltitudeSnapshot;
    if (!snapshot) return;
    aircraft.intent.assignedAltitudeFt = snapshot.priorVfrAltitudeFt;
    aircraft.intent.controllerAssignedAltitudeFt = undefined;
    aircraft.intent.vertical = { type: "ASSIGNED" };
    aircraft.classBAltitudeSnapshot = undefined;
    if (aircraft.classBClearance) aircraft.classBClearance.altitudeFt = undefined;
    log?.append({
      type: "class_b.altitude.resumed",
      atSimMs: world.simTimeMs,
      atWallMs: 0,
      callsign: aircraft.callsign,
      source: "COMMAND",
      altitudeFt: snapshot.priorVfrAltitudeFt,
    });
    return;
  }

  if (instruction.type === "REMAIN_OUTSIDE_BRAVO") {
    const plan = planSafeVfrContinuation(aircraft, world.regional as RegionalFacility | undefined);
    aircraft.remainOutsideBravo = { issuedAtSimMs: world.simTimeMs, active: true };
    if (plan && aircraft.ambientVfr) {
      aircraft.ambientVfr.waypoints = plan.waypoints;
      aircraft.ambientVfr.waypointIndex = plan.waypointIndex;
    }
    log?.append({
      type: "class_b.clearance.accepted",
      atSimMs: world.simTimeMs,
      atWallMs: 0,
      callsign: aircraft.callsign,
      operation: "REMAIN_OUTSIDE",
    });
    return;
  }

  appendClearanceEvent(log, aircraft, world.simTimeMs, "class_b.clearance.issued", instruction);
  if (instruction.altitudeFt !== undefined) {
    aircraft.classBAltitudeSnapshot = {
      assignedAltitudeFt: instruction.altitudeFt,
      priorVfrAltitudeFt: aircraft.intent.assignedAltitudeFt,
    };
    aircraft.intent.assignedAltitudeFt = instruction.altitudeFt;
    aircraft.intent.controllerAssignedAltitudeFt = instruction.altitudeFt;
  }
  const routeFixIds = instruction.route?.map((leg) => leg.fixId);
  aircraft.classBClearance = {
    operation: instruction.operation,
    ...(routeFixIds ? { routeFixIds } : {}),
    routeMode: routeFixIds ? "CATALOG_ROUTE" : "OWN_NAVIGATION",
    ...(instruction.altitudeFt === undefined ? {} : { altitudeFt: instruction.altitudeFt }),
    issuedAtSimMs: world.simTimeMs,
    routeIndex: 0,
    active: true,
  } satisfies ClassBClearanceState;
  aircraft.remainOutsideBravo = undefined;
  if (routeFixIds && routeFixIds.length > 0) {
    aircraft.intent.lateral = { type: "PROCEDURE", toFixIndex: 0, routeFixIds };
  }
  appendClearanceEvent(log, aircraft, world.simTimeMs, "class_b.clearance.accepted", instruction);
}

export function handleClassBBoundary(
  world: World,
  aircraft: Aircraft,
  wasInside: boolean,
  isInside: boolean,
): void {
  if (!wasInside && isInside && aircraft.classBClearance?.active) {
    world.sessionLog?.append({
      type: "class_b.entered",
      atSimMs: world.simTimeMs,
      atWallMs: 0,
      callsign: aircraft.callsign,
      operation: aircraft.classBClearance.operation,
    });
  }
  if (!wasInside || isInside) return;
  const name = (world.regional as RegionalFacility | undefined)?.facilityName ?? "BRAVO";
  world.sessionLog?.append({
    type: "class_b.exited",
    atSimMs: world.simTimeMs,
    atWallMs: 0,
    callsign: aircraft.callsign,
    ...(aircraft.classBClearance ? { operation: aircraft.classBClearance.operation } : {}),
    notification: `LEAVING ${name} BRAVO AIRSPACE`,
  });
  if (aircraft.classBAltitudeSnapshot) {
    const prior = aircraft.classBAltitudeSnapshot.priorVfrAltitudeFt;
    aircraft.intent.assignedAltitudeFt = prior;
    aircraft.intent.controllerAssignedAltitudeFt = undefined;
    aircraft.intent.vertical = { type: "ASSIGNED" };
    aircraft.classBAltitudeSnapshot = undefined;
    if (aircraft.classBClearance) aircraft.classBClearance.altitudeFt = undefined;
    world.sessionLog?.append({
      type: "class_b.altitude.resumed",
      atSimMs: world.simTimeMs,
      atWallMs: 0,
      callsign: aircraft.callsign,
      source: "EXIT",
      altitudeFt: prior,
    });
  }
  if (aircraft.classBClearance) {
    aircraft.classBClearance.active = false;
  }
}
