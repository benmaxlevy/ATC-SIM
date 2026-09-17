import { describe, expect, it } from "vitest";
import { createScopeView } from "../../scopeView";
import { handleScopeKeyDown, type ScopeKeyEvent } from "../../scopeKeys";
import {
  armDcbSpinner,
  backspaceDcbSpinner,
  cancelDcbSpinner,
  commitDcbSpinner,
  idleDcbSpinner,
  idleDcbSpinnerState,
  inputDcbSpinnerKey,
  stepDcbSpinner,
  validateDcbSpinnerValue,
} from "../dcbMenu";
import { LEADER_LENGTH_STEPS_PX } from "../../leader";

interface MockScopeKeyEvent extends ScopeKeyEvent {
  readonly defaultPrevented: boolean;
  readonly propagationStopped: boolean;
}

function makeKeyEvent(
  key: string,
  code?: string,
  extra?: Partial<ScopeKeyEvent>,
): MockScopeKeyEvent {
  let defaultPrevented = false;
  let propagationStopped = false;
  return {
    key,
    code: code ?? key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault() {
      defaultPrevented = true;
    },
    stopPropagation() {
      propagationStopped = true;
    },
    get defaultPrevented() {
      return defaultPrevented;
    },
    get propagationStopped() {
      return propagationStopped;
    },
    ...extra,
  };
}

