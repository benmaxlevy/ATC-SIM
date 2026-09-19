/**
 * Radio pipeline: parse → resolve → validate → apply intent + template readback.
 * Pilot agent is the only module that changes aircraft intent from a Command.
 * Scope never writes intent. Does not run physics.
 *
 * Analog: vice typed tokens (R08) compile to IR; 7110.65 readbacks (R01).
 * Trainer delta: awaits `parseCommand` (typed → Path A → Path B → configured C). Not NAS STARS.
 */

import type { Aircraft, Command, Instruction, ParseStage, SessionLog, World } from "@core";
import {
  applyIfrCancellation,
  applyIfrClearance,
  assertHandoffOwned,
  findOpenRadioRequest,
  handoffFor,
  regionalSatelliteIlsApproaches,
  resolveApproachContext,
  transitionRequestToApproved,
  transitionRequestToDeclined,
  transitionRequestToIdentified,
  transitionRequestToStandby,
  transitionRequestToTerminated,
} from "@core";
import {
  approachesFromCatalog,
  catalogFixEntriesFromCatalog,
  parseCommand,
  proceduresFromCatalog,
  sanitizeCatalogFixEntries,
  type CatalogApproach,
  type CatalogFixEntry,
} from "@parse";
import type { RegionalFacility } from "../scenario/regional";
import { FULL_CALLSIGN, GA_CALLSIGN, SUFFIX_CALLSIGN } from "../parse/tokens";
import { applyIntent } from "./applyIntent";
import { formatReadback, formatRejectReadback } from "./readback";
import { validateInstructions } from "./validate";
import {
  formatIfrPickupRequest,
  formatVfrFlightFollowingRequest,
  formatVfrPositionReport,
} from "./vfrRequestQueue";

export type ResolveReason =
  "UNKNOWN_CALLSIGN" | "AMBIGUOUS_CALLSIGN" | "NO_CALLSIGN_OR_SELECTION" | "SELECTED_NOT_FOUND";

export type ResolveResult =
  { ok: true; aircraftId: string; callsign: string } | { ok: false; reason: ResolveReason };

export function numericTail(callsign: string): string {
  return callsign.replace(/^(?:[A-Z]{3}|[A-Z])/, "");
}

function matchAircraft(token: string, aircraft: Aircraft[]): Aircraft[] {
  if (FULL_CALLSIGN.test(token) || GA_CALLSIGN.test(token)) {
    return aircraft.filter((ac) => ac.callsign === token);
  }
  if (SUFFIX_CALLSIGN.test(token)) {
    return aircraft.filter((ac) => numericTail(ac.callsign) === token);
  }
  return [];
}

function resolveExplicitToken(token: string, aircraft: Aircraft[]): ResolveResult {
  const matches = matchAircraft(token, aircraft);
  if (matches.length === 1) {
    const ac = matches[0]!;
    return { ok: true, aircraftId: ac.id, callsign: ac.callsign };
  }
  if (matches.length === 0) {
    return { ok: false, reason: "UNKNOWN_CALLSIGN" };
  }
  return { ok: false, reason: "AMBIGUOUS_CALLSIGN" };
}

function resolveFromSelection(world: World): ResolveResult {
  if (world.selectedAircraftId === null) {
    return { ok: false, reason: "NO_CALLSIGN_OR_SELECTION" };
  }
  const selected = world.aircraft.find((ac) => ac.id === world.selectedAircraftId);
  if (!selected) {
    return { ok: false, reason: "SELECTED_NOT_FOUND" };
  }
  return { ok: true, aircraftId: selected.id, callsign: selected.callsign };
}

export function resolveCallsign(input: {
  callsignToken: string | null;
  world: World;
}): ResolveResult {
  const token = input.callsignToken;
  if (token !== null) {
    return resolveExplicitToken(token, input.world.aircraft);
  }
  return resolveFromSelection(input.world);
}

export interface PilotResult {
  accepted: boolean;
  readback: string;
  command?: Command;
  reason?: string;
  detail?: string;
}

