import { expect, test } from "vitest";
import { TURN_RATE_DEG_PER_S } from "@core";
import {
  DIRECT_SEQUENCE_NM,
  FLYBY_CAP_NM,
  FLYBY_FLOOR_NM,
  alongTrackNm,
  courseChangeDeg,
  courseDeg,
  distanceNm,
  flyByStartNm,
  flyOverSequenceNm,
  turnRadiusNm,
} from "../geometry";

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

test("fly-by start is R tan(θ/2) with floor 0.2 and cap 4", () => {
  const tas = 220;
  const r = turnRadiusNm(tas);
  const d90 = flyByStartNm(tas, 90);
  expect(d90).toBeCloseTo(r * Math.tan(Math.PI / 4), 5);
  expect(flyByStartNm(tas, 0)).toBe(FLYBY_FLOOR_NM);
  expect(flyByStartNm(tas, 1)).toBeGreaterThanOrEqual(FLYBY_FLOOR_NM);
  expect(flyByStartNm(tas, 179)).toBeLessThanOrEqual(FLYBY_CAP_NM);
  expect(courseChangeDeg(270, 90)).toBe(180);
});

test("flyOverSequenceNm is at least 0.3 NM and grows with TAS dt slack", () => {
  expect(flyOverSequenceNm(220, 0.05)).toBe(DIRECT_SEQUENCE_NM);
  expect(flyOverSequenceNm(3600, 1)).toBe(2);
});

test("alongTrackNm is positive ahead and negative once abeam", () => {
  const ac = { xNm: 0, yNm: 0 };
  const north = { xNm: 0, yNm: 5 };
  expect(alongTrackNm(ac, north, 0)).toBeCloseTo(5, 5);
  expect(alongTrackNm({ xNm: 0, yNm: 6 }, north, 0)).toBeCloseTo(-1, 5);
});
