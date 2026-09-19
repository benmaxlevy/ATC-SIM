import type { Aircraft } from "./aircraft";
import type {
  ClearanceRouteSegment,
  IfrClearanceAccess as CanonicalIfrClearanceAccess,
  Instruction,
} from "./command/types";
import type { FiledRouteCatalog } from "./filedRoute";
import {
  resolveClearanceRouteSegments,
  validateFlightPlanRouteTransaction,
  validateResolvedFlightPlanRouteTransaction,
} from "./filedRoute";
import type { FlightPlan, FlightPlanRoute } from "./flightPlan";
import { isValidBeaconCode } from "./flightPlan";
import { applyActiveRouteToAircraft, type RouteExecutionAccess } from "./fms/routeExecution";
import type { SessionLog } from "./events/session-log";
import {
  findOpenRadioRequest,
  transitionRequestToApproved,
  type RadioRequest,
} from "./radio/requests";
import type { RegionalFacility } from "../scenario/regional";

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
  radioRequests?: RadioRequest[];
  regional?: unknown;
  scheduleIfrCancellationCandidate?: (
    aircraft: Aircraft,
    simTimeMs: number,
    options?: { delayMs?: number; log?: SessionLog },
  ) => unknown;
  vfrRequestQueue?: {
    scheduleIfrCancellationCandidate?: (
      aircraft: Aircraft,
      simTimeMs: number,
      options?: { delayMs?: number; log?: SessionLog },
    ) => unknown;
  } | null;
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

function routeTextFor(
  access: Extract<IfrClearanceAccess, { type: "AS_FILED" | "RADAR_VECTORS" }>,
  limitId: string,
): { input: { source: "AS_FILED" } } | { input: { routeText: string } } {
  switch (access.type) {
    case "AS_FILED":
      return { input: { source: "AS_FILED" } };
    case "RADAR_VECTORS":
      return { input: { routeText: normalize(limitId) } };
    default: {
      const _exhaustive: never = access;
      return _exhaustive;
    }
  }
}

function limitKnown(
  limitId: string,
  catalog: FiledRouteCatalog | null | undefined,
  existingRoute: boolean,
  regional?: unknown,
): boolean {
  if (existingRoute && !catalog && !regional) return true;
  const want = normalize(limitId);
  if (catalog) {
    if (
      want === normalize(catalog.airportId ?? "") ||
      catalog.fixes.some((item) => normalize(item.id) === want) ||
      catalog.navaids.some((item) => normalize(item.id) === want) ||
      catalog.regionalAirports?.some((item) => normalize(item.icao) === want)
    ) {
      return true;
    }
  }
  const reg = regional as RegionalFacility | undefined;
  if (reg && typeof reg.hasAirport === "function" && reg.hasAirport(want)) {
    return true;
  }
  return false;
}

interface RegionalAirportEntry {
  icao: string;
  publicUse?: boolean;
  eligible?: boolean;
  eligibleForDestination?: boolean;
  towered?: boolean;
  runways?: unknown[];
}

interface RegionalAirspaceEntry {
  type?: string;
  class?: string;
  centerAirportId?: string;
}

interface RegionalContainer {
  airports?:
    | RegionalAirportEntry[]
    | {
        centerAirport?: RegionalAirportEntry;
        destinations?: RegionalAirportEntry[];
      };
  airspaces?: RegionalAirspaceEntry[];
  getAirport?: (icao: string) => RegionalAirportEntry | undefined;
  hasAirport?: (icao: string) => boolean;
}

export function isEligibleControlledDestination(
  limitId: string,
  regional: unknown,
  catalog: FiledRouteCatalog | null | undefined,
): boolean {
  const want = normalize(limitId);
  const reg = regional as RegionalContainer | undefined;
  if (reg) {
    let apt: RegionalAirportEntry | undefined = undefined;
    if (typeof reg.getAirport === "function") {
      apt = reg.getAirport(want);
    } else if (Array.isArray(reg.airports)) {
      apt = reg.airports.find((a) => normalize(a.icao) === want);
    } else if (reg.airports && "destinations" in reg.airports) {
      const rawDestinations = reg.airports.destinations ?? [];
      apt = [reg.airports.centerAirport, ...rawDestinations].find((a): a is RegionalAirportEntry =>
        Boolean(a && normalize(a.icao) === want),
      );
    }
    if (apt) {
      if (apt.publicUse !== true) return false;
      if (apt.eligible === false) return false;
      if (apt.eligibleForDestination === false) return false;
      const controlledAirspaces = reg.airspaces
        ? reg.airspaces.filter(
            (v) =>
              v.type === "CONTROLLED" && (v.class === "B" || v.class === "C" || v.class === "D"),
          )
        : [];
      const isControlled =
        controlledAirspaces.some((v) => normalize(v.centerAirportId ?? "") === want) ||
        apt.towered === true;
      if (!isControlled) return false;
      if (apt.runways && apt.runways.length === 0) return false;
      return true;
    }
  }
  if (catalog?.airportId && normalize(catalog.airportId) === want) {
    return true;
  }
  return false;
}