export interface HandleRadioOpts {
  /** Channel. Default `"text"` so typed command-line callers stay valid. */
  source?: "text" | "voice";
  /** Explicit opt-in. Path C runs after typed/A/B miss only. */
  pathC?: boolean;
}

let commandSeq = 0;

function nextCommandId(): string {
  commandSeq += 1;
  return `cmd-${commandSeq}`;
}

function selectedCallsignFromWorld(world: World): string | null {
  if (world.selectedAircraftId === null) {
    return null;
  }
  return world.aircraft.find((ac) => ac.id === world.selectedAircraftId)?.callsign ?? null;
}

function callsignsFromWorld(world: World): string[] {
  return world.aircraft.map((ac) => ac.callsign);
}

function catalogFixEntriesFromWorld(world: World): CatalogFixEntry[] {
  if (world.catalog) {
    return catalogFixEntriesFromCatalog(world.catalog);
  }
  return sanitizeCatalogFixEntries(world.fixRegistry ? [...world.fixRegistry.ids()] : []);
}

function catalogAirportsFromWorld(world: World): Array<{
  icao: string;
  name: string;
  aliases: string[];
}> {
  const results: Array<{ icao: string; name: string; aliases: string[] }> = [];
  const seen = new Set<string>();
  const catalog = world.catalog;
  if (catalog?.name && catalog.airportId) {
    seen.add(catalog.airportId.toUpperCase());
    results.push({
      icao: catalog.airportId,
      name: catalog.name,
      aliases: [...(catalog.spokenAliases ?? [])],
    });
  }
  const regional = world.regional as
    | {
        airports?:
          | Array<{ icao: string; name?: string }>
          | {
              centerAirport?: { icao: string; name?: string };
              destinations?: Array<{ icao: string; name?: string }>;
            };
        getEligibleDestinations?: () => Array<{ icao: string; name?: string }>;
      }
    | undefined;
  if (regional) {
    const rawAirports = regional.airports;
    const list: Array<{ icao: string; name?: string }> = Array.isArray(rawAirports)
      ? rawAirports
      : rawAirports && typeof rawAirports === "object" && "destinations" in rawAirports
        ? [rawAirports.centerAirport, ...(rawAirports.destinations ?? [])].filter(
            (a): a is { icao: string; name?: string } => Boolean(a),
          )
        : typeof regional.getEligibleDestinations === "function"
          ? regional.getEligibleDestinations()
          : [];
    for (const apt of list) {
      if (apt?.icao && !seen.has(apt.icao.toUpperCase())) {
        seen.add(apt.icao.toUpperCase());
        results.push({
          icao: apt.icao,
          name: apt.name ?? apt.icao,
          aliases: [],
        });
      }
    }
  }
  return results;
}

export function approachesFromWorld(world: World): CatalogApproach[] {
  const base = approachesFromCatalog(world.catalog);
  const satellite = regionalSatelliteIlsApproaches(world.regional);
  const seen = new Set(base.map((a) => a.id.toUpperCase()));
  const combined = [...base];
  for (const app of satellite) {
    if (!seen.has(app.id.toUpperCase())) {
      seen.add(app.id.toUpperCase());
      combined.push(app);
    }
  }
  return combined;
}

function buildCommand(args: {
  callsign: string;
  instructions: Instruction[];
  sourceText: string;
  issuedAtSimMs: number;
  parseStage?: ParseStage;
  source: "text" | "voice";
}): Command {
  return {
    id: nextCommandId(),
    issuedAtSimMs: args.issuedAtSimMs,
    callsign: args.callsign,
    instructions: args.instructions,
    sourceText: args.sourceText,
    source: args.source,
    parseStage: args.parseStage,
  };
}

function logRejected(
  log: SessionLog,
  world: World,
  atWallMs: number,
  args: { command: Command | null; reason: string; sourceText?: string },
): void {
  log.append({
    type: "command.rejected",
    atSimMs: world.simTimeMs,
    atWallMs,
    command: args.command,
    reason: args.reason,
    ...(args.command === null ? { sourceText: args.sourceText } : {}),
  });
}

function logAccepted(log: SessionLog, world: World, atWallMs: number, command: Command): void {
  log.append({
    type: "command.accepted",
    atSimMs: world.simTimeMs,
    atWallMs,
    command,
  });
}

