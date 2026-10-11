import { expect, test } from "vitest";
import type { ProcedureCatalog } from "../../scenario/procedures/types";
import { deriveFmaAmzs } from "../../core/alerts/fmaGeometry";
import {
  createFmaAlertState,
  createFlightPlan,
  createWorld,
  deleteFlightPlanFromWorld,
  evaluateFmaAlerts,
  resolveFmaRunwayAssignment,
  type FmaAmz,
  type FmaAlertTrackInput,
} from "../../core";
import { createAircraft } from "../../core/aircraft";
import {
  advanceFmaSurveillance,
  configureFmaSurveillance,
  createFmaSurveillanceState,
  pruneFmaSurveillance,
  releaseFmaTrack,
  setFmaSensorFixture,
  setFmaSensorStatus,
  type FmaSurveillanceState,
} from "../fmaSurveillance";
import type { SurveillanceReport } from "../surveillance";
import {
  advanceFmaSurveillanceView,
  configureFmaSurveillanceView,
  createScopeView,
  fmaReportsForSimulationTick,
  setFmaSensorFixtureView,
} from "../scopeView";
import { createTrackDisplay } from "../trackDisplay";
import { buildScopeDatablockPresentation, displayAircraft } from "../render/renderScopePaint";
import { PALETTE } from "../palette";
import { formatFmaAlertDiagnostic, observeFmaAlertRuntime } from "../fmaAlerts";
import { handleScopeKeyDown } from "../scopeKeys";
import { handlePpiLeftClick } from "../ppi";
import { nmToScreen } from "../camera";

function syntheticAmz(): FmaAmz {
  const box = (x1: number, y1: number, x2: number, y2: number) => ({
    points: [
      { xNm: x1, yNm: y1 },
      { xNm: x2, yNm: y1 },
      { xNm: x2, yNm: y2 },
      { xNm: x1, yNm: y2 },
    ],
  });
  return {
    id: "AMZ-SYN",
    label: "Synthetic",
    airportId: "KABC",
    approachIds: [],
    runwayAliases: { "08L": ["L08"], "08R": ["R08"] },
    courseTrueDeg: 0,
    members: [
      {
        runwayId: "08L",
        approachId: "ILS08L",
        threshold: { xNm: -0.5, yNm: 0 },
        courseTrueDeg: 0,
        noz: box(-0.75, -2, -0.25, -0.1),
      },
      {
        runwayId: "08R",
        approachId: "ILS08R",
        threshold: { xNm: 0.5, yNm: 0 },
        courseTrueDeg: 0,
        noz: box(0.25, -2, 0.75, -0.1),
      },
    ],
    boundary: box(-2, -2, 2, 2),
    ntzs: [
      { id: "NTZ-08", leftRunwayId: "08L", rightRunwayId: "08R", polygon: box(-0.1, -1, 0.1, 1) },
    ],
    dimensions: {
      captureLengthNm: 18,
      ntzWidthFt: 2000,
      outerMarginNm: 0.5,
      departureExtensionsNm: { "08L": 1, "08R": 1 },
    },
    runwayGraphics: [],
    courseLines: [],
    referenceLines: [],
    fixBars: [],
    referenceSpacingFt: 200,
    monitoring: {
      cautionHorizonS: 10,
      surveillanceLossS: 10,
      coastOutS: 30,
      stabilizationS: 10,
      courseToleranceDeg: 3,
      alignmentHalfWidthNm: 0.15,
      maximumPtlS: 30,
    },
    provenance: "DERIVED_TRAINER",
  };
}

function alertTrack(
  id: string,
  x: number,
  y: number,
  heading: number,
  time: number,
  overrides: Partial<FmaAlertTrackInput> = {},
): FmaAlertTrackInput {
  return {
    aircraftId: id,
    tracked: true,
    associated: true,
    arrivalAirportId: "KABC",
    scratchpads: ["08L"],
    report: {
      xNm: x,
      yNm: y,
      groundTrackDeg: heading,
      speedKt: 0,
      altitudeFt: 5000,
      reportedAtSimMs: time,
    },
    surveillance: "CURRENT",
    ...overrides,
  };
}

function catalog(
  courses: Array<{
    runway: string;
    course: number;
    x: number;
    y?: number;
    id?: string;
    type?: "ILS" | "LOC" | "RNAV";
  }>,
  magVarDeg = 0,
): ProcedureCatalog {
  return {
    schemaVersion: 1,
    airportId: "KABC",
    name: "Synthetic",
    magVarDeg,
    fieldElevFt: 0,
    arp: { latDeg: 0, lonDeg: 0 },
    navaids: [],
    stars: [],
    sids: [],
    atpaVolumes: [],
    fixes: courses.map((c) => ({
      id: `RW${c.runway}`,
      kind: "THRESHOLD" as const,
      xNm: c.x,
      yNm: c.y ?? 0,
    })),
    approaches: courses.map((c, i) => ({
      id: c.id ?? `APP${i}`,
      type: c.type ?? "ILS",
      runway: c.runway,
      name: "Synthetic approach",
      thresholdFixId: `RW${c.runway}`,
      publishedCourseMagneticDeg: c.course as never,
    })),
  };
}

test("FMA derives cardinal and wrapped common axes, converts magnetic once, and ignores along-track staggering", () => {
  const north = deriveFmaAmzs(
    catalog(
      [
        { runway: "01", course: 355, x: -0.5, y: -0.2, id: "N1" },
        { runway: "02", course: 355, x: 0.5, y: 0.2, id: "N2" },
        { runway: "02", course: 355, x: 0.5, y: 0.2, id: "N2LOC", type: "LOC" },
      ],
      5,
    ),
  );
  expect(north.amzs).toHaveLength(1);
  expect(north.amzs[0]?.approachIds).toEqual(["N1", "N2"]);
  expect(north.amzs[0]?.courseTrueDeg).toBe(0);
  expect(north.amzs[0]?.ntzs).toHaveLength(1);
  const east = deriveFmaAmzs(
    catalog([
      { runway: "09", course: 90, x: 0, y: -0.5 },
      { runway: "10", course: 90, x: 0, y: 0.5 },
    ]),
  );
  expect(east.amzs).toHaveLength(1);
  expect(east.amzs[0]?.ntzs).toHaveLength(1);
  const wrapped = deriveFmaAmzs(
    catalog([
      { runway: "A", course: 359.8, x: -0.5 },
      { runway: "B", course: 0.2, x: 0.5 },
    ]),
  );
  expect(wrapped.amzs[0]?.courseTrueDeg).toBeCloseTo(0);
});

test("FMA groups only adjacent same-direction runways and rejects reciprocal or unsupported geometry", () => {
  const triple = deriveFmaAmzs(
    catalog([
      { runway: "A", course: 0, x: -1 },
      { runway: "B", course: 0, x: 0 },
      { runway: "C", course: 0, x: 1 },
    ]),
  );
  expect(triple.amzs[0]?.members.map((m) => m.runwayId)).toEqual(["A", "B", "C"]);
  expect(triple.amzs[0]?.ntzs.map((n) => [n.leftRunwayId, n.rightRunwayId])).toEqual([
    ["A", "B"],
    ["B", "C"],
  ]);
  expect(
    deriveFmaAmzs(
      catalog([
        { runway: "09", course: 90, x: -0.5 },
        { runway: "27", course: 270, x: 0.5 },
      ]),
    ).amzs,
  ).toHaveLength(0);
  expect(deriveFmaAmzs(catalog([{ runway: "09", course: 90, x: 0 }])).amzs).toHaveLength(0);
  expect(
    deriveFmaAmzs(
      catalog([
        { runway: "A", course: 0, x: 0 },
        { runway: "B", course: 0, x: 2 },
      ]),
    ).diagnostics[0]?.message,
  ).toMatch(/spacing/);
});

