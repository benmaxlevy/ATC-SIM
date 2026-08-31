import { expect, test } from "vitest";
import { createWorld, makeTestAircraft, stepWorld } from "@core";
import { HISTORY_MAX_DOTS, createHistoryBuf, recordHistoryOnReport } from "./history";
import { createScopeView, setSurveillanceMode } from "./scopeView";
import { renderScope } from "./renderScope";
import { syncTrackDisplays } from "./trackDisplay";
import { nmToScreen } from "./camera";
import { ptlEndpoint } from "./ptl";
import {
  FUSED_PERIOD_MS,
  MULTI_RECT_COLOR,
  MULTI_RECT_LENGTH_PX,
  MULTI_RECT_THICKNESS_PX,
  SITE_FAR_LINE_COLOR,
  SITE_FAR_LINE_LENGTH_SCALE,
  SITE_RECT_MAX_LENGTH_PX,
  SITE_RECT_MIN_LENGTH_PX,
  SITE_RECT_OUTLINE_RANGE_FRACTION,
  createSurveillanceSampler,
  defaultSurveillanceMode,
  displayReportFor,
  effectiveSurveillanceMode,
  formatDcbSiteLabel,
  parseSurveillanceMode,
  resolveSurveillancePref,
  siteDcbChoices,
  surveillanceModeWord,
  surveillanceModesEqual,
  horizontalRangeNm,
  isInSurveillanceCoverage,
  multiRectCorners,
  nearestCoveringSite,
  reportPeriodMs,
  siteCovers,
  siteRectMark,
  stepSurveillanceSampler,
  surveillancePaintFor,
} from "./surveillance";
import type { RadarSite } from "@scenario";
import type { SurveillanceWorldPose } from "./surveillance";

function site(partial: Partial<RadarSite> & Pick<RadarSite, "id">): RadarSite {
  return {
    name: partial.name ?? partial.id,
    kind: partial.kind ?? "asr",
    xNm: partial.xNm ?? 0,
    yNm: partial.yNm ?? 0,
    rangeNm: partial.rangeNm ?? 60,
    periodMs: partial.periodMs ?? 4800,
    ...partial,
  };
}

function ac(
  partial: Partial<SurveillanceWorldPose> & Pick<SurveillanceWorldPose, "id">,
): SurveillanceWorldPose {
  return {
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    speedKt: 220,
    altitudeFt: 8000,
    ...partial,
  };
}

