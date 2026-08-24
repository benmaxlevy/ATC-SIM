import { expect, test } from "vitest";
import {
  PTL_CAP_TICK_PX,
  PTL_MINUTES,
  PTL_MINUTE_PRESETS,
  PTL_STROKE_PX,
  ptlCapTickOffsets,
  ptlDistanceNm,
  ptlEndpoint,
  shouldDrawPtl,
  shouldDrawPtlForTrack,
  stepPtlMinutes,
} from "./ptl";

test("AC1 — 180 kt / 090° / 1 min → +3 NM east, 0 north", () => {
  const end = ptlEndpoint(0, 0, 90, 180, PTL_MINUTES);
  expect(ptlDistanceNm(180, 1)).toBe(3);
  expect(end.eastNm).toBeCloseTo(3, 6);
  expect(end.northNm).toBeCloseTo(0, 6);
});

test("AC2 — 240 kt / 000° / 1 min → +4 NM north", () => {
  const end = ptlEndpoint(10, 5, 0, 240, PTL_MINUTES);
  expect(ptlDistanceNm(240, 1)).toBe(4);
  expect(end.eastNm).toBeCloseTo(10, 6);
  expect(end.northNm).toBeCloseTo(9, 6);
});

test("table-driven headings 0/90/180/270 at 180 kt / 1 min from origin", () => {
  const cases: { hdg: number; east: number; north: number }[] = [
    { hdg: 0, east: 0, north: 3 },
    { hdg: 90, east: 3, north: 0 },
    { hdg: 180, east: 0, north: -3 },
    { hdg: 270, east: -3, north: 0 },
  ];
  for (const row of cases) {
    const end = ptlEndpoint(0, 0, row.hdg, 180, 1);
    expect(end.eastNm, `hdg ${row.hdg} east`).toBeCloseTo(row.east, 6);
    expect(end.northNm, `hdg ${row.hdg} north`).toBeCloseTo(row.north, 6);
  }
});

test("heading 0 is north (kinematics / T00-04); minutes frozen at 1.0", () => {
  expect(PTL_MINUTES).toBe(1);
  expect(PTL_STROKE_PX).toBe(1);
  expect(PTL_CAP_TICK_PX).toBe(4);
  const north = ptlEndpoint(0, 0, 0, 60, 1);
  expect(north.eastNm).toBeCloseTo(0, 6);
  expect(north.northNm).toBeCloseTo(1, 6);
});

test("shouldDrawPtl skips missing GS and altitude-filtered tracks (T02-06 hook)", () => {
  expect(shouldDrawPtl(180)).toBe(true);
  expect(shouldDrawPtl(180, false)).toBe(true);
  expect(shouldDrawPtl(180, true)).toBe(false);
  expect(shouldDrawPtl(0)).toBe(false);
  expect(shouldDrawPtl(-10)).toBe(false);
  expect(shouldDrawPtl(Number.NaN)).toBe(false);
});

test("cap tick is 4 px and perpendicular to an eastbound PTL", () => {
  const cap = ptlCapTickOffsets(0, 0, 60, 0);
  expect(Math.hypot(cap.dx, cap.dy) * 2).toBeCloseTo(PTL_CAP_TICK_PX, 6);
  expect(cap.dx).toBeCloseTo(0, 6);
  expect(Math.abs(cap.dy)).toBeCloseTo(PTL_CAP_TICK_PX / 2, 6);
});

test("AC7 — comments say PTL / predicted track line and cite CRC; straight 1 min", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./ptl.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/predicted track line/i);
  expect(src).toMatch(/\bPTL\b/);
  expect(src).toMatch(/CRC STARS PTL/);
  expect(src).toMatch(/docs\.virtualnas\.net\/crc\/stars/);
  expect(src).toMatch(/straight 1\.0 min/);
  expect(src).toMatch(/Not a velocity vector, heading line, or zoom/);
  expect(src).toMatch(/inAltitudeFilter/);
});

test("AC2 — 180 kt × 2 min → 6 NM", () => {
  expect(PTL_MINUTE_PRESETS).toEqual([0.5, 1, 2, 4]);
  expect(ptlDistanceNm(180, 2)).toBe(6);
  expect(stepPtlMinutes(1, 1)).toBe(2);
  expect(stepPtlMinutes(4, 1)).toBe(4);
  expect(stepPtlMinutes(0.5, -1)).toBe(0.5);
});

test("AC3 — PTL OWN vs ALL: ALL wins; both off draws none", () => {
  expect(shouldDrawPtlForTrack(180, false, false, true, false)).toBe(true);
  expect(shouldDrawPtlForTrack(180, false, true, false, true)).toBe(true);
  expect(shouldDrawPtlForTrack(180, false, false, false, true)).toBe(false);
  expect(shouldDrawPtlForTrack(180, false, true, true, true)).toBe(true);
  expect(shouldDrawPtlForTrack(180, false, true, false, false)).toBe(false);
  expect(shouldDrawPtlForTrack(180, true, true, true, true)).toBe(false);
});