test("FMA adaptation uses explicit catalog geometry, defaults, provenance and vertical validation", () => {
  const base = catalog([
    { runway: "A", course: 0, x: -0.5 },
    { runway: "B", course: 0, x: 0.5 },
  ]);
  base.fixes.push({ id: "RWBALT", kind: "THRESHOLD", xNm: 2, yNm: 0 });
  base.approaches.push({
    ...base.approaches[1]!,
    id: "B-LOC",
    type: "LOC",
    thresholdFixId: "RWBALT",
  });
  base.fmaOverrides = {
    groups: [
      {
        id: "CUSTOM",
        approachIds: ["APP0", "B-LOC"],
        verticalLimits: { floorFt: 1000, ceilingFt: 5000 },
        monitoring: { cautionHorizonS: 12 },
        geometry: {
          amzBoundary: [
            { xNm: -2, yNm: -1 },
            { xNm: 2, yNm: -1 },
            { xNm: 2, yNm: 20 },
            { xNm: -2, yNm: 20 },
          ],
          runways: [
            {
              runwayId: "A",
              departureEnd: { xNm: -1, yNm: 12 },
              noz: [
                { xNm: -1, yNm: 0 },
                { xNm: 0, yNm: 0 },
                { xNm: 0, yNm: 10 },
              ],
            },
            {
              runwayId: "B",
              noz: [
                { xNm: 0, yNm: 0 },
                { xNm: 1, yNm: 0 },
                { xNm: 1, yNm: 10 },
              ],
            },
          ],
          ntzs: [
            {
              id: "CUSTOM-NTZ",
              leftRunwayId: "A",
              rightRunwayId: "B",
              polygon: [
                { xNm: -0.1, yNm: 0 },
                { xNm: 0.1, yNm: 0 },
                { xNm: 0.1, yNm: 10 },
              ],
            },
          ],
          courseLines: [
            {
              runwayId: "A",
              approach: [
                { xNm: -0.5, yNm: -18 },
                { xNm: -0.5, yNm: 0 },
              ],
              departure: [
                { xNm: -0.5, yNm: 0 },
                { xNm: -1, yNm: 12 },
              ],
            },
            {
              runwayId: "B",
              approach: [
                { xNm: 0.5, yNm: -18 },
                { xNm: 0.5, yNm: 0 },
              ],
              departure: [
                { xNm: 0.5, yNm: 0 },
                { xNm: 0.5, yNm: 1 },
              ],
            },
          ],
        },
      },
    ],
  };
  const result = deriveFmaAmzs(base);
  expect(result.diagnostics).toEqual([]);
  expect(result.amzs[0]).toMatchObject({
    id: "CUSTOM",
    approachIds: ["APP0", "B-LOC"],
    provenance: "CATALOG_ADAPTED",
    dimensions: { captureLengthNm: 18, ntzWidthFt: 2000, outerMarginNm: 0.5 },
    verticalLimits: { floorFt: 1000, ceilingFt: 5000 },
    referenceSpacingFt: 200,
  });
  expect(result.amzs[0]?.runwayGraphics[0]?.departureEnd).toEqual({ xNm: -1, yNm: 12 });
  expect(result.amzs[0]?.courseLines[0]?.departure[1]).toEqual({ xNm: -1, yNm: 12 });
  expect(result.amzs[0]?.monitoring).toMatchObject({
    cautionHorizonS: 12,
    surveillanceLossS: 10,
    coastOutS: 30,
    stabilizationS: 10,
    courseToleranceDeg: 3,
    alignmentHalfWidthNm: 0.15,
    maximumPtlS: 30,
  });
  expect(result.amzs[0]?.members[1]?.threshold.xNm).toBe(2);
  base.fmaOverrides.groups![0]!.geometry!.amzBoundary[0]!.xNm = Number.NaN;
  expect(deriveFmaAmzs(base).diagnostics[0]?.message).toMatch(/invalid polygons/);
});

test("derived FMA defaults retain 200-foot references and trainer dimensions", () => {
  const result = deriveFmaAmzs(
    catalog([
      { runway: "A", course: 0, x: -0.5 },
      { runway: "B", course: 0, x: 0.5 },
    ]),
  );
  expect(result.amzs[0]).toMatchObject({ referenceSpacingFt: 200, provenance: "DERIVED_TRAINER" });
  expect(result.amzs[0]?.boundary.points).toHaveLength(4);
  expect(result.amzs[0]?.fixBars).toEqual([]);
  const translated = deriveFmaAmzs(
    catalog([
      { runway: "A", course: 0, x: 101.5, y: 90 },
      { runway: "B", course: 0, x: 102.5, y: 108 },
    ]),
  );
  const translatedAmz = translated.amzs[0]!;
  expect(translatedAmz.members[0]?.threshold.yNm).toBe(90);
  expect(translatedAmz.courseLines[0]?.approach[0].yNm).toBe(72);
  expect(Math.min(...translatedAmz.boundary.points.map((p) => p.yNm))).toBe(72);
  expect(Math.max(...translatedAmz.boundary.points.map((p) => p.yNm))).toBe(109);
  expect(translatedAmz.ntzs[0]?.polygon.points.some((p) => p.yNm >= 72 && p.yNm <= 109)).toBe(true);
  expect(
    deriveFmaAmzs(
      catalog([
        { runway: "A", course: 0, x: -0.5 },
        { runway: "B", course: 0, x: 0.5 },
      ]),
      { excludeDerived: true },
    ).amzs,
  ).toEqual([]);
});

test("missing thresholds produce diagnostics without fabricated geometry", () => {
  const missing = catalog([{ runway: "A", course: 0, x: 0 }]);
  delete missing.approaches[0]!.thresholdFixId;
  const result = deriveFmaAmzs(missing);
  expect(result.amzs).toEqual([]);
  expect(result.diagnostics[0]).toMatchObject({ path: "approaches.APP0.thresholdFixId" });
});

test("FMA adaptation diagnoses unknown references, duplicate IDs and unsupported capacity", () => {
  const unknown = catalog([
    { runway: "A", course: 0, x: -0.5 },
    { runway: "B", course: 0, x: 0.5 },
  ]);
  unknown.fmaOverrides = { groups: [{ id: "UNKNOWN", runwayIds: ["A", "NOPE"] }] };
  expect(deriveFmaAmzs(unknown)).toMatchObject({
    amzs: [],
    diagnostics: [
      { path: "fmaOverrides.groups.UNKNOWN", message: "unknown approach/runway reference" },
    ],
  });

  const duplicate = catalog([
    { runway: "A", course: 0, x: -0.5 },
    { runway: "B", course: 0, x: 0.5 },
  ]);
  duplicate.fmaOverrides = {
    groups: [
      { id: "SAME", runwayIds: ["A", "B"] },
      { id: "SAME", runwayIds: ["A", "B"] },
    ],
  };
  expect(deriveFmaAmzs(duplicate).diagnostics[0]?.message).toBe("duplicate AMZ id");

  const tooMany = catalog([
    { runway: "A", course: 0, x: -2 },
    { runway: "B", course: 0, x: -1 },
    { runway: "C", course: 0, x: 0 },
    { runway: "D", course: 0, x: 1 },
    { runway: "E", course: 0, x: 2 },
  ]);
  const capacity = deriveFmaAmzs(tooMany);
  expect(capacity.amzs).toEqual([]);
  expect(
    capacity.diagnostics.some((item) => item.message.includes("supports 2–4 runway members")),
  ).toBe(true);
});

test("FMA parallel eligibility measures ENU cross-track and preserves true departure endpoint", () => {
  const source = catalog([
    { runway: "36L", course: 0, x: -0.5, id: "A" },
    { runway: "36R", course: 0, x: 0.5, id: "B" },
    { runway: "18R", course: 180, x: -0.5, y: 1, id: "RA" },
    { runway: "18L", course: 180, x: 0.5, y: 1, id: "RB" },
  ]);
  const result = deriveFmaAmzs(source);
  const northbound = result.amzs.find((a) => a.courseTrueDeg === 0)!;
  expect(northbound.runwayGraphics[0]?.departureEnd).toEqual({ xNm: -0.5, yNm: 1 });
  expect(northbound.courseLines[0]?.departure[1]).toEqual({ xNm: -0.5, yNm: 1 });
  expect(northbound.courseLines[0]?.approach[0].yNm).toBe(-18);
  const diagonal = catalog([
    { runway: "A", course: 45, x: 0, y: 0 },
    { runway: "B", course: 45, x: 0.75, y: 0.75 },
  ]);
  expect(deriveFmaAmzs(diagonal).amzs).toHaveLength(0);
  expect(deriveFmaAmzs(diagonal).diagnostics[0]?.message).toMatch(/spacing/);
});

test("FMA separates disjoint eligible runway pairs without duplicating or dropping members", () => {
  const result = deriveFmaAmzs(
    catalog([
      { runway: "A", course: 0, x: 0 },
      { runway: "B", course: 0, x: 1 },
      { runway: "C", course: 0, x: 4 },
      { runway: "D", course: 0, x: 5 },
    ]),
  );
  expect(result.amzs.map((amz) => amz.members.map((member) => member.runwayId))).toEqual([
    ["A", "B"],
    ["C", "D"],
  ]);
  expect(new Set(result.amzs.map((amz) => amz.id)).size).toBe(2);
  expect(result.diagnostics.some((item) => item.message.includes("outside trainer interval"))).toBe(
    true,
  );
});

