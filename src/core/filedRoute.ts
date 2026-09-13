import type {
  FiledRoute,
  FiledRouteSegment,
  FlightPlan,
  FlightPlanStatus,
  FlightPlanErrorCode,
} from "./flightPlan";
import { isValidAcid, isValidBeaconCode, validateFlightPlan } from "./flightPlan";

/** The deliberately small catalog surface needed by filed-route entry. */
export interface FiledRouteCatalog {
  navaids: ReadonlyArray<{ id: string }>;
  fixes: ReadonlyArray<{ id: string }>;
  stars: ReadonlyArray<{
    id: string;
    transitions?: ReadonlyArray<{ id: string; legs: ReadonlyArray<{ fixId: string }> }>;
    common?: ReadonlyArray<{ fixId: string }>;
  }>;
  sids: ReadonlyArray<{
    id: string;
    legs?: ReadonlyArray<{ fixId: string }>;
    common?: ReadonlyArray<{ fixId: string }>;
    runwayTransitions?: ReadonlyArray<{ runwayId: string; legs: ReadonlyArray<{ fixId: string }> }>;
    enrouteTransitions?: ReadonlyArray<{
      id: string;
      legs?: ReadonlyArray<{ fixId: string }>;
      runwayTransitions?: ReadonlyArray<{
        runwayId: string;
        legs: ReadonlyArray<{ fixId: string }>;
      }>;
    }>;
  }>;
}

export type FiledRouteErrorCode =
  | "INCOMPLETE_ROUTE"
  | "UNSUPPORTED_ROUTE_TOKEN"
  | "AMBIGUOUS_ROUTE_TOKEN"
  | "UNKNOWN_PROCEDURE"
  | "UNKNOWN_TRANSITION"
  | "WRONG_PROCEDURE_KIND"
  | "UNKNOWN_FIX";

export interface FiledRouteError {
  code: FiledRouteErrorCode;
  field: "route";
  token?: string;
  message: string;
}

export type FiledRouteResult<T> = { ok: true; value: T } | { ok: false; error: FiledRouteError };

export interface ParsedFiledRouteSegment {
  kind: "SID" | "STAR" | "DCT";
  procedureId?: string;
  transitionId?: string;
  fixId?: string;
}

export interface ParsedFiledRoute {
  text: string;
  segments: ParsedFiledRouteSegment[];
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function routeError(code: FiledRouteErrorCode, message: string, token?: string): FiledRouteError {
  return { code, field: "route", ...(token === undefined ? {} : { token }), message };
}

function canonicalRouteText(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s*([:/])\s*/g, "$1")
    .replace(/\s+/g, " ");
}

/** Parse only the compact trainer grammar. No catalog is consulted here. */
export function parseFiledRoute(routeText: string): FiledRouteResult<ParsedFiledRoute> {
  const text = canonicalRouteText(routeText);
  if (!text) return { ok: true, value: { text: "", segments: [] } };
  const tokens = text.split(" ");
  const segments: ParsedFiledRouteSegment[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const match = /^(SID|STAR):([A-Z0-9]+)(?:\/([A-Z0-9]+))?$/.exec(token);
    if (match) {
      segments.push({
        kind: match[1] as "SID" | "STAR",
        procedureId: match[2],
        ...(match[3] === undefined ? {} : { transitionId: match[3] }),
      });
      continue;
    }
    if (token === "DCT") {
      const target = tokens[index + 1];
      if (!target || target === "DCT" || /^(?:SID|STAR):/.test(target)) {
        return {
          ok: false,
          error: routeError(
            "INCOMPLETE_ROUTE",
            "DCT must be followed by one catalog fix or navaid",
            token,
          ),
        };
      }
      segments.push({ kind: "DCT", fixId: target });
      index += 1;
      continue;
    }
    if (/^(?:SID|STAR):/.test(token)) {
      return {
        ok: false,
        error: routeError("UNSUPPORTED_ROUTE_TOKEN", `invalid procedure token ${token}`, token),
      };
    }
    return {
      ok: false,
      error: routeError(
        "UNSUPPORTED_ROUTE_TOKEN",
        `unsupported route token ${token}; use SID:, STAR:, or DCT`,
        token,
      ),
    };
  }
  return { ok: true, value: { text, segments } };
}

function idsEqual(left: string, right: string): boolean {
  return upper(left) === upper(right);
}

function legsToIds(legs: ReadonlyArray<{ fixId: string }> | undefined): string[] {
  return (legs ?? []).map((leg) => upper(leg.fixId)).filter(Boolean);
}

