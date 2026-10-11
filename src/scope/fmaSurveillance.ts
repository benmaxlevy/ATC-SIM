/**
 * Analog: TI 6191.409 §2.16.4 surveillance lost / CST and NOM, and
 * §§6.16.8–9 frozen-track removal (Raytheon STARS TCW/TDW Operator's Manual).
 * Trainer delta: report coast is straight constant-ground-track projection;
 * no proprietary filter or live sensor protocol is modeled.
 */
import type { SurveillanceReport } from "./surveillance";

export type FmaSourceStatus = "UNKNOWN" | "SELECTED_FAST_SOURCE_LOST" | "ALL_SOURCES_LOST";
export type FmaSurveillanceCode = "CURRENT" | "NOM" | "CST" | "FROZEN";

export interface FmaSensorStatus {
  /** null means this TCW has no adapted/known fast-update source. */
  selectedFastSourceId: string | null;
  /** null means other-source health is unknown; [] means none are reporting. */
  reportingSourceIds: readonly string[] | null;
}

export interface FmaSensorFixture {
  sensorStatus: FmaSensorStatus;
  /** Complete FMA-only reports for this update; [] intentionally means a gap. */
  reports: readonly SurveillanceReport[];
}

export interface FmaRetainedTrack {
  aircraftId: string;
  /** Last valid sensor report, never an Aircraft/World pose. */
  report: Readonly<SurveillanceReport>;
  /** Last report projected by no more than the adapted coast-out interval. */
  coastedReport: Readonly<SurveillanceReport>;
  elapsedLossS: number;
  sourceStatus: FmaSourceStatus;
  code: FmaSurveillanceCode;
  frozen: boolean;
}

export interface FmaSurveillanceState {
  enabled: boolean;
  selectedAmzId: string | null;
  sensorStatus: Readonly<FmaSensorStatus> | null;
  sensorFixture: Readonly<FmaSensorFixture> | null;
  monitoring: Readonly<{ surveillanceLossS: number; coastOutS: number }>;
  tracks: ReadonlyMap<string, FmaRetainedTrack>;
  /** Timestamp tombstones prevent a released pose being re-ingested next tick. */
  reportWatermarks: ReadonlyMap<string, number>;
  lastUpdatedSimMs: number | null;
}

export const FMA_SURVEILLANCE_DEFAULTS = Object.freeze({
  lossS: 10,
  coastOutS: 30,
});

export function createFmaSurveillanceState(): FmaSurveillanceState {
  return {
    enabled: false,
    selectedAmzId: null,
    sensorStatus: null,
    sensorFixture: null,
    monitoring: Object.freeze({
      surveillanceLossS: FMA_SURVEILLANCE_DEFAULTS.lossS,
      coastOutS: FMA_SURVEILLANCE_DEFAULTS.coastOutS,
    }),
    tracks: new Map(),
    reportWatermarks: new Map(),
    lastUpdatedSimMs: null,
  };
}

/** FMA enable/AMZ changes are display-local and release all retained poses. */
export function configureFmaSurveillance(
  state: FmaSurveillanceState,
  enabled: boolean,
  selectedAmzId: string | null,
  monitoring: { surveillanceLossS: number; coastOutS: number } = state.monitoring,
): FmaSurveillanceState {
  const validMonitoring =
    Number.isFinite(monitoring.surveillanceLossS) &&
    monitoring.surveillanceLossS > 0 &&
    Number.isFinite(monitoring.coastOutS) &&
    monitoring.coastOutS > 0;
  if (!validMonitoring)
    throw new RangeError("FMA monitoring intervals must be finite and positive");
  if (
    state.enabled === enabled &&
    state.selectedAmzId === selectedAmzId &&
    state.monitoring.surveillanceLossS === monitoring.surveillanceLossS &&
    state.monitoring.coastOutS === monitoring.coastOutS
  )
    return state;
  return {
    ...state,
    enabled,
    selectedAmzId: enabled ? selectedAmzId : null,
    sensorStatus: enabled ? state.sensorStatus : null,
    sensorFixture: enabled ? state.sensorFixture : null,
    monitoring: Object.freeze({ ...monitoring }),
    tracks: new Map(),
    lastUpdatedSimMs: null,
  };
}

/**
 * Deterministic source-status seam for synthetic acceptance/browser exercises.
 * It does not create a controller command, report, or sensor-health claim.
 */