test("FMA rejects derived NTZ overrides that engulf an approach course", () => {
  const source = catalog([
    { runway: "A", course: 0, x: -0.5 },
    { runway: "B", course: 0, x: 0.5 },
  ]);
  source.fmaOverrides = { groups: [{ id: "WIDE-NTZ", runwayIds: ["A", "B"], ntzWidthFt: 9000 }] };
  expect(deriveFmaAmzs(source)).toMatchObject({
    amzs: [],
    diagnostics: [
      {
        path: "fmaOverrides.groups.WIDE-NTZ",
        message: expect.stringMatching(/NTZ width.*narrower than adjacent course spacing/),
      },
    ],
  });
});

test("FMA diagnoses unresolved referenced FAFs while keeping unrelated valid AMZs", () => {
  for (const [fafId, point] of [
    ["NOPE", undefined],
    ["BAD-FAF", { xNm: Number.NaN, yNm: 0 }],
  ] as const) {
    const source = catalog([
      { runway: "A", course: 0, x: 0 },
      { runway: "B", course: 0, x: 1 },
      { runway: "C", course: 0, x: 4 },
      { runway: "D", course: 0, x: 5 },
    ]);
    if (point) source.fixes.push({ id: fafId, kind: "FAF", ...point });
    source.approaches.find((approach) => approach.id === "APP2")!.fafFixId = fafId;
    const missing = deriveFmaAmzs(source);
    expect(missing.amzs.map((amz) => amz.members.map((member) => member.runwayId))).toEqual([
      ["A", "B"],
    ]);
    expect(missing.diagnostics).toContainEqual({
      path: "approaches.APP2.fafFixId",
      message: "unresolved FAF fix; approach excluded",
    });

    delete source.approaches.find((approach) => approach.id === "APP2")!.fafFixId;
    const optional = deriveFmaAmzs(source);
    expect(optional.diagnostics.some((item) => item.path === "approaches.APP2.fafFixId")).toBe(
      false,
    );
    expect(optional.amzs).toHaveLength(2);
  }
});

test("FMA unresolved FAF runway remains a barrier between valid outer thresholds", () => {
  const source = catalog([
    { runway: "A", course: 0, x: 0 },
    { runway: "B", course: 0, x: 0.5 },
    { runway: "C", course: 0, x: 1 },
  ]);
  source.approaches.find((approach) => approach.id === "APP1")!.fafFixId = "NOPE";
  const result = deriveFmaAmzs(source);
  expect(result.amzs).toEqual([]);
  expect(result.diagnostics).toContainEqual({
    path: "approaches.APP1.fafFixId",
    message: "unresolved FAF fix; approach excluded",
  });
});

function report(at: number, overrides: Partial<SurveillanceReport> = {}): SurveillanceReport {
  return {
    aircraftId: "track-a",
    xNm: 4,
    yNm: 8,
    headingDeg: 90,
    speedKt: 360,
    altitudeFt: 4000,
    reportedAtSimMs: at,
    sourceSiteId: "radar-a",
    paint: "site-rect",
    ...overrides,
  };
}

function fmaState(sensorStatus: FmaSurveillanceState["sensorStatus"] = null) {
  return setFmaSensorStatus(
    configureFmaSurveillance(createFmaSurveillanceState(), true, "AMZ-A"),
    sensorStatus,
  );
}

function tick(
  state: FmaSurveillanceState,
  nowSimMs: number,
  reports: readonly SurveillanceReport[] = [],
  ids: ReadonlySet<string> = new Set(["track-a"]),
) {
  return advanceFmaSurveillance(state, {
    nowSimMs,
    reports,
    liveTrackIds: ids,
    associatedTrackIds: ids,
  });
}

function tickFixture(state: FmaSurveillanceState, nowSimMs: number) {
  return tick(state, nowSimMs, state.sensorFixture?.reports ?? []);
}

test("FMA report gap uses exact simulation-time loss/coast thresholds, freezes its coast, and recovers", () => {
  let state = tick(fmaState(), 0, [report(0)]);
  expect(state.tracks.get("track-a")).toMatchObject({ code: "CURRENT", elapsedLossS: 0 });

  // Repeated paused/render-only callback at the same simulation time is inert.
  const paused = tick(state, 0, [report(0, { xNm: 99 })]);
  expect(paused).toBe(state);
  state = tick(state, 9_999);
  expect(state.tracks.get("track-a")?.code).toBe("CURRENT");
  state = tick(state, 10_000);
  expect(state.tracks.get("track-a")).toMatchObject({ code: "CST", elapsedLossS: 10 });
  expect(state.tracks.get("track-a")?.coastedReport.xNm).toBeCloseTo(5);
  state = tick(state, 30_000);
  const frozen = state.tracks.get("track-a")!;
  expect(frozen).toMatchObject({ code: "FROZEN", elapsedLossS: 30, frozen: true });
  expect(frozen.coastedReport.xNm).toBeCloseTo(7);
  state = tick(state, 31_000);
  expect(state.tracks.get("track-a")?.coastedReport.xNm).toBeCloseTo(7);
  state = tick(state, 32_000, [report(32_000, { xNm: 12, yNm: -3 })]);
  expect(state.tracks.get("track-a")).toMatchObject({
    code: "CURRENT",
    elapsedLossS: 0,
    frozen: false,
    report: { xNm: 12, yNm: -3 },
  });
  state = tick(state, 33_000, [report(33_000, { xNm: Number.NaN })]);
  expect(state.tracks.get("track-a")).toMatchObject({
    code: "CURRENT",
    report: { reportedAtSimMs: 32_000 },
  });
  expect(tick(state, 42_000).tracks.get("track-a")?.code).toBe("CST");
});

test("FMA source status distinguishes NOM from all-source loss; malformed reports do not recover", () => {
  let state = setFmaSensorFixture(fmaState(), {
    sensorStatus: { selectedFastSourceId: "mlat", reportingSourceIds: ["radar-a"] },
    reports: [report(0)],
  });
  state = tickFixture(state, 0);
  expect(state.tracks.get("track-a")).toMatchObject({
    code: "NOM",
    sourceStatus: "SELECTED_FAST_SOURCE_LOST",
  });
  state = setFmaSensorFixture(state, {
    sensorStatus: { selectedFastSourceId: "mlat", reportingSourceIds: ["radar-a"] },
    reports: [report(1_000, { xNm: 4.1 })],
  });
  state = tickFixture(state, 1_000);
  expect(state.tracks.get("track-a")).toMatchObject({
    code: "NOM",
    sourceStatus: "SELECTED_FAST_SOURCE_LOST",
    report: { reportedAtSimMs: 1_000, xNm: 4.1 },
  });
  state = setFmaSensorFixture(state, {
    sensorStatus: { selectedFastSourceId: "mlat", reportingSourceIds: [] },
    reports: [],
  });
  // Even if ordinary selected-source samples continue, the explicit FMA feed
  // owns this exercise and an empty feed represents all-source interruption.
  state = tickFixture(state, 2_000);
  expect(state.tracks.get("track-a")?.sourceStatus).toBe("ALL_SOURCES_LOST");
  state = tickFixture(state, 11_000);
  expect(state.tracks.get("track-a")?.code).toBe("CST");
  state = setFmaSensorStatus(state, null);
  state = tick(state, 12_000, [report(12_000, { headingDeg: Number.POSITIVE_INFINITY })]);
  expect(state.tracks.get("track-a")).toMatchObject({
    code: "CST",
    report: { reportedAtSimMs: 1_000 },
  });
});

test("FMA interruption fixture replaces continuing ordinary samples with its explicit report feed", () => {
  const view = createScopeView(0, 0, {
    radarSites: [
      { id: "slow", name: "Slow", kind: "airport", xNm: 0, yNm: 0, rangeNm: 60, periodMs: 4800 },
    ],
    surveillanceMode: { siteId: "slow" },
  });
  const ordinary = [report(2_000)];
  setFmaSensorFixtureView(view, {
    sensorStatus: { selectedFastSourceId: "mlat", reportingSourceIds: [] },
    reports: [],
  });
  expect(fmaReportsForSimulationTick(view, ordinary)).toEqual([]);
  setFmaSensorFixtureView(view, null);
  expect(fmaReportsForSimulationTick(view, ordinary)).toBe(ordinary);
});

