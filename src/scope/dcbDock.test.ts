import { expect, test } from "vitest";
import { DCB_THICKNESS_PX, drawablePpiSize, isVerticalDcbDock } from "./dcbDock";

test("AC4 — drawable PPI shrinks on the docked edge", () => {
  expect(DCB_THICKNESS_PX).toBe(36);
  expect(drawablePpiSize(800, 600, "TOP")).toEqual({ widthPx: 800, heightPx: 564 });
  expect(drawablePpiSize(800, 600, "BOTTOM")).toEqual({ widthPx: 800, heightPx: 564 });
  expect(drawablePpiSize(800, 600, "LEFT")).toEqual({ widthPx: 764, heightPx: 600 });
  expect(drawablePpiSize(800, 600, "RIGHT")).toEqual({ widthPx: 764, heightPx: 600 });
});

test("LEFT/RIGHT are the vertical DCB stack", () => {
  expect(isVerticalDcbDock("LEFT")).toBe(true);
  expect(isVerticalDcbDock("RIGHT")).toBe(true);
  expect(isVerticalDcbDock("TOP")).toBe(false);
  expect(isVerticalDcbDock("BOTTOM")).toBe(false);
});

test("comments say DCB position / HISTORY-adjacent PPI edge, not a dock panel", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./dcbDock.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/\bDCB\b/);
  expect(src).toMatch(/docs\.virtualnas\.net\/crc\/stars/);
  expect(src).toMatch(/TOP \/ LEFT \/ RIGHT \/ BOTTOM/);
  expect(src.toLowerCase()).not.toMatch(/dock panel/);
  expect(src.toLowerCase()).not.toMatch(/\bhud\b/);
});
