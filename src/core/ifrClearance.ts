import type { Aircraft } from "./aircraft";
import type { Instruction } from "./command/types";
import type { FiledRouteCatalog } from "./filedRoute";
import { validateFlightPlanRouteTransaction } from "./filedRoute";
import type { FlightPlan, FlightPlanRoute } from "./flightPlan";
import { isValidBeaconCode } from "./flightPlan";
import { applyActiveRouteToAircraft, type RouteExecutionAccess } from "./fms/routeExecution";
import type { SessionLog } from "./events/session-log";

export type IfrClearanceAccess =
  "AS_FILED" | "DIRECT" | "FIX_THEN_DIRECT" | "RADAR_VECTORS" | "SID";

export type IfrClearanceErrorCode =
  | "PLAN_NOT_FOUND"
  | "NO_AIRCRAFT"
  | "UNABLE_ROUTE"
  | "UNABLE_CLEARANCE"
  | "INVALID_ALTITUDE"
  | "INVALID_FREQUENCY"
  | "INVALID_SQUAWK"
  | "INVALID_CLIMB_VIA";

export interface IfrClearanceError {
  code: IfrClearanceErrorCode;
  message: string;
}

export type IfrClearanceResult =
  | { ok: true; plan: FlightPlan; aircraft: Aircraft; route: FlightPlanRoute }
  | { ok: false; error: IfrClearanceError };

export interface IfrClearanceWorld {
  simTimeMs: number;
  flightPlans: FlightPlan[];
  aircraft: Aircraft[];
  catalog?: FiledRouteCatalog | null;
  fixRegistry?: { has(id: string): boolean } | null;
  sessionLog?: SessionLog | null;
}

const ALTITUDE_MIN_FT = 1000;
const ALTITUDE_MAX_FT = 18000;
const FREQUENCY = /^\d{3}(?:\.\d{1,3})?$/;

function error(code: IfrClearanceErrorCode, message: string): IfrClearanceResult {
  return { ok: false, error: { code, message } };
}

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

function routeTextFor(
  clearance: Extract<Instruction, { type: "IFR_CLEARANCE" }>,
): { input: { source: "AS_FILED" } } | { input: { routeText: string } } {
  switch (clearance.access.type) {
    case "AS_FILED":
      return { input: { source: "AS_FILED" } };
    case "DIRECT":
    case "RADAR_VECTORS":
      return { input: { routeText: clearance.limitId } };
    case "FIX_THEN_DIRECT":
      return { input: { routeText: `${clearance.access.fixId} ${clearance.limitId}` } };
    case "SID":
      return {
        input: {
          routeText: `${clearance.access.procedureId}${clearance.access.transitionId ? `/${clearance.access.transitionId}` : ""} ${clearance.limitId}`,
        },
      };
    default: {
      const _exhaustive: never = clearance.access;
      return _exhaustive;
    }
  }
}

function limitKnown(
  limitId: string,
  catalog: FiledRouteCatalog | null | undefined,
  existingRoute: boolean,
): boolean {
  if (existingRoute && !catalog) return true;
  if (!catalog) return false;
  const want = normalize(limitId);
  return (
    want === normalize((catalog as FiledRouteCatalog & { airportId?: string }).airportId ?? "") ||
    catalog.fixes.some((item) => normalize(item.id) === want) ||
    catalog.navaids.some((item) => normalize(item.id) === want)
  );
}

/**
 * Compile and commit one IFR clearance. Every route and optional field is
 * checked before the mutable plan/aircraft transaction begins.
 */