test("FMA frozen paint uses retained reports and never falls back to live World position", () => {
  const view = createScopeView();
  const td = createTrackDisplay();
  td.lastReport = report(0);
  view.tracks.set("track-a", td);
  configureFmaSurveillanceView(view, true, "AMZ-A");
  advanceFmaSurveillanceView(view, {
    nowSimMs: 0,
    reports: [report(0)],
    liveTrackIds: new Set(["track-a"]),
    associatedTrackIds: new Set(["track-a"]),
  });
  delete td.lastReport; // ordinary sampler dropped the out-of-coverage report
  advanceFmaSurveillanceView(view, {
    nowSimMs: 30_000,
    reports: [],
    liveTrackIds: new Set(["track-a"]),
    associatedTrackIds: new Set(["track-a"]),
  });
  expect(td.presentationReport?.xNm).toBeCloseTo(7);
  const hiddenWorldPose = createAircraft({
    id: "track-a",
    callsign: "ABC123",
    xNm: 99,
    yNm: 100,
    headingDeg: 180,
    altitudeFt: 9000,
    speedKt: 240,
  });
  expect(displayAircraft(hiddenWorldPose, td)?.xNm).toBeCloseTo(7);
  expect(td.lastReport).toBeUndefined();
});

test("FMA adapted loss and coast-out intervals override the trainer defaults", () => {
  let state = configureFmaSurveillance(fmaState(), true, "AMZ-A", {
    surveillanceLossS: 5,
    coastOutS: 60,
  });
  state = tick(state, 0, [report(0)]);
  state = tick(state, 5_000);
  expect(state.tracks.get("track-a")?.code).toBe("CST");
  state = tick(state, 60_000);
  expect(state.tracks.get("track-a")).toMatchObject({ code: "FROZEN", elapsedLossS: 60 });
  expect(state.tracks.get("track-a")?.coastedReport.xNm).toBeCloseTo(10);
});

test("FMA cleanup is per display and cannot revive inhibited, disassociated, or prior-AMZ poses", () => {
  const left = tick(fmaState(), 0, [report(0)]);
  const right = tick(fmaState(), 0, [report(0, { aircraftId: "track-b" })], new Set(["track-b"]));
  const coastedLeft = tick(left, 30_000);
  expect(coastedLeft.tracks.get("track-a")?.frozen).toBe(true);
  const inhibited = releaseFmaTrack(coastedLeft, "track-a");
  const oldSuppressed = tick(inhibited, 31_000, [report(0)]);
  expect(oldSuppressed.tracks.has("track-a")).toBe(false);
  expect(tick(oldSuppressed, 32_000, [report(32_000)]).tracks.get("track-a")?.code).toBe("CURRENT");
  const disassociated = pruneFmaSurveillance(coastedLeft, new Set(["track-a"]), new Set());
  expect(disassociated.tracks.size).toBe(0);
  const staleAfterUnsuppress = tick(disassociated, 31_000, [report(0)]);
  expect(staleAfterUnsuppress.tracks.has("track-a")).toBe(false);
  expect(tick(staleAfterUnsuppress, 32_000, [report(32_000)]).tracks.get("track-a")?.code).toBe(
    "CURRENT",
  );
  const changedAmz = configureFmaSurveillance(coastedLeft, true, "AMZ-B");
  expect(changedAmz.tracks.size).toBe(0);
  expect(right.tracks.get("track-b")?.aircraftId).toBe("track-b");
  expect(right.tracks.has("track-a")).toBe(false);
});

test("FMA assignment is explicit, exact and independent of observed course", () => {
  const amz = syntheticAmz();
  expect(resolveFmaRunwayAssignment(["r08", undefined], amz, amz.runwayAliases)).toEqual({
    kind: "RUNWAY",
    runwayId: "08R",
  });
  expect(resolveFmaRunwayAssignment(["ILS08L", "unknown"], amz, amz.runwayAliases)).toEqual({
    kind: "NONE",
  });
  expect(resolveFmaRunwayAssignment(["08L", "08R"], amz, amz.runwayAliases)).toEqual({
    kind: "AMBIGUOUS",
    runwayIds: ["08L", "08R"],
  });
  const aliasCollision = {
    ...amz,
    runwayAliases: { "08L": ["X", "08R"], "08R": ["X"] },
  };
  const exactCanonicalCollision = {
    ...amz,
    runwayAliases: { "08L": ["08R"], "08R": [] },
  };
  for (const [_label, scratchpads, fixture, runwayIds] of [
    ["alias collision in scratchpad one", ["X", ""], aliasCollision, ["08L", "08R"]],
    ["alias collision in scratchpad two", ["", "X"], aliasCollision, ["08L", "08R"]],
    ["alias collides with canonical token", ["08R", ""], exactCanonicalCollision, ["08L", "08R"]],
    ["matching values in both slots", ["08L", "08L"], amz, ["08L"]],
  ] as const) {
    const result = resolveFmaRunwayAssignment(scratchpads, fixture, fixture.runwayAliases);
    expect(result).toEqual(
      runwayIds.length === 1
        ? { kind: "RUNWAY", runwayId: runwayIds[0] }
        : { kind: "AMBIGUOUS", runwayIds },
    );
  }
  const result = evaluateFmaAlerts({
    state: createFmaAlertState("AMZ-SYN"),
    amz,
    nowSimMs: 0,
    tracks: [alertTrack("conflict", -0.5, -0.4, 0, 0, { scratchpads: ["08L", "08R"] })],
    validReportIds: new Set(["conflict"]),
  });
  expect(result.tracks.get("conflict")?.primary).toBeNull();
  expect(result.tracks.get("conflict")?.diagnostic).toContain("Multiple explicit");
  expect(formatFmaAlertDiagnostic(result.diagnostics)).toBe("FMA: CONFLICTING RUNWAY ASSIGNMENT");
  expect(formatFmaAlertDiagnostic([])).toBeNull();
});

test("FMA requires explicit arrival evidence and an unambiguous observed runway", () => {
  const amz = syntheticAmz();
  let state = createFmaAlertState("AMZ-SYN");
  let row = alertTrack("no-arrival", -0.5, -0.4, 0, 0, {
    scratchpads: [""],
    report: { ...alertTrack("seed", -0.5, -0.4, 0, 0).report, speedKt: 120 },
  });
  for (const time of [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]) {
    row = { ...row, report: { ...row.report, reportedAtSimMs: time } };
    state = evaluateFmaAlerts({
      state,
      amz,
      tracks: [row],
      nowSimMs: time,
      validReportIds: new Set([row.aircraftId]),
    }).state;
  }
  const missingArrival = evaluateFmaAlerts({
    state,
    amz,
    tracks: [{ ...row, arrivalAirportId: undefined }],
    nowSimMs: 10000,
  });
  expect(missingArrival.tracks.get("no-arrival")?.primary).toBeNull();

  const overlapping = {
    ...amz,
    members: amz.members.map((member) => ({ ...member, threshold: { xNm: -0.5, yNm: 0 } })),
  };
  let ambiguousState = createFmaAlertState(overlapping.id);
  let ambiguousRow = alertTrack("two-candidates", -0.5, -0.4, 0, 0, {
    scratchpads: [""],
    report: { ...alertTrack("seed", -0.5, -0.4, 0, 0).report, speedKt: 120 },
  });
  for (const time of [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]) {
    ambiguousRow = { ...ambiguousRow, report: { ...ambiguousRow.report, reportedAtSimMs: time } };
    const evaluation = evaluateFmaAlerts({
      state: ambiguousState,
      amz: overlapping,
      tracks: [ambiguousRow],
      nowSimMs: time,
      validReportIds: new Set([ambiguousRow.aircraftId]),
    });
    ambiguousState = evaluation.state;
    if (time === 10000)
      expect(evaluation.tracks.get("two-candidates")?.observedRunwayId).toBeNull();
  }
  const unresolved = evaluateFmaAlerts({
    state: ambiguousState,
    amz: overlapping,
    tracks: [ambiguousRow],
    nowSimMs: 11000,
  });
  expect(unresolved.tracks.get("two-candidates")?.primary).toBeNull();
});

