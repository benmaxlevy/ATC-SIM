/**
 * Composite enabled VIP masks into a cached base canvas and screen-space patterns.
 * Decode / fetch stay in `wx/`. Display only — does not steer aircraft.
 */

import { latLonToNm, nmToLatLon, type LatLon } from "@core";
import { nmToScreen, type ScopeViewSize } from "../camera";
import { applyBrite, snapBriteLevel } from "../palette";
import type { ScopeView } from "../scopeView";
import type { WxLevels, WxMosaic } from "../wx";
import { WX_VIP_FILL_HEX } from "./wxStarsFill";

import {
  buildWeatherComposite,
  buildWeatherCompositeAsync,
  type WeatherCompositeInput,
  type WeatherCompositePixels,
} from "./weatherComposite";

export { WX_VIP_FILL_HEX } from "./wxStarsFill";

export const DEFAULT_WX_ALPHA = 255;
/** Backing base mosaic scale (1x native mosaic bins). */
export const WX_TEXTURE_SCALE = 1;
export const WX_PATTERN_TILE_SIZE = 32;

export const WX_BACKGROUND_HEX = [
  "#132727",
  "#132727",
  "#132727",
  "#32321a",
  "#32321a",
  "#32321a",
] as const;
export const WX_STIPPLE_HEX = "#6c7070";

export function wxVipFillHex(level: 1 | 2 | 3 | 4 | 5 | 6, briteWx: number): string {
  return applyBrite(WX_VIP_FILL_HEX[level - 1]!, briteWx);
}

export function wxLevelBackgroundHex(level: 1 | 2 | 3 | 4 | 5 | 6, briteWx: number): string {
  return applyBrite(WX_BACKGROUND_HEX[level - 1]!, briteWx);
}

export function wxStippleHex(briteWxc: number): string {
  return applyBrite(WX_STIPPLE_HEX, briteWxc);
}

/** VIP 1–6 band-edge contours. Brighter than fills; not IEM NWS ramp stops. */
export const WX_VIP_CONTOUR_HEX = [
  "#3CC83C",
  "#FFFF64",
  "#FFA028",
  "#BF0000",
  "#FF3CFF",
  "#FFFFFF",
] as const;

export function wxVipContourHex(level: 1 | 2 | 3 | 4 | 5 | 6, briteWxc: number): string {
  return applyBrite(WX_VIP_CONTOUR_HEX[level - 1]!, briteWxc);
}

function anyLevelOn(levels: WxLevels): boolean {
  return levels[0] || levels[1] || levels[2] || levels[3] || levels[4] || levels[5];
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

export type WxImageData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  colorSpace?: PredefinedColorSpace;
};

export type Wx2dContext = {
  globalCompositeOperation?: string;
  imageSmoothingEnabled?: boolean;
  fillStyle?: string | CanvasPattern | CanvasGradient;
  save?(): void;
  restore?(): void;
  translate?(x: number, y: number): void;
  clearRect?(x: number, y: number, w: number, h: number): void;
  fillRect?(x: number, y: number, w: number, h: number): void;
  drawImage?(image: CanvasImageSource, dx: number, dy: number, dw?: number, dh?: number): void;
  createPattern?(image: CanvasImageSource, repetition: string): CanvasPattern | null;
  createImageData?(width: number, height: number): ImageData | WxImageData;
  putImageData?(imageData: ImageData | WxImageData, dx: number, dy: number): void;
};

export type WxCanvas = {
  width: number;
  height: number;
  getContext?(contextId: string): Wx2dContext | null;
  _pixels?: Uint8ClampedArray;
};

export function createOffscreenCanvas(width: number, height: number): WxCanvas {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as WxCanvas;
  }
  if (typeof OffscreenCanvas === "function") {
    return new OffscreenCanvas(width, height) as unknown as WxCanvas;
  }
  return {
    width,
    height,
    getContext(_id: string) {
      return {
        globalCompositeOperation: "source-over",
        imageSmoothingEnabled: false,
        fillStyle: "",
        save() {},
        restore() {},
        translate() {},
        clearRect() {},
        fillRect() {},
        drawImage() {},
        createPattern() {
          return { setTransform() {} };
        },
        createImageData(w: number, h: number): WxImageData {
          return {
            width: w,
            height: h,
            data: new Uint8ClampedArray(w * h * 4),
            colorSpace: "srgb",
          };
        },
        putImageData() {},
      };
    },
  };
}

