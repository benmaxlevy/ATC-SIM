import { expect, test } from "vitest";
import { TURN_RATE_DEG_PER_S } from "@core";
import { alongTrackNm, courseChangeDeg, courseDeg, distanceNm, turnRadiusNm } from "../geometry";

test("courseDeg is atan2(east, north) in [0, 360)", () => {
  const origin = { xNm: 0, yNm: 0 };
  expect(courseDeg(origin, { xNm: 0, yNm: 1 })).toBeCloseTo(0, 5);
  expect(courseDeg(origin, { xNm: 1, yNm: 0 })).toBeCloseTo(90, 5);
  expect(courseDeg(origin, { xNm: 0, yNm: -1 })).toBeCloseTo(180, 5);
  expect(courseDeg(origin, { xNm: -1, yNm: 0 })).toBeCloseTo(270, 5);
  expect(courseDeg({ xNm: 10, yNm: 5 }, { xNm: 10, yNm: 5 })).toBe(0);
});

test("courseDeg from 10 NM east of NEMAX is 270", () => {
  const nemax = { xNm: 17, yNm: 12 };
  const east = { xNm: 27, yNm: 12 };
  expect(courseDeg(east, nemax)).toBeCloseTo(270, 5);
  expect(distanceNm(east, nemax)).toBeCloseTo(10, 5);
});

test("turnRadiusNm matches TAS / ω with the T01-03 rate", () => {
  const omega = (TURN_RATE_DEG_PER_S * Math.PI) / 180;
  expect(turnRadiusNm(220)).toBeCloseTo(220 / 3600 / omega, 8);
  expect(turnRadiusNm(220)).toBeCloseTo(220 / (TURN_RATE_DEG_PER_S * (Math.PI / 180) * 3600), 8);
  expect(turnRadiusNm(0)).toBe(0);
});

test("courseChangeDeg returns the shortest course difference", () => {
  expect(courseChangeDeg(270, 90)).toBe(180);
});

test("alongTrackNm is positive ahead and negative once abeam", () => {
  const ac = { xNm: 0, yNm: 0 };
  const north = { xNm: 0, yNm: 5 };
  expect(alongTrackNm(ac, north, 0)).toBeCloseTo(5, 5);
  expect(alongTrackNm({ xNm: 0, yNm: 6 }, north, 0)).toBeCloseTo(-1, 5);
});