function appendDistinct(target: string[], values: readonly string[]): void {
  for (const value of values) {
    if (target[target.length - 1] !== value) target.push(value);
  }
}

function sidRoutes(
  sid: FiledRouteCatalog["sids"][number],
  transitionId: string | undefined,
): Array<{ transitionId?: string; fixIds: string[] }> {
  if (sid.legs) return transitionId ? [] : [{ fixIds: legsToIds(sid.legs) }];
  const common = legsToIds(sid.common);
  const routes: Array<{ transitionId?: string; fixIds: string[] }> = [];
  const enroutes = sid.enrouteTransitions ?? [];
  if (enroutes.length > 0) {
    for (const enroute of enroutes) {
      if (transitionId && !idsEqual(enroute.id, transitionId)) continue;
      const runwayChoices = enroute.runwayTransitions?.length
        ? enroute.runwayTransitions
        : [undefined];
      for (const runway of runwayChoices) {
        const fixIds: string[] = [];
        appendDistinct(fixIds, legsToIds(runway?.legs));
        appendDistinct(fixIds, common);
        appendDistinct(fixIds, legsToIds(enroute.legs));
        routes.push({ transitionId: upper(enroute.id), fixIds });
      }
    }
    return routes;
  }
  const runways = sid.runwayTransitions ?? [];
  for (const runway of runways) {
    if (transitionId && !idsEqual(runway.runwayId, transitionId)) continue;
    const fixIds: string[] = [];
    appendDistinct(fixIds, legsToIds(runway.legs));
    appendDistinct(fixIds, common);
    routes.push({ transitionId: transitionId ? upper(runway.runwayId) : undefined, fixIds });
  }
  if (runways.length === 0) routes.push({ fixIds: common });
  return routes;
}

function resolveProcedure(
  segment: ParsedFiledRouteSegment,
  catalog: FiledRouteCatalog,
): FiledRouteResult<FiledRouteSegment> {
  const procedureId = segment.procedureId!;
  if (segment.kind === "SID") {
    const hits = catalog.sids.filter((item) => idsEqual(item.id, procedureId));
    if (hits.length === 0) {
      if (catalog.stars.some((item) => idsEqual(item.id, procedureId))) {
        return {
          ok: false,
          error: routeError(
            "WRONG_PROCEDURE_KIND",
            `${procedureId} is a STAR, not a SID`,
            procedureId,
          ),
        };
      }
      return {
        ok: false,
        error: routeError("UNKNOWN_PROCEDURE", `unknown SID ${procedureId}`, procedureId),
      };
    }
    if (hits.length > 1) {
      return {
        ok: false,
        error: routeError("AMBIGUOUS_ROUTE_TOKEN", `SID ${procedureId} is ambiguous`, procedureId),
      };
    }
    const routes = sidRoutes(hits[0]!, segment.transitionId);
    if (segment.transitionId && routes.length === 0) {
      return {
        ok: false,
        error: routeError(
          "UNKNOWN_TRANSITION",
          `unknown SID transition ${segment.transitionId}`,
          segment.transitionId,
        ),
      };
    }
    if (!segment.transitionId && routes.length > 1) {
      return {
        ok: false,
        error: routeError(
          "AMBIGUOUS_ROUTE_TOKEN",
          `SID ${procedureId} requires a transition`,
          procedureId,
        ),
      };
    }
    const selected = routes[0]!;
    return {
      ok: true,
      value: {
        kind: "SID",
        procedureId: upper(procedureId),
        ...(segment.transitionId === undefined || selected.transitionId === undefined
          ? {}
          : { transitionId: selected.transitionId }),
        fixIds: selected.fixIds,
      },
    };
  }
  const hits = catalog.stars.filter((item) => idsEqual(item.id, procedureId));
  if (hits.length === 0) {
    if (catalog.sids.some((item) => idsEqual(item.id, procedureId))) {
      return {
        ok: false,
        error: routeError(
          "WRONG_PROCEDURE_KIND",
          `${procedureId} is a SID, not a STAR`,
          procedureId,
        ),
      };
    }
    return {
      ok: false,
      error: routeError("UNKNOWN_PROCEDURE", `unknown STAR ${procedureId}`, procedureId),
    };
  }
  if (hits.length > 1) {
    return {
      ok: false,
      error: routeError("AMBIGUOUS_ROUTE_TOKEN", `STAR ${procedureId} is ambiguous`, procedureId),
    };
  }
  const transitions = hits[0]!.transitions ?? [];
  const wantedTransition = segment.transitionId;
  const selectedTransitions = wantedTransition
    ? transitions.filter((item) => idsEqual(item.id, wantedTransition))
    : transitions;
  if (wantedTransition && selectedTransitions.length === 0) {
    return {
      ok: false,
      error: routeError(
        "UNKNOWN_TRANSITION",
        `unknown STAR transition ${wantedTransition}`,
        wantedTransition,
      ),
    };
  }
  if (
    !wantedTransition &&
    selectedTransitions.length === 0 &&
    transitions.length === 0 &&
    !hits[0]!.common?.length
  ) {
    return {
      ok: false,
      error: routeError("UNKNOWN_PROCEDURE", `STAR ${procedureId} has no route`, procedureId),
    };
  }
  if (!segment.transitionId && selectedTransitions.length > 1) {
    return {
      ok: false,
      error: routeError(
        "AMBIGUOUS_ROUTE_TOKEN",
        `STAR ${procedureId} requires a transition`,
        procedureId,
      ),
    };
  }
  const transition = selectedTransitions[0];
  const fixIds: string[] = [];
  appendDistinct(fixIds, legsToIds(transition?.legs));
  appendDistinct(fixIds, legsToIds(hits[0]!.common));
  return {
    ok: true,
    value: {
      kind: "STAR",
      procedureId: upper(procedureId),
      ...(segment.transitionId === undefined || transition?.id === undefined
        ? {}
        : { transitionId: upper(transition.id) }),
      fixIds,
    },
  };
}

