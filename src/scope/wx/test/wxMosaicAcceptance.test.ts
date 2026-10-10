import { createMockCtx } from "../../test/mockCanvas";
import { weatherViewportCrop } from "../../render/weatherViewport";
import { syncDisplayControlBar } from "../../../ui/dcb/DisplayControlBar";
import { ensureWxMosaic } from "../ensure";
import { N0Q_RGB_DBZ_RAMP, WX_REFRESH_MS, emptyWxMosaic } from "../index";
import {
  buildWeatherComposite,
  type WeatherCompositeInput,
  type WeatherCompositePixels,
} from "../../render/weatherComposite";
/**
 * T02-72 combined WX mosaic acceptance: DCB latches, preview `*WX`, BRITE
 * WX/WXC, and cached VIP fill/contour paint share one display-only path.
 *
 * Manual Chrome KATL live IEM walk is skip-with-reason: no visual operator.
 * Do not invent a visual pass.
 */
import { expect, test, vi } from "vitest";
import { INSTRUCTION_TYPES, SessionLog, createWorld, makeTestAircraft } from "@core";
import { handleRadioText } from "@pilot";
import { applyBrite } from "../../palette";
import { handleScopeKeyDown } from "../../scopeKeys";
import { createScopeView } from "../../scopeView";
import { stepBriteChannel, toggleWxLevel } from "../../dcb/dcbFunctions";
import {
  WX_VIP_CONTOUR_HEX,
  WX_VIP_FILL_HEX,
  drawWeatherLayer,
  wxVipContourHex,
  wxVipFillHex,
  resetWeatherLayerCache,
  WX_VIEWPORT_PADDING_PX,
} from "../../render/weatherLayer";
import {
  bboxCovers,
  bboxFromArp,
  decodeRgbaToVipMasks,
  encodeRgbaPng,
  fetchWxMosaic,
  planIemN0qCover,
  shouldRefetch,
  vipAtNm,
} from "../index";

function keyEvent(key: string) {
  return {
    key,
    preventDefault(): void {},
    stopPropagation(): void {},
  };
}

function typeKeys(
  view: ReturnType<typeof createScopeView>,
  world: ReturnType<typeof createWorld>,
  keys: string[],
  focus: "scope" | "radio" = "scope",
  startMs = 0,
): number {
  let now = startMs;
  for (const key of keys) {
    handleScopeKeyDown(keyEvent(key), view, focus, world, now);
    now += 100;
  }
  return now;
}

function vip1Mosaic() {
  const rgba = new Uint8Array(2 * 2 * 4);
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    rgba[o] = 0;
    rgba[o + 1] = 255;
    rgba[o + 2] = 0;
    rgba[o + 3] = 255;
  }
  return decodeRgbaToVipMasks(rgba, 2, 2, bboxFromArp({ latDeg: 0, lonDeg: 0 }, 4), 1_000);
}

