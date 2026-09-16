/**
 * Public API for `@scenario`.
 *
 * Legal now: playable-scenario inventory (`listPlayableScenarios`,
 * `loadPlayableScenario`), compatibility KDEM loaders, Scenario types
 * including trainer-authored MAPS / video-map geometry from `video-maps/<ICAO>/`
 * (Not OSM / tiles), facility procedure catalog (`loadCatalog`, `data/<icao>/`),
 * trainer MVA (`loadMva`, `data/<icao>-mva.json`), trainer-authored `radarSites`
 * (empty = implicit FUSED; sampling is T02-75), and `createWorldFromScenario`
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
  BeaconPoolConfig,
  CwtWakeCategory,
  DepartureConfig,
  DepartureRoute,
  DeparturePolicy,
  DepartureSpawn,
  DigitalMapCoastline,
  DigitalMapLocalizer,
  DigitalMapRangeRings,
  DigitalMapRunway,
  Fix,
  RadarSite,
  RadarSiteKind,
  RegionalAirport,
  RegionalAirspaceAltitude,
  RegionalAirspaceSegment,
  RegionalAirspaceVolume,
  RegionalFacility,
  RegionalRunwayGeometry,
  RegionalSourceProvenance,
  Runway,
  Scenario,
  ScenarioMaps,
  Spawn,
  SpawnPolicy,
  VideoMap,
} from "./types";
export type {
  LoadedVideoMap,
  VideoMapCatalog,
  VideoMapFile,
  VideoMapGroup,
  VideoMapGroupSet,
  VideoMapGroupSlot,
} from "./loadVideoMaps";
export type {
  ApproachProcedure,
  ApproachType,
  AtpaWakeAdaptation,
  AtpaWakeMatrix,
  AtpaVolume,
  NavFix,
  Navaid,
  ProcedureCatalog,
  CatalogAirport,
  SidEnrouteTransition,
  SidLeg,
  SidProcedure,
  SidRunwayTransition,
  StarProcedure,
} from "./procedures/types";
export { catalogAirport, catalogDctIds } from "./procedures/types";
export {
  FAA_CWT_WAKE_ADAPTATION,
  FAA_CWT_WAKE_MATRIX,
  lookupAtpaWakeMinimum,
} from "./procedures/atpaWake";
export {
  ARRIVAL_COUNT_MAX,
  ARRIVAL_COUNT_MIN,
  GI_TEXT_LINE_COUNT,
  RADAR_SITE_DEFAULT_PERIOD_MS,
  RADAR_SITE_DEFAULT_RANGE_NM,
} from "./types";
export { assertScenario, loadKdem, loadKdem09, loadKdemIls09, loadKdemIls27 } from "./load";
export { isImplicitFusedSurveillance, parseRadarSites } from "./radarSites";
export type {
  PlayableAirport,
  PlayableScenario,
  PlayableScenarioInventory,
} from "./playableScenarios";
export {
  createPlayableScenarioInventory,
  listConfigurationsForAirport,
  listPlayableAirports,
  listPlayableScenarios,
  loadPlayableScenario,
} from "./playableScenarios";
export {
  findSidProcedure,
  loadCatalog,
  parseAtpaWakeAdaptation,
  parseCatalogFiles,
  sidRouteFixIds,
} from "./procedures/loadCatalog";
export { hasRegionalPack, loadRegionalPack, parseRegionalPack } from "./regional";
export { loadRegionalAirportCatalog } from "./regionalCatalogs";
export type { AtpaTrackPose, AtpaVolumeGeometry } from "./atpaVolume";
export {
  alongCourseDistanceNm,
  atpaVolumeThreshold,
  isInsideAtpaVolume,
  lateralOffsetNm,
} from "./atpaVolume";
export type { MvaChart, MvaPolygon, MvaVertex, MsawInhibitGeom } from "./mva";
export { loadMva, mvaFileKey, parseMvaChart } from "./mva";
export {
  loadVideoMapGroups,
  loadVideoMapSet,
  parseVideoMapGroups,
  starsIdFromNote,
} from "./loadVideoMaps";
export {
  createWorldForSession,
  createWorldFromScenario,
  spawnArrivals,
  starRouteFixIds,
} from "./spawn";
export type {
  AssignStarRoutesArgs,
  OutermostStarFix,
  StarInboundPose,
  StarRouteAssignment,
  StarSlot,
} from "./starSpawn";
export {
  STAR_SPAWN_GATE_OFFSET_NM,
  STAR_SPAWN_STAGGER_NM,
  STAR_SPAWN_VIA_ALT_MARGIN_FT,
  assignStarRoutes,
  authoredStarToFixIndex,
  listStarSlots,
  outermostStarFix,
  starInboundPose,
} from "./starSpawn";
export type { DepartureSpawnConfig, DepartureSpawnPose } from "./departureSpawn";
export {
  DEPARTURE_SPAWN_ALTITUDE_FT,
  DEPARTURE_SPAWN_ROLL_OFFSET_NM,
  DEPARTURE_SPAWN_SPEED_KT,
  DEFAULT_DEPARTURE_ALTITUDE_FT,
  departureSpawnPose,
  resolveRunwayHeading,
  resolveRunwayThreshold,
  spawnDeparture,
} from "./departureSpawn";
export type { DepartureSlot, GenerateDepartureScheduleOptions } from "./departureGenerator";
export {
  DEFAULT_DEPARTURE_COUNT,
  DEFAULT_DEPARTURE_RATE_PER_HOUR,
  DEPARTURE_AIRCRAFT_TYPES,
  DEPARTURE_AIRLINES,
  DEPARTURE_ASSIGNED_ALTITUDES_FT,
  DEPARTURE_STREAM_XOR,
  MIN_DEPARTURE_INTERVAL_S,
  generateDepartureSchedule,
  listDepartureSlots,
  spawnDueDepartures,
} from "./departureGenerator";
export type { TrafficAirline } from "./callsigns";
export {
  TRAFFIC_AIRLINES,
  allocateCallsign,
  allocateTrafficPair,
  allocateTrafficPairForType,
  callsignNumericTail,
  usedCallsignSet,
} from "./callsigns";
export type { SpawnAircraftParams } from "./spawnAircraft";
export { defaultSquawkRng, spawnAircraft, usedSquawks } from "./spawnAircraft";
export type { ScenarioIfrFlightPlanInput, ScenarioIfrRoute } from "./ifrFlightPlan";
export {
  createScenarioIfrFlightPlan,
  scenarioIfrRouteText,
  spawnScenarioIfrAircraft,
} from "./ifrFlightPlan";
export {
  DEFAULT_SPAWN_SEED,
  parseDepartureOptions,
  parseScenarioChoice,
  parseSpawnSeed,
  parseTrafficCount,
} from "./trafficQuery";
export type { DepartureOptions } from "./trafficQuery";
export {
  SESSION_SETUP_STORAGE_KEY,
  SESSION_SETUP_VERSION,
  SESSION_DEPARTURES_PER_HOUR_MAX,
  SESSION_DEPARTURES_PER_HOUR_MIN,
  SESSION_INITIAL_COUNT_MAX,
  SESSION_INITIAL_COUNT_MIN,
  VFR_DENSITY_PRESETS,
  applyVfrDensityPreset,
  arrivalTrafficFromSetup,
  defaultSessionSetup,
  defaultVfrRequestConfigForScenario,
  defaultVfrTrafficConfigForScenario,
  departuresEnabledForScenario,
  loadSessionSetup,
  matchVfrDensityPreset,
  parseSessionSetupStorage,
  resolveSessionSetup,
  saveSessionSetup,
  serializeSessionSetup,
  validateSessionSetup,
  vfrDensityNumbersFromSetup,
  vfrEnabledForScenario,
  vfrRequestsFromSetup,
  vfrTrafficFromSetup,
} from "./sessionSetup";
export type {
  SessionSetup,
  SessionSetupDefaults,
  SessionSetupDraft,
  SessionSetupResolution,
  VfrDensityNumbers,
  VfrDensityPresetId,
  VfrDensitySelection,
} from "./sessionSetup";
export type {
  ArrivalScheduler,
  ArrivalTrafficConfig,
  ScheduledArrival,
  ValidatedArrivalTrafficConfig,
} from "./arrivalScheduler";
export {
  ARRIVALS_PER_HOUR_MAX,
  ARRIVALS_PER_HOUR_MIN,
  DEFAULT_ARRIVALS_PER_HOUR,
  DEFAULT_INITIAL_ARRIVAL_COUNT,
  createArrivalScheduler,
  validateArrivalTrafficConfig,
} from "./arrivalScheduler";
export type {
  VfrAircraftMixRow,
  VfrAltitudeMixRow,
  VfrMovementMix,
  VfrRequestConfig,
  VfrTrafficConfig,
} from "./types";
export {
  DEFAULT_VFR_AIRCRAFT_MIX,
  DEFAULT_VFR_ALTITUDE_MIX,
  DEFAULT_VFR_MOVEMENT_MIX,
  DEFAULT_VFR_REQUEST_CONFIG,
  VFR_FUTURE_ENTRY_XOR,
  VFR_INITIAL_PLACEMENT_XOR,
  VFR_MISSION_ZONE_XOR,
  VFR_PILOT_REQUEST_XOR,
  VFR_ROUTE_XOR,
  VfrTrafficManager,
  allocateVfrCallsign,
  chooseWeighted,
  fixedVfrMovementMix,
  getEligibleVfrDestinations,
  validateVfrRequestConfig,
  validateVfrTrafficConfig,
} from "./vfrTraffic";
