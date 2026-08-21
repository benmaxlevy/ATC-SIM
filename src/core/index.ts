/**
 * Public API for `@core`.
 *
 * Legal now: `World` stub (`simTimeMs`, `simRate` 1|2, empty `aircraft`);
 * geo helpers (`LatLon`, `NmEastNorth`, `latLonToNm`, `nmToLatLon`,
 * `normalizeHeadingDeg`).
 *
 * Later: sim clock, aircraft, kinematics, Command IR types (T00-06),
 * `stepWorld` (phase 1).
 *
 * Import rule: `@core` depends on nothing in `src/*` except itself.
 */
export type { World } from "./world";
export type { LatLon, NmEastNorth } from "./geo/coords";
export { latLonToNm, nmToLatLon, normalizeHeadingDeg } from "./geo/coords";