function fakeClock(startMs = 0): {
  nowMs: () => number;
  set: (ms: number) => void;
  advance: (ms: number) => void;
} {
  let t = startMs;
  return {
    nowMs: () => t,
    set: (ms: number) => {
      t = ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

test("AC1 — default mode is FUSED; empty radarSites is implicit FUSED without a crash", () => {
  expect(defaultSurveillanceMode()).toBe("FUSED");
  const clock = fakeClock(0);
  const sampler = createSurveillanceSampler({ nowMs: clock.nowMs, sites: [] });
  expect(effectiveSurveillanceMode("MULTI", [])).toBe("FUSED");
  expect(effectiveSurveillanceMode({ siteId: "MISSING" }, [])).toBe("FUSED");
  expect(isInSurveillanceCoverage("MULTI", [], 200, 200)).toBe(true);
  expect(reportPeriodMs("FUSED", [], 0, 0)).toBe(FUSED_PERIOD_MS);
  expect(surveillancePaintFor("MULTI", [])).toBe("fused-puck");
  const issued = stepSurveillanceSampler(sampler, [ac({ id: "ac-1" })]);
  expect(issued).toHaveLength(1);
  expect(issued[0]!.paint).toBe("fused-puck");
  expect(issued[0]!.sourceSiteId).toBeNull();
});

test("AC2 — FUSED reports every 1000 ms and display pose stays on the last report", () => {
  const clock = fakeClock(0);
  const sampler = createSurveillanceSampler({ mode: "FUSED", nowMs: clock.nowMs });
  const jet = ac({ id: "ac-fused", xNm: 0, yNm: 0 });
  expect(FUSED_PERIOD_MS).toBe(1000);
  expect(stepSurveillanceSampler(sampler, [jet], clock.nowMs())).toHaveLength(1);
  expect(displayReportFor(sampler, "ac-fused")!.xNm).toBe(0);

  jet.xNm = 4;
  clock.set(999);
  expect(stepSurveillanceSampler(sampler, [jet], clock.nowMs())).toHaveLength(0);
  const frozen = displayReportFor(sampler, "ac-fused")!;
  expect(frozen.xNm).toBe(0);
  expect(frozen.yNm).toBe(0);
  expect(frozen.reportedAtSimMs).toBe(0);

  clock.set(1000);
  expect(stepSurveillanceSampler(sampler, [jet], clock.nowMs())).toHaveLength(1);
  expect(displayReportFor(sampler, "ac-fused")!.xNm).toBe(4);
  expect(displayReportFor(sampler, "ac-fused")!.reportedAtSimMs).toBe(1000);
});

test("AC3 — single-site uses that site periodMs and paints only inside its range", () => {
  const apt = site({ id: "APT", kind: "airport", xNm: 0, yNm: 0, rangeNm: 20, periodMs: 4800 });
  const clock = fakeClock(0);
  const sampler = createSurveillanceSampler({
    mode: { siteId: "APT" },
    sites: [apt],
    nowMs: clock.nowMs,
  });
  const jet = ac({ id: "ac-site", xNm: 5, yNm: 0 });
  expect(reportPeriodMs({ siteId: "APT" }, [apt], 5, 0)).toBe(4800);
  expect(siteCovers(apt, 20, 0)).toBe(true);
  expect(siteCovers(apt, 20.1, 0)).toBe(false);

  expect(stepSurveillanceSampler(sampler, [jet], 0)).toHaveLength(1);
  expect(displayReportFor(sampler, "ac-site")!.sourceSiteId).toBe("APT");
  expect(displayReportFor(sampler, "ac-site")!.paint).toBe("site-rect");

  jet.xNm = 6;
  clock.set(4799);
  expect(stepSurveillanceSampler(sampler, [jet], clock.nowMs())).toHaveLength(0);
  expect(displayReportFor(sampler, "ac-site")!.xNm).toBe(5);

  clock.set(4800);
  expect(stepSurveillanceSampler(sampler, [jet], clock.nowMs())).toHaveLength(1);
  expect(displayReportFor(sampler, "ac-site")!.xNm).toBe(6);

  jet.xNm = 40;
  clock.set(9600);
  expect(isInSurveillanceCoverage({ siteId: "APT" }, [apt], 40, 0)).toBe(false);
  expect(stepSurveillanceSampler(sampler, [jet], clock.nowMs())).toHaveLength(0);
  expect(displayReportFor(sampler, "ac-site")).toBeNull();
});

test("AC3/AC4 — MULTI uses nearest covering site period and catalog-order ties", () => {
  const near = site({ id: "NEAR", xNm: 0, yNm: 0, rangeNm: 30, periodMs: 4800 });
  const far = site({ id: "FAR", xNm: 20, yNm: 0, rangeNm: 30, periodMs: 2400 });
  const sites = [near, far];
  expect(nearestCoveringSite(sites, 2, 0)?.id).toBe("NEAR");
  expect(nearestCoveringSite(sites, 18, 0)?.id).toBe("FAR");
  expect(reportPeriodMs("MULTI", sites, 2, 0)).toBe(4800);
  expect(reportPeriodMs("MULTI", sites, 18, 0)).toBe(2400);
  expect(isInSurveillanceCoverage("MULTI", sites, 80, 0)).toBe(false);

  const tiedA = site({ id: "A", xNm: 0, yNm: 0, rangeNm: 20, periodMs: 4800 });
  const tiedB = site({ id: "B", xNm: 10, yNm: 0, rangeNm: 20, periodMs: 2400 });
  expect(horizontalRangeNm(5, 0, tiedA)).toBe(horizontalRangeNm(5, 0, tiedB));
  expect(nearestCoveringSite([tiedA, tiedB], 5, 0)?.id).toBe("A");
  expect(nearestCoveringSite([tiedB, tiedA], 5, 0)?.id).toBe("B");

  const clock = fakeClock(0);
  const sampler = createSurveillanceSampler({ mode: "MULTI", sites, nowMs: clock.nowMs });
  const jet = ac({ id: "ac-multi", xNm: 2, yNm: 0 });
  expect(stepSurveillanceSampler(sampler, [jet], 0)[0]!.sourceSiteId).toBe("NEAR");
  expect(displayReportFor(sampler, "ac-multi")!.paint).toBe("multi-rect");
  jet.xNm = 3;
  clock.set(4799);
  expect(stepSurveillanceSampler(sampler, [jet], clock.nowMs())).toHaveLength(0);
  clock.set(4800);
  expect(stepSurveillanceSampler(sampler, [jet], clock.nowMs())).toHaveLength(1);
});

test("AC6/AC8 — history records on report arrival and never exceeds five dots", () => {
  const clock = fakeClock(0);
  const sampler = createSurveillanceSampler({ mode: "FUSED", nowMs: clock.nowMs });
  const jet = ac({ id: "ac-hist", xNm: 0, yNm: 0 });
  const buf = createHistoryBuf();
  for (let t = 0; t <= 6000; t += 200) {
    clock.set(t);
    jet.xNm = t / 1000;
    const issued = stepSurveillanceSampler(sampler, [jet], clock.nowMs());
    for (const report of issued) {
      recordHistoryOnReport(buf, report.reportedAtSimMs, report.xNm, report.yNm);
    }
  }
  expect(HISTORY_MAX_DOTS).toBe(5);
  expect(buf.timesSimMs).toEqual([2000, 3000, 4000, 5000, 6000]);
  expect(buf.eastNm).toEqual([2, 3, 4, 5, 6]);
  expect(buf.timesSimMs).toHaveLength(5);
});

test("AC7 — uncovered targets drop immediately; no 30 s coast", () => {
  const apt = site({ id: "APT", xNm: 0, yNm: 0, rangeNm: 10, periodMs: 4800 });
  const sampler = createSurveillanceSampler({ mode: { siteId: "APT" }, sites: [apt] });
  const jet = ac({ id: "ac-coast", xNm: 0, yNm: 0 });
  stepSurveillanceSampler(sampler, [jet], 0);
  expect(displayReportFor(sampler, "ac-coast")).not.toBeNull();
  jet.xNm = 50;
  expect(stepSurveillanceSampler(sampler, [jet], 100)).toHaveLength(0);
  expect(displayReportFor(sampler, "ac-coast")).toBeNull();
  expect(stepSurveillanceSampler(sampler, [jet], 30_000)).toHaveLength(0);
  expect(displayReportFor(sampler, "ac-coast")).toBeNull();
});

test("AC4/AC5 — MULTI rect is perpendicular to PTL; site far line is 30% longer", () => {
  const eastbound = multiRectCorners(0, 0, 90);
  const longDx = eastbound[0]!.x - eastbound[1]!.x;
  const longDy = eastbound[0]!.y - eastbound[1]!.y;
  expect(Math.abs(longDx)).toBeLessThan(1e-9);
  expect(Math.abs(longDy)).toBeCloseTo(MULTI_RECT_LENGTH_PX, 6);
  const thickDx = eastbound[0]!.x - eastbound[3]!.x;
  const thickDy = eastbound[0]!.y - eastbound[3]!.y;
  expect(Math.abs(thickDy)).toBeLessThan(1e-9);
  expect(Math.abs(thickDx)).toBeCloseTo(MULTI_RECT_THICKNESS_PX, 6);

  const northbound = multiRectCorners(10, 20, 0);
  expect(northbound[0]!.y).toBeCloseTo(northbound[1]!.y, 6);
  expect(Math.abs(northbound[0]!.x - northbound[1]!.x)).toBeCloseTo(MULTI_RECT_LENGTH_PX, 6);

  const near = siteRectMark(0, 0, 0, 0, 10, 0, 60);
  const far = siteRectMark(0, 0, 0, 0, 50, 0, 60);
  const outline = siteRectMark(0, 0, 0, 0, 54, 0, 60);
  expect(near.outlineOnly).toBe(false);
  expect(far.outlineOnly).toBe(false);
  expect(outline.outlineOnly).toBe(true);
  expect(far.lengthPx).toBeGreaterThan(near.lengthPx);
  expect(far.lengthPx).toBeLessThanOrEqual(SITE_RECT_MAX_LENGTH_PX);
  expect(near.lengthPx).toBeGreaterThanOrEqual(SITE_RECT_MIN_LENGTH_PX);
  expect(SITE_RECT_OUTLINE_RANGE_FRACTION).toBe(0.9);

  // Site east: long axis N-S (vertical); far-side green line is west (left).
  expect(Math.abs(far.corners[0]!.x - far.corners[1]!.x)).toBeLessThan(1e-9);
  expect(Math.abs(far.corners[0]!.y - far.corners[1]!.y)).toBeCloseTo(far.lengthPx, 6);
  expect(far.farLine.x1).toBeLessThan(0);
  expect(far.farLine.x2).toBeLessThan(0);
  expect(far.farLine.x1).toBeCloseTo(far.farLine.x2, 6);
  expect(Math.hypot(far.farLine.x2 - far.farLine.x1, far.farLine.y2 - far.farLine.y1)).toBeCloseTo(
    far.lengthPx * SITE_FAR_LINE_LENGTH_SCALE,
    6,
  );

  expect(MULTI_RECT_COLOR).toBe("#175dc7");
  expect(SITE_FAR_LINE_COLOR).toBe("#00FF00");
});

test("AC9 — comment names R07/R05 and frozen trainer paint/period delta", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./surveillance.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/R05/);
  expect(src).toMatch(/1000 ms/);
  expect(src).toMatch(/4800 ms/);
  expect(src).toMatch(/no 30 s/);
  expect(src).toMatch(/surveillance/);
  expect(src).toMatch(/range/);
  expect(src).toMatch(/site/);
  expect(src.toLowerCase()).not.toMatch(/\bsprite\b/);
  expect(src.toLowerCase()).not.toMatch(/\bairplane\b/);
});

function mockRenderCtx(): {
  ctx: CanvasRenderingContext2D;
  fillTexts: { text: string; x?: number; y?: number }[];
  pathStrokes: { points: { x: number; y: number }[] }[];
} {
  const fillTexts: { text: string; x?: number; y?: number }[] = [];
  const pathStrokes: { points: { x: number; y: number }[] }[] = [];
  let currentPath: { x: number; y: number }[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {
      currentPath = [];
    },
    closePath() {},
    arc() {},
    clip() {},
    rect() {},
    stroke() {
      if (currentPath.length >= 2) {
        pathStrokes.push({ points: currentPath.slice() });
      }
    },
    fill() {},
    moveTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    lineTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    fillText(text: string, x: number, y: number) {
      fillTexts.push({ text, x, y });
    },
    measureText(text: string) {
      return { width: text.length * 7.2 };
    },
    strokeRect() {},
    setLineDash() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fillTexts, pathStrokes };
}

test("AC1 — createScopeView boots FUSED with empty radarSites", () => {
  const view = createScopeView();
  expect(view.surveillanceMode).toBe("FUSED");
  expect(view.radarSites).toEqual([]);
});

test("T02-76 — SITE labels, empty-site choices, and PREF site-id fallback", () => {
  expect(surveillanceModeWord("FUSED")).toBe("FUSED");
  expect(surveillanceModeWord("MULTI")).toBe("MULTI");
  expect(surveillanceModeWord({ siteId: "ASR-N" })).toBe("ASR-N");
  expect(formatDcbSiteLabel("FUSED")).toBe("SITE FUSED");
  expect(formatDcbSiteLabel("MULTI")).toBe("SITE MULTI");
  expect(formatDcbSiteLabel({ siteId: "ASR-N" })).toBe("SITE ASR-N");
  expect(surveillanceModesEqual("FUSED", "FUSED")).toBe(true);
  expect(surveillanceModesEqual({ siteId: "A" }, { siteId: "A" })).toBe(true);
  expect(surveillanceModesEqual({ siteId: "A" }, { siteId: "B" })).toBe(false);

  expect(siteDcbChoices([])).toEqual(["FUSED"]);
  const rows = [site({ id: "ASR-N", xNm: 0, yNm: 0 }), site({ id: "ASR-S", xNm: 10, yNm: 0 })];
  expect(siteDcbChoices(rows)).toEqual([
    "FUSED",
    "MULTI",
    { siteId: "ASR-N" },
    { siteId: "ASR-S" },
  ]);

  expect(parseSurveillanceMode("MULTI")).toBe("MULTI");
  expect(parseSurveillanceMode({ siteId: "ASR-N" })).toEqual({ siteId: "ASR-N" });
  expect(parseSurveillanceMode({ siteId: "" })).toBe("FUSED");
  expect(parseSurveillanceMode(null)).toBe("FUSED");
  expect(resolveSurveillancePref({ siteId: "GONE" }, rows)).toBe("FUSED");
  expect(resolveSurveillancePref({ siteId: "ASR-N" }, rows)).toEqual({ siteId: "ASR-N" });
  expect(resolveSurveillancePref("MULTI", [])).toBe("FUSED");

  const view = createScopeView(0, 0, { radarSites: rows });
  setSurveillanceMode(view, { siteId: "ASR-S" });
  expect(view.surveillanceMode).toEqual({ siteId: "ASR-S" });
  setSurveillanceMode(view, { siteId: "GONE" });
  expect(view.surveillanceMode).toBe("FUSED");
  setSurveillanceMode(view, "MULTI");
  expect(view.surveillanceMode).toBe("MULTI");
  const empty = createScopeView();
  setSurveillanceMode(empty, "MULTI");
  expect(empty.surveillanceMode).toBe("FUSED");
});

test("AC2 — PPI, datablock, and PTL use last report pose, not 20 Hz world", () => {
  const jet = makeTestAircraft({
    id: "ac-pose",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    speedKt: 180,
    altitudeFt: 8000,
  });
  const world = createWorld({ aircraft: [jet], simTimeMs: 0 });
  const view = createScopeView();
  view.ptlOn = true;
  syncTrackDisplays(view.tracks, world, { mode: view.surveillanceMode, sites: view.radarSites });
  const td = view.tracks.get(jet.id)!;
  td.datablockMode = "full";
  td.ownership = "owned";
  expect(td.lastReport!.xNm).toBe(0);

  jet.xNm = 8;
  world.simTimeMs = 400;
  const { ctx, fillTexts, pathStrokes } = mockRenderCtx();
  renderScope(ctx, world, view, 800, 800);
  const frozen = nmToScreen(0, 0, view.camera, { widthPx: 800, heightPx: 800 });
  const live = nmToScreen(8, 0, view.camera, { widthPx: 800, heightPx: 800 });
  const callsign = fillTexts.find((t) => t.text === "DAL123");
  expect(callsign).toBeDefined();
  expect(callsign!.x).not.toBeCloseTo(live.x, 0);
  expect(Math.abs((callsign!.x ?? 0) - frozen.x)).toBeLessThan(80);
  const ptlEnd = ptlEndpoint(0, 0, 90, 180, view.ptlMinutes);
  const ptlFrom = frozen;
  const ptlTo = nmToScreen(ptlEnd.eastNm, ptlEnd.northNm, view.camera, {
    widthPx: 800,
    heightPx: 800,
  });
  const ptl = pathStrokes.find((stroke) => {
    const a = stroke.points[0];
    const b = stroke.points[1];
    return (
      a != null &&
      b != null &&
      Math.abs(a.x - ptlFrom.x) <= 1 &&
      Math.abs(a.y - ptlFrom.y) <= 1 &&
      Math.abs(b.x - ptlTo.x) <= 1 &&
      Math.abs(b.y - ptlTo.y) <= 1
    );
  });
  expect(ptl).toBeDefined();
  expect(view.tracks.get(jet.id)!.lastReport!.xNm).toBe(0);
  expect(jet.xNm).toBe(8);
});

test("AC3 — out-of-coverage single-site does not paint", () => {
  const apt = site({ id: "APT", xNm: 0, yNm: 0, rangeNm: 10, periodMs: 4800 });
  const jet = makeTestAircraft({
    id: "ac-out",
    callsign: "AAL9",
    xNm: 40,
    yNm: 0,
    headingDeg: 90,
    speedKt: 180,
    altitudeFt: 8000,
  });
  const world = createWorld({ aircraft: [jet], simTimeMs: 0 });
  const view = createScopeView(0, 0, { radarSites: [apt], surveillanceMode: { siteId: "APT" } });
  const { ctx, fillTexts } = mockRenderCtx();
  renderScope(ctx, world, view, 800, 800);
  expect(view.tracks.get(jet.id)!.lastReport).toBeUndefined();
  expect(fillTexts.some((t) => t.text === "AAL9")).toBe(false);
});

test("AC6 — sync records history on FUSED reports, not every physics step", () => {
  const jet = makeTestAircraft({ id: "ac-hist-sync", xNm: 0, yNm: 0, headingDeg: 90 });
  const world = createWorld({ aircraft: [jet], simTimeMs: 0 });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  expect(tracks.get(jet.id)!.history.timesSimMs).toEqual([0]);
  stepWorld(world, 1 / 20);
  syncTrackDisplays(tracks, world);
  expect(tracks.get(jet.id)!.history.timesSimMs).toEqual([0]);
  world.simTimeMs = 1000;
  syncTrackDisplays(tracks, world);
  expect(tracks.get(jet.id)!.history.timesSimMs).toEqual([0, 1000]);
});
