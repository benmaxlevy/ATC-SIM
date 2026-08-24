import { expect, test } from "vitest";
import { SessionLog, SIM_DT_S, createWorld, handoffFor, makeTestAircraft, stepWorld } from "@core";
import { applyIntent } from "@pilot";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { formatRangeReadout, nmToScreen } from "./camera";
import { parseDigitalMap } from "./mapLayers";
import { PALETTE, applyBrite } from "./palette";
import { PTL_MINUTES, ptlEndpoint, shouldDrawPtl } from "./ptl";
import { handlePpiLeftClick } from "./ppiPointer";
import { renderScope } from "./renderScope";
import {
  hideMapLists,
  stepBriteChannel,
  stepCharSizeChannel,
  toggleCurrentMapsList,
  toggleGeoMapsList,
} from "./dcbFunctions";
import { createScopeView, toggleSsaFilter } from "./scopeView";
import { formatFilterReadout } from "./altitudeFilter";
import { buildSsaLines, formatSsaTime } from "./ssa";
import {
  POSITION_SYMBOL_COLOR,
  SELECTED_ACCENT_COLOR,
  SELECTION_BOX_PAD_PX,
  TARGET_SIZE_PX,
  HISTORY_DOT_SIZE_PX,
  OWNERSHIP_STUB_FONT,
  isTargetDiamondPath,
} from "./targetSymbol";
import { isIdentFlashing, setScratchpad, syncTrackDisplays } from "./trackDisplay";
import { DATABLOCK_FONT, DATABLOCK_FONT_PX } from "./fonts";
import {
  formatFullDatablock,
  formatLimitedDatablock,
  datablockMetrics,
  withInboundHandoffCue,
} from "./datablock";
import { datablockTopLeft, DEFAULT_LEADER_DIR, leaderSegmentPx } from "./leader";

interface StrokeRect {
  x: number;
  y: number;
  w: number;
  h: number;
  strokeStyle: string;
}

interface FillRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PathStroke {
  points: { x: number; y: number }[];
  strokeStyle: string;
  lineWidth: number;
}

function mockCtx(): CanvasRenderingContext2D {
  return createMockCtx().ctx;
}

function createMockCtx(): {
  ctx: CanvasRenderingContext2D;
  strokeRects: StrokeRect[];
  fillRects: FillRect[];
  fillTexts: {
    text: string;
    font: string;
    x?: number;
    y?: number;
    fillStyle?: string;
    textAlign?: string;
    textBaseline?: string;
  }[];
  pathStrokes: PathStroke[];
} {
  const strokeRects: StrokeRect[] = [];
  const fillRects: FillRect[] = [];
  const fillTexts: {
    text: string;
    font: string;
    x?: number;
    y?: number;
    fillStyle?: string;
    textAlign?: string;
    textBaseline?: string;
  }[] = [];
  const pathStrokes: PathStroke[] = [];
  let currentPath: { x: number; y: number }[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textBaseline: "alphabetic",
    textAlign: "start",
    fillRect(this: { fillStyle: string }, x: number, y: number, w: number, h: number) {
      fillRects.push({ x, y, w, h });
    },
    save() {},
    restore() {},
    beginPath() {
      currentPath = [];
    },
    closePath() {},
    arc() {},
    clip() {},
    stroke(this: { strokeStyle: string; lineWidth: number }) {
      if (currentPath.length >= 2) {
        pathStrokes.push({
          points: currentPath.slice(),
          strokeStyle: String(this.strokeStyle),
          lineWidth: this.lineWidth,
        });
      }
    },
    fill() {},
    moveTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    lineTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    setTransform() {},
    strokeRect(this: { strokeStyle: string }, x: number, y: number, w: number, h: number) {
      strokeRects.push({ x, y, w, h, strokeStyle: String(this.strokeStyle) });
    },
    measureText(text: string) {
      return { width: Math.max(0, text.length) * 7.2 };
    },
    fillText(
      this: { font: string; fillStyle: string; textAlign: string; textBaseline: string },
      text: string,
      x?: number,
      y?: number,
    ) {
      fillTexts.push({
        text,
        font: this.font,
        x,
        y,
        fillStyle: String(this.fillStyle),
        textAlign: this.textAlign,
        textBaseline: this.textBaseline,
      });
    },
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    strokeRects,
    fillRects,
    fillTexts,
    pathStrokes,
  };
}

function findTargetDiamonds(pathStrokes: PathStroke[], cx?: number, cy?: number): PathStroke[] {
  return pathStrokes.filter((s) => {
    if (s.points.length < 4) {
      return false;
    }
    if (cx != null && cy != null) {
      return isTargetDiamondPath(s.points, cx, cy);
    }
    const pts = s.points.slice(0, 4);
    const cx0 = pts.reduce((sum, p) => sum + p.x, 0) / 4;
    const cy0 = pts.reduce((sum, p) => sum + p.y, 0) / 4;
    return isTargetDiamondPath(s.points, cx0, cy0, 0.5);
  });
}

