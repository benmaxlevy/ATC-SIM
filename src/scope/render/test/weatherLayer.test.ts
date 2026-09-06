import { beforeEach, expect, test } from "vitest";
import { applyBrite } from "../../palette";
import { createScopeView } from "../../scopeView";
import {
  WX_BACKGROUND_HEX,
  WX_PATTERN_TILE_SIZE,
  WX_STIPPLE_HEX,
  WX_VIP_CONTOUR_HEX,
  WX_VIP_FILL_HEX,
  acquireScratchCanvas,
  drawWeatherLayer,
  getPatternMarks,
  getPatternTileMask,
  resetWeatherLayerCache,
  wxLevelBackgroundHex,
  wxProceduralTextureRgb,
  wxScreenStyle,
  wxStippleHex,
  wxVipContourHex,
  wxVipFillHex,
} from "../weatherLayer";
import { bboxFromArp, decodeRgbaToVipMasks, emptyWxMosaic, type WxMosaic } from "../../wx";

beforeEach(() => {
  resetWeatherLayerCache();
});

function mockDrawCtx(): {
  ctx: CanvasRenderingContext2D;
  drawImages: { image: unknown; dx: number; dy: number; dw: number; dh: number }[];
} {
  const drawImages: { image: unknown; dx: number; dy: number; dw: number; dh: number }[] = [];
  const ctx = {
    drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number) {
      drawImages.push({ image, dx, dy, dw, dh });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawImages };
}