function writeCompositePixels(canvas: WxCanvas, pixels: Uint8ClampedArray): void {
  canvas._pixels = pixels;
  if (!canvas || typeof canvas.getContext !== "function") {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof ctx.putImageData !== "function") {
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  const imageData: ImageData | WxImageData =
    typeof ctx.createImageData === "function"
      ? ctx.createImageData(width, height)
      : { width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb" };
  imageData.data.set(pixels);
  ctx.putImageData(imageData as ImageData, 0, 0);
}

/** Procedural fill / 1px outline. Not a mosaic-bin flood. */
export function wxScreenStyle(outline: boolean): "fill" | "contour" {
  return outline ? "contour" : "fill";
}

export type WxPatternKind = "square" | "rectangle";

export interface PatternMark {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PatternInfo {
  kind: WxPatternKind;
  mask: Uint8Array;
  marks: PatternMark[];
}

/**
 * Authentic STARS 32x32 stipple bitmasks from Vice (radar/weather.go).
 * wxStippleLight: 2x2 scattered squares.
 * wxStippleDense: 16x16 basis of 1x2 and 2x1 1px-thin lines, repeated 2x2.
 */
const WX_STIPPLE_LIGHT_BITS: readonly number[] = [
  0b00000000000000000000000000000000, 0b00000000000000000000000000000000,
  0b00000000000011000000000000000000, 0b00000000000011000000000000000000,
  0b00000000000000000000000000000000, 0b00000000000000000000000000000000,
  0b00000000000000000000000000000000, 0b00000000000000000000001100000000,
  0b00000000000000000000001100000000, 0b00000000000000000000000000000000,
  0b00000000000000000000000000000000, 0b00000001100000000000000000000000,
  0b00000001100000000000000000000000, 0b00000000000000000000000000000000,
  0b00000000000000000000000000000000, 0b00000000000000110000000000000000,
  0b00000000000000110000000000000000, 0b00000000000000000000000000001100,
  0b00000000000000000000000000001100, 0b00000000000000000000000000000000,
  0b00000000000000000000000000000000, 0b00000000000000000000000000000000,
  0b00000000110000000000000000000000, 0b00000000110000000000000000000000,
  0b00000000000000000000000000000000, 0b00000000000000000011000000000000,
  0b00000000000000000011000000000000, 0b00000000000000000000000000000000,
  0b00000000000000000000000000000000, 0b00000000000000000000000000000000,
  0b11000000000000000000000000000000, 0b11000000000000000000000000000000,
];

const WX_STIPPLE_DENSE_BITS: readonly number[] = [
  0b00000000000000000000000000000000, 0b00000000000000000000000000000000,
  0b00001000000000000000100000000000, 0b00001000000000000000100000000000,
  0b00000000000110000000000000011000, 0b01000000000000000100000000000000,
  0b01000000000000000100000000000000, 0b00000001100000000000000110000000,
  0b00000000000000000000000000000000, 0b00000000000000110000000000000011,
  0b00000000000000000000000000000000, 0b00011000000000000001100000000000,
  0b00000000000000000000000000000000, 0b00000000001000000000000000100000,
  0b00000000001000000000000000100000, 0b11000000000000001100000000000000,
  0b00000000000000000000000000000000, 0b00000000000000000000000000000000,
  0b00001000000000000000100000000000, 0b00001000000000000000100000000000,
  0b00000000000110000000000000011000, 0b01000000000000000100000000000000,
  0b01000000000000000100000000000000, 0b00000001100000000000000110000000,
  0b00000000000000000000000000000000, 0b00000000000000110000000000000011,
  0b00000000000000000000000000000000, 0b00011000000000000001100000000000,
  0b00000000000000000000000000000000, 0b00000000001000000000000000100000,
  0b00000000001000000000000000100000, 0b11000000000000001100000000000000,
];

function buildBitmapPattern(bits: readonly number[], kind: WxPatternKind): PatternInfo {
  const size = WX_PATTERN_TILE_SIZE;
  const mask = new Uint8Array(size * size);
  for (let r = 0; r < size; r++) {
    const rowBits = bits[r]!;
    for (let c = 0; c < size; c++) {
      if (((rowBits >>> (31 - c)) & 1) !== 0) {
        mask[r * size + c] = 1;
      }
    }
  }

  const visited = new Uint8Array(size * size);
  const marks: PatternMark[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (mask[r * size + c] === 1 && visited[r * size + c] === 0) {
        let w = 0;
        while (
          c + w < size &&
          mask[r * size + (c + w)] === 1 &&
          visited[r * size + (c + w)] === 0
        ) {
          w++;
        }
        let h = 1;
        while (r + h < size) {
          let fullRow = true;
          for (let i = 0; i < w; i++) {
            if (mask[(r + h) * size + (c + i)] !== 1 || visited[(r + h) * size + (c + i)] !== 0) {
              fullRow = false;
              break;
            }
          }
          if (!fullRow) break;
          h++;
        }
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            visited[(r + dy) * size + (c + dx)] = 1;
          }
        }
        marks.push({ x: c, y: r, width: w, height: h });
      }
    }
  }

  return { kind, mask, marks };
}

