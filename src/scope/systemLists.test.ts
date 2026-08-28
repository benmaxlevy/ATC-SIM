import { describe, expect, it } from "vitest";
import {
  buildSystemListLines,
  formatListEntry,
  rewriteFixForList,
  type ListFormatter,
} from "./listFormatter";
import {
  cancelListDrag,
  findOverlappingLists,
  handleListMiddleClick,
  handleListMouseMove,
  idleListDragState,
  pointInsideRect,
  rectsOverlap,
  type ListRect,
} from "./systemLists";

describe("listFormatter", () => {
  it("compresses and pads fix names to 3 characters", () => {
    expect(rewriteFixForList("")).toBe("   ");
    expect(rewriteFixForList(undefined)).toBe("   ");
    expect(rewriteFixForList("BOS")).toBe("BOS");
    expect(rewriteFixForList("GAYEL")).toBe("GAY");
    expect(rewriteFixForList("D")).toBe("  D");
  });

  it("replaces format specifiers properly", () => {
    const entry = formatListEntry("[INDEX] [ACID] [BEACON] [REQ_ALT] [EXIT_FIX]", {
      INDEX: "01",
      ACID: "AAL123 ",
      BEACON: "1234",
      REQ_ALT: "050",
      EXIT_FIX: "GAY",
    });
    expect(entry).toBe("01 AAL123  1234 050 GAY");
  });

  it("handles pagination with MORE header when entries exceed maxLines", () => {
    const formatter: ListFormatter = {
      title: "FLIGHT PLAN",
      frameTitle: "FLIGHT PLAN (T)",
      maxLines: 2,
      entries: 5,
      formatLine: (idx) => `LINE ${idx + 1}`,
    };
    const lines = buildSystemListLines(formatter);
    expect(lines).toEqual([
      "FLIGHT PLAN",
      "MORE: 2/5",
      "LINE 1",
      "LINE 2",
    ]);
  });

  it("omits MORE header when entries fit within maxLines", () => {
    const formatter: ListFormatter = {
      title: "VFR LIST",
      frameTitle: "VFR LIST (TV)",
      maxLines: 5,
      entries: 2,
      formatLine: (idx) => `VFR ${idx + 1}`,
    };
    const lines = buildSystemListLines(formatter);
    expect(lines).toEqual([
      "VFR LIST",
      "VFR 1",
      "VFR 2",
    ]);
  });
});

describe("systemLists window manager", () => {
  it("detects point inside rect", () => {
    const rect: ListRect = { x: 100, y: 100, width: 200, height: 150 };
    expect(pointInsideRect(150, 150, rect)).toBe(true);
    expect(pointInsideRect(50, 50, rect)).toBe(false);
    expect(pointInsideRect(100, 100, rect)).toBe(true);
    expect(pointInsideRect(300, 250, rect)).toBe(true);
  });

  it("detects rectangle overlap correctly", () => {
    const r1: ListRect = { x: 10, y: 10, width: 100, height: 100 };
    const r2: ListRect = { x: 50, y: 50, width: 100, height: 100 };
    const r3: ListRect = { x: 200, y: 200, width: 50, height: 50 };

    expect(rectsOverlap(r1, r2)).toBe(true);
    expect(rectsOverlap(r1, r3)).toBe(false);

    const overlapping = findOverlappingLists([
      { id: "L1", bounds: r1 },
      { id: "L2", bounds: r2 },
      { id: "L3", bounds: r3 },
    ]);
    expect(overlapping.has("L1")).toBe(true);
    expect(overlapping.has("L2")).toBe(true);
    expect(overlapping.has("L3")).toBe(false);
  });

  it("handles middle-click drag lifecycle and coordinate drop", () => {
    let state = idleListDragState();
    const lists = [
      { id: "TAB", bounds: { x: 100, y: 200, width: 150, height: 100 } },
    ];
    const paneExtent = { width: 1000, height: 800 };

    // Click inside TAB list -> starts drag
    const res1 = handleListMiddleClick(state, { x: 120, y: 220 }, lists, paneExtent);
    state = res1.nextState;
    expect(state.movingListId).toBe("TAB");
    expect(state.movingOffset).toEqual({ x: 20, y: 20 });

    // Move mouse
    state = handleListMouseMove(state, { x: 420, y: 320 });
    expect(state.movingCurrentPos).toEqual({ x: 420, y: 320 });

    // Click again to drop at new position
    const res2 = handleListMiddleClick(state, { x: 420, y: 320 }, lists, paneExtent);
    expect(res2.nextState.movingListId).toBeNull();
    expect(res2.updatedPlacement).toEqual({
      id: "TAB",
      x: (420 - 20) / 1000, // 0.4
      y: (320 - 20) / 800,  // 0.375
    });
  });

  it("cancels drag on cancelListDrag", () => {
    let state = idleListDragState();
    const lists = [{ id: "TAB", bounds: { x: 100, y: 200, width: 150, height: 100 } }];
    const res = handleListMiddleClick(state, { x: 120, y: 220 }, lists, { width: 1000, height: 800 });
    state = res.nextState;
    expect(state.movingListId).toBe("TAB");

    state = cancelListDrag(state);
    expect(state.movingListId).toBeNull();
  });
});