describe("T02-200: DCB spinner numeric keyboard entry state & validation", () => {
  it("idleDcbSpinner and idleDcbSpinnerState return correct initial state", () => {
    const s1 = idleDcbSpinner();
    expect(s1).toEqual({ armed: false, cell: null, buffer: "", initialValue: null });
    const s2 = idleDcbSpinnerState();
    expect(s2).toEqual({ armed: false, cell: null, buffer: "", initialValue: null });
  });

  it("armDcbSpinner captures initialValue and clears buffer for RANGE", () => {
    const view = createScopeView();
    view.camera.rangeNm = 40;
    armDcbSpinner(view, "RANGE");
    expect(view.dcbSpinner.armed).toBe(true);
    expect(view.dcbSpinner.cell).toBe("RANGE");
    expect(view.dcbSpinner.initialValue).toBe(40);
    expect(view.dcbSpinner.buffer).toBe("");
  });

  it("buffers digits and edits buffer with backspace", () => {
    const view = createScopeView();
    armDcbSpinner(view, "RANGE");

    expect(inputDcbSpinnerKey(view, "1")).toBe(true);
    expect(inputDcbSpinnerKey(view, "2")).toBe(true);
    expect(inputDcbSpinnerKey(view, "0")).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("120");

    expect(backspaceDcbSpinner(view)).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("12");

    expect(backspaceDcbSpinner(view)).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("1");

    expect(backspaceDcbSpinner(view)).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("");

    // Backspace on empty buffer is a no-op
    expect(backspaceDcbSpinner(view)).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("");
  });

  it("RANGE: validates integer between 6 and 512, applies on Enter", () => {
    const view = createScopeView();
    view.camera.rangeNm = 20;

    // Valid entry: 120
    armDcbSpinner(view, "RANGE");
    inputDcbSpinnerKey(view, "1");
    inputDcbSpinnerKey(view, "2");
    inputDcbSpinnerKey(view, "0");
    const commitOk = commitDcbSpinner(view);
    expect(commitOk).toBe(true);
    expect(view.camera.rangeNm).toBe(120);
    expect(view.dcbSpinner.armed).toBe(false);
    expect(view.dcbSpinner.cell).toBe(null);
    expect(view.dcbSpinner.buffer).toBe("");

    // Valid boundary: 6
    armDcbSpinner(view, "RANGE");
    inputDcbSpinnerKey(view, "6");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.camera.rangeNm).toBe(6);

    // Valid boundary: 512
    armDcbSpinner(view, "RANGE");
    inputDcbSpinnerKey(view, "5");
    inputDcbSpinnerKey(view, "1");
    inputDcbSpinnerKey(view, "2");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.camera.rangeNm).toBe(512);

    // Invalid: 5 (< 6) -> reverts without mutation
    armDcbSpinner(view, "RANGE");
    inputDcbSpinnerKey(view, "5");
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.camera.rangeNm).toBe(512);
    expect(view.dcbSpinner.armed).toBe(false);

    // Invalid: 513 (> 512) -> reverts without mutation
    armDcbSpinner(view, "RANGE");
    inputDcbSpinnerKey(view, "5");
    inputDcbSpinnerKey(view, "1");
    inputDcbSpinnerKey(view, "3");
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.camera.rangeNm).toBe(512);
    expect(view.dcbSpinner.armed).toBe(false);
  });

  it("RR: validates {2, 5, 10, 20} range ring spacing", () => {
    const view = createScopeView();
    view.ringIntervalNm = 5;

    // Valid: 10
    armDcbSpinner(view, "RR");
    expect(view.dcbSpinner.initialValue).toBe(5);
    inputDcbSpinnerKey(view, "1");
    inputDcbSpinnerKey(view, "0");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.ringIntervalNm).toBe(10);
    expect(view.showRings).toBe(true);

    // Valid: 20
    armDcbSpinner(view, "RR");
    inputDcbSpinnerKey(view, "2");
    inputDcbSpinnerKey(view, "0");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.ringIntervalNm).toBe(20);

    // Invalid: 15 -> reverts without mutation
    armDcbSpinner(view, "RR");
    inputDcbSpinnerKey(view, "1");
    inputDcbSpinnerKey(view, "5");
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.ringIntervalNm).toBe(20);
    expect(view.dcbSpinner.armed).toBe(false);
  });

  it("LDR_LEN / LDR_LENGTH: validates 0 to 7 leader line length", () => {
    const view = createScopeView();
    // Default leader length is step 3 (36 px)
    expect(view.leaderLengthPx).toBe(36);

    armDcbSpinner(view, "LDR_LEN");
    expect(view.dcbSpinner.initialValue).toBe(3);
    inputDcbSpinnerKey(view, "5");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.leaderLengthPx).toBe(LEADER_LENGTH_STEPS_PX[5]); // 60 px

    // Step 0
    armDcbSpinner(view, "LDR_LENGTH");
    inputDcbSpinnerKey(view, "0");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.leaderLengthPx).toBe(LEADER_LENGTH_STEPS_PX[0]); // 0 px

    // Invalid: 8 (> 7) -> reverts
    armDcbSpinner(view, "LDR_LEN");
    inputDcbSpinnerKey(view, "8");
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.leaderLengthPx).toBe(LEADER_LENGTH_STEPS_PX[0]);
  });

  it("PTL: validates 0.0 to 5.0 in 0.5 increments with decimal buffering", () => {
    const view = createScopeView();
    view.ptlMinutes = 1.0;

    armDcbSpinner(view, "PTL");
    expect(view.dcbSpinner.initialValue).toBe(1.0);

    // Type 2.5
    inputDcbSpinnerKey(view, "2");
    inputDcbSpinnerKey(view, ".");
    inputDcbSpinnerKey(view, "5");
    expect(view.dcbSpinner.buffer).toBe("2.5");

    // Multiple decimal points are rejected
    inputDcbSpinnerKey(view, ".");
    expect(view.dcbSpinner.buffer).toBe("2.5");

    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.ptlMinutes).toBe(2.5);

    // Valid: 0.5
    armDcbSpinner(view, "PTL");
    inputDcbSpinnerKey(view, "0");
    inputDcbSpinnerKey(view, ".");
    inputDcbSpinnerKey(view, "5");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.ptlMinutes).toBe(0.5);

    // Invalid: 2.3 (not a 0.5 step) -> reverts
    armDcbSpinner(view, "PTL");
    inputDcbSpinnerKey(view, "2");
    inputDcbSpinnerKey(view, ".");
    inputDcbSpinnerKey(view, "3");
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.ptlMinutes).toBe(0.5);

    // Invalid: 5.5 (> 5.0) -> reverts
    armDcbSpinner(view, "PTL");
    inputDcbSpinnerKey(view, "5");
    inputDcbSpinnerKey(view, ".");
    inputDcbSpinnerKey(view, "5");
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.ptlMinutes).toBe(0.5);
  });

  it("supports VOL, CSR_SPD, and HISTORY spinners", () => {
    const view = createScopeView();

    // VOL 0-7
    armDcbSpinner(view, "VOL");
    inputDcbSpinnerKey(view, "4");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.vol).toBe(4);

    armDcbSpinner(view, "VOL");
    inputDcbSpinnerKey(view, "9"); // invalid > 7
    expect(commitDcbSpinner(view)).toBe(false);
    expect(view.vol).toBe(4);

    // CSR_SPD 1-5
    armDcbSpinner(view, "CSR_SPD");
    inputDcbSpinnerKey(view, "3");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.cursorSpeed).toBe(3);

    // HISTORY 0-9
    armDcbSpinner(view, "HISTORY");
    inputDcbSpinnerKey(view, "7");
    expect(commitDcbSpinner(view)).toBe(true);
    expect(view.historyDotCount).toBe(7);
  });

  it("cancelDcbSpinner restores initialValue and disarms", () => {
    const view = createScopeView();
    view.camera.rangeNm = 50;

    armDcbSpinner(view, "RANGE");
    inputDcbSpinnerKey(view, "8");
    inputDcbSpinnerKey(view, "0");
    expect(view.dcbSpinner.buffer).toBe("80");

    expect(cancelDcbSpinner(view)).toBe(true);
    expect(view.camera.rangeNm).toBe(50);
    expect(view.dcbSpinner.armed).toBe(false);
    expect(view.dcbSpinner.cell).toBe(null);
    expect(view.dcbSpinner.buffer).toBe("");
    expect(view.dcbSpinner.initialValue).toBe(null);
  });

  it("stepDcbSpinner mouse wheel syncs buffer and updates initialValue", () => {
    const view = createScopeView();
    view.camera.rangeNm = 20;

    armDcbSpinner(view, "RANGE");
    expect(view.dcbSpinner.initialValue).toBe(20);

    stepDcbSpinner(view, 1, () => {
      view.camera.rangeNm = 30;
    });
    expect(view.dcbSpinner.buffer).toBe("30");
    expect(view.dcbSpinner.initialValue).toBe(30);

    // Cancel after stepping preserves stepped value as initialValue
    cancelDcbSpinner(view);
    expect(view.camera.rangeNm).toBe(30);
    expect(view.dcbSpinner.armed).toBe(false);
  });
});

