/**
 * Public API for `@core`.
 *
 * Legal now: `World` stub (`simTimeMs`, `simRate` 1|2, empty `aircraft`).
 *
 * Later: sim clock, aircraft, kinematics, Command IR types (T00-06),
 * coordinates (T00-04), `stepWorld` (phase 1).
 *
 * Import rule: `@core` depends on nothing in `src/*` except itself.
 */
export type { World } from "./world";
