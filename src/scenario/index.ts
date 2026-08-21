/**
 * Public API for `@scenario`.
 *
 * Legal now: KDEM JSON stub (`loadKdem`, `assertScenario`) and Scenario types.
 *
 * Later: extra spawn mix, video-map polylines, real CIFP airports (phase 4).
 *
 * Import rule: `@scenario` may import `@core` only.
 */
export const SCENARIO_PACKAGE = "scenario";
export type {
  Approach,
  Fix,
  Runway,
  Scenario,
  Spawn,
  VideoMap,
} from "./types";
export { assertScenario, loadKdem } from "./load";
