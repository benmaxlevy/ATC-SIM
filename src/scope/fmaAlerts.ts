/** Per-TCW FMA alert adapter; all World reads are snapshots, never writes. */
import {
  evaluateFmaAlerts,
  flightPlanForAircraft,
  resolveFmaRunwayAssignment,
  type FmaAlertEvaluation,
  type FmaAlertTrackInput,
  type World,
} from "@core";
import { releaseFmaTracksView, type ScopeView } from "./scopeView";
import type { SurveillanceReport } from "./surveillance";
import { reportPeriodMs } from "./surveillance";
import { getAircraftDestination } from "./systemLists";

/** Stable operator-facing wording for the existing Preview/status readout. */
export function formatFmaAlertDiagnostic(messages: readonly string[]): string | null {
  return messages.some((message) => message.includes("conflicting runway scratchpads"))
    ? "FMA: CONFLICTING RUNWAY ASSIGNMENT"
    : null;
}

function usableReport(report: SurveillanceReport, nowSimMs: number): boolean {
  return (
    typeof report.aircraftId === "string" &&
    report.aircraftId.trim().length > 0 &&
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

/**
 * Simulation observer called after FMA report retention. Assignment reads only
 * filed or manual scratchpads; the datablock's automatic approach shorthand is
 * intentionally excluded. `reportEvents` makes rejected malformed reports
 * break alignment rather than letting the retained last-good pose mask them.
 */
export function observeFmaAlertRuntime(
  view: ScopeView,
  world: World,
  nowSimMs: number,
  reportEvents: readonly SurveillanceReport[] = [],
): FmaAlertEvaluation {
  const selected = view.fmaSurveillance.selectedAmzId;
  const amz = view.fmaSurveillance.enabled
    ? (view.fmaAmzs.find((candidate) => candidate.id === selected) ?? null)
    : null;
  if (!view.fmaSurveillance.enabled || !amz) {
    view.fmaAlertState = evaluateFmaAlerts({
      state: view.fmaAlertState,
      amz: null,
      tracks: [],
      nowSimMs,
    }).state;
    view.fmaAlertResults = new Map();
    view.fmaAlertOutlines = new Map();
    view.fmaAlertDiagnostics = [];
    return {
      state: view.fmaAlertState,
      tracks: view.fmaAlertResults,
      outlines: view.fmaAlertOutlines,
      diagnostics: [],
    };
  }
  const disabledNtzs = view.fmaAlertInhibit.ntzIds ?? new Set<string>();
  const allZonesDisabled =
    amz.ntzs.length === 0 || amz.ntzs.every((zone) => disabledNtzs.has(zone.id));
  const frozenToRelease: string[] = [];
  for (const [aircraftId, retained] of view.fmaSurveillance.tracks) {
    if (!retained.frozen) continue;
    if (view.fmaAlertInhibit.aircraftIds?.has(aircraftId)) {
      frozenToRelease.push(aircraftId);
      continue;
    }
    const aircraft = world.aircraft.find((candidate) => candidate.id === aircraftId);
    const track = view.tracks.get(aircraftId);
    const plan = flightPlanForAircraft(world, aircraftId);
    if (!aircraft || !track || !plan) continue;
    const assignment = resolveFmaRunwayAssignment(
      [
        plan.scratchpads?.[0] || track.manualSp1 || "",
        plan.scratchpads?.[1] || track.manualSp2 || "",
      ],
      amz,
      amz.runwayAliases,
    );
    const noEnabledAdjacentZone =
      assignment.kind === "RUNWAY" &&
      !amz.ntzs.some(
        (zone) =>
          (zone.leftRunwayId === assignment.runwayId ||
            zone.rightRunwayId === assignment.runwayId) &&
          !disabledNtzs.has(zone.id),
      );
    if (allZonesDisabled || noEnabledAdjacentZone) frozenToRelease.push(aircraftId);
  }
  if (frozenToRelease.length > 0) releaseFmaTracksView(view, frozenToRelease);
  const retainedTracks: FmaAlertTrackInput[] = [];
  for (const [aircraftId, retained] of view.fmaSurveillance.tracks) {
    const aircraft = world.aircraft.find((candidate) => candidate.id === aircraftId);
    const track = view.tracks.get(aircraftId);
    const plan = flightPlanForAircraft(world, aircraftId);
    if (!aircraft || !track || !plan) continue;
    const observed = retained.report;
    const projected = retained.coastedReport;
    const expectedCadence =
      reportPeriodMs(view.surveillanceMode, view.radarSites, observed.xNm, observed.yNm) ?? 1000;
    retainedTracks.push({
      aircraftId,
      associated: true,
      tracked: track.tracked === true && track.unassociated !== true,
      arrivalAirportId: getAircraftDestination(world, aircraft),
      scratchpads: [
        plan.scratchpads?.[0] || track.manualSp1 || "",
        plan.scratchpads?.[1] || track.manualSp2 || "",
      ],
      observation: {
        xNm: observed.xNm,
        yNm: observed.yNm,
        groundTrackDeg: observed.headingDeg,
        speedKt: observed.speedKt,
        altitudeFt: observed.altitudeFt,
        reportedAtSimMs: observed.reportedAtSimMs,
      },
      report: {
        xNm: projected.xNm,
        yNm: projected.yNm,
        groundTrackDeg: observed.headingDeg,
        speedKt: observed.speedKt,
        altitudeFt: projected.altitudeFt,
        reportedAtSimMs: observed.reportedAtSimMs,
      },
      reportPeriodMs: expectedCadence,
      surveillance: retained.code,
    });
  }
  const validReportIds = new Set(
    retainedTracks
      .filter(
        (row) =>
          row.observation!.reportedAtSimMs >
          (view.fmaAlertState.lastReportMs.get(row.aircraftId) ?? -Infinity),
      )
      .map((row) => row.aircraftId),
  );
  const invalidReportIds = new Set(
    reportEvents
      .filter((report) => !usableReport(report, nowSimMs))
      .map((report) => report.aircraftId),
  );
  const result = evaluateFmaAlerts({
    state: view.fmaAlertState,
    amz,
    tracks: retainedTracks,
    nowSimMs,
    validReportIds,
    invalidReportIds,
    aliases: amz.runwayAliases,
    inhibit: view.fmaAlertInhibit,
  });
  view.fmaAlertState = result.state;
  view.fmaAlertResults = result.tracks;
  view.fmaAlertOutlines = result.outlines;
  view.fmaAlertDiagnostics = result.diagnostics;
  for (const [id, track] of result.tracks) {
    const episode = track.episode;
    if (!episode) continue;
    if (track.onset) {
      view.fmaSpeechEvents.push({ type: "onset", episodeId: episode.id, aircraftId: id });
    }
  }
  const activeEpisodes = new Set(
    [...result.tracks.values()].flatMap((track) => (track.episode ? [track.episode.id] : [])),
  );
  for (const episodeId of view.fmaAcknowledgedEpisodeIds) {
    if (!activeEpisodes.has(episodeId)) view.fmaAcknowledgedEpisodeIds.delete(episodeId);
  }
  for (const episodeId of view.fmaSilencedEpisodeIds) {
    if (!activeEpisodes.has(episodeId)) view.fmaSilencedEpisodeIds.delete(episodeId);
  }
  return result;
}
