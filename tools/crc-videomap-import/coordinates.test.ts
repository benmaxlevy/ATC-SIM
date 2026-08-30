import { expect, test } from "vitest";
import { latLonToNm as cifpLatLonToNm } from "../cifp-import/coordinates.ts";
import { latLonToNm, type LatLon } from "./coordinates.ts";

const originZero: LatLon = { latDeg: 0, lonDeg: 0 };
const katlWest: LatLon = { latDeg: 33.6367, lonDeg: -84.4278638888889 };

test("1° north of origin is 60 NM north", () => {
  const en = latLonToNm({ latDeg: 1, lonDeg: 0 }, originZero);
  expect(en.xNm).toBeCloseTo(0, 9);
  expect(en.yNm).toBeCloseTo(60, 9);
});

test("1° east of origin is 60 NM east", () => {
  const en = latLonToNm({ latDeg: 0, lonDeg: 1 }, originZero);
  expect(en.xNm).toBeCloseTo(60, 9);
  expect(en.yNm).toBeCloseTo(0, 9);
});

test("east scale uses origin latitude cosine", () => {
  const origin: LatLon = { latDeg: 60, lonDeg: 0 };
  const en = latLonToNm({ latDeg: 60, lonDeg: 1 }, origin);
  expect(en.xNm).toBeCloseTo(30, 9);
  expect(en.yNm).toBeCloseTo(0, 9);
});

test("matches tools/cifp-import latLonToNm including KATL west-flow ARP", () => {
  const point: LatLon = { latDeg: 33.7, lonDeg: -84.4 };
  expect(latLonToNm(point, katlWest)).toEqual(cifpLatLonToNm(point, katlWest));
  expect(latLonToNm(point, originZero)).toEqual(cifpLatLonToNm(point, originZero));
});

test("polar origin throws RangeError", () => {
  expect(() => latLonToNm({ latDeg: 89, lonDeg: 0 }, { latDeg: 90, lonDeg: 0 })).toThrow(
    RangeError,
  );
});