export function setFmaSensorStatus(
  state: FmaSurveillanceState,
  status: FmaSensorStatus | null,
): FmaSurveillanceState {
  return {
    ...state,
    sensorStatus:
      status == null
        ? null
        : Object.freeze({
            selectedFastSourceId:
              typeof status.selectedFastSourceId === "string" &&
              status.selectedFastSourceId.trim().length > 0
                ? status.selectedFastSourceId
                : null,
            reportingSourceIds:
              status.reportingSourceIds == null ||
              !status.reportingSourceIds.every(
                (id) => typeof id === "string" && id.trim().length > 0,
              )
                ? null
                : Object.freeze([...status.reportingSourceIds]),
          }),
  };
}

/**
 * Replace the FMA report feed with deterministic synthetic reports. An empty
 * array is a real interruption; ordinary SITE reports cannot mask the gap.
 */
export function setFmaSensorFixture(
  state: FmaSurveillanceState,
  fixture: FmaSensorFixture | null,
): FmaSurveillanceState {
  if (fixture == null) {
    return { ...setFmaSensorStatus(state, null), sensorFixture: null };
  }
  const status = setFmaSensorStatus(state, fixture.sensorStatus).sensorStatus!;
  const reports = Object.freeze(fixture.reports.map((report) => Object.freeze({ ...report })));
  return {
    ...state,
    sensorStatus: status,
    sensorFixture: Object.freeze({ sensorStatus: status, reports }),
  };
}

function isUsableReport(report: SurveillanceReport, nowSimMs: number): boolean {
  return (
    typeof report.aircraftId === "string" &&
    report.aircraftId.length > 0 &&
    Number.isFinite(report.xNm) &&
    Number.isFinite(report.yNm) &&
    Number.isFinite(report.headingDeg) &&
    report.headingDeg >= 0 &&
    report.headingDeg < 360 &&
    Number.isFinite(report.speedKt) &&
    report.speedKt >= 0 &&
    Number.isFinite(report.altitudeFt) &&
    Number.isFinite(report.reportedAtSimMs) &&
    report.reportedAtSimMs >= 0 &&
    report.reportedAtSimMs <= nowSimMs &&
    (report.sourceSiteId == null ||
      (typeof report.sourceSiteId === "string" && report.sourceSiteId.trim().length > 0)) &&
    (report.paint === "fused-puck" || report.paint === "multi-rect" || report.paint === "site-rect")
  );
}

function sourceStatusFor(
  status: Readonly<FmaSensorStatus> | null,
  reportSourceSiteId?: string | null,
): FmaSourceStatus {
  if (
    status?.selectedFastSourceId == null ||
    status.selectedFastSourceId.trim().length === 0 ||
    status.reportingSourceIds == null
  )
    return "UNKNOWN";
  if (status.reportingSourceIds.includes(status.selectedFastSourceId)) return "UNKNOWN";
  if (status.reportingSourceIds.length === 0) return "ALL_SOURCES_LOST";
  if (
    reportSourceSiteId == null ||
    reportSourceSiteId === status.selectedFastSourceId ||
    !status.reportingSourceIds.includes(reportSourceSiteId)
  ) {
    return "UNKNOWN";
  }
  return "SELECTED_FAST_SOURCE_LOST";
}

function coastReport(report: SurveillanceReport, elapsedLossS: number): SurveillanceReport {
  const seconds = Math.max(0, elapsedLossS);
  const distanceNm = (report.speedKt * seconds) / 3600;
  const headingRad = (report.headingDeg * Math.PI) / 180;
  return {
    ...report,
    xNm: report.xNm + distanceNm * Math.sin(headingRad),
    yNm: report.yNm + distanceNm * Math.cos(headingRad),
  };
}

export interface FmaSurveillanceTick {
  nowSimMs: number;
  reports: readonly SurveillanceReport[];
  /** Existing aircraft/track identity only; never supplies a display pose. */
  liveTrackIds: ReadonlySet<string>;
  /** Associated tracks eligible for FMA lifecycle; omitted for pure adapters. */
  associatedTrackIds?: ReadonlySet<string>;
  lossS?: number;
  coastOutS?: number;
}

/**
 * Advance retained display state from simulation time and valid reports.
 * Call only from the simulation update observer when simTimeMs advances.
 */