function mockDrawCtx() {
  const drawImages: { image: unknown }[] = [];
  const ctx = {
    drawImage(image: unknown) {
      drawImages.push({ image });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawImages };
}

test("T02-72 — DCB WX, *WX, and BRITE WX/WXC share one display-only paint path", async () => {
  const log = new SessionLog();
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    headingDeg: 90,
    xNm: 16,
    yNm: 8,
  });
  const world = createWorld({ aircraft: [dal], sessionLog: log });
  const view = createScopeView();
  view.wxMosaic = vip1Mosaic();
  const size = { widthPx: 800, heightPx: 800 };

  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);
  expect(view.brite.wx).toBe(100);
  expect(view.brite.wxc).toBe(100);
  expect(view.brite.bkc).toBe(100);
  const off = mockDrawCtx();
  drawWeatherLayer(off.ctx, view, size);
  expect(off.drawImages).toHaveLength(0);

  toggleWxLevel(view, 1);
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);
  const dcbPaint = mockDrawCtx();
  drawWeatherLayer(dcbPaint.ctx, view, size);
  expect(dcbPaint.drawImages).toHaveLength(1);

  typeKeys(view, world, ["*", "W", "X", "1", "Enter"]);
  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);
  const previewOff = mockDrawCtx();
  drawWeatherLayer(previewOff.ctx, view, size);
  expect(previewOff.drawImages).toHaveLength(0);

  const prior = [...view.wxLevels];
  typeKeys(view, world, ["*", "W", "X", "7", "Enter"], "scope", 200);
  expect(view.preview.rejection).toBe("*WX7 INV");
  expect(view.wxLevels).toEqual(prior);

  typeKeys(view, world, ["*", "W", "X", "1", "Enter"], "scope", 400);
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);

  stepBriteChannel(view, "wx", -5);
  stepBriteChannel(view, "wxc", -6);
  expect(view.brite.wx).toBe(50);
  expect(view.brite.wxc).toBe(40);
  expect(view.brite.bkc).toBe(100);

  const painted = mockDrawCtx();
  drawWeatherLayer(painted.ctx, view, size);
  expect(painted.drawImages).toHaveLength(1);
  expect(wxVipFillHex(1, view.brite.wx)).toBe(applyBrite(WX_VIP_FILL_HEX[0], 50));
  expect(wxVipContourHex(1, view.brite.wxc)).toBe(applyBrite(WX_VIP_CONTOUR_HEX[0], 40));

  const reuse = mockDrawCtx();
  drawWeatherLayer(reuse.ctx, view, size);
  expect(reuse.drawImages).toHaveLength(1);
  expect(reuse.drawImages[0]!.image).toBe(painted.drawImages[0]!.image);

  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(INSTRUCTION_TYPES).toHaveLength(36);
  expect(dal.intent.assignedHeadingDeg).toBe(90);

  const result = await handleRadioText(world, "DAL123 H270", log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);
  expect(view.brite.wx).toBe(50);
  expect(view.brite.wxc).toBe(40);
});