test("FMA vertical limits exclude out-of-band runway alignment and NOZ history", () => {
  const amz = { ...syntheticAmz(), verticalLimits: { floorFt: 1000, ceilingFt: 5000 } };
  let state = createFmaAlertState(amz.id);
  let row = alertTrack("altitude", -0.5, -0.4, 0, 0, { scratchpads: ["08L"] });
  for (const time of [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]) {
    row = { ...row, report: { ...row.report, altitudeFt: 6000, reportedAtSimMs: time } };
    const evaluation = evaluateFmaAlerts({
      state,
      amz,
      tracks: [row],
      nowSimMs: time,
      validReportIds: new Set([row.aircraftId]),
    });
    state = evaluation.state;
  }
  expect(state.alignment.has("altitude")).toBe(false);
  row = {
    ...row,
    report: { ...row.report, xNm: 0, yNm: -0.5, altitudeFt: 4000, reportedAtSimMs: 11000 },
  };
  const enteredNtz = evaluateFmaAlerts({
    state,
    amz,
    tracks: [row],
    nowSimMs: 11000,
    validReportIds: new Set([row.aircraftId]),
  });
  expect(enteredNtz.tracks.get("altitude")?.primary).not.toBe("NTZ_WARNING");
});

test("scoped FMA observer uses canonical plan association, explicit scratchpads and adapted aliases", () => {
  const made = createFlightPlan({
    id: "fma-plan",
    acid: "DAL123",
    assignedBeacon: "7022",
    airportId: "KABC",
    fixes: [],
    scratchpads: ["R08"],
  });
  if (!made.ok) throw new Error(made.error.message);
  const aircraft = createAircraft({
    id: "fma-aircraft",
    callsign: "DAL123",
    squawk: "7022",
    xNm: -0.5,
    yNm: -0.4,
    headingDeg: 0,
    altitudeFt: 5000,
    speedKt: 210,
    destination: "KABC",
  });
  const world = createWorld({ aircraft: [aircraft], flightPlans: [made.value], simTimeMs: 0 });
  const originalWorld = JSON.stringify({
    aircraft: world.aircraft,
    flightPlans: world.flightPlans,
    alerts: world.alerts,
  });
  const view = createScopeView(0, 0, {
    radarSites: [
      { id: "slow", name: "Slow", kind: "airport", xNm: 0, yNm: 0, rangeNm: 60, periodMs: 4800 },
    ],
    surveillanceMode: { siteId: "slow" },
  });
  view.fmaAmzs = [syntheticAmz()];
  configureFmaSurveillanceView(view, true, "AMZ-SYN");
  const track = createTrackDisplay();
  track.tracked = true;
  track.manualSp1 = "08R";
  view.tracks.set(aircraft.id, track);
  let result;
  for (const time of [0, 4800, 9600]) {
    const sampled = report(time, { aircraftId: aircraft.id, xNm: -0.5, yNm: -0.4, headingDeg: 0 });
    advanceFmaSurveillanceView(view, {
      nowSimMs: time,
      reports: [sampled],
      liveTrackIds: new Set([aircraft.id]),
      associatedTrackIds: new Set([aircraft.id]),
    });
    result = observeFmaAlertRuntime(view, world, time, [sampled]);
  }
  advanceFmaSurveillanceView(view, {
    nowSimMs: 10_000,
    reports: [],
    liveTrackIds: new Set([aircraft.id]),
    associatedTrackIds: new Set([aircraft.id]),
  });
  const gapEvaluation = observeFmaAlertRuntime(view, world, 10_000);
  expect(gapEvaluation.tracks.get(aircraft.id)?.primary).toBeNull();
  expect(gapEvaluation.tracks.get(aircraft.id)?.observedRunwayId).toBeNull();
  const sampled = report(14_400, { aircraftId: aircraft.id, xNm: -0.5, yNm: -0.4, headingDeg: 0 });
  advanceFmaSurveillanceView(view, {
    nowSimMs: 14_400,
    reports: [sampled],
    liveTrackIds: new Set([aircraft.id]),
    associatedTrackIds: new Set([aircraft.id]),
  });
  result = observeFmaAlertRuntime(view, world, 14_400, [sampled]);
  expect(result.tracks.get(aircraft.id)?.assignment).toEqual({ kind: "RUNWAY", runwayId: "08R" });
  expect(result.tracks.get(aircraft.id)?.primary).toBe("RUNWAY_ERROR");
  expect(result.tracks.get(aircraft.id)?.supplementary.nom).toBe(false);
  expect(
    JSON.stringify({
      aircraft: world.aircraft,
      flightPlans: world.flightPlans,
      alerts: world.alerts,
    }),
  ).toBe(originalWorld);
  advanceFmaSurveillanceView(view, {
    nowSimMs: 25_000,
    reports: [],
    liveTrackIds: new Set([aircraft.id]),
    associatedTrackIds: new Set([aircraft.id]),
  });
  result = observeFmaAlertRuntime(view, world, 25_000);
  expect(result.tracks.get(aircraft.id)?.primary).toBe("SURVEILLANCE_LOST");
  const oldEpisode = result.tracks.get(aircraft.id)?.episode?.id;
  expect(oldEpisode).toBeDefined();
  expect(deleteFlightPlanFromWorld(world, made.value.id).ok).toBe(true);
  result = observeFmaAlertRuntime(view, world, 25_000);
  expect(result.tracks.has(aircraft.id)).toBe(false);
  expect(view.fmaAlertState.episodes.has(aircraft.id)).toBe(false);
  const replacement = createFlightPlan({
    id: "fma-plan-readded",
    acid: "DAL123",
    assignedBeacon: "7022",
    airportId: "KABC",
    fixes: [],
    scratchpads: ["R08"],
  });
  if (!replacement.ok) throw new Error(replacement.error.message);
  world.flightPlans.push(replacement.value);
  result = observeFmaAlertRuntime(view, world, 25_000);
  expect(result.tracks.get(aircraft.id)?.onset).toBe(true);
  expect(result.tracks.get(aircraft.id)?.episode?.id).not.toBe(oldEpisode);
});

test("FMA runway error waits for a fresh stable report at SITE cadence, persists while cached, and resets on a gap", () => {
  const amz = syntheticAmz();
  let state = createFmaAlertState("AMZ-SYN");
  let current = alertTrack("arrival", -0.5, -0.4, 0, 0, {
    scratchpads: ["08R"],
    reportPeriodMs: 4800,
    report: { ...alertTrack("seed", -0.5, -0.4, 0, 0).report, speedKt: 120 },
  });
  for (const time of [0, 4800, 9600]) {
    current = { ...current, report: { ...current.report, reportedAtSimMs: time } };
    state = evaluateFmaAlerts({
      state,
      amz,
      tracks: [current],
      nowSimMs: time,
      validReportIds: new Set(["arrival"]),
    }).state;
  }
  const early = evaluateFmaAlerts({ state, amz, tracks: [current], nowSimMs: 10_000 });
  expect(early.tracks.get("arrival")?.primary).toBeNull();
  current = { ...current, report: { ...current.report, reportedAtSimMs: 14_400 } };
  const stable = evaluateFmaAlerts({
    state: early.state,
    amz,
    tracks: [current],
    nowSimMs: 14_400,
    validReportIds: new Set(["arrival"]),
  });
  expect(stable.tracks.get("arrival")?.primary).toBe("RUNWAY_ERROR");
  const cached = evaluateFmaAlerts({
    state: stable.state,
    amz,
    tracks: [current],
    nowSimMs: 15_000,
  });
  expect(cached.tracks.get("arrival")?.primary).toBe("RUNWAY_ERROR");
  expect(cached.tracks.get("arrival")?.onset).toBe(false);
  const gap = evaluateFmaAlerts({ state: cached.state, amz, tracks: [current], nowSimMs: 22_001 });
  expect(gap.tracks.get("arrival")?.primary).toBeNull();
  const invalid = evaluateFmaAlerts({
    state: stable.state,
    amz,
    tracks: [current],
    nowSimMs: 14_401,
    invalidReportIds: new Set(["arrival"]),
  });
  expect(invalid.state.alignment.has("arrival")).toBe(false);
});

