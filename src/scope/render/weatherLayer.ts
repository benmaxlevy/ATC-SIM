/**
 * Composite enabled VIP masks into one cached canvas and draw it under tracks.
 * Decode / fetch stay in `wx/`. Display only — does not steer aircraft.
 *
 * Per-level tiles from `testdata/wx/levels/wx1.png` … `wx6.png`, sampled in
 * screen space from one origin. Fallback solids if a tile is missing. Not the
 * IEM NWS rainbow. `view.brite.wx` tints fills; `view.brite.wxc` tints a 1px
 * outline. Rebuild when mosaic, levels, brite, camera, size, or tiles change.
 */

import { latLonToNm, nmToLatLon, type LatLon } from "@core";
import { nmToScreen, type ScopeCamera, type ScopeViewSize } from "../camera";
import { applyBrite, snapBriteLevel } from "../palette";
import type { ScopeView } from "../scopeView";
import type { WxLevels, WxMosaic } from "../wx";
import { sampleWxLevelTile, wxLevelTilesGeneration } from "../wx/levelTiles";
import { WX_VIP_FILL_HEX } from "./wxStarsFill";

export { WX_VIP_FILL_HEX } from "./wxStarsFill";

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
let cachedRangeNm = -1;
let cachedCenterEastNm = Number.NaN;
let cachedCenterNorthNm = Number.NaN;
let cachedArpLat = Number.NaN;
let cachedArpLon = Number.NaN;
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

function vipAtScreen(
  mosaic: WxMosaic,
  levels: WxLevels,
  x: number,
  y: number,
  nwPx: { x: number; y: number },
  dw: number,
  dh: number,
): number {
  const v = (y + 0.5 - nwPx.y) / dh;
  const u = (x + 0.5 - nwPx.x) / dw;
  if (v < 0 || v >= 1 || u < 0 || u >= 1) {
    return 0;
  }
  const row = Math.min(mosaic.heightPx - 1, Math.max(0, Math.floor(v * mosaic.heightPx)));
  const col = Math.min(mosaic.widthPx - 1, Math.max(0, Math.floor(u * mosaic.widthPx)));
  return highestVipAt(mosaic, levels, row * mosaic.widthPx + col);
}

/** Tile / fallback fill / 1px screen outline. Not a mosaic-bin flood. */
export function wxScreenStyle(outline: boolean): "fill" | "contour" {
  return outline ? "contour" : "fill";
}

function tintRgb(rgb: [number, number, number], brite: number): [number, number, number] {
  const t = snapBriteLevel(brite) / 100;
  return [Math.round(rgb[0] * t), Math.round(rgb[1] * t), Math.round(rgb[2] * t)];
}

function cameraMatches(cam: ScopeCamera, arp: LatLon): boolean {
  return (
    cachedRangeNm === cam.rangeNm &&
    cachedCenterEastNm === cam.centerEastNm &&
    cachedCenterNorthNm === cam.centerNorthNm &&
    cachedArpLat === arp.latDeg &&
    cachedArpLon === arp.lonDeg
  );
}

