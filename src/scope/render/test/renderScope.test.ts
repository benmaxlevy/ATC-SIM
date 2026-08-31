import { expect, test } from "vitest";
import { SessionLog, SIM_DT_S, createWorld, handoffFor, makeTestAircraft, stepWorld } from "@core";
import { applyIntent } from "@pilot";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { nmToScreen } from "../../camera";
import { parseDigitalMap } from "../../mapLayers";
import { PALETTE } from "../../palette";
import { PTL_MINUTES, ptlEndpoint } from "../../ptl";
import { renderScope } from "../renderScope";
import { createScopeView } from "../../scopeView";
import { SELECTED_ACCENT_COLOR } from "../targetSymbol";
import { deriveScratchpads, isIdentFlashing, syncTrackDisplays } from "../../trackDisplay";
import { DATABLOCK_FONT } from "../../fonts";
import { formatPartialDatablock } from "../../datablock";
import { createMockCtx, type MockPathStroke } from "../../test/mockCanvas";

function symbolCount(fillTexts: { text: string }[]): number {
  return fillTexts.filter((t) => ["*", "V", "D", "G", "T", "C"].includes(t.text)).length;
}

function findPtlStroke(
  pathStrokes: MockPathStroke[],
  ac: { xNm: number; yNm: number; headingDeg: number; speedKt: number },
  view: ReturnType<typeof createScopeView>,
  css: number,
): MockPathStroke | undefined {
  const size = { widthPx: css, heightPx: css };
  const end = ptlEndpoint(ac.xNm, ac.yNm, ac.headingDeg, ac.speedKt, PTL_MINUTES);
  const from = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
  const to = nmToScreen(end.eastNm, end.northNm, view.camera, size);
  return pathStrokes.find((stroke) => {
    const a = stroke.points[0];
    const b = stroke.points[1];
    if (!a || !b || stroke.points.length !== 2) {
      return false;
    }
    return (
      Math.abs(a.x - from.x) <= 1 &&
      Math.abs(a.y - from.y) <= 1 &&
      Math.abs(b.x - to.x) <= 1 &&
      Math.abs(b.y - to.y) <= 1 &&
      stroke.lineWidth === 1
    );
  });
}

test("spawned arrivals paint position symbols and datablocks", () => {
  const world = createWorldFromScenario(loadKdem());
  expect(world.aircraft).toHaveLength(6);
  const view = createScopeView();
  const { ctx, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, 800, 800);
  expect(symbolCount(fillTexts)).toBe(6);
  const size = { widthPx: 800, heightPx: 800 };
  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    const derived = deriveScratchpads(ac, td);
    const handoff = handoffFor(world, ac.id);
    const block = formatPartialDatablock(ac, {
      sp1: derived.sp1,
      handoffSectorId: handoff.kind === "inbound" ? handoff.fromSectorId : undefined,
    });
    expect(fillTexts.some((t) => t.text === block.line1 && t.font === DATABLOCK_FONT)).toBe(true);
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    expect(p.x).toBeGreaterThan(0);
  }
});

