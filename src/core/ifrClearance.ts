import type { Aircraft } from "./aircraft";
import type {
  ClearanceRouteSegment,
  IfrClearanceAccess as CanonicalIfrClearanceAccess,
  Instruction,
} from "./command/types";
import type { FiledRouteCatalog } from "./filedRoute";
import { validateFlightPlanRouteTransaction } from "./filedRoute";
import type { FlightPlan, FlightPlanRoute } from "./flightPlan";
import { isValidBeaconCode } from "./flightPlan";
import { applyActiveRouteToAircraft, type RouteExecutionAccess } from "./fms/routeExecution";
import type { SessionLog } from "./events/session-log";

export type IfrClearanceAccess = CanonicalIfrClearanceAccess;

export type IfrClearanceErrorCode =
  | "PLAN_NOT_FOUND"
  | "NO_AIRCRAFT"
  | "UNABLE_ROUTE"
  | "UNABLE_CLEARANCE"
  | "INVALID_ALTITUDE"
  | "INVALID_FREQUENCY"
  | "INVALID_SQUAWK"
  | "INVALID_CLIMB_VIA"
  | "VFR_PICKUP_NOT_SUPPORTED";

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

type ClearanceInstruction = Extract<Instruction, { type: "IFR_CLEARANCE" }>;
type ClearanceInputAccess = ClearanceInstruction["access"];

function canonicalizeAccess(access: ClearanceInputAccess): IfrClearanceAccess | null {
  switch (access.type) {
    case "AS_FILED":
    case "RADAR_VECTORS":
      return { type: access.type };
    case "EXPLICIT_ROUTE": {
      const segments: ClearanceRouteSegment[] = [];
      for (const segment of access.segments) {
        if (segment.type === "DIRECT") {
          const fixId = normalize(segment.fixId);
          if (!fixId) return null;
          segments.push({ type: "DIRECT", fixId });
          continue;
        }
        const procedureId = normalize(segment.procedureId);
        const transitionId =
          segment.transitionId === undefined ? undefined : normalize(segment.transitionId);
        if (!procedureId || (segment.transitionId !== undefined && !transitionId)) return null;
        segments.push({
          type: "PROCEDURE",
          procedureId,
          ...(transitionId ? { transitionId } : {}),
        });
      }
      return { type: "EXPLICIT_ROUTE", segments };
    }
    case "DIRECT":
      return { type: "EXPLICIT_ROUTE", segments: [] };
    case "FIX_THEN_DIRECT": {
      const fixId = normalize(access.fixId);
      return fixId ? { type: "EXPLICIT_ROUTE", segments: [{ type: "DIRECT", fixId }] } : null;
    }
    case "SID": {
      const procedureId = normalize(access.procedureId);
      const transitionId =
        access.transitionId === undefined ? undefined : normalize(access.transitionId);
      if (!procedureId || (access.transitionId !== undefined && !transitionId)) return null;
      return {
        type: "EXPLICIT_ROUTE",
        segments: [
          {
            type: "PROCEDURE",
            procedureId,
            ...(transitionId ? { transitionId } : {}),
          },
        ],
      };
    }
    default: {
      const _exhaustive: never = access;
      return _exhaustive;
    }
  }
}

/** Serialize the canonical route elements into the existing route compiler's input. */
export function serializeIfrClearanceRoute(
  access: IfrClearanceAccess,
  limitId: string,
): { input: { source: "AS_FILED" } } | { input: { routeText: string } } {
  switch (access.type) {
    case "AS_FILED":
      return { input: { source: "AS_FILED" } };
    case "RADAR_VECTORS":
      return { input: { routeText: normalize(limitId) } };
    case "EXPLICIT_ROUTE": {
      const routeTokens = access.segments.map((segment) =>
        segment.type === "DIRECT"
          ? normalize(segment.fixId)
          : `${normalize(segment.procedureId)}${segment.transitionId ? `/${normalize(segment.transitionId)}` : ""}`,
      );
      return { input: { routeText: [...routeTokens, normalize(limitId)].join(" ") } };
    }
    default: {
      const _exhaustive: never = access;
      return _exhaustive;
    }
  }
}