test("AC1 — six spawned arrivals get an 8 px diamond at nmToScreen ±2 px", () => {
  const world = createWorldFromScenario(loadKdem());
  expect(world.aircraft).toHaveLength(6);
  const view = createScopeView();
  const { ctx, pathStrokes, fillTexts } = createMockCtx();
  const css = 800;
  renderScope(ctx, world, view, css, css);
  const targets = findTargetDiamonds(pathStrokes);
  expect(targets).toHaveLength(6);
  expect(TARGET_SIZE_PX).toBeGreaterThanOrEqual(6);
  expect(fillTexts.filter((t) => t.text === "*" && t.font === OWNERSHIP_STUB_FONT)).toHaveLength(6);
  const size = { widthPx: css, heightPx: css };
  for (const ac of world.aircraft) {
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const hit = findTargetDiamonds(pathStrokes, p.x, p.y)[0];
    expect(hit, ac.callsign).toBeDefined();
    const stub = fillTexts.find((t) => t.text === "*" && t.font === OWNERSHIP_STUB_FONT);
    expect(stub, `${ac.callsign} CSI stub`).toBeDefined();
    const block = formatFullDatablock(ac);
    const expectedLine1 = withInboundHandoffCue(ac.callsign, handoffFor(world, ac.id));
    const line1 = fillTexts.filter((t) => t.text === expectedLine1 && t.font === DATABLOCK_FONT);
    expect(line1, ac.callsign).toHaveLength(1);
    expect(
      fillTexts.some((t) => t.text === block.line2 && t.font === DATABLOCK_FONT),
      ac.callsign,
    ).toBe(true);
    expect(block.line3, ac.callsign).toBeDefined();
    expect(
      fillTexts.some((t) => t.text === block.line3 && t.font === DATABLOCK_FONT),
      ac.callsign,
    ).toBe(true);
  }
});

test("AC2 — after 30 s eastbound at 1x, history dots sit behind the current position", () => {
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
  expect(td).toBeDefined();
  expect(td!.history.eastNm.length).toBe(5);
  expect(td!.history.eastNm[0]).toBeLessThan(ac.xNm);
  for (const east of td!.history.eastNm) {
    expect(east).toBeLessThanOrEqual(ac.xNm + 1e-9);
  }
  expect(td!.history.northNm.every((n) => Math.abs(n) < 0.05)).toBe(true);
});

test("AC6 — IDENT stroke is yellow within 1 s and reverts by 3 s with one apply", () => {
  const ac = makeTestAircraft({ id: "ac-ident-draw", xNm: 0, yNm: 0, headingDeg: 90 });
  const world = createWorld({ aircraft: [ac], simTimeMs: 0 });
  const view = createScopeView();
  applyIntent(ac, [{ type: "IDENT" }], 0);
  const at1s = createMockCtx();
  world.simTimeMs = 1000;
  renderScope(at1s.ctx, world, view, 800, 800);
  expect(isIdentFlashing(view.tracks.get(ac.id)!, 1000)).toBe(true);
  const yellow = findTargetDiamonds(at1s.pathStrokes).filter(
    (s) => s.strokeStyle === SELECTED_ACCENT_COLOR,
  );
  expect(yellow.length).toBeGreaterThanOrEqual(1);

  const at3s = createMockCtx();
  world.simTimeMs = 3000;
  renderScope(at3s.ctx, world, view, 800, 800);
  expect(isIdentFlashing(view.tracks.get(ac.id)!, 3000)).toBe(false);
  const stillYellow = findTargetDiamonds(at3s.pathStrokes).filter(
    (s) => s.strokeStyle === SELECTED_ACCENT_COLOR,
  );
  expect(stillYellow).toHaveLength(0);
});

test("AC5 — drawing the PPI does not emit Command IR", () => {
  const ac = makeTestAircraft({ id: "ac-ir", callsign: "DAL123" });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  const log = new SessionLog();
  renderScope(createMockCtx().ctx, world, view, 800, 800);
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(log.byType("command.rejected")).toHaveLength(0);
  const sources = import.meta.glob("./{targetSymbol,history,renderScope,ownership}.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  for (const [path, src] of Object.entries(sources)) {
    expect(String(src), path).not.toMatch(/handleRadioText|parseCommand|command\.accepted/);
  }
});

test("AC8 — scope comments/UI say target and history, not sprite or trail names", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  expect(formatRangeReadout(20).toLowerCase()).not.toContain("zoom");
  expect(sources["./ppi-placeholder.tsx"]).toMatch(/aria-label="PPI"/);
  expect(sources["./history.ts"]).toMatch(/CRC STARS HISTORY/);
  expect(sources["./targetSymbol.ts"]).toMatch(/target/);
  expect(sources["./targetSymbol.ts"]).toMatch(/diamond/);
  expect(sources["./targetSymbol.ts"]).not.toMatch(/airplane sprite/);
  expect(sources["./renderScope.ts"]).toMatch(/history/);
  expect(sources["./renderScope.ts"]).toMatch(/Not an airplane/);
  const uiBits = [sources["./ppi-placeholder.tsx"] ?? "", formatRangeReadout(20)];
  for (const text of uiBits) {
    expect(text.toLowerCase()).not.toMatch(/aria-label="[^"]*(sprite|trail)/);
  }
});

test("AC9 — user-facing scope strings never contain zoom", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const userFacing = [
    formatRangeReadout(20),
    formatRangeReadout(5),
    formatRangeReadout(60),
    sources["./ppi-placeholder.tsx"] ?? "",
  ];
  for (const text of userFacing) {
    expect(text.toLowerCase()).not.toMatch(/aria-label="[^"]*zoom/);
    expect(formatRangeReadout(20).toLowerCase()).not.toContain("zoom");
  }
  expect(sources["./ppi-placeholder.tsx"]).toMatch(/aria-label="PPI"/);
  expect(sources["./camera.ts"]).toMatch(/R07/);
  expect(sources["./camera.ts"]).toMatch(/6\/8\/12\/16\/24/);
  expect(sources["./camera.ts"]).toMatch(/not CRC/);
});

