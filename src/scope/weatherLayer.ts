/**
 * Composite enabled VIP masks into one cached canvas and draw it under tracks.
 * Decode / fetch stay in `wx/`. Display only — does not steer aircraft.
 *
 * Trainer STARS-like fills (dark green → yellow → orange → red → magenta →
 * white), not the IEM NWS rainbow. `view.brite.wx` tints fills; `view.brite.wxc`
 * tints VIP band-edge contours. Rebuild when mosaic, levels, wx, or wxc change.
 */

import { latLonToNm, nmToLatLon, type LatLon } from "@core";
import { nmToScreen, type ScopeViewSize } from "./camera";
import { applyBrite } from "./palette";
import type { ScopeView } from "./scopeView";
import type { WxLevels, WxMosaic } from "./wx";

/** VIP 1–6 trainer fills. Distinct hues; not N0Q cyan/lime ramp stops. */
export const WX_VIP_FILL_HEX = [
  "#146414",
  "#C8C800",
  "#E67800",
  "#C80000",
  "#C800C8",
  "#FFFFFF",
] as const;

export function wxVipFillHex(level: 1 | 2 | 3 | 4 | 5 | 6, briteWx: number): string {
  return applyBrite(WX_VIP_FILL_HEX[level - 1]!, briteWx);
}

/** VIP 1–6 band-edge contours. Brighter than fills; not IEM NWS ramp stops. */
export const WX_VIP_CONTOUR_HEX = [
  "#3CC83C",
  "#FFFF64",
  "#FFA028",
  "#FF3C3C",
  "#FF3CFF",
  "#FFFFFF",
] as const;

export function wxVipContourHex(level: 1 | 2 | 3 | 4 | 5 | 6, briteWxc: number): string {
  return applyBrite(WX_VIP_CONTOUR_HEX[level - 1]!, briteWxc);
}

