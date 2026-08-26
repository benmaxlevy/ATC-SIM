import { expect, test } from "vitest";
import {
  SessionLog,
  SIM_DT_S,
  createWorld,
  handoffFor,
  makeTestAircraft,
  setHandoffNone,
  stepWorld,
} from "@core";
import { applyIntent } from "@pilot";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { formatRangeReadout, nmToScreen } from "./camera";
import { parseDigitalMap } from "./mapLayers";
import { PALETTE, applyBrite } from "./palette";
import { PTL_MINUTES, ptlEndpoint, shouldDrawPtl } from "./ptl";
import { handlePpiLeftClick, isPpiSlewButton, isPpiSlewHeld } from "./ppi";
import { renderScope } from "./renderScope";
import {
  hideMapLists,
  stepBriteChannel,
  stepCharSizeChannel,
  toggleCurrentMapsList,
  toggleGeoMapsList,
  toggleVideoMap,
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
  isTargetDiamondPath,
} from "./targetSymbol";
import {
  ensureTrackDisplay,
  isIdentFlashing,
  setScratchpad,
  syncTrackDisplays,
} from "./trackDisplay";
import { DATABLOCK_FONT, DATABLOCK_FONT_PX } from "./fonts";
import {
  formatFullDatablock,
  formatLimitedDatablock,
  formatPartialDatablock,
  datablockMetrics,
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

function findTargetPositionSymbol(
  fillTexts: { text: string; x?: number; y?: number; fillStyle?: string; font?: string }[],
  cx?: number,
  cy?: number,
  slopPx = 4,
) {
  return fillTexts.filter((t) => {
    const isSymbol =
      t.text === "*" ||
      t.text === "V" ||
      t.text === "D" ||
      t.text === "G" ||
      t.text === "T" ||
      t.text === "C";
    if (!isSymbol) return false;
    if (cx != null && cy != null && t.x != null && t.y != null) {
      return Math.abs(t.x - cx) <= slopPx && Math.abs(t.y - cy) <= slopPx;
    }
    return true;
  });
}

test("AC1 — six spawned arrivals get unassociated position symbols (*) and datablocks at nmToScreen ±2 px", () => {
  const world = createWorldFromScenario(loadKdem());
  expect(world.aircraft).toHaveLength(6);
  const view = createScopeView();
  const { ctx, fillTexts } = createMockCtx();
  const css = 800;
  renderScope(ctx, world, view, css, css);
  const targets = findTargetPositionSymbol(fillTexts);
  expect(targets).toHaveLength(6);
  expect(fillTexts.filter((t) => t.text === "C" || t.text === "*")).toHaveLength(6);
  const size = { widthPx: css, heightPx: css };
  for (const ac of world.aircraft) {
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const hit = findTargetPositionSymbol(fillTexts, p.x, p.y)[0];
    expect(hit, ac.callsign).toBeDefined();
    const block = formatPartialDatablock(ac);
    expect(
      fillTexts.some((t) => t.text === block.line1 && t.font === DATABLOCK_FONT),
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
  const yellow = at1s.fillTexts.filter(
    (t) => t.text === "*" && t.fillStyle === SELECTED_ACCENT_COLOR,
  );
  expect(yellow.length).toBeGreaterThanOrEqual(1);

  const at3s = createMockCtx();
  world.simTimeMs = 3000;
  renderScope(at3s.ctx, world, view, 800, 800);
  expect(isIdentFlashing(view.tracks.get(ac.id)!, 3000)).toBe(false);
  const stillYellow = at3s.fillTexts.filter(
    (t) => t.text === "*" && t.fillStyle === SELECTED_ACCENT_COLOR,
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
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(ac.id)!.datablockMode = "full";
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

test("T02-19 / T02-36 — full datablock time-shares between altitude/GS and scratchpad/type", () => {
  const ac = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3000,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
    aircraftType: "B738",
  });
  const world = createWorld({ aircraft: [ac], simTimeMs: 0 });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(ac.id)!.datablockMode = "full";
  setScratchpad(view.tracks, ac.id, "abcd");

  // Phase A at t=0s: Line 2 shows Mode C + GS
  const phaseA = createMockCtx();
  renderScope(phaseA.ctx, world, view, 800, 800);
  const line2A = phaseA.fillTexts.find((t) => t.text === "030  210" && t.font === DATABLOCK_FONT);
  expect(line2A).toBeDefined();

  // Phase B at t=2.5s: Line 2 shows scratchpad + type
  world.simTimeMs = 2500;
  const phaseB = createMockCtx();
  renderScope(phaseB.ctx, world, view, 800, 800);
  const line2B = phaseB.fillTexts.find((t) => t.text === "ABCD  B738" && t.font === DATABLOCK_FONT);
  expect(line2B).toBeDefined();
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
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(ac.id)!.datablockMode = "full";
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

test("T02-04 AC5 / T02-36 — M hides Mode C on full blocks; Line 3 shows assigned altitude A040", () => {
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
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(ac.id)!.datablockMode = "full";
  view.modeCVisible = false;
  const full = createMockCtx();
  renderScope(full.ctx, world, view, 800, 800);
  expect(full.fillTexts.some((t) => t.text === "210")).toBe(true);
  expect(full.fillTexts.some((t) => t.text === "A040")).toBe(true);

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
  const targetsOff = findTargetPositionSymbol(off.fillTexts);
  expect(targetsOff).toHaveLength(1);

  view.ptlOn = true;
  const on = createMockCtx();
  renderScope(on.ctx, world, view, css, css);
  const ptl = findPtlStroke(on.pathStrokes, ac, view, css);
  expect(ptl).toBeDefined();
  expect(ptl!.strokeStyle).toBe(PALETTE.ptl);
  expect(ptl!.lineWidth).toBe(1);
  const targetsOn = findTargetPositionSymbol(on.fillTexts);
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
  const targets = findTargetPositionSymbol(fillTexts);
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
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(inBand.id)!.datablockMode = "full";
  view.altitudeFilter = { minHundreds: 70, maxHundreds: 90 };
  const { ctx, fillTexts, strokeRects, fillRects } = createMockCtx();
  renderScope(ctx, world, view, 800, 800);

  const targets = findTargetPositionSymbol(fillTexts);
  expect(targets).toHaveLength(2);
  const history = fillRects.filter(
    (r) => r.w === HISTORY_DOT_SIZE_PX && r.h === HISTORY_DOT_SIZE_PX,
  );
  expect(history.length).toBeGreaterThanOrEqual(2);

  expect(fillTexts.some((t) => t.text === "UAL60")).toBe(false);
  expect(fillTexts.some((t) => t.text === formatFullDatablock(low).line2)).toBe(false);
  expect(fillTexts.some((t) => t.text === "DAL80")).toBe(true);
  expect(fillTexts.some((t) => t.text === formatFullDatablock(inBand).line2)).toBe(true);
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
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(ac.id)!.datablockMode = "full";
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
  const target = findTargetPositionSymbol(fillTexts, p.x, p.y)[0];
  expect(target).toBeDefined();
  expect(target!.fillStyle).toBe(POSITION_SYMBOL_COLOR);
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
  view.tracks.get(ac.id)!.datablockMode = "full";
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
  const spawnedTargets = findTargetPositionSymbol(spawned.fillTexts);
  expect(spawnedTargets).toHaveLength(2);
  expect(spawnedTargets.every((r) => r.fillStyle === POSITION_SYMBOL_COLOR)).toBe(true);
  expect(spawned.fillTexts.find((t) => t.text === "030  210")?.fillStyle).toBe(PALETTE.unowned);
  expect(spawned.fillTexts.find((t) => t.text === "040  220")?.fillStyle).toBe(PALETTE.unowned);
  expect(spawned.fillTexts.filter((t) => t.text === "*")).toHaveLength(2);
  expect(spawned.strokeRects.filter((r) => r.w === SELECTION_BOX_PX)).toHaveLength(0);

  const noSelF3 = createMockCtx();
  view.tracks.get(dal.id)!.ownership = "unowned";
  renderScope(noSelF3.ctx, world, view, css, css);
  expect(noSelF3.fillTexts.find((t) => t.text === "030  210")?.fillStyle).toBe(PALETTE.unowned);
  expect(noSelF3.fillTexts.find((t) => t.text === "040  220")?.fillStyle).toBe(PALETTE.unowned);

  world.selectedAircraftId = dal.id;
  view.tracks.get(dal.id)!.ownership = "owned";
  view.tracks.get(dal.id)!.datablockMode = "full";
  const owned = createMockCtx();
  renderScope(owned.ctx, world, view, css, css);
  const dalP = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: css, heightPx: css });
  const aalP = nmToScreen(aal.xNm, aal.yNm, view.camera, { widthPx: css, heightPx: css });
  const dalTarget = findTargetPositionSymbol(owned.fillTexts, dalP.x, dalP.y)[0];
  const aalTarget = findTargetPositionSymbol(owned.fillTexts, aalP.x, aalP.y)[0];
  expect(dalTarget?.fillStyle).toBe(POSITION_SYMBOL_COLOR);
  expect(aalTarget?.fillStyle).toBe(POSITION_SYMBOL_COLOR);
  expect(owned.fillTexts.find((t) => t.text === "DAL123")?.fillStyle).toBe(PALETTE.owned);
  expect(owned.fillTexts.find((t) => t.text === "030  210")?.fillStyle).toBe(PALETTE.owned);
  expect(owned.fillTexts.find((t) => t.text === "040  220")?.fillStyle).toBe(PALETTE.unowned);
  expect(owned.fillTexts.filter((t) => t.text === "D" || t.text === "G")).toHaveLength(1);
  expect(owned.fillTexts.filter((t) => t.text === "*")).toHaveLength(1);
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
  const droppedTarget = findTargetPositionSymbol(dropped.fillTexts, dalP.x, dalP.y)[0];
  expect(droppedTarget?.fillStyle).toBe(POSITION_SYMBOL_COLOR);
  expect(dropped.fillTexts.filter((t) => t.text === "*")).toHaveLength(2);
  expect(dropped.fillTexts.filter((t) => t.text === "D" || t.text === "G")).toHaveLength(0);
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

test("T04-09 AC5 — current CA blinks and paints red", () => {
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
    xNm: 2,
    yNm: 0,
  });
  const world = createWorld({ aircraft: [dal, aal] });
  world.alerts.ca = [
    {
      callsignA: "AAL45",
      callsignB: "DAL123",
      severity: "alert",
      distNm: 2,
      deltaAltFt: 0,
    },
  ];
  const view = createScopeView();
  const css = 800;
  const dalP = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: css, heightPx: css });
  world.simTimeMs = 0;
  const alert = createMockCtx();
  renderScope(alert.ctx, world, view, css, css);
  expect(findTargetPositionSymbol(alert.fillTexts, dalP.x, dalP.y)[0]?.fillStyle).toBe(
    PALETTE.alert,
  );
  expect(alert.fillTexts.find((t) => t.text === "DAL123 CA")?.fillStyle).toBe(PALETTE.alert);

  world.simTimeMs = 500;
  const blinkOff = createMockCtx();
  renderScope(blinkOff.ctx, world, view, css, css);
  expect(blinkOff.fillTexts.find((t) => t.text === "DAL123   ")?.fillStyle).toBe(PALETTE.alert);
  world.alerts.ca = [];
  const cleared = createMockCtx();
  renderScope(cleared.ctx, world, view, css, css);
  expect(findTargetPositionSymbol(cleared.fillTexts, dalP.x, dalP.y)[0]?.fillStyle).toBe(
    POSITION_SYMBOL_COLOR,
  );
  expect(cleared.fillTexts.find((t) => t.text === "080  210")?.fillStyle).toBe(PALETTE.unowned);

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
  const ac = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3000,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
  });
  const world = createWorld({
    aircraft: [ac],
    alerts: {
      ca: [],
      msaw: [{ callsign: "DAL123", severity: "caution", altFt: 1400, floorFt: 1500 }],
    },
  });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const css = 800;
  const dalP = nmToScreen(ac.xNm, ac.yNm, view.camera, { widthPx: css, heightPx: css });

  const caution = createMockCtx();
  renderScope(caution.ctx, world, view, css, css);
  expect(findTargetPositionSymbol(caution.fillTexts, dalP.x, dalP.y)[0]?.fillStyle).toBe(
    PALETTE.caution,
  );
  expect(caution.fillTexts.find((t) => t.text === "DAL123 MSAW")?.fillStyle).toBe(PALETTE.caution);

  world.alerts.msaw[0]!.severity = "alert";
  const alert = createMockCtx();
  renderScope(alert.ctx, world, view, css, css);
  expect(findTargetPositionSymbol(alert.fillTexts, dalP.x, dalP.y)[0]?.fillStyle).toBe(
    PALETTE.alert,
  );
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

test("T04-17 AC1 — pending inbound paints blinking white FDB; click owns solid white", () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const pending = createMockCtx();
  renderScope(pending.ctx, world, view, 800, 800);
  expect(pending.fillTexts.some((t) => t.text === "DAL123")).toBe(true);
  expect(pending.fillTexts.find((t) => t.text === "DAL123")?.fillStyle).toBe(PALETTE.owned);

  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: 800, heightPx: 800 });
  handlePpiLeftClick(view, world, tick.x, tick.y, 800, 800);
  const owned = createMockCtx();
  renderScope(owned.ctx, world, view, 800, 800);
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
  setHandoffNone(world, dal.id);
  const view = createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(dal.id)!.datablockMode = "full";
  const full = createMockCtx();
  renderScope(full.ctx, world, view, 800, 800);
  const fdbFont = full.fillTexts.find((t) => t.text === dal.callsign);
  expect(fdbFont?.font).toContain("12px");
  expect(fdbFont?.fillStyle).toBe(PALETTE.unowned);

  stepCharSizeChannel(view, "dataBlocks", -1);
  stepCharSizeChannel(view, "lists", 1);
  stepBriteChannel(view, "fdb", -5);
  stepBriteChannel(view, "mpa", -6);
  const next = createMockCtx();
  renderScope(next.ctx, world, view, 800, 800);
  const resized = next.fillTexts.find((t) => t.text === dal.callsign);
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

test("right and middle buttons slew; left does not", () => {
  expect(isPpiSlewButton(0)).toBe(false);
  expect(isPpiSlewButton(1)).toBe(true);
  expect(isPpiSlewButton(2)).toBe(true);
  expect(isPpiSlewHeld(0)).toBe(false);
  expect(isPpiSlewHeld(1)).toBe(false);
  expect(isPpiSlewHeld(2)).toBe(true);
  expect(isPpiSlewHeld(4)).toBe(true);
  expect(isPpiSlewHeld(6)).toBe(true);
});

test("T04-23 — slot 7 BAY1_SID video map renders SID lines and labels on PPI scope canvas and can be toggled", () => {
  const maps = loadKdem().maps;
  const view = createScopeView(0, 0, { digitalMap: parseDigitalMap(maps) });
  const world = createWorld();
  const onCtx = createMockCtx();
  renderScope(onCtx.ctx, world, view, 800, 800);

  // Check that SID labels (BAYEE, BAYNW, BAYSO, NORMA, OCTTA) are drawn on the scope
  expect(onCtx.fillTexts.some((t) => t.text === "BAYEE")).toBe(true);
  expect(onCtx.fillTexts.some((t) => t.text === "BAYNW")).toBe(true);
  expect(onCtx.fillTexts.some((t) => t.text === "BAYSO")).toBe(true);
  expect(onCtx.fillTexts.some((t) => t.text === "NORMA")).toBe(true);
  expect(onCtx.fillTexts.some((t) => t.text === "OCTTA")).toBe(true);

  // Toggle BAY1_SID off
  toggleVideoMap(view, "BAY1_SID");
  const offCtx = createMockCtx();
  renderScope(offCtx.ctx, world, view, 800, 800);
  expect(offCtx.fillTexts.some((t) => t.text === "BAYEE")).toBe(false);
  expect(offCtx.fillTexts.some((t) => t.text === "BAYNW")).toBe(false);
  expect(offCtx.fillTexts.some((t) => t.text === "BAYSO")).toBe(false);
  expect(offCtx.fillTexts.some((t) => t.text === "NORMA")).toBe(false);
  expect(offCtx.fillTexts.some((t) => t.text === "OCTTA")).toBe(false);

  // Toggle BAY1_SID back on
  toggleVideoMap(view, "BAY1_SID");
  const backOnCtx = createMockCtx();
  renderScope(backOnCtx.ctx, world, view, 800, 800);
  expect(backOnCtx.fillTexts.some((t) => t.text === "BAYEE")).toBe(true);
});

test("T02-34 AC1 — Primary-only target renders as a diamond without a datablock", () => {
  const pri = makeTestAircraft({
    id: "ac-pri",
    callsign: "PRI01",
    xNm: 0,
    yNm: 0,
    primaryOnly: true,
  });
  const sec = makeTestAircraft({
    id: "ac-sec",
    callsign: "SEC02",
    xNm: 5,
    yNm: 0,
  });
  const world = createWorld({ aircraft: [pri, sec] });
  const view = createScopeView();
  const css = 800;
  const { ctx, pathStrokes, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, css, css);

  const priP = nmToScreen(pri.xNm, pri.yNm, view.camera, { widthPx: css, heightPx: css });
  const secP = nmToScreen(sec.xNm, sec.yNm, view.camera, { widthPx: css, heightPx: css });

  // Primary target gets a diamond path stroke
  const priDiamonds = findTargetDiamonds(pathStrokes, priP.x, priP.y);
  expect(priDiamonds).toHaveLength(1);
  // Primary target has no datablock or leader
  expect(fillTexts.some((t) => t.text === "PRI01")).toBe(false);

  // Secondary target gets an asterisk and datablock
  const secSymbols = findTargetPositionSymbol(fillTexts, secP.x, secP.y);
  expect(secSymbols).toHaveLength(1);
  expect(secSymbols[0]!.text).toBe("*");
  expect(fillTexts.some((t) => t.text.includes("080"))).toBe(true);
});

test("T02-34 AC2 — Unassociated secondary targets render *, V for 1200, square for beacon select", () => {
  const acNorm = makeTestAircraft({
    id: "ac-1",
    callsign: "DAL1",
    xNm: -2,
    yNm: 0,
    squawk: "0342",
  });
  const acVfr = makeTestAircraft({ id: "ac-2", callsign: "VFR2", xNm: 0, yNm: 0, squawk: "1200" });
  const acSel = makeTestAircraft({ id: "ac-3", callsign: "SEL3", xNm: 2, yNm: 0, squawk: "4500" });
  const world = createWorld({ aircraft: [acNorm, acVfr, acSel] });
  const view = createScopeView();
  view.beaconSelectCodes = ["4500"];
  const css = 800;
  const { ctx, fillTexts, strokeRects } = createMockCtx();
  renderScope(ctx, world, view, css, css);

  const pNorm = nmToScreen(acNorm.xNm, acNorm.yNm, view.camera, { widthPx: css, heightPx: css });
  const pVfr = nmToScreen(acVfr.xNm, acVfr.yNm, view.camera, { widthPx: css, heightPx: css });
  const pSel = nmToScreen(acSel.xNm, acSel.yNm, view.camera, { widthPx: css, heightPx: css });

  // Normal unassociated -> *
  const symNorm = findTargetPositionSymbol(fillTexts, pNorm.x, pNorm.y);
  expect(symNorm[0]?.text).toBe("*");

  // 1200 VFR -> V
  const symVfr = findTargetPositionSymbol(fillTexts, pVfr.x, pVfr.y);
  expect(symVfr[0]?.text).toBe("V");

  // Selected beacon -> square
  const rectSel = strokeRects.filter(
    (r) => Math.abs(r.x + r.w / 2 - pSel.x) <= 2 && Math.abs(r.y + r.h / 2 - pSel.y) <= 2,
  );
  expect(rectSel.length).toBeGreaterThanOrEqual(1);
});

test("T02-34 AC3 — Tracked target renders owning controller's sector ID", () => {
  const ac = makeTestAircraft({ id: "ac-tracked", callsign: "DAL100", xNm: 0, yNm: 0 });
  const world = createWorld({ aircraft: [ac], selectedAircraftId: ac.id });
  const view = createScopeView();
  ensureTrackDisplay(view.tracks, ac.id).ownership = "owned";
  view.sectorId = "D";

  const css = 800;
  const { ctx, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, css, css);

  const p = nmToScreen(ac.xNm, ac.yNm, view.camera, { widthPx: css, heightPx: css });
  const sym = findTargetPositionSymbol(fillTexts, p.x, p.y);
  expect(sym[0]?.text).toBe("D");
});

test("T02-34 AC4 — Fixed 8px heading tick line is removed; PTL renders when enabled", () => {
  const ac = makeTestAircraft({
    id: "ac-notick",
    callsign: "DAL100",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    speedKt: 250,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  view.ptlOn = false;

  const css = 800;
  const offCtx = createMockCtx();
  renderScope(offCtx.ctx, world, view, css, css);
  // Only leader line is drawn, no heading tick line from target
  expect(findPtlStroke(offCtx.pathStrokes, ac, view, css)).toBeUndefined();
  expect(offCtx.pathStrokes.every((s) => s.points.length <= 2)).toBe(true);

  // Enable PTL
  view.ptlOn = true;
  const onCtx = createMockCtx();
  renderScope(onCtx.ctx, world, view, css, css);
  const ptl = findPtlStroke(onCtx.pathStrokes, ac, view, css);
  expect(ptl).toBeDefined();
});

test("T02-34 AC5 — BRITE channels pos, oth, and pri properly modulate target symbol brightness", () => {
  const pri = makeTestAircraft({
    id: "ac-pri",
    callsign: "PRI01",
    xNm: -2,
    yNm: 0,
    primaryOnly: true,
  });
  const oth = makeTestAircraft({ id: "ac-oth", callsign: "OTH02", xNm: 0, yNm: 0 });
  const pos = makeTestAircraft({ id: "ac-pos", callsign: "POS03", xNm: 2, yNm: 0 });
  const world = createWorld({ aircraft: [pri, oth, pos] });
  const view = createScopeView();
  ensureTrackDisplay(view.tracks, pos.id).ownership = "owned";

  view.brite.pri = 40;
  view.brite.oth = 70;
  view.brite.pos = 90;

  const css = 800;
  const { ctx, pathStrokes, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, css, css);

  const priP = nmToScreen(pri.xNm, pri.yNm, view.camera, { widthPx: css, heightPx: css });
  const othP = nmToScreen(oth.xNm, oth.yNm, view.camera, { widthPx: css, heightPx: css });
  const posP = nmToScreen(pos.xNm, pos.yNm, view.camera, { widthPx: css, heightPx: css });

  const priDiamond = findTargetDiamonds(pathStrokes, priP.x, priP.y)[0];
  expect(priDiamond?.strokeStyle).toBe(applyBrite(POSITION_SYMBOL_COLOR, 40));

  const othSym = findTargetPositionSymbol(fillTexts, othP.x, othP.y)[0];
  expect(othSym?.fillStyle).toBe(applyBrite(POSITION_SYMBOL_COLOR, 70));

  const posSym = findTargetPositionSymbol(fillTexts, posP.x, posP.y)[0];
  expect(posSym?.fillStyle).toBe(applyBrite(POSITION_SYMBOL_COLOR, 90));
});

test("T02-34 AC6 — Position symbol sizing via charSizes.pos", () => {
  const ac = makeTestAircraft({ id: "ac-sz", callsign: "DAL1", xNm: 0, yNm: 0 });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  view.charSizes.pos = 10;

  const css = 800;
  const { ctx, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, css, css);

  const p = nmToScreen(ac.xNm, ac.yNm, view.camera, { widthPx: css, heightPx: css });
  const sym = findTargetPositionSymbol(fillTexts, p.x, p.y)[0];
  expect(sym?.font).toContain("10px");
});

test("T02-35 AC1/AC2 — LDB renders squawk+Mode C and queries ground speed on click", () => {
  const ac = makeTestAircraft({
    id: "ac-ldb",
    callsign: "VFR12",
    squawk: "1200",
    altitudeFt: 4500,
    speedKt: 180,
    xNm: 0,
    yNm: 0,
  });
  const world = createWorld({ aircraft: [ac], simTimeMs: 1000 });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(ac.id)!.datablockMode = "limited";
  view.tracks.get(ac.id)!.unassociated = true;

  const css = 800;
  const initial = createMockCtx();
  renderScope(initial.ctx, world, view, css, css);
  expect(initial.fillTexts.some((t) => t.text === "1200 045")).toBe(true);

  // Click on unassociated target to query ground speed for 5s
  const p = nmToScreen(ac.xNm, ac.yNm, view.camera, { widthPx: css, heightPx: css });
  handlePpiLeftClick(view, world, p.x, p.y, css, css);

  const queried = createMockCtx();
  renderScope(queried.ctx, world, view, css, css);
  expect(queried.fillTexts.some((t) => t.text === "045 18")).toBe(true);
  expect(queried.fillTexts.some((t) => t.text === "1200 045")).toBe(false);

  // After 5s, reverts back to 1200 045
  world.simTimeMs = 1000 + 5000;
  const expired = createMockCtx();
  renderScope(expired.ctx, world, view, css, css);
  expect(expired.fillTexts.some((t) => t.text === "1200 045")).toBe(true);
  expect(expired.fillTexts.some((t) => t.text === "045 18")).toBe(false);
});

test("T02-35 AC3/AC4 — Unowned track defaults to PDB and clicking toggles between PDB and Green FDB", () => {
  const ac = makeTestAircraft({
    id: "ac-unowned",
    callsign: "SWA200",
    altitudeFt: 6000,
    speedKt: 240,
    xNm: 0,
    yNm: 0,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  const css = 800;
  const initial = createMockCtx();
  renderScope(initial.ctx, world, view, css, css);
  // Line 2 only, suppressing callsign
  expect(initial.fillTexts.some((t) => t.text === "060  240")).toBe(true);
  expect(initial.fillTexts.some((t) => t.text === "SWA200")).toBe(false);

  // Click toggles to Green FDB
  const p = nmToScreen(ac.xNm, ac.yNm, view.camera, { widthPx: css, heightPx: css });
  handlePpiLeftClick(view, world, p.x, p.y, css, css);

  const fdb = createMockCtx();
  renderScope(fdb.ctx, world, view, css, css);
  const fdbCallsign = fdb.fillTexts.find((t) => t.text === "SWA200");
  expect(fdbCallsign).toBeDefined();
  expect(fdbCallsign?.fillStyle).toBe(PALETTE.unowned);

  // Click again toggles back to PDB
  handlePpiLeftClick(view, world, p.x, p.y, css, css);
  const pdbAgain = createMockCtx();
  renderScope(pdbAgain.ctx, world, view, css, css);
  expect(pdbAgain.fillTexts.some((t) => t.text === "060  240")).toBe(true);
  expect(pdbAgain.fillTexts.some((t) => t.text === "SWA200")).toBe(false);
});

test("T02-35 AC5 — F1 Beaconator replaces callsign with beacon code and forces PDBs to FDBs", () => {
  const owned = makeTestAircraft({
    id: "ac-owned",
    callsign: "DAL123",
    squawk: "0342",
    altitudeFt: 3000,
    speedKt: 210,
    xNm: -2,
    yNm: 0,
  });
  const unowned = makeTestAircraft({
    id: "ac-unowned",
    callsign: "AAL45",
    squawk: "4500",
    altitudeFt: 4000,
    speedKt: 220,
    xNm: 2,
    yNm: 0,
  });
  const world = createWorld({ aircraft: [owned, unowned] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(owned.id)!.ownership = "owned";
  view.tracks.get(owned.id)!.datablockMode = "full";

  const css = 800;
  // Normal state
  const normal = createMockCtx();
  renderScope(normal.ctx, world, view, css, css);
  expect(normal.fillTexts.some((t) => t.text === "DAL123")).toBe(true);
  expect(normal.fillTexts.some((t) => t.text === "AAL45")).toBe(false); // PDB suppresses callsign

  // Beaconator active (F1 pressed)
  view.beaconatorActive = true;
  const beaconator = createMockCtx();
  renderScope(beaconator.ctx, world, view, css, css);
  // Shows beacon code in place of callsign for owned track
  expect(beaconator.fillTexts.some((t) => t.text === "0342")).toBe(true);
  expect(beaconator.fillTexts.some((t) => t.text === "DAL123")).toBe(false);
  // PDB is forced to FDB showing squawk on line 1
  expect(beaconator.fillTexts.some((t) => t.text === "4500")).toBe(true);
  expect(beaconator.fillTexts.some((t) => t.text === "AAL45")).toBe(false);
});

test("T02-35 AC6 — BRITE channel ldb controls brightness of both LDB and PDB blocks", () => {
  const ldbAc = makeTestAircraft({
    id: "ac-ldb",
    callsign: "VFR1",
    squawk: "1200",
    altitudeFt: 3000,
    speedKt: 150,
    xNm: -2,
    yNm: 0,
  });
  const pdbAc = makeTestAircraft({
    id: "ac-pdb",
    callsign: "SWA2",
    altitudeFt: 5000,
    speedKt: 220,
    xNm: 2,
    yNm: 0,
  });
  const world = createWorld({ aircraft: [ldbAc, pdbAc] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(ldbAc.id)!.datablockMode = "limited";
  view.tracks.get(ldbAc.id)!.unassociated = true;

  const css = 800;
  // Default brightness (level 10 -> 100%)
  const def = createMockCtx();
  renderScope(def.ctx, world, view, css, css);
  const ldbDef = def.fillTexts.find((t) => t.text === "1200 030");
  const pdbDef = def.fillTexts.find((t) => t.text === "050  220");
  expect(ldbDef?.fillStyle).toBe(applyBrite(PALETTE.unowned, 100));
  expect(pdbDef?.fillStyle).toBe(applyBrite(PALETTE.unowned, 100));

  // Dim LDB channel by -5 (level 5 -> 50%)
  stepBriteChannel(view, "ldb", -5);
  const dimmed = createMockCtx();
  renderScope(dimmed.ctx, world, view, css, css);
  const ldbDim = dimmed.fillTexts.find((t) => t.text === "1200 030");
  const pdbDim = dimmed.fillTexts.find((t) => t.text === "050  220");
  expect(ldbDim?.fillStyle).toBe(applyBrite(PALETTE.unowned, 50));
  expect(pdbDim?.fillStyle).toBe(applyBrite(PALETTE.unowned, 50));
});

test("T02-37 AC1 — Inbound handoff visual blinking cadence and acceptance to solid white", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 8000,
    speedKt: 250,
  });
  const world = createWorld({ aircraft: [dal], simTimeMs: 0 });
  world.handoffs.set(dal.id, { kind: "inbound", fromSectorId: "C" });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  // t=0ms (blink ON phase): visible, white FDB
  world.simTimeMs = 0;
  const mockOn1 = createMockCtx();
  renderScope(mockOn1.ctx, world, view, 800, 800);
  const callsignOn1 = mockOn1.fillTexts.find((t) => t.text === "DAL123");
  expect(callsignOn1).toBeDefined();
  expect(callsignOn1?.fillStyle).toBe(PALETTE.owned);

  // Transferring sector ID symbol "C"
  const targetSymbol1 = mockOn1.fillTexts.find((t) => t.text === "C");
  expect(targetSymbol1).toBeDefined();

  // t=500ms (blink OFF phase): datablock is not drawn (blinks off)
  world.simTimeMs = 500;
  const mockOff = createMockCtx();
  renderScope(mockOff.ctx, world, view, 800, 800);
  const callsignOff = mockOff.fillTexts.find((t) => t.text === "DAL123");
  expect(callsignOff).toBeUndefined();

  // t=1000ms (blink ON phase again): visible
  world.simTimeMs = 1000;
  const mockOn2 = createMockCtx();
  renderScope(mockOn2.ctx, world, view, 800, 800);
  expect(mockOn2.fillTexts.some((t) => t.text === "DAL123")).toBe(true);

  // Accept handoff via click
  const p = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: 800, heightPx: 800 });
  handlePpiLeftClick(view, world, p.x, p.y, 800, 800);

  // Now accepted: solid white FDB across both 0ms and 500ms phases!
  world.simTimeMs = 500;
  const mockAccepted = createMockCtx();
  renderScope(mockAccepted.ctx, world, view, 800, 800);
  const callsignAccepted = mockAccepted.fillTexts.find((t) => t.text === "DAL123");
  expect(callsignAccepted).toBeDefined();
  expect(callsignAccepted?.fillStyle).toBe(PALETTE.owned);

  // Position symbol updated to receiving sector ID ("D")
  const targetSymbolAccepted = mockAccepted.fillTexts.find((t) => t.text === "D");
  expect(targetSymbolAccepted).toBeDefined();
});

test("T02-37 AC2 — Outbound accepted handoff flashes white for 5 seconds on sender scope", () => {
  const dep = makeTestAircraft({
    id: "ac-dep",
    callsign: "SWA555",
    altitudeFt: 6000,
    speedKt: 250,
  });
  const world = createWorld({ aircraft: [dep], simTimeMs: 1000 });
  world.handoffs.set(dep.id, {
    kind: "outbound",
    toSectorId: "C",
    status: "accepted",
    acceptedAtSimMs: 1000,
  });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  // Position symbol shows receiver's sector ID ("C")
  const mockSym = createMockCtx();
  renderScope(mockSym.ctx, world, view, 800, 800);
  expect(mockSym.fillTexts.some((t) => t.text === "C")).toBe(true);

  // During 5s window (t=1000 to t=6000ms): flashes white
  world.simTimeMs = 1200; // blink on
  const mockFlashOn = createMockCtx();
  renderScope(mockFlashOn.ctx, world, view, 800, 800);
  expect(mockFlashOn.fillTexts.find((t) => t.text === "SWA555")?.fillStyle).toBe(PALETTE.owned);

  world.simTimeMs = 1700; // blink off
  const mockFlashOff = createMockCtx();
  renderScope(mockFlashOff.ctx, world, view, 800, 800);
  expect(mockFlashOff.fillTexts.some((t) => t.text === "SWA555")).toBe(false);

  // After 5s window (e.g. t=6500ms): settles (stops blinking)
  world.simTimeMs = 6500;
  const mockSettled = createMockCtx();
  renderScope(mockSettled.ctx, world, view, 800, 800);
  expect(mockSettled.fillTexts.find((t) => t.text === "SWA555")?.fillStyle).toBe(PALETTE.owned);
});

test("T02-37 AC3 / AC4 — Incoming pointout renders blinking Yellow FDB with PO; acceptance renders solid Yellow", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 9000,
    speedKt: 240,
  });
  const world = createWorld({ aircraft: [dal], simTimeMs: 0 });
  world.handoffs.set(dal.id, { kind: "pointout_inbound", fromSectorId: "C", status: "pending" });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  // t=0ms (blink on): Yellow FDB with "DAL123 PO"
  world.simTimeMs = 0;
  const mockPoOn = createMockCtx();
  renderScope(mockPoOn.ctx, world, view, 800, 800);
  const poLine1 = mockPoOn.fillTexts.find((t) => t.text === "DAL123 PO");
  expect(poLine1).toBeDefined();
  expect(poLine1?.fillStyle).toBe(PALETTE.caution); // #FFFF00

  // t=500ms (blink off): not drawn
  world.simTimeMs = 500;
  const mockPoOff = createMockCtx();
  renderScope(mockPoOff.ctx, world, view, 800, 800);
  expect(mockPoOff.fillTexts.some((t) => t.text === "DAL123 PO")).toBe(false);

  // Slew/click accepts pointout into solid yellow FDB without PO tag
  const p = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: 800, heightPx: 800 });
  handlePpiLeftClick(view, world, p.x, p.y, 800, 800);

  world.simTimeMs = 500;
  const mockAccepted = createMockCtx();
  renderScope(mockAccepted.ctx, world, view, 800, 800);
  const acceptedLine1 = mockAccepted.fillTexts.find((t) => t.text === "DAL123");
  expect(acceptedLine1).toBeDefined();
  expect(acceptedLine1?.fillStyle).toBe(PALETTE.caution); // Solid Yellow #FFFF00
  expect(mockAccepted.fillTexts.some((t) => t.text === "DAL123 PO")).toBe(false);
});

