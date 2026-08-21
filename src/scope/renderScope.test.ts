import { expect, test } from "vitest";
import { SIM_DT_S, createWorld, stepWorld } from "@core";
import { loadKdem } from "@scenario";
import { formatRangeReadout } from "./camera";
import { parseDigitalMap } from "./mapLayers";
import { PALETTE } from "./palette";
import { renderScope } from "./renderScope";
import { createScopeView } from "./scopeView";

function mockCtx(): CanvasRenderingContext2D {
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textBaseline: "alphabetic",
    textAlign: "start",
    fillRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    clip: () => undefined,
    stroke: () => undefined,
    fill: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    fillText: () => undefined,
    setTransform: () => undefined,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

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
