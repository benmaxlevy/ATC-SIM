import { expect, test } from "vitest";
import {
  HISTORY_BRIGHTNESS,
  HEADING_TICK_PX,
  TARGET_SIZE_PX,
  UNOWNED_TRACK_COLOR,
  headingTickOffset,
  historyDotColor,
  scaleHexColor,
  targetStrokeColor,
} from "./targetSymbol";

test("target is a 6 px unfilled square; heading tick is 8 px along ground track", () => {
  expect(TARGET_SIZE_PX).toBe(6);
  expect(HEADING_TICK_PX).toBe(8);
  const north = headingTickOffset(0);
  expect(north.dx).toBeCloseTo(0, 6);
  expect(north.dy).toBeCloseTo(-HEADING_TICK_PX, 6);
  const east = headingTickOffset(90);
  expect(east.dx).toBeCloseTo(HEADING_TICK_PX, 6);
  expect(east.dy).toBeCloseTo(0, 6);
});

test("history color is 40–70% of unowned track color", () => {
  expect(HISTORY_BRIGHTNESS).toBeGreaterThanOrEqual(0.4);
  expect(HISTORY_BRIGHTNESS).toBeLessThanOrEqual(0.7);
  expect(historyDotColor(UNOWNED_TRACK_COLOR)).toBe(
    scaleHexColor(UNOWNED_TRACK_COLOR, HISTORY_BRIGHTNESS),
  );
  const ch = parseInt(historyDotColor(UNOWNED_TRACK_COLOR).slice(1, 3), 16);
  const src = parseInt(UNOWNED_TRACK_COLOR.slice(1, 3), 16);
  expect(ch / src).toBeGreaterThanOrEqual(0.4);
  expect(ch / src).toBeLessThanOrEqual(0.7);
});

test("IDENT or selected uses yellow stroke; otherwise unowned white", () => {
  expect(targetStrokeColor(false, false)).toBe("#DDDDDD");
  expect(targetStrokeColor(true, false)).toBe("#FFFF00");
  expect(targetStrokeColor(false, true)).toBe("#FFFF00");
});

test("targetSymbol comments say target, not sprite", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./targetSymbol.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/CRC STARS target/);
  expect(src).toMatch(/Not a sprite \(R12\)/);
});
