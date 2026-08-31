import { expect, test } from "vitest";
import { buildFixRegistry } from "../../nav/fixRegistry";
import {
  locAxisForApproach,
  locDeviation,
  locShouldBreakout,
  locShouldCapture,
  kdemIls27LocAxis,
  LOC_BREAKOUT_DEV_DEG,
  LOC_CAPTURE_CROSS_NM,
} from "../../nav/localizer";

const ils27 = kdemIls27LocAxis();

test("positive deviation is north of course (KDEM ILS 27)", () => {
  const north = locDeviation({ xNm: 12, yNm: 4 }, ils27);
  expect(north.alongTrackNm).toBeCloseTo(12, 5);
  expect(north.crossTrackNm).toBeCloseTo(4, 5);
  expect(north.deviationDeg).toBeGreaterThan(0);
  expect(north.deviationDeg).toBeCloseTo((Math.atan2(4, 12) * 180) / Math.PI, 5);

  const south = locDeviation({ xNm: 12, yNm: -2 }, ils27);
  expect(south.crossTrackNm).toBeCloseTo(-2, 5);
  expect(south.deviationDeg).toBeLessThan(0);

  const onCourse = locDeviation({ xNm: 6, yNm: 0 }, ils27);
  expect(onCourse.crossTrackNm).toBeCloseTo(0, 5);
  expect(onCourse.deviationDeg).toBeCloseTo(0, 5);
});

test("capture table: on course, too far north, behind threshold, outside 18 NM", () => {
  const onCourse = locDeviation({ xNm: 6, yNm: 0 }, ils27);
  expect(locShouldCapture({ deviation: onCourse, headingDeg: 270, axis: ils27 })).toBe(true);
  expect(locShouldCapture({ deviation: onCourse, headingDeg: 90, axis: ils27 })).toBe(true);

  const intercept = locDeviation({ xNm: 12, yNm: 4 }, ils27);
  expect(locShouldCapture({ deviation: intercept, headingDeg: 240, axis: ils27 })).toBe(false);
  expect(Math.abs(intercept.crossTrackNm)).toBeGreaterThan(LOC_CAPTURE_CROSS_NM);

  const behind = locDeviation({ xNm: -1, yNm: 0 }, ils27);
  expect(behind.alongTrackNm).toBeLessThanOrEqual(0);
  expect(locShouldCapture({ deviation: behind, headingDeg: 270, axis: ils27 })).toBe(false);

  const outside = locDeviation({ xNm: 19, yNm: 0 }, ils27);
  expect(outside.alongTrackNm).toBeGreaterThanOrEqual(ils27.lengthNm);
  expect(locShouldCapture({ deviation: outside, headingDeg: 270, axis: ils27 })).toBe(false);

  const tooClose = locDeviation({ xNm: 0.4, yNm: 0 }, ils27);
  expect(tooClose.alongTrackNm).toBeLessThanOrEqual(0.5);
  expect(locShouldCapture({ deviation: tooClose, headingDeg: 270, axis: ils27 })).toBe(false);
});

test("breakout is |δ| > 2.5°", () => {
  expect(locShouldBreakout(LOC_BREAKOUT_DEV_DEG)).toBe(false);
  expect(locShouldBreakout(LOC_BREAKOUT_DEV_DEG + 0.01)).toBe(true);
  expect(locShouldBreakout(-(LOC_BREAKOUT_DEV_DEG + 0.01))).toBe(true);
});

test("locAxisForApproach reads catalog course/length and threshold fix", () => {
  const registry = buildFixRegistry({
    navaids: [],
    fixes: [{ id: "RW27", xNm: 0, yNm: 0, kind: "THRESHOLD" }],
  });
  const axis = locAxisForApproach(
    "ILS27",
    {
      approaches: [
        {
          id: "ILS27",
          courseDeg: 270,
          lengthNm: 18,
          beamHalfWidthDeg: 2.5,
          thresholdFixId: "RW27",
        },
      ],
    },
    registry,
  );
  expect(axis).toEqual(kdemIls27LocAxis());
  expect(
    locAxisForApproach(
      "ILS99",
      { approaches: [{ id: "ILS27", courseDeg: 270, lengthNm: 18 }] },
      registry,
    ),
  ).toBeUndefined();
});
