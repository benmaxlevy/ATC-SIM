import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import {
  DEFAULT_WX_VIP_BREAKS_DBZ,
  IEM_N0Q_WMS_PATH,
  WX_IEM_PROXY_PREFIX,
  bboxFromArp,
  binVip,
  buildIemN0qGetMapUrl,
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

test("GetMap URL uses /wx-iem, EPSG:4326, transparent PNG, and a 256–512 size", () => {
  const bbox = bboxFromArp({ latDeg: 33.6, lonDeg: -84.4 });
  const url = buildIemN0qGetMapUrl(bbox, { widthPx: 512, heightPx: 256 });
  expect(url.startsWith(`${IEM_N0Q_WMS_PATH}?`)).toBe(true);
  expect(url.startsWith(`${WX_IEM_PROXY_PREFIX}/`)).toBe(true);
  const query = new URL(url, "http://scope.local").searchParams;
  expect(query.get("SERVICE")).toBe("WMS");
  expect(query.get("VERSION")).toBe("1.1.1");
  expect(query.get("REQUEST")).toBe("GetMap");
  expect(query.get("LAYERS")).toBe("nexrad-n0q");
  expect(query.get("SRS")).toBe("EPSG:4326");
  expect(query.get("FORMAT")).toBe("image/png");
  expect(query.get("TRANSPARENT")).toBe("TRUE");
  expect(query.get("WIDTH")).toBe("512");
  expect(query.get("HEIGHT")).toBe("256");
  expect(query.get("BBOX")).toBe(
    `${bbox.westLon},${bbox.southLat},${bbox.eastLon},${bbox.northLat}`,
  );
  expect(url).not.toMatch(/speech-api|rainviewer|openstreetmap|grib/i);
});

test("GetMap size clamps to 256–512 px", () => {
  const bbox = bboxFromArp({ latDeg: 0, lonDeg: 0 });
  const small = new URL(
    buildIemN0qGetMapUrl(bbox, { widthPx: 64, heightPx: 64 }),
    "http://scope.local",
  );
  const large = new URL(
    buildIemN0qGetMapUrl(bbox, { widthPx: 2048, heightPx: 1024 }),
    "http://scope.local",
  );
  expect(small.searchParams.get("WIDTH")).toBe("256");
  expect(small.searchParams.get("HEIGHT")).toBe("256");
  expect(large.searchParams.get("WIDTH")).toBe("512");
  expect(large.searchParams.get("HEIGHT")).toBe("512");
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
