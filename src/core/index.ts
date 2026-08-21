/**
 * Public API for `@core`.
 *
 * Legal now: `World` stub (`simTimeMs`, `simRate` 1|2, empty `aircraft`);
 * geo helpers (`LatLon`, `NmEastNorth`, `latLonToNm`, `nmToLatLon`,
 * `normalizeHeadingDeg`); Command IR types, `INSTRUCTION_TYPES`, and fixtures.
 *
 * Later: sim clock, aircraft, kinematics, `stepWorld` (phase 1).
 *
 * Import rule: `@core` depends on nothing in `src/*` except itself.
 */
export type { World } from "./world";
export type { LatLon, NmEastNorth } from "./geo/coords";
export { latLonToNm, nmToLatLon, normalizeHeadingDeg } from "./geo/coords";
export type { Command, Instruction, TurnDir } from "./command/types";
export { INSTRUCTION_TYPES } from "./command/instructions";
export * from "./command/fixtures";
