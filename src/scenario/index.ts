/**
 * Public API for `@scenario`.
 *
 * Legal now: KDEM JSON stub (`loadKdem`, `assertScenario`), Scenario types,
 * and `createWorldFromScenario` (6 explicit arrivals including DAL123 at heading 100).
 *
 * Later: extra spawn mix, video-map polylines, real CIFP airports (phase 4).
 *
 * Import rule: `@scenario` may import `@core` only. `@core` does not import JSON.
 */
export const SCENARIO_PACKAGE = "scenario";
export type { Approach, ArrivalSpawn, Fix, Runway, Scenario, Spawn, VideoMap } from "./types";
export { ARRIVAL_COUNT_MAX, ARRIVAL_COUNT_MIN } from "./types";
export { assertScenario, loadKdem } from "./load";
export { createWorldFromScenario, spawnArrivals } from "./spawn";