test("AC8 — map / localizer / rings wording; no terrain or OSM in settings copy", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  expect(sources["./mapLayers.ts"]).toMatch(/video maps/i);
  expect(sources["./mapLayers.ts"]).toMatch(/trainer-authored JSON/i);
  expect(sources["./mapLayers.ts"]).toMatch(/R07/);
  expect(sources["./palette.ts"]).toMatch(/#8C8C8C/);
  expect(sources["./palette.ts"]).toMatch(/#606060/);
  expect(PALETTE.map).toBe("#8C8C8C");
  expect(PALETTE.mapDim).toBe("#606060");
  expect(PALETTE.background).toBe("#000000");

  const forbiddenUi = [formatRangeReadout(20), sources["./ppi-placeholder.tsx"] ?? ""];
  for (const text of forbiddenUi) {
    expect(text.toLowerCase()).not.toMatch(/terrain/);
    expect(text.toLowerCase()).not.toMatch(/openstreetmap/);
    expect(text).not.toMatch(/\bOSM\b/);
  }
  expect(sources["./scopeView.ts"]).toMatch(/showLocalizer/);
  expect(sources["./scopeView.ts"]).toMatch(/showRings/);
  expect(sources["./scopeView.ts"]).not.toMatch(/showTerrain/);
});

test("AC7 — renderScope rebuilds map cache on camera change, not each physics step", () => {
  const view = createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
  const ctx = mockCtx();
  const world = createWorld();
  renderScope(ctx, world, view, 800, 800);
  const first = view.mapCache;
  expect(first).not.toBeNull();
  expect(first?.localizer).toHaveLength(3);
  expect(first?.runway).not.toBeNull();

  stepWorld(world, SIM_DT_S);
  renderScope(ctx, world, view, 800, 800);
  expect(view.mapCache).toBe(first);

  view.camera.rangeNm = 10;
  renderScope(ctx, world, view, 800, 800);
  expect(view.mapCache).not.toBe(first);
  expect(view.mapCache?.ringRadiiNm).toEqual([5, 10]);
});

test("AC5 — toggling showLocalizer off removes the feather and keeps the runway", () => {
  const view = createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
  const ctx = mockCtx();
  const world = createWorld();
  renderScope(ctx, world, view, 800, 800);
  const runway = view.mapCache?.runway;
  expect(view.mapCache?.localizer).not.toBeNull();
  expect(runway).not.toBeNull();

  view.showLocalizer = false;
  renderScope(ctx, world, view, 800, 800);
  expect(view.mapCache?.localizer).toBeNull();
  expect(view.mapCache?.runway).toEqual(runway);
});

test("T02-04 AC2 — full datablock is callsign + hundreds/GS in IBM Plex Mono, left/top, unowned fill", () => {
  const ac = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3000,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  const { ctx, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, 800, 800);
  const p = nmToScreen(ac.xNm, ac.yNm, view.camera, { widthPx: 800, heightPx: 800 });
  const line1 = fillTexts.find((t) => t.text === "DAL123" && t.font === DATABLOCK_FONT);
  const line2 = fillTexts.find((t) => t.text === "030  210" && t.font === DATABLOCK_FONT);
  expect(line1).toBeDefined();
  expect(line2).toBeDefined();
  expect(DATABLOCK_FONT).toContain("IBM Plex Mono");
  expect(DATABLOCK_FONT).toContain("monospace");
  expect(DATABLOCK_FONT).toContain(`${DATABLOCK_FONT_PX}px`);
  expect(DATABLOCK_FONT.toLowerCase()).not.toMatch(/arial|helvetica|sans-serif/);
  expect(line1!.textAlign).toBe("left");
  expect(line1!.textBaseline).toBe("top");
  expect(line1!.fillStyle).toBe(PALETTE.unowned);
  const block = formatFullDatablock(ac);
  const metrics = datablockMetrics(block, 7.2, DATABLOCK_FONT_PX);
  const origin = datablockTopLeft(DEFAULT_LEADER_DIR, metrics);
  expect(line1!.x).toBeCloseTo(p.x + origin.x, 5);
  expect(line1!.y).toBeCloseTo(p.y + origin.y, 5);
  expect(line2!.y).toBeCloseTo(p.y + origin.y + DATABLOCK_FONT_PX, 5);
});

test("T02-19 — full datablock paints type on line 3 and scratchpad on line 2 tail", () => {
  const ac = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3000,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
    aircraftType: "B738",
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  const first = createMockCtx();
  renderScope(first.ctx, world, view, 800, 800);
  setScratchpad(view.tracks, ac.id, "abcd");
  const { ctx, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, 800, 800);
  const line2 = fillTexts.find((t) => t.text === "030  210  ABCD" && t.font === DATABLOCK_FONT);
  const line3 = fillTexts.find((t) => t.text === "B738" && t.font === DATABLOCK_FONT);
  expect(line2).toBeDefined();
  expect(line3).toBeDefined();
  if (!line2 || !line3) {
    throw new Error("expected FDB line 2 scratchpad tail and line 3 type");
  }
  expect(line3.y!).toBeCloseTo(line2.y! + DATABLOCK_FONT_PX, 5);
  expect(ac.intent.assignedAltitudeFt).toBe(3000);
  expect(view.tracks.get(ac.id)!.scratchpad).toBe("ABCD");
});

test("T02-04 AC5/AC7 — T limited drops the callsign; no duplicate callsign paint", () => {
  const ac = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3250,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
    aircraftType: "B738",
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  const full = createMockCtx();
  renderScope(full.ctx, world, view, 800, 800);
  expect(full.fillTexts.filter((t) => t.text === "DAL123")).toHaveLength(1);
  expect(full.fillTexts.some((t) => t.font.startsWith("10px"))).toBe(false);

  view.tracks.get(ac.id)!.datablockMode = "limited";
  const limited = createMockCtx();
  renderScope(limited.ctx, world, view, 800, 800);
  expect(limited.fillTexts.filter((t) => t.text === "DAL123")).toHaveLength(0);
  expect(limited.fillTexts.some((t) => t.text === formatLimitedDatablock(ac).line1)).toBe(true);
  expect(limited.fillTexts.some((t) => t.text === "030  210")).toBe(false);
  expect(limited.fillTexts.some((t) => t.text === "B738")).toBe(false);
});

test("T02-04 AC5 — M hides Mode C on full blocks; limited still paints Mode C hundreds", () => {
  const ac = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3200,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
  });
  ac.intent.assignedAltitudeFt = 4000;
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  view.modeCVisible = false;
  const full = createMockCtx();
  renderScope(full.ctx, world, view, 800, 800);
  expect(full.fillTexts.some((t) => t.text === "040  210")).toBe(true);
  expect(full.fillTexts.some((t) => t.text === "032  040  210")).toBe(false);

  view.tracks.get(ac.id)!.datablockMode = "limited";
  const limited = createMockCtx();
  renderScope(limited.ctx, world, view, 800, 800);
  expect(limited.fillTexts.some((t) => t.text === "032")).toBe(true);
});

