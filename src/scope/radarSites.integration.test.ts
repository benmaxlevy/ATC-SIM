/**
 * T02-77: authored radarSites through scenario load → SITE DCB → SSA →
 * sampled paint. Generic synthetic sites prove FUSED / MULTI / single-site.
 * KDEM / KATL appear only as playable-scenario smoke (no production map
 * counts or geometry). Analog: CRC SITE (R07), FOA display data (R05),
 * JO 7110.65 radar identification (R01). Trainer fixtures; no live sensors,
 * no 30 s coast, no aural ATPA.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { isImplicitFusedSurveillance, loadPlayableScenario, type RadarSite } from "@scenario";
import { DisplayControlBar } from "../ui/DisplayControlBar";
import { applyRadarSites, createScopeView, setSurveillanceMode } from "./scopeView";
import { renderScope } from "./renderScope";
import { buildSsaLines, SSA_NETWORK_HEALTH_STUB } from "./ssa";
import {
  FUSED_PERIOD_MS,
  MULTI_RECT_COLOR,
  SITE_SLASH_COLOR,
  effectiveSurveillanceMode,
  formatDcbSiteLabel,
  nearestCoveringSite,
  reportPeriodMs,
  siteDcbChoices,
  surveillanceModeWord,
  surveillancePaintFor,
} from "./surveillance";
import { syncTrackDisplays } from "./trackDisplay";

function syntheticSite(partial: Partial<RadarSite> & Pick<RadarSite, "id">): RadarSite {
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

function dcbHtml(view: ReturnType<typeof createScopeView>): string {
  return renderToStaticMarkup(
    createElement(DisplayControlBar, { view, onChange: () => undefined }),
  );
}

function ssaStatus(view: ReturnType<typeof createScopeView>): string {
  const word = surveillanceModeWord(
    effectiveSurveillanceMode(view.surveillanceMode, view.radarSites),
  );
  return buildSsaLines({
    simTimeMs: 0,
    rangeNm: view.camera.rangeNm,
    offCenter: false,
    filter: view.altitudeFilter,
    filterEntry: view.filterEntry,
    systemStatus: SSA_NETWORK_HEALTH_STUB,
    surveillanceMode: word,
  }).find((line) => line.includes(SSA_NETWORK_HEALTH_STUB))!;
}

/** Operator path: SITE submenu click binds the same setSurveillanceMode DCB uses. */
function chooseSite(
  view: ReturnType<typeof createScopeView>,
  mode: Parameters<typeof setSurveillanceMode>[1],
): void {
  setSurveillanceMode(view, mode);
}

function mockRenderCtx(): {
  ctx: CanvasRenderingContext2D;
  fills: string[];
  strokes: string[];
} {
  const fills: string[] = [];
  const strokes: string[] = [];
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
    beginPath() {},
    closePath() {},
    arc() {},
    clip() {},
    rect() {},
    stroke() {
      strokes.push(String(this.strokeStyle));
    },
    fill() {
      fills.push(String(this.fillStyle));
    },
    moveTo() {},
    lineTo() {},
    fillText() {},
    measureText(text: string) {
      return { width: text.length * 7.2 };
    },
    strokeRect() {},
    setLineDash() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, strokes };
}