function explicitVfr(value: string | undefined): boolean {
  const rules = normalize(value ?? "");
  return rules === "VFR" || rules === "DVFR" || rules === "SVFR";
}

function isVfrOperation(aircraft: Aircraft, plan?: FlightPlan | null): boolean {
  return Boolean(
    aircraft.ambientVfr !== undefined ||
    aircraft.maintainVfr ||
    explicitVfr(aircraft.flightRules) ||
    explicitVfr(aircraft.flightPlan?.rules) ||
    explicitVfr(aircraft.fp?.rules) ||
    explicitVfr(plan?.flightRules) ||
    plan?.flightType === "VFR" ||
    plan?.flightType === "DVFR" ||
    plan?.flightType === "SVFR",
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
  const matchingAircraft = world.aircraft.find((item) => item.id === aircraft.id);
  if (!matchingAircraft) {
    return error("NO_AIRCRAFT", `no aircraft for ${aircraft.callsign}`);
  }

  const existingPlan = world.flightPlans.find(
    (item) =>
      item.status !== "deleted" && normalize(item.acid) === normalize(matchingAircraft.callsign),
  );

  const pickupRequest = world.radioRequests
    ? findOpenRadioRequest(world.radioRequests, matchingAircraft.id, "IFR_PICKUP")
    : undefined;

  const isAirbornePickupCandidate = Boolean(
    pickupRequest !== undefined || isVfrOperation(matchingAircraft, existingPlan),
  );

  if (isAirbornePickupCandidate) {
    if (matchingAircraft.flightRules === "IFR" || matchingAircraft.activeClearance !== undefined) {
      return error("UNABLE_CLEARANCE", "CLEARANCE: aircraft is already operating IFR");
    }
    if (!pickupRequest || pickupRequest.status === "APPROVED") {
      return error("UNABLE_CLEARANCE", "CLEARANCE: no pending IFR pickup request");
    }
    const isAirborne =
      matchingAircraft.airborne !== undefined
        ? matchingAircraft.airborne === true
        : matchingAircraft.altitudeFt > 0;
    if (!isAirborne) {
      return error("UNABLE_CLEARANCE", "CLEARANCE: airborne IFR pickup required");
    }
    const isIdentified =
      pickupRequest.status === "IDENTIFIED" || matchingAircraft.radarContact !== undefined;
    if (!isIdentified) {
      return error("UNABLE_CLEARANCE", "CLEARANCE: radar identification required");
    }
    const limitIdCandidate = normalize(clearance.limitId);
    if (
      !limitIdCandidate ||
      !isEligibleControlledDestination(limitIdCandidate, world.regional, world.catalog)
    ) {
      return error(
        "UNABLE_ROUTE",
        "UNABLE_ROUTE: destination airport is not an eligible controlled airport",
      );
    }
    const requestedDest = pickupRequest.details.destinationAirportId
      ? normalize(pickupRequest.details.destinationAirportId)
      : undefined;
    if (requestedDest && limitIdCandidate !== requestedDest) {
      return error(
        "UNABLE_CLEARANCE",
        "CLEARANCE: clearance limit does not match requested destination",
      );
    }
  } else {
    if (!existingPlan) {
      return error(
        "PLAN_NOT_FOUND",
        `unable route: no flight plan for ${matchingAircraft.callsign}`,
      );
    }
  }

  const access = canonicalizeAccess(clearance.access);
  if (!access) return error("UNABLE_ROUTE", "unable route: invalid route segment");
  const limitId = normalize(clearance.limitId);

  const reg = world.regional as RegionalContainer | undefined;
  const rawAirports = reg?.airports;
  const rawList: RegionalAirportEntry[] = Array.isArray(rawAirports)
    ? rawAirports
    : rawAirports && "destinations" in rawAirports
      ? [rawAirports.centerAirport, ...(rawAirports.destinations ?? [])].filter(
          (a): a is RegionalAirportEntry => Boolean(a),
        )
      : [];
  const regionalAirports = rawList.length > 0 ? rawList.map((a) => ({ icao: a.icao })) : undefined;
  const effectiveCatalog: FiledRouteCatalog | null | undefined = world.catalog
    ? {
        ...world.catalog,
        regionalAirports: world.catalog.regionalAirports ?? regionalAirports,
      }
    : regionalAirports
      ? {
          fixes: [],
          navaids: [],
          stars: [],
          sids: [],
          regionalAirports,
        }
      : undefined;

  const compilerPlan: FlightPlan = existingPlan ?? {
    id: `compiler-${matchingAircraft.id}`,
    status: "active",
    acid: matchingAircraft.callsign,
    fixes: [],
    scratchpads: [],
    airportId: limitId,
  };

  if (
    !limitId ||
    !limitKnown(limitId, effectiveCatalog, Boolean(compilerPlan.routeRecord?.route), world.regional)
  ) {
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

  const compiled =
    access.type === "EXPLICIT_ROUTE"
      ? (() => {
          const resolved = resolveClearanceRouteSegments(
            access.segments,
            limitId,
            effectiveCatalog,
          );
          if (!resolved.ok) {
            return {
              ok: false as const,
              error: {
                code: "UNABLE_ROUTE" as const,
                field: "route" as const,
                message: `unable route: ${resolved.error.message}`,
              },
            };
          }
          return validateResolvedFlightPlanRouteTransaction(compilerPlan, resolved.value, {
            lifecycle: "active",
            nextIndex: 0,
          });
        })()
      : (() => {
          const routeInput = routeTextFor(access, limitId);
          return validateFlightPlanRouteTransaction(
            compilerPlan,
            { ...routeInput.input, lifecycle: "active", nextIndex: 0 },
            effectiveCatalog,
          );
        })();
  if (!compiled.ok) {
    return error("UNABLE_ROUTE", compiled.error.message);
  }
  const route = compiled.route;
  const sidSegment = route.route.segments.find((segment) => segment.kind === "SID");
  if (clearance.climbVia && (access.type !== "EXPLICIT_ROUTE" || !sidSegment)) {
    return error("INVALID_CLIMB_VIA", "unable clearance: CVIA requires a SID route");
  }
  if (
    access.type === "AS_FILED" &&
    !asFiledLimitMatches(compilerPlan, limitId, route, effectiveCatalog)
  ) {
    return error("UNABLE_ROUTE", `unable route: AS FILED route does not terminate at ${limitId}`);
  }
  const routeIds = route.route.segments.flatMap((segment) => segment.fixIds);
  if (
    routeIds.length === 0 ||
    (world.fixRegistry &&
      routeIds.some(
        (id) =>
          !world.fixRegistry!.has(id) &&
          normalize(world.catalog?.airportId ?? "") !== id &&
          !effectiveCatalog?.regionalAirports?.some((a) => normalize(a.icao) === id),
      ))
  ) {
    return error("UNABLE_ROUTE", "unable route: route fix is unavailable");
  }

  // All checks complete.
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
  if (access.type === "RADAR_VECTORS") {
    matchingAircraft.radarVectorPending = true;
  }

  if (isAirbornePickupCandidate) {
    matchingAircraft.flightRules = "IFR";
    matchingAircraft.maintainVfr = false;
    if (matchingAircraft.ambientVfr) {
      matchingAircraft.ambientVfr.alertEligibility = "CONTROLLED";
      matchingAircraft.ambientVfr.destinationAirportId = limitId;
    }
    if (pickupRequest) {
      transitionRequestToApproved(pickupRequest, world.simTimeMs);
    }
    const cancellationLog = log ?? world.sessionLog ?? undefined;
    if (world.scheduleIfrCancellationCandidate) {
      world.scheduleIfrCancellationCandidate(matchingAircraft, world.simTimeMs, {
        log: cancellationLog,
      });
    } else if (world.vfrRequestQueue?.scheduleIfrCancellationCandidate) {
      world.vfrRequestQueue.scheduleIfrCancellationCandidate(matchingAircraft, world.simTimeMs, {
        log: cancellationLog,
      });
    }
  }

  (log ?? world.sessionLog)?.append({
    type: "clearance.ifr.issued",
    atSimMs: world.simTimeMs,
    atWallMs,
    callsign: matchingAircraft.callsign,
    limitId,
    access,
    routeRevision: activeRoute.revision,
    routeText: route.route.text,
  });

  return { ok: true, plan: compilerPlan, aircraft: matchingAircraft, route: activeRoute };
}
