import { expect, test } from "vitest";
import { PALETTE } from "./palette";
import {
  HISTORY_BRIGHTNESS,
  HEADING_TICK_PX,
  HISTORY_DOT_SIZE_PX,
  SELECTION_BOX_PAD_PX,
  TARGET_SHAPE,
  TARGET_SIZE_PX,
  UNOWNED_TRACK_COLOR,
  headingTickOffset,
  historyDotColor,
  isTargetDiamondPath,
  scaleHexColor,
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

test("history color is 40–70% of the track color family, not independent grey", () => {
  expect(HISTORY_DOT_SIZE_PX).toBeGreaterThanOrEqual(2);
  expect(HISTORY_DOT_SIZE_PX).toBeLessThanOrEqual(3);
  expect(HISTORY_BRIGHTNESS).toBeGreaterThanOrEqual(0.4);
  expect(HISTORY_BRIGHTNESS).toBeLessThanOrEqual(0.7);
  expect(historyDotColor(UNOWNED_TRACK_COLOR)).toBe(
    scaleHexColor(UNOWNED_TRACK_COLOR, HISTORY_BRIGHTNESS),
  );
  expect(historyDotColor(PALETTE.owned)).toBe(scaleHexColor(PALETTE.owned, HISTORY_BRIGHTNESS));
  expect(historyDotColor(UNOWNED_TRACK_COLOR).toLowerCase()).not.toBe("#808080");
  expect(historyDotColor(UNOWNED_TRACK_COLOR).toLowerCase()).not.toBe("#888888");
  const ch = parseInt(historyDotColor(UNOWNED_TRACK_COLOR).slice(1, 3), 16);
  const src = parseInt(UNOWNED_TRACK_COLOR.slice(1, 3), 16);
  expect(ch / src).toBeGreaterThanOrEqual(0.4);
  expect(ch / src).toBeLessThanOrEqual(0.7);
});

test("IDENT uses yellow stroke; otherwise ownership color (selection is a separate box)", () => {
  expect(targetStrokeColor("unowned", false)).toBe("#B8E0D0");
  expect(targetStrokeColor("owned", false)).toBe("#00FF66");
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
