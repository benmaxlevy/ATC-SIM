import { expect, test } from "vitest";
import type { ProcedureCatalog } from "../../scenario/procedures/types";
import { deriveFmaAmzs } from "../../core/alerts/fmaGeometry";
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
import { displayAircraft } from "../render/renderScopePaint";

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
  const view = createScopeView();
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
