import { nmToLatLon, type LatLon } from "@core";
import { DEFAULT_WX_PAD_NM, type WxBbox } from "./types";

/**
 * Geographic pad about `arp` for mosaic coverage checks. Default ±80 NM.
 * At lat 0, lon pad is 80/60 deg (flat-earth `nmToLatLon`).
 */
export function bboxFromArp(arp: LatLon, padNm: number = DEFAULT_WX_PAD_NM): WxBbox {
  const sw = nmToLatLon({ xNm: -padNm, yNm: -padNm }, arp);
  const ne = nmToLatLon({ xNm: padNm, yNm: padNm }, arp);
  return {
    westLon: sw.lonDeg,
    southLat: sw.latDeg,
    eastLon: ne.lonDeg,
    northLat: ne.latDeg,
  };
}

export function bboxContains(bbox: WxBbox, point: LatLon): boolean {
  return (
    point.lonDeg >= bbox.westLon &&
    point.lonDeg <= bbox.eastLon &&
    point.latDeg >= bbox.southLat &&
    point.latDeg <= bbox.northLat
  );
}

export function bboxCovers(outer: WxBbox, inner: WxBbox): boolean {
  return (
    inner.westLon >= outer.westLon &&
    inner.eastLon <= outer.eastLon &&
    inner.southLat >= outer.southLat &&
    inner.northLat <= outer.northLat
  );
}
