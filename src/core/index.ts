/**
 * Public API for `@core`.
 *
 * Legal now: `World` (`simTimeMs`, `paused`, `simRate` 1|2, empty `aircraft`,
 * `selectedAircraftId`); `createWorld`; `stepWorld`; `createAccumulator` /
 * `advanceWorld`; clock constants (`PHYSICS_HZ`,
 * `SIM_DT_S`, `MAX_PHYSICS_STEPS_PER_FRAME`); geo helpers (`LatLon`,
 * `NmEastNorth`, `latLonToNm`, `nmToLatLon`, `normalizeHeadingDeg`); Command IR
 * types, `INSTRUCTION_TYPES`, and fixtures; session event log (`SessionEvent`,
 * `SessionLog`).
 *
 * Later: aircraft types, kinematics (phase 1).
 *
 * Import rule: `@core` depends on nothing in `src/*` except itself.
 */
export type { World, SimRate, Accumulator } from "./world";
export { createWorld, stepWorld, createAccumulator, advanceWorld } from "./world";
export { PHYSICS_HZ, SIM_DT_S, MAX_PHYSICS_STEPS_PER_FRAME } from "./clock";
export type { LatLon, NmEastNorth } from "./geo/coords";
export { latLonToNm, nmToLatLon, normalizeHeadingDeg } from "./geo/coords";
export type { Command, Instruction, TurnDir } from "./command/types";
export { INSTRUCTION_TYPES } from "./command/instructions";
export * from "./command/fixtures";
export type { SessionEvent } from "./events/types";
export { SessionLog } from "./events/session-log";
