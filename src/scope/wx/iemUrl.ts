import { WX_GETMAP_MAX_PX, WX_GETMAP_MIN_PX, type WxBbox, type WxMapSize } from "./types";

/** Vite `server.proxy` prefix. Target is IEM; rewrite strips this prefix. */
export const WX_IEM_PROXY_PREFIX = "/wx-iem";

/** IEM CONUS NEXRAD N0Q WMS. Never RainViewer, GRIB, OSM, or speech-api. */
export const IEM_N0Q_WMS_PATH = `${WX_IEM_PROXY_PREFIX}/cgi-bin/wms/nexrad/n0q.cgi`;

export const IEM_N0Q_WMS_LAYER = "nexrad-n0q";

const DEFAULT_SIZE: WxMapSize = { widthPx: 256, heightPx: 256 };

function clampGetMapPx(n: number): number {
  if (!Number.isFinite(n)) {
    return WX_GETMAP_MIN_PX;
  }
  return Math.min(WX_GETMAP_MAX_PX, Math.max(WX_GETMAP_MIN_PX, Math.round(n)));
}

function bboxCsv(bbox: WxBbox): string {
  return `${bbox.westLon},${bbox.southLat},${bbox.eastLon},${bbox.northLat}`;
}

/**
 * One WMS 1.1.1 GetMap: EPSG:4326, transparent PNG, ARP-padded bbox.
 * Path stays on `/wx-iem` so Vite can proxy to mesonet.agron.iastate.edu.
 */
export function buildIemN0qGetMapUrl(bbox: WxBbox, size: WxMapSize = DEFAULT_SIZE): string {
  const width = clampGetMapPx(size.widthPx);
  const height = clampGetMapPx(size.heightPx);
  const query = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: IEM_N0Q_WMS_LAYER,
    STYLES: "",
    SRS: "EPSG:4326",
    BBOX: bboxCsv(bbox),
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: "image/png",
    TRANSPARENT: "TRUE",
  });
  return `${IEM_N0Q_WMS_PATH}?${query.toString()}`;
}