const PATTERN_DEFINITIONS: Record<WxPatternKind, PatternInfo> = {
  square: buildBitmapPattern(WX_STIPPLE_LIGHT_BITS, "square"),
  rectangle: buildBitmapPattern(WX_STIPPLE_DENSE_BITS, "rectangle"),
};

export function getPatternTileMask(kind: WxPatternKind): Uint8Array {
  return PATTERN_DEFINITIONS[kind].mask;
}

export function getPatternMarks(kind: WxPatternKind): readonly PatternMark[] {
  return PATTERN_DEFINITIONS[kind].marks;
}

const patternTileCanvasCache = new Map<string, WxCanvas>();
const patternCache = new Map<string, CanvasPattern | null>();

export function getOrCreatePatternTileCanvas(kind: WxPatternKind, briteWxc: number): WxCanvas {
  const key = `${kind}:${snapBriteLevel(briteWxc)}`;
  const existing = patternTileCanvasCache.get(key);
  if (existing) {
    return existing;
  }
  const canvas = createOffscreenCanvas(WX_PATTERN_TILE_SIZE, WX_PATTERN_TILE_SIZE);
  const mask = getPatternTileMask(kind);
  const [r, g, b] = parseHexRgb(applyBrite(WX_STIPPLE_HEX, briteWxc));
  const pixels = new Uint8ClampedArray(WX_PATTERN_TILE_SIZE * WX_PATTERN_TILE_SIZE * 4);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 0) {
      const o = i * 4;
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = DEFAULT_WX_ALPHA;
    }
  }
  writeCompositePixels(canvas, pixels);
  patternTileCanvasCache.set(key, canvas);
  return canvas;
}

export function getOrCreatePattern(
  ctx: CanvasRenderingContext2D | Wx2dContext | null | undefined,
  kind: WxPatternKind,
  briteWxc: number,
): CanvasPattern | null {
  const key = `${kind}:${snapBriteLevel(briteWxc)}`;
  if (patternCache.has(key)) {
    return patternCache.get(key)!;
  }
  const tileCanvas = getOrCreatePatternTileCanvas(kind, briteWxc);
  let pattern: CanvasPattern | null = null;
  if (ctx && typeof ctx.createPattern === "function") {
    try {
      pattern = ctx.createPattern(tileCanvas as unknown as CanvasImageSource, "repeat");
    } catch {
      pattern = null;
    }
  }
  patternCache.set(key, pattern);
  return pattern;
}

let cachedScratchCanvas: WxCanvas | null = null;
let cachedScratchWidth = 0;
let cachedScratchHeight = 0;