function findPtlStroke(
  pathStrokes: PathStroke[],
  ac: { xNm: number; yNm: number; headingDeg: number; speedKt: number },
  view: ReturnType<typeof createScopeView>,
  css: number,
): PathStroke | undefined {
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

test("AC4 — PTL is off by default; F7 on draws a ~1 min line per unfiltered track", () => {
  const ac = makeTestAircraft({
    id: "ac-ptl",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    speedKt: 180,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  const css = 800;
  const off = createMockCtx();
  renderScope(off.ctx, world, view, css, css);
  expect(view.ptlOn).toBe(false);
  expect(findPtlStroke(off.pathStrokes, ac, view, css)).toBeUndefined();
  const targetsOff = findTargetDiamonds(off.pathStrokes);
  expect(targetsOff).toHaveLength(1);

  view.ptlOn = true;
  const on = createMockCtx();
  renderScope(on.ctx, world, view, css, css);
  const ptl = findPtlStroke(on.pathStrokes, ac, view, css);
  expect(ptl).toBeDefined();
  expect(ptl!.strokeStyle).toBe(PALETTE.ptl);
  expect(ptl!.lineWidth).toBe(1);
  const targetsOn = findTargetDiamonds(on.pathStrokes);
  expect(targetsOn).toHaveLength(1);

  const traffic = createWorldFromScenario(loadKdem());
  const trafficView = createScopeView();
  trafficView.ptlOn = true;
  const allOn = createMockCtx();
  renderScope(allOn.ctx, traffic, trafficView, css, css);
  expect(traffic.aircraft.length).toBeGreaterThan(1);
  for (const track of traffic.aircraft) {
    expect(findPtlStroke(allOn.pathStrokes, track, trafficView, css), track.callsign).toBeDefined();
  }
});

test("AC5 — altitude filter suppresses PTL; target symbol remains", () => {
  expect(shouldDrawPtl(180, true)).toBe(false);
  const ac = makeTestAircraft({
    id: "ac-filter-ptl",
    callsign: "LOW60",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    speedKt: 180,
    altitudeFt: 6000,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  view.ptlOn = true;
  view.altitudeFilter = { minHundreds: 70, maxHundreds: 90 };
  const { ctx, pathStrokes, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, 800, 800);
  expect(findPtlStroke(pathStrokes, ac, view, 800)).toBeUndefined();
  const targets = findTargetDiamonds(pathStrokes);
  expect(targets).toHaveLength(1);
  expect(fillTexts.some((t) => t.text === "LOW60")).toBe(false);
});

test("AC2 — 6000 ft outside 070-090 keeps target+history, loses datablock; 8000 ft keeps full block", () => {
  // Ticket text said 10000 ft keeps the block; 100 hundreds is outside 070-090.
  // 8000 ft (080) is the in-band Mode C case for this filter.
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
  const world = createWorld({ aircraft: [low, inBand], selectedAircraftId: low.id });
  const view = createScopeView();
  view.altitudeFilter = { minHundreds: 70, maxHundreds: 90 };
  const { ctx, fillTexts, strokeRects, fillRects, pathStrokes } = createMockCtx();
  renderScope(ctx, world, view, 800, 800);

  const targets = findTargetDiamonds(pathStrokes);
  expect(targets).toHaveLength(2);
  const history = fillRects.filter(
    (r) => r.w === HISTORY_DOT_SIZE_PX && r.h === HISTORY_DOT_SIZE_PX,
  );
  expect(history.length).toBeGreaterThanOrEqual(2);

  expect(fillTexts.some((t) => t.text === "UAL60")).toBe(false);
  expect(fillTexts.some((t) => t.text === formatFullDatablock(low).line2)).toBe(false);
  expect(fillTexts.some((t) => t.text === "DAL80")).toBe(true);
  expect(fillTexts.some((t) => t.text === formatFullDatablock(inBand).line2)).toBe(true);

  const size = { widthPx: 800, heightPx: 800 };
  const lowPx = nmToScreen(low.xNm, low.yNm, view.camera, size);
  const boxPx = TARGET_SIZE_PX + SELECTION_BOX_PAD_PX * 2;
  const selected = strokeRects.filter(
    (r) =>
      r.w === boxPx &&
      r.h === boxPx &&
      r.strokeStyle === SELECTED_ACCENT_COLOR &&
      Math.abs(r.x + boxPx / 2 - lowPx.x) <= 2,
  );
  expect(selected.length).toBeGreaterThanOrEqual(1);
});

test("AC8 — FILTER readout and FOA/CRC altitude filter comments; no cull or slider", () => {
  const world = createWorld();
  const view = createScopeView();
  const painted = createMockCtx();
  renderScope(painted.ctx, world, view, 800, 800);
  const readout = formatFilterReadout(view.altitudeFilter, view.filterEntry);
  expect(readout).toBe("FILTER 000-180");
  const filterText = painted.fillTexts.find((t) => t.text === readout);
  expect(filterText).toBeDefined();
  expect(filterText!.fillStyle).toBe(PALETTE.ssa);
  expect(readout.toLowerCase()).not.toContain("cull");
  expect(readout.toLowerCase()).not.toContain("slider");

  view.filterEntry.phase = "min";
  view.filterEntry.digits = "050";
  const entering = createMockCtx();
  renderScope(entering.ctx, world, view, 800, 800);
  expect(entering.fillTexts.some((t) => t.text === "FIL 050-___")).toBe(true);

  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  expect(sources["./altitudeFilter.ts"]).toMatch(/FOA/);
  expect(sources["./altitudeFilter.ts"]).toMatch(/altitude filter/);
  expect(sources["./altitudeFilter.ts"]).toMatch(/R05/);
  expect(sources["./altitudeFilter.ts"]).toMatch(/R07/);
  expect(sources["./renderScope.ts"]).toMatch(/FILTER/);
  expect(sources["./ssa.ts"]).toMatch(/FILTER/);
});

test("AC1 — SSA paints FILTER, RANGE, and OFF CNTR only when panned", () => {
  const world = createWorld({ simTimeMs: 125_000 });
  const view = createScopeView();
  const onAirport = createMockCtx();
  renderScope(onAirport.ctx, world, view, 800, 800);
  const expected = buildSsaLines({
    simTimeMs: world.simTimeMs,
    rangeNm: view.camera.rangeNm,
    offCenter: false,
    filter: view.altitudeFilter,
    filterEntry: view.filterEntry,
  });
  expect(expected).toContain("FILTER 000-180");
  expect(expected).toContain("RANGE 20");
  expect(expected).not.toContain("OFF CNTR");
  for (const line of expected) {
    const painted = onAirport.fillTexts.find((t) => t.text === line);
    expect(painted, line).toBeDefined();
    expect(painted!.fillStyle).toBe(PALETTE.ssa);
    expect(painted!.x).toBe(8);
    expect(painted!.textBaseline).toBe("top");
  }
  expect(onAirport.fillTexts.some((t) => t.text === formatSsaTime(125_000))).toBe(true);
  expect(onAirport.fillTexts.some((t) => t.text === "OFF CNTR")).toBe(false);

  view.camera.centerEastNm = 4;
  const panned = createMockCtx();
  renderScope(panned.ctx, world, view, 800, 800);
  expect(panned.fillTexts.some((t) => t.text === "OFF CNTR")).toBe(true);
  const offCntr = panned.fillTexts.find((t) => t.text === "OFF CNTR");
  expect(offCntr!.fillStyle).toBe(PALETTE.ssa);
});

test("AC7 — renderScope comments say PTL / predicted track line and cite CRC", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./renderScope.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/predicted track line/i);
  expect(src).toMatch(/\bPTL\b/);
  expect(src).toMatch(/CRC STARS/);
  expect(src).toMatch(/straight 1\.0 min/);
  expect(src).toMatch(/inAltitudeFilter/);
  expect(src).not.toMatch(/ctx\.clip/);
  expect(src).toMatch(/leader/);
  expect(src).toMatch(/L1–L9/);
  expect(src).not.toMatch(/\bstem\b/);
});

function findLeaderStroke(
  pathStrokes: PathStroke[],
  symbolX: number,
  symbolY: number,
  dir: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
): PathStroke | undefined {
  const seg = leaderSegmentPx(dir);
  if (!seg) {
    return undefined;
  }
  return pathStrokes.find((stroke) => {
    const a = stroke.points[0];
    const b = stroke.points[1];
    if (!a || !b || stroke.points.length !== 2) {
      return false;
    }
    return (
      Math.abs(a.x - (symbolX + seg.x0)) <= 0.5 &&
      Math.abs(a.y - (symbolY + seg.y0)) <= 0.5 &&
      Math.abs(b.x - (symbolX + seg.x1)) <= 0.5 &&
      Math.abs(b.y - (symbolY + seg.y1)) <= 0.5 &&
      stroke.lineWidth === 1
    );
  });
}

test("AC2 / AC7 — L6 leader points east; FDB/leader follow ownership, diamond stays search-target blue", () => {
  const ac = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3000,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
    headingDeg: 0,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  const css = 800;
  renderScope(createMockCtx().ctx, world, view, css, css);
  view.tracks.get(ac.id)!.leaderDir = 6;
  const { ctx, pathStrokes, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, css, css);
  const p = nmToScreen(ac.xNm, ac.yNm, view.camera, { widthPx: css, heightPx: css });
  const leader = findLeaderStroke(pathStrokes, p.x, p.y, 6);
  expect(leader).toBeDefined();
  expect(leader!.points[1]!.x).toBeGreaterThan(p.x);
  expect(leader!.points[1]!.y).toBeCloseTo(p.y);
  const target = findTargetDiamonds(pathStrokes, p.x, p.y)[0];
  expect(target).toBeDefined();
  expect(target!.strokeStyle).toBe(POSITION_SYMBOL_COLOR);
  expect(leader!.strokeStyle).toBe(PALETTE.unowned);
  const line1 = fillTexts.find((t) => t.text === "DAL123" && t.font === DATABLOCK_FONT);
  expect(line1).toBeDefined();
  expect(line1!.fillStyle).toBe(PALETTE.unowned);
  expect(line1!.x).toBeGreaterThan(p.x);
});

test("AC3 — L5 draws no visible leader; block sits off the symbol", () => {
  const ac = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3000,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
    headingDeg: 0,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  const css = 800;
  renderScope(createMockCtx().ctx, world, view, css, css);
  view.tracks.get(ac.id)!.leaderDir = 5;
  const { ctx, pathStrokes, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, css, css);
  const p = nmToScreen(ac.xNm, ac.yNm, view.camera, { widthPx: css, heightPx: css });
  expect(findLeaderStroke(pathStrokes, p.x, p.y, 5)).toBeUndefined();
  expect(leaderSegmentPx(5)).toBeNull();
  const line1 = fillTexts.find((t) => t.text === "DAL123" && t.font === DATABLOCK_FONT);
  expect(line1).toBeDefined();
  expect(line1!.x).toBeGreaterThan(p.x);
  expect(line1!.y).toBeGreaterThan(p.y);
  const half = TARGET_SIZE_PX / 2;
  expect(line1!.x).toBeGreaterThan(p.x + half);
  expect(line1!.y).toBeGreaterThan(p.y + half);
});

const SELECTION_BOX_PX = TARGET_SIZE_PX + SELECTION_BOX_PAD_PX * 2;

test("T02-08 AC2/AC3/AC4/AC5/AC8 — F3 greens selected symbol+datablock; others stay white; F4 drops; yellow box independent", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3000,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    altitudeFt: 4000,
    speedKt: 220,
    xNm: 2,
    yNm: 0,
  });
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  const css = 800;

  const spawned = createMockCtx();
  renderScope(spawned.ctx, world, view, css, css);
  const spawnedTargets = findTargetDiamonds(spawned.pathStrokes);
  expect(spawnedTargets).toHaveLength(2);
  expect(spawnedTargets.every((r) => r.strokeStyle === POSITION_SYMBOL_COLOR)).toBe(true);
  expect(spawned.fillTexts.find((t) => t.text === "DAL123")?.fillStyle).toBe(PALETTE.unowned);
  expect(spawned.fillTexts.find((t) => t.text === "AAL45")?.fillStyle).toBe(PALETTE.unowned);
  expect(
    spawned.fillTexts.filter((t) => t.text === "*" && t.font === OWNERSHIP_STUB_FONT),
  ).toHaveLength(2);
  expect(spawned.strokeRects.filter((r) => r.w === SELECTION_BOX_PX)).toHaveLength(0);

  const noSelF3 = createMockCtx();
  view.tracks.get(dal.id)!.ownership = "unowned";
  renderScope(noSelF3.ctx, world, view, css, css);
  expect(noSelF3.fillTexts.find((t) => t.text === "DAL123")?.fillStyle).toBe(PALETTE.unowned);
  expect(noSelF3.fillTexts.find((t) => t.text === "AAL45")?.fillStyle).toBe(PALETTE.unowned);

  world.selectedAircraftId = dal.id;
  view.tracks.get(dal.id)!.ownership = "owned";
  const owned = createMockCtx();
  renderScope(owned.ctx, world, view, css, css);
  const dalP = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: css, heightPx: css });
  const aalP = nmToScreen(aal.xNm, aal.yNm, view.camera, { widthPx: css, heightPx: css });
  const dalTarget = findTargetDiamonds(owned.pathStrokes, dalP.x, dalP.y)[0];
  const aalTarget = findTargetDiamonds(owned.pathStrokes, aalP.x, aalP.y)[0];
  expect(dalTarget?.strokeStyle).toBe(POSITION_SYMBOL_COLOR);
  expect(aalTarget?.strokeStyle).toBe(POSITION_SYMBOL_COLOR);
  expect(owned.fillTexts.find((t) => t.text === "DAL123")?.fillStyle).toBe(PALETTE.owned);
  expect(owned.fillTexts.find((t) => t.text === "030  210")?.fillStyle).toBe(PALETTE.owned);
  expect(owned.fillTexts.find((t) => t.text === "AAL45")?.fillStyle).toBe(PALETTE.unowned);
  expect(
    owned.fillTexts.filter((t) => t.text === "G" && t.font === OWNERSHIP_STUB_FONT),
  ).toHaveLength(1);
  expect(
    owned.fillTexts.filter((t) => t.text === "*" && t.font === OWNERSHIP_STUB_FONT),
  ).toHaveLength(1);
  const selBoxes = owned.strokeRects.filter(
    (r) => r.w === SELECTION_BOX_PX && r.h === SELECTION_BOX_PX,
  );
  expect(selBoxes).toHaveLength(1);
  expect(selBoxes[0]?.strokeStyle).toBe(SELECTED_ACCENT_COLOR);
  const painted = [
    ...owned.strokeRects.map((r) => r.strokeStyle),
    ...owned.fillTexts.map((t) => t.fillStyle ?? ""),
    ...owned.pathStrokes.map((s) => s.strokeStyle),
  ];
  expect(painted.some((c) => c.toLowerCase() === "#ff0000" || c.toLowerCase() === "red")).toBe(
    false,
  );

  view.tracks.get(dal.id)!.ownership = "unowned";
  const dropped = createMockCtx();
  renderScope(dropped.ctx, world, view, css, css);
  expect(dropped.fillTexts.find((t) => t.text === "DAL123")?.fillStyle).toBe(PALETTE.unowned);
  const droppedTarget = findTargetDiamonds(dropped.pathStrokes, dalP.x, dalP.y)[0];
  expect(droppedTarget?.strokeStyle).toBe(POSITION_SYMBOL_COLOR);
  expect(
    dropped.fillTexts.filter((t) => t.text === "*" && t.font === OWNERSHIP_STUB_FONT),
  ).toHaveLength(2);
  expect(dropped.fillTexts.filter((t) => t.text === "G")).toHaveLength(0);
  expect(
    dropped.strokeRects.filter(
      (r) => r.w === SELECTION_BOX_PX && r.strokeStyle === SELECTED_ACCENT_COLOR,
    ),
  ).toHaveLength(1);
});

