/**
 * T04-41 — converted CRC videomap rendering, A/B BRITE channels, invalid
 * geometry guards, and full-pack measurements. No simplification/culling/lazy
 * load: default path is the unsimplified conversion. Not OSM / tiles. Runtime
 * never reads CRC/vNAS. Live src must not import the converter package.
 *
 * *D ALL / *D NONE walk loadedCatalogMaps (T04-40 full inventory), not DCB
 * slots. KATL still omits dcbNumber. Full-pack draw also force-on visibility
 * so worst-case paint stays explicit.
 */
import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { loadVideoMapSet, type LoadedVideoMap } from "@scenario";
import { DEFAULT_SCOPE_CAMERA, type ScopeViewSize } from "../camera";
import {
  dcbCatalogMaps,
  isVideoMapOn,
  setAllVideoMaps,
  stepBriteChannel,
} from "../dcb/dcbFunctions";
import { DEFAULT_MAP_LAYER_FLAGS, buildMapCache, type DigitalMap } from "../mapLayers";
import { PALETTE, applyBrite } from "../palette";
import { parsePreviewCommand } from "../previewArea";
import { renderScope } from "../render/renderScope";
import { createScopeView } from "../scopeView";
import { syncTrackDisplays } from "../trackDisplay";

const VIEW: ScopeViewSize = { widthPx: 800, heightPx: 800 };
const NTZ_EAST_ID = "01KYQRGJFJSQXSW1KW3GJR0235";
const RWY10_ID = "01GQ8KW483X8R4V4QSQRWHE2QP";

function extraMap(
  id: string,
  features: LoadedVideoMap["features"],
  overrides: Partial<LoadedVideoMap> = {},
): LoadedVideoMap {
  return {
    id,
    file: `${id}.json`,
    dcbLabel: id,
    defaultOn: true,
    color: "map",
    name: id,
    features,
    ...overrides,
  };
}

function digitalMapWith(maps: LoadedVideoMap[]): DigitalMap {
  return { rangeRings: { intervalNm: 5, maxNm: 60 }, loadedVideoMaps: maps };
}

function mapOnlyView(maps: LoadedVideoMap[]) {
  const view = createScopeView(0, 0, { digitalMap: digitalMapWith(maps) });
  view.showRunway = false;
  view.showLocalizer = false;
  view.showRings = false;
  view.showCoastline = false;
  return view;
}