export function acquireScratchCanvas(width: number, height: number): WxCanvas {
  if (cachedScratchCanvas && cachedScratchWidth === width && cachedScratchHeight === height) {
    return cachedScratchCanvas;
  }
  cachedScratchWidth = width;
  cachedScratchHeight = height;
  cachedScratchCanvas = createOffscreenCanvas(width, height);
  return cachedScratchCanvas;
}

/** Deterministic screen-space WX background and stipple mark colors. */
export function wxProceduralTextureRgb(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  col: number,
  row: number,
  briteWx: number,
  briteWxc: number = briteWx,
): [number, number, number] {
  const bgHex = WX_BACKGROUND_HEX[level - 1]!;
  const fill = parseHexRgb(applyBrite(bgHex, briteWx));
  if (level === 1 || level === 4) {
    return fill;
  }
  if (snapBriteLevel(briteWxc) <= 0) {
    return fill;
  }
  const kind: WxPatternKind = level === 2 || level === 5 ? "square" : "rectangle";
  const mask = getPatternTileMask(kind);
  const size = WX_PATTERN_TILE_SIZE;
  const x = ((col % size) + size) % size;
  const y = ((row % size) + size) % size;
  if (mask[y * size + x] !== 0) {
    return parseHexRgb(applyBrite(WX_STIPPLE_HEX, briteWxc));
  }
  return fill;
}

interface CachedMosaicState {
  mosaic: WxMosaic;
  layers: Array<WxCanvas | null>;
}

let cachedMosaicState: CachedMosaicState | null = null;
let pendingMosaic: WxMosaic | null = null;
let compositeWorker: Worker | null = null;

function cancelComposite(): void {
  pendingMosaic = null;
  compositeWorker?.terminate();
  compositeWorker = null;
}

export function resetWeatherLayerCache(): void {
  cachedMosaicState = null;
  cancelComposite();
  cachedScratchCanvas = null;
  cachedScratchWidth = 0;
  cachedScratchHeight = 0;
  patternTileCanvasCache.clear();
  patternCache.clear();
}

/** Warm all available levels even while every WX latch is off. */
function prepareWeatherLayers(mosaic: WxMosaic): CachedMosaicState | undefined {
  if (cachedMosaicState?.mosaic === mosaic) {
    cancelComposite();
    return cachedMosaicState;
  }
  if (pendingMosaic === mosaic) return cachedMosaicState ?? undefined;
  cancelComposite();
  const input: WeatherCompositeInput = {
    width: mosaic.widthPx,
    height: mosaic.heightPx,
    masks: mosaic.vipMasks,
    colors: WX_BACKGROUND_HEX.map((color) => parseHexRgb(color)),
  };
  const finish = (pixels: WeatherCompositePixels | undefined): void => {
    if (pendingMosaic !== mosaic || !pixels) return;
    const layers = pixels.layers.map((data) => {
      if (!data) return null;
      const canvas = createOffscreenCanvas(pixels.width, pixels.height);
      writeCompositePixels(canvas, data);
      return canvas;
    });
    cachedMosaicState = { mosaic, layers };
    cancelComposite();
  };
  pendingMosaic = mosaic;
  // Small DOM-free fixtures fit within a bounded synchronous batch.
  if (input.width * input.height <= 4096 && typeof Worker !== "function") {
    finish(buildWeatherComposite(input));
    return cachedMosaicState ?? undefined;
  }
  const fallback = (): void => {
    compositeWorker?.terminate();
    compositeWorker = null;
    void buildWeatherCompositeAsync(input, () => pendingMosaic === mosaic).then(finish);
  };
  try {
    if (typeof Worker !== "function") fallback();
    else {
      compositeWorker = new Worker(new URL("./weatherComposite.worker.ts", import.meta.url), {
        type: "module",
      });
      compositeWorker.onmessage = (event: MessageEvent<WeatherCompositePixels>) =>
        finish(event.data);
      compositeWorker.onerror = () => {
        if (pendingMosaic === mosaic) fallback();
      };
      compositeWorker.postMessage(input);
    }
  } catch {
    fallback();
  }
  return cachedMosaicState ?? undefined;
}

