/**
 * Public API for `@pilot`.
 *
 * Legal now: `handleRadioText` (parse → resolve → validate → apply);
 * `handleRadioCommand` (same apply path for a Command already parsed);
 * `applyCommand` (intent apply for a resolved Command, no parse);
 * readback templates (`formatReadback`, `formatRejectReadback`,
 * `formatCallsignSpeech`); STAR check-in (`formatCheckIn`);
 * callsign resolution (`resolveCallsign`,
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
export type {
  CheckInKind,
  CheckInRadio,
  DrainCheckInsArgs,
  FormatCheckInArgs,
  FormatDepartureCheckInArgs,
  ScheduledCheckIn,
  SidNameCatalog,
  StarNameCatalog,
} from "./checkinQueue";
export {
  CHECKIN_IDLE_GAP_MS,
  CHECKIN_STAGGER_MAX_MS,
  CHECKIN_STAGGER_MIN_MS,
  DEPARTURE_CHECKIN_STAGGER_MAX_MS,
  DEPARTURE_CHECKIN_STAGGER_MIN_MS,
  CheckInQueue,
  createCheckInQueue,
  formatCheckIn,
  formatDepartureCheckIn,
  isSidDeparture,
  isStarViaArrival,
  sidSpokenName,
  starSpokenName,
} from "./checkinQueue";
export type { ResolveReason, ResolveResult } from "./resolveCallsign";
export { numericTail, resolveCallsign } from "./resolveCallsign";
export type { ValidateReason, ValidateResult, ValidateOpts } from "./validate";
export { validateInstructions } from "./validate";
export { applyIntent, IDENT_FLASH_MS } from "./applyIntent";
export type { ApplyIntentOpts } from "./applyIntent";

/** Apply an already-resolved Command. Radio entry is `handleRadioText`. */
export function applyCommand(world: World, command: Command): void {
  const aircraft = world.aircraft.find((ac) => ac.callsign === command.callsign);
  if (!aircraft) {
    throw new Error(`applyCommand: no aircraft ${command.callsign}`);
  }
  applyIntent(aircraft, command.instructions, world.simTimeMs, {
    catalog: world.catalog,
    log: world.sessionLog,
    fixXy: world.fixRegistry ? (id) => world.fixRegistry?.get(id) : undefined,
  });
}
