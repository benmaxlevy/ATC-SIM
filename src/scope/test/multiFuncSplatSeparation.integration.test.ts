/** T02-207 synthetic acceptance: entry origin owns Enter, live slew, and collisions. */
import { describe, expect, it, vi } from "vitest";
import { createScopeView } from "../scopeView";
import { createWorld, makeTestAircraft } from "@core";
import { handleScopeKeyDown, type ScopeKeyEvent } from "../scopeKeys";
import { handlePpiLeftClick } from "../ppi";
import { nmToScreen } from "../camera";
import { syncTrackDisplays } from "../trackDisplay";
import { isMinSepPending } from "../minimumSeparation";
import {
  beginPreviewBufferEntry,
  beginPreviewMultiFuncEntry,
  idlePreviewArea,
  previewRelocateListId,
  previewTrackingSlew,
} from "../previewArea";
import { parsePreviewCommandForOrigin } from "../previewParse";
import { commitStarsChord } from "../starsChord";
import { HELP_COMMAND_GROUPS, bindingById } from "../keymap";

function key(key: string, overrides: Partial<ScopeKeyEvent> = {}): ScopeKeyEvent {
  return {
    key,
    code: key === "Enter" ? "Enter" : key,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: null,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  };
}

function press(
  view: ReturnType<typeof createScopeView>,
  keyName: string,
  focus: "scope" | "radio" = "scope",
  options: Partial<ScopeKeyEvent> = {},
  ui = {},
) {
  return handleScopeKeyDown(key(keyName, options), view, focus, undefined, 100, ui);
}