function drawScreenPattern(
  ctx: CanvasRenderingContext2D,
  maskCanvas: WxCanvas,
  kind: WxPatternKind,
  briteWxc: number,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  size: ScopeViewSize,
): void {
  if (snapBriteLevel(briteWxc) <= 0) {
    return;
  }
  const scratchCanvas = acquireScratchCanvas(size.widthPx, size.heightPx);
  if (!scratchCanvas || typeof scratchCanvas.getContext !== "function") {
    return;
  }
  const scratchCtx = scratchCanvas.getContext("2d");
  if (!scratchCtx) {
    return;
  }

  const pattern = getOrCreatePattern(scratchCtx, kind, briteWxc);

  if (typeof scratchCtx.clearRect === "function") {
    scratchCtx.clearRect(0, 0, size.widthPx, size.heightPx);
  }

  scratchCtx.globalCompositeOperation = "source-over";
  scratchCtx.imageSmoothingEnabled = false;

  if (typeof scratchCtx.drawImage === "function") {
    scratchCtx.drawImage(maskCanvas as unknown as CanvasImageSource, destX, destY, destW, destH);
  }

  scratchCtx.globalCompositeOperation = "source-in";
  const originX = Math.round(destX);
  const originY = Math.round(destY);
  if (typeof scratchCtx.save === "function") {
    scratchCtx.save();
  }
  if (typeof scratchCtx.translate === "function") {
    scratchCtx.translate(originX, originY);
  }
  if (pattern) {
    scratchCtx.fillStyle = pattern;
  }
  if (typeof scratchCtx.fillRect === "function") {
    scratchCtx.fillRect(-originX, -originY, size.widthPx, size.heightPx);
  }
  if (typeof scratchCtx.restore === "function") {
    scratchCtx.restore();
  }

  scratchCtx.globalCompositeOperation = "source-over";
  ctx.drawImage(scratchCanvas as unknown as CanvasImageSource, 0, 0, size.widthPx, size.heightPx);
}

export function drawWeatherLayer(
  ctx: CanvasRenderingContext2D,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  const mosaic = view.wxMosaic;
  if (!mosaic || mosaic.widthPx <= 0 || mosaic.heightPx <= 0) {
    cancelComposite();
    cachedMosaicState = null;
    return;
  }
  const layers = prepareWeatherLayers(mosaic);
  if (!layers || !anyLevelOn(view.wxLevels)) return;
  const arp = resolveArp(view);
  const nw = latLonToNm({ latDeg: layers.mosaic.northLat, lonDeg: layers.mosaic.westLon }, arp);
  const se = latLonToNm({ latDeg: layers.mosaic.southLat, lonDeg: layers.mosaic.eastLon }, arp);
  const nwPx = nmToScreen(nw.xNm, nw.yNm, view.camera, size);
  const sePx = nmToScreen(se.xNm, se.yNm, view.camera, size);
  const destX = nwPx.x;
  const destY = nwPx.y;
  const destW = sePx.x - nwPx.x;
  const destH = sePx.y - nwPx.y;

  const imageSmoothingEnabled = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  const alpha = ctx.globalAlpha ?? 1;
  const briteWxc = view.brite.wxc ?? 100;
  for (let level = 0; level < 6; level++) {
    const canvas = layers.layers[level];
    if (!view.wxLevels[level] || !canvas) continue;
    ctx.globalAlpha = (alpha * snapBriteLevel(view.brite.wx)) / 100;
    ctx.drawImage(canvas as unknown as CanvasImageSource, destX, destY, destW, destH);
    ctx.globalAlpha = alpha;
    if (snapBriteLevel(briteWxc) > 0 && level !== 0 && level !== 3) {
      drawScreenPattern(
        ctx,
        canvas,
        level === 1 || level === 4 ? "square" : "rectangle",
        briteWxc,
        destX,
        destY,
        destW,
        destH,
        size,
      );
    }
  }
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = imageSmoothingEnabled;
}
