import { expect, test } from "vitest";
import {
  KEY_BINDINGS,
  SCOPE_CHORD_WINDOW_MS,
  beginScopeChord,
  bindingById,
  isScopeChordLive,
} from "../keymap";

const REQUIRED_BINDING_IDS = [
  "range-in",
  "range-out",
  "center-airport",
  "center-click",
  "help",
  "initiate-track",
  "drop-track",
  "ptl",
  "history",
  "cycle-focus",
  "mouse-range",
  "mouse-pan",
  "mouse-select",
  "mouse-accept-handoff",
  "mouse-deselect",
  "mouse-center",
  "mouse-place-cntr",
  "mouse-place-rr",
  "leader",
  "datablock",
  "mode-c",
  "altitude-filter",
  "history-scope",
  "tower-handoff",
  "radio-focus",
  "stars-tpa-atpa",
] as const;

test("chord is live until 1.5 s, then expired", () => {
  const chord = beginScopeChord("L", 1000, "L_");
  expect(isScopeChordLive(chord, 1000 + SCOPE_CHORD_WINDOW_MS)).toBe(true);
  expect(isScopeChordLive(chord, 1000 + SCOPE_CHORD_WINDOW_MS + 1)).toBe(false);
});

test("KEY_BINDINGS cover the frozen Windows subset", () => {
  const ids = KEY_BINDINGS.map((b) => b.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of REQUIRED_BINDING_IDS) {
    expect(ids).toContain(id);
  }
  expect(ids).toHaveLength(REQUIRED_BINDING_IDS.length);
  expect(bindingById("range-in")?.windowsKeys).toBe("PageUp");
  expect(bindingById("initiate-track")?.focus).toBe("always");
  expect(bindingById("leader")?.focus).toBe("scope");
});
