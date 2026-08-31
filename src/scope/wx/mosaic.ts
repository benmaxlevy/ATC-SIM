import { nmToLatLon, type LatLon } from "@core";
import { bboxContains, bboxFromArp } from "./bbox";
import { planIemN0qCover } from "./iemUrl";
import { rgbToDbz } from "./n0qRamp";
import { decodePngToRgba, isPng } from "./png";
import {
  DEFAULT_WX_PAD_NM,
  DEFAULT_WX_VIP_BREAKS_DBZ,
  WX_REFRESH_MS,
  type VipBin,
  type VipLevel,
  type WxBbox,
  type WxMapSize,
  type WxMosaic,
} from "./types";
import { binVip } from "./vip";

function emptyMasks(): WxMosaic["vipMasks"] {
  return [
    new Uint8Array(0),
    new Uint8Array(0),
    new Uint8Array(0),
    new Uint8Array(0),
    new Uint8Array(0),
    new Uint8Array(0),
  ];
}

function allocMasks(pixelCount: number): WxMosaic["vipMasks"] {
  const n = Math.ceil(pixelCount / 8);
  return [
    new Uint8Array(n),
    new Uint8Array(n),
    new Uint8Array(n),
    new Uint8Array(n),
    new Uint8Array(n),
    new Uint8Array(n),
  ];
}

function setMaskBit(mask: Uint8Array, index: number): void {
  mask[index >> 3] |= 1 << (index & 7);
}