test("T02-08 — owned PTL stays white, not selection yellow", () => {
  const ac = makeTestAircraft({
    id: "ac-ptl-own",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    speedKt: 180,
  });
  const world = createWorld({ aircraft: [ac], selectedAircraftId: ac.id });
  const view = createScopeView();
  view.ptlOn = true;
  renderScope(createMockCtx().ctx, world, view, 800, 800);
  view.tracks.get(ac.id)!.ownership = "owned";
  const on = createMockCtx();
  renderScope(on.ctx, world, view, 800, 800);
  const ptl = findPtlStroke(on.pathStrokes, ac, view, 800);
  expect(ptl?.strokeStyle).toBe(PALETTE.ptl);
});

test("T04-09 AC5 — predicted CA blinks without yellow; current CA paints red", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 8000,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    altitudeFt: 8000,
    speedKt: 210,
    xNm: 8,
    yNm: 0,
  });
  const world = createWorld({ aircraft: [dal, aal] });
  world.alerts.ca = [
    {
      callsignA: "AAL45",
      callsignB: "DAL123",
      severity: "caution",
      distNm: 8,
      deltaAltFt: 0,
    },
  ];
  const view = createScopeView();
  const css = 800;
  const caution = createMockCtx();
  renderScope(caution.ctx, world, view, css, css);
  const dalP = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: css, heightPx: css });
  expect(findTargetDiamonds(caution.pathStrokes, dalP.x, dalP.y)[0]?.strokeStyle).toBe(
    POSITION_SYMBOL_COLOR,
  );
  expect(caution.fillTexts.find((t) => t.text === "DAL123 CA")?.fillStyle).toBe(PALETTE.unowned);
  expect(caution.fillTexts.find((t) => t.text === "AAL45 CA")?.fillStyle).toBe(PALETTE.unowned);

  world.alerts.ca[0]!.severity = "alert";
  world.simTimeMs = 0;
  const alert = createMockCtx();
  renderScope(alert.ctx, world, view, css, css);
  expect(findTargetDiamonds(alert.pathStrokes, dalP.x, dalP.y)[0]?.strokeStyle).toBe(PALETTE.alert);
  expect(alert.fillTexts.find((t) => t.text === "DAL123 CA")?.fillStyle).toBe(PALETTE.alert);

  world.simTimeMs = 500;
  const blinkOff = createMockCtx();
  renderScope(blinkOff.ctx, world, view, css, css);
  expect(blinkOff.fillTexts.find((t) => t.text === "DAL123   ")?.fillStyle).toBe(PALETTE.alert);
  expect(blinkOff.fillTexts.find((t) => t.text === "DAL123 CA")).toBeUndefined();

  world.alerts.ca = [];
  const cleared = createMockCtx();
  renderScope(cleared.ctx, world, view, css, css);
  expect(findTargetDiamonds(cleared.pathStrokes, dalP.x, dalP.y)[0]?.strokeStyle).toBe(
    POSITION_SYMBOL_COLOR,
  );
  expect(cleared.fillTexts.find((t) => t.text === "DAL123")?.fillStyle).toBe(PALETTE.unowned);

  const sources = import.meta.glob("./renderScope.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./renderScope.ts"]!;
  expect(src).toMatch(/world\.alerts/);
  expect(src).not.toMatch(/evaluateConflictAlert/);
  expect(src).not.toMatch(/evaluateMsaw/);
  expect(src).not.toMatch(/STARS CA/);
});

