import type { LatLon } from "@core";
import { type WxBbox } from "./types";

/** Vite `server.proxy` prefix. Target is IEM; rewrite strips this prefix. */
export const WX_IEM_PROXY_PREFIX = "/wx-iem";

/** IEM current N0Q XYZ tiles. Not WMS — MapServer FILTER rejects the n0q group. */
export const IEM_N0Q_TILE_LAYER = "nexrad-n0q-900913";

export const IEM_N0Q_TILE_Z = 6;

export const IEM_N0Q_TILE_SIZE_PX = 256;

export const IEM_N0Q_TILE_PATH = `${WX_IEM_PROXY_PREFIX}/cache/tile.py/1.0.0/${IEM_N0Q_TILE_LAYER}`;

const WEB_MERCATOR_MAX_LAT = 85.05112878;

export interface WxTile {
  z: number;
  x: number;
  y: number;
  bbox: WxBbox;
  url: string;
}

function clampLat(latDeg: number): number {
  return Math.min(WEB_MERCATOR_MAX_LAT, Math.max(-WEB_MERCATOR_MAX_LAT, latDeg));
}

/** XYZ (north = y 0). Same numbering as IEM `cache/tile.py`. */
export function lonToTileX(lonDeg: number, z: number = IEM_N0Q_TILE_Z): number {
  const n = 2 ** z;
  const x = Math.floor(((lonDeg + 180) / 360) * n);
  return Math.min(n - 1, Math.max(0, x));
}

export function latToTileY(latDeg: number, z: number = IEM_N0Q_TILE_Z): number {
  const latRad = (clampLat(latDeg) * Math.PI) / 180;
  const n = 2 ** z;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return Math.min(n - 1, Math.max(0, y));
}

export function tileWestLon(x: number, z: number = IEM_N0Q_TILE_Z): number {
  return (x / 2 ** z) * 360 - 180;
}

export function tileNorthLat(y: number, z: number = IEM_N0Q_TILE_Z): number {
  const n = 2 ** z;
  const rad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return (rad * 180) / Math.PI;
}

export function tileBbox(x: number, y: number, z: number = IEM_N0Q_TILE_Z): WxBbox {
  return {
    westLon: tileWestLon(x, z),
    eastLon: tileWestLon(x + 1, z),
    northLat: tileNorthLat(y, z),
    southLat: tileNorthLat(y + 1, z),
  };
}

export function buildIemN0qTileUrl(z: number, x: number, y: number): string {
  return `${IEM_N0Q_TILE_PATH}/${z}/${x}/${y}.png`;
}

/** One current-mosaic tile that contains `arp`. No WMS query string. */
export function planIemN0qTile(arp: LatLon, z: number = IEM_N0Q_TILE_Z): WxTile {
  const x = lonToTileX(arp.lonDeg, z);
  const y = latToTileY(arp.latDeg, z);
  return { z, x, y, bbox: tileBbox(x, y, z), url: buildIemN0qTileUrl(z, x, y) };
}