test("FMA does not stabilize a stationary report and zero speed interrupts alignment", () => {
  const amz = syntheticAmz();
  let state = createFmaAlertState(amz.id);
  let row = alertTrack("stationary", -0.5, -0.4, 0, 0, { scratchpads: ["08R"] });
  for (const time of [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]) {
    row = {
      ...row,
      report: { ...row.report, speedKt: 0, reportedAtSimMs: time },
    };
    state = evaluateFmaAlerts({
      state,
      amz,
      tracks: [row],
      nowSimMs: time,
      validReportIds: new Set([row.aircraftId]),
    }).state;
  }
  expect(state.alignment.has("stationary")).toBe(false);
  let moving = alertTrack("interrupted", -0.5, -0.4, 0, 0, {
    scratchpads: ["08R"],
    report: { ...alertTrack("seed", -0.5, -0.4, 0, 0).report, speedKt: 120 },
  });
  for (const time of [0, 1000, 2000, 3000, 4000, 5000]) {
    moving = { ...moving, report: { ...moving.report, reportedAtSimMs: time } };
    state = evaluateFmaAlerts({
      state,
      amz,
      tracks: [moving],
      nowSimMs: time,
      validReportIds: new Set([moving.aircraftId]),
    }).state;
  }
  moving = { ...moving, report: { ...moving.report, speedKt: 0, reportedAtSimMs: 6000 } };
  const stopped = evaluateFmaAlerts({
    state,
    amz,
    tracks: [moving],
    nowSimMs: 6000,
    validReportIds: new Set([moving.aircraftId]),
  });
  expect(stopped.state.alignment.has("interrupted")).toBe(false);
  moving = { ...moving, report: { ...moving.report, speedKt: 120, reportedAtSimMs: 7000 } };
  const resumed = evaluateFmaAlerts({
    state: stopped.state,
    amz,
    tracks: [moving],
    nowSimMs: 7000,
    validReportIds: new Set([moving.aircraftId]),
  });
  expect(resumed.tracks.get("interrupted")?.primary).toBeNull();
});

test("FMA CST episodes follow current assigned runway and per-runway NTZ adjacency", () => {
  const base = syntheticAmz();
  const amz: FmaAmz = {
    ...base,
    members: [
      ...base.members,
      {
        ...base.members[1]!,
        runwayId: "08C",
        approachId: "ILS08C",
        threshold: { xNm: 1.5, yNm: 0.1 },
        noz: base.members[1]!.noz,
      },
    ],
    runwayAliases: { ...base.runwayAliases, "08C": ["R08C"] },
    ntzs: [
      { ...base.ntzs[0]!, id: "NTZ-LM" },
      { ...base.ntzs[0]!, id: "NTZ-MR", leftRunwayId: "08R", rightRunwayId: "08C" },
    ],
  };
  const evaluate = (
    tracks: FmaAlertTrackInput[],
    time: number,
    prior = createFmaAlertState(amz.id),
    ntzIds: string[] = [],
  ) => {
    const timedTracks = tracks.map((track) => ({
      ...track,
      report: { ...track.report, reportedAtSimMs: time },
    }));
    return evaluateFmaAlerts({
      state: prior,
      amz,
      tracks: timedTracks,
      nowSimMs: time,
      validReportIds: new Set(timedTracks.map((track) => track.aircraftId)),
      inhibit: { ntzIds: new Set(ntzIds) },
    });
  };
  const cst = (id: string, runway: string) =>
    alertTrack(id, 0.5, -0.4, 0, 0, {
      scratchpads: [runway],
      surveillance: "CST",
      report: { ...alertTrack("seed", 0.5, -0.4, 0, 0).report, speedKt: 120 },
    });

  const onsetA = evaluate([cst("a", "08L")], 0);
  expect(onsetA.tracks.get("a")?.episode?.runwayIds).toEqual(["08L"]);
  const reassigned = evaluate([cst("a", "08R")], 1000, onsetA.state);
  expect(reassigned.tracks.get("a")?.onset).toBe(true);
  expect(reassigned.tracks.get("a")?.episode?.runwayIds).toEqual(["08R"]);
  expect(reassigned.tracks.get("a")?.episode?.evidence).toEqual([
    "SURVEILLANCE_LOST for assigned runway 08R",
  ]);
  const unchanged = evaluate([cst("a", "08R")], 2000, reassigned.state);
  expect(unchanged.tracks.get("a")?.onset).toBe(false);

  const mixed = evaluate(
    [cst("left", "08L"), cst("middle", "08R"), cst("right", "08C")],
    3000,
    unchanged.state,
    ["NTZ-LM"],
  );
  expect(mixed.tracks.get("left")?.primary).toBeNull();
  expect(mixed.tracks.get("middle")?.primary).toBe("SURVEILLANCE_LOST");
  expect(mixed.tracks.get("right")?.primary).toBe("SURVEILLANCE_LOST");
  let runwayState = mixed.state;
  let disabledObservedRunway: ReturnType<typeof evaluateFmaAlerts> | undefined;
  let enabledObservedRunway: ReturnType<typeof evaluateFmaAlerts> | undefined;
  for (const time of [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10_000]) {
    enabledObservedRunway = evaluate(
      [
        alertTrack("rwy-observed-left", -0.5, -0.4, 0, time, {
          scratchpads: ["08R"],
          report: { ...alertTrack("seed", -0.5, -0.4, 0, time).report, speedKt: 120 },
        }),
        alertTrack("rwy-observed-middle", 0.5, -0.4, 0, time, {
          scratchpads: ["08L"],
          report: { ...alertTrack("seed", 0.5, -0.4, 0, time).report, speedKt: 120 },
        }),
      ],
      time,
      runwayState,
      ["NTZ-LM"],
    );
    runwayState = enabledObservedRunway.state;
    disabledObservedRunway = enabledObservedRunway;
  }
  expect(disabledObservedRunway?.tracks.get("rwy-observed-left")?.observedRunwayId).toBe("08L");
  expect(disabledObservedRunway?.tracks.get("rwy-observed-left")?.primary).toBeNull();
  expect(enabledObservedRunway?.tracks.get("rwy-observed-middle")?.observedRunwayId).toBe("08R");
  expect(enabledObservedRunway?.tracks.get("rwy-observed-middle")?.primary).toBe("RUNWAY_ERROR");
  expect(enabledObservedRunway?.tracks.get("rwy-observed-middle")?.episode?.runwayIds).toEqual([
    "08L",
    "08R",
  ]);
  expect(enabledObservedRunway?.tracks.get("rwy-observed-middle")?.episode?.evidence[0]).toContain(
    "assigned 08L, observed 08R",
  );
  const mixedFrozen = evaluate(
    [
      alertTrack("frozen-left", -0.5, -0.4, 0, 3500, {
        scratchpads: ["08L"],
        surveillance: "FROZEN",
      }),
      alertTrack("frozen-middle", 0.5, -0.4, 0, 3500, {
        scratchpads: ["08R"],
        surveillance: "FROZEN",
      }),
    ],
    3500,
    mixed.state,
    ["NTZ-LM"],
  );
  expect(mixedFrozen.tracks.get("frozen-left")?.primary).toBeNull();
  expect(mixedFrozen.tracks.get("frozen-middle")?.primary).toBe("SURVEILLANCE_LOST");
  const allAdjacentOff = evaluate([cst("middle", "08R")], 4000, mixed.state, ["NTZ-LM", "NTZ-MR"]);
  expect(allAdjacentOff.tracks.get("middle")?.primary).toBeNull();
  expect(allAdjacentOff.state.episodes.has("middle")).toBe(false);

  const plans = [
    ["frozen-left", "FZLFT", "08L"],
    ["frozen-middle", "FZMID", "08R"],
  ].map(([id, acid, runway]) => {
    const plan = createFlightPlan({
      id: `plan-${id}`,
      acid: acid!,
      assignedBeacon: id === "frozen-left" ? "7001" : "7002",
      airportId: "KABC",
      fixes: [],
      scratchpads: [runway!],
    });
    if (!plan.ok) throw new Error(plan.error.message);
    return plan.value;
  });
  const aircraft = plans.map((plan) =>
    createAircraft({
      id: plan.id.replace("plan-", ""),
      callsign: plan.acid,
      squawk: plan.assignedBeacon,
      xNm: plan.acid === "frozen-left" ? -0.5 : 0.5,
      yNm: -0.4,
      headingDeg: 0,
      altitudeFt: 5000,
      speedKt: 120,
      destination: "KABC",
    }),
  );
  const world = createWorld({ aircraft, flightPlans: plans, simTimeMs: 0 });
  const view = createScopeView();
  view.fmaAmzs = [amz];
  configureFmaSurveillanceView(view, true, amz.id);
  for (const row of aircraft) {
    const td = createTrackDisplay();
    td.tracked = true;
    view.tracks.set(row.id, td);
  }
  const retainedReports = aircraft.map((row) =>
    report(0, {
      aircraftId: row.id,
      xNm: row.xNm,
      yNm: row.yNm,
      headingDeg: row.headingDeg,
      speedKt: row.speedKt,
    }),
  );
  const ids = new Set(aircraft.map((row) => row.id));
  advanceFmaSurveillanceView(view, {
    nowSimMs: 0,
    reports: retainedReports,
    liveTrackIds: ids,
    associatedTrackIds: ids,
  });
  advanceFmaSurveillanceView(view, {
    nowSimMs: 30_000,
    reports: [],
    liveTrackIds: ids,
    associatedTrackIds: ids,
  });
  expect(view.fmaSurveillance.tracks.get("frozen-left")?.frozen).toBe(true);
  expect(view.fmaSurveillance.tracks.get("frozen-middle")?.frozen).toBe(true);
  view.fmaAlertInhibit = { ntzIds: new Set(["NTZ-LM"]) };
  let runtime = observeFmaAlertRuntime(view, world, 30_000);
  expect(view.fmaSurveillance.tracks.has("frozen-left")).toBe(false);
  expect(view.fmaSurveillance.tracks.get("frozen-middle")?.frozen).toBe(true);
  expect(runtime.tracks.get("frozen-middle")?.primary).toBe("SURVEILLANCE_LOST");
  view.fmaAlertInhibit = {};
  runtime = observeFmaAlertRuntime(view, world, 31_000);
  expect(view.fmaSurveillance.tracks.has("frozen-left")).toBe(false);
  expect(runtime.tracks.has("frozen-left")).toBe(false);
  expect(view.fmaSurveillance.tracks.has("frozen-middle")).toBe(true);
});

