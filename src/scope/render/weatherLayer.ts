/**
 * Composite enabled VIP masks into one cached canvas and draw it under tracks.
 * Decode / fetch stay in `wx/`. Display only — does not steer aircraft.
 *
 * Per-level tiles from `testdata/wx/levels/wx1.png` … `wx6.png`, sampled in
 * mosaic space from one origin. Fallback solids if a tile is missing. Not the
 * IEM NWS rainbow. `view.brite.wx` tints fills; `view.brite.wxc` tints a 1px
 * outline. Rebuild when mosaic, levels, brite, or tiles change. Camera changes
 * only update the destination rectangle for the cached geographic raster.
 */

import { latLonToNm, nmToLatLon, type LatLon } from "@core";
import { nmToScreen, type ScopeViewSize } from "../camera";
import { applyBrite, snapBriteLevel } from "../palette";
import type { ScopeView } from "../scopeView";
import type { WxLevels, WxMosaic } from "../wx";
import { getWxLevelTile, sampleWxLevelTile, wxLevelTilesGeneration } from "../wx/levelTiles";
import { WX_VIP_FILL_HEX } from "./wxStarsFill";

export { WX_VIP_FILL_HEX } from "./wxStarsFill";

export const DEFAULT_WX_ALPHA = 255;

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
let cachedTilesGen = -1;

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

function highestVipAt(mosaic: WxMosaic, levels: WxLevels, index: number): number {
  let vip = 0;
  for (let level = 0; level < 6; level++) {
    if (levels[level] && maskBit(mosaic.vipMasks[level]!, index)) {
      vip = level + 1;
    }
  }
  return vip;
}

/** Tile / fallback fill / 1px outline. Not a mosaic-bin flood. */
export function wxScreenStyle(outline: boolean): "fill" | "contour" {
  return outline ? "contour" : "fill";
}

function tintRgb(rgb: [number, number, number], brite: number): [number, number, number] {
  const t = snapBriteLevel(brite) / 100;
  return [Math.round(rgb[0] * t), Math.round(rgb[1] * t), Math.round(rgb[2] * t)];
}

function rebuildComposite(mosaic: WxMosaic, levels: WxLevels, briteWx: number): WxCompositeCanvas {
  const width = Math.max(1, Math.round(mosaic.widthPx));
  const height = Math.max(1, Math.round(mosaic.heightPx));
  const pixels = new Uint8ClampedArray(width * height * 4);
  const fills: Array<[number, number, number] | null> = [
    levels[0] ? parseHexRgb(wxVipFillHex(1, briteWx)) : null,
    levels[1] ? parseHexRgb(wxVipFillHex(2, briteWx)) : null,
    levels[2] ? parseHexRgb(wxVipFillHex(3, briteWx)) : null,
    levels[3] ? parseHexRgb(wxVipFillHex(4, briteWx)) : null,
    levels[4] ? parseHexRgb(wxVipFillHex(5, briteWx)) : null,
    levels[5] ? parseHexRgb(wxVipFillHex(6, briteWx)) : null,
  ];
  const mw = mosaic.widthPx;
  const mh = mosaic.heightPx;
  for (let row = 0; row < height; row++) {
    const mosaicRow = Math.min(mh - 1, row);
    for (let col = 0; col < width; col++) {
      const mosaicCol = Math.min(mw - 1, col);
      const index = mosaicRow * mw + mosaicCol;
      const vip = highestVipAt(mosaic, levels, index);
      if (vip === 0) {
        continue;
      }
      const fill = fills[vip - 1];
      if (!fill) {
        continue;
      }
      let rgb = fill;
      const sampledTile = getWxLevelTile(vip as 1 | 2 | 3 | 4 | 5 | 6);
      const sampled = sampledTile
        ? sampleWxLevelTile(
            vip as 1 | 2 | 3 | 4 | 5 | 6,
            Math.floor((col * sampledTile.width) / width),
            Math.floor((row * sampledTile.height) / height),
          )
        : null;
      if (sampled) {
        rgb = tintRgb(sampled, briteWx);
      }
      const o = (row * width + col) * 4;
      pixels[o] = rgb[0];
      pixels[o + 1] = rgb[1];
      pixels[o + 2] = rgb[2];
      pixels[o + 3] = DEFAULT_WX_ALPHA;
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
    cachedBriteWxc === briteWxc &&
    cachedTilesGen === wxLevelTilesGeneration() &&
    cachedWidth === Math.round(mosaic.widthPx) &&
    cachedHeight === Math.round(mosaic.heightPx)
  ) {
    return cachedCanvas;
  }
  const canvas = rebuildComposite(mosaic, levels, briteWx);
  cachedMosaic = mosaic;
  cachedLevels = levels;
  cachedBriteWx = briteWx;
  cachedBriteWxc = briteWxc;
  cachedCanvas = canvas;
  cachedTilesGen = wxLevelTilesGeneration();
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
  const imageSmoothingEnabled = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas as CanvasImageSource, nwPx.x, nwPx.y, sePx.x - nwPx.x, sePx.y - nwPx.y);
  ctx.imageSmoothingEnabled = imageSmoothingEnabled;
}