function routeTextFor(
  access: IfrClearanceAccess,
  limitId: string,
): { input: { source: "AS_FILED" } } | { input: { routeText: string } } {
  return serializeIfrClearanceRoute(access, limitId);
}

function limitKnown(
  limitId: string,
  catalog: FiledRouteCatalog | null | undefined,
  existingRoute: boolean,
): boolean {
  if (existingRoute && !catalog) return true;
  if (!catalog) return false;
  const want = normalize(limitId);
  return Boolean(
    want === normalize(catalog.airportId ?? "") ||
    catalog.fixes.some((item) => normalize(item.id) === want) ||
    catalog.navaids.some((item) => normalize(item.id) === want),
  );
}

function hasAirportRouteSegment(
  access: IfrClearanceAccess,
  catalog: FiledRouteCatalog | null | undefined,
): boolean {
  if (access.type !== "EXPLICIT_ROUTE" || !catalog?.airportId) return false;
  const airportId = normalize(catalog.airportId);
  return access.segments.some(
    (segment) => segment.type === "DIRECT" && normalize(segment.fixId) === airportId,
  );
}

function explicitVfr(value: string | undefined): boolean {
  const rules = normalize(value ?? "");
  return rules === "VFR" || rules === "DVFR" || rules === "SVFR";
}

function rejectsVfrPickup(plan: FlightPlan, aircraft: Aircraft): boolean {
  // Pickup is deferred. Any explicit VFR signal wins over conflicting IFR
  // metadata; accepting it would silently implement the deferred transition.
  return Boolean(
    plan.flightType === "VFR" ||
    plan.flightType === "DVFR" ||
    plan.flightType === "SVFR" ||
    explicitVfr(plan.flightRules) ||
    explicitVfr(aircraft.flightRules) ||
    explicitVfr(aircraft.flightPlan?.rules) ||
    explicitVfr(aircraft.fp?.rules) ||
    aircraft.maintainVfr,
  );
}

function asFiledLimitMatches(
  plan: FlightPlan,
  limitId: string,
  route: FlightPlanRoute,
  catalog: FiledRouteCatalog | null | undefined,
): boolean {
  const isAirportLimit = Boolean(catalog?.airportId && normalize(catalog.airportId) === limitId);
  // If destination metadata exists, an airport AS FILED clearance must name
  // that destination even when a stale/mismatched route token says otherwise.
  if (isAirportLimit && plan.airportId && normalize(plan.airportId) !== limitId) return false;
  const lastSegment = route.route.segments[route.route.segments.length - 1];
  const terminal = lastSegment?.fixIds[lastSegment.fixIds.length - 1];
  if (terminal && normalize(terminal) === limitId) return true;
  // Airport limits are valid only when the filed destination explicitly
  // identifies that same catalog airport; this prevents AS FILED from
  // silently reusing an unrelated route endpoint.
  return Boolean(isAirportLimit && plan.airportId && normalize(plan.airportId) === limitId);
}