function vip1Mosaic(): WxMosaic {
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

function syntheticLevelMosaic(vipLevel: 1 | 2 | 3 | 4 | 5 | 6): WxMosaic {
  const vipMasks = [
    new Uint8Array(1),
    new Uint8Array(1),
    new Uint8Array(1),
    new Uint8Array(1),
    new Uint8Array(1),
    new Uint8Array(1),
  ] as const;
  vipMasks[vipLevel - 1][0] = 0x01;
  return {
    westLon: -1,
    southLat: -1,
    eastLon: 1,
    northLat: 1,
    widthPx: 2,
    heightPx: 2,
    vipMasks,
    fetchedAtMs: 1_000,
  };
}

test("trainer fills are six distinct STARS-like colors, not IEM rainbow", () => {
  expect(WX_VIP_FILL_HEX).toEqual([
    "#146414",
    "#C8C800",
    "#E67800",
    "#C80000",
    "#C800C8",
    "#FFFFFF",
  ]);
  expect(new Set(WX_VIP_FILL_HEX).size).toBe(6);
  for (const hex of WX_VIP_FILL_HEX) {
    expect(hex).not.toMatch(/#00EC|#00FF00|#00E8|#00F0/i);
  }
  expect(wxVipFillHex(1, 100)).toBe(applyBrite(WX_VIP_FILL_HEX[0], 100));
  expect(wxVipFillHex(4, 50)).toBe(applyBrite(WX_VIP_FILL_HEX[3], 50));
});

test("WXC contour is a 1px screen outline, not a mosaic-bin flood", () => {
  expect(wxScreenStyle(false)).toBe("fill");
  expect(wxScreenStyle(true)).toBe("contour");
});

test("WXC contours are six distinct hues tinted by brite.wxc, not IEM rainbow", () => {
  expect(WX_VIP_CONTOUR_HEX).toHaveLength(6);
  expect(new Set(WX_VIP_CONTOUR_HEX).size).toBe(6);
  for (const hex of WX_VIP_CONTOUR_HEX) {
    expect(hex).not.toMatch(/#00EC|#00FF00|#00E8|#00F0|#00ECEC/i);
  }
  expect(wxVipContourHex(1, 100)).toBe(applyBrite(WX_VIP_CONTOUR_HEX[0], 100));
  expect(wxVipContourHex(4, 50)).toBe(applyBrite(WX_VIP_CONTOUR_HEX[3], 50));
  expect(wxVipContourHex(1, 50)).not.toBe(wxVipFillHex(1, 50));
});

test("procedural WX uses exact brite-tinted backgrounds and level patterns", () => {
  expect(WX_BACKGROUND_HEX[0]).toBe("#132727");
  expect(WX_BACKGROUND_HEX[1]).toBe("#132727");
  expect(WX_BACKGROUND_HEX[2]).toBe("#132727");
  expect(WX_BACKGROUND_HEX[3]).toBe("#32321a");
  expect(WX_BACKGROUND_HEX[4]).toBe("#32321a");
  expect(WX_BACKGROUND_HEX[5]).toBe("#32321a");
  expect(WX_STIPPLE_HEX).toBe("#6c7070");

  for (let r = 0; r < 32; r++) {
    for (let c = 0; c < 32; c++) {
      expect(wxProceduralTextureRgb(1, c, r, 100)).toEqual([19, 39, 39]);
    }
  }

  for (let r = 0; r < 32; r++) {
    for (let c = 0; c < 32; c++) {
      expect(wxProceduralTextureRgb(4, c, r, 100)).toEqual([50, 50, 26]);
    }
  }

  const findMark = (level: 2 | 3 | 5 | 6): [number, number] => {
    const fill = level === 5 || level === 6 ? [50, 50, 26] : [19, 39, 39];
    for (let row = 0; row < WX_PATTERN_TILE_SIZE; row++) {
      for (let col = 0; col < WX_PATTERN_TILE_SIZE; col++) {
        const rgb = wxProceduralTextureRgb(level, col, row, 100);
        if (!rgb.every((channel, index) => channel === fill[index])) {
          return [col, row];
        }
      }
    }
    throw new Error(`No procedural mark found for WX${level}`);
  };

  for (const level of [2, 3, 5, 6] as const) {
    const [col, row] = findMark(level);
    const mark = wxProceduralTextureRgb(level, col, row, 100);
    expect(mark).toEqual([108, 112, 112]);
  }

  for (let row = 0; row < WX_PATTERN_TILE_SIZE; row++) {
    for (let col = 0; col < WX_PATTERN_TILE_SIZE; col++) {
      const isMark2 = wxProceduralTextureRgb(2, col, row, 100)[0] === 108;
      const isMark5 = wxProceduralTextureRgb(5, col, row, 100)[0] === 108;
      expect(isMark2).toBe(isMark5);
    }
  }

  for (let row = 0; row < WX_PATTERN_TILE_SIZE; row++) {
    for (let col = 0; col < WX_PATTERN_TILE_SIZE; col++) {
      const isMark3 = wxProceduralTextureRgb(3, col, row, 100)[0] === 108;
      const isMark6 = wxProceduralTextureRgb(6, col, row, 100)[0] === 108;
      expect(isMark3).toBe(isMark6);
    }
  }

  expect(wxLevelBackgroundHex(1, 50)).toBe(applyBrite("#132727", 50));
  expect(wxLevelBackgroundHex(4, 50)).toBe(applyBrite("#32321a", 50));
  expect(wxStippleHex(50)).toBe(applyBrite("#6c7070", 50));

  const [sqX, sqY] = findMark(2);
  expect(wxProceduralTextureRgb(2, sqX, sqY, 50)).toEqual([54, 56, 56]);
  expect(wxProceduralTextureRgb(1, sqX, sqY, 50)).toEqual([10, 20, 20]);
});

test("authentic STARS pattern geometries and densities meet specification", () => {
  expect(WX_PATTERN_TILE_SIZE).toBe(32);
  const squareMarks = getPatternMarks("square");
  expect(squareMarks.length).toBe(8);
  for (const mark of squareMarks) {
    expect(mark.width).toBe(2);
    expect(mark.height).toBe(2);
  }

  const rectangleMarks = getPatternMarks("rectangle");
  expect(rectangleMarks.length).toBe(32);
  expect(rectangleMarks.length).toBeGreaterThan(squareMarks.length * 2.5);
  let hasHorizontal = false;
  let hasVertical = false;
  for (const mark of rectangleMarks) {
    if (mark.width === 1) {
      hasVertical = true;
      expect(mark.height).toBe(2);
    } else {
      hasHorizontal = true;
      expect(mark.height).toBe(1);
      expect(mark.width).toBe(2);
    }
  }
  expect(hasHorizontal).toBe(true);
  expect(hasVertical).toBe(true);

  const squareMask = getPatternTileMask("square");
  const rectMask = getPatternTileMask("rectangle");
  expect(squareMask.length).toBe(WX_PATTERN_TILE_SIZE * WX_PATTERN_TILE_SIZE);
  expect(rectMask.length).toBe(WX_PATTERN_TILE_SIZE * WX_PATTERN_TILE_SIZE);
});

test("all-off or empty mosaic does not drawImage", () => {
  const view = createScopeView();
  const size = { widthPx: 800, heightPx: 800 };
  const off = mockDrawCtx();
  drawWeatherLayer(off.ctx, view, size);
  expect(off.drawImages).toHaveLength(0);

  view.wxMosaic = vip1Mosaic();
  const stillOff = mockDrawCtx();
  drawWeatherLayer(stillOff.ctx, view, size);
  expect(stillOff.drawImages).toHaveLength(0);

  view.wxLevels = [true, false, false, false, false, false];
  view.wxMosaic = emptyWxMosaic();
  const empty = mockDrawCtx();
  drawWeatherLayer(empty.ctx, view, size);
  expect(empty.drawImages).toHaveLength(0);
});

test("one enabled level draws one cached composite", () => {
  const view = createScopeView();
  view.wxMosaic = vip1Mosaic();
  view.wxLevels = [true, false, false, false, false, false];
  const size = { widthPx: 800, heightPx: 800 };
  const first = mockDrawCtx();
  drawWeatherLayer(first.ctx, view, size);
  expect(first.drawImages).toHaveLength(1);
  expect(first.drawImages[0]!.dw).not.toBe(0);
  expect(first.drawImages[0]!.dh).not.toBe(0);

  const second = mockDrawCtx();
  drawWeatherLayer(second.ctx, view, size);
  expect(second.drawImages).toHaveLength(1);
  expect(second.drawImages[0]!.image).toBe(first.drawImages[0]!.image);

  view.camera.centerEastNm = 2;
  const panned = mockDrawCtx();
  drawWeatherLayer(panned.ctx, view, size);
  expect(panned.drawImages[0]!.image).toBe(first.drawImages[0]!.image);
  expect(panned.drawImages[0]!.dx).not.toBe(first.drawImages[0]!.dx);

  view.brite.wx = 50;
  const dim = mockDrawCtx();
  drawWeatherLayer(dim.ctx, view, size);
  expect(dim.drawImages).toHaveLength(1);
  expect(wxVipFillHex(1, view.brite.wx)).toBe(applyBrite(WX_VIP_FILL_HEX[0], 50));

  view.brite.wxc = 40;
  const contour = mockDrawCtx();
  drawWeatherLayer(contour.ctx, view, size);
  expect(contour.drawImages).toHaveLength(1);
  expect(wxVipContourHex(1, view.brite.wxc)).toBe(applyBrite(WX_VIP_CONTOUR_HEX[0], 40));

  const reuse = mockDrawCtx();
  drawWeatherLayer(reuse.ctx, view, size);
  expect(reuse.drawImages[0]!.image).toBe(contour.drawImages[0]!.image);
});

test("compositing screen-space patterns for WX2, WX3, WX5, and WX6 over VIP regions", () => {
  const size = { widthPx: 800, heightPx: 800 };

  {
    const view = createScopeView();
    view.wxMosaic = syntheticLevelMosaic(1);
    view.wxLevels = [true, false, false, false, false, false];
    const draw = mockDrawCtx();
    drawWeatherLayer(draw.ctx, view, size);
    expect(draw.drawImages).toHaveLength(1);
  }

  {
    const view = createScopeView();
    view.wxMosaic = syntheticLevelMosaic(2);
    view.wxLevels = [false, true, false, false, false, false];
    const draw = mockDrawCtx();
    drawWeatherLayer(draw.ctx, view, size);
    expect(draw.drawImages).toHaveLength(2);
    expect(draw.drawImages[0]!.dw).toBeGreaterThan(0);
    expect(draw.drawImages[1]!.dx).toBe(0);
    expect(draw.drawImages[1]!.dy).toBe(0);
    expect(draw.drawImages[1]!.dw).toBe(800);
    expect(draw.drawImages[1]!.dh).toBe(800);
  }

  {
    const view = createScopeView();
    view.wxMosaic = syntheticLevelMosaic(3);
    view.wxLevels = [false, false, true, false, false, false];
    const draw = mockDrawCtx();
    drawWeatherLayer(draw.ctx, view, size);
    expect(draw.drawImages).toHaveLength(2);
  }

  {
    const view = createScopeView();
    view.wxMosaic = syntheticLevelMosaic(4);
    view.wxLevels = [false, false, false, true, false, false];
    const draw = mockDrawCtx();
    drawWeatherLayer(draw.ctx, view, size);
    expect(draw.drawImages).toHaveLength(1);
  }

  {
    const view = createScopeView();
    view.wxMosaic = syntheticLevelMosaic(5);
    view.wxLevels = [false, false, false, false, true, false];
    const draw = mockDrawCtx();
    drawWeatherLayer(draw.ctx, view, size);
    expect(draw.drawImages).toHaveLength(2);
  }

  {
    const view = createScopeView();
    view.wxMosaic = syntheticLevelMosaic(6);
    view.wxLevels = [false, false, false, false, false, true];
    const draw = mockDrawCtx();
    drawWeatherLayer(draw.ctx, view, size);
    expect(draw.drawImages).toHaveLength(2);
  }
});

test("pattern origin translates with camera pan so marks do not parallax", () => {
  const size = { widthPx: 800, heightPx: 800 };
  const view = createScopeView();
  view.wxMosaic = syntheticLevelMosaic(2);
  view.wxLevels = [false, true, false, false, false, false];

  const scratch = acquireScratchCanvas(size.widthPx, size.heightPx);
  const translations: { x: number; y: number }[] = [];
  const origGetContext = scratch.getContext;
  scratch.getContext = (id: string) => {
    const ctx = origGetContext ? origGetContext.call(scratch, id) : null;
    if (ctx) {
      ctx.translate = (x: number, y: number) => {
        translations.push({ x, y });
      };
    }
    return ctx;
  };

  const draw1 = mockDrawCtx();
  drawWeatherLayer(draw1.ctx, view, size);
  expect(translations).toHaveLength(1);
  const firstTranslation = { ...translations[0]! };

  view.camera.centerEastNm = 10;
  const draw2 = mockDrawCtx();
  drawWeatherLayer(draw2.ctx, view, size);
  expect(translations).toHaveLength(2);
  const pannedTranslation = translations[1]!;

  expect(pannedTranslation.x).not.toBe(firstTranslation.x);

  if (origGetContext) {
    scratch.getContext = origGetContext;
  }
});

test("WXC in brite controls stipple brightness: off = no stipple, 100% = #6c7070 full brite", () => {
  const size = { widthPx: 800, heightPx: 800 };
  const view = createScopeView();
  view.wxMosaic = syntheticLevelMosaic(2);
  view.wxLevels = [false, true, false, false, false, false];

  view.brite.wxc = 100;
  expect(wxStippleHex(100)).toBe(applyBrite("#6c7070", 100));
  const draw100 = mockDrawCtx();
  drawWeatherLayer(draw100.ctx, view, size);
  expect(draw100.drawImages).toHaveLength(2);

  view.brite.wxc = 0;
  const drawOff = mockDrawCtx();
  drawWeatherLayer(drawOff.ctx, view, size);
  expect(drawOff.drawImages).toHaveLength(1);

  let foundCol = 0;
  let foundRow = 0;
  for (let r = 0; r < WX_PATTERN_TILE_SIZE; r++) {
    for (let c = 0; c < WX_PATTERN_TILE_SIZE; c++) {
      if (wxProceduralTextureRgb(2, c, r, 100, 100)[0] === 108) {
        foundCol = c;
        foundRow = r;
        break;
      }
    }
  }
  expect(wxProceduralTextureRgb(2, foundCol, foundRow, 100, 100)).toEqual([108, 112, 112]);
  expect(wxProceduralTextureRgb(2, foundCol, foundRow, 100, 0)).toEqual([19, 39, 39]);
});

test("weatherLayer has no airport-id branch, fetch, or JSON.parse", () => {
  const sources = import.meta.glob("../*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["../weatherLayer.ts"] ?? "";
  expect(src).toMatch(/drawImage/);
  expect(src).toMatch(/applyBrite/);
  expect(src).not.toMatch(/icao\s*===/);
  expect(src).not.toMatch(/"KDEM"|"KATL"/);
  expect(src).not.toMatch(/JSON\.parse/);
  expect(src).not.toMatch(/\bfetch\s*\(/);
  expect(src).not.toMatch(/openstreetmap/i);
});