/** Parse and resolve filed route entries against the loaded facility catalog. */
export function resolveFiledRoute(
  routeText: string,
  catalog: FiledRouteCatalog | null | undefined,
): FiledRouteResult<FiledRoute> {
  const parsed = parseFiledRoute(routeText);
  if (!parsed.ok) return parsed;
  if (parsed.value.segments.length === 0) return { ok: true, value: { text: "", segments: [] } };
  if (!catalog) {
    return { ok: false, error: routeError("UNKNOWN_PROCEDURE", "no procedure catalog is loaded") };
  }
  const segments: FiledRouteSegment[] = [];
  for (const parsedSegment of parsed.value.segments) {
    if (parsedSegment.kind === "DCT") {
      const target = parsedSegment.fixId!;
      const fixes = catalog.fixes.filter((item) => idsEqual(item.id, target));
      const navaids = catalog.navaids.filter((item) => idsEqual(item.id, target));
      if (fixes.length + navaids.length === 0) {
        return {
          ok: false,
          error: routeError("UNKNOWN_FIX", `unknown fix or navaid ${target}`, target),
        };
      }
      if (fixes.length + navaids.length > 1) {
        return {
          ok: false,
          error: routeError("AMBIGUOUS_ROUTE_TOKEN", `DCT target ${target} is ambiguous`, target),
        };
      }
      segments.push({ kind: "DCT", fixId: upper(target), fixIds: [upper(target)] });
      continue;
    }
    const resolved = resolveProcedure(parsedSegment, catalog);
    if (!resolved.ok) return resolved;
    for (const fixId of resolved.value.fixIds) {
      const known =
        catalog.fixes.some((item) => idsEqual(item.id, fixId)) ||
        catalog.navaids.some((item) => idsEqual(item.id, fixId));
      if (!known) {
        return {
          ok: false,
          error: routeError("UNKNOWN_FIX", `unknown procedure fix ${fixId}`, fixId),
        };
      }
    }
    segments.push(resolved.value);
  }
  const normalized = segments
    .map((segment) => {
      if (segment.kind === "DCT") return `DCT ${segment.fixId}`;
      return `${segment.kind}:${segment.procedureId}${segment.transitionId ? `/${segment.transitionId}` : ""}`;
    })
    .join(" ");
  return { ok: true, value: { text: normalized, segments } };
}

export type FlightPlanDraftInput = Omit<
  Partial<FlightPlan>,
  "id" | "status" | "associatedAircraftId" | "filedRoute"
> & {
  acid: string;
  id?: string;
  flightType?: FlightPlan["flightType"] | "A" | "P" | "E";
  /** Modal route text. The persisted FlightPlan field is the resolved object. */
  filedRoute?: string;
};

export type FlightPlanDraftErrorCode =
  FiledRouteErrorCode | "PLAN_NOT_FOUND" | "INVALID_VALUE" | "INVALID_FIELD";

