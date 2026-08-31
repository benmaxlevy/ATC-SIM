import { nmToLatLon, type LatLon } from "@core";
import { bboxContains } from "./bbox";
import { planIemN0qTile } from "./iemUrl";
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
}

/**
 * Fetch one IEM N0Q tile that contains `arp`. `fetchImpl` is required in tests.
 * Default `fetch` is for runtime later — CI must inject a mock.
 * HTTP or decode failure returns an empty mosaic with the tile bbox;
 * never throws to boot. Not WMS — IEM GetMap FILTER rejects the n0q group.
 */
export async function fetchWxMosaic(opts: FetchWxMosaicOpts): Promise<WxMosaic> {
  const tile = planIemN0qTile(opts.arp);
  const failed = (): WxMosaic => emptyWxMosaic({ ...tile.bbox, fetchedAtMs: opts.nowMs });
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  try {
    const res = await fetchImpl(tile.url);
    if (!res.ok) {
      return failed();
    }
    const png = new Uint8Array(await res.arrayBuffer());
    if (!isPng(png)) {
      return failed();
    }
    return await decodePngToVipMasks(png, tile.bbox, opts.nowMs, opts.breaks);
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
