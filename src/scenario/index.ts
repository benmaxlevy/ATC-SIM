/**
 * Public API for `@scenario`.
 *
 * Legal now: KDEM JSON stub (`loadKdem`, `assertScenario`), phase 4 ILS demo
 * (`loadKdemIls27`, spawn-on-STAR with VIA), Scenario types
 * including trainer-authored MAPS / video-map geometry from `video-maps/<ICAO>/`
 * (Not OSM / tiles), facility procedure catalog (`loadCatalog`, `data/<icao>/`),
 * trainer MVA (`loadMva`, `data/<icao>-mva.json`), and `createWorldFromScenario` (6 explicit arrivals including DAL123 at heading
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
export { assertScenario, loadKdem, loadKdemIls27 } from "./load";
export { loadCatalog, parseCatalogFiles } from "./procedures/loadCatalog";
export type { MvaChart, MvaPolygon, MvaVertex, MsawInhibitGeom } from "./mva/types";
export { parseMvaChart } from "./mva/parse";
export { loadMva, mvaFileKey } from "./mva/load";
export { loadVideoMapSet } from "./loadVideoMaps";
export {
  createWorldForSession,
  createWorldFromScenario,
  spawnArrivals,
  starRouteFixIds,
} from "./spawn";
export type { OutermostStarFix, StarInboundPose, StarSlot } from "./starSpawn";
export {
  STAR_SPAWN_GATE_OFFSET_NM,
  STAR_SPAWN_STAGGER_NM,
  STAR_SPAWN_VIA_ALT_MARGIN_FT,
  listStarSlots,
  outermostStarFix,
  starInboundPose,
} from "./starSpawn";
export { parseScenarioChoice, parseTrafficCount } from "./trafficQuery";
export type { ScenarioChoice } from "./trafficQuery";
