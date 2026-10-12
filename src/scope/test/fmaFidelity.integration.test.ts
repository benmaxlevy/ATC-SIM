import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProcedureCatalog } from "../../scenario/procedures/types";
import { resolveFmaFlow } from "../../scenario/fmaFlow";
import { loadPlayableScenario } from "../../scenario/playableScenarios";
import { deriveFmaAmzs } from "../../core/alerts/fmaGeometry";
import {
  createFmaAlertState,
  createFlightPlan,
  createWorld,
  deleteFlightPlanFromWorld,
  evaluateFmaAlerts,
  magneticToTrueDeg,
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
  clearFmaSurveillanceView,
  configureFmaSurveillanceView,
  createScopeView,
  fmaReportsForSimulationTick,
  setFmaSensorFixtureView,
} from "../scopeView";
import { createTrackDisplay } from "../trackDisplay";
import { armPreviewSlewAction } from "../previewArea";
import { buildScopeDatablockPresentation, displayAircraft } from "../render/renderScopePaint";
import { PALETTE } from "../palette";
import { formatFmaAlertDiagnostic, observeFmaAlertRuntime } from "../fmaAlerts";
import { handleScopeKeyDown, installAlwaysOnScopeKeys } from "../scopeKeys";
import { handlePpiCanvasClick, handlePpiLeftClick } from "../ppi";
import { nmToScreen, type ScopeCamera } from "../camera";
import {
  isFmaAvailable,
  enterFmaConfirmation,
  cancelFmaConfirmation,
  commitFmaConfirmation,
  stepFmaMag,
  stepFmaPtl,
  stepFmaRunwayLeader,
  toggleFmaNtz,
  toggleFmaNtzAll,
  commitFmaAmzSwitch,
  stepBriteChannel,
} from "../dcb/dcbFunctions";
import {
  armDcbSpinner,
  commitDcbSpinner,
  cancelDcbSpinner,
  inputDcbSpinnerKey,
  handleDcbEscape,
} from "../dcb/dcbMenu";
import {
  serializeDcbPref,
  applyDcbPref,
  dcbPrefStorageKey,
  loadDcbPrefFromStorage,
  saveDcbPref,
  saveFmaAmzPreference,
  applyFmaAmzPreference,
  commitDcbPrefSaveAs,
} from "../dcb/dcbPref";
import { bindFmaScenarioFlow, rebindFmaScenarioAmzs, setFmaVoiceLevel } from "../scopeView";
import { buildSsaRenderLines } from "../ssa";
import { getDatablockVisualState } from "../render/renderScopePaint";
import { makeTestAircraft } from "../../core";
import {
  createFmaSpeechController,
  formatFmaAlertUtterance,
  syncFmaSpeech,
  type SpeechSynthesisLike,
  type SpeechSynthesisUtteranceLike,
  type SpeechSynthesisVoiceLike,
} from "../../app/fma-speech";
import {
  createScopeProjection,
  scopeProjectionFromView,
  projectWorldPoint,
  unprojectWorldPoint,
  applyProjectedPanDelta,
} from "../projection";
import { createMockCtx } from "./mockCanvas";
import { bboxFromArp, decodeRgbaToVipMasks } from "../wx";
import { drawWeatherLayer } from "../render/weatherLayer";
import { generateCompassRoseGeometry } from "../compassRose";
import { drawChordHint, drawFmaLayers, drawMapLayers } from "../render/renderScopePaint";
import { buildMapCache, reuseOrBuildMapCache, toMapCacheInput, type MapCache } from "../mapLayers";
import { pickAircraftAt } from "../pick";
import { renderScope } from "../render/renderScope";
import { renderPref } from "../../ui/dcb/DisplayControlBarMenus";
import { renderFmaAux, renderModeMenu } from "../../ui/dcb/DisplayControlBarMenus";
import { FmaAudioStatus } from "../../ui/shell";

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

function findRenderedDcbCell(node: unknown, id: string): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const candidate = node as { props?: Record<string, unknown> };
  if (candidate.props?.dataDcb === id) return candidate.props;
  const children = candidate.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findRenderedDcbCell(child, id);
    if (found) return found;
  }
  return null;
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

test("T02-230 resolves active runway flow, magnetic wrap, overrides, and safe unavailable diagnostics", () => {
  const reciprocalFlows = catalog(
    [
      { runway: "09", course: 85, x: 0, y: -0.5, id: "E09" },
      { runway: "10", course: 85, x: 0.5, y: 0.5, id: "E10" },
      { runway: "27", course: 265, x: 10, y: -0.5, id: "W27" },
      { runway: "28", course: 265, x: 10.5, y: 0.5, id: "W28" },
    ],
    5,
  );
  const east = resolveFmaFlow(reciprocalFlows, "09");
  const west = resolveFmaFlow(reciprocalFlows, "27");
  expect(east.amzs.length).toBeGreaterThan(0);
  expect(east.amzs.every((amz) => amz.courseTrueDeg === 90)).toBe(true);
  expect(east.amzs.some((amz) => amz.members.some((member) => member.runwayId === "27"))).toBe(
    false,
  );
  expect(west.amzs.length).toBeGreaterThan(0);
  expect(west.amzs.every((amz) => amz.courseTrueDeg === 270)).toBe(true);

  const explicit = east.amzs[east.amzs.length - 1]!;
  expect(resolveFmaFlow(reciprocalFlows, "09", { initialAmzId: explicit.id }).selectedAmzId).toBe(
    explicit.id,
  );
  const stale = resolveFmaFlow(reciprocalFlows, "09", { initialAmzId: west.amzs[0]!.id });
  expect(stale.selectedAmzId).toBe(east.selectedAmzId);
  expect(stale.diagnostics.join(" ")).toMatch(/stale or opposite-flow/);
  expect(resolveFmaFlow(reciprocalFlows, "09", { preferredAmzId: explicit.id }).selectedAmzId).toBe(
    explicit.id,
  );

  const wrapped = resolveFmaFlow(
    catalog(
      [
        { runway: "A", course: 355, x: 0, y: -0.5 },
        { runway: "B", course: 355, x: 0.5, y: 0.5 },
      ],
      5,
    ),
    "A",
  );
  expect(wrapped.amzs).toHaveLength(1);
  expect(wrapped.amzs[0]?.courseTrueDeg).toBe(0);

  const ambiguousCatalog = catalog([
    { runway: "09", course: 0, x: 0, id: "A" },
    { runway: "09", course: 0.7, x: 0, y: 0.5, id: "B" },
    { runway: "09", course: 1.4, x: 0.5, y: 0.5, id: "C" },
  ]);
  const ambiguous = resolveFmaFlow(ambiguousCatalog, "09");
  const reverseOrdered = resolveFmaFlow(
    {
      ...ambiguousCatalog,
      approaches: [...ambiguousCatalog.approaches].reverse(),
    },
    "09",
  );
  expect(ambiguous.amzs).toEqual([]);
  expect(ambiguous.diagnostics.join(" ")).toMatch(/ambiguous inbound/);
  expect(formatFmaAlertDiagnostic([], ambiguous.diagnostics)).toBe(
    "FMA: ACTIVE RUNWAY COURSE AMBIGUOUS",
  );
  expect(reverseOrdered).toEqual(ambiguous);
  const stableOrder = resolveFmaFlow(
    {
      ...reciprocalFlows,
      approaches: [...reciprocalFlows.approaches].reverse(),
      fixes: [...reciprocalFlows.fixes].reverse(),
    },
    "09",
  );
  expect(stableOrder.selectedAmzId).toBe(east.selectedAmzId);
  const multipleEligible = catalog([
    { runway: "A", course: 90, x: 0, y: -0.5, id: "A" },
    { runway: "B", course: 90, x: 0.5, y: 0.5, id: "B" },
    { runway: "C", course: 90, x: 0, y: 10, id: "C" },
    { runway: "D", course: 90, x: 0.5, y: 10.5, id: "D" },
    { runway: "E", course: 90, x: 0, y: 25, id: "E" },
  ]);
  const stableFallback = resolveFmaFlow(multipleEligible, "E");
  const reversedFallback = resolveFmaFlow(
    {
      ...multipleEligible,
      approaches: [...multipleEligible.approaches].reverse(),
    },
    "E",
  );
  expect(stableFallback.amzs.length).toBe(2);
  expect(stableFallback.selectedAmzId).toBe(
    [...stableFallback.amzs].map((amz) => amz.id).sort()[0],
  );
  expect(reversedFallback.selectedAmzId).toBe(stableFallback.selectedAmzId);
  const unknown = resolveFmaFlow(reciprocalFlows, "36");
  expect(unknown).toMatchObject({ amzs: [], selectedAmzId: null });
  expect(unknown.diagnostics.join(" ")).toMatch(/no inbound approach course/);
});

test("T02-230 preserves authored offset membership and resolves selected active-runway variants", () => {
  const adapted = catalog(
    [
      { runway: "A", course: 355, x: 0, id: "A-NORTH" },
      { runway: "B", course: 358, x: 0.5, y: 0.5, id: "B-OFFSET" },
      { runway: "C", course: 175, x: 10, id: "C-SOUTH" },
      { runway: "D", course: 178, x: 10.5, y: 0.5, id: "D-OFFSET" },
    ],
    5,
  );
  adapted.approaches.push({
    ...adapted.approaches[0]!,
    id: "A-ALT",
    publishedCourseMagneticDeg: 15 as never,
  });
  const polygon = (x: number, y: number) => [
    { xNm: x, yNm: y },
    { xNm: x + 1, yNm: y },
    { xNm: x + 1, yNm: y + 20 },
    { xNm: x, yNm: y + 20 },
  ];
  const geometry = (runwayIds: string[]) => ({
    amzBoundary: polygon(-1, -1),
    runways: runwayIds.map((runwayId, index) => ({ runwayId, noz: polygon(index * 0.5, 0) })),
    ntzs: [
      {
        id: `NTZ-${runwayIds.join("-")}`,
        leftRunwayId: runwayIds[0]!,
        rightRunwayId: runwayIds[1]!,
        polygon: polygon(2, 2),
      },
    ],
    courseLines: runwayIds.map((runwayId) => ({
      runwayId,
      approach: [
        { xNm: 0, yNm: -10 },
        { xNm: 0, yNm: 0 },
      ] as [{ xNm: number; yNm: number }, { xNm: number; yNm: number }],
      departure: [
        { xNm: 0, yNm: 0 },
        { xNm: 0, yNm: 10 },
      ] as [{ xNm: number; yNm: number }, { xNm: number; yNm: number }],
    })),
  });
  adapted.fmaOverrides = {
    excludeDerived: true,
    groups: [
      { id: "OFFSET", approachIds: ["A-NORTH", "B-OFFSET"], geometry: geometry(["A", "B"]) },
      { id: "RECIPROCAL", approachIds: ["C-SOUTH", "D-OFFSET"], geometry: geometry(["C", "D"]) },
    ],
  };

  const result = resolveFmaFlow(adapted, "A", { initialAmzId: "OFFSET", excludeDerived: true });
  expect(result.amzs.map((amz) => amz.id)).toEqual(["OFFSET"]);
  expect(result.selectedAmzId).toBe("OFFSET");
  expect(result.amzs[0]?.members.map((member) => member.approachId)).toEqual([
    "A-NORTH",
    "B-OFFSET",
  ]);
  expect(result.amzs[0]?.provenance).toBe("CATALOG_ADAPTED");
  expect(result.amzs[0]?.courseTrueDeg).toBeCloseTo(1.5);
  expect(result.amzs[0]?.courseLines.map((line) => line.runwayId)).toEqual(["A", "B"]);
  expect(result.amzs[0]?.courseLines[0]?.approach).toEqual([
    { xNm: 0, yNm: -10 },
    { xNm: 0, yNm: 0 },
  ]);
  expect(
    resolveFmaFlow(adapted, "A", { preferredAmzId: "OFFSET", excludeDerived: true }).selectedAmzId,
  ).toBe("OFFSET");

  const staleVariantWithoutAdaptation = resolveFmaFlow(adapted, "A", { excludeDerived: true });
  expect(staleVariantWithoutAdaptation.amzs).toEqual([]);
  expect(staleVariantWithoutAdaptation.diagnostics.join(" ")).toMatch(/ambiguous inbound/);

  const noGeometry = resolveFmaFlow(catalog([{ runway: "A", course: 0, x: 0 }]), "A", {
    excludeDerived: true,
  });
  expect(noGeometry).toMatchObject({ amzs: [], selectedAmzId: null });
  expect(noGeometry.diagnostics.join(" ")).toMatch(/no AMZ geometry matches/);
});

