/**
 * Public API for `@scenario`.
 *
 * Legal now: KDEM JSON stub (`loadKdem`, `assertScenario`), Scenario types
 * including trainer-authored digital map geometry, and
 * `createWorldFromScenario` (6 explicit arrivals including DAL123 at heading 100).
 *
 * Later: extra spawn mix, real CIFP airports (phase 4).
 *
 * Import rule: `@scenario` may import `@core` only. `@core` does not import JSON.
 */
export const SCENARIO_PACKAGE = "scenario";
export type {
  Approach,
  ArrivalSpawn,
  DigitalMapCoastline,
  DigitalMapLocalizer,
  DigitalMapRangeRings,
  DigitalMapRunway,
  Fix,
  Runway,
  Scenario,
  ScenarioMaps,
  Spawn,
  VideoMap,
} from "./types";
export { ARRIVAL_COUNT_MAX, ARRIVAL_COUNT_MIN } from "./types";
export { assertScenario, loadKdem } from "./load";
export { createWorldFromScenario, spawnArrivals } from "./spawn";