function maskBit(mask: Uint8Array, index: number): boolean {
  return ((mask[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
}

function anyLevelOn(levels: WxLevels): boolean {
  return levels[0] || levels[1] || levels[2] || levels[3] || levels[4] || levels[5];
}

function levelsMatch(a: WxLevels, b: WxLevels): boolean {
  return (
    a[0] === b[0] &&
    a[1] === b[1] &&
    a[2] === b[2] &&
    a[3] === b[3] &&
    a[4] === b[4] &&
    a[5] === b[5]
  );
}

function parseHexRgb(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

const GEO_ORIGIN: LatLon = { latDeg: 0, lonDeg: 0 };

/**
 * Scenario ARP when stored on the view. Else airport ENU about the origin.
 * Never an airport-id branch.
 */
function resolveArp(view: ScopeView): LatLon {
  if (view.arp) {
    return view.arp;
  }
  return nmToLatLon({ xNm: view.airportEastNm, yNm: view.airportNorthNm }, GEO_ORIGIN);
}

type WxCompositeCanvas = {
  width: number;
  height: number;
};

let cachedMosaic: WxMosaic | null = null;
let cachedLevels: WxLevels | null = null;
let cachedBriteWx = -1;
let cachedBriteWxc = -1;
let cachedCanvas: WxCompositeCanvas | null = null;
let cachedWidth = 0;
let cachedHeight = 0;

function acquireCanvas(width: number, height: number): WxCompositeCanvas {
  if (cachedCanvas && cachedWidth === width && cachedHeight === height) {
    return cachedCanvas;
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    cachedWidth = width;
    cachedHeight = height;
    return canvas;
  }
  if (typeof OffscreenCanvas === "function") {
    cachedWidth = width;
    cachedHeight = height;
    return new OffscreenCanvas(width, height);
  }
  cachedWidth = width;
  cachedHeight = height;
  return { width, height };
}

type Wx2dContext = {
  createImageData(width: number, height: number): ImageData;
  putImageData(imageData: ImageData, dx: number, dy: number): void;
};

function writeCompositePixels(canvas: WxCompositeCanvas, pixels: Uint8ClampedArray): void {
  const width = canvas.width;
  const height = canvas.height;
  if (!("getContext" in canvas)) {
    return;
  }
  const maybeCtx = (canvas as { getContext(id: "2d"): Wx2dContext | null }).getContext("2d");
  if (!maybeCtx) {
    return;
  }
  const imageData = maybeCtx.createImageData(width, height);
  imageData.data.set(pixels);
  maybeCtx.putImageData(imageData, 0, 0);
}

function neighborSameLevel(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false;
  }
  return maskBit(mask, y * width + x);
}

function isVipBandEdge(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  return (
    !neighborSameLevel(mask, width, height, x - 1, y) ||
    !neighborSameLevel(mask, width, height, x + 1, y) ||
    !neighborSameLevel(mask, width, height, x, y - 1) ||
    !neighborSameLevel(mask, width, height, x, y + 1)
  );
}

function rebuildComposite(
  mosaic: WxMosaic,
  levels: WxLevels,
  briteWx: number,
  briteWxc: number,
): WxCompositeCanvas {
  const width = mosaic.widthPx;
  const height = mosaic.heightPx;
  const pixelCount = width * height;
  const pixels = new Uint8ClampedArray(pixelCount * 4);
  const fills: Array<[number, number, number] | null> = [
    levels[0] ? parseHexRgb(wxVipFillHex(1, briteWx)) : null,
    levels[1] ? parseHexRgb(wxVipFillHex(2, briteWx)) : null,
    levels[2] ? parseHexRgb(wxVipFillHex(3, briteWx)) : null,
    levels[3] ? parseHexRgb(wxVipFillHex(4, briteWx)) : null,
    levels[4] ? parseHexRgb(wxVipFillHex(5, briteWx)) : null,
    levels[5] ? parseHexRgb(wxVipFillHex(6, briteWx)) : null,
  ];
  const contours: Array<[number, number, number] | null> = [
    levels[0] ? parseHexRgb(wxVipContourHex(1, briteWxc)) : null,
    levels[1] ? parseHexRgb(wxVipContourHex(2, briteWxc)) : null,
    levels[2] ? parseHexRgb(wxVipContourHex(3, briteWxc)) : null,
    levels[3] ? parseHexRgb(wxVipContourHex(4, briteWxc)) : null,
    levels[4] ? parseHexRgb(wxVipContourHex(5, briteWxc)) : null,
    levels[5] ? parseHexRgb(wxVipContourHex(6, briteWxc)) : null,
  ];
  for (let i = 0; i < pixelCount; i++) {
    for (let level = 0; level < 6; level++) {
      const rgb = fills[level];
      if (!rgb) {
        continue;
      }
      if (maskBit(mosaic.vipMasks[level]!, i)) {
        const o = i * 4;
        pixels[o] = rgb[0];
        pixels[o + 1] = rgb[1];
        pixels[o + 2] = rgb[2];
        pixels[o + 3] = 255;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      for (let level = 0; level < 6; level++) {
        const rgb = contours[level];
        if (!rgb) {
          continue;
        }
        const mask = mosaic.vipMasks[level]!;
        if (!maskBit(mask, i)) {
          continue;
        }
        if (!isVipBandEdge(mask, width, height, x, y)) {
          continue;
        }
        const o = i * 4;
        pixels[o] = rgb[0];
        pixels[o + 1] = rgb[1];
        pixels[o + 2] = rgb[2];
        pixels[o + 3] = 255;
      }
    }
  }
  const canvas = acquireCanvas(width, height);
  writeCompositePixels(canvas, pixels);
  return canvas;
}

function reuseOrRebuildComposite(
  mosaic: WxMosaic,
  levels: WxLevels,
  briteWx: number,
  briteWxc: number,
): WxCompositeCanvas {
  if (
    cachedCanvas &&
    cachedMosaic === mosaic &&
    cachedLevels !== null &&
    levelsMatch(cachedLevels, levels) &&
    cachedBriteWx === briteWx &&
    cachedBriteWxc === briteWxc
  ) {
    return cachedCanvas;
  }
  const canvas = rebuildComposite(mosaic, levels, briteWx, briteWxc);
  cachedMosaic = mosaic;
  cachedLevels = levels;
  cachedBriteWx = briteWx;
  cachedBriteWxc = briteWxc;
  cachedCanvas = canvas;
  return canvas;
}

export function drawWeatherLayer(
  ctx: CanvasRenderingContext2D,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  if (!anyLevelOn(view.wxLevels)) {
    return;
  }
  const mosaic = view.wxMosaic;
  if (!mosaic || mosaic.widthPx <= 0 || mosaic.heightPx <= 0) {
    return;
  }
  const canvas = reuseOrRebuildComposite(mosaic, view.wxLevels, view.brite.wx, view.brite.wxc);
  const arp = resolveArp(view);
  const nw = latLonToNm({ latDeg: mosaic.northLat, lonDeg: mosaic.westLon }, arp);
  const se = latLonToNm({ latDeg: mosaic.southLat, lonDeg: mosaic.eastLon }, arp);
  const nwPx = nmToScreen(nw.xNm, nw.yNm, view.camera, size);
  const sePx = nmToScreen(se.xNm, se.yNm, view.camera, size);
  const dw = sePx.x - nwPx.x;
  const dh = sePx.y - nwPx.y;
  if (dw === 0 || dh === 0) {
    return;
  }
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas as CanvasImageSource, nwPx.x, nwPx.y, dw, dh);
  ctx.imageSmoothingEnabled = prevSmooth;
}
