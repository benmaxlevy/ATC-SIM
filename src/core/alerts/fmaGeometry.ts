import { magneticToTrueDeg } from "../nav/headingFrames";
import type {
  ProcedureCatalog,
  FmaGroupAdaptation,
  FmaPoint,
} from "../../scenario/procedures/types";

export type FmaDiagnostic = { path: string; message: string };
export interface FmaPolygon {
  points: FmaPoint[];
}
export interface FmaMember {
  runwayId: string;
  approachId: string;
  threshold: FmaPoint;
  courseTrueDeg: number;
  noz: FmaPolygon;
}
export interface FmaNtz {
  id: string;
  leftRunwayId: string;
  rightRunwayId: string;
  polygon: FmaPolygon;
}
export interface FmaAmz {
  id: string;
  label: string;
  airportId: string;
  runwayAliases: Record<string, string[]>;
  approachIds: string[];
  courseTrueDeg: number;
  members: FmaMember[];
  boundary: FmaPolygon;
  ntzs: FmaNtz[];
  dimensions: {
    captureLengthNm: number;
    ntzWidthFt: number;
    outerMarginNm: number;
    departureExtensionsNm: Record<string, number>;
  };
  /** Physical runway segment; departureEnd is the reciprocal threshold when resolved. */
  runwayGraphics: Array<{ runwayId: string; threshold: FmaPoint; departureEnd: FmaPoint }>;
  courseLines: Array<{
    runwayId: string;
    approach: [FmaPoint, FmaPoint];
    departure: [FmaPoint, FmaPoint];
  }>;
  referenceLines: Array<[FmaPoint, FmaPoint]>;
  fixBars: Array<{
    fixId: string;
    runwayId: string;
    point: FmaPoint;
    segment: [FmaPoint, FmaPoint];
  }>;
  referenceSpacingFt: 200;
  monitoring: {
    cautionHorizonS: number;
    surveillanceLossS: number;
    coastOutS: number;
    stabilizationS: number;
    courseToleranceDeg: number;
    alignmentHalfWidthNm: number;
    maximumPtlS: number;
  };
  provenance: "DERIVED_TRAINER" | "CATALOG_ADAPTED";
  verticalLimits?: { floorFt: number; ceilingFt: number };
}
export const FMA_MONITORING_DEFAULTS = {
  cautionHorizonS: 10,
  surveillanceLossS: 10,
  coastOutS: 30,
  stabilizationS: 10,
  courseToleranceDeg: 3,
  alignmentHalfWidthNm: 0.15,
  maximumPtlS: 30,
} as const;
export const FMA_GEOMETRY_DEFAULTS = {
  captureLengthNm: 18,
  ntzWidthFt: 2000,
  outerMarginNm: 0.5,
  referenceSpacingFt: 200,
  minSpacingFt: 2500,
  maxSpacingFt: 9000,
} as const;
export const FMA_PARALLEL_COURSE_TOLERANCE_DEG = 1;
const rad = (deg: number) => (deg * Math.PI) / 180;
const norm = (deg: number) => ((deg % 360) + 360) % 360;
const angleDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
function reciprocalRunwayId(runwayId: string): string | undefined {
  const match = /^(\d{1,2})([LRC]?)$/i.exec(runwayId);
  if (!match) return undefined;
  const number = Number(match[1]);
  if (number < 1 || number > 36) return undefined;
  const opposite = ((number + 17) % 36) + 1;
  const side = match[2]?.toUpperCase();
  const oppositeSide = side === "L" ? "R" : side === "R" ? "L" : (side ?? "");
  return `${String(opposite).padStart(2, "0")}${oppositeSide}`;
}
const point = (base: FmaPoint, along: number, cross: number, course: number): FmaPoint => {
  const t = rad(course);
  return {
    xNm: base.xNm + along * Math.sin(t) + cross * Math.cos(t),
    yNm: base.yNm + along * Math.cos(t) - cross * Math.sin(t),
  };
};
/** Lateral intervals where a NOZ polygon crosses one along-course station. */
function nozIntervalsAtAlong(
  noz: FmaPolygon,
  along: number,
  course: number,
): Array<[number, number]> {
  const projected = noz.points.map((vertex) => ({
    along: vertex.xNm * Math.sin(rad(course)) + vertex.yNm * Math.cos(rad(course)),
    cross: vertex.xNm * Math.cos(rad(course)) - vertex.yNm * Math.sin(rad(course)),
  }));
  const crossings: number[] = [];
  for (let i = 0; i < projected.length; i++) {
    const a = projected[i]!;
    const b = projected[(i + 1) % projected.length]!;
    if ((a.along <= along && b.along > along) || (b.along <= along && a.along > along)) {
      crossings.push(a.cross + ((along - a.along) / (b.along - a.along)) * (b.cross - a.cross));
    }
  }
  crossings.sort((a, b) => a - b);
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    intervals.push([crossings[i]!, crossings[i + 1]!]);
  }
  return intervals;
}
const rect = (
  base: FmaPoint,
  start: number,
  end: number,
  left: number,
  right: number,
  course: number,
): FmaPolygon => ({
  points: [
    point(base, start, left, course),
    point(base, start, right, course),
    point(base, end, right, course),
    point(base, end, left, course),
  ],
});
function validPolygon(poly: readonly FmaPoint[]) {
  if (poly.length < 3 || !poly.every((p) => Number.isFinite(p.xNm) && Number.isFinite(p.yNm)))
    return false;
  const twiceArea = poly.reduce((sum, p, i) => {
    const next = poly[(i + 1) % poly.length]!;
    return sum + p.xNm * next.yNm - next.xNm * p.yNm;
  }, 0);
  return Math.abs(twiceArea) > 1e-9;
}
function containsPoint(point: FmaPoint, polygon: readonly FmaPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.yNm > point.yNm !== b.yNm > point.yNm &&
      point.xNm < ((b.xNm - a.xNm) * (point.yNm - a.yNm)) / (b.yNm - a.yNm) + a.xNm
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** First positive exit of an authored AMZ ray along the common course axis. */
function firstCourseBoundaryExit(
  start: FmaPoint,
  course: number,
  boundary: readonly FmaPoint[],
): number | undefined {
  const sin = Math.sin(rad(course));
  const cos = Math.cos(rad(course));
  const startAlong = start.xNm * sin + start.yNm * cos;
  const startCross = start.xNm * cos - start.yNm * sin;
  const probeDistance = 1e-7;
  if (
    !containsPoint(
      { xNm: start.xNm + sin * probeDistance, yNm: start.yNm + cos * probeDistance },
      boundary,
    )
  ) {
    return undefined;
  }
  const projected = boundary.map((p) => ({
    along: p.xNm * sin + p.yNm * cos,
    cross: p.xNm * cos - p.yNm * sin,
  }));
  const intersections: number[] = [];
  for (let i = 0; i < projected.length; i++) {
    const a = projected[i]!;
    const b = projected[(i + 1) % projected.length]!;
    if (
      (a.cross <= startCross && b.cross > startCross) ||
      (b.cross <= startCross && a.cross > startCross)
    ) {
      const ratio = (startCross - a.cross) / (b.cross - a.cross);
      intersections.push(a.along + ratio * (b.along - a.along));
    }
  }
  const exitAlong = intersections
    .filter((along) => along > startAlong + 1e-8)
    .sort((a, b) => a - b)[0];
  return exitAlong === undefined ? undefined : exitAlong - startAlong;
}

function makeAmz(
  catalog: ProcedureCatalog,
  adaptation: FmaGroupAdaptation | undefined,
  rows: Array<{
    approachId: string;
    runwayId: string;
    threshold: FmaPoint;
    course: number;
    faf?: FmaPoint;
    fafFixId?: string;
    reciprocalThreshold?: FmaPoint;
    departureNm?: number;
  }>,
  id: string,
): FmaAmz | FmaDiagnostic {
  const path = `fmaOverrides.groups.${id}`;
  if (rows.length < 2 || rows.length > 4)
    return { path, message: `supports 2–4 runway members; got ${rows.length}` };
  const sumSin = rows.reduce((s, r) => s + Math.sin(rad(r.course)), 0),
    sumCos = rows.reduce((s, r) => s + Math.cos(rad(r.course)), 0);
  if (Math.hypot(sumSin, sumCos) < 1e-9)
    return { path, message: "selected courses do not define a common axis" };
  const course = norm((Math.atan2(sumSin, sumCos) * 180) / Math.PI);
  rows = rows
    .map((r) => ({ ...r, course }))
    .sort((a, b) => {
      const axis = (r: typeof a) =>
        r.threshold.xNm * Math.cos(rad(course)) - r.threshold.yNm * Math.sin(rad(course));
      return axis(a) - axis(b) || a.runwayId.localeCompare(b.runwayId);
    });
  const ntzWidth = (adaptation?.ntzWidthFt ?? FMA_GEOMETRY_DEFAULTS.ntzWidthFt) / 6076.12;
  const capture = adaptation?.captureLengthNm ?? FMA_GEOMETRY_DEFAULTS.captureLengthNm;
  const outer = adaptation?.outerMarginNm ?? FMA_GEOMETRY_DEFAULTS.outerMarginNm;
  // The catalog reciprocal threshold is the physical runway end. The visible
  // departure course continues beyond it; absent an authored override this
  // trainer extension is 1 NM and carries no claim about runway dimensions.
  const departures = rows.map(() => adaptation?.departureExtensionNm ?? 1);
  const physicalRunwayLengths = rows.map((r) => r.departureNm ?? 0);
  if (
    [ntzWidth, capture, ...departures].some((n) => !Number.isFinite(n) || n <= 0) ||
    !Number.isFinite(outer) ||
    outer < 0
  )
    return { path, message: "dimensions must be finite and widths/lengths positive" };
  const offsets = rows.map(
    (r) => r.threshold.xNm * Math.cos(rad(course)) - r.threshold.yNm * Math.sin(rad(course)),
  );
  const centers = offsets;
  const ntzs: FmaNtz[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const spacing = (centers[i + 1]! - centers[i]!) * 6076.12;
    if (
      !adaptation?.geometry &&
      (spacing < FMA_GEOMETRY_DEFAULTS.minSpacingFt || spacing > FMA_GEOMETRY_DEFAULTS.maxSpacingFt)
    )
      return {
        path,
        message: `adjacent runway spacing ${Math.round(spacing)} ft outside trainer interval`,
      };
    if (!adaptation?.geometry && ntzWidth * 6076.12 >= spacing)
      return {
        path,
        message: `NTZ width ${Math.round(ntzWidth * 6076.12)} ft must be narrower than adjacent course spacing ${Math.round(spacing)} ft`,
      };
    const left = rows[i]!,
      right = rows[i + 1]!;
    const lateral = (centers[i]! + centers[i + 1]!) / 2;
    const base = point({ xNm: 0, yNm: 0 }, 0, lateral, course);
    const minAlong =
      Math.min(
        ...rows.map(
          (r) => r.threshold.xNm * Math.sin(rad(course)) + r.threshold.yNm * Math.cos(rad(course)),
        ),
      ) - capture;
    const maxAlong = Math.max(
      ...rows.map(
        (r, j) =>
          r.threshold.xNm * Math.sin(rad(course)) +
          r.threshold.yNm * Math.cos(rad(course)) +
          physicalRunwayLengths[j]! +
          departures[j]!,
      ),
    );
    const poly = rect(base, minAlong, maxAlong, -ntzWidth / 2, ntzWidth / 2, course);
    ntzs.push({
      id: `${id}-NTZ-${left.runwayId}-${right.runwayId}`,
      leftRunwayId: left.runwayId,
      rightRunwayId: right.runwayId,
      polygon: poly,
    });
  }
  for (let i = 0; i < rows.length; i++) {
    const low = i === 0 ? centers[i]! - outer : (centers[i - 1]! + centers[i]!) / 2 + ntzWidth / 2;
    const high =
      i === rows.length - 1
        ? centers[i]! + outer
        : (centers[i]! + centers[i + 1]!) / 2 - ntzWidth / 2;
    if (!adaptation?.geometry && !(high > low))
      return { path, message: `runway ${rows[i]!.runwayId} has non-positive NOZ width` };
  }
  const members: FmaMember[] = rows.map((r, i) => {
    const low = i === 0 ? centers[i]! - outer : (centers[i - 1]! + centers[i]!) / 2 + ntzWidth / 2;
    const high =
      i === rows.length - 1
        ? centers[i]! + outer
        : (centers[i]! + centers[i + 1]!) / 2 - ntzWidth / 2;
    const along = r.threshold.xNm * Math.sin(rad(course)) + r.threshold.yNm * Math.cos(rad(course));
    return {
      runwayId: r.runwayId,
      approachId: r.approachId,
      threshold: r.threshold,
      courseTrueDeg: course,
      noz: rect(
        { xNm: 0, yNm: 0 },
        along - capture,
        along + physicalRunwayLengths[i]! + departures[i]!,
        low,
        high,
        course,
      ),
    };
  });
  const left = centers[0]! - outer,
    right = centers[centers.length - 1]! + outer;
  const origin = point({ xNm: 0, yNm: 0 }, 0, (left + right) / 2, course);
  const minAlong =
    Math.min(
      ...rows.map(
        (r) => r.threshold.xNm * Math.sin(rad(course)) + r.threshold.yNm * Math.cos(rad(course)),
      ),
    ) - capture;
  const maxAlong = Math.max(
    ...rows.map(
      (r, j) =>
        r.threshold.xNm * Math.sin(rad(course)) +
        r.threshold.yNm * Math.cos(rad(course)) +
        physicalRunwayLengths[j]! +
        departures[j]!,
    ),
  );
  const boundary = rect(origin, minAlong, maxAlong, (left - right) / 2, (right - left) / 2, course);
  const geometry = adaptation?.geometry;
  if (geometry) {
    if (
      !validPolygon(geometry.amzBoundary) ||
      geometry.runways.length !== rows.length ||
      geometry.ntzs.length !== rows.length - 1 ||
      new Set(geometry.runways.map((runway) => runway.runwayId)).size !== geometry.runways.length ||
      new Set(geometry.ntzs.map((ntz) => ntz.id)).size !== geometry.ntzs.length ||
      geometry.runways.some((r) => !validPolygon(r.noz)) ||
      geometry.ntzs.some((n) => !validPolygon(n.polygon)) ||
      (geometry.courseLines !== undefined &&
        (geometry.courseLines.length !== rows.length ||
          new Set(geometry.courseLines.map((line) => line.runwayId)).size !==
            geometry.courseLines.length ||
          geometry.courseLines.some(
            (line) =>
              !rows.some((row) => row.runwayId === line.runwayId) ||
              [...line.approach, ...line.departure].some(
                (p) => !Number.isFinite(p.xNm) || !Number.isFinite(p.yNm),
              ),
          )))
    )
      return { path, message: "explicit geometry has invalid polygons or membership" };
    for (const member of members) {
      const authored = geometry.runways.find((r) => r.runwayId === member.runwayId);
      if (!authored)
        return { path, message: `explicit geometry missing runway ${member.runwayId}` };
      member.noz = { points: authored.noz };
    }
    for (const ntz of ntzs) {
      const authored = geometry.ntzs.find(
        (z) => z.leftRunwayId === ntz.leftRunwayId && z.rightRunwayId === ntz.rightRunwayId,
      );
      if (!authored)
        return {
          path,
          message: `explicit geometry missing adjacent NTZ ${ntz.leftRunwayId}/${ntz.rightRunwayId}`,
        };
      ntz.id = authored.id;
      ntz.polygon = { points: authored.polygon };
    }
  }
  const fixBars: FmaAmz["fixBars"] = [];
  for (const row of rows) {
    if (!row.faf || !row.fafFixId) continue;
    const along = row.faf.xNm * Math.sin(rad(course)) + row.faf.yNm * Math.cos(rad(course));
    const cross = row.faf.xNm * Math.cos(rad(course)) - row.faf.yNm * Math.sin(rad(course));
    const ownNoz = members.find((member) => member.runwayId === row.runwayId)!.noz;
    const ownInterval = nozIntervalsAtAlong(ownNoz, along, course).find(
      ([low, high]) => cross >= low - 1e-8 && cross <= high + 1e-8,
    );
    if (!ownInterval) {
      return {
        path: `approaches.${row.approachId}.fafFixId`,
        message: "FAF lies outside its runway NOZ",
      };
    }
    const [low, high] = ownInterval;
    fixBars.push({
      fixId: row.fafFixId,
      runwayId: row.runwayId,
      point: row.faf,
      segment: [
        point({ xNm: 0, yNm: 0 }, along, low, course),
        point({ xNm: 0, yNm: 0 }, along, high, course),
      ],
    });
  }
  const runwayGraphics = rows.map((r) => ({
    runwayId: r.runwayId,
    threshold: r.threshold,
    departureEnd:
      geometry?.runways.find((runway) => runway.runwayId === r.runwayId)?.departureEnd ??
      r.reciprocalThreshold ??
      r.threshold,
  }));
  const derivedDepartureEnds = rows.map((_, i) => {
    const start = runwayGraphics[i]!.departureEnd;
    const boundaryExit =
      geometry && !geometry.courseLines
        ? firstCourseBoundaryExit(start, course, geometry.amzBoundary)
        : undefined;
    if (geometry && !geometry.courseLines && boundaryExit === undefined) return undefined;
    const extension = Math.min(departures[i]!, boundaryExit ?? departures[i]!);
    if (extension <= 1e-6) return undefined;
    return point(start, extension, 0, course);
  });
  if (geometry && !geometry.courseLines && derivedDepartureEnds.some((end) => !end)) {
    return {
      path,
      message: "derived departure course has no positive segment inside the authored AMZ boundary",
    };
  }
  const courseLines =
    geometry?.courseLines ??
    rows.map((r, i) => ({
      runwayId: r.runwayId,
      approach: [point(r.threshold, -capture, 0, course), r.threshold] as [FmaPoint, FmaPoint],
      departure: [runwayGraphics[i]!.departureEnd, derivedDepartureEnds[i]!] as [
        FmaPoint,
        FmaPoint,
      ],
    }));
  const referenceLines: Array<[FmaPoint, FmaPoint]> = [];
  const feetToNm = 1 / 6076.12;
  // Reference strokes follow each course at exact 200 ft offsets and are
  // clipped to that runway's approach-side NOZ. Do not overlay a solid stroke
  // on the dashed zero-offset course line or fill NTZ/departure areas.
  for (const member of members) {
    const originAlong =
      member.threshold.xNm * Math.sin(rad(course)) + member.threshold.yNm * Math.cos(rad(course));
    const originCross =
      member.threshold.xNm * Math.cos(rad(course)) - member.threshold.yNm * Math.sin(rad(course));
    const projected = member.noz.points.map((p) => ({
      along: p.xNm * Math.sin(rad(course)) + p.yNm * Math.cos(rad(course)),
      cross: p.xNm * Math.cos(rad(course)) - p.yNm * Math.sin(rad(course)),
    }));
    const maxOffset = Math.max(...projected.map((p) => Math.abs(p.cross - originCross)));
    for (let step = 1; step * 200 * feetToNm <= maxOffset; step++) {
      for (const sign of [-1, 1]) {
        const cross = originCross + sign * step * 200 * feetToNm;
        const crossings: number[] = [];
        for (let edge = 0; edge < projected.length; edge++) {
          const a = projected[edge]!;
          const b = projected[(edge + 1) % projected.length]!;
          if ((a.cross <= cross && b.cross > cross) || (b.cross <= cross && a.cross > cross)) {
            const ratio = (cross - a.cross) / (b.cross - a.cross);
            crossings.push(a.along + ratio * (b.along - a.along));
          }
        }
        crossings.sort((a, b) => a - b);
        for (let interval = 0; interval + 1 < crossings.length; interval += 2) {
          const approachStart = Math.max(crossings[interval]!, originAlong - capture);
          const approachEnd = Math.min(crossings[interval + 1]!, originAlong);
          if (approachEnd > approachStart) {
            referenceLines.push([
              point({ xNm: 0, yNm: 0 }, approachStart, cross, course),
              point({ xNm: 0, yNm: 0 }, approachEnd, cross, course),
            ]);
          }
        }
      }
    }
  }
  const monitoring = { ...FMA_MONITORING_DEFAULTS, ...adaptation?.monitoring };
  return {
    id,
    label: adaptation?.label ?? id,
    airportId: catalog.airportId,
    runwayAliases: Object.fromEntries(
      Object.entries(adaptation?.runwayAliases ?? {})
        .filter(([runwayId]) => rows.some((r) => r.runwayId === runwayId.toUpperCase()))
        .map(([runwayId, values]) => [
          runwayId.toUpperCase(),
          values.map((value) => value.toUpperCase()),
        ]),
    ),
    approachIds: rows.map((r) => r.approachId),
    courseTrueDeg: course,
    members,
    boundary: geometry ? { points: geometry.amzBoundary } : boundary,
    ntzs,
    dimensions: {
      captureLengthNm: capture,
      ntzWidthFt: adaptation?.ntzWidthFt ?? FMA_GEOMETRY_DEFAULTS.ntzWidthFt,
      outerMarginNm: outer,
      departureExtensionsNm: Object.fromEntries(rows.map((r, i) => [r.runwayId, departures[i]!])),
    },
    runwayGraphics,
    courseLines,
    referenceLines,
    fixBars,
    referenceSpacingFt: 200,
    monitoring,
    provenance: adaptation ? "CATALOG_ADAPTED" : "DERIVED_TRAINER",
    ...(adaptation?.verticalLimits ? { verticalLimits: adaptation.verticalLimits } : {}),
  };
}

/** Pure catalog-to-AMZ approximation. Does not read or mutate World or assignments. */
export function deriveFmaAmzs(
  catalog: ProcedureCatalog,
  options?: { excludeDerived?: boolean },
): { amzs: FmaAmz[]; diagnostics: FmaDiagnostic[] } {
  const diagnostics: FmaDiagnostic[] = [];
  const adaptation = catalog.fmaOverrides;
  const authoredGroupIds = new Set(adaptation?.groups?.map((g) => g.id) ?? []);
  if (adaptation?.enabled === false) return { amzs: [], diagnostics };
  const fixes = new Map(catalog.fixes.map((f) => [f.id, f]));
  const sorted = [...catalog.approaches].sort((a, b) => a.id.localeCompare(b.id));
  const trueCourseByApproach = new Map(
    sorted.flatMap((approach) =>
      approach.publishedCourseMagneticDeg === undefined
        ? []
        : [
            [
              approach.id,
              magneticToTrueDeg(approach.publishedCourseMagneticDeg, catalog.magVarDeg),
            ] as const,
          ],
    ),
  );
  type SourceRow = {
    approachId: string;
    runwayId: string;
    threshold: FmaPoint;
    course: number;
    faf?: FmaPoint;
    fafFixId?: string;
    reciprocalThreshold?: FmaPoint;
    departureNm?: number;
  };
  const rowsByRunway = new Map<string, SourceRow>();
  const resolveApproach = (appId: string): SourceRow | undefined => {
    const app = catalog.approaches.find((a) => a.id === appId);
    const course = trueCourseByApproach.get(appId);
    if (!app?.thresholdFixId || course === undefined) return undefined;
    const threshold = fixes.get(app.thresholdFixId);
    if (!threshold || !Number.isFinite(threshold.xNm) || !Number.isFinite(threshold.yNm))
      return undefined;
    const reciprocalId = reciprocalRunwayId(app.runway);
    const reciprocal = catalog.approaches
      .flatMap((candidate) => {
        if (
          !reciprocalId ||
          candidate.runway.toUpperCase() !== reciprocalId ||
          trueCourseByApproach.get(candidate.id) === undefined ||
          angleDistance(trueCourseByApproach.get(candidate.id)!, norm(course + 180)) >
            FMA_PARALLEL_COURSE_TOLERANCE_DEG ||
          !candidate.thresholdFixId
        )
          return [];
        const fix = fixes.get(candidate.thresholdFixId);
        if (!fix) return [];
        const along =
          (fix.xNm - threshold.xNm) * Math.sin(rad(course)) +
          (fix.yNm - threshold.yNm) * Math.cos(rad(course));
        const cross =
          (fix.xNm - threshold.xNm) * Math.cos(rad(course)) -
          (fix.yNm - threshold.yNm) * Math.sin(rad(course));
        return along > 0
          ? [{ point: { xNm: fix.xNm, yNm: fix.yNm }, along, score: Math.hypot(along, cross) }]
          : [];
      })
      .sort((a, b) => a.score - b.score);
    const endpoints = new Map(
      reciprocal.map((candidate) => [`${candidate.point.xNm},${candidate.point.yNm}`, candidate]),
    );
    const uniqueReciprocal = endpoints.size === 1 ? [...endpoints.values()][0] : undefined;
    const faf = app.fafFixId ? fixes.get(app.fafFixId) : undefined;
    if (app.fafFixId && (!faf || !Number.isFinite(faf.xNm) || !Number.isFinite(faf.yNm)))
      return undefined;
    return {
      approachId: app.id,
      runwayId: app.runway,
      threshold: { xNm: threshold.xNm, yNm: threshold.yNm },
      course,
      ...(uniqueReciprocal
        ? { reciprocalThreshold: uniqueReciprocal.point, departureNm: uniqueReciprocal.along }
        : {}),
      ...(faf ? { faf: { xNm: faf.xNm, yNm: faf.yNm }, fafFixId: app.fafFixId } : {}),
    };
  };
  const barrierRows: SourceRow[] = [];
  for (const app of sorted) {
    if (app.publishedCourseMagneticDeg === undefined) continue;
    if (!app.thresholdFixId) {
      diagnostics.push({
        path: `approaches.${app.id}.thresholdFixId`,
        message: "missing threshold fix; approach excluded",
      });
      continue;
    }
    const threshold = fixes.get(app.thresholdFixId);
    if (!threshold || !Number.isFinite(threshold.xNm) || !Number.isFinite(threshold.yNm)) {
      diagnostics.push({
        path: `approaches.${app.id}.thresholdFixId`,
        message: "unresolved threshold fix; approach excluded",
      });
      continue;
    }
    if (app.fafFixId) {
      const faf = fixes.get(app.fafFixId);
      if (!faf || !Number.isFinite(faf.xNm) || !Number.isFinite(faf.yNm)) {
        diagnostics.push({
          path: `approaches.${app.id}.fafFixId`,
          message: "unresolved FAF fix; approach excluded",
        });
        barrierRows.push({
          approachId: app.id,
          runwayId: app.runway,
          threshold: { xNm: threshold.xNm, yNm: threshold.yNm },
          course: trueCourseByApproach.get(app.id)!,
        });
        continue;
      }
    }
    const existing = rowsByRunway.get(app.runway);
    const rank = (t: string) => ({ ILS: 0, LOC: 1, RNAV: 2 })[t] ?? 3;
    if (existing) {
      const old = catalog.approaches.find((a) => a.id === existing.approachId)!;
      if (
        rank(app.type) > rank(old.type) ||
        (rank(app.type) === rank(old.type) && app.id.localeCompare(old.id) >= 0)
      )
        continue;
    }
    const row = resolveApproach(app.id);
    if (row) rowsByRunway.set(app.runway, row);
  }
  const resolvedRows = [...rowsByRunway.values()];
  const groups: FmaGroupAdaptation[] = [...(adaptation?.groups ?? [])];
  const candidates: SourceRow[][] = [];
  const eligible = resolvedRows.filter(
    (r) =>
      !groups.some(
        (g) => g.runwayIds?.includes(r.runwayId) || g.approachIds?.includes(r.approachId),
      ),
  );
  const eligibleBarriers = barrierRows.filter(
    (r) =>
      !resolvedRows.some((valid) => valid.runwayId === r.runwayId) &&
      !groups.some(
        (g) => g.runwayIds?.includes(r.runwayId) || g.approachIds?.includes(r.approachId),
      ),
  );
  const courseClusters: Array<Array<{ row: SourceRow; barrier: boolean }>> = [];
  for (const row of [
    ...eligible.map((row) => ({ row, barrier: false })),
    ...eligibleBarriers.map((row) => ({ row, barrier: true })),
  ]) {
    const cluster = courseClusters.find(
      (group) =>
        angleDistance(group[0]!.row.course, row.row.course) <= FMA_PARALLEL_COURSE_TOLERANCE_DEG,
    );
    if (cluster) cluster.push(row);
    else courseClusters.push([row]);
  }
  for (const groupedCluster of courseClusters) {
    const cluster = groupedCluster.map((entry) => entry.row);
    if (cluster.length < 2) continue;
    const course = norm(
      (Math.atan2(
        cluster.reduce((s, r) => s + Math.sin(rad(r.course)), 0),
        cluster.reduce((s, r) => s + Math.cos(rad(r.course)), 0),
      ) *
        180) /
        Math.PI,
    );
    const sortedCluster = groupedCluster.sort(
      (a, b) =>
        a.row.threshold.xNm * Math.cos(rad(course)) -
        a.row.threshold.yNm * Math.sin(rad(course)) -
        (b.row.threshold.xNm * Math.cos(rad(course)) - b.row.threshold.yNm * Math.sin(rad(course))),
    );
    let selected: SourceRow[] = [];
    const emit = () => {
      if (selected.length >= 2) {
        if (selected.length > 4) {
          diagnostics.push({
            path: `approaches.${selected[0]!.approachId}/${selected.at(-1)!.approachId}`,
            message: `supports 2–4 runway members; got ${selected.length}`,
          });
        } else {
          candidates.push(selected);
        }
      }
    };
    for (const entry of sortedCluster) {
      if (entry.barrier) {
        emit();
        selected = [];
        continue;
      }
      const row = entry.row;
      if (!selected.length) {
        selected = [row];
        continue;
      }
      const prev = selected.at(-1)!;
      const dx = row.threshold.xNm - prev.threshold.xNm,
        dy = row.threshold.yNm - prev.threshold.yNm;
      const cross = Math.abs(dx * Math.cos(rad(course)) - dy * Math.sin(rad(course))) * 6076.12;
      if (cross >= 2500 && cross <= 9000) selected.push(row);
      else {
        diagnostics.push({
          path: `approaches.${prev.approachId}/${row.approachId}`,
          message: `adjacent spacing ${Math.round(cross)} ft outside trainer interval`,
        });
        emit();
        selected = [row];
      }
    }
    emit();
  }
  if (!(options?.excludeDerived ?? adaptation?.excludeDerived))
    candidates.forEach((members) =>
      groups.push({
        id: `${catalog.airportId}-FMA-${members.map((m) => m.runwayId).join("-")}`,
        runwayIds: members.map((m) => m.runwayId),
      }),
    );
  const amzs: FmaAmz[] = [];
  const ids = new Set<string>();
  const claimedRunways = new Set<string>();
  for (const group of groups) {
    if (ids.has(group.id)) {
      diagnostics.push({ path: `fmaOverrides.groups.${group.id}.id`, message: "duplicate AMZ id" });
      continue;
    }
    ids.add(group.id);
    const selected: Array<SourceRow | undefined> = group.approachIds?.length
      ? group.approachIds.map(resolveApproach)
      : group.runwayIds?.length
        ? group.runwayIds.map((id) => resolvedRows.find((r) => r.runwayId === id))
        : [];
    if (selected.some((r) => !r)) {
      diagnostics.push({
        path: `fmaOverrides.groups.${group.id}`,
        message: "unknown approach/runway reference",
      });
      continue;
    }
    if (new Set((selected as SourceRow[]).map((r) => r.runwayId)).size !== selected.length) {
      diagnostics.push({
        path: `fmaOverrides.groups.${group.id}`,
        message: "selects a runway more than once",
      });
      continue;
    }
    const groupRunways = (selected as SourceRow[]).map((row) => row.runwayId);
    if (groupRunways.some((runwayId) => claimedRunways.has(runwayId))) {
      diagnostics.push({
        path: `fmaOverrides.groups.${group.id}`,
        message: "runway is already assigned to another AMZ",
      });
      continue;
    }
    groupRunways.forEach((runwayId) => claimedRunways.add(runwayId));
    const result = makeAmz(
      catalog,
      group,
      selected as NonNullable<(typeof selected)[number]>[],
      group.id,
    );
    if ("message" in result) diagnostics.push(result);
    else {
      if (!authoredGroupIds.has(group.id)) result.provenance = "DERIVED_TRAINER";
      amzs.push(result);
    }
  }
  return { amzs, diagnostics };
}
