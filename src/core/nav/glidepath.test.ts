import { expect, test } from "vitest";
import {
  GS_CAPTURE_ABOVE_FT,
  GS_CAPTURE_ALONG_MAX_NM,
  GS_DEFAULT_TCH_FT,
  gsAltitudeFt,
  gsGeometricVsFpm,
  gsParamsForApproach,
  gsShouldCapture,
  gsShouldDropCapture,
  kdemIls27GsParams,
} from "./glidepath";

const kdem = kdemIls27GsParams();

test("AC1 — gsAltitudeFt(6) is within 50 ft of gsInterceptAltFt 2000", () => {
  const alt = gsAltitudeFt(6, kdem);
  expect(Math.abs(alt - 2000)).toBeLessThan(50);
  expect(kdem.tchFt).toBe(GS_DEFAULT_TCH_FT);
  expect(kdem.gsAngleDeg).toBe(3);
});

test("GS height table at 10 / 6 / 3 / 1 NM (TCH 50, 3°)", () => {
  const slope = Math.tan((3 * Math.PI) / 180) * 6076.12;
  expect(gsAltitudeFt(10, kdem)).toBeCloseTo(50 + 10 * slope, 5);
  expect(gsAltitudeFt(6, kdem)).toBeCloseTo(50 + 6 * slope, 5);
  expect(gsAltitudeFt(3, kdem)).toBeCloseTo(50 + 3 * slope, 5);
  expect(gsAltitudeFt(1, kdem)).toBeCloseTo(50 + 1 * slope, 5);
});

test("field elevation shifts the whole path", () => {
  const elevated = { ...kdem, fieldElevFt: 100 };
  expect(gsAltitudeFt(6, elevated)).toBeCloseTo(gsAltitudeFt(6, kdem) + 100, 5);
});

test("gsGeometricVsFpm is a descent at 3° / 160 kt", () => {
  const vs = gsGeometricVsFpm(3, 160);
  expect(vs).toBeLessThan(0);
  expect(vs).toBeCloseTo((-Math.tan((3 * Math.PI) / 180) * 160 * 6076.12) / 60, 5);
});

test("capture from below near 6 NM; refuse from above and at 18 NM", () => {
  const gsAlt = gsAltitudeFt(6, kdem);
  expect(
    gsShouldCapture({ alongTrackNm: 6, altFt: gsAlt - 40, gsAltFt: gsAlt, wasBelow: true }),
  ).toBe(true);
  expect(
    gsShouldCapture({
      alongTrackNm: 6,
      altFt: gsAlt + GS_CAPTURE_ABOVE_FT + 10,
      gsAltFt: gsAlt,
      wasBelow: true,
    }),
  ).toBe(false);
  expect(
    gsShouldCapture({ alongTrackNm: 6, altFt: gsAlt - 40, gsAltFt: gsAlt, wasBelow: false }),
  ).toBe(false);
  expect(
    gsShouldCapture({
      alongTrackNm: GS_CAPTURE_ALONG_MAX_NM + 8,
      altFt: 2000,
      gsAltFt: gsAltitudeFt(18, kdem),
      wasBelow: true,
    }),
  ).toBe(false);
});

test("drop capture when more than 150 ft above GS", () => {
  const gsAlt = gsAltitudeFt(4, kdem);
  expect(gsShouldDropCapture(gsAlt + 149, gsAlt)).toBe(false);
  expect(gsShouldDropCapture(gsAlt + 151, gsAlt)).toBe(true);
});

test("gsParamsForApproach uses catalog fields and KDEM defaults", () => {
  expect(gsParamsForApproach("ILS27", { approaches: [] })).toBeUndefined();
  expect(
    gsParamsForApproach("ils27", {
      fieldElevFt: 0,
      approaches: [{ id: "ILS27", gsAngleDeg: 3, tchFt: 50 }],
    }),
  ).toEqual(kdem);
  expect(
    gsParamsForApproach("ILS27", { approaches: [{ id: "ILS27" }] }),
  ).toEqual(kdem);
});

test("glidepath tests are DOM-free", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});