/**
 * Compile and commit one IFR clearance. Every route and optional field is
 * checked before the mutable aircraft transaction begins. The editable
 * flight plan is compiler input only: issuance never changes any plan field.
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
  const access = canonicalizeAccess(clearance.access);
  if (!access) return error("UNABLE_ROUTE", "unable route: invalid route segment");
  const limitId = normalize(clearance.limitId);
  if (!limitId || !limitKnown(limitId, world.catalog, Boolean(plan.routeRecord?.route))) {
    return error("UNABLE_ROUTE", `unable route: unknown clearance limit ${limitId || ""}`);
  }
  if (hasAirportRouteSegment(access, world.catalog)) {
    return error("UNABLE_ROUTE", "unable route: airport cannot be a tactical route segment");
  }
  if (rejectsVfrPickup(plan, aircraft)) {
    return error(
      "VFR_PICKUP_NOT_SUPPORTED",
      "unable clearance: VFR-to-IFR pickup is not supported",
    );
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
  const routeInput = routeTextFor(access, limitId);
  const compiled = validateFlightPlanRouteTransaction(
    plan,
    { ...routeInput.input, lifecycle: "active", nextIndex: 0 },
    world.catalog,
  );
  if (!compiled.ok) {
    return error("UNABLE_ROUTE", compiled.error.message);
  }
  const route = compiled.route;
  const sidSegment = route.route.segments.find((segment) => segment.kind === "SID");
  if (clearance.climbVia && (access.type !== "EXPLICIT_ROUTE" || !sidSegment)) {
    return error("INVALID_CLIMB_VIA", "unable clearance: CVIA requires a SID route");
  }
  if (access.type === "AS_FILED" && !asFiledLimitMatches(plan, limitId, route, world.catalog)) {
    return error("UNABLE_ROUTE", `unable route: AS FILED route does not terminate at ${limitId}`);
  }
  const routeIds = route.route.segments.flatMap((segment) => segment.fixIds);
  if (
    routeIds.length === 0 ||
    (world.fixRegistry &&
      routeIds.some(
        (id) => !world.fixRegistry!.has(id) && normalize(world.catalog?.airportId ?? "") !== id,
      ))
  ) {
    return error("UNABLE_ROUTE", "unable route: route fix is unavailable");
  }
  const matchingAircraft = world.aircraft.find((item) => item.id === aircraft.id);
  if (!matchingAircraft) return error("NO_AIRCRAFT", `no aircraft for flight plan ${plan.acid}`);

  // All checks are complete. Own a fresh route snapshot on the aircraft, then
  // apply it exactly once. Never project clearance state back into the plan:
  // plan edits and clearance issuance are intentionally independent actions.
  const runtimeAccess: RouteExecutionAccess =
    access.type === "RADAR_VECTORS" ? "RADAR_VECTORS" : "ROUTE";
  const activeRoute = {
    route: {
      text: route.route.text,
      segments: route.route.segments.map((segment) => ({
        ...segment,
        fixIds: [...segment.fixIds],
      })),
    },
    nextIndex: route.nextIndex,
    revision: route.revision,
    lifecycle: route.lifecycle,
  } satisfies FlightPlanRoute;
  matchingAircraft.activeClearance = {
    route: activeRoute,
    limitId,
    access,
    ...(clearance.frequency === undefined ? {} : { frequency: clearance.frequency.trim() }),
    ...(clearance.climbVia === undefined ? {} : { climbVia: clearance.climbVia }),
    issuedAtSimMs: world.simTimeMs,
  };
  if (clearance.altitudeFt !== undefined) {
    matchingAircraft.intent.assignedAltitudeFt = clearance.altitudeFt;
    matchingAircraft.intent.controllerAssignedAltitudeFt = clearance.altitudeFt;
  }
  if (clearance.squawk !== undefined) {
    matchingAircraft.assignedSquawk = clearance.squawk;
    matchingAircraft.pendingReportedSquawk = {
      code: clearance.squawk,
      dueSimMs: world.simTimeMs + 1000,
    };
  }
  matchingAircraft.clearanceLimit = limitId;
  matchingAircraft.clearanceAccess = access;
  matchingAircraft.clearanceFrequency = clearance.frequency?.trim();
  if (clearance.climbVia && sidSegment?.procedureId) {
    matchingAircraft.intent.vertical = { type: "VIA_SID", sidId: sidSegment.procedureId };
  } else if (
    matchingAircraft.intent.vertical?.type === "VIA_SID" ||
    matchingAircraft.intent.vertical?.type === "VIA_STAR"
  ) {
    matchingAircraft.intent.vertical = { type: "ASSIGNED" };
  }
  applyActiveRouteToAircraft(matchingAircraft, activeRoute, runtimeAccess);
  (log ?? world.sessionLog)?.append({
    type: "clearance.ifr.issued",
    atSimMs: world.simTimeMs,
    atWallMs,
    callsign: aircraft.callsign,
    limitId,
    access,
    routeRevision: activeRoute.revision,
    routeText: route.route.text,
  });
  return { ok: true, plan, aircraft: matchingAircraft, route: activeRoute };
}
