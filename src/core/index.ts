/**
 * Public API for `@core`.
 *
 * Legal now: `World` (`simTimeMs`, `paused`, `simRate` 1|2, empty `aircraft`,
 * `selectedAircraftId`, optional facility `catalog`, `alerts`, `sessionLog`); `createWorld`; `setSelectedAircraft`; `stepWorld`;
 * `createAccumulator` / `advanceWorld`; clock constants (`PHYSICS_HZ`,
 * `SIM_DT_S`, `MAX_PHYSICS_STEPS_PER_FRAME`); kinematics (`TURN_RATE_DEG_PER_S`,
 * `CLIMB_RATE_FT_PER_MIN`, `ACCEL_KT_PER_S`, `normalizeHeading`,
 * `shortestDeltaDeg`, `stepAircraft`); geo helpers (`LatLon`,
 * `NmEastNorth`, `latLonToNm`, `nmToLatLon`, `normalizeHeadingDeg`); Command IR
 * types, `INSTRUCTION_TYPES`, and fixtures; session event log (`SessionEvent`,
 * `SessionLog`); aircraft types (`Aircraft`, `Intent`), `createAircraft`,
 * `makeTestAircraft`, `nextAircraftId`; conflict alert lite (`evaluateConflictAlert`,
 * `CA_LATERAL_NM` / `CA_VERTICAL_FT` / `CA_LOOKAHEAD_S`, `datablockAlertTint`).
 *
 * Import rule: `@core` depends on nothing in `src/*` except itself.
 */
export type { World, SimRate, Accumulator } from "./world";
export {
  createWorld,
  setSelectedAircraft,
  stepWorld,
  createAccumulator,
  advanceWorld,
} from "./world";
export { PHYSICS_HZ, SIM_DT_S, MAX_PHYSICS_STEPS_PER_FRAME } from "./clock";
export {
  TURN_RATE_DEG_PER_S,
  CLIMB_RATE_FT_PER_MIN,
  ACCEL_KT_PER_S,
  normalizeHeading,
  shortestDeltaDeg,
  stepAircraft,
} from "./kinematics";
export type { LatLon, NmEastNorth } from "./geo/coords";
export { latLonToNm, nmToLatLon, normalizeHeadingDeg } from "./geo/coords";
export type { Command, Instruction, ParseStage, TurnDir } from "./command/types";
export { INSTRUCTION_TYPES } from "./command/instructions";
export * from "./command/fixtures";
export type { SessionEvent } from "./events/types";
export { SessionLog } from "./events/session-log";
export type { Aircraft, AircraftInit, Intent } from "./aircraft";
export { createAircraft, makeTestAircraft, nextAircraftId } from "./aircraft";
export type { CaAlert, CaSeverity, WorldAlerts } from "./alerts/conflictAlert";
export {
  CA_LATERAL_NM,
  CA_LOOKAHEAD_S,
  CA_LOOKAHEAD_SAMPLE_S,
  CA_VERTICAL_FT,
  caPairKey,
  caSeverityForCallsign,
  emptyWorldAlerts,
  evaluateConflictAlert,
} from "./alerts/conflictAlert";
export type { AlertTint, AlertTintTrack } from "./alerts/colors";
export { datablockAlertTint } from "./alerts/colors";