test("T04-10 — scope tints MSAW from world.alerts, not MVA math", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 1000,
    speedKt: 210,
    xNm: 2,
    yNm: 2,
  });
  const world = createWorld({ aircraft: [dal] });
  world.alerts.msaw = [{ callsign: "DAL123", severity: "caution", altFt: 1400, floorFt: 1500 }];
  const view = createScopeView();
  const css = 800;
  const caution = createMockCtx();
  renderScope(caution.ctx, world, view, css, css);
  const dalP = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: css, heightPx: css });
  expect(findTargetDiamonds(caution.pathStrokes, dalP.x, dalP.y)[0]?.strokeStyle).toBe(
    PALETTE.caution,
  );
  expect(caution.fillTexts.find((t) => t.text === "DAL123 MSAW")?.fillStyle).toBe(PALETTE.caution);

  world.alerts.msaw[0]!.severity = "alert";
  const alert = createMockCtx();
  renderScope(alert.ctx, world, view, css, css);
  expect(findTargetDiamonds(alert.pathStrokes, dalP.x, dalP.y)[0]?.strokeStyle).toBe(PALETTE.alert);
  expect(alert.fillTexts.find((t) => t.text === "DAL123 MSAW")?.fillStyle).toBe(PALETTE.alert);
});

test("video map labels stack newline-separated STAR restriction lines", () => {
  const view = createScopeView(0, 0, {
    digitalMap: {
      rangeRings: { intervalNm: 5, maxNm: 60 },
      loadedVideoMaps: [
        {
          id: "T",
          file: "t.json",
          dcbNumber: 1,
          dcbLabel: "T",
          defaultOn: true,
          color: "map",
          name: "test",
          features: [{ type: "text", text: "------\n100\n250\n------", atNm: [0, 0] }],
        },
      ],
    },
  });
  const { ctx, fillTexts } = createMockCtx();
  renderScope(ctx, createWorld(), view, 800, 800);
  expect(fillTexts.some((t) => t.text.includes("\n"))).toBe(false);
  expect(fillTexts.filter((t) => t.text === "------")).toHaveLength(2);
  const alt = fillTexts.find((t) => t.text === "100");
  const spd = fillTexts.find((t) => t.text === "250");
  expect(alt).toBeDefined();
  expect(spd).toBeDefined();
  expect((spd!.y ?? 0) - (alt!.y ?? 0)).toBe(DATABLOCK_FONT_PX);
});