test("AC1 — playable KDEM and KATL bind authored radarSites with no airport-id branch", () => {
  for (const id of ["kdem", "katl"] as const) {
    const scenario = loadPlayableScenario(id);
    const view = createScopeView(scenario.arpNm.xNm, scenario.arpNm.yNm, {
      radarSites: scenario.radarSites,
    });
    expect(isImplicitFusedSurveillance(scenario.radarSites)).toBe(false);
    expect(view.radarSites).toHaveLength(scenario.radarSites.length);
    expect(view.radarSites.some((row) => row.kind === "airport")).toBe(true);
    expect(view.radarSites.some((row) => row.kind === "asr")).toBe(true);
    expect(siteDcbChoices(view.radarSites)[0]).toBe("FUSED");
    expect(siteDcbChoices(view.radarSites)[1]).toBe("MULTI");
    expect(view.surveillanceMode).toBe("FUSED");
  }

  const boot = import.meta.glob("../main.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = import.meta.glob("../ui/shell.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const viewSrc = import.meta.glob("./scopeView.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const live = `${boot["../main.tsx"]}\n${shell["../ui/shell.tsx"]}\n${viewSrc["./scopeView.ts"]}`;
  expect(live).toMatch(/radarSites: scenario\.radarSites/);
  expect(live).toMatch(/applyRadarSites\(scopeView, nextScenario\.radarSites\)/);
  expect(live).toMatch(/R01/);
  expect(live).toMatch(/R05/);
  expect(live).toMatch(/R07/);
  expect(live).not.toMatch(/icao\s*===\s*["']KATL["']/);
  expect(live).not.toMatch(/icao\s*===\s*["']KDEM["']/);
  expect(live).not.toMatch(/if\s*\(\s*icao/);
});

test("AC2 — FUSED to airport site changes period, coverage, and paint", () => {
  const apt = syntheticSite({
    id: "APT",
    kind: "airport",
    xNm: 0,
    yNm: 0,
    rangeNm: 12,
    periodMs: 4800,
  });
  const remote = syntheticSite({
    id: "REMOTE",
    kind: "asr",
    xNm: 40,
    yNm: 0,
    rangeNm: 12,
    periodMs: 4800,
  });
  const view = createScopeView(0, 0, { radarSites: [apt, remote] });
  const inside = makeTestAircraft({ id: "ac-in", callsign: "TST1", xNm: 2, yNm: 0 });
  const remoteOnly = makeTestAircraft({ id: "ac-out", callsign: "TST2", xNm: 40, yNm: 0 });
  const world = createWorld({ aircraft: [inside, remoteOnly], simTimeMs: 0 });

  expect(reportPeriodMs("FUSED", view.radarSites, 2, 0)).toBe(FUSED_PERIOD_MS);
  expect(surveillancePaintFor(view.surveillanceMode, view.radarSites)).toBe("fused-puck");
  syncTrackDisplays(view.tracks, world, { mode: view.surveillanceMode, sites: view.radarSites });
  expect(view.tracks.get("ac-in")!.lastReport!.paint).toBe("fused-puck");
  expect(view.tracks.get("ac-out")!.lastReport!.paint).toBe("fused-puck");

  chooseSite(view, { siteId: "APT" });
  expect(reportPeriodMs(view.surveillanceMode, view.radarSites, 2, 0)).toBe(4800);
  expect(surveillancePaintFor(view.surveillanceMode, view.radarSites)).toBe("site-slash");
  syncTrackDisplays(view.tracks, world, { mode: view.surveillanceMode, sites: view.radarSites });
  expect(view.tracks.get("ac-in")!.lastReport!.paint).toBe("site-slash");
  expect(view.tracks.get("ac-in")!.lastReport!.sourceSiteId).toBe("APT");
  expect(view.tracks.get("ac-out")!.lastReport).toBeUndefined();
});

test("AC3 — MULTI selects nearest covering site and paints the thick blue rect", () => {
  const near = syntheticSite({ id: "NEAR", xNm: 0, yNm: 0, rangeNm: 20, periodMs: 4800 });
  const far = syntheticSite({ id: "FAR", xNm: 18, yNm: 0, rangeNm: 20, periodMs: 2400 });
  const view = createScopeView(0, 0, { radarSites: [near, far] });
  chooseSite(view, "MULTI");
  expect(nearestCoveringSite(view.radarSites, 2, 0)?.id).toBe("NEAR");
  expect(reportPeriodMs("MULTI", view.radarSites, 2, 0)).toBe(4800);

  const jet = makeTestAircraft({
    id: "ac-multi",
    callsign: "MLT1",
    xNm: 2,
    yNm: 0,
    headingDeg: 90,
  });
  const world = createWorld({ aircraft: [jet], simTimeMs: 0 });
  const { ctx, fills } = mockRenderCtx();
  renderScope(ctx, world, view, 800, 800);
  expect(view.tracks.get("ac-multi")!.lastReport!.paint).toBe("multi-rect");
  expect(view.tracks.get("ac-multi")!.lastReport!.sourceSiteId).toBe("NEAR");
  expect(fills).toContain(MULTI_RECT_COLOR);
});

test("AC4 — single-site paints a thin green slash and no blue block", () => {
  const apt = syntheticSite({ id: "APT", kind: "airport", xNm: 8, yNm: 0, rangeNm: 30 });
  const view = createScopeView(0, 0, { radarSites: [apt] });
  chooseSite(view, { siteId: "APT" });
  const jet = makeTestAircraft({
    id: "ac-site",
    callsign: "SIT1",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
  });
  const world = createWorld({ aircraft: [jet], simTimeMs: 0 });
  const { ctx, fills, strokes } = mockRenderCtx();
  renderScope(ctx, world, view, 800, 800);
  expect(view.tracks.get("ac-site")!.lastReport!.paint).toBe("site-slash");
  expect(strokes).toContain(SITE_SLASH_COLOR);
  expect(fills).not.toContain(MULTI_RECT_COLOR);
});

test("AC5 — MAIN SITE and SSA word stay in sync; OK/OK/NA stays the stub", () => {
  const sites = [syntheticSite({ id: "ASR-N" }), syntheticSite({ id: "ASR-S", xNm: 10 })];
  const view = createScopeView(0, 0, { radarSites: sites });
  expect(dcbHtml(view)).toMatch(/aria-label="SITE FUSED"/);
  expect(ssaStatus(view)).toBe("OK/OK/NA FUSED");

  chooseSite(view, "MULTI");
  expect(formatDcbSiteLabel(view.surveillanceMode)).toBe("SITE MULTI");
  expect(dcbHtml(view)).toMatch(/aria-label="SITE MULTI"/);
  expect(ssaStatus(view)).toBe("OK/OK/NA MULTI");

  chooseSite(view, { siteId: "ASR-N" });
  expect(dcbHtml(view)).toMatch(/aria-label="SITE ASR-N"/);
  expect(ssaStatus(view)).toBe("OK/OK/NA ASR-N");
  expect(ssaStatus(view).startsWith(SSA_NETWORK_HEALTH_STUB)).toBe(true);
  expect(ssaStatus(view)).not.toMatch(/NA\/NA\/NA/);
});

test("AC6 — persisted SITE id missing from the next scenario falls back to FUSED", () => {
  const first = [syntheticSite({ id: "ASR-N" })];
  const view = createScopeView(0, 0, { radarSites: first, surveillanceMode: { siteId: "ASR-N" } });
  expect(view.surveillanceMode).toEqual({ siteId: "ASR-N" });
  applyRadarSites(view, [syntheticSite({ id: "ASR-S", xNm: 12 })]);
  expect(view.surveillanceMode).toBe("FUSED");
  expect(formatDcbSiteLabel(view.surveillanceMode)).toBe("SITE FUSED");
  expect(ssaStatus(view)).toBe("OK/OK/NA FUSED");
});