test("T02-37 AC4 — Rejected pointout displays flashing UN on sender display", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 9000,
    speedKt: 240,
  });
  const world = createWorld({ aircraft: [dal], simTimeMs: 0 });
  world.handoffs.set(dal.id, { kind: "pointout_outbound", toSectorId: "C", status: "rejected" });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  // t=0ms: shows UN tag
  world.simTimeMs = 0;
  const mockUnOn = createMockCtx();
  renderScope(mockUnOn.ctx, world, view, 800, 800);
  expect(mockUnOn.fillTexts.some((t) => t.text === "DAL123 UN")).toBe(true);

  // t=500ms: tag blinks off
  world.simTimeMs = 500;
  const mockUnOff = createMockCtx();
  renderScope(mockUnOff.ctx, world, view, 800, 800);
  expect(mockUnOff.fillTexts.some((t) => t.text === "DAL123 UN")).toBe(false);
});

test("T02-37 AC5 — Datablock renders in standard STARS Cyan highlight (#00FFFF) when highlighted", () => {
  const ac = makeTestAircraft({
    id: "ac-1",
    callsign: "AAL100",
    altitudeFt: 5000,
    speedKt: 210,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  // Highlight track
  view.tracks.get(ac.id)!.highlighted = true;
  const mock = createMockCtx();
  renderScope(mock.ctx, world, view, 800, 800);

  const datablockText = mock.fillTexts.find((t) => t.text === "AAL100" || t.text === "050  210");
  expect(datablockText).toBeDefined();
  expect(datablockText?.fillStyle).toBe(PALETTE.highlight);
  expect(PALETTE.highlight).toBe("#00FFFF");
});
