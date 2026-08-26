/**
 * Radio pipeline: parse → resolve → validate → apply intent + template readback.
 * Pilot agent is the only module that changes aircraft intent from a Command.
 * Scope never writes intent. Does not run physics.
 *
 * Analog: vice typed tokens (R08) compile to IR; 7110.65 readbacks (R01).
 * Trainer delta: awaits `parseCommand` (typed → Path A → Path B → configured C). Not NAS STARS.
 */

import type { Aircraft, Command, Instruction, ParseStage, SessionLog, World } from "@core";
import { assertHandoffOwned, handoffFor } from "@core";
import { approachesFromCatalog, parseCommand, proceduresFromCatalog } from "@parse";
import { FULL_CALLSIGN, SUFFIX_CALLSIGN } from "../parse/tokens";
import { applyIntent } from "./applyIntent";
import { formatReadback, formatRejectReadback } from "./readback";
import { validateInstructions } from "./validate";

export type ResolveReason =
  "UNKNOWN_CALLSIGN" | "AMBIGUOUS_CALLSIGN" | "NO_CALLSIGN_OR_SELECTION" | "SELECTED_NOT_FOUND";

export type ResolveResult =
  { ok: true; aircraftId: string; callsign: string } | { ok: false; reason: ResolveReason };

export function numericTail(callsign: string): string {
  return callsign.replace(/^[A-Z]{3}/, "");
}

function matchAircraft(token: string, aircraft: Aircraft[]): Aircraft[] {
  if (FULL_CALLSIGN.test(token)) {
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

function catalogFixIdsFromWorld(world: World): string[] {
  return world.fixRegistry ? [...world.fixRegistry.ids()] : [];
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
  args: { command: Command | null; reason: string; sourceText: string },
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
  const parsed = await parseCommand(sourceText, {
    source,
    selectedCallsign: selectedCallsignFromWorld(world),
    callsigns: callsignsFromWorld(world),
    fixes: catalogFixIdsFromWorld(world),
    procedures: proceduresFromCatalog(world.catalog),
    approaches: approachesFromCatalog(world.catalog),
    pathC: opts?.pathC ?? false,
  });
  if (!parsed.ok) {
    const reason = "PARSE";
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
  function reject(reason: string, detail?: string, cmd?: Command): PilotResult {
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
      }),
      command: c,
      reason,
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
    return reject(gate.reason, undefined, resolvedCommand);
  }

  const validated = validateInstructions(aircraft, resolvedCommand.instructions, {
    fixRegistry: world.fixRegistry,
    catalog: world.catalog,
    approachIds: world.catalog?.approaches.map((item) => item.id),
  });
  if (!validated.ok) {
    return reject(validated.reason, validated.detail, resolvedCommand);
  }

  applyIntent(aircraft, resolvedCommand.instructions, world.simTimeMs, {
    catalog: world.catalog,
    log,
    fixXy: world.fixRegistry ? (id) => world.fixRegistry?.get(id) : undefined,
  });
  const procedureNames = Object.fromEntries(
    (world.catalog?.stars ?? []).map((star) => [star.id, star.name ?? star.id]),
  );
  const readback = formatReadback({
    callsign: resolved.callsign,
    instructions: resolvedCommand.instructions,
    aircraft,
    procedureNames,
  });
  logAccepted(log, world, atWallMs, resolvedCommand);
  return { accepted: true, readback, command: resolvedCommand };
}