function rebuildComposite(
  mosaic: WxMosaic,
  levels: WxLevels,
  briteWx: number,
  briteWxc: number,
  view: ScopeView,
  size: ScopeViewSize,
): WxCompositeCanvas {
  const width = Math.max(1, Math.round(size.widthPx));
  const height = Math.max(1, Math.round(size.heightPx));
  const pixels = new Uint8ClampedArray(width * height * 4);
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
  const arp = resolveArp(view);
  const nw = latLonToNm({ latDeg: mosaic.northLat, lonDeg: mosaic.westLon }, arp);
  const se = latLonToNm({ latDeg: mosaic.southLat, lonDeg: mosaic.eastLon }, arp);
  const nwPx = nmToScreen(nw.xNm, nw.yNm, view.camera, size);
  const sePx = nmToScreen(se.xNm, se.yNm, view.camera, size);
  const dw = sePx.x - nwPx.x;
  const dh = sePx.y - nwPx.y;
  if (dw === 0 || dh === 0) {
    const canvas = acquireCanvas(width, height);
    writeCompositePixels(canvas, pixels);
    return canvas;
  }
  const x0 = Math.max(0, Math.floor(Math.min(nwPx.x, sePx.x)));
  const x1 = Math.min(width, Math.ceil(Math.max(nwPx.x, sePx.x)));
  const y0 = Math.max(0, Math.floor(Math.min(nwPx.y, sePx.y)));
  const y1 = Math.min(height, Math.ceil(Math.max(nwPx.y, sePx.y)));
  const mw = mosaic.widthPx;
  const mh = mosaic.heightPx;
  for (let y = y0; y < y1; y++) {
    const v = (y + 0.5 - nwPx.y) / dh;
    if (v < 0 || v >= 1) {
      continue;
    }
    const row = Math.min(mh - 1, Math.max(0, Math.floor(v * mh)));
    for (let x = x0; x < x1; x++) {
      const u = (x + 0.5 - nwPx.x) / dw;
      if (u < 0 || u >= 1) {
        continue;
      }
      const col = Math.min(mw - 1, Math.max(0, Math.floor(u * mw)));
      const index = row * mw + col;
      const vip = highestVipAt(mosaic, levels, index);
      if (vip === 0) {
        continue;
      }
      const fill = fills[vip - 1];
      if (!fill) {
        continue;
      }
      const outline =
        vipAtScreen(mosaic, levels, x - 1, y, nwPx, dw, dh) !== vip ||
        vipAtScreen(mosaic, levels, x + 1, y, nwPx, dw, dh) !== vip ||
        vipAtScreen(mosaic, levels, x, y - 1, nwPx, dw, dh) !== vip ||
        vipAtScreen(mosaic, levels, x, y + 1, nwPx, dw, dh) !== vip;
      const style = wxScreenStyle(outline);
      let rgb = fill;
      if (style === "contour") {
        rgb = contours[vip - 1] ?? fill;
      } else {
        const sampled = sampleWxLevelTile(vip as 1 | 2 | 3 | 4 | 5 | 6, x, y);
        if (sampled) {
          rgb = tintRgb(sampled, briteWx);
        }
      }
      const o = (y * width + x) * 4;
      pixels[o] = rgb[0];
      pixels[o + 1] = rgb[1];
      pixels[o + 2] = rgb[2];
      pixels[o + 3] = 255;
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
  view: ScopeView,
  size: ScopeViewSize,
): WxCompositeCanvas {
  const arp = resolveArp(view);
  if (
    cachedCanvas &&
    cachedMosaic === mosaic &&
    cachedLevels !== null &&
    levelsMatch(cachedLevels, levels) &&
    cachedBriteWx === briteWx &&
    cachedBriteWxc === briteWxc &&
    cachedWidth === Math.round(size.widthPx) &&
    cachedHeight === Math.round(size.heightPx) &&
    cachedTilesGen === wxLevelTilesGeneration() &&
    cameraMatches(view.camera, arp)
  ) {
    return cachedCanvas;
  }
  const canvas = rebuildComposite(mosaic, levels, briteWx, briteWxc, view, size);
  cachedMosaic = mosaic;
  cachedLevels = levels;
  cachedBriteWx = briteWx;
  cachedBriteWxc = briteWxc;
  cachedCanvas = canvas;
  cachedRangeNm = view.camera.rangeNm;
  cachedCenterEastNm = view.camera.centerEastNm;
  cachedCenterNorthNm = view.camera.centerNorthNm;
  cachedArpLat = arp.latDeg;
  cachedArpLon = arp.lonDeg;
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
  const canvas = reuseOrRebuildComposite(
    mosaic,
    view.wxLevels,
    view.brite.wx,
    view.brite.wxc,
    view,
    size,
  );
  ctx.drawImage(canvas as CanvasImageSource, 0, 0, size.widthPx, size.heightPx);
}
