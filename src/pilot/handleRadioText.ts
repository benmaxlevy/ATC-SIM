/**
 * Radio pipeline: parse → resolve → validate → apply intent + template readback.
 * Pilot agent is the only module that changes aircraft intent from a Command.
 * Scope never writes intent. Does not run physics.
 *
 * Analog: vice typed tokens (R08) compile to IR; 7110.65 readbacks (R01).
 * Trainer delta: awaits `parseCommand` (typed → Path A → Path B). Not NAS STARS.
 */

import type { Command, Instruction, ParseStage, SessionLog, World } from "@core";
import { parseCommand } from "@parse";
import { applyIntent } from "./applyIntent";
import { formatReadback, formatRejectReadback } from "./readback";
import { resolveCallsign } from "./resolveCallsign";
import { validateInstructions } from "./validate";

export interface PilotResult {
  accepted: boolean;
  readback: string;
  command?: Command;
  reason?: string;
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

function buildCommand(args: {
  callsign: string;
  instructions: Instruction[];
  sourceText: string;
  issuedAtSimMs: number;
  parseStage?: ParseStage;
}): Command {
  return {
    id: nextCommandId(),
    issuedAtSimMs: args.issuedAtSimMs,
    callsign: args.callsign,
    instructions: args.instructions,
    sourceText: args.sourceText,
    source: "text",
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
): Promise<PilotResult> {
  const parsed = await parseCommand(sourceText, {
    source: "text",
    selectedCallsign: selectedCallsignFromWorld(world),
    pathC: false,
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

  const resolved = resolveCallsign({ callsignToken: parsed.callsignToken, world });
  if (!resolved.ok) {
    const reason = resolved.reason;
    const command = buildCommand({
      callsign: parsed.callsignToken ?? "",
      instructions: parsed.instructions,
      sourceText,
      issuedAtSimMs: world.simTimeMs,
      parseStage: parsed.parseStage,
    });
    logRejected(log, world, atWallMs, { command, reason, sourceText });
    return {
      accepted: false,
      readback: formatRejectReadback({ reason }),
      command,
      reason,
    };
  }

  const aircraft = world.aircraft.find((ac) => ac.id === resolved.aircraftId);
  if (!aircraft) {
    const reason = "UNKNOWN_CALLSIGN";
    const command = buildCommand({
      callsign: resolved.callsign,
      instructions: parsed.instructions,
      sourceText,
      issuedAtSimMs: world.simTimeMs,
      parseStage: parsed.parseStage,
    });
    logRejected(log, world, atWallMs, { command, reason, sourceText });
    return {
      accepted: false,
      readback: formatRejectReadback({ reason }),
      command,
      reason,
    };
  }

  const command = buildCommand({
    callsign: resolved.callsign,
    instructions: parsed.instructions,
    sourceText,
    issuedAtSimMs: world.simTimeMs,
    parseStage: parsed.parseStage,
  });

  const validated = validateInstructions(aircraft, command.instructions);
  if (!validated.ok) {
    logRejected(log, world, atWallMs, { command, reason: validated.reason, sourceText });
    return {
      accepted: false,
      readback: formatRejectReadback({ callsign: resolved.callsign, reason: validated.reason }),
      command,
      reason: validated.reason,
    };
  }

  applyIntent(aircraft, command.instructions, world.simTimeMs);
  const readback = formatReadback({
    callsign: resolved.callsign,
    instructions: command.instructions,
    aircraft,
  });
  logAccepted(log, world, atWallMs, command);
  return { accepted: true, readback, command };
}
