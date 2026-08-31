import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import {
  DEFAULT_WX_VIP_BREAKS_DBZ,
  IEM_N0Q_TILE_LAYER,
  IEM_N0Q_TILE_PATH,
  IEM_N0Q_TILE_SIZE_PX,
  IEM_N0Q_TILE_Z,
  WX_IEM_PROXY_PREFIX,
  bboxFromArp,
  binVip,
  latToTileY,
  lonToTileX,
  planIemN0qTile,
  tileBbox,
} from "./index";

const wxSources = import.meta.glob("./*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

test("binVip uses JO 7110.65 30/40/50 plus trainer splits", () => {
  expect(DEFAULT_WX_VIP_BREAKS_DBZ).toEqual([18, 30, 36, 41, 46, 51]);
  expect(binVip(17.9)).toBe(0);
  expect(binVip(18)).toBe(1);
  expect(binVip(29.9)).toBe(1);
  expect(binVip(30)).toBe(2);
  expect(binVip(35.9)).toBe(2);
  expect(binVip(36)).toBe(3);
  expect(binVip(40)).toBe(3);
  expect(binVip(41)).toBe(4);
  expect(binVip(45.9)).toBe(4);
  expect(binVip(46)).toBe(5);
  expect(binVip(50)).toBe(5);
  expect(binVip(51)).toBe(6);
  expect(binVip(75)).toBe(6);
  expect(binVip(Number.NaN)).toBe(0);
});

test("binVip honors a data-provided break array without facility branches", () => {
  const custom = [20, 32, 38, 44, 48, 55];
  expect(binVip(19, custom)).toBe(0);
  expect(binVip(20, custom)).toBe(1);
  expect(binVip(32, custom)).toBe(2);
  expect(binVip(55, custom)).toBe(6);
});

test("bboxFromArp at lat 0 uses 80/60 deg lon pad", () => {
  const bbox = bboxFromArp({ latDeg: 0, lonDeg: 0 });
  const padDeg = 80 / 60;
  expect(bbox.westLon).toBeCloseTo(-padDeg, 9);
  expect(bbox.eastLon).toBeCloseTo(padDeg, 9);
  expect(bbox.southLat).toBeCloseTo(-padDeg, 9);
  expect(bbox.northLat).toBeCloseTo(padDeg, 9);
});

test("bboxFromArp at CONUS-like ARP 33.6,-84.4 is ARP-driven not an airport id", () => {
  const arp = { latDeg: 33.6, lonDeg: -84.4 };
  const bbox = bboxFromArp(arp);
  const latPad = 80 / 60;
  const lonPad = 80 / (60 * Math.cos((33.6 * Math.PI) / 180));
  expect(bbox.southLat).toBeCloseTo(33.6 - latPad, 9);
  expect(bbox.northLat).toBeCloseTo(33.6 + latPad, 9);
  expect(bbox.westLon).toBeCloseTo(-84.4 - lonPad, 9);
  expect(bbox.eastLon).toBeCloseTo(-84.4 + lonPad, 9);
});

test("N0Q tile URL is /wx-iem XYZ with no WMS query", () => {
  const tile = planIemN0qTile({ latDeg: 0, lonDeg: 0 });
  expect(tile.z).toBe(IEM_N0Q_TILE_Z);
  expect(tile.x).toBe(lonToTileX(0));
  expect(tile.y).toBe(latToTileY(0));
  expect(tile.x).toBe(2 ** (IEM_N0Q_TILE_Z - 1));
  expect(tile.y).toBe(2 ** (IEM_N0Q_TILE_Z - 1));
  expect(tile.url).toBe(`${IEM_N0Q_TILE_PATH}/${tile.z}/${tile.x}/${tile.y}.png`);
  expect(
    tile.url.startsWith(`${WX_IEM_PROXY_PREFIX}/cache/tile.py/1.0.0/${IEM_N0Q_TILE_LAYER}/`),
  ).toBe(true);
  expect(tile.url).toMatch(/\.png$/);
  expect(tile.url).not.toMatch(/[?&]/);
  expect(tile.url).not.toMatch(/wms|GetMap|FILTER|STYLES|n0q\.cgi|speech-api|rainviewer|grib/i);
  expect(IEM_N0Q_TILE_SIZE_PX).toBe(256);
});

test("tileBbox at z=1 x=0 y=0 is the NW hemisphere tile", () => {
  const bbox = tileBbox(0, 0, 1);
  expect(bbox.westLon).toBe(-180);
  expect(bbox.eastLon).toBe(0);
  expect(bbox.northLat).toBeCloseTo(85.05112878, 5);
  expect(bbox.southLat).toBeCloseTo(0, 5);
});

test("src/scope/wx has no airport-id or icao branch", () => {
  for (const [path, src] of Object.entries(wxSources)) {
    if (path.endsWith(".test.ts")) {
      continue;
    }
    expect(src, path).not.toMatch(/icao\s*===/);
    expect(src, path).not.toMatch(/"KDEM"|"KATL"/);
    expect(src, path).not.toMatch(/drawImage/);
  }
});

test("vite /wx-iem proxy targets IEM and strips the prefix", () => {
  const vite = readFileSync(new URL("../../../vite.config.ts", import.meta.url), "utf8");
  expect(vite).toMatch(/["']\/wx-iem["']/);
  expect(vite).toContain("https://mesonet.agron.iastate.edu");
  expect(vite).toContain("path.replace(/^\\/wx-iem/");
  expect(vite).toMatch(/test:\s*\{/);
});