export function advanceFmaSurveillance(
  state: FmaSurveillanceState,
  tick: FmaSurveillanceTick,
): FmaSurveillanceState {
  if (!state.enabled) return state.tracks.size ? { ...state, tracks: new Map() } : state;
  if (!Number.isFinite(tick.nowSimMs) || tick.nowSimMs < 0) return state;
  if (state.lastUpdatedSimMs != null && tick.nowSimMs < state.lastUpdatedSimMs) {
    return { ...state, tracks: new Map(), lastUpdatedSimMs: tick.nowSimMs };
  }
  if (state.lastUpdatedSimMs === tick.nowSimMs) return state;

  const retained = new Map<string, FmaRetainedTrack>();
  const reportWatermarks = new Map(state.reportWatermarks);
  const allowed = (id: string) =>
    tick.liveTrackIds.has(id) &&
    (tick.associatedTrackIds == null || tick.associatedTrackIds.has(id));
  for (const [id, previous] of state.tracks) {
    if (allowed(id)) retained.set(id, previous);
  }

  for (const report of tick.reports) {
    if (!allowed(report.aircraftId) || !isUsableReport(report, tick.nowSimMs)) continue;
    if (report.reportedAtSimMs <= (reportWatermarks.get(report.aircraftId) ?? -Infinity)) continue;
    reportWatermarks.set(report.aircraftId, report.reportedAtSimMs);
    const immutableReport = Object.freeze({ ...report });
    const sourceStatus = sourceStatusFor(state.sensorStatus, report.sourceSiteId);
    retained.set(
      report.aircraftId,
      Object.freeze({
        aircraftId: report.aircraftId,
        report: immutableReport,
        coastedReport: immutableReport,
        elapsedLossS: 0,
        sourceStatus,
        code: sourceStatus === "SELECTED_FAST_SOURCE_LOST" ? "NOM" : "CURRENT",
        frozen: false,
      }),
    );
  }

  const lossS = tick.lossS ?? state.monitoring.surveillanceLossS;
  const coastOutS = tick.coastOutS ?? state.monitoring.coastOutS;
  const next = new Map<string, FmaRetainedTrack>();
  for (const [id, previous] of retained) {
    const ageS = Math.max(0, (tick.nowSimMs - previous.report.reportedAtSimMs) / 1000);
    const frozen = ageS >= coastOutS;
    const currentSourceStatus = sourceStatusFor(state.sensorStatus, previous.report.sourceSiteId);
    const code: FmaSurveillanceCode = frozen
      ? "FROZEN"
      : ageS >= lossS
        ? "CST"
        : currentSourceStatus === "SELECTED_FAST_SOURCE_LOST"
          ? "NOM"
          : "CURRENT";
    const coastedReport = Object.freeze(
      coastReport(previous.report as SurveillanceReport, Math.min(ageS, coastOutS)),
    );
    next.set(
      id,
      Object.freeze({
        ...previous,
        coastedReport,
        elapsedLossS: ageS,
        sourceStatus: currentSourceStatus,
        code,
        frozen,
      }),
    );
  }
  return { ...state, tracks: next, reportWatermarks, lastUpdatedSimMs: tick.nowSimMs };
}

/** Replaces the map immutably; inhibition and deletion never revive old data. */
export function releaseFmaTrack(
  state: FmaSurveillanceState,
  aircraftId: string,
): FmaSurveillanceState {
  if (!state.tracks.has(aircraftId)) return state;
  const tracks = new Map(state.tracks);
  tracks.delete(aircraftId);
  return { ...state, tracks };
}

/** Called by later inhibition controls after resolving affected runway/NTZ IDs. */
export function releaseFmaTracks(
  state: FmaSurveillanceState,
  aircraftIds: Iterable<string>,
): FmaSurveillanceState {
  const tracks = new Map(state.tracks);
  for (const id of aircraftIds) tracks.delete(id);
  return tracks.size === state.tracks.size ? state : { ...state, tracks };
}

/** Lifecycle-only cleanup that is safe while paused; it never ages a report. */
export function pruneFmaSurveillance(
  state: FmaSurveillanceState,
  liveTrackIds: ReadonlySet<string>,
  associatedTrackIds?: ReadonlySet<string>,
): FmaSurveillanceState {
  const tracks = new Map(
    [...state.tracks].filter(
      ([id]) => liveTrackIds.has(id) && (associatedTrackIds == null || associatedTrackIds.has(id)),
    ),
  );
  return tracks.size === state.tracks.size ? state : { ...state, tracks };
}

export function clearFmaSurveillance(state: FmaSurveillanceState): FmaSurveillanceState {
  return {
    ...state,
    tracks: new Map(),
    reportWatermarks: new Map(),
    sensorStatus: null,
    sensorFixture: null,
    lastUpdatedSimMs: null,
  };
}

/** FMA display projection; never writes a coasted pose into the SITE sampler. */
export function fmaPresentationReport(
  state: FmaSurveillanceState,
  aircraftId: string,
): Readonly<SurveillanceReport> | undefined {
  return state.enabled ? state.tracks.get(aircraftId)?.coastedReport : undefined;
}