function createRecordingCtx(): {
  ctx: CanvasRenderingContext2D;
  beginPathCount: number;
  closePathCount: number;
  strokeCount: number;
  fillTextCount: number;
  fillTexts: { text: string; fillStyle: string }[];
  pathStrokes: { points: { x: number; y: number }[]; strokeStyle: string; closed: boolean }[];
} {
  const rec = {
    ctx: null as unknown as CanvasRenderingContext2D,
    beginPathCount: 0,
    closePathCount: 0,
    strokeCount: 0,
    fillTextCount: 0,
    fillTexts: [] as { text: string; fillStyle: string }[],
    pathStrokes: [] as {
      points: { x: number; y: number }[];
      strokeStyle: string;
      closed: boolean;
    }[],
  };
  let currentPath: { x: number; y: number }[] = [];
  let pathClosed = false;
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
      currentPath = [];
      pathClosed = false;
    },
    closePath() {
      rec.closePathCount += 1;
      pathClosed = true;
    },
    arc() {},
    clip() {},
    rect() {},
    stroke(this: { strokeStyle: string }) {
      rec.strokeCount += 1;
      if (currentPath.length >= 2) {
        rec.pathStrokes.push({
          points: currentPath.slice(),
          strokeStyle: String(this.strokeStyle),
          closed: pathClosed,
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
    strokeRect() {},
    measureText(text: string) {
      return { width: Math.max(0, text.length) * 7.2 };
    },
    fillText(this: { fillStyle: string }, text: string) {
      rec.fillTextCount += 1;
      rec.fillTexts.push({ text, fillStyle: String(this.fillStyle) });
    },
  } as unknown as CanvasRenderingContext2D;
  return rec;
}

function forceAllMapsOn(view: ReturnType<typeof createScopeView>): void {
  for (const map of view.digitalMap.loadedVideoMaps ?? []) {
    view.mapVisibility.set(map.id, true);
  }
  view.mapCache = null;
}

test("T04-41 — open polyline, closed polygon outline, and Point text stroke/fillText", () => {
  const view = mapOnlyView([
    extraMap("LINE", [
      {
        type: "polyline",
        closed: false,
        pointsNm: [
          [0, 0],
          [4, 0],
        ],
      },
    ]),
    extraMap("POLY", [
      {
        type: "polyline",
        closed: true,
        pointsNm: [
          [0, 2],
          [2, 2],
          [1, 4],
        ],
      },
    ]),
    extraMap("LABEL", [{ type: "text", text: "FIXA", atNm: [1, 1] }]),
  ]);
  const rec = createRecordingCtx();
  renderScope(rec.ctx, createWorld(), view, VIEW.widthPx, VIEW.heightPx);

  const open = rec.pathStrokes.find((s) => s.points.length === 2 && !s.closed);
  expect(open).toBeDefined();
  expect(open!.strokeStyle).toBe(applyBrite(PALETTE.map, view.brite.mpa));

  const closed = rec.pathStrokes.find((s) => s.points.length === 3 && s.closed);
  expect(closed).toBeDefined();
  expect(rec.closePathCount).toBeGreaterThanOrEqual(1);

  expect(rec.fillTexts.some((t) => t.text === "FIXA")).toBe(true);
  expect(view.mapCache?.videoLabels.some((label) => label.text === "FIXA")).toBe(true);
});

test("T04-41 — converted KATL polylines paint; catalog map vs mapDim hit MPA vs MPB", () => {
  const maps = loadVideoMapSet("KATL");
  const ntz = maps.find((map) => map.id === NTZ_EAST_ID);
  const rwy10 = maps.find((map) => map.id === RWY10_ID);
  expect(ntz?.color).toBe("map");
  expect(rwy10?.color).toBe("map");
  const dim = extraMap(
    "DIM",
    [
      {
        type: "polyline",
        closed: false,
        pointsNm: [
          [-1, -1],
          [1, 1],
        ],
      },
    ],
    { color: "mapDim" },
  );
  const view = mapOnlyView([ntz!, dim]);
  forceAllMapsOn(view);
  view.brite.mpa = 80;
  view.brite.mpb = 40;
  const rec = createRecordingCtx();
  renderScope(rec.ctx, createWorld(), view, VIEW.widthPx, VIEW.heightPx);

  const mpa = applyBrite(PALETTE.map, 80);
  const mpb = applyBrite(PALETTE.mapDim, 40);
  expect(mpa).not.toBe(mpb);
  expect(rec.pathStrokes.some((s) => s.strokeStyle === mpa)).toBe(true);
  expect(rec.pathStrokes.some((s) => s.strokeStyle === mpb)).toBe(true);
  expect(
    view.mapCache?.videoStrokes.some((s) => s.mapId === NTZ_EAST_ID && s.color === "map"),
  ).toBe(true);
  expect(view.mapCache?.videoStrokes.some((s) => s.mapId === "DIM" && s.color === "mapDim")).toBe(
    true,
  );
});

test("T04-41 — BRITE multiplies intensity; does not toggle availability or track colors", () => {
  const map = extraMap("BRITE", [
    {
      type: "polyline",
      closed: false,
      pointsNm: [
        [0, 0],
        [2, 0],
      ],
    },
  ]);
  const view = mapOnlyView([map]);
  const ac = makeTestAircraft({ id: "ac-brite", callsign: "DAL123", xNm: 0, yNm: 0 });
  const world = createWorld({ aircraft: [ac] });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(ac.id)!.datablockMode = "full";
  expect(isVideoMapOn(view, "BRITE")).toBe(true);

  const before = createRecordingCtx();
  renderScope(before.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  const trackBefore = before.fillTexts.find((t) => t.text === "DAL123")?.fillStyle;
  expect(trackBefore).toBeDefined();

  stepBriteChannel(view, "mpa", -6);
  stepBriteChannel(view, "mpb", -5);
  expect(view.brite.mpa).toBe(40);
  expect(view.brite.mpb).toBe(50);
  expect(isVideoMapOn(view, "BRITE")).toBe(true);

  const after = createRecordingCtx();
  renderScope(after.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  const mapPaint = applyBrite(PALETTE.map, 40);
  const mapStroke = after.pathStrokes.find((s) => s.strokeStyle === mapPaint);
  expect(mapStroke).toBeDefined();
  expect(mapStroke!.points.length).toBeGreaterThanOrEqual(2);
  expect(mapPaint).not.toBe(applyBrite(PALETTE.map, 100));
  expect(after.fillTexts.find((t) => t.text === "DAL123")?.fillStyle).toBe(trackBefore);
  expect(after.fillTexts.some((t) => t.text === "DAL123")).toBe(true);
});

test("T04-41 — null, empty, and <2-point features never reach canvas stroke/fillText", () => {
  const view = mapOnlyView([
    extraMap("BAD", [
      { type: "polyline", closed: false, pointsNm: [[0, 0]] },
      {
        type: "polyline",
        closed: false,
        pointsNm: [
          [Number.NaN, 0],
          [1, Number.NaN],
        ],
      },
      {
        type: "polyline",
        closed: false,
        pointsNm: [
          [0, 0],
          [Number.POSITIVE_INFINITY, 1],
        ],
      },
      { type: "text", text: "", atNm: [0, 0] },
      { type: "text", text: "DROP", atNm: [Number.NaN, 0] },
      {
        type: "polyline",
        closed: false,
        pointsNm: [
          [0, 1],
          [2, 1],
        ],
      },
      { type: "text", text: "KEEP", atNm: [0, 2] },
    ]),
  ]);
  const rec = createRecordingCtx();
  renderScope(rec.ctx, createWorld(), view, VIEW.widthPx, VIEW.heightPx);

  expect(view.mapCache?.videoStrokes).toHaveLength(1);
  expect(view.mapCache?.videoStrokes[0]?.points).toHaveLength(2);
  expect(view.mapCache?.videoLabels.map((label) => label.text)).toEqual(["KEEP"]);
  expect(rec.pathStrokes).toHaveLength(1);
  expect(rec.fillTexts.some((t) => t.text === "KEEP")).toBe(true);
  expect(rec.fillTexts.some((t) => t.text === "DROP")).toBe(false);
  expect(rec.fillTexts.some((t) => t.text === "")).toBe(false);
});

test("T04-41 — drawMapLayers skips slipped <2-point cache strokes", () => {
  const view = mapOnlyView([
    extraMap("OK", [
      {
        type: "polyline",
        closed: false,
        pointsNm: [
          [0, 0],
          [1, 0],
        ],
      },
    ]),
  ]);
  const rec = createRecordingCtx();
  renderScope(rec.ctx, createWorld(), view, VIEW.widthPx, VIEW.heightPx);
  const cache = view.mapCache;
  expect(cache).not.toBeNull();
  cache!.videoStrokes.push({
    mapId: "SLIP",
    color: "map",
    closed: false,
    points: [{ x: 10, y: 10 }],
  });
  const slipped = createRecordingCtx();
  // Reuse poisoned cache: camera key unchanged so renderScope must skip the stub.
  view.mapCache = cache;
  renderScope(slipped.ctx, createWorld(), view, VIEW.widthPx, VIEW.heightPx);
  expect(slipped.pathStrokes.every((s) => s.points.length >= 2)).toBe(true);
  expect(slipped.pathStrokes.some((s) => s.points.length === 1)).toBe(false);
});

test.skip("T04-41 Chrome visual leftover — KATL full-pack map and BRITE walk (manual)", () => {
  // skip-with-reason: this worker has no visual operator. Do not invent a visual pass.
});

test("T04-41 — no STARS font or raster map asset in video-maps", () => {
  const mapAssets = import.meta.glob(
    "../../scenario/video-maps/**/*.{png,jpg,jpeg,gif,webp,ttf,otf,woff,woff2}",
    { eager: true },
  );
  expect(Object.keys(mapAssets)).toEqual([]);
});

test("T04-41 — map cache key still includes BRITE so MPA/MPB rebuild paint, not visibility", () => {
  const maps = [
    extraMap("A", [
      {
        type: "polyline",
        closed: false,
        pointsNm: [
          [0, 0],
          [1, 0],
        ],
      },
    ]),
  ];
  const input = {
    digitalMap: digitalMapWith(maps),
    camera: { ...DEFAULT_SCOPE_CAMERA },
    viewSize: VIEW,
    layers: {
      ...DEFAULT_MAP_LAYER_FLAGS,
      showRunway: false,
      showLocalizer: false,
      showRings: false,
    },
    airportEastNm: 0,
    airportNorthNm: 0,
    ringIntervalNm: 5,
    briteMpa: 100,
    briteMpb: 100,
  };
  const cache = buildMapCache(input);
  expect(cache.videoStrokes).toHaveLength(1);
  const dimmer = buildMapCache({ ...input, briteMpa: 40 });
  expect(dimmer.videoStrokes).toHaveLength(1);
  expect(dimmer.key).not.toBe(cache.key);
});

function summarizeVideoMaps(maps: readonly LoadedVideoMap[]): {
  polylines: number;
  closed: number;
  texts: number;
  vertices: number;
  shortPolylines: number;
  largestVertices: number;
  largestId: string;
} {
  let polylines = 0;
  let closed = 0;
  let texts = 0;
  let vertices = 0;
  let shortPolylines = 0;
  let largestVertices = 0;
  let largestId = "";
  for (const map of maps) {
    let mapVertices = 0;
    for (const feature of map.features) {
      if (feature.type === "polyline") {
        polylines += 1;
        if (feature.closed) {
          closed += 1;
        }
        vertices += feature.pointsNm.length;
        mapVertices += feature.pointsNm.length;
        if (feature.pointsNm.length < 2) {
          shortPolylines += 1;
        }
      } else if (feature.type === "text") {
        texts += 1;
      }
    }
    if (mapVertices > largestVertices) {
      largestVertices = mapVertices;
      largestId = map.id;
    }
  }
  return { polylines, closed, texts, vertices, shortPolylines, largestVertices, largestId };
}

test("T04-41 — KATL pack loads 90 maps; *D ALL / *D NONE toggle full inventory; cheap draw uses force-on tiny map", () => {
  const maps = loadVideoMapSet("KATL");
  expect(maps).toHaveLength(90);
  const summary = summarizeVideoMaps(maps);
  // Recorded inventory (Node, unsimplified conversion — no culling):
  // polylines, closed outlines, Point text, vertices, largest map id/vertices
  // are asserted loosely here; exact observed values are in the full-pack test.
  expect(summary.shortPolylines).toBe(0);
  expect(summary.polylines).toBeGreaterThan(0);
  expect(summary.texts).toBe(0);

  expect(parsePreviewCommand("*D ALL", maps)).toEqual({
    kind: "action",
    action: { type: "setAllVideoMaps", enabled: true },
  });
  expect(parsePreviewCommand("*D NONE", maps)).toEqual({
    kind: "action",
    action: { type: "setAllVideoMaps", enabled: false },
  });

  const view = createScopeView(0, 0, { digitalMap: digitalMapWith(maps) });
  expect(dcbCatalogMaps(view)).toEqual([]);
  expect(maps.every((map) => map.dcbNumber === undefined)).toBe(true);
  expect(maps.some((map) => isVideoMapOn(view, map.id) === false)).toBe(true);

  setAllVideoMaps(view, true);
  for (const map of maps) {
    expect(isVideoMapOn(view, map.id), map.id).toBe(true);
  }
  setAllVideoMaps(view, false);
  for (const map of maps) {
    expect(isVideoMapOn(view, map.id), map.id).toBe(false);
  }

  const ntz = maps.find((map) => map.id === NTZ_EAST_ID)!;
  const cheap = mapOnlyView([ntz]);
  forceAllMapsOn(cheap);
  const rec = createRecordingCtx();
  renderScope(rec.ctx, createWorld(), cheap, VIEW.widthPx, VIEW.heightPx);
  expect(cheap.mapCache?.videoStrokes.length).toBe(
    ntz.features.filter((f) => f.type === "polyline").length,
  );
  expect(rec.pathStrokes.length).toBeGreaterThan(0);
  expect(rec.pathStrokes.every((s) => s.points.length >= 2)).toBe(true);
});

/** Unsimplified A80 pack. Bump only when T04-39 conversion output changes. */
const KATL_PACK_MEASUREMENT = {
  maps: 90,
  polylines: 32285,
  closed: 0,
  texts: 0,
  vertices: 334206,
  shortPolylines: 0,
  largestId: "01H8JV8WT7B5YR14FH2ZEV7CHN",
  largestVertices: 109937,
} as const;

/**
 * Full A80 visible-map draw. CI is not a GPU — no tight FPS fail.
 * Observed on worker Node 22 (2026-08-29), recording Canvas2D mock, no culling:
 *   maps=90 polylines=32285 closed=0 texts=0 vertices=334206
 *   largest=01H8JV8WT7B5YR14FH2ZEV7CHN (109937 vertices; EMER ~133k JSON lines)
 *   force-on videoStrokes=32285 videoLabels=0
 *   beginPath=32297 (polylines + 12 range rings) fillText=8 stroke=32297 elapsed≈32ms
 * No simplification, offscreen skip, or lazy load: default path is full draw.
 */
test(
  "T04-41 — worst-case force-on KATL pack draw records measurements",
  { timeout: 60_000 },
  () => {
    const maps = loadVideoMapSet("KATL");
    const summary = summarizeVideoMaps(maps);
    expect(maps).toHaveLength(KATL_PACK_MEASUREMENT.maps);
    expect(summary).toEqual({
      polylines: KATL_PACK_MEASUREMENT.polylines,
      closed: KATL_PACK_MEASUREMENT.closed,
      texts: KATL_PACK_MEASUREMENT.texts,
      vertices: KATL_PACK_MEASUREMENT.vertices,
      shortPolylines: KATL_PACK_MEASUREMENT.shortPolylines,
      largestId: KATL_PACK_MEASUREMENT.largestId,
      largestVertices: KATL_PACK_MEASUREMENT.largestVertices,
    });

    const view = createScopeView(0, 0, { digitalMap: digitalMapWith(maps) });
    forceAllMapsOn(view);
    const rec = createRecordingCtx();
    const started = performance.now();
    renderScope(rec.ctx, createWorld(), view, 1280, 800);
    const elapsedMs = performance.now() - started;
    const strokes = view.mapCache?.videoStrokes.length ?? 0;
    const labels = view.mapCache?.videoLabels.length ?? 0;

    expect(strokes).toBe(KATL_PACK_MEASUREMENT.polylines);
    expect(labels).toBe(KATL_PACK_MEASUREMENT.texts);
    expect(rec.beginPathCount).toBeGreaterThanOrEqual(KATL_PACK_MEASUREMENT.polylines);
    expect(rec.pathStrokes.every((s) => s.points.length >= 2)).toBe(true);
    expect(rec.fillTextCount).toBeGreaterThan(0);
    expect(rec.fillTextCount).toBeLessThan(100);
    expect(elapsedMs).toBeLessThan(30_000);
  },
);