describe("T02-207 MULTI FUNC/splat boundary", () => {
  it("routes F7 independently from literal star through live entry and Enter", () => {
    const view = createScopeView();
    expect(press(view, "F7", "radio")).toBe(true);
    expect(view.preview).toMatchObject({
      phase: "entry",
      buffer: "",
      entryOrigin: "multiFunc",
      mnemonic: "MULTI FUNC",
    });
    expect(press(view, "T", "radio")).toBe(true);
    expect(press(view, "Enter", "radio")).toBe(true);
    expect(view.systemLists.FL.visible).toBe(true);

    press(view, "*", "scope");
    press(view, "T", "scope");
    press(view, "Enter", "scope");
    expect(view.systemLists.FL.visible).toBe(true);
    expect(view.preview.phase).toBe("idle");
    expect(view.preview.rejection).toBeNull();
  });

  it("keeps F7 beacon and aircraft-like operands inside Preview without auto-commit or plan creation", () => {
    const view = createScopeView();
    const openPlan = vi.fn();
    press(view, "F7", "radio");
    for (const ch of "B1234") press(view, ch, "radio", {}, { onOpenFlightPlanModal: openPlan });
    expect(view.preview.phase).toBe("entry");
    expect(view.preview.buffer).toBe("B1234");
    expect(openPlan).not.toHaveBeenCalled();
    press(view, "Enter", "radio", {}, { onOpenFlightPlanModal: openPlan });
    expect(openPlan).not.toHaveBeenCalled();

    press(view, "F7", "radio");
    for (const ch of "DAL123 H270")
      press(view, ch, "radio", {}, { onOpenFlightPlanModal: openPlan });
    press(view, "Enter", "radio", {}, { onOpenFlightPlanModal: openPlan });
    expect(openPlan).not.toHaveBeenCalled();
  });

  it("routes literal *P1 to TPA and F7 cancels pending MIN while preserving active pair", () => {
    const view = createScopeView();
    press(view, "*", "scope");
    press(view, "P", "scope");
    press(view, "1", "scope");
    press(view, "Enter", "scope");
    expect(view.starsChordArmed).toMatchObject({ type: "cone", lengthNm: 1 });

    view.minSep.activePair = { aircraftIdA: "old-a", aircraftIdB: "old-b" };
    press(view, "Delete", "scope");
    expect(isMinSepPending(view)).toBe(true);
    press(view, "F7", "scope");
    press(view, "T", "scope");
    press(view, "Enter", "scope");
    expect(view.minSep.activePair).toEqual({ aircraftIdA: "old-a", aircraftIdB: "old-b" });
    expect(view.minSep.pendingFirstId).toBeNull();
    expect(isMinSepPending(view)).toBe(false);
    expect(view.systemLists.FL.visible).toBe(true);
  });

  it("keeps MF live clicks from invoking literal modal or ordinary CA actions", () => {
    const world = createWorld();
    const aircraft = makeTestAircraft({ id: "ac-mf", callsign: "AAL100", xNm: 0, yNm: 0 });
    world.aircraft = [aircraft];
    const view = createScopeView();
    syncTrackDisplays(view.tracks, world);
    const openPlan = vi.fn();

    press(view, "F7");
    for (const ch of "*FP") press(view, ch);
    expect(previewTrackingSlew(view.preview)).toBeNull();
    const target = nmToScreen(aircraft.xNm, aircraft.yNm, view.camera, {
      widthPx: 1000,
      heightPx: 800,
    });
    handlePpiLeftClick(view, world, target.x, target.y, 1000, 800, "", openPlan);
    expect(openPlan).not.toHaveBeenCalled();

    press(view, "F7");
    for (const ch of "CA K") press(view, ch);
    expect(previewTrackingSlew(view.preview)).toBeNull();
    handlePpiLeftClick(view, world, target.x, target.y, 1000, 800);
    expect(view.tracks.get(aircraft.id)?.caInhibited).not.toBe(true);

    beginPreviewBufferEntry(view.preview, "CA K", 200);
    expect(previewTrackingSlew(view.preview)).toMatchObject({ type: "caSingleTrackInhibit" });
    handlePpiLeftClick(view, world, target.x, target.y, 1000, 800);
    expect(view.tracks.get(aircraft.id)?.caInhibited).toBe(true);

    beginPreviewBufferEntry(view.preview, "*FP", 300);
    handlePpiLeftClick(view, world, target.x, target.y, 1000, 800, "", openPlan);
    expect(openPlan).toHaveBeenCalledWith({ targetAircraftId: aircraft.id });
  });

  it("accepts F7 and owned operands at the actual radio input but preserves other inputs", () => {
    const view = createScopeView();
    const input = {
      tagName: "INPUT",
      id: "command-line-input",
      closest: () => null,
    } as unknown as EventTarget;
    expect(handleScopeKeyDown(key("F7", { target: input }), view, "radio")).toBe(true);
    expect(view.preview.entryOrigin).toBe("multiFunc");
    expect(handleScopeKeyDown(key("T", { target: input }), view, "radio")).toBe(true);
    expect(handleScopeKeyDown(key("P", { shiftKey: true, target: input }), view, "radio")).toBe(
      true,
    );
    expect(view.preview.buffer).toBe("TP");
    expect(handleScopeKeyDown(key("Backspace", { target: input }), view, "radio")).toBe(true);
    expect(handleScopeKeyDown(key("*", { shiftKey: true, target: input }), view, "radio")).toBe(
      true,
    );
    expect(view.preview.buffer).toBe("T*");
    expect(handleScopeKeyDown(key("V", { ctrlKey: true, target: input }), view, "radio")).toBe(
      false,
    );
    expect(view.preview.buffer).toBe("T*");
    expect(handleScopeKeyDown(key("F7", { target: input }), view, "radio")).toBe(true);
    expect(handleScopeKeyDown(key("T", { target: input }), view, "radio")).toBe(true);
    expect(handleScopeKeyDown(key("Enter", { target: input }), view, "radio")).toBe(true);
    expect(view.systemLists.FL.visible).toBe(true);

    const otherInput = { tagName: "INPUT", id: "other" } as unknown as EventTarget;
    expect(handleScopeKeyDown(key("F7", { target: otherInput }), view, "radio")).toBe(false);
    const modalInput = {
      tagName: "INPUT",
      id: "command-line-input",
      closest: () => ({}),
    } as unknown as EventTarget;
    expect(handleScopeKeyDown(key("F7", { target: modalInput }), view, "radio")).toBe(false);
  });

  it("routes Ctrl+F7 from the radio input to DCB SHIFT without entering MULTI FUNC", () => {
    const view = createScopeView();
    const input = {
      tagName: "INPUT",
      id: "command-line-input",
      closest: () => null,
    } as unknown as EventTarget;
    const ctrlF7 = key("F7", { ctrlKey: true, target: input });
    expect(handleScopeKeyDown(ctrlF7, view, "radio")).toBe(true);
    expect(ctrlF7.preventDefault).toHaveBeenCalledOnce();
    expect(view.dcbMenu).toBe("AUX");
    expect(view.preview.phase).toBe("idle");
    expect(view.preview.entryOrigin).toBeNull();

    const ctrlV = key("V", { ctrlKey: true, target: input });
    expect(handleScopeKeyDown(ctrlV, view, "radio")).toBe(false);
    expect(ctrlV.preventDefault).not.toHaveBeenCalled();

    expect(handleScopeKeyDown(key("F7", { target: input }), view, "radio")).toBe(true);
    expect(view.preview.entryOrigin).toBe("multiFunc");
  });

  it("cancels and rolls back a DCB spinner before F7 list resizing", () => {
    const view = createScopeView();
    view.ringIntervalNm = 10;
    expect(press(view, "F9", "scope", { ctrlKey: true })).toBe(true);
    expect(view.dcbSpinner.armed).toBe(true);
    press(view, "2", "scope");
    expect(view.dcbSpinner.buffer).toBe("2");
    press(view, "F7", "scope");
    expect(view.dcbSpinner.armed).toBe(false);
    expect(view.dcbSpinner.buffer).toBe("");
    expect(view.ringIntervalNm).toBe(10);
    press(view, "T", "scope");
    press(view, "1", "scope");
    press(view, "5", "scope");
    press(view, "Enter", "scope");
    expect(view.systemLists.FL.maxLines).toBe(15);
  });

  it("gives P/P1 and filter, alert, PTL, leader, beacon, and plan collisions to one family", () => {
    expect(parsePreviewCommandForOrigin("P", "multiFunc")).toMatchObject({ kind: "incomplete" });
    expect(parsePreviewCommandForOrigin("P1", "multiFunc")).toMatchObject({
      kind: "action",
      action: { type: "toggleList", listId: "TOWER_1" },
    });
    expect(parsePreviewCommandForOrigin("*P1", "literalSplat")).toEqual({ kind: "incomplete" });
    expect(commitStarsChord("*P1")).toMatchObject({
      kind: "action",
      action: { type: "cone", lengthNm: 1 },
    });
    expect(parsePreviewCommandForOrigin("*DEL14", "literalSplat")).toMatchObject({
      kind: "action",
      action: { type: "deleteFlightPlanEntry", index: 14 },
    });

    expect(parsePreviewCommandForOrigin("F030180", "multiFunc")).toMatchObject({
      kind: "action",
      action: { type: "setAltitudeFilterLimits", floorHundreds: 30, ceilingHundreds: 180 },
    });
    expect(parsePreviewCommandForOrigin("FC030180", "multiFunc")).toMatchObject({
      kind: "action",
      action: { type: "setAltitudeFilterLimits", associatedOnly: true },
    });
    for (const token of [
      "*F030180",
      "*Q",
      "*V",
      "*R",
      "*L8",
      "*B DAL123",
      "*M DAL123 0701",
      "*P1",
    ]) {
      const result = parsePreviewCommandForOrigin(token, "literalSplat");
      expect(result.kind, token).not.toBe("action");
    }
    expect(parsePreviewCommandForOrigin("Q", "multiFunc")).toMatchObject({
      kind: "action",
      action: { type: "msawCurrentAlertInhibit" },
    });
    expect(parsePreviewCommandForOrigin("R", "multiFunc")).toMatchObject({
      kind: "action",
      action: { type: "armPerTrackPtl" },
    });
    expect(parsePreviewCommandForOrigin("L8", "multiFunc")).toMatchObject({
      kind: "action",
      action: { type: "setLeaderDir", dir: 8 },
    });
    expect(parsePreviewCommandForOrigin("*8", "literalSplat")).toMatchObject({
      kind: "action",
      action: { type: "setLeaderDir", starsDir: 8 },
    });
    expect(parsePreviewCommandForOrigin("*0", "literalSplat")).toMatchObject({
      kind: "action",
      action: { type: "resetLeaderDir" },
    });
    expect(parsePreviewCommandForOrigin("B DAL123", "multiFunc")).toMatchObject({
      kind: "action",
      action: { type: "releaseAssignedBeacon", flid: "DAL123" },
    });
    expect(parsePreviewCommandForOrigin("M DAL123 0701", "multiFunc")).toMatchObject({
      kind: "action",
      action: { type: "modifyFlightPlan" },
    });
  });

  it("routes live slew and relocation by origin, not shared text", () => {
    const multi = idlePreviewArea();
    beginPreviewMultiFuncEntry(multi, 1);
    multi.buffer = "L8";
    expect(previewTrackingSlew(multi)).toMatchObject({ type: "setLeaderDir", dir: 8 });
    multi.buffer = "R";
    expect(previewTrackingSlew(multi)).toMatchObject({ type: "armPerTrackPtl" });
    multi.buffer = "Q";
    expect(previewTrackingSlew(multi)).toMatchObject({ type: "msawCurrentAlertInhibit" });
    multi.buffer = "P";
    expect(previewRelocateListId(multi)).toBe("PREVIEW");
    multi.buffer = "P1";
    expect(previewRelocateListId(multi)).toBe("TOWER_1");

    const splat = idlePreviewArea();
    beginPreviewBufferEntry(splat, "*L8", 1);
    expect(previewTrackingSlew(splat)).toBeNull();
    expect(previewRelocateListId(splat)).toBeNull();
    beginPreviewBufferEntry(splat, "*P", 2);
    expect(previewRelocateListId(splat)).toBeNull();
    expect(previewTrackingSlew(splat)).toBeNull();
  });

  it("keeps F7 modifier, Help/native focus, Backspace, restart, and cancel ownership", () => {
    const view = createScopeView();
    expect(press(view, "F7", "scope", { ctrlKey: true })).toBe(true);
    const menuAfterCtrl = view.dcbMenu;
    expect(press(view, "F7", "scope", { shiftKey: true })).toBe(false);
    expect(view.dcbMenu).toBe(menuAfterCtrl);
    expect(
      handleScopeKeyDown(
        key("F7", { target: { tagName: "INPUT" } as unknown as EventTarget }),
        view,
        "scope",
      ),
    ).toBe(false);
    view.helpOpen = true;
    expect(
      handleScopeKeyDown(key("Escape"), view, "scope", undefined, 100, {
        helpOverlayHasFocus: true,
      }),
    ).toBe(true);
    expect(view.helpOpen).toBe(false);

    press(view, "F7");
    press(view, "T");
    press(view, "Backspace");
    expect(view.preview).toMatchObject({ phase: "entry", buffer: "", entryOrigin: "multiFunc" });
    press(view, "F7");
    expect(view.preview).toMatchObject({ phase: "entry", buffer: "", entryOrigin: "multiFunc" });
    press(view, "Escape");
    expect(view.preview).toMatchObject({ phase: "idle", entryOrigin: null });

    const multiHelp = HELP_COMMAND_GROUPS.flatMap((group) => group.entries).find(
      (entry) => entry.id === "multi",
    );
    expect(multiHelp?.command).toBe("F7 <MULTI FUNC>");
    expect(multiHelp?.example).not.toContain("*");
    expect(bindingById("multi-func")?.action).not.toContain("*");
    expect(bindingById("stars-tpa-atpa")?.windowsKeys).toContain("Multiply");
  });
});
