import { expect, test } from "vitest";
import {
  AIRPORT_REF_EAST_NM,
  AIRPORT_REF_NORTH_NM,
  DEFAULT_RANGE_NM,
  DEFAULT_SCOPE_CAMERA,
  RANGE_PRESETS_NM,
  applyPanScreenDelta,
  applyRangeIn,
  applyRangeOut,
  formatRangeReadout,
  nmToScreen,
  pxPerNm,
  rangeCircle,
  screenToNm,
  type ScopeCamera,
  type ScopeViewSize,
} from "./camera";

const SQUARE: ScopeViewSize = { widthPx: 800, heightPx: 800 };
const ROUND_TRIP_NM = 1e-6;

function cam(rangeNm: ScopeCamera["rangeNm"] = 20): ScopeCamera {
  return {
    rangeNm,
    centerEastNm: AIRPORT_REF_EAST_NM,
    centerNorthNm: AIRPORT_REF_NORTH_NM,
  };
}

function roundTrip(
  eastNm: number,
  northNm: number,
  camera: ScopeCamera,
  view: ScopeViewSize = SQUARE,
): void {
  const p = nmToScreen(eastNm, northNm, camera, view);
  const back = screenToNm(p.x, p.y, camera, view);
  expect(Math.abs(back.eastNm - eastNm)).toBeLessThanOrEqual(ROUND_TRIP_NM);
  expect(Math.abs(back.northNm - northNm)).toBeLessThanOrEqual(ROUND_TRIP_NM);
}

test("AC1 — default session is 20 NM centered on the airport ref", () => {
  expect(DEFAULT_RANGE_NM).toBe(20);
  expect(RANGE_PRESETS_NM).toEqual([5, 10, 15, 20, 30, 40, 50, 60]);
  expect(DEFAULT_SCOPE_CAMERA).toEqual({
    rangeNm: 20,
    centerEastNm: 0,
    centerNorthNm: 0,
  });
  const p = nmToScreen(0, 0, DEFAULT_SCOPE_CAMERA, SQUARE);
  expect(Math.abs(p.x - 400)).toBeLessThanOrEqual(2);
  expect(Math.abs(p.y - 400)).toBeLessThanOrEqual(2);
});

test("pxPerNm is the inscribed-circle scale", () => {
  expect(pxPerNm(cam(20), SQUARE)).toBe(20);
  expect(pxPerNm(cam(20), { widthPx: 800, heightPx: 400 })).toBe(10);
  expect(pxPerNm(cam(20), { widthPx: 0, heightPx: 400 })).toBe(0);
});

test("north is up: +north maps toward the top midpoint", () => {
  const p = nmToScreen(0, 20, cam(20), SQUARE);
  expect(p.x).toBeCloseTo(400);
  expect(Math.abs(p.y - 0)).toBeLessThanOrEqual(2);
});

test("AC8 — nmToScreen ↔ screenToNm round-trip at center, +5 E, +5 N, range 5 and 60", () => {
  for (const rangeNm of [5, 60] as const) {
    const camera = cam(rangeNm);
    roundTrip(0, 0, camera);
    roundTrip(5, 0, camera);
    roundTrip(0, 5, camera);
  }
});

test("round-trip at a square-canvas corner is ≤ 1e-6 NM", () => {
  const camera = cam(20);
  const corner = screenToNm(0, 0, camera, SQUARE);
  roundTrip(corner.eastNm, corner.northNm, camera);
});

test("AC2 — five range-in steps from 20 land on 5 and stay there; center unchanged", () => {
  const camera = cam(20);
  camera.centerEastNm = 3;
  camera.centerNorthNm = -4;
  for (let i = 0; i < 5; i += 1) {
    applyRangeIn(camera);
  }
  expect(camera.rangeNm).toBe(5);
  expect(camera.centerEastNm).toBe(3);
  expect(camera.centerNorthNm).toBe(-4);
  applyRangeIn(camera);
  expect(camera.rangeNm).toBe(5);
});

test("AC3 — range-out from 20 stops at 60; further steps are no-ops; center unchanged", () => {
  const camera = cam(20);
  camera.centerEastNm = 1.5;
  camera.centerNorthNm = 2.5;
  for (let i = 0; i < 20; i += 1) {
    applyRangeOut(camera);
  }
  expect(camera.rangeNm).toBe(60);
  expect(camera.centerEastNm).toBe(1.5);
  expect(camera.centerNorthNm).toBe(2.5);
  applyRangeOut(camera);
  expect(camera.rangeNm).toBe(60);
});

test("AC6 — pan screen delta matches nmToScreen of a known world point", () => {
  const camera = cam(20);
  const view = SQUARE;
  const world = { eastNm: 4, northNm: -3 };
  const before = nmToScreen(world.eastNm, world.northNm, camera, view);
  applyPanScreenDelta(camera, 40, -20, view);
  const after = nmToScreen(world.eastNm, world.northNm, camera, view);
  expect(after.x).toBeCloseTo(before.x + 40);
  expect(after.y).toBeCloseTo(before.y - 20);
});

test("AC9 — range readout is RNG n, never zoom", () => {
  expect(formatRangeReadout(20)).toBe("RNG 20");
  expect(formatRangeReadout(5)).toBe("RNG 5");
  expect(formatRangeReadout(20).toLowerCase()).not.toContain("zoom");
});

test("range circle is the inscribed circle; square corners sit outside range", () => {
  const circle = rangeCircle(SQUARE);
  expect(circle.cx).toBe(400);
  expect(circle.cy).toBe(400);
  expect(circle.radiusPx).toBe(400);
  const cornerDist = Math.hypot(400, 400);
  expect(cornerDist).toBeGreaterThan(circle.radiusPx);
});
