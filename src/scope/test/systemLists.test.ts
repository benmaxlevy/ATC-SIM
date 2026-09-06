import { describe, expect, it } from "vitest";
import {
  buildSystemListLines,
  formatListEntry,
  rewriteFixForList,
  type ListFormatter,
} from "../listFormatter";
import {
  cancelListDrag,
  canonicalSystemListId,
  commitListDrag,
  DEFAULT_ADAPTATION_ANCHORS,
  findOverlappingLists,
  handleListMiddleClick,
  handleListMouseMove,
  handleListTitleDragStart,
  hitTestSystemListTitle,
  idleListDragState,
  pointInsideRect,
  rectsOverlap,
  relocateSystemList,
  resetSystemListToDefault,
  type ListRect,
} from "../systemLists";
import { createScopeView } from "../scopeView";
import { applyDcbPref, serializeDcbPref } from "../dcb/dcbPref";
import { parsePreviewCommand } from "../previewParse";

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
    expect(lines).toEqual(["FLIGHT PLAN", "MORE: 1/3", "LINE 1", "LINE 2"]);
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
    expect(lines).toEqual(["VFR LIST", "VFR 1", "VFR 2"]);
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
    const lists = [{ id: "TAB", bounds: { x: 100, y: 200, width: 150, height: 100 } }];
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
      y: (320 - 20) / 800, // 0.375
    });
  });

  it("cancels drag on cancelListDrag", () => {
    let state = idleListDragState();
    const lists = [{ id: "TAB", bounds: { x: 100, y: 200, width: 150, height: 100 } }];
    const res = handleListMiddleClick(state, { x: 120, y: 220 }, lists, {
      width: 1000,
      height: 800,
    });
    state = res.nextState;
    expect(state.movingListId).toBe("TAB");

    state = cancelListDrag(state);
    expect(state.movingListId).toBeNull();
  });

  it("canonicalizes list IDs and preserves adaptation defaults", () => {
    expect(canonicalSystemListId("FL")).toBe("FL");
    expect(canonicalSystemListId("TAB")).toBe("FL");
    expect(canonicalSystemListId("T")).toBe("FL");
    expect(canonicalSystemListId("TL")).toBe("TL");
    expect(canonicalSystemListId("TOWER_1")).toBe("TL");
    expect(canonicalSystemListId("P1")).toBe("TL");
    expect(canonicalSystemListId("VL")).toBe("VL");
    expect(canonicalSystemListId("VFR")).toBe("VL");
    expect(canonicalSystemListId("TV")).toBe("VL");
    expect(canonicalSystemListId("ML")).toBe("ML");
    expect(canonicalSystemListId("MAPS")).toBe("ML");
    expect(canonicalSystemListId("TX")).toBe("ML");
    expect(canonicalSystemListId("AL")).toBe("AL");
    expect(canonicalSystemListId("ALERT")).toBe("AL");
    expect(canonicalSystemListId("TM")).toBe("AL");
    expect(canonicalSystemListId("SO")).toBe("SIGN_ON");
    expect(canonicalSystemListId("CS")).toBe("COAST");
    expect(canonicalSystemListId("CR")).toBe("CRDA");

    expect(DEFAULT_ADAPTATION_ANCHORS.FL).toEqual({ x: 0.02, y: 0.4, maxLines: 10 });
    expect(DEFAULT_ADAPTATION_ANCHORS.TL).toEqual({ x: 0.75, y: 0.02, maxLines: 10 });
    expect(DEFAULT_ADAPTATION_ANCHORS.VL).toEqual({ x: 0.02, y: 0.7, maxLines: 10 });
    expect(DEFAULT_ADAPTATION_ANCHORS.ML).toEqual({ x: 0.25, y: 0.02, maxLines: 20 });
    expect(DEFAULT_ADAPTATION_ANCHORS.AL).toEqual({ x: 0.75, y: 0.7, maxLines: 50 });
  });

  it("resets a moved system list back to its adaptation default coordinates", () => {
    const view = createScopeView();
    relocateSystemList(view, "FL", 0.88, 0.88);
    expect(view.systemLists.FL.x).toBe(0.88);
    expect(view.systemLists.FL.y).toBe(0.88);

    const resetOk = resetSystemListToDefault(view, "FL");
    expect(resetOk).toBe(true);
    expect(view.systemLists.FL.x).toBe(DEFAULT_ADAPTATION_ANCHORS.FL.x);
    expect(view.systemLists.FL.y).toBe(DEFAULT_ADAPTATION_ANCHORS.FL.y);
    expect(view.systemLists.TAB.x).toBe(DEFAULT_ADAPTATION_ANCHORS.FL.x);
  });

  it("handles title header drag initiation and commit", () => {
    let state = idleListDragState();
    const lists = [
      { id: "FL", bounds: { x: 50, y: 100, width: 200, height: 120 } },
      { id: "TL", bounds: { x: 400, y: 100, width: 200, height: 120 } },
    ];
    const paneExtent = { width: 1000, height: 800 };

    // Click outside title header (e.g. at y = 140, while header is top 16px [100..116])
    const miss = hitTestSystemListTitle({ x: 70, y: 140 }, lists, 16);
    expect(miss).toBeNull();

    // Click inside title header (y = 105)
    const hit = hitTestSystemListTitle({ x: 70, y: 105 }, lists, 16);
    expect(hit).toBe("FL");

    const startRes = handleListTitleDragStart(state, { x: 70, y: 105 }, lists, 16);
    expect(startRes.started).toBe(true);
    state = startRes.nextState;
    expect(state.movingListId).toBe("FL");
    expect(state.movingOffset).toEqual({ x: 20, y: 5 });

    // Move to new point
    state = handleListMouseMove(state, { x: 250, y: 300 });

    // Commit drag
    const commitRes = commitListDrag(state, { x: 250, y: 300 }, paneExtent);
    expect(commitRes.nextState.movingListId).toBeNull();
    expect(commitRes.updatedPlacement).toEqual({
      id: "FL",
      x: (250 - 20) / 1000, // 0.23
      y: (300 - 5) / 800, // 0.36875
    });
  });

  it("persists and restores system list state across DCB PREF snapshots", () => {
    const view1 = createScopeView();
    view1.systemLists.FL.visible = true;
    view1.systemLists.FL.maxLines = 25;
    relocateSystemList(view1, "FL", 0.33, 0.44);

    const serialized = serializeDcbPref(view1);
    expect(serialized.systemLists).toBeDefined();
    expect(serialized.systemLists?.FL?.visible).toBe(true);
    expect(serialized.systemLists?.FL?.x).toBe(0.33);
    expect(serialized.systemLists?.FL?.y).toBe(0.44);
    expect(serialized.systemLists?.FL?.maxLines).toBe(25);

    const view2 = createScopeView();
    expect(view2.systemLists.FL.visible).toBe(false);
    expect(view2.systemLists.FL.maxLines).toBe(10);

    applyDcbPref(view2, serialized);
    expect(view2.systemLists.FL.visible).toBe(true);
    expect(view2.systemLists.FL.x).toBe(0.33);
    expect(view2.systemLists.FL.y).toBe(0.44);
    expect(view2.systemLists.FL.maxLines).toBe(25);
    expect(view2.systemLists.TAB.visible).toBe(true);
  });

  it("relocates and resets SSA anchor position", () => {
    const view = createScopeView();
    expect(view.systemLists.SSA.x).toBe(DEFAULT_ADAPTATION_ANCHORS.SSA.x);
    expect(view.systemLists.SSA.y).toBe(DEFAULT_ADAPTATION_ANCHORS.SSA.y);

    const ok = relocateSystemList(view, "SSA", 0.45, 0.65);
    expect(ok).toBe(true);
    expect(view.systemLists.SSA.x).toBe(0.45);
    expect(view.systemLists.SSA.y).toBe(0.65);

    const resetOk = resetSystemListToDefault(view, "SSA");
    expect(resetOk).toBe(true);
    expect(view.systemLists.SSA.x).toBe(DEFAULT_ADAPTATION_ANCHORS.SSA.x);
    expect(view.systemLists.SSA.y).toBe(DEFAULT_ADAPTATION_ANCHORS.SSA.y);
  });

  it("drags SSA by clicking and holding the top line (triangle and all the way over)", () => {
    let state = idleListDragState();
    const ssaBounds: ListRect = { x: 100, y: 50, width: 250, height: 180 };
    const ssaHandleBounds: ListRect = { x: 100, y: 50, width: 250, height: 18 };
    const lists = [{ id: "SSA", bounds: ssaBounds, handleBounds: ssaHandleBounds }];
    const paneExtent = { width: 1000, height: 800 };

    // Clicking the upside-down triangle at (110, 58) hits SSA
    const hitTriangle = hitTestSystemListTitle({ x: 110, y: 58 }, lists, 16);
    expect(hitTriangle).toBe("SSA");

    // Clicking to the right on the top line at (200, 58) also hits SSA (triangle and all the way over)
    const hitRight = hitTestSystemListTitle({ x: 200, y: 58 }, lists, 16);
    expect(hitRight).toBe("SSA");

    // Clicking past the right edge of SSA at (360, 58) misses
    const missPastRight = hitTestSystemListTitle({ x: 360, y: 58 }, lists, 16);
    expect(missPastRight).toBeNull();

    // Clicking below the top line at (110, 90) misses
    const missBelow = hitTestSystemListTitle({ x: 110, y: 90 }, lists, 16);
    expect(missBelow).toBeNull();

    // Click and hold top line (e.g. at 200, 58) starts dragging
    const startRes = handleListTitleDragStart(state, { x: 200, y: 58 }, lists, 16);
    expect(startRes.started).toBe(true);
    state = startRes.nextState;
    expect(state.movingListId).toBe("SSA");
    expect(state.movingOffset).toEqual({ x: 100, y: 8 });

    // Drag mouse to (400, 300)
    state = handleListMouseMove(state, { x: 400, y: 300 });

    // Releasing pointer commits new position
    const commitRes = commitListDrag(state, { x: 400, y: 300 }, paneExtent);
    expect(commitRes.nextState.movingListId).toBeNull();
    expect(commitRes.updatedPlacement).toEqual({
      id: "SSA",
      x: (400 - 100) / 1000, // 0.3
      y: (300 - 8) / 800, // 0.365
    });

    const view = createScopeView();
    relocateSystemList(
      view,
      commitRes.updatedPlacement!.id,
      commitRes.updatedPlacement!.x,
      commitRes.updatedPlacement!.y,
    );
    expect(view.systemLists.SSA.x).toBe(0.3);
    expect(view.systemLists.SSA.y).toBe(0.365);
  });

  it("strictly rejects old command aliases for system lists while supporting canonical commands", () => {
    // Canonical commands must work
    expect(parsePreviewCommand("*T")).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: "FL" },
    });
    expect(parsePreviewCommand("*TV")).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: "VL" },
    });
    expect(parsePreviewCommand("*TM")).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: "AL" },
    });
    expect(parsePreviewCommand("*TC")).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: "COAST" },
    });
    expect(parsePreviewCommand("*TS")).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: "SIGN_ON" },
    });
    expect(parsePreviewCommand("*TX")).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: "ML" },
    });
    expect(parsePreviewCommand("*TN")).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: "CRDA" },
    });
    expect(parsePreviewCommand("*P1")).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: "TOWER_1" },
    });
    expect(parsePreviewCommand("*P2")).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: "TOWER_2" },
    });
    expect(parsePreviewCommand("*P3")).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: "TOWER_3" },
    });
    expect(parsePreviewCommand("*S")).toEqual({
      kind: "action",
      action: { type: "armRelocateList", listId: "SSA" },
    });

    // Removed aliases must be rejected
    const removedAliases = [
      "*FL",
      "*TAB",
      "*VL",
      "*TL",
      "*ML",
      "*AL",
      "*CR",
      "*CS",
      "*SO",
      "*SSA",
      "*TLBED",
    ];
    for (const alias of removedAliases) {
      expect(parsePreviewCommand(alias).kind).toBe("invalid");
    }
  });
});
