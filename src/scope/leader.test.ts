import { expect, test } from "vitest";
import {
  DEFAULT_LEADER_DIR,
  L5_OVERLAY_GAP_PX,
  LEADER_BLOCK_GAP_PX,
  LEADER_LENGTH_PX,
  datablockTopLeft,
  isLeaderDir,
  leaderOffsetPx,
  leaderSegmentPx,
  type LeaderDir,
} from "./leader";
import { TARGET_SIZE_PX } from "./targetSymbol";

const DIRS: LeaderDir[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const METRICS = { widthPx: 57.6, heightPx: 24 };

test("AC1 — nine offsets; L8 is −Y (north), L6 is +X, L5 is ~0 length", () => {
  expect(DEFAULT_LEADER_DIR).toBe(8);
  expect(LEADER_LENGTH_PX).toBe(24);
  for (const dir of DIRS) {
    expect(isLeaderDir(dir)).toBe(true);
    const off = leaderOffsetPx(dir);
    expect(Number.isFinite(off.dx)).toBe(true);
    expect(Number.isFinite(off.dy)).toBe(true);
  }
  expect(isLeaderDir(0)).toBe(false);
  expect(isLeaderDir(10)).toBe(false);

  const north = leaderOffsetPx(8);
  expect(north.dx).toBeCloseTo(0);
  expect(north.dy).toBeLessThan(0);
  expect(north.dy).toBeCloseTo(-LEADER_LENGTH_PX);

  const east = leaderOffsetPx(6);
  expect(east.dx).toBeGreaterThan(0);
  expect(east.dy).toBeCloseTo(0);
  expect(east.dx).toBeCloseTo(LEADER_LENGTH_PX);

  const overlay = leaderOffsetPx(5);
  expect(Math.hypot(overlay.dx, overlay.dy)).toBeLessThanOrEqual(1);
  expect(leaderSegmentPx(5)).toBeNull();
});

test("compass diagonals keep a 24 px Euclidean leader length", () => {
  for (const dir of [1, 3, 7, 9] as LeaderDir[]) {
    const off = leaderOffsetPx(dir);
    expect(Math.hypot(off.dx, off.dy)).toBeCloseTo(LEADER_LENGTH_PX);
  }
  expect(leaderOffsetPx(2).dy).toBeCloseTo(LEADER_LENGTH_PX);
  expect(leaderOffsetPx(4).dx).toBeCloseTo(-LEADER_LENGTH_PX);
  expect(leaderOffsetPx(7).dx).toBeLessThan(0);
  expect(leaderOffsetPx(7).dy).toBeLessThan(0);
});

test("AC2 — L6 block sits east of the symbol; L8 block sits north", () => {
  const east = datablockTopLeft(6, METRICS);
  expect(east.x).toBeCloseTo(LEADER_LENGTH_PX + LEADER_BLOCK_GAP_PX);
  expect(east.x).toBeGreaterThan(TARGET_SIZE_PX / 2);
  expect(east.y).toBeCloseTo(-METRICS.heightPx / 2);

  const north = datablockTopLeft(8, METRICS);
  expect(north.x).toBeCloseTo(-METRICS.widthPx / 2);
  expect(north.y + METRICS.heightPx).toBeCloseTo(-LEADER_LENGTH_PX - LEADER_BLOCK_GAP_PX);
  expect(north.y + METRICS.heightPx).toBeLessThan(-TARGET_SIZE_PX / 2);
});

test("AC3 — L5 has no visible leader; block is SE of center and misses the symbol", () => {
  expect(leaderSegmentPx(5)).toBeNull();
  const origin = datablockTopLeft(5, METRICS);
  expect(origin).toEqual({ x: L5_OVERLAY_GAP_PX, y: L5_OVERLAY_GAP_PX });
  const half = TARGET_SIZE_PX / 2;
  const symbolRight = half;
  const symbolBottom = half;
  expect(origin.x).toBeGreaterThan(symbolRight);
  expect(origin.y).toBeGreaterThan(symbolBottom);
});

test("L4 right-aligns the datablock west of the leader so text is not crossed", () => {
  const origin = datablockTopLeft(4, METRICS);
  const right = origin.x + METRICS.widthPx;
  expect(right).toBeCloseTo(-LEADER_LENGTH_PX - LEADER_BLOCK_GAP_PX);
  expect(right).toBeLessThan(0);
});

test("AC8 — module says leader, cites CRC L1–L9, and omits a length menu", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./leader.ts"] ?? "";
  expect(src).toMatch(/leader/);
  expect(src).toMatch(/L1–L9/);
  expect(src).toMatch(/no leader-length DCB menu/);
  expect(src).toMatch(/CRC STARS/);
  expect(src).not.toMatch(/\bstem\b/);
  expect(src).not.toMatch(/\bstick\b/);
  expect(src).not.toMatch(/\bcallout\b/);
});
