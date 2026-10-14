/**
 * Analog: Raytheon STARS TCW/TDW Operator's Manual TI 6191.409 Rev30
 * §2.16.4 / Table 2-27. Trainer delta: report-driven straight-line prediction
 * and explicit stabilization/report-gap thresholds; not a STARS filter.
 */
import type { FmaAmz, FmaMember } from "./fmaGeometry";
import type { FmaPoint } from "../../scenario/procedures/types";
import type {
  FmaAssignment,
  FmaPrimaryCondition,
  FmaAlertTrackInput,
  FmaAlertInhibit,
  FmaAlertEpisode,
  FmaAlertTrackResult,
  FmaAlertState,
  FmaAlertEvaluation,
} from "./fmaTypes";

export type {
  FmaAssignment,
  FmaPrimaryCondition,
  FmaAlertTrackInput,
  FmaAlertInhibit,
  FmaAlertEpisode,
  FmaAlertTrackResult,
  FmaAlertState,
  FmaAlertEvaluation,
};

const SECONDS_PER_HOUR = 3600;

function resolveReportGapMs(reportPeriodMs?: number): number {
  return Math.max(2000, (reportPeriodMs ?? 1000) * 1.5);
}

function pruneInactiveKeys<V>(map: Map<string, V>, activeIds: ReadonlySet<string>): void {
  for (const id of [...map.keys()]) {
    if (!activeIds.has(id)) map.delete(id);
  }
}

export function createFmaAlertState(amzId: string | null = null): FmaAlertState {
  return {
    amzId,
    nextEpisode: 1,
    alignment: new Map(),
    assignedNozHistory: new Map(),
    episodes: new Map(),
    lastReportMs: new Map(),
  };
}

const normalize = (s: string) => s.trim().toUpperCase();
export function resolveFmaRunwayAssignment(
  scratchpads: readonly (string | undefined)[],
  amz: FmaAmz,
  aliases: Readonly<Record<string, readonly string[]>> = {},
): FmaAssignment {
  const recognized: string[] = [];
  for (const raw of scratchpads.slice(0, 2)) {
    if (!raw?.trim()) continue;
    const value = normalize(raw);
    const matches = new Set<string>();
    for (const member of amz.members) {
      const mNorm = normalize(member.runwayId);
      const mBare = mNorm.replace(/^0+/, "");
      const isMatch =
        value === mNorm ||
        value === mBare ||
        value === `I${mNorm}` ||
        value === `I${mBare}` ||
        value === `R${mNorm}` ||
        value === `R${mBare}` ||
        (aliases[member.runwayId] ?? []).some((a) => {
          const aNorm = normalize(a);
          return value === aNorm || value === aNorm.replace(/^0+/, "");
        });
      if (isMatch) matches.add(member.runwayId);
    }
    for (const runwayId of matches) recognized.push(runwayId);
  }
  const unique = [...new Set(recognized)];
  if (unique.length === 0) return { kind: "NONE" };
  if (unique.length > 1) return { kind: "AMBIGUOUS", runwayIds: unique.sort() };
  return { kind: "RUNWAY", runwayId: unique[0]! };
}

