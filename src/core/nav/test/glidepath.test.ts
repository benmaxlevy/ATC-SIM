import { expect, test } from "vitest";
import {
  GS_CAPTURE_NORMALIZED_ERROR,
  GS_RETAIN_NORMALIZED_ERROR,
  gsAltitudeFt,
  gsDeviation,
  gsParamsForApproach,
  gsShouldCapture,
  gsShouldDropCapture,
  kdemIls27GsParams,
} from "../glidepath";

const kdem = kdemIls27GsParams();

test("GS 1.4 degree full beam has 2.3 and 3.7 degree edges around 3.0", () => {
  const centerAlt = gsAltitudeFt(6, kdem);
  const center = gsDeviation(6, centerAlt, kdem)!;
  expect(center.lowerEdgeDeg).toBeCloseTo(2.3, 5);
  expect(center.upperEdgeDeg).toBeCloseTo(3.7, 5);
  expect(center.normalizedError).toBeCloseTo(0, 5);

  const shifted = { ...kdem, gsAngleDeg: 3.2 };
  const shiftedCenter = gsDeviation(6, gsAltitudeFt(6, shifted), shifted)!;
  expect(shiftedCenter.lowerEdgeDeg).toBeCloseTo(2.5, 5);
  expect(shiftedCenter.upperEdgeDeg).toBeCloseTo(3.9, 5);
});

test("GS capture is from below inside 0.25 full scale; drop only above full scale", () => {
  expect(gsShouldCapture({ alongTrackNm: 6, normalizedError: -0.25, wasBelow: true })).toBe(true);
  expect(gsShouldCapture({ alongTrackNm: 6, normalizedError: 0.251, wasBelow: true })).toBe(false);
  expect(gsShouldCapture({ alongTrackNm: 6, normalizedError: -0.1, wasBelow: false })).toBe(false);
  expect(gsShouldDropCapture(GS_RETAIN_NORMALIZED_ERROR)).toBe(false);
  expect(gsShouldDropCapture(GS_RETAIN_NORMALIZED_ERROR + 0.01)).toBe(true);
  expect(GS_CAPTURE_NORMALIZED_ERROR).toBe(0.25);
});

test("GS params apply generic 1.4 degree default", () => {
  expect(gsParamsForApproach("ILS11", { approaches: [{ id: "ILS11" }] })).toMatchObject({
    gsAngleDeg: 3,
    gsBeamFullWidthDeg: 1.4,
  });
  expect(gsDeviation(0, 50, kdem)).toBeUndefined();
});

test("glidepath tests are DOM-free", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});
