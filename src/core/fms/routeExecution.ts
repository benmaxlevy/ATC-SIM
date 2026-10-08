/**
 * Generic execution bridge from the one cleared-route record to aircraft
 * lateral intent.  Clearance parsing/application lives in a later ticket;
 * this module only starts an already-active route or leaves it vector-pending.
 */

import type { Aircraft, LateralMode } from "../aircraft";
import { isFlightPlanOperational, type FlightPlan, type FlightPlanRoute } from "../flightPlan";

export type RouteExecutionAccess = "ROUTE" | "RADAR_VECTORS";

export type RouteExecutionErrorCode =
  "PLAN_NOT_FOUND" | "NO_AIRCRAFT" | "ROUTE_NOT_ACTIVE" | "UNABLE_ROUTE";

export interface RouteExecutionError {
  code: RouteExecutionErrorCode;
  message: string;
}

export type RouteExecutionResult =
  | { ok: true; plan: FlightPlan; aircraft: Aircraft; route: FlightPlanRoute }
  | { ok: false; error: RouteExecutionError };

interface RouteExecutionWorld {
  aircraft: Aircraft[];
  flightPlans: FlightPlan[];
  fixRegistry?: { has(id: string): boolean } | null;
  catalog?: { airportId?: string } | null;
}

function routeFixIds(route: FlightPlanRoute): string[] {
  return route.route.segments.flatMap((segment) => segment.fixIds);
}

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

function routeHasUnavailableFix(
  route: FlightPlanRoute,
  world: RouteExecutionWorld,
  allowAirport: boolean,
): boolean {
  const airportId = normalized(world.catalog?.airportId ?? "");
  return Boolean(
    world.fixRegistry &&
    routeFixIds(route).some(
      (id) => !world.fixRegistry!.has(id) && !(allowAirport && normalized(id) === airportId),
    ),
  );
}

function routeLateral(
  route: FlightPlanRoute,
  access: RouteExecutionAccess,
  holdHeadingDeg: number,
): LateralMode {
  const fixIds = routeFixIds(route);
  if (access === "RADAR_VECTORS") {
    return {
      type: "VECTOR_PENDING",
      routeFixIds: fixIds,
      routeRevision: route.revision,
      holdHeadingDeg,
    };
  }
  const firstProcedure = route.route.segments.find(
    (segment) => segment.kind === "SID" || segment.kind === "STAR",
  );
  return {
    type: "PROCEDURE",
    ...(firstProcedure?.kind === "SID" ? { sidId: firstProcedure.procedureId } : {}),
    ...(firstProcedure?.kind === "STAR" ? { starId: firstProcedure.procedureId } : {}),
    toFixIndex: route.nextIndex,
    routeFixIds: fixIds,
  };
}

/** Apply an already-active route to one aircraft without touching the plan. */
export function applyActiveRouteToAircraft(
  aircraft: Aircraft,
  route: FlightPlanRoute,
  access: RouteExecutionAccess = "ROUTE",
): void {
  const fixIds = routeFixIds(route);
  if (fixIds.length === 0 || route.nextIndex < 0 || route.nextIndex > fixIds.length) {
    return;
  }
  aircraft.intent.lateral = routeLateral(route, access, aircraft.headingDeg);
}

/**
 * Start the plan's one active route immediately.  RADAR_VECTORS intentionally
 * leaves the aircraft on a no-autopilot wait state until a later heading.
 */
export function startFlightPlanRoute(
  world: RouteExecutionWorld,
  planId: string,
  access: RouteExecutionAccess = "ROUTE",
  aircraftId?: string,
): RouteExecutionResult {
  const plan = world.flightPlans.find(
    (item) => item.id === planId && isFlightPlanOperational(item),
  );
  if (!plan) {
    return {
      ok: false,
      error: { code: "PLAN_NOT_FOUND", message: `flight plan ${planId} not found` },
    };
  }
  const aircraft = aircraftId
    ? world.aircraft.find((item) => item.id === aircraftId)
    : world.aircraft.find((item) => normalized(item.callsign) === normalized(plan.acid));
  if (!aircraft) {
    return {
      ok: false,
      error: { code: "NO_AIRCRAFT", message: `no aircraft for flight plan ${plan.acid}` },
    };
  }
  // Issued clearances own execution. The plan route remains a separate
  // editable proposal and is only the compatibility fallback for legacy
  // callers that explicitly start a plan route.
  const route = aircraft.activeClearance?.route ?? plan.routeRecord;
  if (!route || route.lifecycle !== "active") {
    return {
      ok: false,
      error: { code: "ROUTE_NOT_ACTIVE", message: "flight plan route is not active" },
    };
  }
  const fixIds = routeFixIds(route);
  if (
    fixIds.length === 0 ||
    route.nextIndex < 0 ||
    route.nextIndex > fixIds.length ||
    routeHasUnavailableFix(route, world, Boolean(aircraft.activeClearance))
  ) {
    return {
      ok: false,
      error: { code: "UNABLE_ROUTE", message: "unable route: route fix is unavailable" },
    };
  }
  aircraft.intent.lateral = routeLateral(route, access, aircraft.headingDeg);
  return { ok: true, plan, aircraft, route };
}

/** Explicit alias for callers that use the clearance-domain vocabulary. */
export const executeClearedRoute = startFlightPlanRoute;
export const startActiveFlightPlanRoute = startFlightPlanRoute;
