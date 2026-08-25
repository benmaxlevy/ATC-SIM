/**
 * Public API for `@scenario`.
 *
 * Legal now: KDEM JSON stub (`loadKdem`, `assertScenario`), phase 4 ILS demo
 * (`loadKdemIls27`, spawn-on-STAR with VIA), Scenario types
 * including trainer-authored MAPS / video-map geometry from `video-maps/<ICAO>/`
 * (Not OSM / tiles), facility procedure catalog (`loadCatalog`, `data/<icao>/`),
 * trainer MVA (`loadMva`, `data/<icao>-mva.json`), and `createWorldFromScenario`
 * (6 STAR-inbound arrivals including DAL123, VIA armed). Bench:
 * `spawnArrivals(world, n)` / `?traffic=30` places n jets on a
 * downwind arc; default student scenario stays 4–8. `?seed=` reshuffles STAR
 * remainder assignment.
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
  SpawnPolicy,
  VideoMap,
} from "./types";
export type { LoadedVideoMap, VideoMapCatalog, VideoMapFile } from "./loadVideoMaps";
export type {
  ApproachProcedure,
  ApproachType,
  NavFix,
  Navaid,
  ProcedureCatalog,
  SidEnrouteTransition,
  SidLeg,
  SidProcedure,
  SidRunwayTransition,
  StarProcedure,
} from "./procedures/types";
export { catalogDctIds } from "./procedures/types";
export { ARRIVAL_COUNT_MAX, ARRIVAL_COUNT_MIN, GI_TEXT_LINE_COUNT } from "./types";
export { assertScenario, loadKdem, loadKdemIls27 } from "./load";
export {
  findSidProcedure,
  loadCatalog,
  parseCatalogFiles,
  sidRouteFixIds,
} from "./procedures/loadCatalog";
export type { MvaChart, MvaPolygon, MvaVertex, MsawInhibitGeom } from "./mva";
export { loadMva, mvaFileKey, parseMvaChart } from "./mva";
export { loadVideoMapSet } from "./loadVideoMaps";
export {
  createWorldForSession,
  createWorldFromScenario,
  spawnArrivals,
  starRouteFixIds,
} from "./spawn";
export type { OutermostStarFix, StarInboundPose, StarRouteAssignment, StarSlot } from "./starSpawn";
export {
  STAR_SPAWN_GATE_OFFSET_NM,
  STAR_SPAWN_STAGGER_NM,
  STAR_SPAWN_VIA_ALT_MARGIN_FT,
  assignStarRoutes,
  listStarSlots,
  outermostStarFix,
  starInboundPose,
} from "./starSpawn";
export type {
  DepartureSpawnConfig,
  DepartureSpawnPose,
} from "./departureSpawn";
export {
  DEPARTURE_SPAWN_ALTITUDE_FT,
  DEPARTURE_SPAWN_ROLL_OFFSET_NM,
  DEPARTURE_SPAWN_SPEED_KT,
  DEFAULT_DEPARTURE_ALTITUDE_FT,
  departureSpawnPose,
  spawnDeparture,
} from "./departureSpawn";
export {
  DEFAULT_SPAWN_SEED,
  parseScenarioChoice,
  parseSpawnSeed,
  parseTrafficCount,
} from "./trafficQuery";
export type { ScenarioChoice } from "./trafficQuery";