test("T04-17 AC1 — pending inbound paints HO cue; click owns white and drops cue", () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const pending = createMockCtx();
  renderScope(pending.ctx, world, view, 800, 800);
  expect(pending.fillTexts.some((t) => t.text === "DAL123 HO")).toBe(true);
  expect(pending.fillTexts.find((t) => t.text === "DAL123 HO")?.fillStyle).toBe(PALETTE.unowned);

  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: 800, heightPx: 800 });
  handlePpiLeftClick(view, world, tick.x, tick.y, 800, 800);
  const owned = createMockCtx();
  renderScope(owned.ctx, world, view, 800, 800);
  expect(owned.fillTexts.some((t) => t.text === "DAL123 HO")).toBe(false);
  expect(owned.fillTexts.find((t) => t.text === "DAL123")?.fillStyle).toBe(PALETTE.owned);
  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });
});

test("T02-24 — GEO MAPS / CURRENT overlay is screen-fixed SSA green; no weather mosaic", () => {
  const view = createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
  const world = createWorldFromScenario(loadKdem());
  toggleGeoMapsList(view);
  const geo = createMockCtx();
  renderScope(geo.ctx, world, view, 800, 800);
  expect(geo.fillTexts.some((t) => t.text === "GEO MAPS")).toBe(true);
  expect(geo.fillTexts.some((t) => t.text === "1 RWY27 ON")).toBe(true);
  expect(geo.fillTexts.find((t) => t.text === "GEO MAPS")?.fillStyle).toBe(PALETTE.ssa);

  toggleGeoMapsList(view);
  toggleCurrentMapsList(view);
  const current = createMockCtx();
  renderScope(current.ctx, world, view, 800, 800);
  expect(current.fillTexts.some((t) => t.text === "CURRENT")).toBe(true);
  expect(current.fillTexts.some((t) => t.text === "1 RWY27")).toBe(true);
  expect(current.fillTexts.some((t) => t.text === "GEO MAPS")).toBe(false);

  hideMapLists(view);
  const hidden = createMockCtx();
  renderScope(hidden.ctx, world, view, 800, 800);
  expect(hidden.fillTexts.some((t) => t.text === "GEO MAPS")).toBe(false);
  expect(hidden.fillTexts.some((t) => t.text === "CURRENT")).toBe(false);

  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./renderScope.ts"] ?? "";
  expect(src).not.toMatch(/nexrad/i);
  expect(src).not.toMatch(/mosaic/i);
  expect(src).not.toMatch(/openstreetmap/i);
  expect(src).not.toMatch(/drawImage/);
});

