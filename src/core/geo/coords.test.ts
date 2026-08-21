import { expect, test } from "vitest";
import { latLonToNm, nmToLatLon, normalizeHeadingDeg } from "@core";
import type { LatLon, NmEastNorth } from "@core";

const kdem: LatLon = { latDeg: 0, lonDeg: 0 };

test("1° north of KDEM origin is 60 NM north (AC2)", () => {
  const en: NmEastNorth = latLonToNm({ latDeg: 1, lonDeg: 0 }, kdem);
  expect(Math.abs(en.xNm - 0)).toBeLessThan(1e-9);
  expect(Math.abs(en.yNm - 60)).toBeLessThan(1e-9);
});

test("1° east of KDEM origin is 60 NM east (AC3)", () => {
  const en = latLonToNm({ latDeg: 0, lonDeg: 1 }, kdem);
  expect(Math.abs(en.xNm - 60)).toBeLessThan(1e-9);
  expect(Math.abs(en.yNm - 0)).toBeLessThan(1e-9);
});

test("round-trip recovers lat/lon 5 NM east and 8 NM north of KDEM (AC4)", () => {
  const input: LatLon = { latDeg: 8 / 60, lonDeg: 5 / 60 };
  const en = latLonToNm(input, kdem);
  expect(Math.abs(en.xNm - 5)).toBeLessThan(1e-9);
  expect(Math.abs(en.yNm - 8)).toBeLessThan(1e-9);
  const recovered = nmToLatLon(en, kdem);
  expect(Math.abs(recovered.latDeg - input.latDeg)).toBeLessThan(1e-10);
  expect(Math.abs(recovered.lonDeg - input.lonDeg)).toBeLessThan(1e-10);
});

test("normalizeHeadingDeg wraps into [0, 360) (AC5)", () => {
  expect(normalizeHeadingDeg(360)).toBe(0);
  expect(normalizeHeadingDeg(540)).toBe(180);
  expect(normalizeHeadingDeg(-90)).toBe(270);
});

test("east scale uses origin latitude cosine, not the point latitude", () => {
  const origin: LatLon = { latDeg: 60, lonDeg: 0 };
  const en = latLonToNm({ latDeg: 60, lonDeg: 1 }, origin);
  expect(Math.abs(en.xNm - 30)).toBeLessThan(1e-9);
  expect(Math.abs(en.yNm - 0)).toBeLessThan(1e-9);
});

test("polar origin throws RangeError", () => {
  const north: LatLon = { latDeg: 90, lonDeg: 0 };
  const south: LatLon = { latDeg: -90, lonDeg: 0 };
  expect(() => latLonToNm({ latDeg: 89, lonDeg: 0 }, north)).toThrow(RangeError);
  expect(() => nmToLatLon({ xNm: 1, yNm: 0 }, south)).toThrow(RangeError);
});