const EPS = 1e-9;
function onSegment(a: FmaPoint, b: FmaPoint, p: FmaPoint): boolean {
  const cross = (p.xNm - a.xNm) * (b.yNm - a.yNm) - (p.yNm - a.yNm) * (b.xNm - a.xNm);
  return (
    Math.abs(cross) <= EPS &&
    p.xNm >= Math.min(a.xNm, b.xNm) - EPS &&
    p.xNm <= Math.max(a.xNm, b.xNm) + EPS &&
    p.yNm >= Math.min(a.yNm, b.yNm) - EPS &&
    p.yNm <= Math.max(a.yNm, b.yNm) + EPS
  );
}
export function fmaPolygonContains(polygon: readonly FmaPoint[], point: FmaPoint): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!,
      b = polygon[i]!;
    if (onSegment(a, b, point)) return true;
    if (
      a.yNm > point.yNm !== b.yNm > point.yNm &&
      point.xNm < ((b.xNm - a.xNm) * (point.yNm - a.yNm)) / (b.yNm - a.yNm) + a.xNm
    )
      inside = !inside;
  }
  return inside;
}
function orient(a: FmaPoint, b: FmaPoint, c: FmaPoint) {
  return (b.xNm - a.xNm) * (c.yNm - a.yNm) - (b.yNm - a.yNm) * (c.xNm - a.xNm);
}
function segmentsIntersect(a: FmaPoint, b: FmaPoint, c: FmaPoint, d: FmaPoint): boolean {
  const o1 = orient(a, b, c),
    o2 = orient(a, b, d),
    o3 = orient(c, d, a),
    o4 = orient(c, d, b);
  return (
    (((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) &&
      ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
export function fmaSegmentIntersectsPolygon(
  start: FmaPoint,
  end: FmaPoint,
  polygon: readonly FmaPoint[],
): boolean {
  if (fmaPolygonContains(polygon, start) || fmaPolygonContains(polygon, end)) return true;
  return polygon.some((point, i) =>
    segmentsIntersect(start, end, point, polygon[(i + 1) % polygon.length]!),
  );
}
function angleDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}
function runwayObservation(amz: FmaAmz, report: FmaAlertTrackInput["report"]): FmaMember[] {
  const point = { xNm: report.xNm, yNm: report.yNm };
  return amz.members.filter((member) => {
    const t = (member.courseTrueDeg * Math.PI) / 180;
    const dx = point.xNm - member.threshold.xNm,
      dy = point.yNm - member.threshold.yNm;
    const along = dx * Math.sin(t) + dy * Math.cos(t);
    const cross = dx * Math.cos(t) - dy * Math.sin(t);
    return (
      along <= EPS &&
      along >= -amz.dimensions.captureLengthNm &&
      Math.abs(cross) <= amz.monitoring.alignmentHalfWidthNm &&
      Number.isFinite(report.speedKt) &&
      report.speedKt > 0 &&
      angleDelta(report.groundTrackDeg, member.courseTrueDeg) <= amz.monitoring.courseToleranceDeg
    );
  });
}
function runwayHasEnabledNtz(
  amz: FmaAmz,
  runwayId: string,
  disabled: ReadonlySet<string>,
): boolean {
  return amz.ntzs.some(
    (n) => (n.leftRunwayId === runwayId || n.rightRunwayId === runwayId) && !disabled.has(n.id),
  );
}

/** Pure per-TCW evaluator. `validReportIds` marks a newly accepted sensor report; cached/coasted poses cannot extend stabilization. */
export function evaluateFmaAlerts(input: {
  state: FmaAlertState;
  amz: FmaAmz | null;
  tracks: readonly FmaAlertTrackInput[];
  nowSimMs: number;
  validReportIds?: ReadonlySet<string>;
  invalidReportIds?: ReadonlySet<string>;
  aliases?: Readonly<Record<string, readonly string[]>>;
  inhibit?: FmaAlertInhibit;
}): FmaAlertEvaluation {
  const { state, amz } = input;
  if (!amz || state.amzId !== amz.id) {
    const cleared = createFmaAlertState(amz?.id ?? null);
    if (!amz) return { state: cleared, tracks: new Map(), outlines: new Map(), diagnostics: [] };
    return evaluateFmaAlerts({ ...input, state: cleared });
  }
  const next: FmaAlertState = {
    ...state,
    alignment: new Map(state.alignment),
    assignedNozHistory: new Map(state.assignedNozHistory),
    episodes: new Map(state.episodes),
    lastReportMs: new Map(state.lastReportMs),
  };
  const result = new Map<string, FmaAlertTrackResult>();
  const outlines = new Map<string, "RED" | "YELLOW">();
  const diagnostics: string[] = [];
  const allZonesDisabled =
    amz.ntzs.length === 0 || amz.ntzs.every((z) => input.inhibit?.ntzIds?.has(z.id));
  const activeIds = new Set<string>();
  for (const track of input.tracks) {
    if (
      !track.tracked ||
      !track.associated ||
      !fmaPolygonContains(amz.boundary.points, { xNm: track.report.xNm, yNm: track.report.yNm })
    )
      continue;
    if (input.invalidReportIds?.has(track.aircraftId)) next.alignment.delete(track.aircraftId);
    activeIds.add(track.aircraftId);
    const assignment = resolveFmaRunwayAssignment(track.scratchpads, amz, input.aliases);
    if (assignment.kind === "AMBIGUOUS")
      diagnostics.push(
        `${track.aircraftId}: conflicting runway scratchpads ${assignment.runwayIds.join("/")}`,
      );
    const report = track.report;
    const observation = track.observation ?? report;
    const altitudeEligible =
      !amz.verticalLimits ||
      (observation.altitudeFt != null &&
        observation.altitudeFt >= amz.verticalLimits.floorFt &&
        observation.altitudeFt <= amz.verticalLimits.ceilingFt);
    const newReport =
      !input.invalidReportIds?.has(track.aircraftId) &&
      input.validReportIds?.has(track.aircraftId) === true &&
      Number.isFinite(observation.reportedAtSimMs) &&
      observation.reportedAtSimMs > (next.lastReportMs.get(track.aircraftId) ?? -Infinity);
    let alignedRunway: string | null = null;
    if (newReport) {
      next.lastReportMs.set(track.aircraftId, observation.reportedAtSimMs);
      const observed = altitudeEligible ? runwayObservation(amz, observation) : [];
      const prior = next.alignment.get(track.aircraftId);
      const reportGapMs = resolveReportGapMs(track.reportPeriodMs);
      const continuous =
        observed.length === 1 &&
        prior?.runwayId === observed[0]!.runwayId &&
        observation.reportedAtSimMs - prior.lastReportMs <= reportGapMs;
      if (observed.length === 1) {
        const member = observed[0]!;
        const sinceMs = continuous ? prior!.sinceMs : observation.reportedAtSimMs;
        next.alignment.set(track.aircraftId, {
          runwayId: member.runwayId,
          sinceMs,
          lastReportMs: observation.reportedAtSimMs,
        });
        if (observation.reportedAtSimMs - sinceMs >= amz.monitoring.stabilizationS * 1000)
          alignedRunway = member.runwayId;
      } else next.alignment.delete(track.aircraftId);
    } else {
      const prior = next.alignment.get(track.aircraftId);
      const reportGapMs = resolveReportGapMs(track.reportPeriodMs);
      if (
        input.invalidReportIds?.has(track.aircraftId) ||
        (prior && input.nowSimMs - prior.lastReportMs > reportGapMs)
      )
        next.alignment.delete(track.aircraftId);
      else if (prior && prior.lastReportMs - prior.sinceMs >= amz.monitoring.stabilizationS * 1000)
        alignedRunway = prior.runwayId;
    }
    const position = { xNm: report.xNm, yNm: report.yNm };
    const runwayForHistory = assignment.kind === "RUNWAY" ? assignment.runwayId : null;
    const history = next.assignedNozHistory.get(track.aircraftId);
    if (history && history.runwayId !== runwayForHistory)
      next.assignedNozHistory.delete(track.aircraftId);
    const observationPosition = { xNm: observation.xNm, yNm: observation.yNm };
    if (
      newReport &&
      altitudeEligible &&
      runwayForHistory &&
      amz.members.some(
        (m) =>
          m.runwayId === runwayForHistory && fmaPolygonContains(m.noz.points, observationPosition),
      )
    ) {
      next.assignedNozHistory.set(track.aircraftId, { runwayId: runwayForHistory, seen: true });
    }
    const disabled = input.inhibit?.ntzIds ?? new Set<string>();
    const trackInhibited = input.inhibit?.aircraftIds?.has(track.aircraftId) === true;
    const eligible = !trackInhibited && !allZonesDisabled && altitudeEligible;
    const inAmzArrival =
      track.arrivalAirportId?.trim().toUpperCase() === amz.airportId.toUpperCase();
    const currentWarningPosition = newReport ? observationPosition : position;
    const previousWarningNtzId =
      next.episodes.get(track.aircraftId)?.condition === "NTZ_WARNING"
        ? next.episodes.get(track.aircraftId)?.ntzIds[0]
        : undefined;
    const warningNtz =
      runwayForHistory && history?.runwayId === runwayForHistory
        ? amz.ntzs.find(
            (n) =>
              !disabled.has(n.id) &&
              (n.leftRunwayId === runwayForHistory || n.rightRunwayId === runwayForHistory) &&
              fmaPolygonContains(n.polygon.points, currentWarningPosition) &&
              (newReport || n.id === previousWarningNtzId),
          )
        : undefined;
    const cautionNtz =
      Number.isFinite(report.groundTrackDeg) && Number.isFinite(report.speedKt)
        ? amz.ntzs.find(
            (n) =>
              !disabled.has(n.id) &&
              fmaSegmentIntersectsPolygon(
                position,
                {
                  xNm:
                    report.xNm +
                    ((report.speedKt * amz.monitoring.cautionHorizonS) / SECONDS_PER_HOUR) *
                      Math.sin((report.groundTrackDeg * Math.PI) / 180),
                  yNm:
                    report.yNm +
                    ((report.speedKt * amz.monitoring.cautionHorizonS) / SECONDS_PER_HOUR) *
                      Math.cos((report.groundTrackDeg * Math.PI) / 180),
                },
                n.polygon.points,
              ),
          )
        : undefined;
    const loss =
      (track.surveillance === "CST" || track.surveillance === "FROZEN") &&
      assignment.kind === "RUNWAY" &&
      runwayHasEnabledNtz(amz, assignment.runwayId, disabled);
    const runwayMismatch =
      inAmzArrival &&
      alignedRunway != null &&
      assignment.kind !== "AMBIGUOUS" &&
      (assignment.kind === "NONE" || assignment.runwayId !== alignedRunway) &&
      runwayHasEnabledNtz(amz, alignedRunway, disabled);
    let primary: FmaPrimaryCondition | null = null;
    if (trackInhibited) {
      next.alignment.delete(track.aircraftId);
      next.assignedNozHistory.delete(track.aircraftId);
      next.episodes.delete(track.aircraftId);
    }
    if (eligible) {
      if (warningNtz) primary = "NTZ_WARNING";
      else if (loss && assignment.kind === "RUNWAY") primary = "SURVEILLANCE_LOST";
      else if (runwayMismatch) primary = "RUNWAY_ERROR";
      else if (cautionNtz) primary = "NTZ_CAUTION";
    }
    const old = next.episodes.get(track.aircraftId);
    let episode: FmaAlertEpisode | null = null;
    const ntz = warningNtz ?? (primary === "NTZ_CAUTION" ? cautionNtz : undefined);
    if (primary) {
      const qualifiedRunway = assignment.kind === "RUNWAY" ? assignment.runwayId : alignedRunway;
      const identity =
        primary === "SURVEILLANCE_LOST"
          ? `${primary}:${assignment.kind === "RUNWAY" ? assignment.runwayId : assignment.kind}`
          : primary === "RUNWAY_ERROR"
            ? `${primary}:${assignment.kind === "RUNWAY" ? assignment.runwayId : assignment.kind}:${alignedRunway ?? "UNRESOLVED"}`
            : `${primary}:${ntz?.id ?? qualifiedRunway ?? assignment.kind}`;
      if (old?.id.startsWith(identity + "#")) episode = old;
      else {
        episode = {
          id: `${identity}#${next.nextEpisode++}`,
          condition: primary,
          onsetSimMs: input.nowSimMs,
          amzId: amz.id,
          runwayIds: ntz
            ? [ntz.leftRunwayId, ntz.rightRunwayId]
            : primary === "RUNWAY_ERROR"
              ? [
                  ...new Set([
                    ...(assignment.kind === "RUNWAY" ? [assignment.runwayId] : []),
                    ...(alignedRunway ? [alignedRunway] : []),
                  ]),
                ]
              : qualifiedRunway
                ? [qualifiedRunway]
                : [],
          ntzIds: ntz ? [ntz.id] : [],
          evidence:
            primary === "NTZ_WARNING"
              ? ["assigned-NOZ then report in enabled NTZ"]
              : primary === "SURVEILLANCE_LOST" && qualifiedRunway
                ? [`SURVEILLANCE_LOST for assigned runway ${qualifiedRunway}`]
                : primary === "RUNWAY_ERROR"
                  ? [
                      `RUNWAY_ERROR assigned ${assignment.kind === "RUNWAY" ? assignment.runwayId : assignment.kind}, observed ${alignedRunway ?? "UNRESOLVED"}`,
                    ]
                  : [primary],
        };
      }
      next.episodes.set(track.aircraftId, episode);
      if (primary === "NTZ_WARNING" && ntz) outlines.set(ntz.id, "RED");
      else if (primary === "NTZ_CAUTION" && ntz && outlines.get(ntz.id) !== "RED")
        outlines.set(ntz.id, "YELLOW");
    } else next.episodes.delete(track.aircraftId);
    result.set(track.aircraftId, {
      aircraftId: track.aircraftId,
      assignment,
      observedRunwayId: alignedRunway,
      primary,
      episode,
      onset: Boolean(episode && episode !== old),
      supplementary: { nom: !trackInhibited && track.surveillance === "NOM" },
      ...(assignment.kind === "AMBIGUOUS"
        ? { diagnostic: "Multiple explicit runway assignments" }
        : {}),
    });
  }
  pruneInactiveKeys(next.alignment, activeIds);
  pruneInactiveKeys(next.assignedNozHistory, activeIds);
  pruneInactiveKeys(next.episodes, activeIds);
  pruneInactiveKeys(next.lastReportMs, activeIds);
  return { state: next, tracks: result, outlines, diagnostics };
}