test("T02-26 — CHAR SIZE DATA BLOCKS / LISTS and BRITE FDB/MPA change paint", () => {
  const world = createWorldFromScenario(loadKdem());
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const view = createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
  const full = createMockCtx();
  renderScope(full.ctx, world, view, 800, 800);
  const fdbFont = full.fillTexts.find(
    (t) => t.text === dal.callsign || t.text === `${dal.callsign} HO`,
  );
  expect(fdbFont?.font).toContain("12px");
  expect(fdbFont?.fillStyle).toBe(PALETTE.unowned);

  stepCharSizeChannel(view, "dataBlocks", -1);
  stepCharSizeChannel(view, "lists", 1);
  stepBriteChannel(view, "fdb", -5);
  stepBriteChannel(view, "mpa", -6);
  const next = createMockCtx();
  renderScope(next.ctx, world, view, 800, 800);
  const resized = next.fillTexts.find(
    (t) => t.text === dal.callsign || t.text === `${dal.callsign} HO`,
  );
  expect(resized?.font).toContain("11px");
  expect(resized?.fillStyle).toBe(applyBrite(PALETTE.unowned, 50));
  const ssa = next.fillTexts.find((t) => t.text === "RANGE 20" || t.text === "KDEM 29.92");
  expect(ssa?.font).toContain("13px");
  expect(ssa?.fillStyle).toBe(applyBrite(PALETTE.ssa, 100));
  expect(next.fillTexts.some((t) => t.fillStyle === applyBrite(PALETTE.map, 40))).toBe(true);
});

test("T02-27 — SSA FILTER hides TIME on the PPI; GI TEXT paints authored lines", () => {
  const world = createWorld({ simTimeMs: 125_000 });
  const scenario = loadKdem();
  const view = createScopeView(0, 0, { giTextLines: scenario.giTextLines });
  const before = createMockCtx();
  renderScope(before.ctx, world, view, 800, 800);
  expect(before.fillTexts.some((t) => t.text === formatSsaTime(125_000))).toBe(true);
  expect(before.fillTexts.some((t) => t.text === "ATIS A")).toBe(true);
  expect(before.fillTexts.some((t) => t.text === "RWY 27")).toBe(true);

  toggleSsaFilter(view, "TIME");
  const after = createMockCtx();
  renderScope(after.ctx, world, view, 800, 800);
  expect(after.fillTexts.some((t) => t.text === formatSsaTime(125_000))).toBe(false);
  expect(after.fillTexts.some((t) => t.text === "ATIS A")).toBe(true);
  expect(after.fillTexts.filter((t) => t.text === "").length).toBe(0);
});
