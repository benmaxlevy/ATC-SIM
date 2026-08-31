import { expect, test } from "vitest";
import { applyBrite } from "../../palette";
import { createScopeView } from "../../scopeView";
import {
  WX_VIP_CONTOUR_HEX,
  WX_VIP_FILL_HEX,
  drawWeatherLayer,
  wxScreenStyle,
  wxVipContourHex,
  wxVipFillHex,
} from "../weatherLayer";
import { bboxFromArp, decodeRgbaToVipMasks, emptyWxMosaic } from "../../wx";

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