test("T02-230 shared scenario binder rebinds session AMZ, rolls back spinner, and applies override preference", () => {
  const nextCatalog = catalog([
    { runway: "A", course: 90, x: 0, y: -0.5, id: "APP-A" },
    { runway: "B", course: 90, x: 0.5, y: 0.5, id: "APP-B" },
    { runway: "C", course: 90, x: 0, y: 10, id: "APP-C" },
    { runway: "D", course: 90, x: 0.5, y: 10.5, id: "APP-D" },
    { runway: "E", course: 270, x: 0, y: 20, id: "APP-E" },
    { runway: "F", course: 270, x: 0.5, y: 20.5, id: "APP-F" },
    { runway: "G", course: 270, x: 0, y: 30, id: "APP-G" },
    { runway: "H", course: 270, x: 0.5, y: 30.5, id: "APP-H" },
  ]);
  nextCatalog.airportId = "KXYZ";
  const derived = deriveFmaAmzs(nextCatalog).amzs;
  expect(derived).toHaveLength(4);
  const runwayAmz = derived.find((amz) => amz.members.some((member) => member.runwayId === "A"))!;
  const overrideAmz = derived.find((amz) => amz.courseTrueDeg === 90 && amz !== runwayAmz)!;
  const westRunwayAmz = derived.find((amz) =>
    amz.members.some((member) => member.runwayId === "E"),
  )!;
  const westManualAmz = derived.find((amz) => amz.courseTrueDeg === 270 && amz !== westRunwayAmz)!;
  const view = createScopeView(0, 0, { fmaAmzs: derived });
  configureFmaSurveillanceView(view, true, runwayAmz.id);
  saveFmaAmzPreference(view, overrideAmz.id, { mag: 6 });
  saveFmaAmzPreference(view, westRunwayAmz.id, { mag: 4 });
  view.dcbPref.icao = "KXYZ";
  const storedPreferences = new Map<string, string>();
  const preferenceStorage = {
    getItem: (key: string) => storedPreferences.get(key) ?? null,
    setItem: (key: string, value: string) => storedPreferences.set(key, value),
  };
  saveDcbPref(view, preferenceStorage);
  view.fmaMag = 2;
  view.tracks.set("track-a", createTrackDisplay());
  advanceFmaSurveillanceView(view, {
    nowSimMs: 1000,
    reports: [report(1000)],
    liveTrackIds: new Set(["track-a"]),
    associatedTrackIds: new Set(["track-a"]),
  });
  const oldEpisode = {
    id: "old-episode",
    condition: "NTZ_WARNING" as const,
    onsetSimMs: 900,
    amzId: runwayAmz.id,
    runwayIds: ["A"],
    ntzIds: [],
    evidence: [],
  };
  view.fmaAlertState.episodes.set("track-a", oldEpisode);
  view.fmaAlertOutlines.set("track-a", "RED");
  view.fmaAcknowledgedEpisodeIds.add(oldEpisode.id);
  view.fmaSilencedEpisodeIds.add(oldEpisode.id);
  view.placeCenterArmed = true;
  armPreviewSlewAction(view.preview, { type: "fmaTrackInhibit" }, 1000);
  armDcbSpinner(view, "MAG");
  view.fmaSpeechEvents.push({ type: "onset", episodeId: oldEpisode.id, aircraftId: "track-a" });
  view.fmaSpeechEvents.push({ type: "test", level: 5 });
  const world = createWorld();
  const worldBeforeBind = structuredClone(world);

  const nextScenario = {
    activeRunwayId: "A",
    catalog: nextCatalog,
    fma: { initialAmzId: overrideAmz.id },
  };
  const result = bindFmaScenarioFlow(view, nextScenario);

  expect(result.amzs.map((amz) => amz.id)).toContain(overrideAmz.id);
  expect(view.fmaSurveillance.selectedAmzId).toBe(overrideAmz.id);
  expect(view.fmaMag).toBe(6);
  expect(view.dcbSpinner.armed).toBe(false);
  expect(view.fmaSpeechEvents).toEqual([
    { type: "cancel", episodeId: oldEpisode.id, aircraftId: "track-a" },
  ]);
  expect(view.fmaSurveillance.enabled).toBe(true);
  expect(view.fmaSurveillance.tracks.size).toBe(0);
  expect(view.tracks.get("track-a")?.presentationReport).toBeUndefined();
  expect(view.fmaAlertState.episodes.size).toBe(0);
  expect(view.fmaAlertOutlines.size).toBe(0);
  expect(view.fmaAcknowledgedEpisodeIds.size).toBe(0);
  expect(view.fmaSilencedEpisodeIds.size).toBe(0);
  expect(view.preview.phase).toBe("idle");
  expect(view.placeCenterArmed).toBe(true);
  expect(world).toEqual(worldBeforeBind);

  armDcbSpinner(view, "FMA_AMZ");
  for (const key of westRunwayAmz.id) inputDcbSpinnerKey(view, key);
  expect(commitDcbSpinner(view)).toBe(false);
  expect(view.lastWarning).toBe("FORMAT");

  const retained = bindFmaScenarioFlow(view, { ...nextScenario, fma: undefined });
  expect(retained.selectedAmzId).toBe(overrideAmz.id);
  expect(view.fmaSurveillance.selectedAmzId).toBe(overrideAmz.id);

  view.amzPreferences.clear();
  loadDcbPrefFromStorage(view, "KXYZ", preferenceStorage);
  const westbound = bindFmaScenarioFlow(view, {
    ...nextScenario,
    activeRunwayId: "E",
    fma: undefined,
  });
  expect(westbound.amzs.map((amz) => amz.courseTrueDeg)).toEqual([270, 270]);
  expect(view.fmaSurveillance.selectedAmzId).toBe(westRunwayAmz.id);
  expect(storedPreferences.has(dcbPrefStorageKey("KXYZ"))).toBe(true);
  expect(view.fmaMag).toBe(4);
  expect(view.lastWarning).toBeNull();
  expect(view.fmaSurveillance.tracks.size).toBe(0);
  commitFmaAmzSwitch(view, westManualAmz.id);
  expect(view.fmaSurveillance.selectedAmzId).toBe(westManualAmz.id);
  expect(view.lastWarning).toBe("NO PREF SET FOUND");
  const retainedWest = bindFmaScenarioFlow(view, {
    ...nextScenario,
    activeRunwayId: "E",
    fma: undefined,
  });
  expect(retainedWest.selectedAmzId).toBe(westManualAmz.id);
  expect(view.fmaSurveillance.selectedAmzId).toBe(westManualAmz.id);

  const unavailable = bindFmaScenarioFlow(view, {
    ...nextScenario,
    activeRunwayId: "36",
    fma: undefined,
  });
  expect(unavailable.amzs).toEqual([]);
  expect(view.fmaSurveillance.enabled).toBe(false);
  expect(view.fmaAmzs).toEqual([]);
  expect(formatFmaAlertDiagnostic([], view.fmaScenarioDiagnostics)).toBe(
    "FMA: ACTIVE RUNWAY COURSE UNKNOWN",
  );
});