test("history dots sit behind an eastbound track after 30 s", () => {
  const ac = makeTestAircraft({
    id: "ac-east",
    headingDeg: 90,
    speedKt: 220,
    xNm: 0,
    yNm: 0,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  const { ctx } = createMockCtx();
  const steps = Math.round(30 / SIM_DT_S);
  for (let i = 0; i <= steps; i += 1) {
    renderScope(ctx, world, view, 800, 800);
    if (i < steps) {
      stepWorld(world, SIM_DT_S);
    }
  }
  const td = view.tracks.get(ac.id);
  expect(td!.history.eastNm).toHaveLength(5);
  expect(td!.history.eastNm[0]).toBeLessThan(ac.xNm);
});

test("IDENT stroke is yellow at 1 s and gone by 3 s", () => {
  const ac = makeTestAircraft({ id: "ac-ident-draw", xNm: 0, yNm: 0, headingDeg: 90 });
  const world = createWorld({ aircraft: [ac], simTimeMs: 0 });
  const view = createScopeView();
  applyIntent(ac, [{ type: "IDENT" }], 0);
  world.simTimeMs = 1000;
  const at1s = createMockCtx();
  renderScope(at1s.ctx, world, view, 800, 800);
  expect(isIdentFlashing(view.tracks.get(ac.id)!, 1000)).toBe(true);
  expect(
    at1s.fillTexts.filter((t) => t.text === "*" && t.fillStyle === SELECTED_ACCENT_COLOR),
  ).not.toHaveLength(0);

  world.simTimeMs = 3000;
  const at3s = createMockCtx();
  renderScope(at3s.ctx, world, view, 800, 800);
  expect(isIdentFlashing(view.tracks.get(ac.id)!, 3000)).toBe(false);
  expect(
    at3s.fillTexts.filter((t) => t.text === "*" && t.fillStyle === SELECTED_ACCENT_COLOR),
  ).toHaveLength(0);
});

test("drawing the PPI does not emit Command IR", () => {
  const world = createWorld({ aircraft: [makeTestAircraft({ id: "ac-ir", callsign: "DAL123" })] });
  const log = new SessionLog();
  renderScope(createMockCtx().ctx, world, createScopeView(), 800, 800);
  expect(log.byType("command.accepted")).toHaveLength(0);
});

test("map cache rebuilds on camera change, not each physics step", () => {
  const view = createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
  const ctx = createMockCtx().ctx;
  const world = createWorld();
  renderScope(ctx, world, view, 800, 800);
  const first = view.mapCache;
  expect(first?.runway).not.toBeNull();
  stepWorld(world, SIM_DT_S);
  renderScope(ctx, world, view, 800, 800);
  expect(view.mapCache).toBe(first);
  view.camera.rangeNm = 10;
  renderScope(ctx, world, view, 800, 800);
  expect(view.mapCache).not.toBe(first);
});

test("showLocalizer off drops the feather and keeps the runway", () => {
  const view = createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
  const ctx = createMockCtx().ctx;
  const world = createWorld();
  renderScope(ctx, world, view, 800, 800);
  const runway = view.mapCache?.runway;
  view.showLocalizer = false;
  renderScope(ctx, world, view, 800, 800);
  expect(view.mapCache?.localizer).toBeNull();
  expect(view.mapCache?.runway).toEqual(runway);
});

test("PTL is off by default; enabling draws a 1 min line", () => {
  const ac = makeTestAircraft({
    id: "ac-ptl",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    speedKt: 180,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  const off = createMockCtx();
  renderScope(off.ctx, world, view, 800, 800);
  expect(view.ptlOn).toBe(false);
  expect(findPtlStroke(off.pathStrokes, ac, view, 800)).toBeUndefined();
  view.ptlOn = true;
  const on = createMockCtx();
  renderScope(on.ctx, world, view, 800, 800);
  const ptl = findPtlStroke(on.pathStrokes, ac, view, 800);
  expect(ptl?.strokeStyle).toBe(PALETTE.ptl);
});

test("altitude filter keeps the target and drops the datablock", () => {
  const low = makeTestAircraft({
    id: "ac-low",
    callsign: "UAL60",
    altitudeFt: 6000,
    speedKt: 210,
    xNm: -4,
    yNm: 0,
    headingDeg: 90,
  });
  const inBand = makeTestAircraft({
    id: "ac-in",
    callsign: "DAL80",
    altitudeFt: 8000,
    speedKt: 220,
    xNm: 4,
    yNm: 0,
    headingDeg: 90,
  });
  const world = createWorld({ aircraft: [low, inBand] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(inBand.id)!.datablockMode = "full";
  view.altitudeFilter = { minHundreds: 70, maxHundreds: 90 };
  const { ctx, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, 800, 800);
  expect(symbolCount(fillTexts)).toBe(2);
  expect(fillTexts.some((t) => t.text === "UAL60")).toBe(false);
  expect(fillTexts.some((t) => t.text === "DAL80")).toBe(true);
});