function maskBit(mask: Uint8Array, index: number): boolean {
  return ((mask[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
}

export function emptyWxMosaic(bounds?: Partial<WxBbox> & { fetchedAtMs?: number }): WxMosaic {
  return {
    westLon: bounds?.westLon ?? 0,
    southLat: bounds?.southLat ?? 0,
    eastLon: bounds?.eastLon ?? 0,
    northLat: bounds?.northLat ?? 0,
    widthPx: 0,
    heightPx: 0,
    vipMasks: emptyMasks(),
    fetchedAtMs: bounds?.fetchedAtMs ?? 0,
  };
}

export function decodeRgbaToVipMasks(
  rgba: Uint8Array,
  width: number,
  height: number,
  bbox: WxBbox,
  fetchedAtMs: number,
  breaks: readonly number[] = DEFAULT_WX_VIP_BREAKS_DBZ,
): WxMosaic {
  const pixelCount = width * height;
  const vipMasks = allocMasks(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const dbz = rgbToDbz(rgba[o] ?? 0, rgba[o + 1] ?? 0, rgba[o + 2] ?? 0, rgba[o + 3] ?? 0);
    if (dbz === null) {
      continue;
    }
    const vip = binVip(dbz, breaks);
    if (vip > 0) {
      setMaskBit(vipMasks[vip - 1]!, i);
    }
  }
  return {
    ...bbox,
    widthPx: width,
    heightPx: height,
    vipMasks,
    fetchedAtMs,
  };
}

/**
 * Decode IEM (or fixture) PNG into six VIP masks. Not a paint path — T02-69
 * owns PPI overlay / trainer fills.
 */
export async function decodePngToVipMasks(
  png: Uint8Array,
  bbox: WxBbox,
  fetchedAtMs: number,
  breaks: readonly number[] = DEFAULT_WX_VIP_BREAKS_DBZ,
): Promise<WxMosaic> {
  const decoded = await decodePngToRgba(png);
  return decodeRgbaToVipMasks(
    decoded.rgba,
    decoded.width,
    decoded.height,
    bbox,
    fetchedAtMs,
    breaks,
  );
}

/**
 * 5 min cadence. Pan/ARP still inside the fetched pad does not refetch.
 * Never-fetched empty (fetchedAtMs 0) always refetches.
 */
export function shouldRefetch(
  mosaic: WxMosaic,
  nowMs: number,
  arp: LatLon,
  _padNm: number = DEFAULT_WX_PAD_NM,
): boolean {
  if (mosaic.fetchedAtMs === 0 && mosaic.widthPx === 0) {
    return true;
  }
  if (nowMs - mosaic.fetchedAtMs >= WX_REFRESH_MS) {
    return true;
  }
  return !bboxContains(mosaic, arp);
}

export interface FetchWxMosaicOpts {
  arp: LatLon;
  nowMs: number;
  fetchImpl?: typeof fetch;
  padNm?: number;
  size?: WxMapSize;
  breaks?: readonly number[];
  /** When set, fetch this PNG once and bin it over the ARP pad. Skips IEM. */
  fixtureUrl?: string;
}

function blitRgba(
  dest: Uint8Array,
  destW: number,
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dx: number,
  dy: number,
): void {
  for (let row = 0; row < srcH; row++) {
    const destRow = (dy + row) * destW + dx;
    const srcRow = row * srcW;
    dest.set(src.subarray(srcRow * 4, (srcRow + srcW) * 4), destRow * 4);
  }
}

/**
 * Fetch IEM N0Q tiles that cover ARP ± pad and stitch them. `fetchImpl` is
 * required in tests. HTTP or decode failure returns an empty mosaic;
 * never throws to boot. Not WMS — IEM GetMap FILTER rejects the n0q group.
 */
export async function fetchWxMosaic(opts: FetchWxMosaicOpts): Promise<WxMosaic> {
  const padNm = opts.padNm ?? DEFAULT_WX_PAD_NM;
  const pad = bboxFromArp(opts.arp, padNm);
  const cover = planIemN0qCover(pad);
  const failed = (): WxMosaic => emptyWxMosaic({ ...cover.bbox, fetchedAtMs: opts.nowMs });
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  try {
    if (opts.fixtureUrl) {
      const res = await fetchImpl(opts.fixtureUrl);
      if (!res.ok) {
        return emptyWxMosaic({ ...pad, fetchedAtMs: opts.nowMs });
      }
      const png = new Uint8Array(await res.arrayBuffer());
      if (!isPng(png)) {
        return emptyWxMosaic({ ...pad, fetchedAtMs: opts.nowMs });
      }
      return await decodePngToVipMasks(png, pad, opts.nowMs, opts.breaks);
    }
    const decodedTiles: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      rgba: Uint8Array;
    }> = [];
    for (const tile of cover.tiles) {
      const res = await fetchImpl(tile.url);
      if (!res.ok) {
        continue;
      }
      const png = new Uint8Array(await res.arrayBuffer());
      if (!isPng(png)) {
        continue;
      }
      const decoded = await decodePngToRgba(png);
      decodedTiles.push({
        x: tile.x,
        y: tile.y,
        width: decoded.width,
        height: decoded.height,
        rgba: decoded.rgba,
      });
    }
    if (decodedTiles.length === 0) {
      return failed();
    }
    const tileW = decodedTiles[0]!.width;
    const tileH = decodedTiles[0]!.height;
    const widthPx = cover.cols * tileW;
    const heightPx = cover.rows * tileH;
    const rgba = new Uint8Array(widthPx * heightPx * 4);
    for (const part of decodedTiles) {
      const dx = (part.x - cover.x0) * tileW;
      const dy = (part.y - cover.y0) * tileH;
      blitRgba(rgba, widthPx, part.rgba, part.width, part.height, dx, dy);
    }
    return decodeRgbaToVipMasks(rgba, widthPx, heightPx, cover.bbox, opts.nowMs, opts.breaks);
  } catch {
    return failed();
  }
}

/**
 * Sample VIP at an ARP-relative NM point. 0 if empty or out of mosaic bounds.
 * Implemented for a later deviate ticket; unused by pilots.
 */
export function vipAtNm(mosaic: WxMosaic, xNm: number, yNm: number, arp: LatLon): VipBin {
  if (mosaic.widthPx <= 0 || mosaic.heightPx <= 0) {
    return 0;
  }
  const lonSpan = mosaic.eastLon - mosaic.westLon;
  const latSpan = mosaic.northLat - mosaic.southLat;
  if (lonSpan <= 0 || latSpan <= 0) {
    return 0;
  }
  const ll = nmToLatLon({ xNm, yNm }, arp);
  if (
    ll.lonDeg < mosaic.westLon ||
    ll.lonDeg > mosaic.eastLon ||
    ll.latDeg < mosaic.southLat ||
    ll.latDeg > mosaic.northLat
  ) {
    return 0;
  }
  const col = Math.min(
    mosaic.widthPx - 1,
    Math.max(0, Math.floor(((ll.lonDeg - mosaic.westLon) / lonSpan) * mosaic.widthPx)),
  );
  const row = Math.min(
    mosaic.heightPx - 1,
    Math.max(0, Math.floor(((mosaic.northLat - ll.latDeg) / latSpan) * mosaic.heightPx)),
  );
  const index = row * mosaic.widthPx + col;
  for (let level = 1; level <= 6; level++) {
    if (maskBit(mosaic.vipMasks[level - 1]!, index)) {
      return level as VipLevel;
    }
  }
  return 0;
}