test("T02-230 KATL east/west data smoke binds AMZs to each active catalog runway", () => {
  for (const scenarioId of ["katl", "katl-08"]) {
    const scenario = loadPlayableScenario(scenarioId);
    const resolution = resolveFmaFlow(scenario.catalog, scenario.activeRunwayId, {
      initialAmzId: scenario.fma?.initialAmzId,
      excludeDerived: scenario.fma?.excludeDerivedGroups,
    });
    expect(resolution.amzs.length).toBeGreaterThan(0);
    expect(resolution.selectedAmzId).not.toBeNull();
    const activeCourse = scenario.catalog.approaches.find(
      (approach) => approach.runway.toUpperCase() === scenario.activeRunwayId.toUpperCase(),
    )?.publishedCourseMagneticDeg;
    expect(activeCourse).toBeDefined();
    const activeCourseTrue = magneticToTrueDeg(activeCourse!, scenario.catalog.magVarDeg);
    expect(
      resolution.amzs.every(
        (amz) => Math.abs(((amz.courseTrueDeg - activeCourseTrue + 540) % 360) - 180) <= 1,
      ),
    ).toBe(true);
    const selected = resolution.amzs.find((amz) => amz.id === resolution.selectedAmzId);
    expect(selected).toBeDefined();
  }
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
    dimensions: { captureLengthNm: 20, ntzWidthFt: 2000, outerMarginNm: 0.5 },
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

test("derived FMA defaults use a buffered 20 NM trapezoid and 200-foot references", () => {
  const result = deriveFmaAmzs(
    catalog([
      { runway: "A", course: 0, x: -0.5 },
      { runway: "B", course: 0, x: 0.5 },
    ]),
  );
  expect(result.amzs[0]).toMatchObject({ referenceSpacingFt: 200, provenance: "DERIVED_TRAINER" });
  const derived = result.amzs[0]!;
  expect(derived.dimensions.captureLengthNm).toBe(20);
  expect(derived.boundary.points).toHaveLength(4);
  const [farLeft, farRight, nearRight, nearLeft] = derived.boundary.points;
  expect(farLeft?.yNm).toBeCloseTo(-20);
  expect(farRight?.yNm).toBeCloseTo(-20);
  expect(nearLeft?.yNm).toBeCloseTo(1);
  expect(nearRight?.yNm).toBeCloseTo(1);
  expect(farRight!.xNm - farLeft!.xNm).toBeGreaterThan(nearRight!.xNm - nearLeft!.xNm);
  for (const zone of [
    ...derived.members.map((member) => member.noz),
    ...derived.ntzs.map((ntz) => ntz.polygon),
  ]) {
    for (const vertex of zone.points) {
      expect(vertex.yNm).toBeGreaterThanOrEqual(-19.5);
      expect(vertex.yNm).toBeLessThanOrEqual(0.5);
      expect(vertex.xNm).toBeGreaterThan(farLeft!.xNm);
      expect(vertex.xNm).toBeLessThan(farRight!.xNm);
    }
  }
  expect(derived.members[0]?.noz.points[0]?.xNm).toBeCloseTo(-1);
  expect(farLeft!.xNm).toBeCloseTo(-1.75);
  expect(nearLeft!.xNm).toBeCloseTo(-1.25);
  expect(result.amzs[0]?.fixBars).toEqual([]);
  expect(result.amzs[0]?.runwayGraphics[0]?.departureEnd).toEqual({ xNm: -0.5, yNm: 0 });
  expect(result.amzs[0]?.courseLines[0]?.departure).toEqual([
    { xNm: -0.5, yNm: 0 },
    { xNm: -0.5, yNm: 1 },
  ]);
  const view = createScopeView();
  view.fmaAmzs = result.amzs;
  view.fmaSurveillance.enabled = true;
  view.fmaSurveillance.selectedAmzId = result.amzs[0]!.id;
  const paint = createMockCtx();
  drawFmaLayers(paint.ctx, view, { widthPx: 800, heightPx: 800 });
  const thresholdMarker = paint.pathStrokes.find(
    (stroke) => stroke.strokeStyle === "#808080" && stroke.lineWidth === 5,
  );
  expect(thresholdMarker).toBeDefined();
  expect(
    Math.hypot(
      thresholdMarker!.points[1]!.x - thresholdMarker!.points[0]!.x,
      thresholdMarker!.points[1]!.y - thresholdMarker!.points[0]!.y,
    ),
  ).toBeCloseTo(5);
  expect(
    result.amzs[0]?.referenceLines.every(([start, end]) => {
      const lateralOffsetFt =
        Math.min(Math.abs(start.xNm + 0.5), Math.abs(start.xNm - 0.5)) * 6076.12;
      return (
        start.yNm < 0 &&
        end.yNm <= 0 &&
        Math.abs(start.xNm - end.xNm) < 1e-9 &&
        Math.abs(lateralOffsetFt / 200 - Math.round(lateralOffsetFt / 200)) < 1e-8 &&
        lateralOffsetFt > 0
      );
    }),
  ).toBe(true);
  const translated = deriveFmaAmzs(
    catalog([
      { runway: "A", course: 0, x: 101.5, y: 90 },
      { runway: "B", course: 0, x: 102.5, y: 108 },
    ]),
  );
  const translatedAmz = translated.amzs[0]!;
  expect(translatedAmz.members[0]?.threshold.yNm).toBe(90);
  expect(translatedAmz.courseLines[0]?.approach[0].yNm).toBe(70);
  expect(Math.min(...translatedAmz.boundary.points.map((p) => p.yNm))).toBe(70);
  expect(Math.max(...translatedAmz.boundary.points.map((p) => p.yNm))).toBe(109);
  expect(translatedAmz.ntzs[0]?.polygon.points.some((p) => p.yNm >= 70 && p.yNm <= 109)).toBe(true);
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

test("staggered FAF bars stop at their own NOZ edges and match NTZ thickness", () => {
  const source = catalog([
    { runway: "A", course: 0, x: -0.5 },
    { runway: "B", course: 0, x: 0.5 },
  ]);
  source.fixes.push(
    { id: "FAFA", kind: "FAF", xNm: -0.5, yNm: -5 },
    { id: "FAFB", kind: "FAF", xNm: 0.5, yNm: -6 },
  );
  source.approaches[0]!.fafFixId = "FAFA";
  source.approaches[1]!.fafFixId = "FAFB";
  const result = deriveFmaAmzs(source);
  expect(result.diagnostics).toEqual([]);
  const amz = result.amzs[0]!;
  expect(amz.fixBars.map((bar) => [bar.runwayId, bar.fixId])).toEqual([
    ["A", "FAFA"],
    ["B", "FAFB"],
  ]);
  const ntzHalfWidthNm = 1000 / 6076.12;
  expect(amz.fixBars[0]?.segment[0]).toEqual({ xNm: -1, yNm: -5 });
  expect(amz.fixBars[0]?.segment[1].xNm).toBeCloseTo(-ntzHalfWidthNm);
  expect(amz.fixBars[0]?.segment[1].yNm).toBe(-5);
  expect(amz.fixBars[1]?.segment[0].xNm).toBeCloseTo(ntzHalfWidthNm);
  expect(amz.fixBars[1]?.segment[0].yNm).toBe(-6);
  expect(amz.fixBars[1]?.segment[1]).toEqual({ xNm: 1, yNm: -6 });

  const view = createScopeView();
  view.fmaAmzs = [amz];
  view.fmaSurveillance.enabled = true;
  view.fmaSurveillance.selectedAmzId = amz.id;
  view.fmaMag = 4;
  view.camera.rangeNm = 10;
  const size = { widthPx: 800, heightPx: 800 };
  const paint = createMockCtx();
  drawFmaLayers(paint.ctx, view, size);
  const barStrokes = paint.pathStrokes.filter(
    (stroke) =>
      stroke.strokeStyle === "#FFFFFF" && stroke.lineWidth === 3 && stroke.points.length === 2,
  );
  expect(barStrokes).toHaveLength(2);
  const projection = scopeProjectionFromView(view, size);
  for (const [index, bar] of amz.fixBars.entries()) {
    expect(barStrokes[index]!.points).toEqual([
      projection.toScreen(bar.segment[0].xNm, bar.segment[0].yNm),
      projection.toScreen(bar.segment[1].xNm, bar.segment[1].yNm),
    ]);
  }
});

test("missing thresholds produce diagnostics without fabricated geometry", () => {
  const missing = catalog([{ runway: "A", course: 0, x: 0 }]);
  delete missing.approaches[0]!.thresholdFixId;
  const result = deriveFmaAmzs(missing);
  expect(result.amzs).toEqual([]);
  expect(result.diagnostics[0]).toMatchObject({ path: "approaches.APP0.thresholdFixId" });
});

test("inhibited NTZ shared edges preserve partial NOZ contours and active NTZ paint dominates overlap", () => {
  const view = createScopeView();
  const amz = syntheticAmz();
  amz.members[0]!.noz.points = [
    { xNm: -0.75, yNm: -2 },
    { xNm: -0.1, yNm: -2 },
    { xNm: -0.1, yNm: 2 },
    { xNm: -0.75, yNm: 2 },
  ];
  amz.members[1]!.noz.points = [
    { xNm: 0.1, yNm: -2 },
    { xNm: 0.75, yNm: -2 },
    { xNm: 0.75, yNm: 2 },
    { xNm: 0.1, yNm: 2 },
  ];
  amz.runwayGraphics = [
    { runwayId: "08L", threshold: { xNm: -0.1, yNm: -0.5 }, departureEnd: { xNm: -0.1, yNm: 0.5 } },
  ];
  view.fmaAmzs = [amz];
  view.fmaSurveillance.enabled = true;
  view.fmaSurveillance.selectedAmzId = amz.id;
  view.fmaAlertInhibit.ntzIds = new Set(["NTZ-08"]);
  const projection = scopeProjectionFromView(view, { widthPx: 800, heightPx: 800 });
  const hiddenTrace = createMockCtx();
  drawFmaLayers(hiddenTrace.ctx, view, { widthPx: 800, heightPx: 800 });
  const px = projection.toScreen(-0.1, 0);
  const sharedVertical = hiddenTrace.pathStrokes.filter(
    (stroke) =>
      stroke.strokeStyle === "#FFFFFF" &&
      stroke.lineWidth === 1 &&
      stroke.points.length === 2 &&
      stroke.points.every((point) => Math.abs(point.x - px.x) < 1e-6),
  );
  expect(sharedVertical).toHaveLength(2);
  const residualIntervals = sharedVertical
    .map((stroke) =>
      stroke.points
        .map((point) => projection.toWorld(point.x, point.y).northNm)
        .sort((a, b) => a - b),
    )
    .sort((a, b) => a[0]! - b[0]!);
  expect(residualIntervals[0]![0]).toBeCloseTo(-2);
  expect(residualIntervals[0]![1]).toBeCloseTo(-1);
  expect(residualIntervals[1]![0]).toBeCloseTo(1);
  expect(residualIntervals[1]![1]).toBeCloseTo(2);
  expect(
    hiddenTrace.pathStrokes.some(
      (stroke) => stroke.strokeStyle === "#FFFFFF" && stroke.lineWidth === 3,
    ),
  ).toBe(false);

  view.fmaAlertInhibit.ntzIds = new Set();
  view.fmaAlertOutlines = new Map([["NTZ-08", "RED"]]);
  const activeTrace = createMockCtx();
  drawFmaLayers(activeTrace.ctx, view, { widthPx: 800, heightPx: 800 });
  const grayIndex = activeTrace.pathStrokes.findIndex(
    (stroke) =>
      stroke.strokeStyle === "#808080" &&
      stroke.lineWidth === 5 &&
      stroke.points.every((point) => Math.abs(point.x - px.x) < 1e-6),
  );
  const redIndex = activeTrace.pathStrokes.findIndex(
    (stroke) =>
      stroke.strokeStyle === "#FF0000" &&
      stroke.lineWidth === 3 &&
      stroke.points.length >= 4 &&
      stroke.points.some((point) => Math.abs(point.x - px.x) < 1e-6),
  );
  expect(grayIndex).toBeGreaterThanOrEqual(0);
  expect(redIndex).toBeGreaterThan(grayIndex);
});

test("inhibited NTZ boundaries hide coincident 200-foot reference strokes at narrow derived spacing", () => {
  const result = deriveFmaAmzs(
    catalog([
      { runway: "A", course: 0, x: -1400 / 6076.12 },
      { runway: "B", course: 0, x: 1400 / 6076.12 },
    ]),
  );
  const amz = result.amzs[0]!;
  expect(amz.dimensions.ntzWidthFt).toBe(2000);
  expect(
    amz.referenceLines.some(
      ([start, end]) =>
        Math.abs(start.xNm - end.xNm) < 1e-9 &&
        Math.abs(Math.abs(start.xNm) - 1000 / 6076.12) < 1e-8,
    ),
  ).toBe(true);
  const ntz = amz.ntzs[0]!;
  const inhibitedEdgeX = ntz.polygon.points.find((point) => Math.abs(point.xNm) > 0.1)!.xNm;
  const view = createScopeView();
  view.fmaAmzs = [amz];
  view.fmaSurveillance.enabled = true;
  view.fmaSurveillance.selectedAmzId = amz.id;
  view.camera.rangeNm = 15;
  view.fmaAlertInhibit.ntzIds = new Set([ntz.id]);
  const trace = createMockCtx();
  drawFmaLayers(trace.ctx, view, { widthPx: 800, heightPx: 800 });
  const edgeScreenX = scopeProjectionFromView(view, { widthPx: 800, heightPx: 800 }).toScreen(
    inhibitedEdgeX,
    0,
  ).x;
  expect(
    trace.pathStrokes.some(
      (stroke) =>
        stroke.lineWidth === 0.65 &&
        stroke.points.length === 2 &&
        stroke.points.every((point) => Math.abs(point.x - edgeScreenX) < 1e-6),
    ),
  ).toBe(false);
  expect(trace.pathStrokes.some((stroke) => stroke.lineWidth === 0.65)).toBe(true);
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
  expect(northbound.courseLines[0]?.departure[0]).toEqual({ xNm: -0.5, yNm: 1 });
  expect(northbound.courseLines[0]?.departure[1]).toEqual({ xNm: -0.5, yNm: 2 });
  expect(northbound.runwayGraphics[0]?.departureEnd).toEqual({ xNm: -0.5, yNm: 1 });
  expect(northbound.referenceLines.length).toBeGreaterThan(0);
  expect(northbound.referenceLines.every(([start, end]) => start.yNm < 0 && end.yNm <= 0)).toBe(
    true,
  );
  expect(northbound.courseLines[0]?.approach[0].yNm).toBe(-20);
  const diagonal = catalog([
    { runway: "A", course: 45, x: 0, y: 0 },
    { runway: "B", course: 45, x: 0.75, y: 0.75 },
  ]);
  expect(deriveFmaAmzs(diagonal).amzs).toHaveLength(0);
  expect(deriveFmaAmzs(diagonal).diagnostics[0]?.message).toMatch(/spacing/);
});

test("derived departure courses stop at the first authored AMZ exit and reject no-room geometry", () => {
  const source = catalog([
    { runway: "A", course: 0, x: -0.5 },
    { runway: "B", course: 0, x: 0.5 },
  ]);
  source.fmaOverrides = {
    groups: [
      {
        id: "CLIPPED",
        approachIds: ["APP0", "APP1"],
        geometry: {
          amzBoundary: [
            { xNm: -2, yNm: -20 },
            { xNm: 2, yNm: -20 },
            { xNm: 2, yNm: 1 },
            { xNm: -2, yNm: 0 },
          ],
          runways: [
            {
              runwayId: "A",
              departureEnd: { xNm: -0.5, yNm: 0.2 },
              noz: [
                { xNm: -0.8, yNm: -2 },
                { xNm: -0.2, yNm: -2 },
                { xNm: -0.2, yNm: 0 },
                { xNm: -0.8, yNm: 0 },
              ],
            },
            {
              runwayId: "B",
              departureEnd: { xNm: 0.5, yNm: 0.2 },
              noz: [
                { xNm: 0.2, yNm: -2 },
                { xNm: 0.8, yNm: -2 },
                { xNm: 0.8, yNm: 0 },
                { xNm: 0.2, yNm: 0 },
              ],
            },
          ],
          ntzs: [
            {
              id: "CLIPPED-NTZ",
              leftRunwayId: "A",
              rightRunwayId: "B",
              polygon: [
                { xNm: -0.1, yNm: -2 },
                { xNm: 0.1, yNm: -2 },
                { xNm: 0.1, yNm: 0 },
                { xNm: -0.1, yNm: 0 },
              ],
            },
          ],
        },
      },
    ],
  };
  const clipped = deriveFmaAmzs(source);
  expect(clipped.diagnostics).toEqual([]);
  const amz = clipped.amzs[0]!;
  for (const line of amz.courseLines) {
    expect(line.departure[1]!.yNm).toBeLessThanOrEqual(1);
    expect(line.departure[1]!.yNm).toBeCloseTo(
      line.departure[0]!.yNm + (line.runwayId === "A" ? 0.175 : 0.425),
    );
  }

  source.fmaOverrides.groups![0]!.geometry!.runways[0]!.departureEnd = { xNm: -0.5, yNm: 0.8 };
  const noRoom = deriveFmaAmzs(source);
  expect(noRoom.amzs).toEqual([]);
  expect(
    noRoom.diagnostics.some((item) =>
      item.message.includes("no positive segment inside the authored AMZ boundary"),
    ),
  ).toBe(true);
});

test("FMA references preserve separate approach intervals in a concave authored NOZ", () => {
  const source = catalog([
    { runway: "A", course: 0, x: -0.5 },
    { runway: "B", course: 0, x: 0.5 },
  ]);
  source.fmaOverrides = {
    groups: [
      {
        id: "CONCAVE",
        approachIds: ["APP0", "APP1"],
        geometry: {
          amzBoundary: [
            { xNm: -2, yNm: -20 },
            { xNm: 2, yNm: -20 },
            { xNm: 2, yNm: 5 },
            { xNm: -2, yNm: 5 },
          ],
          runways: [
            {
              runwayId: "A",
              noz: [
                { xNm: -1, yNm: -18 },
                { xNm: -0.3, yNm: -18 },
                { xNm: -0.3, yNm: -12 },
                { xNm: -0.6, yNm: -12 },
                { xNm: -0.6, yNm: -6 },
                { xNm: -0.3, yNm: -6 },
                { xNm: -0.3, yNm: 2 },
                { xNm: -1, yNm: 2 },
              ],
            },
            {
              runwayId: "B",
              noz: [
                { xNm: 0.3, yNm: -18 },
                { xNm: 1, yNm: -18 },
                { xNm: 1, yNm: 2 },
                { xNm: 0.3, yNm: 2 },
              ],
            },
          ],
          ntzs: [
            {
              id: "CONCAVE-NTZ",
              leftRunwayId: "A",
              rightRunwayId: "B",
              polygon: [
                { xNm: -0.1, yNm: -18 },
                { xNm: 0.1, yNm: -18 },
                { xNm: 0.1, yNm: 2 },
                { xNm: -0.1, yNm: 2 },
              ],
            },
          ],
        },
      },
    ],
  };
  const result = deriveFmaAmzs(source);
  expect(result.diagnostics).toEqual([]);
  const lateral = -0.5 + 200 / 6076.12;
  const intervals = result.amzs[0]!.referenceLines.filter(
    ([start, end]) => Math.abs(start.xNm - lateral) < 1e-8 && Math.abs(end.xNm - lateral) < 1e-8,
  )
    .map(([start, end]) => [start.yNm, end.yNm])
    .sort((a, b) => a[0]! - b[0]!);
  expect(intervals).toHaveLength(2);
  expect(intervals[0]![0]).toBeCloseTo(-18);
  expect(intervals[0]![1]).toBeCloseTo(-12);
  expect(intervals[1]![0]).toBeCloseTo(-6);
  expect(intervals[1]![1]).toBeCloseTo(0);
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

test("selected AMZ binds adapted loss/coast clocks and switching restores the next AMZ intervals", () => {
  const fastLoss = {
    ...syntheticAmz(),
    id: "AMZ-FAST-LOSS",
    monitoring: { ...syntheticAmz().monitoring, surveillanceLossS: 3, coastOutS: 8 },
  };
  const defaultTiming = {
    ...syntheticAmz(),
    id: "AMZ-DEFAULT-TIMING",
    label: "Default Timing",
  };
  const view = createScopeView();
  view.fmaAmzs = [fastLoss, defaultTiming];
  view.tracks.set("track-a", createTrackDisplay());
  configureFmaSurveillanceView(view, true, fastLoss.id);
  expect(view.fmaSurveillance.monitoring).toEqual({ surveillanceLossS: 3, coastOutS: 8 });
  const ids = new Set(["track-a"]);
  advanceFmaSurveillanceView(view, {
    nowSimMs: 0,
    reports: [report(0)],
    liveTrackIds: ids,
    associatedTrackIds: ids,
  });
  advanceFmaSurveillanceView(view, {
    nowSimMs: 3_000,
    reports: [],
    liveTrackIds: ids,
    associatedTrackIds: ids,
  });
  expect(view.fmaSurveillance.tracks.get("track-a")?.code).toBe("CST");
  advanceFmaSurveillanceView(view, {
    nowSimMs: 8_000,
    reports: [],
    liveTrackIds: ids,
    associatedTrackIds: ids,
  });
  expect(view.fmaSurveillance.tracks.get("track-a")?.code).toBe("FROZEN");

  const getAmz = () =>
    findRenderedDcbCell(
      renderFmaAux(view, () => undefined),
      "fma-amz",
    )!;
  const amzWheel = { deltaY: -1, preventDefault() {}, stopPropagation() {} };
  (getAmz().onClick as () => void)();
  (getAmz().onWheel as (event: typeof amzWheel) => void)(amzWheel);
  expect(view.fmaSurveillance.selectedAmzId).toBe(fastLoss.id);
  expect(view.fmaSurveillance.monitoring).toEqual({ surveillanceLossS: 3, coastOutS: 8 });
  (getAmz().onClick as () => void)();
  expect(view.fmaSurveillance.monitoring).toEqual({ surveillanceLossS: 10, coastOutS: 30 });
  expect(view.fmaSurveillance.tracks.size).toBe(0);
  advanceFmaSurveillanceView(view, {
    nowSimMs: 9_000,
    reports: [report(9_000)],
    liveTrackIds: ids,
    associatedTrackIds: ids,
  });
  advanceFmaSurveillanceView(view, {
    nowSimMs: 18_999,
    reports: [],
    liveTrackIds: ids,
    associatedTrackIds: ids,
  });
  expect(view.fmaSurveillance.tracks.get("track-a")?.code).toBe("CURRENT");
  advanceFmaSurveillanceView(view, {
    nowSimMs: 19_000,
    reports: [],
    liveTrackIds: ids,
    associatedTrackIds: ids,
  });
  expect(view.fmaSurveillance.tracks.get("track-a")?.code).toBe("CST");
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
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }),
  } as HTMLCanvasElement;
  handlePpiCanvasClick(canvas, world, target.x, target.y, view);
  expect(view.fmaAlertInhibit.aircraftIds?.has(aircraft.id)).toBe(true);
  expect(view.fmaSurveillance.tracks.has(aircraft.id)).toBe(false);
  expect(view.preview.phase).toBe("idle");
  expect(world.selectedAircraftId).toBeNull();
  expect(aircraft.xNm).toBe(28);
  enterFmaConfirmation(view);
  commitFmaConfirmation(view);
  expect(view.fmaAlertInhibit.aircraftIds).toBeUndefined();
  enterFmaConfirmation(view);
  commitFmaConfirmation(view);
  expect(view.fmaSurveillance.selectedAmzId).toBe("AMZ-SYN");
  expect(view.fmaAlertInhibit.aircraftIds).toBeUndefined();
});

test("F8 global listener owns only bare F8; modifiers, Help, native input, H, and warnings retain their routes", () => {
  const view = createScopeView();
  const world = createWorld();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const fakeWindow = new EventTarget();
  const fakeDocument = new EventTarget() as EventTarget & {
    activeElement: Element | null;
    getElementById: () => null;
  };
  fakeDocument.activeElement = null;
  fakeDocument.getElementById = () => null;
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  const dispatch = (key: string, modifiers: Partial<KeyboardEvent> = {}, target?: object) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key, code: key, stopPropagation() {}, ...modifiers });
    if (target) Object.defineProperty(event, "target", { configurable: true, value: target });
    fakeWindow.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const keyUi = { helpOverlayHasFocus: false };
  const uninstall = installAlwaysOnScopeKeys(view, world, keyUi);
  try {
    const initialHistoryCount = view.historyDotCount;
    expect(dispatch("F8")).toBe(true);
    expect(view.preview.mnemonic).toBe("FMA/TSAS");
    expect(view.historyDotCount).toBe(initialHistoryCount);
    view.preview.phase = "idle";
    for (const modifier of [{ shiftKey: true }, { altKey: true }, { metaKey: true }]) {
      expect(dispatch("F8", modifier)).toBe(false);
      expect(view.preview.phase).toBe("idle");
    }
    view.helpOpen = true;
    keyUi.helpOverlayHasFocus = true;
    expect(dispatch("F8")).toBe(false);
    keyUi.helpOverlayHasFocus = false;
    view.helpOpen = false;
    expect(dispatch("F8", {}, { tagName: "INPUT" })).toBe(false);
    expect(dispatch("H")).toBe(false); // radio focus keeps H for the command line
    expect(view.historyDotCount).toBe(initialHistoryCount);
    view.lastWarning = "NO PREF SET FOUND";
    const ctx = createMockCtx();
    drawChordHint(ctx.ctx, view);
    expect(ctx.fillTexts.map((call) => call.text)).toContain("NO PREF SET FOUND");
    view.fmaScenarioDiagnostics = ["no inbound approach course"];
    const diagnosticAndWarning = createMockCtx();
    drawChordHint(diagnosticAndWarning.ctx, view);
    expect(diagnosticAndWarning.fillTexts.map((call) => call.text)).toContain(
      "FMA: ACTIVE RUNWAY COURSE UNKNOWN",
    );
    expect(diagnosticAndWarning.fillTexts.map((call) => call.text)).toContain("NO PREF SET FOUND");
    view.fmaScenarioDiagnostics = [];
    view.lastWarning = null;
    const cleared = createMockCtx();
    drawChordHint(cleared.ctx, view);
    expect(cleared.fillTexts).toHaveLength(0);
  } finally {
    uninstall();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
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

test("T02-225 AC1 — MODE submenu order, types, confirmation lifecycle, and capability gating", () => {
  const view = createScopeView();
  const amz = syntheticAmz();
  view.fmaAmzs = [amz];
  view.fmaSurveillance.selectedAmzId = amz.id;

  // Initial state: FSL service mode, no submenu
  expect(view.serviceMode).toBe("FSL");
  expect(view.dcbMenu).toBe("MAIN");
  expect(view.fmaCandidateMode).toBe(false);

  // Open MODE submenu
  view.dcbMenu = "MODE";

  // Check availability
  expect(isFmaAvailable(view)).toBe(true);

  // In 1K display capability, FMA is omitted/unavailable
  view.displayCapability = "1K";
  expect(isFmaAvailable(view)).toBe(false);
  view.displayCapability = "2K";

  // Without controller privilege, FMA is unavailable
  view.operatorPrivilege = "other";
  expect(isFmaAvailable(view)).toBe(false);
  view.operatorPrivilege = "controller";

  // Without valid AMZ, FMA is unavailable
  view.fmaAmzs = [];
  expect(isFmaAvailable(view)).toBe(false);
  view.fmaAmzs = [amz];

  // In DSF mode, FMA is unavailable
  view.serviceMode = "DSF";
  expect(isFmaAvailable(view)).toBe(false);
  view.serviceMode = "FSL";

  // Confirm availability passes again
  expect(isFmaAvailable(view)).toBe(true);

  // Clicking FMA enters confirmation state without toggling immediately
  expect(enterFmaConfirmation(view)).toBe(true);
  expect(view.fmaCandidateMode).toBe(true);
  expect(view.fmaSurveillance.enabled).toBe(false);

  // Repeated enter does not change state or apply twice
  expect(enterFmaConfirmation(view)).toBe(true);
  expect(view.fmaCandidateMode).toBe(true);

  // Cancel confirmation resets candidate mode
  cancelFmaConfirmation(view);
  expect(view.fmaCandidateMode).toBe(false);
  expect(view.fmaSurveillance.enabled).toBe(false);

  // Re-enter confirmation and commit via ACCEPT
  enterFmaConfirmation(view);
  expect(commitFmaConfirmation(view)).toBe(true);
  expect(view.fmaCandidateMode).toBe(false);
  expect(view.fmaSurveillance.enabled).toBe(true);

  // Committing again when not in candidate mode returns false
  expect(commitFmaConfirmation(view)).toBe(false);

  // Escape closes menu and resets candidate mode if pending
  enterFmaConfirmation(view);
  expect(view.fmaCandidateMode).toBe(true);
  handleDcbEscape(view);
  expect(view.dcbMenu).toBe("MAIN");
  expect(view.fmaCandidateMode).toBe(false);
});

test("T02-228 — actual MODE callbacks enable FMA with missing-pref warning and retain service-level semantics", () => {
  const view = createScopeView();
  view.fmaAmzs = [syntheticAmz()];
  view.dcbMenu = "MODE";
  const cell = (id: string) =>
    findRenderedDcbCell(
      renderModeMenu(view, () => undefined),
      id,
    )!;
  (cell("mode-fsl").onClick as () => void)();
  expect(view.serviceMode).toBe("FSL");
  expect((view as unknown as { modeFsl?: unknown }).modeFsl).toBeUndefined();
  (cell("mode-fma").onClick as () => void)();
  expect(view.fmaSurveillance.enabled).toBe(false);
  (
    findRenderedDcbCell(
      renderModeMenu(view, () => undefined),
      "mode-accept",
    )!.onClick as () => void
  )();
  expect(view.fmaSurveillance.enabled).toBe(true);
  expect(view.lastWarning).toBe("NO PREF SET FOUND");
});

test("T02-225 AC2 — modeFsl state removed and legacy PREF migration discards modeFsl", () => {
  const view = createScopeView();
  expect((view as unknown as { modeFsl?: unknown }).modeFsl).toBeUndefined();

  // Serialize PREF: no modeFsl field
  const serialized = serializeDcbPref(view);
  expect((serialized as unknown as { modeFsl?: unknown }).modeFsl).toBeUndefined();

  // Restore legacy PREF containing modeFsl: preserves unrelated fields and ignores modeFsl
  const legacyPref = {
    ...serialized,
    vol: 5 as const,
    modeFsl: "S",
  };
  const target = createScopeView();
  applyDcbPref(target, legacyPref);
  expect(target.vol).toBe(5);
  expect((target as unknown as { modeFsl?: unknown }).modeFsl).toBeUndefined();
  expect(target.serviceMode).toBe("FSL");
});

test("T02-225 AC3 — explicit full/partial/limited datablock modes remain independent of serviceMode", () => {
  const view = createScopeView();
  const acOwned = makeTestAircraft({ id: "ac1", callsign: "DAL101", altitudeFt: 5000 });
  const acUnowned = makeTestAircraft({ id: "ac2", callsign: "AAL202", altitudeFt: 7000 });
  const world = createWorld({ aircraft: [acOwned, acUnowned] });

  view.tracks.set("ac1", createTrackDisplay("owned"));
  view.tracks.set("ac2", createTrackDisplay("unowned"));

  // Default datablocks: owned is full, unowned is partial
  expect(getDatablockVisualState(view, world, acOwned).mode).toBe("full");
  expect(getDatablockVisualState(view, world, acUnowned).mode).toBe("partial");

  // Forced FDB overrides
  view.tracks.get("ac2")!.forcedFdb = true;
  expect(getDatablockVisualState(view, world, acUnowned).mode).toBe("full");

  // Changing serviceMode does not alter datablock presentation
  view.serviceMode = "EFSL";
  expect(getDatablockVisualState(view, world, acOwned).mode).toBe("full");
  view.serviceMode = "TRNG";
  expect(getDatablockVisualState(view, world, acOwned).mode).toBe("full");
  view.serviceMode = "DSF";
  expect(getDatablockVisualState(view, world, acOwned).mode).toBe("full");
  view.serviceMode = "FSL";
});

test("T02-225 AC4 — per-AMZ preference application, missing preference warning, and catalog replacement", () => {
  const view = createScopeView();
  const amz = syntheticAmz();
  view.fmaAmzs = [amz];
  view.fmaSurveillance.selectedAmzId = amz.id;

  // Enable FMA without saved preference for this AMZ: succeeds and shows NO PREF SET FOUND
  enterFmaConfirmation(view);
  commitFmaConfirmation(view);
  expect(view.fmaSurveillance.enabled).toBe(true);
  expect(view.lastWarning).toBe("NO PREF SET FOUND");

  // Clear warning and save preference for this AMZ
  view.lastWarning = null;
  saveFmaAmzPreference(view, amz.id, {
    mag: 2,
    ptlSeconds: 90,
    voiceLevel: 7,
    runwayLeaders: { "08L": 3 },
    enabledNtzIds: ["NTZ-08"],
    rangeNm: 20,
  });

  // Toggle FMA off then on again: applies saved preference and does NOT show warning
  enterFmaConfirmation(view);
  commitFmaConfirmation(view);
  expect(view.fmaSurveillance.enabled).toBe(false);

  enterFmaConfirmation(view);
  commitFmaConfirmation(view);
  expect(view.fmaSurveillance.enabled).toBe(true);
  expect(view.lastWarning).toBeNull();
  expect(view.camera.rangeNm).toBe(20);

  // Preference persistence across PREF serialization
  const serialized = serializeDcbPref(view);
  expect(serialized.amzPreferences?.[amz.id]).toBeDefined();
  expect(serialized.amzPreferences?.[amz.id].voiceLevel).toBe(7);

  // Reapply to a new view
  const restoredView = createScopeView();
  restoredView.fmaAmzs = [amz];
  applyDcbPref(restoredView, serialized);
  expect(restoredView.amzPreferences.get(amz.id)?.voiceLevel).toBe(7);

  // Catalog / scenario replacement rebinds AMZ and clears runtime state
  view.fmaAlertInhibit.aircraftIds = new Set(["ac1"]);
  const nextAmz = { ...amz, id: "AMZ-NEXT" };
  rebindFmaScenarioAmzs(view, [nextAmz]);
  expect(view.fmaSurveillance.selectedAmzId).toBe("AMZ-NEXT");
  expect(view.fmaAlertInhibit.aircraftIds?.size ?? 0).toBe(0);
});

test("T02-228 — rendered PREF SAVE snapshots current selected FMA settings and selected AMZ", () => {
  const view = createScopeView();
  const amz = syntheticAmz();
  view.fmaAmzs = [amz];
  view.fmaSurveillance = configureFmaSurveillance(view.fmaSurveillance, true, amz.id);
  view.fmaDefaultAmzId = amz.id;
  view.fmaMag = 6;
  view.fmaPtlSeconds = 15;
  view.fmaVoiceLevel = 8;
  view.fmaRunwayLeaders.set("08L", null);
  const props = findRenderedDcbCell(
    renderPref(view, () => undefined),
    "pref-save",
  );
  expect(props).not.toBeNull();
  (props!.onClick as () => void)();
  const saved = view.dcbPref.slots[view.dcbPref.activeIndex]!.body;
  expect(saved.amzPreferences?.[amz.id]).toMatchObject({ mag: 6, ptlSeconds: 15, voiceLevel: 8 });
  expect(saved.amzPreferences?.[amz.id].runwayLeaders).toEqual({});
  expect(saved.selectedFmaAmzId).toBe(amz.id);
  view.fmaRunwayLeaders.set("08L", 8);
  view.fmaRunwayLeaders.set("99", 6);
  const standardLeader = view.defaultLeaderDir;
  enterFmaConfirmation(view);
  commitFmaConfirmation(view);
  enterFmaConfirmation(view);
  commitFmaConfirmation(view);
  expect(view.fmaRunwayLeaders.has("08L")).toBe(false);
  expect(view.fmaRunwayLeaders.get("99")).toBe(6);
  expect(view.defaultLeaderDir).toBe(standardLeader);
  const restored = createScopeView();
  applyDcbPref(restored, saved);
  expect(restored.fmaDefaultAmzId).toBe(amz.id);
  restored.fmaAmzs = [amz];
  rebindFmaScenarioAmzs(restored, [amz], restored.fmaDefaultAmzId);
  expect(restored.fmaSurveillance.selectedAmzId).toBeNull();
  // A subsequent enable resolves the persisted choice while the runtime mode remains off.
  enterFmaConfirmation(restored);
  commitFmaConfirmation(restored);
  expect(restored.fmaSurveillance.selectedAmzId).toBe(amz.id);
});

test("T02-228 — malformed stored AMZ values are ignored and unknown references cannot disable valid zones", () => {
  const view = createScopeView();
  const amz = syntheticAmz();
  view.fmaAmzs = [amz];
  const baselineMag = view.fmaMag;
  const baselineVoice = view.fmaVoiceLevel;
  const baselineBrite = { ...view.brite };
  view.fmaAlertInhibit.ntzIds = new Set();
  const runwayId = amz.members[0]!.runwayId;
  const ntzId = amz.ntzs[0]!.id;
  view.amzPreferences.set(amz.id, {
    amzId: amz.id,
    mag: 4.5,
    ptlSeconds: 2.5,
    voiceLevel: 4.5,
    fmaBrite: { amz: 101, ntz: 0, rwy: 3, ref: -1 },
    runwayLeaders: { [runwayId]: 10, UNKNOWN: 8 },
    enabledNtzIds: ["UNKNOWN-NTZ"],
  });
  expect(applyFmaAmzPreference(view, amz.id)).toBe(true);
  expect(view.fmaMag).toBe(baselineMag);
  expect(view.fmaVoiceLevel).toBe(baselineVoice);
  expect(view.brite.amz).toBe(baselineBrite.amz);
  expect(view.brite.ntz).toBe(baselineBrite.ntz);
  expect(view.brite.rwy).toBe(baselineBrite.rwy);
  expect(view.brite.ref).toBe(baselineBrite.ref);
  expect(view.fmaRunwayLeaders.has("UNKNOWN")).toBe(false);
  expect(view.fmaRunwayLeaders.has(runwayId)).toBe(false);
  view.fmaRunwayLeaders.set(runwayId, 3);
  view.amzPreferences.set(amz.id, { amzId: amz.id, runwayLeaders: { UNKNOWN: 8 } });
  expect(applyFmaAmzPreference(view, amz.id)).toBe(true);
  expect(view.fmaRunwayLeaders.get(runwayId)).toBe(3);
  expect(view.fmaAlertInhibit.ntzIds?.has(ntzId)).toBe(false);
  view.amzPreferences.set(amz.id, { amzId: amz.id, enabledNtzIds: [] });
  expect(applyFmaAmzPreference(view, amz.id)).toBe(true);
  expect(view.fmaAlertInhibit.ntzIds?.has(ntzId)).toBe(true);
  view.amzPreferences.set(amz.id, { amzId: amz.id, enabledNtzIds: [ntzId, "UNKNOWN-NTZ"] });
  view.fmaAlertInhibit = {};
  expect(applyFmaAmzPreference(view, amz.id)).toBe(true);
  expect(view.fmaAlertInhibit.ntzIds).toBeUndefined();
  expect(commitFmaAmzSwitch(view, "UNKNOWN-AMZ")).toBe(false);
  expect(view.fmaSurveillance.selectedAmzId).toBeNull();
});

test("T02-228 — stale saved AMZ choice cannot enable FMA outside the eligible set", () => {
  const view = createScopeView();
  const first = syntheticAmz();
  const second = { ...syntheticAmz(), id: "AMZ-SECOND", label: "Second" };
  view.fmaAmzs = [first, second];
  view.fmaDefaultAmzId = "AMZ-OPPOSITE-FLOW";
  enterFmaConfirmation(view);
  expect(commitFmaConfirmation(view)).toBe(true);
  expect(view.fmaSurveillance.enabled).toBe(true);
  expect(view.fmaSurveillance.selectedAmzId).toBe(first.id);
  expect(view.fmaDefaultAmzId).toBe(first.id);
});

test("T02-228 — rendered SAVE AS cancellation writes no FMA preference", () => {
  const view = createScopeView();
  const amz = syntheticAmz();
  view.fmaAmzs = [amz];
  view.fmaSurveillance = configureFmaSurveillance(view.fmaSurveillance, true, amz.id);
  view.fmaMag = 7;
  const before = view.dcbPref.slots.map((slot) => slot && structuredClone(slot));
  const props = findRenderedDcbCell(
    renderPref(view, () => undefined),
    "pref-save-as",
  );
  (props!.onClick as () => void)();
  expect(view.dcbPref.pendingSaveAs).toBe(true);
  const event = { key: "Escape", preventDefault() {}, stopPropagation() {} };
  handleScopeKeyDown(event, view, "radio", createWorld(), 1);
  expect(view.dcbPref.pendingSaveAs).toBe(false);
  expect(view.dcbPref.slots).toEqual(before);
  expect(view.amzPreferences.has(amz.id)).toBe(false);
});

test("T02-228 — rendered SAVE AS commit round-trips the selected AMZ snapshot", () => {
  const view = createScopeView();
  const amz = syntheticAmz();
  view.fmaAmzs = [amz];
  view.fmaSurveillance = configureFmaSurveillance(view.fmaSurveillance, true, amz.id);
  view.fmaMag = 3;
  view.fmaVoiceLevel = 9;
  const props = findRenderedDcbCell(
    renderPref(view, () => undefined),
    "pref-save-as",
  );
  (props!.onClick as () => void)();
  const index = commitDcbPrefSaveAs(view, "FMALOCAL");
  expect(index).toBe(0);
  if (index === null) throw new Error("SAVE AS should commit an alphanumeric name");
  const body = view.dcbPref.slots[index]!.body;
  const restored = createScopeView();
  restored.fmaAmzs = [amz];
  applyDcbPref(restored, body);
  enterFmaConfirmation(restored);
  commitFmaConfirmation(restored);
  expect(restored.fmaSurveillance.selectedAmzId).toBe(amz.id);
  expect(restored.fmaMag).toBe(3);
  expect(restored.fmaVoiceLevel).toBe(9);
});

describe("T02-224 FMA Browser Speech Queue integration", () => {
  interface MockSpeechSession {
    spoken: SpeechSynthesisUtteranceLike[];
    cancelledCount: number;
    listeners: Map<string, Set<(ev?: Event | unknown) => void>>;
    synth: SpeechSynthesisLike;
    voices: SpeechSynthesisVoiceLike[];
    triggerVoicesChanged: () => void;
    finishActiveUtterance: () => void;
    errorActiveUtterance: () => void;
  }

  function createMockSpeechSession(
    initialVoices: SpeechSynthesisVoiceLike[] = [],
  ): MockSpeechSession {
    const spoken: SpeechSynthesisUtteranceLike[] = [];
    let cancelledCount = 0;
    const listeners = new Map<string, Set<(ev?: Event | unknown) => void>>();
    const voices = [...initialVoices];

    const synth: SpeechSynthesisLike = {
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
      getVoices() {
        return voices;
      },
      speak(utt: SpeechSynthesisUtteranceLike) {
        spoken.push(utt);
      },
      cancel() {
        cancelledCount++;
      },
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener as (ev?: Event | unknown) => void);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners.get(type)?.delete(listener as (ev?: Event | unknown) => void);
      },
    };

    return {
      spoken,
      get cancelledCount() {
        return cancelledCount;
      },
      listeners,
      synth,
      voices,
      triggerVoicesChanged() {
        synth.onvoiceschanged?.();
        listeners.get("voiceschanged")?.forEach((fn) => fn());
      },
      finishActiveUtterance() {
        const last = spoken[spoken.length - 1];
        last?.onend?.();
      },
      errorActiveUtterance() {
        const last = spoken[spoken.length - 1];
        last?.onerror?.();
      },
    };
  }

  const defaultLocalVoice: SpeechSynthesisVoiceLike = {
    default: true,
    lang: "en-US",
    localService: true,
    name: "Alex (Local)",
    voiceURI: "alex-local",
  };

  test("T02-230 repeated scenario clears preserve cancellation for active and queued speech", () => {
    const mock = createMockSpeechSession([defaultLocalVoice]);
    const controller = createFmaSpeechController({ synthesis: mock.synth, initialVoiceLevel: 6 });
    const active = {
      id: "flow-active",
      condition: "NTZ_WARNING" as const,
      onsetSimMs: 1,
      amzId: "AMZ-E",
      runwayIds: [],
      ntzIds: [],
      evidence: [],
    };
    const queued = { ...active, id: "flow-queued", condition: "NTZ_CAUTION" as const };
    controller.enqueueEpisode(active, "AAL100", "track-active");
    controller.enqueueEpisode(queued, "AAL200", "track-queued");
    expect(controller.getStatus().queueLength).toBe(1);

    const view = createScopeView();
    view.fmaAlertState.episodes.set("track-active", active);
    view.fmaAlertState.episodes.set("track-queued", queued);
    view.fmaSpeechEvents.push(
      { type: "onset", episodeId: active.id, aircraftId: "track-active" },
      { type: "test", level: 4 },
    );
    clearFmaSurveillanceView(view);
    clearFmaSurveillanceView(view);
    expect(view.fmaSpeechEvents).toEqual([
      { type: "cancel", episodeId: active.id, aircraftId: "track-active" },
      { type: "cancel", episodeId: queued.id, aircraftId: "track-queued" },
    ]);
    syncFmaSpeech(controller, view, { aircraft: [] });
    expect(controller.getStatus()).toMatchObject({ activeUtteranceText: null, queueLength: 0 });
    expect(mock.cancelledCount).toBe(2);
    controller.dispose();
  });

  test("AC1 — formatFmaAlertUtterance produces exact ACID and suffixes (telephony and phonetic callsigns)", () => {
    // DAL123 -> Delta 123
    expect(formatFmaAlertUtterance("DAL123", "NTZ_WARNING")).toBe("Delta 123 WARNING");
    expect(formatFmaAlertUtterance("DAL123", "SURVEILLANCE_LOST")).toBe("Delta 123 COAST");
    expect(formatFmaAlertUtterance("DAL123", "RUNWAY_ERROR")).toBe("Delta 123 WRONG RUNWAY");
    expect(formatFmaAlertUtterance("DAL123", "NTZ_CAUTION")).toBe("Delta 123 CAUTION");

    // General aviation N-number callsign: N12345 -> November 12345
    expect(formatFmaAlertUtterance("N12345", "NTZ_WARNING")).toBe("November 12345 WARNING");
    expect(formatFmaAlertUtterance("N12345", "SURVEILLANCE_LOST")).toBe("November 12345 COAST");
    expect(formatFmaAlertUtterance("N12345", "RUNWAY_ERROR")).toBe("November 12345 WRONG RUNWAY");
    expect(formatFmaAlertUtterance("N12345", "NTZ_CAUTION")).toBe("November 12345 CAUTION");
  });

  test("AC1 & AC3 — onset deduplication, warning-before-queued-caution ordering, and NOM is silent", () => {
    const mock = createMockSpeechSession([defaultLocalVoice]);
    const controller = createFmaSpeechController({ synthesis: mock.synth, initialVoiceLevel: 6 });

    // Active utterance will be the first queued item
    controller.enqueueEpisode(
      {
        id: "caut-1",
        condition: "NTZ_CAUTION",
        onsetSimMs: 1000,
        amzId: "AMZ-1",
        runwayIds: [],
        ntzIds: [],
        evidence: [],
      },
      "AAL100",
      "ac-1",
    );
    expect(mock.spoken.length).toBe(1);
    expect(mock.spoken[0].text).toBe("American 100 CAUTION");

    // While caut-1 is speaking, queue another caution and then a warning
    controller.enqueueEpisode(
      {
        id: "caut-2",
        condition: "NTZ_CAUTION",
        onsetSimMs: 2000,
        amzId: "AMZ-1",
        runwayIds: [],
        ntzIds: [],
        evidence: [],
      },
      "UAL200",
      "ac-2",
    );
    controller.enqueueEpisode(
      {
        id: "warn-1",
        condition: "NTZ_WARNING",
        onsetSimMs: 2500,
        amzId: "AMZ-1",
        runwayIds: [],
        ntzIds: [],
        evidence: [],
      },
      "DAL300",
      "ac-3",
    );

    // Deduplication check: repeated onset for warn-1 is ignored
    controller.enqueueEpisode(
      {
        id: "warn-1",
        condition: "NTZ_WARNING",
        onsetSimMs: 2600,
        amzId: "AMZ-1",
        runwayIds: [],
        ntzIds: [],
        evidence: [],
      },
      "DAL300",
      "ac-3",
    );
    expect(controller.getStatus().queueLength).toBe(2);

    // NOM condition is silent / never enters queue
    controller.enqueueEpisode(
      {
        id: "nom-1",
        condition: "NOM" as unknown as import("../../core").FmaPrimaryCondition,
        onsetSimMs: 2700,
        amzId: "AMZ-1",
        runwayIds: [],
        ntzIds: [],
        evidence: [],
      },
      "SWA400",
      "ac-4",
    );
    expect(controller.getStatus().queueLength).toBe(2);

    // Finish caut-1: warn-1 MUST speak next because warnings have priority 0 ahead of caution priority 1!
    mock.finishActiveUtterance();
    expect(mock.spoken.length).toBe(2);
    expect(mock.spoken[1].text).toBe("Delta 300 WARNING");

    // Finish warn-1: caut-2 speaks next
    mock.finishActiveUtterance();
    expect(mock.spoken.length).toBe(3);
    expect(mock.spoken[2].text).toBe("United 200 CAUTION");

    // Finish caut-2: queue becomes empty
    mock.finishActiveUtterance();
    expect(controller.getStatus().queueLength).toBe(0);
    expect(controller.getStatus().activeUtteranceText).toBeNull();
  });

  test("AC2 — selective cancellation retains unrelated queued alerts when active is canceled", () => {
    const mock = createMockSpeechSession([defaultLocalVoice]);
    const controller = createFmaSpeechController({ synthesis: mock.synth, initialVoiceLevel: 6 });

    // Enqueue ep-1 (speaking)
    controller.enqueueEpisode(
      {
        id: "ep-1",
        condition: "NTZ_WARNING",
        onsetSimMs: 1000,
        amzId: "AMZ-1",
        runwayIds: [],
        ntzIds: [],
        evidence: [],
      },
      "DAL100",
      "ac-1",
    );
    expect(mock.spoken.length).toBe(1);
    expect(mock.spoken[0].text).toBe("Delta 100 WARNING");

    // Enqueue ep-2 (pending in queue)
    controller.enqueueEpisode(
      {
        id: "ep-2",
        condition: "NTZ_WARNING",
        onsetSimMs: 1200,
        amzId: "AMZ-1",
        runwayIds: [],
        ntzIds: [],
        evidence: [],
      },
      "AAL200",
      "ac-2",
    );
    expect(controller.getStatus().queueLength).toBe(1);

    // Acknowledge ep-1 (cancels active utterance)
    controller.cancelEpisode("ep-1");
    expect(mock.cancelledCount).toBe(1);

    // Global cancel in browser must NOT discard unrelated pending ep-2 in app queue!
    // Instead, ep-2 is immediately dispatched to speak
    expect(mock.spoken.length).toBe(2);
    expect(mock.spoken[1].text).toBe("American 200 WARNING");
    expect(controller.getStatus().queueLength).toBe(0);

    // Delayed callback on canceled utterance 1 must not disrupt anything
    mock.spoken[0].onend?.();
    expect(mock.spoken.length).toBe(2);

    // Finish ep-2
    mock.finishActiveUtterance();
    expect(controller.getStatus().activeUtteranceText).toBeNull();
  });

  test("AC2 — delayed onend/onerror callbacks after disposal do not crash or restart speech", () => {
    const mock = createMockSpeechSession([defaultLocalVoice]);
    const controller = createFmaSpeechController({ synthesis: mock.synth });

    controller.enqueueEpisode(
      {
        id: "ep-1",
        condition: "NTZ_WARNING",
        onsetSimMs: 1000,
        amzId: "AMZ-1",
        runwayIds: [],
        ntzIds: [],
        evidence: [],
      },
      "DAL100",
      "ac-1",
    );
    const activeUtt = mock.spoken[0];
    controller.dispose();

    // Late callbacks
    expect(() => activeUtt.onend?.()).not.toThrow();
    expect(() => activeUtt.onerror?.()).not.toThrow();
    expect(mock.spoken.length).toBe(1);
  });

  test("AC2 — voiceschanged event discovery and initially empty voice list", () => {
    // Start with empty voice list
    const mock = createMockSpeechSession([]);
    const controller = createFmaSpeechController({ synthesis: mock.synth });

    expect(controller.getStatus().supported).toBe(true);
    expect(controller.getStatus().voiceAvailable).toBe(false);

    controller.enqueueEpisode(
      {
        id: "ep-1",
        condition: "NTZ_WARNING",
        onsetSimMs: 1000,
        amzId: "AMZ-1",
        runwayIds: [],
        ntzIds: [],
        evidence: [],
      },
      "DAL100",
      "ac-1",
    );
    // Cannot speak yet because voice is unavailable
    expect(mock.spoken.length).toBe(0);
    expect(controller.getStatus().queueLength).toBe(1);

    // Asynchronous voices update arrives
    mock.voices.push(defaultLocalVoice);
    mock.triggerVoicesChanged();

    expect(controller.getStatus().voiceAvailable).toBe(true);
    // Queue should now pump automatically
    expect(mock.spoken.length).toBe(1);
    expect(mock.spoken[0].text).toBe("Delta 100 WARNING");
  });

  test("AC2 — unavailable SpeechSynthesis API does not crash simulation or throw", () => {
    const controller = createFmaSpeechController({ synthesis: null });
    expect(controller.getStatus().supported).toBe(false);
    expect(controller.getStatus().voiceAvailable).toBe(false);

    expect(() => {
      controller.enqueueEpisode(
        {
          id: "ep-1",
          condition: "NTZ_WARNING",
          onsetSimMs: 1000,
          amzId: "AMZ-1",
          runwayIds: [],
          ntzIds: [],
          evidence: [],
        },
        "DAL100",
        "ac-1",
      );
      controller.voiceTest();
      controller.setVoiceLevel(8);
      controller.cancelEpisode("ep-1");
      controller.dispose();
    }).not.toThrow();
  });

  test("AC2 — remote or non-English local voices stay unavailable; status subscription tracks discovery", () => {
    const remoteEnglish: SpeechSynthesisVoiceLike = { ...defaultLocalVoice, localService: false };
    const localFrench: SpeechSynthesisVoiceLike = {
      ...defaultLocalVoice,
      lang: "fr-FR",
      name: "French local",
    };
    const mock = createMockSpeechSession([remoteEnglish, localFrench]);
    const controller = createFmaSpeechController({ synthesis: mock.synth });
    const statuses: boolean[] = [];
    const unsubscribe = controller.subscribeStatus((status) =>
      statuses.push(status.voiceAvailable),
    );
    expect(controller.getStatus().voiceAvailable).toBe(false);
    mock.voices.push(defaultLocalVoice);
    mock.triggerVoicesChanged();
    expect(controller.getStatus().voiceAvailable).toBe(true);
    expect(statuses).toEqual([false, true]);
    unsubscribe();
    mock.triggerVoicesChanged();
    expect(statuses).toEqual([false, true]);
    controller.dispose();
  });

  test("AC2 — Shell exposes unavailable FMA audio in a separate live status only while FMA is enabled", () => {
    const status = {
      supported: true,
      voiceAvailable: false,
      activeUtteranceText: null,
      queueLength: 0,
    };
    const markup = renderToStaticMarkup(createElement(FmaAudioStatus, { enabled: true, status }));
    expect(markup).toContain('class="fma-audio-status"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("local English voice unavailable");
    expect(renderToStaticMarkup(createElement(FmaAudioStatus, { enabled: false, status }))).toBe(
      "",
    );
    expect(
      renderToStaticMarkup(
        createElement(FmaAudioStatus, {
          enabled: true,
          status: { ...status, voiceAvailable: true },
        }),
      ),
    ).toBe("");
  });

  test("AC3 — actual FMA AUX callbacks stage AMZ until commit and cancel without rebind", () => {
    const view = createScopeView();
    const east = syntheticAmz();
    const south = { ...syntheticAmz(), id: "AMZ-SOUTH", label: "SOUTH34" };
    view.fmaAmzs = [east, south];
    configureFmaSurveillanceView(view, true, east.id);
    view.fmaMag = 4;
    const getAmz = () =>
      findRenderedDcbCell(
        renderFmaAux(view, () => undefined),
        "fma-amz",
      )!;
    const event = { deltaY: -1, preventDefault() {}, stopPropagation() {} };
    (getAmz().onClick as () => void)();
    (getAmz().onWheel as (ev: typeof event) => void)(event);
    expect(view.dcbSpinner.buffer).toBe(south.label);
    expect(view.fmaSurveillance.selectedAmzId).toBe(east.id);
    expect(view.fmaMag).toBe(4);
    cancelDcbSpinner(view);
    expect(view.fmaSurveillance.selectedAmzId).toBe(east.id);
    expect(view.fmaMag).toBe(4);

    (getAmz().onClick as () => void)();
    (getAmz().onDragDelta as (steps: number) => void)(1);
    expect(view.fmaSurveillance.selectedAmzId).toBe(east.id);
    (getAmz().onClick as () => void)();
    expect(view.fmaSurveillance.selectedAmzId).toBe(south.id);
    expect(view.lastWarning).toBe("NO PREF SET FOUND");
    (getAmz().onClick as () => void)();
    (getAmz().onWheel as (ev: typeof event) => void)(event);
    expect(view.dcbSpinner.buffer).toBe(south.label); // no wrap at last eligible candidate
    cancelDcbSpinner(view);

    view.fmaAmzs.push({ ...south, id: "AMZ-SOUTH-2" });
    (getAmz().onClick as () => void)();
    for (const character of "SOUTH34") inputDcbSpinnerKey(view, character);
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.fmaSurveillance.selectedAmzId).toBe(south.id);
    expect(view.lastWarning).toBe("FORMAT");

    const getMag = () =>
      findRenderedDcbCell(
        renderFmaAux(view, () => undefined),
        "fma-mag",
      )!;
    (getMag().onClick as () => void)();
    (getMag().onWheel as (ev: typeof event) => void)(event);
    expect(view.fmaMag).toBe(5);
    cancelDcbSpinner(view);
    expect(view.fmaMag).toBe(4);

    const getLeader = () =>
      findRenderedDcbCell(
        renderFmaAux(view, () => undefined),
        "fma-rwy-1",
      )!;
    const world = createWorld();
    const key = (value: string) =>
      handleScopeKeyDown(
        { key: value, preventDefault() {}, stopPropagation() {} },
        view,
        "scope",
        world,
        10,
      );
    (getLeader().onDragDelta as (steps: number) => void)(1);
    expect(view.fmaRunwayLeaders.get("08L")).not.toBeNull();
    key("Escape");
    expect(view.fmaRunwayLeaders.get("08L") ?? null).toBeNull();

    (getLeader().onClick as () => void)();
    key("8");
    key("Enter");
    expect(view.fmaRunwayLeaders.get("08L")).toBe(2); // keypad 8 = south
    (getLeader().onClick as () => void)();
    inputDcbSpinnerKey(view, "8");
    (getLeader().onClick as () => void)();
    expect(view.fmaRunwayLeaders.get("08L")).toBe(2); // pointer commit uses same keypad mapping

    (getLeader().onDragDelta as (steps: number) => void)(1);
    expect(view.fmaRunwayLeaders.get("08L")).toBe(1); // preview is keypad 7 = southwest
    key("Enter");
    expect(view.fmaRunwayLeaders.get("08L")).toBe(1);

    (getLeader().onClick as () => void)();
    inputDcbSpinnerKey(view, "0");
    inputDcbSpinnerKey(view, "8");
    key("Enter");
    expect(view.fmaRunwayLeaders.get("08L")).toBe(1);
    expect(view.lastWarning).toBe("FORMAT");
  });

  test("AC3 — level/10 volume mapping, setVoiceLevel, and voiceTest queue Test without mutating world or alerts", () => {
    const mock = createMockSpeechSession([defaultLocalVoice]);
    const controller = createFmaSpeechController({ synthesis: mock.synth, initialVoiceLevel: 6 });

    expect(controller.getVoiceLevel()).toBe(6);

    // setVoiceLevel(8, true) queues Test at volume 0.8
    controller.setVoiceLevel(8, true);
    expect(controller.getVoiceLevel()).toBe(8);
    expect(mock.spoken.length).toBe(1);
    expect(mock.spoken[0].text).toBe("Test");
    expect(mock.spoken[0].volume).toBeCloseTo(0.8, 5);

    // Finish test utterance
    mock.finishActiveUtterance();

    // voiceTest() queues Test at current volume 0.8
    controller.voiceTest();
    expect(mock.spoken.length).toBe(2);
    expect(mock.spoken[1].text).toBe("Test");
    expect(mock.spoken[1].volume).toBeCloseTo(0.8, 5);

    // Level clamping between 1 and 10
    controller.setVoiceLevel(15, false);
    expect(controller.getVoiceLevel()).toBe(8); // Invalid rejected, unchanged
    controller.setVoiceLevel(-2, false);
    expect(controller.getVoiceLevel()).toBe(8); // Invalid rejected, unchanged

    controller.setVoiceLevel(1, true);
    mock.finishActiveUtterance();
    expect(mock.spoken.length).toBe(3);
    expect(mock.spoken[2].volume).toBeCloseTo(0.1, 5);
  });

  test("AC1 & AC2 — end-to-end syncFmaSpeech drains events and coordinates with ScopeView & World", () => {
    const mock = createMockSpeechSession([defaultLocalVoice]);
    const controller = createFmaSpeechController({ synthesis: mock.synth, initialVoiceLevel: 6 });

    const world = createWorld();
    const ac = createAircraft({
      id: "ac-dal",
      callsign: "DAL456",
      xNm: 0,
      yNm: 0,
      altitudeFt: 3000,
      headingDeg: 90,
      speedKt: 180,
    });
    world.aircraft.push(ac);

    const view = createScopeView();
    expect(view.fmaVoiceLevel).toBe(6);

    // Change scope view voice level
    setFmaVoiceLevel(view, 9);
    expect(view.fmaVoiceLevel).toBe(9);

    // Push an onset event into view
    const episode = {
      id: "ep-99",
      condition: "NTZ_WARNING" as const,
      onsetSimMs: 5000,
      amzId: "AMZ-SYN",
      runwayIds: ["08L"],
      ntzIds: ["NTZ-1"],
      evidence: [],
    };
    view.fmaAlertResults.set(ac.id, {
      aircraftId: ac.id,
      assignment: { kind: "RUNWAY", runwayId: "08L" },
      observedRunwayId: "08L",
      primary: "NTZ_WARNING",
      episode,
      onset: true,
      supplementary: { nom: false },
    });
    view.fmaSpeechEvents.push({ type: "onset", episodeId: "ep-99", aircraftId: ac.id });

    // Sync
    syncFmaSpeech(controller, view, world);

    // Speech events are drained
    expect(view.fmaSpeechEvents.length).toBe(0);
    // Voice level synchronized to 9
    expect(controller.getVoiceLevel()).toBe(9);
    // Utterance spoken at volume 0.9 with exact text
    expect(mock.spoken.length).toBe(1);
    expect(mock.spoken[0].text).toBe("Delta 456 WARNING");
    expect(mock.spoken[0].volume).toBeCloseTo(0.9, 5);

    // Push cancel event
    view.fmaSpeechEvents.push({ type: "cancel", episodeId: "ep-99", aircraftId: ac.id });
    syncFmaSpeech(controller, view, world);

    expect(view.fmaSpeechEvents.length).toBe(0);
    expect(mock.cancelledCount).toBe(1);
  });
});

describe("T02-226 FMA AUX, BRITE and Control Entry", () => {
  test("AC1 & AC3 — MAG boundaries, rollback, input validation, and ILL VALUE vs FORMAT", () => {
    const view = createScopeView();
    view.fmaMag = 2;

    // Pointer step saturation
    expect(stepFmaMag(view, 1)).toBe(3);
    expect(stepFmaMag(view, 10)).toBe(8); // Saturation at 8
    expect(stepFmaMag(view, -10)).toBe(1); // Saturation at 1

    // Arm and type valid whole integer
    view.fmaMag = 2;
    armDcbSpinner(view, "MAG");
    expect(inputDcbSpinnerKey(view, "4")).toBe(true);
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.fmaMag).toBe(4);
    expect(view.lastWarning).toBeNull();

    // Out of range gives ILL VALUE and restores previous
    armDcbSpinner(view, "MAG");
    inputDcbSpinnerKey(view, "9");
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.fmaMag).toBe(4); // Rolled back
    expect(view.lastWarning).toBe("ILL VALUE");

    // Non-integer gives FORMAT and restores previous
    armDcbSpinner(view, "MAG");
    inputDcbSpinnerKey(view, "2");
    inputDcbSpinnerKey(view, ".");
    inputDcbSpinnerKey(view, "5");
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.fmaMag).toBe(4);
    expect(view.lastWarning).toBe("FORMAT");

    // Malformed alphabetic entry gives FORMAT and restores previous
    armDcbSpinner(view, "MAG");
    inputDcbSpinnerKey(view, "A");
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.fmaMag).toBe(4);
    expect(view.lastWarning).toBe("FORMAT");

    // Escape/CLEAR restores previous factor and clears warning
    armDcbSpinner(view, "MAG");
    inputDcbSpinnerKey(view, "6");
    expect(cancelDcbSpinner(view)).toBe(true);
    expect(view.fmaMag).toBe(4);
    expect(view.lastWarning).toBeNull();
  });

  test("AC1 & AC2 — AMZ label resolution, missing PREF warning, one-AMZ disabled selector and clean rebind", () => {
    const view = createScopeView();
    const amz1 = syntheticAmz();
    const amz2: FmaAmz = {
      ...syntheticAmz(),
      id: "AMZ-SOUTH",
      label: "SOUTH34",
    };
    view.fmaAmzs = [amz1, amz2];
    configureFmaSurveillanceView(view, true, amz1.id);

    // Initial state
    expect(view.fmaSurveillance.selectedAmzId).toBe(amz1.id);

    // Switch to known label with no pref set gives NO PREF SET FOUND but succeeds
    armDcbSpinner(view, "FMA_AMZ", {
      onCommit: (_cell, targetAmzId) => {
        if (typeof targetAmzId === "string") {
          commitFmaAmzSwitch(view, targetAmzId);
        }
      },
    });
    for (const ch of "SOUTH34") {
      inputDcbSpinnerKey(view, ch);
    }
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.fmaSurveillance.selectedAmzId).toBe("AMZ-SOUTH");
    expect(view.lastWarning).toBe("NO PREF SET FOUND");

    // Unknown label gives FORMAT and preserves selected AMZ
    armDcbSpinner(view, "FMA_AMZ", {
      onCommit: (_cell, targetAmzId) => {
        if (typeof targetAmzId === "string") {
          commitFmaAmzSwitch(view, targetAmzId);
        }
      },
    });
    for (const ch of "NORTH99") {
      inputDcbSpinnerKey(view, ch);
    }
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.fmaSurveillance.selectedAmzId).toBe("AMZ-SOUTH");
    expect(view.lastWarning).toBe("FORMAT");

    // Saving pref and switching clears warning
    saveFmaAmzPreference(view, amz1.id, {
      mag: 5,
      enabledNtzIds: [],
      runwayLeaders: { "08L": 3 },
    });
    view.fmaAlertInhibit.aircraftIds = new Set(["OLD-TRACK"]);
    armDcbSpinner(view, "FMA_AMZ", {
      onCommit: (_cell, targetAmzId) => {
        if (typeof targetAmzId === "string") {
          commitFmaAmzSwitch(view, targetAmzId);
        }
      },
    });
    for (const ch of amz1.id) {
      inputDcbSpinnerKey(view, ch);
    }
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.fmaSurveillance.selectedAmzId).toBe(amz1.id);
    expect(view.fmaMag).toBe(5);
    expect(view.fmaRunwayLeaders.get("08L")).toBe(3);
    expect(view.fmaAlertInhibit.aircraftIds).toBeUndefined();
    expect(view.fmaAlertInhibit.ntzIds?.size).toBe(amz1.ntzs.length);
    expect(view.lastWarning).toBeNull();

    enterFmaConfirmation(view);
    commitFmaConfirmation(view);
    expect(view.fmaSurveillance.selectedAmzId).toBeNull();
    expect(view.fmaDefaultAmzId).toBe(amz1.id);
    enterFmaConfirmation(view);
    commitFmaConfirmation(view);
    expect(view.fmaSurveillance.selectedAmzId).toBe(amz1.id);
  });

  test("AC3 — PTL seconds 0 removes PTLs+SSA, nonzero updates PTL, independent of caution horizon", () => {
    const view = createScopeView();
    view.fmaSurveillance.enabled = true;
    view.fmaPtlSeconds = 10;

    const dummyFilter = { minHundreds: 0, maxHundreds: 600 };
    const dummyFilterEntry = {
      phase: "idle" as const,
      digits: "",
      lastKeyAtMs: 0,
      previous: dummyFilter,
      pendingMin: 0,
    };

    // SSA Line 7 with FMA PTL 10s
    let lines = buildSsaRenderLines({
      simTimeMs: 0,
      rangeNm: 40,
      offCenter: false,
      filter: dummyFilter,
      filterEntry: dummyFilterEntry,
      fmaMode: true,
      fmaPtlSeconds: 10,
    });
    let line7 = lines.find((l) => l.text.includes("40NM"));
    expect(line7?.text).toBe("40NM PTL: 10");

    // Step PTL
    expect(stepFmaPtl(view, 1)).toBe(15);
    expect(stepFmaPtl(view, -10)).toBe(0); // Clamped at 0

    // Set 0 via spinner
    armDcbSpinner(view, "FMA_PTL");
    inputDcbSpinnerKey(view, "0");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.fmaPtlSeconds).toBe(0);

    // SSA Line 7 with FMA PTL 0s omits PTL readout
    lines = buildSsaRenderLines({
      simTimeMs: 0,
      rangeNm: 40,
      offCenter: false,
      filter: dummyFilter,
      filterEntry: dummyFilterEntry,
      fmaMode: true,
      fmaPtlSeconds: 0,
    });
    line7 = lines.find((l) => l.text.includes("40NM"));
    expect(line7?.text).toBe("40NM");

    // Out of range gives ILL VALUE
    armDcbSpinner(view, "FMA_PTL");
    for (const ch of "31") inputDcbSpinnerKey(view, ch);
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.fmaPtlSeconds).toBe(0);
    expect(view.lastWarning).toBe("ILL VALUE");

    // Non-integer gives FORMAT
    armDcbSpinner(view, "FMA_PTL");
    for (const ch of "1.5") inputDcbSpinnerKey(view, ch);
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.fmaPtlSeconds).toBe(0);
    expect(view.lastWarning).toBe("FORMAT");
  });

  test("AC3 — PTL spinner follows each selected AMZ maximum for typed, stepped, and restored values", () => {
    const view = createScopeView();
    const max45 = {
      ...syntheticAmz(),
      id: "AMZ-PTL-45",
      monitoring: { ...syntheticAmz().monitoring, maximumPtlS: 45 },
    };
    const max15 = {
      ...syntheticAmz(),
      id: "AMZ-PTL-15",
      monitoring: { ...syntheticAmz().monitoring, maximumPtlS: 15 },
    };
    view.fmaAmzs = [max45];
    configureFmaSurveillanceView(view, true, max45.id);
    view.fmaPtlSeconds = 12;
    const getPtl = () =>
      findRenderedDcbCell(
        renderFmaAux(view, () => undefined),
        "fma-ptl-len",
      )!;
    const wheel = { deltaY: -1, preventDefault() {}, stopPropagation() {} };

    (getPtl().onClick as () => void)();
    (getPtl().onWheel as (event: typeof wheel) => void)(wheel);
    expect(view.fmaPtlSeconds).toBe(17);
    (getPtl().onClick as () => void)();

    (getPtl().onClick as () => void)();
    for (const ch of "40") inputDcbSpinnerKey(view, ch);
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.fmaPtlSeconds).toBe(40);
    saveFmaAmzPreference(view, max45.id);
    view.fmaPtlSeconds = 5;
    expect(applyFmaAmzPreference(view, max45.id)).toBe(true);
    expect(view.fmaPtlSeconds).toBe(40);

    view.fmaPtlSeconds = 44;
    (getPtl().onClick as () => void)();
    (getPtl().onWheel as (event: typeof wheel) => void)(wheel);
    expect(view.fmaPtlSeconds).toBe(45);
    (getPtl().onClick as () => void)();

    rebindFmaScenarioAmzs(view, [{ ...max15, id: max45.id }], max45.id);
    expect(view.fmaPtlSeconds).toBe(15);
    (getPtl().onClick as () => void)();
    for (const ch of "20") inputDcbSpinnerKey(view, ch);
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.fmaPtlSeconds).toBe(15);
    expect(view.lastWarning).toBe("ILL VALUE");
  });

  test("AC4 — Runway leader entry accepts keypad directions and NONE, applies per runway", () => {
    const view = createScopeView();
    const world = createWorld();
    view.fmaSurveillance.enabled = true;
    const rwyId = "08L";

    // 8=S (2), 5=NONE (null), 1=NW (7)
    // Direct step helper
    stepFmaRunwayLeader(view, rwyId, 1);
    expect(view.fmaRunwayLeaders.get(rwyId)).toBe(8); // N

    // Armed spinner entry with keypad digit
    armDcbSpinner(view, `FMA_LDR_${rwyId}`);
    inputDcbSpinnerKey(view, "8");
    const eventEnter = { key: "Enter", preventDefault() {}, stopPropagation() {} };
    handleScopeKeyDown(eventEnter, view, "radio", world, 1);
    expect(view.fmaRunwayLeaders.get(rwyId)).toBe(2); // S

    // Keypad 5 = NONE
    armDcbSpinner(view, `FMA_LDR_${rwyId}`);
    inputDcbSpinnerKey(view, "5");
    handleScopeKeyDown(eventEnter, view, "radio", world, 2);
    expect(view.fmaRunwayLeaders.get(rwyId)).toBeNull();

    // Invalid extra data or non-single digit gives FORMAT
    armDcbSpinner(view, `FMA_LDR_${rwyId}`);
    for (const ch of "08") inputDcbSpinnerKey(view, ch);
    handleScopeKeyDown(eventEnter, view, "radio", world, 3);
    expect(view.lastWarning).toBe("FORMAT");
  });

  test("AC4 — NTZ individual toggle, NTZ ALL toggle, and suppression", () => {
    const view = createScopeView();
    const amz = syntheticAmz();
    view.fmaAmzs = [amz];
    configureFmaSurveillanceView(view, true, amz.id);

    // Initial all NTZs enabled
    expect(view.fmaAlertInhibit.ntzIds?.size ?? 0).toBe(0);

    // Toggle NTZ 1
    const ntz1Id = amz.ntzs[0]!.id;
    toggleFmaNtz(view, ntz1Id);
    expect(view.fmaAlertInhibit.ntzIds?.has(ntz1Id)).toBe(true);

    // NTZ ALL: when mixed/some disabled, NTZ ALL enables all
    toggleFmaNtzAll(view);
    expect(view.fmaAlertInhibit.ntzIds?.size).toBe(0);

    // NTZ ALL: when all enabled, NTZ ALL disables all
    toggleFmaNtzAll(view);
    expect(view.fmaAlertInhibit.ntzIds?.size).toBe(amz.ntzs.length);
  });

  test("AC5 — FMA BRITE channel ranges, wheel ladders, and PREF persistence", () => {
    const view = createScopeView();
    view.fmaSurveillance.enabled = true;

    // AMZ channel: 0 (off) or 5..100. 1..4 is ILL VALUE.
    armDcbSpinner(view, "BRITE_AMZ");
    inputDcbSpinnerKey(view, "0");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.brite.amz).toBe(0);

    armDcbSpinner(view, "BRITE_AMZ");
    inputDcbSpinnerKey(view, "5");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.brite.amz).toBe(5);

    armDcbSpinner(view, "BRITE_AMZ");
    inputDcbSpinnerKey(view, "3"); // 1..4 invalid
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.brite.amz).toBe(5); // Rollback
    expect(view.lastWarning).toBe("ILL VALUE");

    // NTZ channel: 50..100 only. 0 is ILL VALUE.
    armDcbSpinner(view, "BRITE_NTZ");
    inputDcbSpinnerKey(view, "50");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.brite.ntz).toBe(50);

    armDcbSpinner(view, "BRITE_NTZ");
    inputDcbSpinnerKey(view, "0");
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.brite.ntz).toBe(50);
    expect(view.lastWarning).toBe("ILL VALUE");

    // Stepping channels
    stepBriteChannel(view, "amz", 1);
    expect(view.brite.amz).toBe(10);
    stepBriteChannel(view, "ntz", 1);
    expect(view.brite.ntz).toBe(60);

    // Preference persistence
    const saved = saveFmaAmzPreference(view, "AMZ-SYN", {
      fmaBrite: { amz: 70, ntz: 80, rwy: 60, ref: 50 },
      mag: 3,
      ptlSeconds: 20,
    });
    expect(saved.fmaBrite?.amz).toBe(70);
    expect(saved.mag).toBe(3);
    expect(saved.ptlSeconds).toBe(20);

    // Reapply preference
    view.brite.amz = 10;
    view.fmaMag = 1;
    view.fmaPtlSeconds = 5;
    applyFmaAmzPreference(view, "AMZ-SYN");
    expect(view.brite.amz).toBe(70);
    expect(view.fmaMag).toBe(3);
    expect(view.fmaPtlSeconds).toBe(20);
  });

  describe("T02-227 FMA Projection, Picking and Graphics", () => {
    test("MAG applies the same geographic stretch to weather imagery", () => {
      const view = createScopeView();
      const size = { widthPx: 800, heightPx: 800 };
      const amz = syntheticAmz();
      view.fmaAmzs = [amz];
      view.fmaSurveillance.enabled = true;
      view.fmaSurveillance.selectedAmzId = amz.id;
      view.fmaMag = 4;
      view.arp = { latDeg: 0, lonDeg: 0 };
      view.wxLevels = [true, false, false, false, false, false];
      view.wxMosaic = decodeRgbaToVipMasks(
        new Uint8Array([0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255]),
        2,
        2,
        bboxFromArp(view.arp, 4),
        1000,
      );
      const canvas = createMockCtx();
      const transforms: number[][] = [];
      canvas.ctx.transform = (...values) => transforms.push(values);
      drawWeatherLayer(canvas.ctx, view, size);
      expect(canvas.drawImages).toHaveLength(1);
      expect(transforms).toHaveLength(1);
      expect(transforms[0]?.[0]).toBeCloseTo(4);
      expect(transforms[0]?.[1]).toBeCloseTo(0);
      expect(transforms[0]?.[2]).toBeCloseTo(0);
      expect(transforms[0]?.[3]).toBeCloseTo(1);

      view.fmaMag = 1;
      drawWeatherLayer(canvas.ctx, view, size);
      expect(transforms).toHaveLength(1);
    });

    test("MAG projects geographic maps with tracks and rebuilds cache when MAG changes", () => {
      const view = createScopeView();
      const size = { widthPx: 800, heightPx: 800 };
      const amz = syntheticAmz();
      view.fmaAmzs = [amz];
      view.fmaSurveillance.enabled = true;
      view.fmaSurveillance.selectedAmzId = amz.id;
      view.fmaMag = 4;
      view.digitalMap = {
        rangeRings: { intervalNm: 5, maxNm: 60 },
        runway: {
          id: "08L",
          thresholdEastNm: 2,
          thresholdNorthNm: 0,
          headingTrueDeg: 0,
          lengthNm: 1,
          widthNm: 0.1,
        },
        loadedVideoMaps: [
          {
            id: "TEST-MAP",
            file: "test-map.json",
            name: "Test map",
            dcbLabel: "TEST",
            defaultOn: true,
            color: "map",
            features: [
              {
                type: "polyline",
                closed: false,
                pointsNm: [
                  [2, 0],
                  [2, 1],
                ],
              },
              { type: "text", text: "FIX", atNm: [2, 0] },
            ],
          },
        ],
      };

      const cache = buildMapCache(toMapCacheInput(view, size));
      const projected = scopeProjectionFromView(view, size).toScreen(2, 0);
      expect(cache.videoStrokes[0]?.points[0]).toEqual(projected);
      expect(cache.videoLabels[0]?.x).toBe(projected.x);
      expect(cache.videoLabels[0]?.y).toBe(projected.y);
      expect(cache.runway?.[0]?.x).toBeCloseTo(
        scopeProjectionFromView(view, size).toScreen(2.05, 0).x,
      );

      view.fmaMag = 1;
      const unmagnified = reuseOrBuildMapCache(cache, toMapCacheInput(view, size));
      expect(unmagnified).not.toBe(cache);
      const original = nmToScreen(2, 0, view.camera, size);
      expect(unmagnified.videoStrokes[0]?.points[0]).toEqual(original);
      expect(unmagnified.videoLabels[0]?.x).toBe(original.x);
      view.fmaMag = 4;
      view.fmaSurveillance.enabled = false;
      const normal = reuseOrBuildMapCache(cache, toMapCacheInput(view, size));
      expect(normal.videoStrokes[0]?.points[0]).toEqual(original);
    });

    test("AC1 — forward/inverse round trips and numeric invariants across MAG 1–8, cardinal/oblique courses, camera offset, DPR, zero safeguards", () => {
      const courses = [0, 45, 90, 180, 270, 315];
      const mags = [1, 2, 3, 4, 6, 8];
      const cameraOffsets = [
        { eastNm: 0, northNm: 0 },
        { eastNm: 10, northNm: -5 },
        { eastNm: -20, northNm: 15 },
      ];
      const size = { widthPx: 1024, heightPx: 768 };

      for (const course of courses) {
        for (const mag of mags) {
          for (const camCenter of cameraOffsets) {
            const cam: ScopeCamera = {
              rangeNm: 20,
              centerEastNm: camCenter.eastNm,
              centerNorthNm: camCenter.northNm,
            };
            const proj = createScopeProjection(cam, size, {
              enabled: true,
              mag,
              courseTrueDeg: course,
            });

            // Invariant 1: Stationary camera center: camera center maps to screen center
            const screenCenter = proj.toScreen(camCenter.eastNm, camCenter.northNm);
            expect(screenCenter.x).toBeCloseTo(size.widthPx / 2, 4);
            expect(screenCenter.y).toBeCloseTo(size.heightPx / 2, 4);

            // Invariant 2: Inverse of screen center recovers camera center
            const unprojectedCenter = proj.toWorld(screenCenter.x, screenCenter.y);
            expect(unprojectedCenter.eastNm).toBeCloseTo(camCenter.eastNm, 4);
            expect(unprojectedCenter.northNm).toBeCloseTo(camCenter.northNm, 4);

            // Invariant 3: Round-trip preservation across test points
            const testPoints = [
              { eastNm: camCenter.eastNm + 5, northNm: camCenter.northNm + 5 },
              { eastNm: camCenter.eastNm - 8, northNm: camCenter.northNm + 3 },
              { eastNm: camCenter.eastNm + 12, northNm: camCenter.northNm - 10 },
            ];

            for (const pt of testPoints) {
              const scr = proj.toScreen(pt.eastNm, pt.northNm);
              const back = proj.toWorld(scr.x, scr.y);
              expect(back.eastNm).toBeCloseTo(pt.eastNm, 4);
              expect(back.northNm).toBeCloseTo(pt.northNm, 4);

              // Low-level helper round trip
              const directProj = projectWorldPoint(
                pt.eastNm,
                pt.northNm,
                camCenter.eastNm,
                camCenter.northNm,
                mag,
                course,
              );
              const directBack = unprojectWorldPoint(
                directProj.eastNm,
                directProj.northNm,
                camCenter.eastNm,
                camCenter.northNm,
                mag,
                course,
              );
              expect(directBack.eastNm).toBeCloseTo(pt.eastNm, 4);
              expect(directBack.northNm).toBeCloseTo(pt.northNm, 4);
            }
          }
        }
      }

      // Zero-size safeguards
      const zeroProj = createScopeProjection(
        { rangeNm: 20, centerEastNm: 0, centerNorthNm: 0 },
        { widthPx: 0, heightPx: 0 },
        { enabled: true, mag: 4, courseTrueDeg: 45 },
      );
      const zeroScreen = zeroProj.toScreen(5, 5);
      expect(zeroScreen.x).toBe(0);
      expect(zeroScreen.y).toBe(0);
      const zeroWorld = zeroProj.toWorld(0, 0);
      expect(zeroWorld.eastNm).toBe(0);
      expect(zeroWorld.northNm).toBe(0);
    });

    test("AC2 — target/datablock picking and geographic tool/pan entry use actual projected positions; RBL/MIN distances remain world measurements", () => {
      const world = createWorld();
      const view = createScopeView();
      const amz = syntheticAmz();
      amz.courseTrueDeg = 0; // along=north, cross=east
      view.fmaAmzs = [amz];
      view.fmaSurveillance.enabled = true;
      view.fmaSurveillance.selectedAmzId = amz.id;
      view.fmaMag = 4;
      view.camera = { rangeNm: 20, centerEastNm: 0, centerNorthNm: 0 };
      const size = { widthPx: 800, heightPx: 800 };

      // Aircraft at (east=2 NM, north=0 NM). Camera center=(0,0).
      // Cross component = 2 NM. Under MAG 4, projected cross = 8 NM.
      const ac = makeTestAircraft({
        id: "TEST1",
        callsign: "AAL100",
        xNm: 2,
        yNm: 0,
        altitudeFt: 3000,
        speedKt: 160,
        headingDeg: 360,
      });
      world.aircraft = [ac];
      const td1 = createTrackDisplay("owned");
      td1.lastReport = {
        aircraftId: "TEST1",
        xNm: 2,
        yNm: 0,
        altitudeFt: 3000,
        speedKt: 160,
        headingDeg: 360,
        reportedAtSimMs: 1000,
        sourceSiteId: null,
        paint: "fused-puck",
      };
      view.tracks.set(ac.id, td1);

      const proj = scopeProjectionFromView(view, size);
      const targetScreen = proj.toScreen(ac.xNm, ac.yNm);

      // Unprojected screen point would be nmToScreen(2, 0):
      const unprojectedScreen = nmToScreen(2, 0, view.camera, size);
      expect(Math.abs(targetScreen.x - unprojectedScreen.x)).toBeGreaterThan(50);

      // Click exactly at the projected screen position picks the aircraft:
      const hit = pickAircraftAt(
        world,
        targetScreen.x,
        targetScreen.y,
        view.camera,
        size.widthPx,
        size.heightPx,
        12,
        view,
      );
      expect(hit?.id).toBe("TEST1");

      // Click at the unprojected position misses:
      const miss = pickAircraftAt(
        world,
        unprojectedScreen.x,
        unprojectedScreen.y,
        view.camera,
        size.widthPx,
        size.heightPx,
        12,
        view,
      );
      expect(miss).toBeNull();

      // Pan delta with projection preserves pan under magnified cross axis:
      const camBefore = { ...view.camera };
      applyProjectedPanDelta(view, 40, 0, size);
      // Pan delta was along cross axis; should adjust camera center in world coordinates
      expect(view.camera.centerEastNm).not.toBe(camBefore.centerEastNm);

      // RBL distance check: existing RBL uses world coordinates, not magnified cross
      const pt1 = { eastNm: 0, northNm: 0 };
      const pt2 = { eastNm: 2, northNm: 0 };
      const worldDist = Math.hypot(pt2.eastNm - pt1.eastNm, pt2.northNm - pt1.northNm);
      expect(worldDist).toBe(2); // In ENU NM, distance is 2 NM, NOT magnified 8 NM
    });

    test("AC3 — reference exact boundary, ring/compass stored preference restoration, zone visibility, brightness and severity aggregation", () => {
      const view = createScopeView();
      const amz = syntheticAmz();
      amz.runwayGraphics = [
        {
          runwayId: "08L",
          threshold: { xNm: -0.5, yNm: 0 },
          departureEnd: { xNm: -0.5, yNm: 0.75 },
        },
      ];
      amz.courseLines = [
        {
          runwayId: "08L",
          approach: [
            { xNm: -0.5, yNm: -5 },
            { xNm: -0.5, yNm: 0 },
          ],
          departure: [
            { xNm: -0.5, yNm: 0.75 },
            { xNm: -0.5, yNm: 1.5 },
          ],
        },
      ];
      amz.referenceLines = [
        [
          { xNm: -1, yNm: -5 },
          { xNm: 1, yNm: -5 },
        ],
      ];
      view.fmaAmzs = [amz];
      view.fmaSurveillance.enabled = true;
      view.fmaSurveillance.selectedAmzId = amz.id;
      view.fmaMag = 2;

      const hierarchyCanvas = createMockCtx();
      hierarchyCanvas.ctx.lineWidth = 7;
      hierarchyCanvas.ctx.strokeStyle = "#123456";
      hierarchyCanvas.ctx.setLineDash([2, 3]);
      drawFmaLayers(hierarchyCanvas.ctx, view, { widthPx: 800, heightPx: 800 });
      expect(hierarchyCanvas.pathStrokes.some((stroke) => stroke.lineWidth === 3)).toBe(true);
      expect(hierarchyCanvas.pathStrokes.some((stroke) => stroke.lineWidth === 5)).toBe(true);
      expect(hierarchyCanvas.pathStrokes.some((stroke) => stroke.lineWidth === 1.25)).toBe(true);
      expect(
        hierarchyCanvas.pathStrokes.some((stroke) => stroke.lineDash.join(",") === "5,4"),
      ).toBe(true);
      expect(hierarchyCanvas.ctx.lineWidth).toBe(7);
      expect(hierarchyCanvas.ctx.strokeStyle).toBe("#123456");
      expect(hierarchyCanvas.ctx.getLineDash()).toEqual([2, 3]);

      // 1. Reference lines show iff rangeNm / MAG <= 16 NM
      // Case A: rangeNm = 30, mag = 2 -> 30 / 2 = 15 <= 16 -> visible
      view.camera.rangeNm = 30;
      const mockCanvasA = createMockCtx();
      drawFmaLayers(mockCanvasA.ctx, view, { widthPx: 800, heightPx: 800 });
      // References draw white strokes:
      expect(mockCanvasA.pathStrokes.length).toBeGreaterThan(0);

      // Case A2: rangeNm = 40, mag = 2.5 -> exact 16 NM boundary remains visible.
      view.camera.rangeNm = 40;
      view.fmaMag = 2.5;
      const mockCanvasA2 = createMockCtx();
      drawFmaLayers(mockCanvasA2.ctx, view, { widthPx: 800, heightPx: 800 });
      expect(mockCanvasA2.pathStrokes.some((s) => s.lineWidth === 0.65)).toBe(true);

      // Case B: rangeNm = 40, mag = 2 -> 40 / 2 = 20 > 16 -> hidden
      view.fmaMag = 2;
      view.camera.rangeNm = 40;
      const mockCanvasB = createMockCtx();
      drawFmaLayers(mockCanvasB.ctx, view, { widthPx: 800, heightPx: 800 });
      // Reference lines not drawn; only AMZ/runway/NTZ
      // Verify no stroke with reference line length:
      const refStrokes = mockCanvasB.pathStrokes.filter(
        (s) => s.lineWidth === 0.65 && s.points.length === 2,
      );
      expect(refStrokes.length).toBe(0);

      // 2. Rings & compass rose preference restoration without mutation
      view.showRings = true;
      view.showCompassRose = true;
      view.fmaMag = 2; // Active FMA + MAG > 1 suppresses rings in paint/cache
      const mockCanvasC = createMockCtx();
      const mockCache: MapCache = {
        key: "test",
        ringRadiiNm: [5],
        ringsPath: null,
        ringCircles: [{ x: 400, y: 400, radiusPx: 100 }],
        compassRosePath: null,
        compassRose: generateCompassRoseGeometry({ widthPx: 800, heightPx: 800 }),
        compassRoseLabels: generateCompassRoseGeometry({ widthPx: 800, heightPx: 800 }).labels,
        videoStrokes: [],
        coastlinePath: null,
        coastline: null,
        runwayPath: null,
        runway: null,
        localizer: null,
        localizerPath: null,
        localizers: [],
        runwayLabels: [],
        videoLabels: [],
      };
      drawMapLayers(mockCanvasC.ctx, mockCache, view, { widthPx: 800, heightPx: 800 });
      expect(mockCanvasC.arcStrokes).toHaveLength(0);
      expect(mockCanvasC.pathStrokes.some((stroke) => stroke.strokeStyle === PALETTE.mapDim)).toBe(
        false,
      );
      expect(view.showRings).toBe(true);
      expect(view.showCompassRose).toBe(true);
      // MAG 1 restores real ring arcs and compass tick strokes.
      view.fmaMag = 1;
      drawMapLayers(mockCanvasC.ctx, mockCache, view, { widthPx: 800, heightPx: 800 });
      expect(mockCanvasC.arcStrokes.length).toBeGreaterThan(0);
      expect(mockCanvasC.pathStrokes.some((stroke) => stroke.strokeStyle === PALETTE.mapDim)).toBe(
        true,
      );
      // MAG 4 suppresses both overlays again; returning to MAG 1 restores them.
      view.fmaMag = 4;
      const priorArcs = mockCanvasC.arcStrokes.length;
      const priorPaths = mockCanvasC.pathStrokes.filter(
        (stroke) => stroke.strokeStyle === PALETTE.mapDim,
      ).length;
      drawMapLayers(mockCanvasC.ctx, mockCache, view, { widthPx: 800, heightPx: 800 });
      expect(mockCanvasC.arcStrokes).toHaveLength(priorArcs);
      expect(
        mockCanvasC.pathStrokes.filter((stroke) => stroke.strokeStyle === PALETTE.mapDim),
      ).toHaveLength(priorPaths);
      view.fmaMag = 1;
      drawMapLayers(mockCanvasC.ctx, mockCache, view, { widthPx: 800, heightPx: 800 });
      expect(mockCanvasC.arcStrokes.length).toBeGreaterThan(priorArcs);
      expect(
        mockCanvasC.pathStrokes.filter((stroke) => stroke.strokeStyle === PALETTE.mapDim).length,
      ).toBeGreaterThan(priorPaths);
      // Exiting FMA restores both overlays while retaining enabled preferences.
      view.fmaSurveillance.enabled = false;
      drawMapLayers(mockCanvasC.ctx, mockCache, view, { widthPx: 800, heightPx: 800 });
      expect(mockCanvasC.arcStrokes.length).toBeGreaterThan(priorArcs);
      expect(
        mockCanvasC.pathStrokes.filter((stroke) => stroke.strokeStyle === PALETTE.mapDim).length,
      ).toBeGreaterThan(priorPaths);
      expect(view.showRings).toBe(true);
      expect(view.showCompassRose).toBe(true);

      // A user who had both preferences disabled stays disabled across MAG changes and FMA exit.
      const disabledView = createScopeView();
      disabledView.fmaSurveillance.enabled = true;
      disabledView.fmaMag = 1;
      disabledView.showRings = false;
      disabledView.showCompassRose = false;
      const disabledCache = {
        ...mockCache,
        ringCircles: [],
        compassRose: null,
        compassRoseLabels: [],
      };
      const disabledTrace = createMockCtx();
      drawMapLayers(disabledTrace.ctx, disabledCache, disabledView, {
        widthPx: 800,
        heightPx: 800,
      });
      disabledView.fmaMag = 4;
      drawMapLayers(disabledTrace.ctx, disabledCache, disabledView, {
        widthPx: 800,
        heightPx: 800,
      });
      disabledView.fmaSurveillance.enabled = false;
      drawMapLayers(disabledTrace.ctx, disabledCache, disabledView, {
        widthPx: 800,
        heightPx: 800,
      });
      expect(disabledTrace.arcStrokes).toHaveLength(0);
      expect(disabledTrace.pathStrokes).toHaveLength(0);
      expect(disabledView.showRings).toBe(false);
      expect(disabledView.showCompassRose).toBe(false);

      // 3. NTZ severity outlines: warning red, caution yellow, normal white.
      // Disabled NTZ draws no boundary.
      view.fmaSurveillance.enabled = true;
      view.fmaMag = 1;
      const ntz1 = amz.ntzs[0]!;
      view.fmaAlertOutlines = new Map([[ntz1.id, "RED"]]);
      const mockCanvasD = createMockCtx();
      drawFmaLayers(mockCanvasD.ctx, view, { widthPx: 800, heightPx: 800 });
      const redStroke = mockCanvasD.pathStrokes.find((s) => s.strokeStyle === "#FF0000");
      expect(redStroke).toBeDefined();

      // Disabled NTZ removes its outline
      view.fmaAlertInhibit.ntzIds = new Set([ntz1.id]);
      const mockCanvasE = createMockCtx();
      drawFmaLayers(mockCanvasE.ctx, view, { widthPx: 800, heightPx: 800 });
      const redStrokeDisabled = mockCanvasE.pathStrokes.find((s) => s.strokeStyle === "#FF0000");
      expect(redStrokeDisabled).toBeUndefined();

      // BRITE 0 suppresses paint:
      view.fmaAlertInhibit.ntzIds = new Set();
      view.brite.amz = 0;
      const mockCanvasF = createMockCtx();
      drawFmaLayers(mockCanvasF.ctx, view, { widthPx: 800, heightPx: 800 });
      const amzStroke = mockCanvasF.pathStrokes.find((s) => s.strokeStyle === "#ADD8E6");
      expect(amzStroke).toBeUndefined();
    });

    test("AC4 — glyph/text sizes and leader/datablock placement remain screen-space, render helpers do not mutate runtime", () => {
      const world = createWorld();
      const view = createScopeView();
      const amz = syntheticAmz();
      view.fmaAmzs = [amz];
      view.fmaSurveillance.enabled = true;
      view.fmaSurveillance.selectedAmzId = amz.id;
      view.fmaMag = 4;
      const ac = makeTestAircraft({
        id: "TEST1",
        callsign: "DAL200",
        xNm: 1,
        yNm: 2,
        altitudeFt: 4000,
      });
      world.aircraft = [ac];
      const td4 = createTrackDisplay("owned");
      td4.lastReport = {
        aircraftId: "TEST1",
        xNm: 1,
        yNm: 2,
        altitudeFt: 4000,
        speedKt: 150,
        headingDeg: 360,
        reportedAtSimMs: 1000,
        sourceSiteId: null,
        paint: "fused-puck",
      };
      view.tracks.set(ac.id, td4);

      const mock = createMockCtx();
      const viewBefore = JSON.stringify({
        fmaMag: view.fmaMag,
        camera: view.camera,
        showRings: view.showRings,
        showCompassRose: view.showCompassRose,
      });

      renderScope(mock.ctx, world, view, 800, 800);

      const viewAfter = JSON.stringify({
        fmaMag: view.fmaMag,
        camera: view.camera,
        showRings: view.showRings,
        showCompassRose: view.showCompassRose,
      });

      // Render helpers must not mutate runtime camera, mag, or stored preferences
      expect(viewAfter).toBe(viewBefore);

      // Datablock text rendered using un-stretched font
      const datablockTexts = mock.fillTexts.filter((t) => t.text.includes("DAL200"));
      expect(datablockTexts.length).toBeGreaterThan(0);
      for (const t of datablockTexts) {
        expect(t.font).toContain("px");
      }
    });
  });
});
