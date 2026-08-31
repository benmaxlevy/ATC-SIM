import type { LatLon } from "@core";
import { type WxBbox } from "./types";

/** Vite `server.proxy` prefix. Target is IEM; rewrite strips this prefix. */
export const WX_IEM_PROXY_PREFIX = "/wx-iem";

/** IEM current N0Q XYZ tiles. Not WMS — MapServer FILTER rejects the n0q group. */
export const IEM_N0Q_TILE_LAYER = "nexrad-n0q-900913";

/** Prefer this zoom so one tile is ~scope-sized, not a 300 NM square. */
export const IEM_N0Q_TILE_Z = 8;

export const IEM_N0Q_COVER_MAX_TILES = 4;

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

export interface WxTileCover {
  z: number;
  x0: number;
  y0: number;
  tiles: WxTile[];
  bbox: WxBbox;
  widthPx: number;
  heightPx: number;
  cols: number;
  rows: number;
}

/**
 * Tiles that cover `bbox`, coarsening zoom until the grid is at most
 * `IEM_N0Q_COVER_MAX_TILES`. XYZ y increases south.
 */
export function planIemN0qCover(bbox: WxBbox): WxTileCover {
  for (let z = IEM_N0Q_TILE_Z; z >= 5; z--) {
    const x0 = lonToTileX(bbox.westLon, z);
    const x1 = lonToTileX(bbox.eastLon, z);
    const y0 = latToTileY(bbox.northLat, z);
    const y1 = latToTileY(bbox.southLat, z);
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    if (cols < 1 || rows < 1 || cols * rows > IEM_N0Q_COVER_MAX_TILES) {
      continue;
    }
    const tiles: WxTile[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        tiles.push({
          z,
          x,
          y,
          bbox: tileBbox(x, y, z),
          url: buildIemN0qTileUrl(z, x, y),
        });
      }
    }
    return {
      z,
      x0,
      y0,
      tiles,
      cols,
      rows,
      widthPx: cols * IEM_N0Q_TILE_SIZE_PX,
      heightPx: rows * IEM_N0Q_TILE_SIZE_PX,
      bbox: {
        westLon: tileWestLon(x0, z),
        eastLon: tileWestLon(x1 + 1, z),
        northLat: tileNorthLat(y0, z),
        southLat: tileNorthLat(y1 + 1, z),
      },
    };
  }
  const mid = planIemN0qTile({
    latDeg: (bbox.southLat + bbox.northLat) / 2,
    lonDeg: (bbox.westLon + bbox.eastLon) / 2,
  });
  return {
    z: mid.z,
    x0: mid.x,
    y0: mid.y,
    tiles: [mid],
    cols: 1,
    rows: 1,
    widthPx: IEM_N0Q_TILE_SIZE_PX,
    heightPx: IEM_N0Q_TILE_SIZE_PX,
    bbox: mid.bbox,
  };
}
