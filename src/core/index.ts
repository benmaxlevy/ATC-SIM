/**
 * Public API for `@core`.
 *
 * Legal now: `World` (`simTimeMs`, `paused`, `simRate` 1|2, `navigation.magVarDeg`, empty `aircraft`,
 * `selectedAircraftId`, optional facility `catalog`, `fixRegistry`, `alerts`, `mvaChart`,
 * `msawInhibit`, `sessionLog`, `handoffs`); `createWorld`; `setSelectedAircraft`; `stepWorld`;
 * `createAccumulator` / `advanceWorld`; clock constants (`PHYSICS_HZ`,
 * `SIM_DT_S`, `MAX_PHYSICS_STEPS_PER_FRAME`); kinematics (`TURN_RATE_DEG_PER_S`,
 * `CLIMB_RATE_FT_PER_MIN`, `ACCEL_KT_PER_S`, `normalizeHeading`,
 * `shortestDeltaDeg`, `stepAircraft`); geo helpers (`LatLon`,
 * `NmEastNorth`, `latLonToNm`, `nmToLatLon`, `normalizeHeadingDeg`); Command IR
 * types, `INSTRUCTION_TYPES`, and fixtures; session event log (`SessionEvent`,
 * `SessionLog`); aircraft types (`Aircraft`, `Intent`), `createAircraft`,
 * `makeTestAircraft`, `nextAircraftId`; conflict alert lite (`evaluateConflictAlert`,
 * `CA_LATERAL_NM` / `CA_VERTICAL_FT`, `datablockAlertTint`);
 * ATPA in-trail pairing (`evaluateAtpa`, `world.alerts.atpa`);
 * nav fix registry (`buildFixRegistry`, `FixRegistry`);
 * nav geometry (`courseDeg`, fly-by radius, loc deviation, GS height); lateral FMS (`applyLateralFms`);
 * vertical FMS (`targetAltitudeFt`, `applyVerticalFms`); missed stub (`applyMissedFms`);
 * landing stub (`despawnLandedAircraft`, `acceptTowerHandoff`);
 * MSAW lite (`evaluateMsaw`, `MSAW_RED_BELOW_FT`, `msawFloorFt`);
 * seeded PRNG (`mulberry32`);
 * inbound handoff (`TrackHandoff`, `isRadioCommandAllowed`, `acceptInboundHandoff`).
 *
 * Import rule: `@core` depends on nothing in `src/*` except itself.
 */
export type {
  World,
  WorldNavigationContext,
  SimRate,
  Accumulator,
  ScheduledDeparture,
} from "./world";
export type {
  FlightPlan,
  FlightPlanError,
  FlightPlanErrorCode,
  FlightPlanCorrelationError,
  FlightPlanCorrelationErrorCode,
  FlightPlanCorrelationResult,
  AircraftSquawkUpdate,
  FlightPlanResult,
  FlightPlanModificationField,
  FlightPlanModificationValue,
  FlightPlanModificationResult,
  FlightPlanStatus,
  FlightType,
} from "./flightPlan";
export {
  allocateBeaconCode,
  associateFlightPlan,
  correlateFlightPlanForAircraft,
  createActiveFlightPlanFromTarget,
  createFlightPlan,
  deleteFlightPlan,
  deleteFlightPlanFromWorld,
  disassociateFlightPlan,
  flightPlanForAircraft,
  isValidAcid,
  isValidBeaconCode,
  modifyFlightPlan,
  releaseAssignedBeacon,
  transitionFlightPlan,
  validateFlightPlan,
  withAllocatedBeacon,
  updateAircraftSquawk,
} from "./flightPlan";
export {
  TRACON_BOUNDARY_RADIUS_NM,
  createWorld,
  despawnDepartedAircraft,
  setSelectedAircraft,
  stepWorld,
  createAccumulator,
  advanceWorld,
} from "./world";
export type {
  CenterHandoffContext,
  OutboundHandoffContext,
  OutboundHandoffDestination,
  TrackHandoff,
} from "./handoff";
export {
  CENTER_HANDOFF_AUTO_ACCEPT_DELAY_MS,
  OUTBOUND_HANDOFF_AUTO_ACCEPT_DELAY_MS,
  DEFAULT_CENTER_SECTOR_ID,
  DEFAULT_INBOUND_SECTOR_ID,
  DEFAULT_TOWER_SECTOR_ID,
  HANDOFF_PENDING_REASON,
  NONE_HANDOFF,
  acceptInboundHandoff,
  acceptOutboundHandoff,
  acceptPointout,
  assertHandoffOwned,
  convertPointoutToHandoff,
  handoffFor,
  initiateCenterHandoff,
  initiateOutboundHandoff,
  initiatePointout,
  isCenterHandoffEligible,
  isRadioCommandAllowed,
  offerDepartureHandoff,
  offerInboundHandoff,
  offerPointout,
  rejectPointout,
  setHandoffNone,
} from "./handoff";
export { PHYSICS_HZ, SIM_DT_S, MAX_PHYSICS_STEPS_PER_FRAME } from "./clock";
export { mulberry32 } from "./rng";
export {
  TURN_RATE_DEG_PER_S,
  CLIMB_RATE_FT_PER_MIN,
  ACCEL_KT_PER_S,
  normalizeHeading,
  shortestDeltaDeg,
  stepAircraft,
  turnRateDegPerSForSpeed,
} from "./kinematics";

