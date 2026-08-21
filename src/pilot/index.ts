/**
 * Public API for `@pilot`.
 *
 * Legal now: `handleRadioText` (parse → resolve → validate → apply);
 * `handleRadioCommand` (same apply path for a Command already parsed);
 * `applyCommand` (intent apply for a resolved Command, no parse);
 * readback templates (`formatReadback`, `formatRejectReadback`,
 * `formatCallsignSpeech`); callsign resolution (`resolveCallsign`,
 * `numericTail`); validation (`validateInstructions`).
 *
 * Import rule: `@pilot` may import `@core` and `@parse` (radio pipeline).
 * Must not import `@scope` or `@ui`.
 */

import type { Command, World } from "@core";
import { applyIntent } from "./applyIntent";

export type { HandleRadioOpts, PilotResult } from "./handleRadioText";
export { handleRadioCommand, handleRadioText } from "./handleRadioText";
export type { ReadbackAircraft, RejectReason } from "./readback";
export { formatCallsignSpeech, formatReadback, formatRejectReadback } from "./readback";
export type { ResolveReason, ResolveResult } from "./resolveCallsign";
export { numericTail, resolveCallsign } from "./resolveCallsign";
export type { ValidateReason, ValidateResult } from "./validate";
export { validateInstructions } from "./validate";
export { applyIntent, IDENT_FLASH_MS } from "./applyIntent";

/** Apply an already-resolved Command. Radio entry is `handleRadioText`. */
export function applyCommand(world: World, command: Command): void {
  const aircraft = world.aircraft.find((ac) => ac.callsign === command.callsign);
  if (!aircraft) {
    throw new Error(`applyCommand: no aircraft ${command.callsign}`);
  }
  applyIntent(aircraft, command.instructions, world.simTimeMs);
}
