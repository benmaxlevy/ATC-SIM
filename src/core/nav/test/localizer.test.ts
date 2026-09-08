import { expect, test } from "vitest";
import { buildFixRegistry } from "../fixRegistry";
import {
  FT_PER_NM,
  LOC_CAPTURE_NORMALIZED_ERROR,
  LOC_RETAIN_NORMALIZED_ERROR,
  kdemIls27LocAxis,
  locAxisForApproach,
  locDeviation,
  locEnvelope,
  locShouldBreakout,
  locShouldCapture,
} from "../localizer";

const ils27 = kdemIls27LocAxis();

test("LOC full scale is 350 ft per side at threshold and widens by range", () => {
  const threshold = locEnvelope(locDeviation({ xNm: 0, yNm: 0 }, ils27), ils27)!;
  expect(threshold.fullScaleHalfWidthNm * FT_PER_NM).toBeCloseTo(350, 5);
  const atSix = locEnvelope(locDeviation({ xNm: 6, yNm: 0 }, ils27), ils27)!;
  expect(atSix.fullScaleHalfWidthNm).toBeGreaterThan(threshold.fullScaleHalfWidthNm);
  expect(atSix.fullScaleHalfWidthNm).toBeCloseTo(
    350 / FT_PER_NM + 6 * Math.tan((2.5 * Math.PI) / 180),
    8,
  );
});

test("LOC signed cross-track and front-course envelope are reciprocal-course safe", () => {
  const north = locDeviation({ xNm: 6, yNm: 1 }, ils27);
  expect(north.crossTrackNm).toBeGreaterThan(0);
  expect(locEnvelope(locDeviation({ xNm: -1, yNm: 0 }, ils27), ils27)).toBeUndefined();

  const reciprocal = {
    ...ils27,
    approachId: "ILS09",
    publishedCourseMagneticDeg: 90,
    geometricCourseTrueDeg: 90,
    courseDeg: 90,
  };
  const south = locDeviation({ xNm: -6, yNm: 1 }, reciprocal);
  expect(south.alongTrackNm).toBeCloseTo(6, 5);
  expect(south.crossTrackNm).toBeLessThan(0);
  expect(locEnvelope(locDeviation({ xNm: 1, yNm: 0 }, reciprocal), reciprocal)).toBeUndefined();
});

test("LOC capture and retain use normalized full-scale error", () => {
  const atSix = locEnvelope(locDeviation({ xNm: 6, yNm: 0 }, ils27), ils27)!;
  const inside = locDeviation({ xNm: 6, yNm: atSix.fullScaleHalfWidthNm * 0.25 }, ils27);
  const outside = locDeviation({ xNm: 6, yNm: atSix.fullScaleHalfWidthNm * 0.251 }, ils27);
  expect(locShouldCapture({ deviation: inside, headingDeg: 270, axis: ils27 })).toBe(true);
  expect(locShouldCapture({ deviation: outside, headingDeg: 270, axis: ils27 })).toBe(false);
  expect(locShouldBreakout(LOC_RETAIN_NORMALIZED_ERROR)).toBe(false);
  expect(locShouldBreakout(LOC_RETAIN_NORMALIZED_ERROR + 0.01)).toBe(true);
  expect(LOC_CAPTURE_NORMALIZED_ERROR).toBe(0.25);
});

test("locAxisForApproach applies generic defaults without a facility branch", () => {
  const registry = buildFixRegistry({
    navaids: [],
    fixes: [{ id: "RW11", xNm: 2, yNm: 3, kind: "THRESHOLD" }],
  });
  const axis = locAxisForApproach(
    "ILS11",
    { approaches: [{ id: "ILS11", courseDeg: 110, lengthNm: 18, thresholdFixId: "RW11" }] },
    registry,
  );
  expect(axis?.locFullScaleHalfWidthFtAtThreshold).toBe(350);
  expect(axis?.thresholdXNm).toBe(2);
  expect(axis?.thresholdYNm).toBe(3);
});