test("T02-72 — weather paint has no OSM, facility-id branch, or per-frame decode", () => {
  const paintSources = import.meta.glob("../../render/weatherLayer.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const wxDir = import.meta.glob("../*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const paint = paintSources["../../render/weatherLayer.ts"] ?? "";
  expect(paint).toMatch(/drawImage/);
  expect(paint).toMatch(/applyBrite/);
  expect(paint).toMatch(/brite\.wxc/);
  expect(paint).not.toMatch(/icao\s*===/);
  expect(paint).not.toMatch(/"KDEM"|"KATL"/);
  expect(paint).not.toMatch(/JSON\.parse/);
  expect(paint).not.toMatch(/\bfetch\s*\(/);
  expect(paint).not.toMatch(/openstreetmap/i);
  for (const [path, src] of Object.entries(wxDir)) {
    if (path.includes(".test.")) {
      continue;
    }
    expect(src, path).not.toMatch(/openstreetmap/i);
    expect(src, path).not.toMatch(/icao\s*===/);
  }
});

test.each([
  { latDeg: 0, lonDeg: 0 },
  { latDeg: 33.6, lonDeg: -84.4 },
  { latDeg: 60, lonDeg: 10 },
  { latDeg: -49, lonDeg: 179 },
])("512 NM cover is complete and bounded at $latDeg,$lonDeg", (arp) => {
  const required = bboxFromArp(arp);
  const cover = planIemN0qCover(required);
  expect(bboxCovers(cover.bbox, required)).toBe(true);
  expect(cover.tiles.length).toBeLessThanOrEqual(64);
  expect(cover.widthPx).toBeLessThanOrEqual(2048);
  expect(cover.heightPx).toBeLessThanOrEqual(2048);
  for (const tile of cover.tiles) {
    const parts = tile.url.split("/");
    const x = Number(parts.at(-2));
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(2 ** cover.z);
  }
});

test("512 NM fetch bounds concurrency and preserves Mercator latitude alignment", async () => {
  const arp = { latDeg: 49, lonDeg: 10 };
  const cover = planIemN0qCover(bboxFromArp(arp));
  let active = 0;
  let peak = 0;
  let calls = 0;
  // Synthetic north/south band at 50 degrees; encode each tile in Mercator coordinates.
  const boundaryY = ((1 - Math.asinh(Math.tan((50 * Math.PI) / 180)) / Math.PI) / 2) * 2 ** cover.z;
  const mosaic = await fetchWxMosaic({
    arp,
    nowMs: 1000,
    fetchImpl: async (input) => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      const y = Number(String(input).split("/").at(-1)!.replace(".png", ""));
      const pixels = new Uint8Array(256 * 256 * 4);
      for (let row = 0; row < 256; row++) {
        if (y + (row + 0.5) / 256 >= boundaryY) continue;
        for (let col = 0; col < 256; col++) {
          const offset = (row * 256 + col) * 4;
          pixels[offset + 1] = 255;
          pixels[offset + 3] = 255;
        }
      }
      const response = new Response(new Uint8Array(encodeRgbaPng(256, 256, pixels)), {
        status: 200,
      });
      active--;
      return response;
    },
  });
  expect(calls).toBe(cover.tiles.length);
  expect(peak).toBe(4);
  expect(vipAtNm(mosaic, 0, (50.3 - arp.latDeg) * 60, arp)).toBe(1);
  expect(vipAtNm(mosaic, 0, (49.7 - arp.latDeg) * 60, arp)).toBe(0);
  expect(shouldRefetch(mosaic, 2000, arp)).toBe(false);
  // Center containment alone must not reuse a cover that lacks the required pad.
  expect(shouldRefetch({ ...mosaic, ...bboxFromArp(arp, 80) }, 2000, arp)).toBe(true);
});

test("512 NM partial failures retain successful tiles; unsupported polar bounds stay empty", async () => {
  const arp = { latDeg: 0, lonDeg: 0 };
  const pixels = new Uint8Array([0, 255, 0, 255]);
  let calls = 0;
  const mosaic = await fetchWxMosaic({
    arp,
    nowMs: 1000,
    fetchImpl: async () => {
      if (++calls === 1) throw new Error("offline tile");
      return new Response(new Uint8Array(encodeRgbaPng(1, 1, pixels)), { status: 200 });
    },
  });
  expect(mosaic.widthPx).toBeGreaterThan(0);
  expect(bboxCovers(mosaic, bboxFromArp(arp))).toBe(true);
  expect(mosaic.vipMasks[0].some((byte) => byte !== 0)).toBe(true);
  const polarArp = { latDeg: 80, lonDeg: 0 };
  const polar = await fetchWxMosaic({
    arp: polarArp,
    nowMs: 1000,
    fetchImpl: async () => {
      throw new Error("must not request unsupported bounds");
    },
  });
  expect(polar.widthPx).toBe(0);
  expect(shouldRefetch(polar, 2000, polarArp)).toBe(false);
});

test("WX update precomputes available layers once; toggles reuse them and refresh swaps atomically", () => {
  class TestWorker {
    static instances: TestWorker[] = [];
    onmessage?: (event: { data: WeatherCompositePixels }) => void;
    onerror?: () => void;
    input!: WeatherCompositeInput;
    terminated = false;
    constructor() {
      TestWorker.instances.push(this);
    }
    postMessage(input: WeatherCompositeInput): void {
      this.input = input;
    }
    terminate(): void {
      this.terminated = true;
    }
    complete(): void {
      this.onmessage?.({ data: buildWeatherComposite(this.input) });
    }
  }
  vi.stubGlobal("Worker", TestWorker);
  resetWeatherLayerCache();
  try {
    const view = createScopeView();
    view.wxMosaic = vip1Mosaic();
    // Second available plane at another pixel; remaining levels stay unavailable.
    view.wxMosaic.vipMasks[1][0] = 0b10;
    view.wxLevels = [false, false, false, false, false, false];
    const size = { widthPx: 800, heightPx: 800 };
    const paint = () => {
      const draw = mockDrawCtx();
      drawWeatherLayer(draw.ctx, view, size);
      return draw.drawImages;
    };
    expect(paint()).toHaveLength(0);
    expect(TestWorker.instances).toHaveLength(1);
    TestWorker.instances[0]!.complete();
    expect(paint()).toHaveLength(0);
    view.wxLevels = [true, false, false, false, false, false];
    const first = paint()[0]!.image;
    view.wxLevels = [false, true, false, false, false, false];
    const second = paint()[0]!.image;
    expect(second).not.toBe(first);
    view.wxLevels = [true, true, false, false, false, false];
    expect(paint()).toHaveLength(1);
    view.brite.wx = 50;
    const priorViewport = paint()[0]!.image;
    expect(TestWorker.instances).toHaveLength(1);
    const built = buildWeatherComposite(TestWorker.instances[0]!.input);
    expect(built.layers.slice(2)).toEqual([null, null, null, null]);
    view.wxMosaic = vip1Mosaic();
    expect(paint()[0]!.image).toBe(priorViewport);
    const stale = TestWorker.instances[1]!;
    view.wxMosaic = vip1Mosaic();
    expect(paint()[0]!.image).toBe(priorViewport);
    expect(stale.terminated).toBe(true);
    stale.complete();
    expect(paint()[0]!.image).toBe(priorViewport);
    TestWorker.instances[2]!.complete();
    expect(paint()[0]!.image).not.toBe(priorViewport);
    expect(paint()).toHaveLength(1);
    view.wxLevels = [false, false, false, false, false, false];
    expect(paint()).toHaveLength(0);
  } finally {
    resetWeatherLayerCache();
    vi.unstubAllGlobals();
  }
});

test("WX without workers yields between row batches before installing canvas", async () => {
  vi.stubGlobal("Worker", undefined);
  vi.useFakeTimers();
  resetWeatherLayerCache();
  try {
    const view = createScopeView();
    const pixels = new Uint8Array(128 * 128 * 4);
    for (let index = 0; index < 128 * 128; index++) {
      pixels[index * 4 + 1] = 255;
      pixels[index * 4 + 3] = 255;
    }
    view.wxMosaic = decodeRgbaToVipMasks(pixels, 128, 128, bboxFromArp(view.arp), 1000);
    view.wxLevels = [true, false, false, false, false, false];
    const size = { widthPx: 800, heightPx: 800 };
    const initial = mockDrawCtx();
    drawWeatherLayer(initial.ctx, view, size);
    expect(initial.drawImages).toHaveLength(0);
    await vi.advanceTimersToNextTimerAsync();
    const pending = mockDrawCtx();
    drawWeatherLayer(pending.ctx, view, size);
    expect(pending.drawImages).toHaveLength(0);
    await vi.runAllTimersAsync();
    const ready = mockDrawCtx();
    drawWeatherLayer(ready.ctx, view, size);
    expect(ready.drawImages).toHaveLength(1);
  } finally {
    resetWeatherLayerCache();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

test("WX AVL updates without clicks only after all tiles complete and only for populated VIPs", async () => {
  const view = createScopeView(0, 0, { arp: { latDeg: 0, lonDeg: 0 } });
  const captions = Array.from({ length: 6 }, () => ({ textContent: "" }));
  vi.stubGlobal("document", {
    getElementById: (id: string) => {
      const match = /^dcb-wx-(\d)-avl$/.exec(id);
      return match ? captions[Number(match[1]) - 1] : null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  try {
    syncDisplayControlBar(view);
    expect(captions.map((caption) => caption.textContent)).toEqual(["", "", "", "", "", ""]);
    const cover = planIemN0qCover(bboxFromArp(view.arp));
    const original = view.wxMosaic;
    const intense = N0Q_RGB_DBZ_RAMP.find((stop) => stop.dbz === 51)!;
    const png = new Uint8Array(
      encodeRgbaPng(2, 1, new Uint8Array([0, 255, 0, 255, intense.r, intense.g, intense.b, 255])),
    );
    let lastRequested!: () => void;
    const finalRequest = new Promise<void>((resolve) => {
      lastRequested = resolve;
    });
    let releaseLast!: () => void;
    const finalResponse = new Promise<void>((resolve) => {
      releaseLast = resolve;
    });
    let calls = 0;
    const loading = ensureWxMosaic(view, {
      nowMs: 1000,
      fetchImpl: async () => {
        if (++calls === cover.tiles.length) {
          lastRequested();
          await finalResponse;
        }
        return new Response(png, { status: 200 });
      },
    });
    await finalRequest;
    syncDisplayControlBar(view);
    expect(view.wxMosaic).toBe(original);
    expect(captions.every((caption) => caption.textContent === "")).toBe(true);
    releaseLast();
    await loading;
    syncDisplayControlBar(view);
    expect(captions.map((caption) => caption.textContent)).toEqual(["AVL", "", "", "", "", "AVL"]);
    expect(view.wxLevels).toEqual([false, false, false, false, false, false]);
    // New clear-weather batch removes previously available captions.
    const clear = new Uint8Array(encodeRgbaPng(1, 1, new Uint8Array([0, 0, 0, 0])));
    await ensureWxMosaic(view, {
      nowMs: 1000 + WX_REFRESH_MS,
      fetchImpl: async () => new Response(clear, { status: 200 }),
    });
    syncDisplayControlBar(view);
    expect(captions.every((caption) => caption.textContent === "")).toBe(true);
    // Packed padding is not weather at any real pixel.
    view.wxMosaic = {
      ...emptyWxMosaic(),
      widthPx: 1,
      heightPx: 1,
      vipMasks: [
        new Uint8Array([0b10000000]),
        new Uint8Array(1),
        new Uint8Array(1),
        new Uint8Array(1),
        new Uint8Array(1),
        new Uint8Array(1),
      ],
    };
    syncDisplayControlBar(view);
    expect(captions.every((caption) => caption.textContent === "")).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

test.each([
  { x: -9600, y: -9600, w: 20000, h: 20000, sx: 983.04, sw: 81.92, dx: 0, dw: 800 },
  { x: 400, y: 400, w: 800, h: 800, sx: 0, sw: 1024, dx: 400, dw: 400 },
])("WX clips source before scaling at $x,$y", ({ x, y, w, h, sx, sw, dx, dw }) => {
  const crop = weatherViewportCrop(2048, 2048, x, y, w, h, { widthPx: 800, heightPx: 800 })!;
  expect(crop.sx).toBeCloseTo(sx);
  expect(crop.sy).toBeCloseTo(sx);
  expect(crop.sw).toBeCloseTo(sw);
  expect(crop.sh).toBeCloseTo(sw);
  expect(crop.dx).toBe(dx);
  expect(crop.dy).toBe(dx);
  expect(crop.dw).toBe(dw);
  expect(crop.dh).toBe(dw);
  expect(
    weatherViewportCrop(2048, 2048, 900, 900, 800, 800, { widthPx: 800, heightPx: 800 }),
  ).toBeUndefined();
});

test("WX viewport crops layers and masks, reuses unchanged frames, and invalidates on view changes", () => {
  resetWeatherLayerCache();
  const sourceDraws: Array<{ image: unknown; coordinates: number[] }> = [];
  let uploads = 0;
  const canvases: Array<{ width: number; height: number }> = [];
  vi.stubGlobal("Worker", undefined);
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("document", {
    createElement: () => {
      const mock = createMockCtx();
      const ctx = {
        ...mock.ctx,
        drawImage: (image: unknown, ...coordinates: number[]) => {
          sourceDraws.push({ image, coordinates });
        },
        putImageData: (data: { width: number }) => {
          if (data.width === 64) uploads++;
        },
        createPattern: () => ({}),
      };
      const canvas = { width: 0, height: 0, getContext: () => ctx };
      canvases.push(canvas);
      return canvas;
    },
  });
  try {
    const view = createScopeView(0, 0, { arp: { latDeg: 33.6, lonDeg: -84.4 } });
    const rgba = new Uint8Array(64 * 64 * 4);
    for (let index = 0; index < 64 * 64; index++) {
      const stop = N0Q_RGB_DBZ_RAMP.find((entry) => entry.dbz === (index % 2 ? 30 : 18))!;
      rgba.set([stop.r, stop.g, stop.b, 255], index * 4);
    }
    view.wxMosaic = decodeRgbaToVipMasks(rgba, 64, 64, bboxFromArp(view.arp), 1000);
    view.wxLevels = [true, true, false, false, false, false];
    let size = { widthPx: 800, heightPx: 800 };
    const main = createMockCtx();
    const blits: number[][] = [];
    main.ctx.drawImage = (image: CanvasImageSource, ...coordinates: number[]) => {
      main.drawImages.push(image);
      blits.push(coordinates);
    };
    const paint = () => drawWeatherLayer(main.ctx, view, size);
    paint();
    expect(uploads).toBe(2);
    const count = sourceDraws.length;
    const crops = sourceDraws.filter((draw) => draw.coordinates.length === 8);
    // Backgrounds and stipple masks crop their source and never scale beyond the viewport.
    expect(crops).toHaveLength(3);
    for (const { coordinates } of crops) {
      expect(coordinates[2]!).toBeLessThan(64);
      expect(coordinates[3]!).toBeLessThan(64);
      expect(coordinates[6]!).toBeLessThanOrEqual(800 + WX_VIEWPORT_PADDING_PX * 2);
      expect(coordinates[7]!).toBeLessThanOrEqual(800 + WX_VIEWPORT_PADDING_PX * 2);
    }
    paint();
    paint();
    expect(sourceDraws).toHaveLength(count);
    expect(main.drawImages).toHaveLength(3);
    const canvasCount = canvases.length;
    view.camera.centerEastNm = 2;
    paint();
    expect(sourceDraws).toHaveLength(count);
    expect(canvases).toHaveLength(canvasCount);
    expect(blits.at(-1)![0]).toBeCloseTo(WX_VIEWPORT_PADDING_PX + 40);
    expect(blits.at(-1)![4]).toBe(0);
    // Sustained short pans use one cached blit without layer/mask recomposition.
    for (let frame = 0; frame < 60; frame++) {
      view.camera.centerEastNm = 2 + (frame % 4) * 0.2;
      view.camera.centerNorthNm = (frame % 3) * 0.2;
      paint();
    }
    expect(sourceDraws).toHaveLength(count);
    view.camera.centerEastNm = 20;
    paint();
    expect(sourceDraws.length).toBeGreaterThan(count);
    const afterPan = sourceDraws.length;
    paint();
    expect(sourceDraws).toHaveLength(afterPan);
    view.camera.rangeNm = 40;
    paint();
    expect(sourceDraws.length).toBeGreaterThan(afterPan);
    const afterRange = sourceDraws.length;
    view.wxLevels = [false, true, false, false, false, false];
    paint();
    expect(sourceDraws.length).toBeGreaterThan(afterRange);
    const afterToggle = sourceDraws.length;
    view.brite.wxc = 0;
    paint();
    expect(sourceDraws.length).toBeGreaterThan(afterToggle);
    const afterBrite = sourceDraws.length;
    size = { widthPx: 1000, heightPx: 800 };
    paint();
    expect(sourceDraws.length).toBeGreaterThan(afterBrite);
    const afterSize = sourceDraws.length;
    vi.stubGlobal("devicePixelRatio", 2);
    paint();
    expect(sourceDraws.length).toBeGreaterThan(afterSize);
    const viewport = main.drawImages.at(-1) as { width: number; height: number };
    expect(viewport.width).toBe((1000 + WX_VIEWPORT_PADDING_PX * 2) * 2);
    expect(viewport.height).toBe((800 + WX_VIEWPORT_PADDING_PX * 2) * 2);
    const beforeOutside = sourceDraws.length;
    view.camera.centerEastNm = 2000;
    paint();
    paint();
    expect(sourceDraws).toHaveLength(beforeOutside);
    expect(uploads).toBe(2);
  } finally {
    resetWeatherLayerCache();
    vi.unstubAllGlobals();
  }
});