export interface FlightPlanDraftError {
  code: FlightPlanDraftErrorCode | FlightPlanErrorCode;
  field: string;
  value?: string;
  message: string;
}

export type FlightPlanDraftResult =
  { ok: true; plan: FlightPlan; created: boolean } | { ok: false; error: FlightPlanDraftError };

function draftError(
  code: FlightPlanDraftError["code"],
  field: string,
  message: string,
  value?: string,
): FlightPlanDraftError {
  return { code, field, ...(value === undefined ? {} : { value }), message };
}

function validAltitude(value: unknown): boolean {
  return (
    value === undefined ||
    value === 0 ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 99000 &&
      value % 100 === 0)
  );
}

function scalarError(
  input: FlightPlanDraftInput,
  existing: FlightPlan | undefined,
): FlightPlanDraftError | undefined {
  if (!isValidAcid(input.acid))
    return draftError("INVALID_ACID", "acid", "invalid ACID", input.acid);
  if (input.assignedBeacon !== undefined && !isValidBeaconCode(input.assignedBeacon)) {
    return draftError(
      "INVALID_BEACON",
      "assignedBeacon",
      "assigned beacon must be four octal digits",
      String(input.assignedBeacon),
    );
  }
  if (input.reportedBeacon !== undefined && !isValidBeaconCode(input.reportedBeacon)) {
    return draftError(
      "INVALID_BEACON",
      "reportedBeacon",
      "reported beacon must be four octal digits",
      String(input.reportedBeacon),
    );
  }
  if (!validAltitude(input.requestedAltitudeFt) || !validAltitude(input.assignedAltitudeFt)) {
    return draftError(
      "INVALID_VALUE",
      "altitude",
      "altitudes must be whole hundreds from 0 through 99000",
    );
  }
  if (
    existing?.status !== "active" &&
    input.assignedAltitudeFt !== undefined &&
    input.assignedAltitudeFt !== 0
  ) {
    return draftError(
      "INVALID_FIELD",
      "assignedAltitudeFt",
      "assigned altitude requires an active flight",
    );
  }
  if (existing?.status === "active" && (input.eta !== undefined || input.ptd !== undefined)) {
    return draftError("INVALID_FIELD", "plan", "ETA and PTD are only valid for inactive plans");
  }
  if (
    input.aircraftCount !== undefined &&
    (!Number.isInteger(input.aircraftCount) || input.aircraftCount < 1 || input.aircraftCount > 99)
  ) {
    return draftError(
      "INVALID_VALUE",
      "aircraftCount",
      "aircraft count must be an integer from 1 through 99",
    );
  }
  if (input.cid !== undefined && !/^[A-Z0-9]{1,4}$/i.test(input.cid.trim()))
    return draftError("INVALID_VALUE", "cid", "invalid CID");
  if (input.tcp !== undefined && !/^[A-Z0-9]{1,2}$/i.test(input.tcp.trim()))
    return draftError("INVALID_VALUE", "tcp", "invalid controller position");
  if (input.eta !== undefined && !/^(?:[01]\d|2[0-3])[0-5]\dE$/i.test(input.eta.trim()))
    return draftError("INVALID_VALUE", "eta", "invalid ETA");
  if (input.ptd !== undefined && !/^(?:[01]\d|2[0-3])[0-5]\dE$/i.test(input.ptd.trim()))
    return draftError("INVALID_VALUE", "ptd", "invalid PTD");
  if (
    input.flightType !== undefined &&
    !["IFR", "VFR", "DVFR", "SVFR", "A", "P", "E"].includes(input.flightType)
  )
    return draftError("INVALID_VALUE", "flightType", "invalid flight type");
  if (input.aircraftType !== undefined && !/^[A-Z0-9]{1,4}$/i.test(input.aircraftType.trim()))
    return draftError("INVALID_VALUE", "aircraftType", "invalid aircraft type");
  if (input.equipment !== undefined && !/^[A-Z0-9]{1,4}$/i.test(input.equipment.trim()))
    return draftError("INVALID_VALUE", "equipment", "invalid equipment");
  if (
    input.scratchpads !== undefined &&
    (!Array.isArray(input.scratchpads) ||
      input.scratchpads.length > 2 ||
      input.scratchpads.some(
        (item) => typeof item !== "string" || !/^[A-Z0-9+/. *]{0,4}$/i.test(item.trim()),
      ))
  )
    return draftError("INVALID_VALUE", "scratchpads", "invalid scratchpad");
  return undefined;
}

