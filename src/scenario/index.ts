/**
 * Public API for `@scenario`.
 *
 * Legal now: KDEM JSON stub (`loadKdem`, `assertScenario`), Scenario types
 * including trainer-authored MAPS / video-map geometry from `video-maps/<ICAO>/`
 * (Not OSM / tiles), facility procedure catalog (`loadCatalog`, `data/<icao>/`),
 * and `createWorldFromScenario` (6 explicit arrivals including DAL123 at heading
 * 100). Bench: `spawnArrivals(world, n)` / `?traffic=30` places n jets on a
 * downwind arc; default student scenario stays 4–8.
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
export type { LoadedVideoMap, VideoMapCatalog, VideoMapFile } from "./videoMapTypes";
export type {
  ApproachProcedure,
  ApproachType,
  NavFix,
  Navaid,
  ProcedureCatalog,
  SidProcedure,
  StarProcedure,
} from "./procedures/types";
export { catalogDctIds } from "./procedures/types";
export { ARRIVAL_COUNT_MAX, ARRIVAL_COUNT_MIN } from "./types";
export { assertScenario, loadKdem } from "./load";
export { loadCatalog, parseCatalogFiles } from "./procedures/loadCatalog";
export { loadVideoMapSet } from "./loadVideoMaps";
export { createWorldForSession, createWorldFromScenario, spawnArrivals } from "./spawn";
export { parseTrafficCount } from "./trafficQuery";