test("FMA warning, CST, RWY and crossing caution use precedence with NOM supplementary and local inhibition", () => {
  const amz = syntheticAmz();
  let state = createFmaAlertState("AMZ-SYN");
  const first = alertTrack("warn", -0.5, -0.4, 0, 0);
  state = evaluateFmaAlerts({
    state,
    amz,
    tracks: [first],
    nowSimMs: 0,
    validReportIds: new Set(["warn"]),
  }).state;
  let runway = alertTrack("runway", -0.5, -0.4, 0, 0, {
    scratchpads: ["08R"],
    reportPeriodMs: 4800,
    report: { ...alertTrack("seed", -0.5, -0.4, 0, 0).report, speedKt: 120 },
  });
  for (const time of [0, 4800, 9600, 14400]) {
    runway = { ...runway, report: { ...runway.report, reportedAtSimMs: time } };
    state = evaluateFmaAlerts({
      state,
      amz,
      tracks: [runway, first],
      nowSimMs: time,
      validReportIds: new Set(["runway", ...(time === 0 ? ["warn"] : [])]),
    }).state;
  }
  const warning = alertTrack("warn", 0, -0.4, 90, 14400, { surveillance: "CST" });
  const loss = alertTrack("loss", -0.5, -0.4, 0, 14400, { surveillance: "CST" });
  const caution = alertTrack("caution", -0.2, -0.4, 90, 14400, {
    report: {
      xNm: -0.2,
      yNm: -0.4,
      groundTrackDeg: 90,
      speedKt: 144,
      altitudeFt: 5000,
      reportedAtSimMs: 14400,
    },
  });
  const nom = alertTrack("nom", -0.5, -0.4, 0, 14400, { surveillance: "NOM" });
  const all = evaluateFmaAlerts({
    state,
    amz,
    tracks: [warning, loss, runway, caution, nom],
    nowSimMs: 14400,
    validReportIds: new Set(["warn", "loss", "caution", "nom"]),
  });
  expect(all.tracks.get("warn")?.primary).toBe("NTZ_WARNING");
  expect(all.tracks.get("loss")?.primary).toBe("SURVEILLANCE_LOST");
  expect(all.tracks.get("runway")?.primary).toBe("RUNWAY_ERROR");
  expect(all.tracks.get("caution")?.primary).toBe("NTZ_CAUTION");
  expect(all.tracks.get("nom")?.supplementary.nom).toBe(true);
  expect(all.outlines.get("NTZ-08")).toBe("RED");
  const sameEpisode = evaluateFmaAlerts({
    state: all.state,
    amz,
    tracks: [warning],
    nowSimMs: 15000,
  });
  expect(sameEpisode.tracks.get("warn")?.onset).toBe(false);
  const cleared = evaluateFmaAlerts({
    state: sameEpisode.state,
    amz,
    tracks: [alertTrack("warn", -0.5, -0.4, 0, 16000)],
    nowSimMs: 16000,
    validReportIds: new Set(["warn"]),
  });
  const reentered = evaluateFmaAlerts({
    state: cleared.state,
    amz,
    tracks: [warning],
    nowSimMs: 17000,
    validReportIds: new Set(["warn"]),
  });
  expect(reentered.tracks.get("warn")?.onset).toBe(true);
  expect(reentered.tracks.get("warn")?.episode?.id).not.toBe(all.tracks.get("warn")?.episode?.id);
  const inhibited = evaluateFmaAlerts({
    state: all.state,
    amz,
    tracks: [warning],
    nowSimMs: 15001,
    inhibit: { aircraftIds: new Set(["warn"]) },
  });
  expect(inhibited.tracks.get("warn")?.primary).toBeNull();
  expect(inhibited.state.assignedNozHistory.has("warn")).toBe(false);
  const disabled = evaluateFmaAlerts({
    state: all.state,
    amz,
    tracks: [warning, nom],
    nowSimMs: 15002,
    inhibit: { ntzIds: new Set(["NTZ-08"]) },
  });
  expect(disabled.tracks.get("warn")?.primary).toBeNull();
  expect(disabled.tracks.get("nom")?.supplementary.nom).toBe(true);
  const trackInhibitedNom = evaluateFmaAlerts({
    state: all.state,
    amz,
    tracks: [nom],
    nowSimMs: 15003,
    inhibit: { aircraftIds: new Set(["nom"]) },
  });
  expect(trackInhibitedNom.tracks.get("nom")?.supplementary.nom).toBe(false);
});

test("F8 Preview applies FMA inhibit at coasted report position without changing World or selection", () => {
  const made = createFlightPlan({
    id: "click-plan",
    acid: "DAL123",
    assignedBeacon: "7022",
    airportId: "KABC",
    fixes: [],
    scratchpads: ["08L"],
  });
  if (!made.ok) throw new Error(made.error.message);
  const aircraft = createAircraft({
    id: "click-track",
    callsign: "DAL123",
    squawk: "7022",
    xNm: 28,
    yNm: 28,
    headingDeg: 90,
    altitudeFt: 4000,
    speedKt: 180,
    destination: "KABC",
  });
  const world = createWorld({ aircraft: [aircraft], flightPlans: [made.value] });
  const view = createScopeView();
  view.fmaAmzs = [syntheticAmz()];
  const track = createTrackDisplay();
  track.tracked = true;
  view.tracks.set(aircraft.id, track);
  configureFmaSurveillanceView(view, true, "AMZ-SYN");
  advanceFmaSurveillanceView(view, {
    nowSimMs: 0,
    reports: [report(0, { aircraftId: aircraft.id, xNm: 0.5, yNm: -0.5 })],
    liveTrackIds: new Set([aircraft.id]),
    associatedTrackIds: new Set([aircraft.id]),
  });
  advanceFmaSurveillanceView(view, {
    nowSimMs: 40_000,
    reports: [],
    liveTrackIds: new Set([aircraft.id]),
    associatedTrackIds: new Set([aircraft.id]),
  });
  const coast = view.fmaSurveillance.tracks.get(aircraft.id)?.coastedReport;
  expect(view.fmaSurveillance.tracks.get(aircraft.id)?.frozen).toBe(true);
  expect(coast?.xNm).not.toBe(aircraft.xNm);
  const target = nmToScreen(coast!.xNm, coast!.yNm, view.camera, { widthPx: 800, heightPx: 800 });
  handleScopeKeyDown(
    { key: "F8", preventDefault() {}, stopPropagation() {} },
    view,
    "radio",
    world,
    1,
  );
  expect(view.preview.mnemonic).toBe("FMA/TSAS");
  expect(view.historyDotCount).toBe(5);
  handlePpiLeftClick(view, world, target.x, target.y, 800, 800);
  expect(view.fmaAlertInhibit.aircraftIds?.has(aircraft.id)).toBe(true);
  expect(view.fmaSurveillance.tracks.has(aircraft.id)).toBe(false);
  expect(view.preview.phase).toBe("idle");
  expect(world.selectedAircraftId).toBeNull();
  expect(aircraft.xNm).toBe(28);
});