function normalizeInput(input: FlightPlanDraftInput): Partial<FlightPlan> {
  const result: Partial<FlightPlan> = {};
  for (const key of [
    "cid",
    "assignedBeacon",
    "reportedBeacon",
    "tcp",
    "fixes",
    "flightType",
    "scratchpads",
    "requestedAltitudeFt",
    "assignedAltitudeFt",
    "equipment",
    "aircraftType",
    "aircraftCount",
    "departureAirport",
    "airportId",
    "flightRules",
    "eta",
    "ptd",
    "remarks",
    "previousFix",
    "coordinationFix",
    "minimumFuel",
    "source",
  ] as const) {
    if (input[key] !== undefined) result[key] = input[key] as never;
  }
  result.acid = input.acid.trim().toUpperCase();
  for (const key of [
    "cid",
    "tcp",
    "equipment",
    "aircraftType",
    "departureAirport",
    "airportId",
    "flightRules",
    "eta",
    "ptd",
    "remarks",
    "previousFix",
    "coordinationFix",
    "minimumFuel",
    "source",
  ] as const) {
    const value = input[key];
    if (typeof value === "string") result[key] = value.trim().toUpperCase();
  }
  if (input.assignedBeacon !== undefined)
    result.assignedBeacon = input.assignedBeacon.trim().toUpperCase();
  if (input.reportedBeacon !== undefined)
    result.reportedBeacon = input.reportedBeacon.trim().toUpperCase();
  if (input.scratchpads)
    result.scratchpads = input.scratchpads.map((item) => item.trim().toUpperCase());
  const flightType = (input as { flightType?: string }).flightType;
  if (flightType === "A") result.flightType = "IFR";
  if (flightType === "P") result.flightType = "VFR";
  if (flightType === "E") result.flightType = "DVFR";
  return result;
}

/** Atomically create or amend a local filed plan. Only FlightPlan is mutated. */
export function saveFlightPlanDraft(
  world: { flightPlans: FlightPlan[]; catalog?: FiledRouteCatalog | null },
  input: FlightPlanDraftInput,
): FlightPlanDraftResult {
  const acid = input.acid.trim().toUpperCase();
  const byId = input.id
    ? world.flightPlans.find((item) => item.id === input.id && item.status !== "deleted")
    : undefined;
  const existing =
    byId ?? world.flightPlans.find((item) => item.acid === acid && item.status !== "deleted");
  if (input.id && !byId)
    return {
      ok: false,
      error: draftError("PLAN_NOT_FOUND", "plan", `flight plan ${input.id} not found`, input.id),
    };
  const candidateInput = normalizeInput(input);
  const scalar = scalarError(input, existing);
  if (scalar) return { ok: false, error: scalar };
  const route = resolveFiledRoute(input.filedRoute ?? input.route ?? "", world.catalog);
  if (!route.ok) return { ok: false, error: route.error };
  const otherPlans = world.flightPlans.filter(
    (item) => item.status !== "deleted" && item.id !== existing?.id,
  );
  const identity = validateFlightPlan(
    {
      acid: candidateInput.acid!,
      assignedBeacon: candidateInput.assignedBeacon,
      reportedBeacon: candidateInput.reportedBeacon,
    },
    otherPlans,
  )[0];
  if (identity) return { ok: false, error: identity };
  const id = existing?.id ?? input.id ?? `fp-${acid}`;
  let uniqueId = id;
  let suffix = 2;
  while (world.flightPlans.some((item) => item.id === uniqueId && item !== existing))
    uniqueId = `${id}-${suffix++}`;
  const base: FlightPlan = existing
    ? { ...existing, fixes: [...existing.fixes], scratchpads: [...existing.scratchpads] }
    : { id: uniqueId, status: "pending", acid, fixes: [], scratchpads: [] };
  const candidate: FlightPlan = {
    ...base,
    ...candidateInput,
    id: base.id,
    status: base.status,
    associatedAircraftId: base.associatedAircraftId,
  };
  if (route.value.segments.length > 0) {
    candidate.filedRoute = route.value;
    candidate.route = route.value.text;
  } else {
    delete candidate.filedRoute;
    delete candidate.route;
  }
  if (candidate.requestedAltitudeFt === 0) delete candidate.requestedAltitudeFt;
  if (candidate.assignedAltitudeFt === 0) delete candidate.assignedAltitudeFt;
  if (!existing) candidate.status = "pending" as FlightPlanStatus;
  const created = !existing;
  if (existing) Object.assign(existing, candidate);
  else world.flightPlans.push(candidate);
  return { ok: true, plan: existing ?? candidate, created };
}
