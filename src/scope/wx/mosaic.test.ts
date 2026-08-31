import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { latLonToNm } from "@core";
import {
  DEFAULT_WX_PAD_NM,
  WX_REFRESH_MS,
  bboxFromArp,
  decodePngToVipMasks,
  emptyWxMosaic,
  encodeRgbaPng,
  fetchWxMosaic,
  rgbToDbz,
  shouldRefetch,
  vipAtNm,
} from "./index";
import { N0Q_RGB_DBZ_RAMP } from "./n0qRamp";

const FIXTURE_PNG = new URL("../../../testdata/wx/n0q-vip-edges.png", import.meta.url);

/** 8×2 RGBA: transparent / black / unknown / VIP edges / JO 30-40-50 neighbors. */
const FIXTURE_PIXELS: readonly { r: number; g: number; b: number; a: number; vip: number }[] = [
  { r: 0, g: 0, b: 0, a: 0, vip: 0 },
  { r: 0, g: 0, b: 0, a: 255, vip: 0 },
  { r: 128, g: 128, b: 128, a: 255, vip: 0 },
  { r: 0, g: 0, b: 246, a: 255, vip: 0 },
  { r: 0, g: 153, b: 98, a: 255, vip: 1 },
  { r: 0, g: 144, b: 0, a: 255, vip: 2 },
  { r: 250, g: 242, b: 0, a: 255, vip: 3 },
  { r: 236, g: 182, b: 0, a: 255, vip: 4 },
  { r: 255, g: 115, b: 0, a: 255, vip: 5 },
  { r: 247, g: 0, b: 0, a: 255, vip: 6 },
  { r: 0, g: 200, b: 0, a: 255, vip: 1 },
  { r: 255, g: 255, b: 0, a: 255, vip: 2 },
  { r: 231, g: 192, b: 0, a: 255, vip: 3 },
  { r: 255, g: 0, b: 0, a: 255, vip: 5 },
  { r: 0, g: 255, b: 0, a: 255, vip: 1 },
  { r: 214, g: 0, b: 0, a: 255, vip: 6 },
];

function fixtureRgba(): Uint8Array {
  const rgba = new Uint8Array(FIXTURE_PIXELS.length * 4);
  FIXTURE_PIXELS.forEach((p, i) => {
    rgba[i * 4] = p.r;
    rgba[i * 4 + 1] = p.g;
    rgba[i * 4 + 2] = p.b;
    rgba[i * 4 + 3] = p.a;
  });
  return rgba;
}

function stop(dbz: number) {
  const found = N0Q_RGB_DBZ_RAMP.find((s) => s.dbz === dbz);
  if (!found) {
    throw new Error(`missing ramp stop ${dbz}`);
  }
  return found;
}

test("rgbToDbz maps documented N0Q stops and drops transparent/black/unknown", () => {
  expect(rgbToDbz(0, 0, 0, 0)).toBeNull();
  expect(rgbToDbz(0, 0, 0, 255)).toBeNull();
  expect(rgbToDbz(128, 128, 128, 255)).toBeNull();
  expect(rgbToDbz(stop(15).r, stop(15).g, stop(15).b)).toBe(15);
  expect(rgbToDbz(stop(18).r, stop(18).g, stop(18).b)).toBe(18);
  expect(rgbToDbz(stop(30).r, stop(30).g, stop(30).b)).toBe(30);
  expect(rgbToDbz(stop(36).r, stop(36).g, stop(36).b)).toBe(36);
  expect(rgbToDbz(stop(40).r, stop(40).g, stop(40).b)).toBe(40);
  expect(rgbToDbz(stop(41).r, stop(41).g, stop(41).b)).toBe(41);
  expect(rgbToDbz(stop(46).r, stop(46).g, stop(46).b)).toBe(46);
  expect(rgbToDbz(stop(50).r, stop(50).g, stop(50).b)).toBe(50);
  expect(rgbToDbz(stop(51).r, stop(51).g, stop(51).b)).toBe(51);
});

test("testdata/wx fixture PNG decodes to VIP edges at 18/30/36/41/46/51", async () => {
  const png = new Uint8Array(readFileSync(FIXTURE_PNG));
  expect(png.subarray(0, 8)).toEqual(encodeRgbaPng(8, 2, fixtureRgba()).subarray(0, 8));
  const bbox = { westLon: -1, southLat: -0.5, eastLon: 1, northLat: 0.5 };
  const mosaic = await decodePngToVipMasks(png, bbox, 1_000);
  expect(mosaic.widthPx).toBe(8);
  expect(mosaic.heightPx).toBe(2);
  const arp = { latDeg: 0, lonDeg: 0 };
  for (let i = 0; i < FIXTURE_PIXELS.length; i++) {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const lon = bbox.westLon + ((col + 0.5) / 8) * (bbox.eastLon - bbox.westLon);
    const lat = bbox.northLat - ((row + 0.5) / 2) * (bbox.northLat - bbox.southLat);
    const en = latLonToNm({ latDeg: lat, lonDeg: lon }, arp);
    expect(vipAtNm(mosaic, en.xNm, en.yNm, arp), `pixel ${i}`).toBe(FIXTURE_PIXELS[i]!.vip);
  }
});