test("bare F8 keeps a non-FMA Preview entry visible through empty Enter and rejects unsupported operands as FORMAT", () => {
  const view = createScopeView();
  const world = createWorld();
  const event = (key: string) => ({ key, preventDefault() {}, stopPropagation() {} });
  handleScopeKeyDown(event("F8"), view, "radio", world, 1);
  expect(view.preview.mnemonic).toBe("FMA/TSAS");
  handleScopeKeyDown(event("Enter"), view, "radio", world, 2);
  expect(view.preview.mnemonic).toBe("FMA/TSAS");
  expect(view.preview.phase).toBe("armed");
  handleScopeKeyDown(event("A"), view, "radio", world, 3);
  handleScopeKeyDown(event("Enter"), view, "radio", world, 4);
  expect(view.preview.rejection).toBe("FORMAT");
  expect(view.historyDotCount).toBe(5);
  expect(world.selectedAircraftId).toBeNull();
});

test("AC2 — warning acknowledgment stops flashing and cancels speech; caution click silences speech only", () => {
  const made = createFlightPlan({
    id: "ack-plan",
    acid: "DAL456",
    assignedBeacon: "7023",
    airportId: "KABC",
    fixes: [],
    scratchpads: ["08L"],
  });
  if (!made.ok) throw new Error(made.error.message);
  const aircraft = createAircraft({
    id: "ack-track",
    callsign: "DAL456",
    squawk: "7023",
    xNm: 0.5,
    yNm: -0.5,
    headingDeg: 90,
    altitudeFt: 4000,
    speedKt: 180,
    destination: "KABC",
  });
  const world = createWorld({ aircraft: [aircraft], flightPlans: [made.value] });
  const view = createScopeView();
  view.fmaAmzs = [syntheticAmz()];
  const track = createTrackDisplay();
  track.tracked = true;
  view.tracks.set(aircraft.id, track);
  configureFmaSurveillanceView(view, true, "AMZ-SYN");

  // Warning episode
  const episodeWarning = {
    id: "ep-warn",
    condition: "NTZ_WARNING" as const,
    onsetSimMs: 1000,
    amzId: "AMZ-SYN",
    runwayIds: ["08L"],
    ntzIds: ["NTZ-1"],
    evidence: [],
  };
  view.fmaAlertResults.set(aircraft.id, {
    aircraftId: aircraft.id,
    assignment: { kind: "RUNWAY", runwayId: "08L" },
    observedRunwayId: "08L",
    primary: "NTZ_WARNING",
    episode: episodeWarning,
    onset: false,
    supplementary: { nom: false },
  });

  const screenPos = nmToScreen(aircraft.xNm, aircraft.yNm, view.camera, {
    widthPx: 800,
    heightPx: 800,
  });
  handlePpiLeftClick(view, world, screenPos.x, screenPos.y, 800, 800);
  expect(view.fmaAcknowledgedEpisodeIds.has("ep-warn")).toBe(true);
  expect(view.fmaSpeechEvents).toEqual(
    expect.arrayContaining([{ type: "cancel", episodeId: "ep-warn", aircraftId: aircraft.id }]),
  );

  // Caution episode
  const episodeCaution = {
    id: "ep-caut",
    condition: "NTZ_CAUTION" as const,
    onsetSimMs: 2000,
    amzId: "AMZ-SYN",
    runwayIds: ["08L"],
    ntzIds: ["NTZ-1"],
    evidence: [],
  };
  view.fmaAlertResults.set(aircraft.id, {
    aircraftId: aircraft.id,
    assignment: { kind: "RUNWAY", runwayId: "08L" },
    observedRunwayId: "08L",
    primary: "NTZ_CAUTION",
    episode: episodeCaution,
    onset: false,
    supplementary: { nom: false },
  });

  handlePpiLeftClick(view, world, screenPos.x, screenPos.y, 800, 800);
  expect(view.fmaAcknowledgedEpisodeIds.has("ep-caut")).toBe(false); // Caution is never visually acknowledged!
  expect(view.fmaSilencedEpisodeIds.has("ep-caut")).toBe(true); // Caution is speech-silenced only
  expect(view.fmaSpeechEvents).toEqual(
    expect.arrayContaining([{ type: "cancel", episodeId: "ep-caut", aircraftId: aircraft.id }]),
  );
});

test("AC3 & AC4 — Field 0 uses exact STARS abbreviations (NTZ, CST, RWY) with red alert precedence; Field 2 solid ▼ takes precedence", () => {
  const made = createFlightPlan({
    id: "f0-plan",
    acid: "AAL789",
    assignedBeacon: "7024",
    airportId: "KABC",
    fixes: [],
    scratchpads: ["08L"],
  });
  if (!made.ok) throw new Error(made.error.message);
  const aircraft = createAircraft({
    id: "f0-track",
    callsign: "AAL789",
    squawk: "7024",
    xNm: 10,
    yNm: 10,
    headingDeg: 90,
    altitudeFt: 4000,
    speedKt: 180,
    destination: "KABC",
  });
  const world = createWorld({ aircraft: [aircraft], flightPlans: [made.value] });
  const view = createScopeView();
  view.fmaAmzs = [syntheticAmz()];
  configureFmaSurveillanceView(view, true, "AMZ-SYN");

  // NTZ Warning with NOM supplementary
  view.fmaAlertResults.set(aircraft.id, {
    aircraftId: aircraft.id,
    assignment: { kind: "RUNWAY", runwayId: "08L" },
    observedRunwayId: "08L",
    primary: "NTZ_WARNING",
    episode: {
      id: "ep-1",
      condition: "NTZ_WARNING",
      onsetSimMs: 1000,
      amzId: "AMZ-SYN",
      runwayIds: ["08L"],
      ntzIds: ["NTZ-1"],
      evidence: [],
    },
    onset: false,
    supplementary: { nom: true },
  });

  const track = createTrackDisplay();
  track.tracked = true;
  view.tracks.set(aircraft.id, track);

  const presentation = buildScopeDatablockPresentation(view, world, aircraft);
  expect(presentation.lines.line0).toBe("NTZ/NOM");
  expect(presentation.field0Alerts.color).toBe(PALETTE.alert); // Red alert must not be corrupted by NOM!

  // CST and RWY abbreviations
  view.fmaAlertResults.set(aircraft.id, {
    aircraftId: aircraft.id,
    assignment: { kind: "RUNWAY", runwayId: "08L" },
    observedRunwayId: "08L",
    primary: "SURVEILLANCE_LOST",
    episode: {
      id: "ep-2",
      condition: "SURVEILLANCE_LOST",
      onsetSimMs: 1000,
      amzId: "AMZ-SYN",
      runwayIds: ["08L"],
      ntzIds: ["NTZ-1"],
      evidence: [],
    },
    onset: false,
    supplementary: { nom: false },
  });
  expect(buildScopeDatablockPresentation(view, world, aircraft).lines.line0).toBe("CST");

  view.fmaAlertResults.set(aircraft.id, {
    aircraftId: aircraft.id,
    assignment: { kind: "RUNWAY", runwayId: "08L" },
    observedRunwayId: "08L",
    primary: "RUNWAY_ERROR",
    episode: {
      id: "ep-3",
      condition: "RUNWAY_ERROR",
      onsetSimMs: 1000,
      amzId: "AMZ-SYN",
      runwayIds: ["08L"],
      ntzIds: ["NTZ-1"],
      evidence: [],
    },
    onset: false,
    supplementary: { nom: false },
  });
  expect(buildScopeDatablockPresentation(view, world, aircraft).lines.line0).toBe("RWY");

  // Field 2 solid ▼ glyph precedence over MSAW/CA
  view.fmaAlertInhibit.aircraftIds = new Set([aircraft.id]);
  const inhibitedPresentation = buildScopeDatablockPresentation(view, world, aircraft);
  expect(inhibitedPresentation.alertGlyphs).toEqual([
    { text: "▼", color: expect.any(String), visible: true },
  ]);

  // When all NTZs in AMZ are inhibited, FMA suppression glyphs are hidden
  view.fmaAlertInhibit.ntzIds = new Set(["NTZ-08"]);
  const allNtzInhibitedPresentation = buildScopeDatablockPresentation(view, world, aircraft);
  expect(allNtzInhibitedPresentation.alertGlyphs).toEqual([]);
});
