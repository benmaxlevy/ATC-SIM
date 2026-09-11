import { expect, test } from "vitest";
import { nmToScreen, pxPerNm, type ScopeCamera, type ScopeViewSize } from "../camera";
import {
  ATPA_CONE_END_HEIGHT_NM,
  ATPA_CONE_HALF_ANGLE_DEG,
  atpaConeColor,
  atpaConeHalfAngleDeg,
  atpaConePoints,
  atpaSuppressesManualTpaCone,
} from "../atpaCone";
import { PALETTE } from "../palette";

const VIEW: ScopeViewSize = { widthPx: 800, heightPx: 800 };
const CAMERA: ScopeCamera = { rangeNm: 20, centerEastNm: 0, centerNorthNm: 0 };

test("cone vertex is the trailer; length matches camera scale", () => {
  const pts = atpaConePoints(4, -2, 4, 8, 3);
  expect(pts[0]).toEqual({ eastNm: 4, northNm: -2 });
  const vertex = nmToScreen(pts[0]!.eastNm, pts[0]!.northNm, CAMERA, VIEW);
  const trailer = nmToScreen(4, -2, CAMERA, VIEW);
  expect(vertex.x).toBeCloseTo(trailer.x, 6);
  expect(atpaConePoints(1, 1, 1, 1, 3)).toEqual([]);
  expect(pxPerNm(CAMERA, VIEW)).toBeGreaterThan(0);
});

test("cone end-cap height stays fixed while its angle follows cone length", () => {
  expect(atpaConeHalfAngleDeg(3)).toBeCloseTo(ATPA_CONE_HALF_ANGLE_DEG, 10);
  expect(atpaConeHalfAngleDeg(1)).toBeGreaterThan(ATPA_CONE_HALF_ANGLE_DEG);
  expect(atpaConeHalfAngleDeg(10)).toBeLessThan(ATPA_CONE_HALF_ANGLE_DEG);

  for (const lengthNm of [3, 5, 10]) {
    const pts = atpaConePoints(0, 0, 1, 0, lengthNm);
    expect(
      Math.hypot(pts[1]!.eastNm - pts[2]!.eastNm, pts[1]!.northNm - pts[2]!.northNm),
    ).toBeCloseTo(ATPA_CONE_END_HEIGHT_NM, 10);
  }
});

test("monitor/warning/alert colors; warning suppresses manual TPA cones", () => {
  expect(atpaConeColor("monitor")).toBe(PALETTE.tools);
  expect(atpaConeColor("warning")).toBe(PALETTE.atpaWarning);
  expect(atpaConeColor("alert")).toBe(PALETTE.atpaAlert);
  expect(atpaConeColor("alert")).not.toBe(PALETTE.alert);
  expect(atpaSuppressesManualTpaCone("monitor")).toBe(false);
  expect(atpaSuppressesManualTpaCone("warning")).toBe(true);
});
