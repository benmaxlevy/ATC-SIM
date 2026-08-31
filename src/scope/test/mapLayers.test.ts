import { expect, test, vi } from "vitest";
import { SIM_DT_S, createWorld, stepWorld } from "@core";
import { loadKdem } from "@scenario";
import { DEFAULT_SCOPE_CAMERA, nmToScreen, type ScopeCamera, type ScopeViewSize } from "../camera";
import {
  DEFAULT_DIGITAL_MAP,
  DEFAULT_MAP_LAYER_FLAGS,
  FEATHER_NM_TOLERANCE,
  activeRingRadiiNm,
  buildLocalizerFeather,
  buildMapCache,
  headingOffsetNm,
  nmDistance,
  parseDigitalMap,
  resetDigitalMapWarnings,
  reuseOrBuildMapCache,
  toMapCacheInput,
  type MapCacheInput,
  type MapCacheView,
} from "../mapLayers";

const VIEW: ScopeViewSize = { widthPx: 800, heightPx: 800 };

function kdemInput(overrides: Partial<MapCacheInput> = {}): MapCacheInput {
  const digitalMap = parseDigitalMap(loadKdem().maps);
  return {
    digitalMap,
    camera: { ...DEFAULT_SCOPE_CAMERA },
    viewSize: VIEW,
    layers: { ...DEFAULT_MAP_LAYER_FLAGS, showCoastline: digitalMap.coastline?.enabled === true },
    airportEastNm: 0,
    airportNorthNm: 0,
    ringIntervalNm: digitalMap.rangeRings.intervalNm,
    ...overrides,
  };
}

function viewFromInput(input: MapCacheInput): MapCacheView {
  return {
    camera: input.camera,
    digitalMap: input.digitalMap,
    showRunway: input.layers.showRunway,
    showLocalizer: input.layers.showLocalizer,
    showRings: input.layers.showRings,
    showCoastline: input.layers.showCoastline,
    airportEastNm: input.airportEastNm,
    airportNorthNm: input.airportNorthNm,
    mapVisibility: input.mapVisibility,
    ringIntervalNm: input.ringIntervalNm,
    briteMpa: input.briteMpa,
    briteMpb: input.briteMpb,
    briteRr: input.briteRr,
  };
}

test("AC2 — localizer feather vertices are 10 NM along 090° ± 2.5°", () => {
  const maps = loadKdem().maps;
  expect(maps.runway).toBeDefined();
  expect(maps.localizer).toBeDefined();
  const [apex, left, right] = buildLocalizerFeather(maps.runway!, maps.localizer!);
  expect(apex.eastNm).toBeCloseTo(0, 6);
  expect(apex.northNm).toBeCloseTo(0, 6);
  expect(nmDistance(apex, left)).toBeLessThanOrEqual(10 + FEATHER_NM_TOLERANCE);
  expect(nmDistance(apex, right)).toBeLessThanOrEqual(10 + FEATHER_NM_TOLERANCE);
  expect(Math.abs(nmDistance(apex, left) - 10)).toBeLessThanOrEqual(FEATHER_NM_TOLERANCE);
  expect(Math.abs(nmDistance(apex, right) - 10)).toBeLessThanOrEqual(FEATHER_NM_TOLERANCE);

  const expectedLeft = headingOffsetNm(0, 0, 90 - 2.5, 10);
  const expectedRight = headingOffsetNm(0, 0, 90 + 2.5, 10);
  expect(left.eastNm).toBeCloseTo(expectedLeft.eastNm, 5);
  expect(left.northNm).toBeCloseTo(expectedLeft.northNm, 5);
  expect(right.eastNm).toBeCloseTo(expectedRight.eastNm, 5);
  expect(right.northNm).toBeCloseTo(expectedRight.northNm, 5);
  expect(left.eastNm).toBeGreaterThan(9);
  expect(right.eastNm).toBeGreaterThan(9);
});