describe("T02-200: Scope keyboard routing (handleScopeKeyDown)", () => {
  it("intercepts digits and Enter while armed, applying value and blocking preview buffer", () => {
    const view = createScopeView();
    view.camera.rangeNm = 20;

    armDcbSpinner(view, "RANGE");

    const e1 = makeKeyEvent("1");
    expect(handleScopeKeyDown(e1, view, "scope")).toBe(true);
    expect(e1.defaultPrevented).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("1");
    // Preview area was not touched
    expect(view.preview.phase).toBe("idle");

    const e2 = makeKeyEvent("0");
    expect(handleScopeKeyDown(e2, view, "scope")).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("10");

    const e3 = makeKeyEvent("0");
    expect(handleScopeKeyDown(e3, view, "scope")).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("100");

    const enter = makeKeyEvent("Enter");
    expect(handleScopeKeyDown(enter, view, "scope")).toBe(true);
    expect(enter.defaultPrevented).toBe(true);
    expect(view.camera.rangeNm).toBe(100);
    expect(view.dcbSpinner.armed).toBe(false);
    expect(view.preview.phase).toBe("idle");
  });

  it("intercepts digits and Enter even when radio input has focus", () => {
    const view = createScopeView();
    view.camera.rangeNm = 30;

    armDcbSpinner(view, "RANGE");

    // Type with radio focus
    const e1 = makeKeyEvent("6");
    const e2 = makeKeyEvent("0");
    const enter = makeKeyEvent("Enter");

    expect(handleScopeKeyDown(e1, view, "radio")).toBe(true);
    expect(e1.defaultPrevented).toBe(true);
    expect(handleScopeKeyDown(e2, view, "radio")).toBe(true);
    expect(handleScopeKeyDown(enter, view, "radio")).toBe(true);

    expect(view.camera.rangeNm).toBe(60);
    expect(view.dcbSpinner.armed).toBe(false);
  });

  it("handles Numpad keys (digits, decimal, Enter)", () => {
    const view = createScopeView();
    view.ptlMinutes = 1.0;

    armDcbSpinner(view, "PTL");

    const numpad3 = makeKeyEvent("3", "Numpad3");
    expect(handleScopeKeyDown(numpad3, view, "scope")).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("3");

    const numpadDec = makeKeyEvent(".", "NumpadDecimal");
    expect(handleScopeKeyDown(numpadDec, view, "scope")).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("3.");

    const numpad5 = makeKeyEvent("5", "Numpad5");
    expect(handleScopeKeyDown(numpad5, view, "scope")).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("3.5");

    const numpadEnter = makeKeyEvent("Enter", "NumpadEnter");
    expect(handleScopeKeyDown(numpadEnter, view, "scope")).toBe(true);
    expect(view.ptlMinutes).toBe(3.5);
    expect(view.dcbSpinner.armed).toBe(false);
  });

  it("intercepts Backspace and deletes buffered characters", () => {
    const view = createScopeView();
    armDcbSpinner(view, "RANGE");

    handleScopeKeyDown(makeKeyEvent("4"), view, "scope");
    handleScopeKeyDown(makeKeyEvent("0"), view, "scope");
    expect(view.dcbSpinner.buffer).toBe("40");

    const bs = makeKeyEvent("Backspace");
    expect(handleScopeKeyDown(bs, view, "scope")).toBe(true);
    expect(bs.defaultPrevented).toBe(true);
    expect(view.dcbSpinner.buffer).toBe("4");
  });

  it("intercepts Escape and Clear, restoring initialValue", () => {
    const view = createScopeView();
    view.camera.rangeNm = 30;

    armDcbSpinner(view, "RANGE");
    handleScopeKeyDown(makeKeyEvent("8"), view, "scope");
    handleScopeKeyDown(makeKeyEvent("0"), view, "scope");
    expect(view.dcbSpinner.buffer).toBe("80");

    const esc = makeKeyEvent("Escape");
    expect(handleScopeKeyDown(esc, view, "scope")).toBe(true);
    expect(esc.defaultPrevented).toBe(true);
    expect(view.camera.rangeNm).toBe(30);
    expect(view.dcbSpinner.armed).toBe(false);

    // Test Clear key
    armDcbSpinner(view, "RANGE");
    handleScopeKeyDown(makeKeyEvent("9"), view, "scope");
    const clr = makeKeyEvent("Clear");
    expect(handleScopeKeyDown(clr, view, "scope")).toBe(true);
    expect(view.camera.rangeNm).toBe(30);
    expect(view.dcbSpinner.armed).toBe(false);
  });

  it("does not corrupt buffer on modifiers or unhandled letter keys", () => {
    const view = createScopeView();
    armDcbSpinner(view, "RANGE");

    handleScopeKeyDown(makeKeyEvent("5"), view, "scope");
    expect(view.dcbSpinner.buffer).toBe("5");

    // Ctrl+F1 or letter keys do not append to buffer
    handleScopeKeyDown(makeKeyEvent("F1", "F1", { ctrlKey: true }), view, "scope");
    expect(view.dcbSpinner.buffer).toBe("5");

    // Non-digit letter key
    handleScopeKeyDown(makeKeyEvent("a"), view, "scope");
    expect(view.dcbSpinner.buffer).toBe("5");
  });

  it("validateDcbSpinnerValue validates cells according to rules", () => {
    expect(validateDcbSpinnerValue("RANGE", 6)).toBe(true);
    expect(validateDcbSpinnerValue("RANGE", 512)).toBe(true);
    expect(validateDcbSpinnerValue("RANGE", 5)).toBe(false);
    expect(validateDcbSpinnerValue("RANGE", 513)).toBe(false);
    expect(validateDcbSpinnerValue("RANGE", 20.5)).toBe(false);

    expect(validateDcbSpinnerValue("RR", 2)).toBe(true);
    expect(validateDcbSpinnerValue("RR", 5)).toBe(true);
    expect(validateDcbSpinnerValue("RR", 10)).toBe(true);
    expect(validateDcbSpinnerValue("RR", 20)).toBe(true);
    expect(validateDcbSpinnerValue("RR", 15)).toBe(false);

    expect(validateDcbSpinnerValue("LDR_LEN", 0)).toBe(true);
    expect(validateDcbSpinnerValue("LDR_LEN", 7)).toBe(true);
    expect(validateDcbSpinnerValue("LDR_LEN", 8)).toBe(false);
    expect(validateDcbSpinnerValue("LDR_LEN", -1)).toBe(false);

    expect(validateDcbSpinnerValue("PTL", 0)).toBe(true);
    expect(validateDcbSpinnerValue("PTL", 2.5)).toBe(true);
    expect(validateDcbSpinnerValue("PTL", 5.0)).toBe(true);
    expect(validateDcbSpinnerValue("PTL", 2.3)).toBe(false);
    expect(validateDcbSpinnerValue("PTL", 5.5)).toBe(false);

    expect(validateDcbSpinnerValue("VOL", 0)).toBe(true);
    expect(validateDcbSpinnerValue("VOL", 7)).toBe(true);
    expect(validateDcbSpinnerValue("VOL", 8)).toBe(false);

    expect(validateDcbSpinnerValue("CSR_SPD", 1)).toBe(true);
    expect(validateDcbSpinnerValue("CSR_SPD", 5)).toBe(true);
    expect(validateDcbSpinnerValue("CSR_SPD", 0)).toBe(false);
    expect(validateDcbSpinnerValue("CSR_SPD", 6)).toBe(false);

    expect(validateDcbSpinnerValue("HISTORY", 0)).toBe(true);
    expect(validateDcbSpinnerValue("HISTORY", 9)).toBe(true);
    expect(validateDcbSpinnerValue("HISTORY", 10)).toBe(false);

    expect(validateDcbSpinnerValue("BRITE_DCB", 0)).toBe(true);
    expect(validateDcbSpinnerValue("BRITE_DCB", 100)).toBe(true);
    expect(validateDcbSpinnerValue("BRITE_DCB", 101)).toBe(false);

    expect(validateDcbSpinnerValue("RANGE", NaN)).toBe(false);
  });
});