test("vipAtNm is 0 for empty mosaic and out-of-bounds NM", async () => {
  expect(vipAtNm(emptyWxMosaic(), 0, 0, { latDeg: 0, lonDeg: 0 })).toBe(0);
  const png = new Uint8Array(readFileSync(FIXTURE_PNG));
  const bbox = { westLon: -1, southLat: -0.5, eastLon: 1, northLat: 0.5 };
  const mosaic = await decodePngToVipMasks(png, bbox, 1_000);
  const arp = { latDeg: 0, lonDeg: 0 };
  const outside = latLonToNm({ latDeg: 2, lonDeg: 2 }, arp);
  expect(vipAtNm(mosaic, outside.xNm, outside.yNm, arp)).toBe(0);
});

test("shouldRefetch is 5 min, in-pad ARP stays, never-fetched empty refetches", () => {
  const arp = { latDeg: 33.6, lonDeg: -84.4 };
  const bbox = bboxFromArp(arp);
  const fetched = {
    ...emptyWxMosaic({ ...bbox, fetchedAtMs: 10_000 }),
    widthPx: 256,
    heightPx: 256,
  };
  expect(shouldRefetch(emptyWxMosaic(), 0, arp, DEFAULT_WX_PAD_NM)).toBe(true);
  expect(shouldRefetch(fetched, 10_000 + WX_REFRESH_MS - 1, arp, DEFAULT_WX_PAD_NM)).toBe(false);
  expect(shouldRefetch(fetched, 10_000 + WX_REFRESH_MS, arp, DEFAULT_WX_PAD_NM)).toBe(true);
  const inPad = { latDeg: arp.latDeg + 0.2, lonDeg: arp.lonDeg + 0.2 };
  expect(shouldRefetch(fetched, 11_000, inPad, DEFAULT_WX_PAD_NM)).toBe(false);
  const outPad = { latDeg: arp.latDeg + 3, lonDeg: arp.lonDeg };
  expect(shouldRefetch(fetched, 11_000, outPad, DEFAULT_WX_PAD_NM)).toBe(true);
});

test("fetchWxMosaic uses injected fetch and returns empty on HTTP or decode fail", async () => {
  const arp = { latDeg: 0, lonDeg: 0 };
  const png = new Uint8Array(readFileSync(FIXTURE_PNG));
  const ok = await fetchWxMosaic({
    arp,
    nowMs: 50_000,
    fetchImpl: async (input) => {
      const url = String(input);
      expect(url.startsWith("/wx-iem/")).toBe(true);
      expect(url).not.toMatch(/mesonet|speech-api/i);
      return new Response(png, { status: 200 });
    },
  });
  expect(ok.widthPx).toBe(8);
  expect(ok.heightPx).toBe(2);
  expect(ok.fetchedAtMs).toBe(50_000);

  const httpFail = await fetchWxMosaic({
    arp,
    nowMs: 60_000,
    fetchImpl: async () => new Response("nope", { status: 503 }),
  });
  expect(httpFail.widthPx).toBe(0);
  expect(httpFail.fetchedAtMs).toBe(60_000);
  expect(httpFail.westLon).toBeCloseTo(bboxFromArp(arp).westLon);

  const decodeFail = await fetchWxMosaic({
    arp,
    nowMs: 70_000,
    fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
  });
  expect(decodeFail.widthPx).toBe(0);
  expect(decodeFail.fetchedAtMs).toBe(70_000);

  const wmsException = await fetchWxMosaic({
    arp,
    nowMs: 80_000,
    fetchImpl: async () =>
      new Response(
        "<?xml version='1.0'?><ServiceExceptionReport><ServiceException>msWMSApplyFilter(): WMS server error. Invalid or Unsupported FILTER : downloading</ServiceException></ServiceExceptionReport>",
        { status: 200, headers: { "Content-Type": "application/vnd.ogc.se_xml" } },
      ),
  });
  expect(wmsException.widthPx).toBe(0);
  expect(wmsException.fetchedAtMs).toBe(80_000);
  expect(shouldRefetch(httpFail, 60_000 + 1_000, arp)).toBe(false);
  expect(shouldRefetch(httpFail, 60_000 + WX_REFRESH_MS, arp)).toBe(true);
});