export type { LatLon, NmEastNorth, NmPoint } from "./nav/geometry";
export type { MagneticHeadingDeg, TrueHeadingDeg } from "./nav/headingFrames";
export { magneticToTrueDeg, trueToMagneticDeg } from "./nav/headingFrames";
export {
  DEG2RAD,
  DIRECT_SEQUENCE_NM,
  FLYBY_CAP_NM,
  FLYBY_FLOOR_NM,
  FLYBY_MIN_TURN_DEG,
  alongTrackNm,
  courseChangeDeg,
  courseDeg,
  distanceNm,
  flyByStartNm,
  flyOverSequenceNm,
  latLonToNm,
  nmToLatLon,
  normalizeHeadingDeg,
  turnRadiusNm,
} from "./nav/geometry";
export type { Command, Instruction, ParseStage, TurnDir } from "./command/types";
export { INSTRUCTION_TYPES } from "./command/types";
export * from "./command/fixtures";
export type { SessionEvent } from "./events/session-log";
export { SessionLog } from "./events/session-log";
export type {
  Aircraft,
  AircraftInit,
  CwtWakeCategory,
  CrossConstraint,
  CrossRestriction,
  Intent,
  LateralMode,
  VerticalMode,
} from "./aircraft";
export {
  createAircraft,
  makeTestAircraft,
  nextAircraftId,
  normalizeCwtWakeCategory,
} from "./aircraft";
export type {
  AircraftPerformanceProfile,
  AircraftProfileDataset,
  PerformanceProvenance,
  PerformanceRegime,
  PerformanceRegimeLimits,
  PerformanceSource,
} from "./performance/types";
export {
  AircraftPerformanceRegistry,
  DEFAULT_PROFILE,
  isAircraftProfileDataset,
  performanceRegistry,
} from "./performance/registry";
export type { RegimeResolutionOptions } from "./performance/regime";
export { resolvePerformanceRegime } from "./performance/regime";
export type {
  AirspaceAreaTier,
  AlertTint,
  AlertTintTrack,
  AreaTierParameters,
  CaAlert,
  CaApproachGeometry,
  CaContext,
  CaRunwayGeometry,
  CaSeverity,
  CaTrackKinematics,
  CaTrackPose,
  CpaResult,
  MciAlert,
  WorldAlerts,
} from "./alerts/conflictAlert";
export {
  AREA_TIER_PARAMETERS,
  CA_DEFAULT_CLIMB_RATE_FT_PER_MIN,
  CA_LATERAL_NM,
  CA_VERTICAL_FT,
  caPairKey,
  caSeverityForCallsign,
  classifyAirspaceTier,
  computeKinematicCpa,
  datablockAlertTint,
  detectPairConflict,
  emptyWorldAlerts,
  evaluateConflictAlert,
  getAreaTierParameters,
  getVerticalRateFps,
  pairAirspaceTier,
  predictAltitudeFt,
  resolveCaContextFromCatalog,
} from "./alerts/conflictAlert";
export type {
  AtpaGeometryByVolumeId,
  AtpaPair,
  AtpaStatus,
  AtpaTrack,
  AtpaVolumeGeometry,
  AtpaVolumeParams,
} from "./alerts/atpa";
export {
  ATPA_ALERT_S,
  ATPA_WARNING_S,
  alongCourseDistanceNm,
  atpaPairKey,
  atpaStatus,
  evaluateAtpa,
  requiredSeparationNm,
  resolveAtpaGeometry,
} from "./alerts/atpa";
export type {
  MvaChart,
  MvaPolygon,
  MvaVertex,
  MsawAlert,
  MsawInhibitGeom,
  MsawSeverity,
} from "./alerts/msaw";
export {
  DEFAULT_MSAW_INHIBIT,
  MSAW_DATABLOCK_TAG,
  MSAW_FAF_DISTANCE_NM,
  MSAW_RED_BELOW_FT,
  evaluateMsaw,
  isMsawInhibited,
  msawFloorFt,
  msawSeverityForAltitude,
  msawSeverityForCallsign,
  polygonContains,
} from "./alerts/msaw";
export type { FixRegistry, FixRegistrySource, RegisteredFix } from "./nav/fixRegistry";
export { UnknownFixError, buildFixRegistry } from "./nav/fixRegistry";