/**
 * Parse a radio line (tokens or 7110.65 English), resolve the callsign, validate,
 * and on full accept apply intent. Parse failures log
 * `{ sourceText, reason: "PARSE", command: null }`.
 */
export async function handleRadioText(
  world: World,
  sourceText: string,
  log: SessionLog,
  atWallMs = 0,
  opts?: HandleRadioOpts,
): Promise<PilotResult> {
  const source = opts?.source ?? "text";
  const fixEntries = catalogFixEntriesFromWorld(world);
  const parsed = await parseCommand(sourceText, {
    source,
    selectedCallsign: selectedCallsignFromWorld(world),
    callsigns: callsignsFromWorld(world),
    fixes: fixEntries,
    routeCandidates: fixEntries,
    procedures: proceduresFromCatalog(world.catalog),
    approaches: approachesFromWorld(world),
    airports: catalogAirportsFromWorld(world),
    pathC: opts?.pathC ?? false,
  });
  if (!parsed.ok) {
    const normalizedTokens = sourceText.trim().replace(/\s+/g, " ").toUpperCase().split(" ");
    const reason =
      parsed.error.startsWith("BAD_CLEARANCE") || normalizedTokens.includes("CLR")
        ? "CLEARANCE"
        : parsed.error.startsWith("BAD_SQUAWK") || normalizedTokens.includes("SQ")
          ? "SQUAWK"
          : "PARSE";
    logRejected(log, world, atWallMs, { command: null, reason, sourceText });
    return {
      accepted: false,
      readback: formatRejectReadback({ reason }),
      reason,
    };
  }

  const command = buildCommand({
    callsign: parsed.callsignToken ?? "",
    instructions: parsed.instructions,
    sourceText: parsed.sourceText,
    issuedAtSimMs: world.simTimeMs,
    parseStage: parsed.parseStage,
    source: parsed.source ?? source,
  });
  return handleRadioCommand(world, command, log, atWallMs);
}

/**
 * Resolve, validate, and apply a Command that `parseCommand` already produced.
 * Voice loop (T03-02) dispatches here so speech never constructs Instructions.
 */
