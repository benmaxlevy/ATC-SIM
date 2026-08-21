import { expect, test } from "vitest";
import { PALETTE } from "./palette";
import {
  HEADING_TICK_PX,
  HISTORY_DOT_SIZE_PX,
  SELECTION_BOX_PAD_PX,
  TARGET_SHAPE,
  TARGET_SIZE_PX,
  headingTickOffset,
  historyDotColor,
  isTargetDiamondPath,
  selectionBoxRect,
  targetDiamondVertices,
  targetStrokeColor,
} from "./targetSymbol";

test("AC1 — position symbol is an 8 px diamond, not a 1–2 px dot", () => {
  expect(TARGET_SHAPE).toBe("diamond");
  expect(TARGET_SIZE_PX).toBeGreaterThanOrEqual(6);
  expect(TARGET_SIZE_PX).toBeGreaterThanOrEqual(7);
  expect(TARGET_SIZE_PX).toBeLessThanOrEqual(9);
  expect(TARGET_SIZE_PX).toBe(8);
  expect(HEADING_TICK_PX).toBe(8);
  const north = headingTickOffset(0);
  expect(north.dx).toBeCloseTo(0, 6);
  expect(north.dy).toBeCloseTo(-HEADING_TICK_PX, 6);
  const east = headingTickOffset(90);
  expect(east.dx).toBeCloseTo(HEADING_TICK_PX, 6);
  expect(east.dy).toBeCloseTo(0, 6);
  const verts = targetDiamondVertices(100, 200);
  expect(verts[0]).toEqual({ x: 100, y: 196 });
  expect(verts[1]).toEqual({ x: 104, y: 200 });
  expect(verts[2]).toEqual({ x: 100, y: 204 });
  expect(verts[3]).toEqual({ x: 96, y: 200 });
  expect(isTargetDiamondPath(verts, 100, 200)).toBe(true);
  expect(
    isTargetDiamondPath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      0,
      0,
    ),
  ).toBe(false);
});

test("history dots use FAA trail blues, not track-tinted grey", () => {
  expect(HISTORY_DOT_SIZE_PX).toBeGreaterThanOrEqual(2);
  expect(HISTORY_DOT_SIZE_PX).toBeLessThanOrEqual(3);
  expect(historyDotColor(0, 5)).toBe("#1E1E5A");
  expect(historyDotColor(4, 5)).toBe("#1E50C8");
  expect(historyDotColor(0, 1).toLowerCase()).not.toBe("#808080");
  expect(historyDotColor(0, 1).toLowerCase()).not.toBe("#888888");
  expect(historyDotColor(0, 5)).not.toBe(PALETTE.unowned);
  expect(historyDotColor(0, 5)).not.toBe(PALETTE.owned);
});

test("IDENT uses yellow stroke; otherwise search-target blue (FDB color is separate)", () => {
  expect(targetStrokeColor("unowned", false)).toBe("#1E78FF");
  expect(targetStrokeColor("owned", false)).toBe("#1E78FF");
  expect(targetStrokeColor("owned", true)).toBe("#FFFF00");
  expect(targetStrokeColor("unowned", true)).toBe("#FFFF00");
});

test("selection box is 1 px yellow padding around the diamond bounding box", () => {
  expect(SELECTION_BOX_PAD_PX).toBe(2);
  const box = selectionBoxRect(100, 200);
  expect(box.w).toBe(TARGET_SIZE_PX + 4);
  expect(box.h).toBe(TARGET_SIZE_PX + 4);
  expect(box.x).toBe(100 - TARGET_SIZE_PX / 2 - 2);
  expect(box.y).toBe(200 - TARGET_SIZE_PX / 2 - 2);
});

test("AC6 — targetSymbol comments say target/history grammar, not sprite or airplane", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./targetSymbol.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/CRC STARS target/);
  expect(src).toMatch(/Not a sprite \(R12\)/);
  expect(src).toMatch(/Not an airplane/);
  expect(src).toMatch(/diamond/);
});
