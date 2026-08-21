import { expect, test } from "vitest";
import { SIM_DT_S, createWorld, makeTestAircraft, stepWorld } from "@core";
import { applyIntent } from "@pilot";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { formatRangeReadout, nmToScreen } from "./camera";
import { parseDigitalMap } from "./mapLayers";
import { PALETTE } from "./palette";
import { PTL_MINUTES, ptlEndpoint, shouldDrawPtl } from "./ptl";
import { renderScope } from "./renderScope";
import { createScopeView } from "./scopeView";
import { SELECTED_ACCENT_COLOR, TARGET_SIZE_PX, UNOWNED_TRACK_COLOR } from "./targetSymbol";
import { isIdentFlashing } from "./trackDisplay";
import { DATABLOCK_FONT, DATABLOCK_FONT_PX } from "./fonts";
import { formatFullDatablock, formatLimitedDatablock, datablockMetrics } from "./datablock";
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

test("AC1 — six spawned arrivals get a 6×6 target at nmToScreen ±2 px", () => {
  const world = createWorldFromScenario(loadKdem());
  expect(world.aircraft).toHaveLength(6);
  const view = createScopeView();
  const { ctx, strokeRects, fillTexts } = createMockCtx();
  const css = 800;
  renderScope(ctx, world, view, css, css);
  const targets = strokeRects.filter((r) => r.w === TARGET_SIZE_PX && r.h === TARGET_SIZE_PX);
  expect(targets).toHaveLength(6);
  const size = { widthPx: css, heightPx: css };
  for (const ac of world.aircraft) {
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const hit = targets.find(
      (r) =>
        Math.abs(r.x + TARGET_SIZE_PX / 2 - p.x) <= 2 &&
        Math.abs(r.y + TARGET_SIZE_PX / 2 - p.y) <= 2,
    );
    expect(hit, ac.callsign).toBeDefined();
    const block = formatFullDatablock(ac);
    const line1 = fillTexts.filter((t) => t.text === ac.callsign && t.font === DATABLOCK_FONT);
    expect(line1, ac.callsign).toHaveLength(1);
    expect(
      fillTexts.some((t) => t.text === block.line2 && t.font === DATABLOCK_FONT),
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
  const yellow = at1s.strokeRects.filter(
    (r) => r.w === 6 && r.strokeStyle === SELECTED_ACCENT_COLOR,
  );
  expect(yellow.length).toBeGreaterThanOrEqual(1);

  const at3s = createMockCtx();
  world.simTimeMs = 3000;
  renderScope(at3s.ctx, world, view, 800, 800);
  expect(isIdentFlashing(view.tracks.get(ac.id)!, 3000)).toBe(false);
  const stillYellow = at3s.strokeRects.filter(
    (r) => r.w === 6 && r.strokeStyle === SELECTED_ACCENT_COLOR,
  );
  expect(stillYellow).toHaveLength(0);
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
  expect(sources["./renderScope.ts"]).toMatch(/history/);
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
  expect(sources["./palette.ts"]).toMatch(/#00AA00/);
  expect(sources["./palette.ts"]).toMatch(/#006600/);
  expect(PALETTE.map).toBe("#00AA00");
  expect(PALETTE.mapDim).toBe("#006600");
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

test("T02-04 AC5/AC7 — T limited drops the callsign; no duplicate callsign paint", () => {
  const ac = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3250,
    speedKt: 210,
    xNm: 0,
    yNm: 0,
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
  const targetsOff = off.strokeRects.filter(
    (r) => r.w === TARGET_SIZE_PX && r.h === TARGET_SIZE_PX,
  );
  expect(targetsOff).toHaveLength(1);

  view.ptlOn = true;
  const on = createMockCtx();
  renderScope(on.ctx, world, view, css, css);
  const ptl = findPtlStroke(on.pathStrokes, ac, view, css);
  expect(ptl).toBeDefined();
  expect(ptl!.strokeStyle).toBe(UNOWNED_TRACK_COLOR);
  expect(ptl!.lineWidth).toBe(1);
  const targetsOn = on.strokeRects.filter((r) => r.w === TARGET_SIZE_PX && r.h === TARGET_SIZE_PX);
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

test("AC5 — altitude-filter hook suppresses PTL; target symbol remains", () => {
  expect(shouldDrawPtl(180, true)).toBe(false);
  const ac = makeTestAircraft({
    id: "ac-filter-ptl",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    speedKt: 0,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  view.ptlOn = true;
  const { ctx, pathStrokes, strokeRects } = createMockCtx();
  renderScope(ctx, world, view, 800, 800);
  expect(findPtlStroke(pathStrokes, { ...ac, speedKt: 180 }, view, 800)).toBeUndefined();
  const targets = strokeRects.filter((r) => r.w === TARGET_SIZE_PX && r.h === TARGET_SIZE_PX);
  expect(targets).toHaveLength(1);
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
  expect(src).toMatch(/TODO\(T02-06\)/);
  expect(src).toMatch(/ctx\.clip/);
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

test("AC2 / AC7 — L6 leader points east; leader and datablock match target color", () => {
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
  const { ctx, pathStrokes, fillTexts, strokeRects } = createMockCtx();
  renderScope(ctx, world, view, css, css);
  const p = nmToScreen(ac.xNm, ac.yNm, view.camera, { widthPx: css, heightPx: css });
  const leader = findLeaderStroke(pathStrokes, p.x, p.y, 6);
  expect(leader).toBeDefined();
  expect(leader!.points[1]!.x).toBeGreaterThan(p.x);
  expect(leader!.points[1]!.y).toBeCloseTo(p.y);
  const target = strokeRects.find((r) => r.w === TARGET_SIZE_PX);
  expect(target).toBeDefined();
  expect(leader!.strokeStyle).toBe(target!.strokeStyle);
  const line1 = fillTexts.find((t) => t.text === "DAL123" && t.font === DATABLOCK_FONT);
  expect(line1).toBeDefined();
  expect(line1!.fillStyle).toBe(target!.strokeStyle);
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
