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
  applyContactCenter,
  applyContactTower,
  assertHandoffOwned,
  findOpenRadioRequest,
  handoffFor,
  isFlightPlanOperational,
  regionalSatelliteIlsApproaches,
  resolveApproachContext,
  transitionRequestToApproved,
  transitionRequestToCleared,
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
  type CallsignCandidate,
} from "@parse";
import type { RegionalFacility } from "../scenario/regional";
import { readbackForTts } from "../speech/tts-text";
import { FULL_CALLSIGN, GA_CALLSIGN, SUFFIX_CALLSIGN } from "../parse/tokens";
import { applyIntent } from "./applyIntent";
import { formatReadback, formatRejectReadback } from "./readback";
import { validateInstructions } from "./validate";
import {
  formatIfrPickupRequest,
  formatVfrClassBRequest,
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
  spokenReadback?: string;
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

function callsignsFromWorld(world: World): CallsignCandidate[] {
  return world.aircraft.map((ac) => ({
    callsign: ac.callsign,
    ...(ac.spokenAliases ? { aliases: ac.spokenAliases } : {}),
  }));
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
    const rejectReadback = formatRejectReadback({ reason });
    return {
      accepted: false,
      readback: rejectReadback,
      spokenReadback: readbackForTts(rejectReadback),
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
    const readback = formatRejectReadback({
      callsign: c.callsign || undefined,
      reason,
      detail,
      isHeavy,
      spokenAliases: world.aircraft.find((ac) => ac.callsign === c.callsign)?.spokenAliases,
    });
    return {
      accepted: false,
      readback,
      spokenReadback: readbackForTts(readback),
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
    const classB = resolvedCommand.instructions.find(
      (item) =>
        item.type === "CLASS_B_CLEARANCE" ||
        item.type === "REMAIN_OUTSIDE_BRAVO" ||
        item.type === "RESUME_APPROPRIATE_VFR_ALTITUDES",
    );
    if (classB) {
      log.append({
        type: "class_b.clearance.rejected",
        atSimMs: world.simTimeMs,
        atWallMs,
        callsign: resolved.callsign,
        operation:
          classB.type === "CLASS_B_CLEARANCE"
            ? classB.operation
            : classB.type === "REMAIN_OUTSIDE_BRAVO"
              ? "REMAIN_OUTSIDE"
              : "RESUME",
        detail: validated.detail,
      });
    }
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
    return {
      accepted: true,
      readback,
      spokenReadback: readbackForTts(readback),
      command: resolvedCommand,
    };
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
    return {
      accepted: true,
      readback,
      spokenReadback: readbackForTts(readback),
      command: resolvedCommand,
    };
  }

  const classBAsRequested = resolvedCommand.instructions.find(
    (item) => item.type === "CLASS_B_CLEARANCE_AS_REQUESTED",
  );
  if (classBAsRequested) {
    if (resolvedCommand.instructions.length !== 1) {
      return reject("CLEARANCE", "clearance must be the only instruction", resolvedCommand);
    }
    const request = findOpenRadioRequest(world.radioRequests, aircraft.id, "CLASS_B_ACCESS");
    if (!request || !request.details.classBOperation) {
      return reject("REQUEST", "REQUEST: no pending Class B request", resolvedCommand);
    }
    const requestedOperation = request.details.classBOperation;
    const clearance: Extract<Instruction, { type: "CLASS_B_CLEARANCE" }> = {
      type: "CLASS_B_CLEARANCE",
      operation: requestedOperation,
      ...(request.details.route ? { route: request.details.route } : {}),
      ...(request.details.requestedAltitudeFt === undefined
        ? {}
        : { altitudeFt: request.details.requestedAltitudeFt }),
    };
    const clearanceValidation = validateInstructions(aircraft, [clearance], {
      fixRegistry: effectiveFixRegistry,
      catalog: effectiveCatalog,
      activeRunwayId: world.activeRunwayId,
      approachIds: effectiveCatalog?.approaches.map((item) => item.id),
      radioRequests: world.radioRequests,
      regional: world.regional as RegionalFacility | undefined,
      destinationIcao: approachCtx.airportIcao,
      world,
    });
    if (!clearanceValidation.ok) {
      return reject("CLEARANCE", clearanceValidation.detail, resolvedCommand);
    }
    applyIntent(aircraft, [clearance], world.simTimeMs, {
      catalog: effectiveCatalog,
      log,
      fixXy: effectiveFixRegistry ? (id) => effectiveFixRegistry.get(id) : undefined,
      activeRunwayId: world.activeRunwayId,
      flightPlan: world.flightPlans.find(
        (plan) => isFlightPlanOperational(plan) && plan.acid === aircraft.callsign,
      ),
      radioRequests: world.radioRequests,
      regional: world.regional as RegionalFacility | undefined,
      world,
    });
    transitionRequestToCleared(request, requestedOperation, world.simTimeMs);
    const readback = formatReadback({
      callsign: resolved.callsign,
      instructions: resolvedCommand.instructions,
      aircraft,
    });
    logAccepted(log, world, atWallMs, resolvedCommand);
    return {
      accepted: true,
      readback,
      spokenReadback: readbackForTts(readback),
      command: resolvedCommand,
    };
  }

  const requestControl = resolvedCommand.instructions.find((item) =>
    [
      "REQUEST_DETAILS",
      "STANDBY_REQUEST",
      "APPROVE_FLIGHT_FOLLOWING",
      "DECLINE_REQUEST",
      "RADAR_CONTACT",
      "TERMINATE_RADAR_SERVICE",
      "CONTACT_TOWER",
      "CONTACT_CENTER",
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
          req.kind === "CLASS_B_ACCESS"
            ? formatVfrClassBRequest({
                callsign: req.callsign,
                spokenAliases: aircraft.spokenAliases,
                positionPhrase: detailPosition,
                aircraftType: req.details.aircraftType ?? aircraft.aircraftType,
                altitudeFt: req.details.altitudeFt ?? aircraft.altitudeFt,
                headingDeg: aircraft.headingDeg,
                classBIntent: req.details.classBIntent ?? "TRANSITION",
                classBOperation: req.details.classBOperation ?? "THROUGH",
                originAirportId: req.details.originAirportId,
                destinationAirportId: req.details.destinationAirportId,
                route: req.details.route,
              })
            : req.kind === "FLIGHT_FOLLOWING"
              ? formatVfrFlightFollowingRequest({
                  callsign: req.callsign,
                  spokenAliases: aircraft.spokenAliases,
                  positionPhrase: detailPosition,
                  aircraftType: req.details.aircraftType ?? aircraft.aircraftType,
                  destinationAirportId: req.details.destinationAirportId,
                  altitudeFt:
                    req.details.requestedAltitudeFt ??
                    req.details.altitudeFt ??
                    aircraft.altitudeFt,
                })
              : formatIfrPickupRequest({
                  callsign: req.callsign,
                  spokenAliases: aircraft.spokenAliases,
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
        return {
          accepted: true,
          readback: detailText,
          spokenReadback: readbackForTts(detailText),
          command: resolvedCommand,
        };
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
          const destId = req.details?.destinationAirportId;
          if (destId) {
            aircraft.destinationAirport = destId;
            aircraft.destination = destId;
            if (aircraft.ambientVfr) {
              aircraft.ambientVfr.destinationAirportId = destId;
              aircraft.ambientVfr.mission = "AIRPORT_BOUND";
              const regional = world.regional as RegionalFacility | undefined;
              const destAirport = regional?.airports.find(
                (a) => a.icao.toUpperCase() === destId.toUpperCase(),
              );
              if (destAirport) {
                const targetPt = destAirport.runways?.[0]?.thresholdNm ?? destAirport.arpNm;
                aircraft.ambientVfr.waypoints = [
                  {
                    xNm: targetPt.xNm,
                    yNm: targetPt.yNm,
                    altitudeFt: aircraft.altitudeFt,
                    speedKt: aircraft.speedKt,
                    targetToleranceNm: 2.0,
                  },
                ];
                aircraft.ambientVfr.waypointIndex = 0;
              }
            }
          }
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
          if (req.details?.destinationAirportId) {
            const destId = req.details.destinationAirportId;
            if (!aircraft.destination) {
              aircraft.destinationAirport = destId;
              aircraft.destination = destId;
            }
            if (aircraft.ambientVfr && aircraft.ambientVfr.mission !== "AIRPORT_BOUND") {
              aircraft.ambientVfr.destinationAirportId = destId;
              aircraft.ambientVfr.mission = "AIRPORT_BOUND";
              const regional = world.regional as RegionalFacility | undefined;
              const destAirport = regional?.airports.find(
                (a) => a.icao.toUpperCase() === destId.toUpperCase(),
              );
              if (destAirport) {
                const targetPt = destAirport.runways?.[0]?.thresholdNm ?? destAirport.arpNm;
                aircraft.ambientVfr.waypoints = [
                  {
                    xNm: targetPt.xNm,
                    yNm: targetPt.yNm,
                    altitudeFt: aircraft.altitudeFt,
                    speedKt: aircraft.speedKt,
                    targetToleranceNm: 2.0,
                  },
                ];
                aircraft.ambientVfr.waypointIndex = 0;
              }
            }
          }
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
      case "CONTACT_TOWER": {
        const applied = applyContactTower(world, aircraft, requestControl.facilityName);
        if (!applied.ok) {
          return reject("CONTACT_TOWER", applied.error, resolvedCommand);
        }
        break;
      }
      case "CONTACT_CENTER": {
        const applied = applyContactCenter(world, aircraft, requestControl.facilityName);
        if (!applied.ok) {
          return reject("CONTACT_CENTER", applied.error, resolvedCommand);
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
    return {
      accepted: true,
      readback,
      spokenReadback: readbackForTts(readback),
      command: resolvedCommand,
    };
  }

  applyIntent(aircraft, resolvedCommand.instructions, world.simTimeMs, {
    catalog: effectiveCatalog,
    log,
    fixXy: effectiveFixRegistry ? (id) => effectiveFixRegistry.get(id) : undefined,
    activeRunwayId: world.activeRunwayId,
    flightPlan: world.flightPlans.find(
      (plan) => isFlightPlanOperational(plan) && plan.acid === aircraft.callsign,
    ),
    radioRequests: world.radioRequests,
    regional: world.regional as RegionalFacility | undefined,
    world,
  });
  const classB = resolvedCommand.instructions.find(
    (item) => item.type === "CLASS_B_CLEARANCE" || item.type === "REMAIN_OUTSIDE_BRAVO",
  );
  if (classB?.type === "CLASS_B_CLEARANCE" && classB.operation !== "OUT_OF") {
    const request = findOpenRadioRequest(world.radioRequests, aircraft.id, "CLASS_B_ACCESS");
    if (request) transitionRequestToCleared(request, classB.operation, world.simTimeMs);
  } else if (classB?.type === "REMAIN_OUTSIDE_BRAVO") {
    const request = findOpenRadioRequest(world.radioRequests, aircraft.id, "CLASS_B_ACCESS");
    if (request) transitionRequestToDeclined(request, world.simTimeMs);
  }
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
  return {
    accepted: true,
    readback,
    spokenReadback: readbackForTts(readback),
    command: resolvedCommand,
  };
}