test("AC3 — range rings draw out to maxNm regardless of zoom level", () => {
  expect(activeRingRadiiNm(60)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  expect(activeRingRadiiNm({ intervalNm: 5, maxNm: 60 })).toEqual([
    5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60,
  ]);
  expect(activeRingRadiiNm({ intervalNm: 10, maxNm: 60 })).toEqual([10, 20, 30, 40, 50, 60]);
  expect(activeRingRadiiNm({ intervalNm: 5, maxNm: 20 })).toEqual([5, 10, 15, 20]);

  const at20 = buildMapCache(kdemInput());
  expect(at20.ringRadiiNm).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  const at5 = buildMapCache(
    kdemInput({ camera: { ...DEFAULT_SCOPE_CAMERA, rangeNm: 5 } satisfies ScopeCamera }),
  );
  expect(at5.ringRadiiNm).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
});

test("AC4 — coastline.enabled false skips the polyline; true with ≥2 points keeps it", () => {
  const baseMap = parseDigitalMap(loadKdem().maps);
  const digitalMap = {
    ...baseMap,
    coastline: {
      enabled: true,
      polyline: [
        [-5, -10],
        [-5, 10],
      ] as [number, number][],
    },
  };
  const enabled = buildMapCache(
    kdemInput({
      digitalMap,
      layers: { ...DEFAULT_MAP_LAYER_FLAGS, showCoastline: true },
    }),
  );
  expect(digitalMap.coastline?.enabled).toBe(true);
  expect(enabled.coastline).not.toBeNull();
  expect(enabled.coastline!.length).toBeGreaterThanOrEqual(2);

  const disabledMap = {
    ...digitalMap,
    coastline: { ...digitalMap.coastline, enabled: false },
  };
  const disabled = buildMapCache(
    kdemInput({
      digitalMap: disabledMap,
      layers: { ...DEFAULT_MAP_LAYER_FLAGS, showCoastline: true },
    }),
  );
  expect(disabled.coastline).toBeNull();
});

test("AC5 — showLocalizer off drops the feather and keeps the runway", () => {
  const withLoc = buildMapCache(kdemInput());
  expect(withLoc.runway).not.toBeNull();
  expect(withLoc.localizer).not.toBeNull();
  expect(withLoc.localizer).toHaveLength(3);

  const noLoc = buildMapCache(
    kdemInput({
      layers: { ...DEFAULT_MAP_LAYER_FLAGS, showLocalizer: false, showCoastline: true },
    }),
  );
  expect(noLoc.localizer).toBeNull();
  expect(noLoc.runway).not.toBeNull();
  expect(noLoc.runway).toEqual(withLoc.runway);
});

test("AC1 geometry — runway sits at center; feather extends east ~10 NM", () => {
  const cache = buildMapCache(kdemInput());
  expect(cache.runway).not.toBeNull();
  const midX = cache.runway!.reduce((sum, p) => sum + p.x, 0) / cache.runway!.length;
  const midY = cache.runway!.reduce((sum, p) => sum + p.y, 0) / cache.runway!.length;
  expect(Math.abs(midX - 400)).toBeLessThan(20);
  expect(Math.abs(midY - 400)).toBeLessThan(20);

  const far = cache.localizer!.reduce((best, p) => (p.x > best.x ? p : best));
  expect(far.x).toBeGreaterThan(400 + 150);
  expect(Math.abs(far.x - 600)).toBeLessThan(20);
});

test("JSON defaulting — missing rangeRings uses 5/60; missing runway warns once", () => {
  resetDigitalMapWarnings();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const parsed = parseDigitalMap({ videoMaps: [] });
  expect(parsed.runway).toBeUndefined();
  expect(parsed.rangeRings).toEqual({ intervalNm: 5, maxNm: 60 });
  expect(parsed.coastline).toBeUndefined();
  parseDigitalMap({ videoMaps: [] });
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]?.[0]).toMatch(/runway/i);
  expect(warn.mock.calls[0]?.[0]).toMatch(/range rings/i);
  warn.mockRestore();
  resetDigitalMapWarnings();
});

test("AC3 — video map polylines (e.g. DEM1_27) appear in the cache", () => {
  const cache = buildMapCache(kdemInput());
  expect(cache.videoStrokes.length).toBeGreaterThanOrEqual(2);
  const dem1Strokes = cache.videoStrokes.filter((stroke) => stroke.mapId === "DEM1_27");
  expect(dem1Strokes.length).toBeGreaterThanOrEqual(2);
  expect(dem1Strokes.every((stroke) => stroke.color === "map")).toBe(true);
  expect(cache.videoLabels.some((label) => label.text === "NEMAX")).toBe(true);
  expect(
    cache.videoLabels
      .filter((label) => label.text === "NEMAX")
      .every((label) => label.color === "map"),
  ).toBe(true);
});

test("runway labels 27 and 9 sit at opposite thresholds", () => {
  const cache = buildMapCache(kdemInput());
  const texts = cache.runwayLabels.map((label) => label.text).sort();
  expect(texts).toEqual(["27", "9"]);
  const label27 = cache.runwayLabels.find((label) => label.text === "27");
  const label9 = cache.runwayLabels.find((label) => label.text === "9");
  expect(label27).toBeDefined();
  expect(label9).toBeDefined();
  expect(label9!.x).toBeLessThan(label27!.x);
  expect(label27!.x).toBeCloseTo(400, 0);
});

