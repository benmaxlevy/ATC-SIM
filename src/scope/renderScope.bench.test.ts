/**
 * T02-12 Canvas2D budget: 30 TRACKS at ~60 FPS (architecture quality bar).
 * Bench chrome uses TRACKS (R12). No WebGL in this phase.
 *
 * Wall-time < 2000 ms for 60 frames is a loose CI gate when a real canvas
 * exists — CI is not a GPU. Manual Chrome p50 is AC4.
 */

import { describe, expect, test, vi } from "vitest";
import { SIM_DT_S, createWorld, stepWorld } from "@core";
import { loadKdem, spawnArrivals } from "@scenario";
import { formatFpsDebug } from "../ui/fpsHud";
import { HISTORY_MAX_DOTS } from "./history";
import { getMapCacheBuildCount, parseDigitalMap, resetMapCacheBuildCount } from "./mapLayers";
import { renderScope } from "./renderScope";
import { createScopeView } from "./scopeView";
import { syncTrackDisplays } from "./trackDisplay";

const BENCH_WIDTH = 1280;
const BENCH_HEIGHT = 800;
const FRAME_COUNT = 60;
/** Loose per-frame beginPath cap: diamond + heading tick + leader per track + map/chrome. */
const BEGIN_PATH_BUDGET = 120;
/** Two datablock lines plus CSI stub per track, not per character, plus range/filter/runway. */
const FILL_TEXT_BUDGET = 105;

function createRecordingCtx(): {
  ctx: CanvasRenderingContext2D;
  beginPathCount: number;
  fillTextCount: number;
  reset(): void;
} {
  const rec = {
    ctx: null as unknown as CanvasRenderingContext2D,
    beginPathCount: 0,
    fillTextCount: 0,
    reset() {
      rec.beginPathCount = 0;
      rec.fillTextCount = 0;
    },
  };
  rec.ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textBaseline: "alphabetic",
    textAlign: "start",
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {
      rec.beginPathCount += 1;
    },
    closePath() {},
    arc() {},
    clip() {},
    stroke() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    setTransform() {},
    strokeRect() {},
    measureText(text: string) {
      return { width: Math.max(0, text.length) * 7.2 };
    },
    fillText() {
      rec.fillTextCount += 1;
    },
  } as unknown as CanvasRenderingContext2D;
  return rec;
}

function benchWorldAndView(): {
  world: ReturnType<typeof createWorld>;
  view: ReturnType<typeof createScopeView>;
} {
  const world = createWorld();
  spawnArrivals(world, 30);
  const view = createScopeView(0, 0, {
    digitalMap: parseDigitalMap(loadKdem().maps),
    showCoastline: true,
  });
  view.historyEnabled = true;
  view.ptlOn = false;
  view.showRunway = true;
  view.showLocalizer = true;
  view.showRings = true;
  return { world, view };
}

function tryReal2dContext(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof OffscreenCanvas !== "function") {
    return null;
  }
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    return ctx as CanvasRenderingContext2D | null;
  } catch {
    return null;
  }
}

test("AC2 — 30-track renderScope runs 60 times; map cache rebuilt once for a static camera", () => {
  const { world, view } = benchWorldAndView();
  expect(world.aircraft).toHaveLength(30);
  const rec = createRecordingCtx();
  resetMapCacheBuildCount();
  const parseSpy = vi.spyOn(JSON, "parse");

  let maxBeginPath = 0;
  let maxFillText = 0;
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    rec.reset();
    renderScope(rec.ctx, world, view, BENCH_WIDTH, BENCH_HEIGHT);
    maxBeginPath = Math.max(maxBeginPath, rec.beginPathCount);
    maxFillText = Math.max(maxFillText, rec.fillTextCount);
  }

  expect(getMapCacheBuildCount()).toBe(1);
  expect(view.mapCache).not.toBeNull();
  const parseCalls = parseSpy.mock.calls.length;
  parseSpy.mockRestore();
  expect(parseCalls).toBe(0);
  expect(maxBeginPath).toBeLessThanOrEqual(BEGIN_PATH_BUDGET);
  expect(maxFillText).toBeLessThanOrEqual(FILL_TEXT_BUDGET);
});

test("AC3 — each track history length ≤ 5 after a long stepWorld", () => {
  const { world, view } = benchWorldAndView();
  const steps = Math.round(90 / SIM_DT_S);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, SIM_DT_S);
    syncTrackDisplays(view.tracks, world);
  }
  expect(world.aircraft).toHaveLength(30);
  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    expect(td, ac.callsign).toBeDefined();
    expect(td!.history.eastNm.length).toBeLessThanOrEqual(HISTORY_MAX_DOTS);
    expect(td!.history.timesSimMs.length).toBe(HISTORY_MAX_DOTS);
    expect(td!.history.northNm.length).toBe(HISTORY_MAX_DOTS);
  }
});

test("AC6 — getContext('webgl') unused; paint path is Canvas2D", () => {
  const sources = import.meta.glob(["../**/*.{ts,tsx}", "./*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  for (const [path, src] of Object.entries(sources)) {
    if (path.includes(".test.") || path.includes(".bench.")) {
      continue;
    }
    expect(String(src), path).not.toMatch(/getContext\(\s*['"]webgl/i);
    expect(String(src), path).not.toMatch(/WebGLRenderingContext/);
  }
});

test("AC7 — bench chrome names TRACKS", () => {
  expect(formatFpsDebug(30, 59)).toBe("30 TRACKS  FPS 59");
});

test("hot path — renderScope does not parse KDEM JSON or loop characters into fillText", () => {
  const sources = import.meta.glob("./renderScope.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./renderScope.ts"] ?? "";
  expect(src).not.toMatch(/JSON\.parse/);
  expect(src).not.toMatch(/kdem\.json/);
  expect(src).toMatch(/Hot path \(T02-12\)/);
  expect(src).toMatch(/fillText per/);
});

const realCtx = tryReal2dContext(BENCH_WIDTH, BENCH_HEIGHT);

describe.skipIf(!realCtx)("wall-time (real canvas; CI is not a GPU)", () => {
  // 60 frames in < 2000 ms is a loose Node gate, not the Chrome integrated-GPU bar.
  test("60 frames of 30 tracks in < 2000 ms", () => {
    const ctx = realCtx!;
    const { world, view } = benchWorldAndView();
    const started = performance.now();
    for (let i = 0; i < FRAME_COUNT; i += 1) {
      renderScope(ctx, world, view, BENCH_WIDTH, BENCH_HEIGHT);
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(2000);
  });
});