export type {
  LocAxis,
  LocCatalog,
  LocCatalogApproach,
  LocDeviation,
  LocEnvelope,
} from "./nav/localizer";
export {
  LOC_ALONG_MIN_NM,
  LOC_BREAKOUT_S,
  LOC_CAPTURE_NORMALIZED_ERROR,
  LOC_DEFAULT_BEAM_HALF_WIDTH_DEG,
  LOC_DEFAULT_LENGTH_NM,
  LOC_INTERCEPT_HEADING_MAX_DEG,
  LOC_RETAIN_NORMALIZED_ERROR,
  kdemIls27LocAxis,
  locAxisForApproach,
  locDeviation,
  locEnvelope,
  locShouldBreakout,
  locShouldCapture,
} from "./nav/localizer";
export type { GsCatalog, GsCatalogApproach, GsDeviation, GsParams } from "./nav/glidepath";
export {
  FT_PER_NM,
  GS_CAPTURE_ALONG_MAX_NM,
  GS_CAPTURE_ALONG_MIN_NM,
  GS_CAPTURE_NORMALIZED_ERROR,
  GS_DEFAULT_ANGLE_DEG,
  GS_DEFAULT_FIELD_ELEV_FT,
  GS_DEFAULT_TCH_FT,
  GS_RETAIN_NORMALIZED_ERROR,
  gsAltitudeFt,
  gsDeviation,
  gsGeometricVsFpm,
  gsParamsForApproach,
  gsShouldCapture,
  gsShouldDropCapture,
  kdemIls27GsParams,
} from "./nav/glidepath";
export type { LateralFmsContext } from "./fms/lateral";
export { DEMO_ONE_NORTH_FIX_IDS, advanceStarLeg, applyLateralFms } from "./fms/lateral";
export type {
  JoinNamedProcedureArgs,
  JoinStarTransitionArgs,
  JoinStarTransitionResult,
  ProcedureJoin,
  ProcedureJoinCatalog,
  StarTransitionJoinReason,
} from "./fms/procedureJoin";
export {
  joinNamedProcedure,
  joinProcedureTransition,
  joinSidTransition,
  joinStarTransition,
  procedureRouteContainingFix,
} from "./fms/procedureJoin";
export type { MissedApproachSpec, MissedCatalog, MissedFmsContext } from "./fms/missed";
export {
  DEFAULT_DA_FT,
  DEFAULT_MISSED_CLIMB_FT,
  DEFAULT_MISSED_HEADING_DEG,
  MISSED_LEVEL_TOLERANCE_FT,
  applyMissedFms,
  beginMissedApproach,
  isLandingInhibited,
  isOnMissed,
  missedApproachId,
  missedSpecFor,
} from "./fms/missed";
export type { LandingFmsContext } from "./fms/landing";
export {
  LANDING_ALT_MAX_FT,
  LANDING_RW_DIST_NM,
  TOWER_HANDOFF_GATE_NM,
  TOWER_HANDOFF_INNER_NM,
  acceptTowerHandoff,
  despawnLandedAircraft,
  hasReachedThreshold,
  isTowerHandoffEligible,
} from "./fms/landing";
export type {
  AltConstraint,
  CatalogSid,
  CatalogSidEnrouteTransition,
  CatalogSidLeg,
  CatalogSidRunwayTransition,
  CatalogStar,
  CatalogStarLeg,
  CatalogStarTransition,
  GlidepathFmsContext,
  SpeedConstraint,
  VerticalCatalog,
  VerticalFmsContext,
} from "./fms/vertical";
export {
  applyGlidepathFms,
  applyVerticalFms,
  clearViaOnVectors,
  isOnCourseToFix,
  nextUnpassedConstraints,
  onFixSequenced,
  targetAltitudeFt,
  targetSpeedKt,
} from "./fms/vertical";