export function applyIfrClearance(
  world: IfrClearanceWorld,
  aircraft: Aircraft,
  clearance: Extract<Instruction, { type: "IFR_CLEARANCE" }>,
  atWallMs = 0,
  log?: SessionLog | null,
): IfrClearanceResult {
  const plan = world.flightPlans.find(
    (item) => item.status !== "deleted" && normalize(item.acid) === normalize(aircraft.callsign),
  );
  if (!plan)
    return error("PLAN_NOT_FOUND", `unable route: no flight plan for ${aircraft.callsign}`);
  const limitId = normalize(clearance.limitId);
  if (!limitId || !limitKnown(limitId, world.catalog, Boolean(plan.routeRecord?.route))) {
    return error("UNABLE_ROUTE", `unable route: unknown clearance limit ${limitId || ""}`);
  }
  if (clearance.altitudeFt !== undefined) {
    if (
      !Number.isInteger(clearance.altitudeFt) ||
      clearance.altitudeFt % 100 !== 0 ||
      clearance.altitudeFt < ALTITUDE_MIN_FT ||
      clearance.altitudeFt > ALTITUDE_MAX_FT
    ) {
      return error("INVALID_ALTITUDE", "unable clearance: invalid altitude");
    }
  }
  if (clearance.frequency !== undefined && !FREQUENCY.test(clearance.frequency.trim())) {
    return error("INVALID_FREQUENCY", "unable clearance: invalid frequency");
  }
  if (clearance.squawk !== undefined && !isValidBeaconCode(clearance.squawk)) {
    return error("INVALID_SQUAWK", "unable clearance: invalid beacon code");
  }
  if (clearance.climbVia && clearance.access.type !== "SID") {
    return error("INVALID_CLIMB_VIA", "unable clearance: CVIA requires a SID route");
  }

  const routeInput = routeTextFor({ ...clearance, limitId });
  const compiled = validateFlightPlanRouteTransaction(
    plan,
    { ...routeInput.input, lifecycle: "active", nextIndex: 0 },
    world.catalog,
  );
  if (!compiled.ok) {
    return error("UNABLE_ROUTE", compiled.error.message);
  }
  const route = compiled.route;
  const routeIds = route.route.segments.flatMap((segment) => segment.fixIds);
  if (
    routeIds.length === 0 ||
    (world.fixRegistry && routeIds.some((id) => !world.fixRegistry!.has(id)))
  ) {
    return error("UNABLE_ROUTE", "unable route: route fix is unavailable");
  }
  const matchingAircraft = world.aircraft.find((item) => item.id === aircraft.id);
  if (!matchingAircraft) return error("NO_AIRCRAFT", `no aircraft for flight plan ${plan.acid}`);

  // All checks are complete. Route and plan compatibility projections update
  // together, then the same route is applied to the aircraft exactly once.
  const access: RouteExecutionAccess =
    clearance.access.type === "RADAR_VECTORS" ? "RADAR_VECTORS" : "ROUTE";
  Object.assign(plan, {
    routeRecord: route,
    filedRoute: route.route,
    route: route.route.text,
  });
  Object.assign(plan, {
    clearanceLimit: limitId,
    clearanceAccess: clearance.access.type,
    ...(clearance.frequency === undefined
      ? { clearanceFrequency: undefined }
      : { clearanceFrequency: clearance.frequency.trim() }),
    ...(clearance.climbVia === undefined
      ? { clearanceClimbVia: undefined }
      : { clearanceClimbVia: clearance.climbVia }),
  });
  if (clearance.altitudeFt !== undefined) {
    plan.assignedAltitudeFt = clearance.altitudeFt;
    aircraft.intent.assignedAltitudeFt = clearance.altitudeFt;
    aircraft.intent.controllerAssignedAltitudeFt = clearance.altitudeFt;
  }
  if (clearance.squawk !== undefined) {
    aircraft.assignedSquawk = clearance.squawk;
    plan.assignedBeacon = clearance.squawk;
    aircraft.pendingReportedSquawk = {
      code: clearance.squawk,
      dueSimMs: world.simTimeMs + 1000,
    };
  }
  aircraft.clearanceLimit = limitId;
  aircraft.clearanceAccess = clearance.access.type;
  aircraft.clearanceFrequency = clearance.frequency?.trim();
  if (clearance.climbVia && clearance.access.type === "SID") {
    aircraft.intent.vertical = { type: "VIA_SID", sidId: clearance.access.procedureId };
  } else if (
    aircraft.intent.vertical?.type === "VIA_SID" ||
    aircraft.intent.vertical?.type === "VIA_STAR"
  ) {
    aircraft.intent.vertical = { type: "ASSIGNED" };
  }
  applyActiveRouteToAircraft(aircraft, route, access);
  (log ?? world.sessionLog)?.append({
    type: "clearance.ifr.issued",
    atSimMs: world.simTimeMs,
    atWallMs,
    callsign: aircraft.callsign,
    limitId,
    access: clearance.access.type,
    routeRevision: route.revision,
    routeText: route.route.text,
  });
  return { ok: true, plan, aircraft, route };
}