export function handleRadioCommand(
  world: World,
  command: Command,
  log: SessionLog,
  atWallMs = 0,
): PilotResult {
  function reject(reason: string, detail?: string, cmd?: Command, isHeavy?: boolean): PilotResult {
    const c = cmd ?? command;
    logRejected(log, world, atWallMs, {
      command: c,
      reason,
      sourceText: c.sourceText,
    });
    return {
      accepted: false,
      readback: formatRejectReadback({
        callsign: c.callsign || undefined,
        reason,
        detail,
        isHeavy,
      }),
      command: c,
      reason,
      detail,
    };
  }

  const token = command.callsign === "" ? null : command.callsign;
  const resolved = resolveCallsign({ callsignToken: token, world });
  if (!resolved.ok) {
    return reject(resolved.reason);
  }

  const aircraft = world.aircraft.find((ac) => ac.id === resolved.aircraftId);
  if (!aircraft) {
    return reject("UNKNOWN_CALLSIGN", undefined, { ...command, callsign: resolved.callsign });
  }

  const resolvedCommand: Command = {
    ...command,
    callsign: resolved.callsign,
  };

  const gate = assertHandoffOwned(handoffFor(world, aircraft.id));
  if (!gate.ok) {
    return reject(gate.reason, undefined, resolvedCommand, aircraft.wakeCategory === "H");
  }

  const approachCtx = resolveApproachContext(aircraft, world);
  const effectiveCatalog = approachCtx.catalog ?? world.catalog;
  const effectiveFixRegistry = approachCtx.fixRegistry ?? world.fixRegistry;

  const validated = validateInstructions(aircraft, resolvedCommand.instructions, {
    fixRegistry: effectiveFixRegistry,
    catalog: effectiveCatalog,
    activeRunwayId: world.activeRunwayId,
    approachIds: effectiveCatalog?.approaches.map((item) => item.id),
    radioRequests: world.radioRequests,
    regional: world.regional as RegionalFacility | undefined,
    destinationIcao: approachCtx.airportIcao,
    world,
  });
  if (!validated.ok) {
    return reject(
      validated.reason,
      validated.detail,
      resolvedCommand,
      aircraft.wakeCategory === "H",
    );
  }

  const ifrClearance = resolvedCommand.instructions.find((item) => item.type === "IFR_CLEARANCE");
  if (ifrClearance) {
    if (resolvedCommand.instructions.length !== 1) {
      return reject("CLEARANCE", "clearance must be the only instruction", resolvedCommand);
    }
    const applied = applyIfrClearance(world, aircraft, ifrClearance, atWallMs, log);
    if (!applied.ok) {
      const reason =
        applied.error.code === "UNABLE_ROUTE" ||
        applied.error.code === "PLAN_NOT_FOUND" ||
        applied.error.code === "NO_AIRCRAFT"
          ? "UNABLE_ROUTE"
          : "CLEARANCE";
      return reject(reason, applied.error.message, resolvedCommand);
    }
    const readback = formatReadback({
      callsign: resolved.callsign,
      instructions: resolvedCommand.instructions,
      aircraft,
    });
    logAccepted(log, world, atWallMs, resolvedCommand);
    return { accepted: true, readback, command: resolvedCommand };
  }

  const ifrCancellation = resolvedCommand.instructions.find(
    (item) => item.type === "ACKNOWLEDGE_IFR_CANCELLATION",
  );
  if (ifrCancellation) {
    if (resolvedCommand.instructions.length !== 1) {
      return reject(
        "CANCELLATION",
        "cancellation instruction must be the only instruction",
        resolvedCommand,
      );
    }
    const applied = applyIfrCancellation(world, aircraft, atWallMs, log);
    if (!applied.ok) {
      return reject("CANCELLATION", applied.reason, resolvedCommand);
    }
    const readback = formatReadback({
      callsign: resolved.callsign,
      instructions: resolvedCommand.instructions,
      aircraft,
    });
    logAccepted(log, world, atWallMs, resolvedCommand);
    return { accepted: true, readback, command: resolvedCommand };
  }

  const requestControl = resolvedCommand.instructions.find((item) =>
    [
      "REQUEST_DETAILS",
      "STANDBY_REQUEST",
      "APPROVE_FLIGHT_FOLLOWING",
      "DECLINE_REQUEST",
      "RADAR_CONTACT",
      "TERMINATE_RADAR_SERVICE",
    ].includes(item.type),
  );
  if (requestControl) {
    if (resolvedCommand.instructions.length !== 1) {
      return reject(
        "REQUEST",
        "request control instruction must be the only instruction",
        resolvedCommand,
      );
    }
    switch (requestControl.type) {
      case "REQUEST_DETAILS": {
        const req = findOpenRadioRequest(world.radioRequests, aircraft.id);
        if (!req) {
          return reject("REQUEST", "no open request to report details for", resolvedCommand);
        }
        const regionalFacility = world.regional as RegionalFacility | undefined;
        const detailPosition = formatVfrPositionReport(
          { xNm: aircraft.xNm, yNm: aircraft.yNm },
          regionalFacility,
        );
        const detailText =
          req.kind === "FLIGHT_FOLLOWING"
            ? formatVfrFlightFollowingRequest({
                callsign: req.callsign,
                positionPhrase: detailPosition,
                aircraftType: req.details.aircraftType ?? aircraft.aircraftType,
                destinationAirportId: req.details.destinationAirportId,
                altitudeFt:
                  req.details.requestedAltitudeFt ?? req.details.altitudeFt ?? aircraft.altitudeFt,
              })
            : formatIfrPickupRequest({
                callsign: req.callsign,
                positionPhrase: detailPosition,
                aircraftType: req.details.aircraftType ?? aircraft.aircraftType,
                destinationAirportId: req.details.destinationAirportId,
                requestedAltitudeFt: req.details.requestedAltitudeFt ?? req.details.altitudeFt,
              });

        req.status = "PENDING";
        log.append({
          type: "vfr.request.details_reported",
          atSimMs: world.simTimeMs,
          atWallMs,
          callsign: req.callsign,
          requestId: req.id,
          text: detailText,
        });
        logAccepted(log, world, atWallMs, resolvedCommand);
        return { accepted: true, readback: detailText, command: resolvedCommand };
      }
      case "STANDBY_REQUEST": {
        const req = findOpenRadioRequest(world.radioRequests, aircraft.id);
        if (req) {
          transitionRequestToStandby(req, world.simTimeMs);
        }
        break;
      }
      case "APPROVE_FLIGHT_FOLLOWING": {
        const req = findOpenRadioRequest(world.radioRequests, aircraft.id, "FLIGHT_FOLLOWING");
        if (req) {
          transitionRequestToApproved(req, world.simTimeMs);
          aircraft.flightFollowing = {
            active: true,
            approvedAtSimMs: world.simTimeMs,
            requestId: req.id,
          };
        }
        break;
      }
      case "DECLINE_REQUEST": {
        const req = findOpenRadioRequest(world.radioRequests, aircraft.id, requestControl.service);
        if (req) {
          transitionRequestToDeclined(req, world.simTimeMs);
        }
        break;
      }
      case "RADAR_CONTACT": {
        const req = findOpenRadioRequest(world.radioRequests, aircraft.id);
        const report: {
          distanceNm?: number;
          referenceId?: string;
          referenceKind?: "FIX" | "NAVAID" | "AIRPORT";
          reportedAtSimMs: number;
        } = {
          reportedAtSimMs: world.simTimeMs,
        };
        // A present position is validated complete before dispatch; copy it
        // through only when the controller actually gave one.
        if (
          requestControl.distanceNm !== undefined &&
          requestControl.referenceId !== undefined &&
          requestControl.referenceKind !== undefined
        ) {
          report.distanceNm = requestControl.distanceNm;
          report.referenceId = requestControl.referenceId;
          report.referenceKind = requestControl.referenceKind;
        }
        if (req) {
          transitionRequestToIdentified(req, report, world.simTimeMs);
        }
        aircraft.radarContact = report;
        break;
      }
      case "TERMINATE_RADAR_SERVICE": {
        const prevRequestId = aircraft.flightFollowing?.requestId;
        aircraft.flightFollowing = {
          active: false,
          approvedAtSimMs: aircraft.flightFollowing?.approvedAtSimMs,
          requestId: prevRequestId,
        };
        delete aircraft.radarContact;
        const req =
          (prevRequestId ? world.radioRequests?.find((r) => r.id === prevRequestId) : undefined) ??
          findOpenRadioRequest(world.radioRequests, aircraft.id);
        if (req && (req.status === "APPROVED" || req.status === "IDENTIFIED")) {
          transitionRequestToTerminated(req, world.simTimeMs);
        }
        break;
      }
    }
    const readback = formatReadback({
      callsign: resolved.callsign,
      instructions: resolvedCommand.instructions,
      aircraft,
    });
    logAccepted(log, world, atWallMs, resolvedCommand);
    return { accepted: true, readback, command: resolvedCommand };
  }

  applyIntent(aircraft, resolvedCommand.instructions, world.simTimeMs, {
    catalog: effectiveCatalog,
    log,
    fixXy: effectiveFixRegistry ? (id) => effectiveFixRegistry.get(id) : undefined,
    activeRunwayId: world.activeRunwayId,
    flightPlan: world.flightPlans.find(
      (plan) => plan.status !== "deleted" && plan.acid === aircraft.callsign,
    ),
    radioRequests: world.radioRequests,
    regional: world.regional as RegionalFacility | undefined,
    world,
  });
  const procedureNames = Object.fromEntries([
    ...(world.catalog?.stars ?? []).map((star) => [star.id, star.name ?? star.id] as const),
    ...(world.catalog?.sids ?? []).map((sid) => [sid.id, sid.name ?? sid.id] as const),
  ]);
  const readback = formatReadback({
    callsign: resolved.callsign,
    instructions: resolvedCommand.instructions,
    aircraft,
    procedureNames,
  });
  logAccepted(log, world, atWallMs, resolvedCommand);
  return { accepted: true, readback, command: resolvedCommand };
}