test("LOC09 feather uses RWY 09 threshold and extends west — not a copy of LOC27", () => {
  const vis = new Map<string, boolean>([
    ["RWY", true],
    ["LOC27", false],
    ["LOC09", true],
  ]);
  const loc09 = buildMapCache(kdemInput({ mapVisibility: vis }));
  expect(loc09.localizers).toHaveLength(1);
  expect(loc09.localizer).toHaveLength(3);
  const maxX = Math.max(...loc09.localizer!.map((p) => p.x));
  const minX = Math.min(...loc09.localizer!.map((p) => p.x));
  expect(maxX).toBeLessThan(400);
  expect(minX).toBeLessThan(400 - 150);

  const loc27 = buildMapCache(kdemInput());
  const loc27MaxX = Math.max(...loc27.localizer!.map((p) => p.x));
  expect(loc27MaxX).toBeGreaterThan(400 + 150);
  expect(loc09.localizer).not.toEqual(loc27.localizer);
});

test("LOC27 and LOC09 can both paint when both maps are on", () => {
  const vis = new Map<string, boolean>([
    ["RWY", true],
    ["LOC27", true],
    ["LOC09", true],
  ]);
  const cache = buildMapCache(kdemInput({ mapVisibility: vis }));
  expect(cache.localizers).toHaveLength(2);
  const east = cache.localizers[0]!;
  const west = cache.localizers[1]!;
  expect(Math.max(...east.map((p) => p.x))).toBeGreaterThan(400);
  expect(Math.max(...west.map((p) => p.x))).toBeLessThan(400);
});

test("AC6 — map layers use scenario JSON + camera, not OSM/tiles", () => {
  const sources = import.meta.glob("../*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["../mapLayers.ts"] ?? "";
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/MAPS/);
  expect(src).toMatch(/video maps/i);
  expect(src).toMatch(/trainer-authored JSON/i);
  expect(src.toLowerCase()).not.toMatch(/openstreetmap/);
  expect(src.toLowerCase()).not.toMatch(/mapbox/);
  expect(src.toLowerCase()).not.toMatch(/satellite/);
  expect(src).not.toMatch(/JSON\.parse/);
  expect(src).toMatch(/Not OSM/);
  expect(DEFAULT_DIGITAL_MAP.rangeRings.intervalNm).toBe(5);
});

test("AC7 — buildMapCache is not invoked from stepWorld; rebuilds on camera change", () => {
  const sources = import.meta.glob(["../*.ts", "../../core/world.ts"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const worldSrc = sources["../../core/world.ts"] ?? "";
  const mapSrc = sources["../mapLayers.ts"] ?? "";
  expect(worldSrc).not.toMatch(/buildMapCache|mapLayers|parseDigitalMap/);
  expect(mapSrc).not.toMatch(/\bstepWorld\b/);

  const input = kdemInput();
  const view = viewFromInput(input);
  let cache = reuseOrBuildMapCache(null, toMapCacheInput(view, VIEW));
  const first = cache;
  const world = createWorld();
  for (let i = 0; i < 20; i += 1) {
    stepWorld(world, SIM_DT_S);
    cache = reuseOrBuildMapCache(cache, toMapCacheInput(view, VIEW));
  }
  expect(cache).toBe(first);

  view.camera.rangeNm = 10;
  cache = reuseOrBuildMapCache(cache, toMapCacheInput(view, VIEW));
  expect(cache).not.toBe(first);
  expect(cache.ringRadiiNm).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
});

test("panned view without PLACE RR keeps rings at airport ref", () => {
  const panned = buildMapCache(
    kdemInput({
      camera: { rangeNm: 20, centerEastNm: 8, centerNorthNm: -4 },
    }),
  );
  const airport = panned.ringCircles[0];
  expect(airport).toBeDefined();
  expect(airport!.x).not.toBeCloseTo(400, 0);
  expect(panned.ringRadiiNm).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  for (const circle of panned.ringCircles) {
    expect(circle.x).toBeCloseTo(airport!.x, 6);
    expect(circle.y).toBeCloseTo(airport!.y, 6);
  }
});

test("AC4 — range rings draw about PLACE RR origin, not only airport ref", () => {
  const origin = { rangeRingEastNm: 5, rangeRingNorthNm: -3 };
  const cache = buildMapCache(kdemInput(origin));
  expect(cache.ringRadiiNm).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  const expected = nmToScreen(5, -3, DEFAULT_SCOPE_CAMERA, VIEW);
  expect(cache.ringCircles.length).toBeGreaterThan(0);
  for (const circle of cache.ringCircles) {
    expect(circle.x).toBeCloseTo(expected.x, 6);
    expect(circle.y).toBeCloseTo(expected.y, 6);
  }
  const airport = nmToScreen(0, 0, DEFAULT_SCOPE_CAMERA, VIEW);
  expect(cache.ringCircles[0]!.x).not.toBeCloseTo(airport.x, 0);
});
