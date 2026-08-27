import { expect, test } from "vitest";
import {
  CHORD_TIMEOUT_MS,
  HELP_FOOTER,
  HELP_GLOSSARY_NOTE,
  HELP_KEYS_POINTER,
  KEY_BINDINGS,
  RADIO_CONFLICT_WARNING,
  SCOPE_CHORD_WINDOW_MS,
  alwaysOnKeyBindings,
  beginScopeChord,
  bindingById,
  chordTimedOut,
  digitFromKey,
  isArrowKey,
  isCycleFocusKey,
  isFilterChordKey,
  isHelpToggleKey,
  isLeaderPrefixKey,
  isMouseBinding,
  isRadioFocusSlashKey,
  isScopeChordLive,
  isStarsChordPrefixKey,
  leaderDigitFromKey,
  mouseKeyBindings,
  scopeFocusKeyBindings,
} from "./keymap";

test("chord is live until 1.5 s, then expired (fake clock)", () => {
  const chord = beginScopeChord("L", 1000, "L_");
  expect(chord.prefix).toBe("L");
  expect(chord.hint).toBe("L_");
  expect(isScopeChordLive(chord, 1000)).toBe(true);
  expect(isScopeChordLive(chord, 1000 + SCOPE_CHORD_WINDOW_MS)).toBe(true);
  expect(isScopeChordLive(chord, 1000 + SCOPE_CHORD_WINDOW_MS + 1)).toBe(false);
  expect(isScopeChordLive(null, 1000)).toBe(false);
});

test("top-row and numpad Digit/Numpad codes yield 1–9; arrows do not", () => {
  expect(leaderDigitFromKey("6")).toBe(6);
  expect(leaderDigitFromKey("8")).toBe(8);
  expect(leaderDigitFromKey("1", "Digit1")).toBe(1);
  expect(leaderDigitFromKey("9", "Numpad9")).toBe(9);
  expect(leaderDigitFromKey("Unidentified", "Numpad5")).toBe(5);
  expect(leaderDigitFromKey("0")).toBeNull();
  expect(leaderDigitFromKey("ArrowUp")).toBeNull();
  expect(leaderDigitFromKey("ArrowUp", "Numpad8")).toBeNull();
  expect(isArrowKey("ArrowUp")).toBe(true);
  expect(isArrowKey("6")).toBe(false);
  expect(digitFromKey("0")).toBe(0);
});

test("AC8 — keymap says leader, not stem; chord window is for L (and later F)", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./keymap.ts"] ?? "";
  expect(src).toMatch(/leader/);
  expect(src).toMatch(/1\.5 s/);
  expect(src).toMatch(/no[\s\S]*leader-length menu/);
  expect(src).not.toMatch(/\bstem\b/);
});

test("L / l is the leader prefix", () => {
  expect(isLeaderPrefixKey("L")).toBe(true);
  expect(isLeaderPrefixKey("l")).toBe(true);
  expect(isLeaderPrefixKey("F")).toBe(false);
});

test("chord timer is 1.5 s; inject now rather than wall clock", () => {
  expect(CHORD_TIMEOUT_MS).toBe(1500);
  expect(chordTimedOut(0, 1499)).toBe(false);
  expect(chordTimedOut(0, 1500)).toBe(true);
  expect(chordTimedOut(1000, 2500)).toBe(true);
  expect(chordTimedOut(1000, 2499)).toBe(false);
});

test("digitFromKey accepts top-row and Numpad n; ignores arrows", () => {
  expect(digitFromKey("0")).toBe(0);
  expect(digitFromKey("9")).toBe(9);
  expect(digitFromKey("Numpad3")).toBe(3);
  expect(digitFromKey("ArrowUp")).toBeNull();
  expect(digitFromKey("F")).toBeNull();
  expect(digitFromKey("Enter")).toBeNull();
});

test("F is a scope-focus chord key, never always-on F7", () => {
  expect(isFilterChordKey("F")).toBe(true);
  expect(isFilterChordKey("f")).toBe(true);
  expect(isFilterChordKey("F7")).toBe(false);
  expect(isFilterChordKey("F3")).toBe(false);
});

test("* is a scope-focus TPA/ATPA chord prefix, never radio", () => {
  expect(isStarsChordPrefixKey("*")).toBe(true);
  expect(isStarsChordPrefixKey("Multiply")).toBe(true);
  expect(isStarsChordPrefixKey("8")).toBe(false);
  expect(isStarsChordPrefixKey("F")).toBe(false);
});

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

test("exported KEY_BINDINGS cover the frozen Windows subset (required-id list)", () => {
  const ids = KEY_BINDINGS.map((b) => b.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of REQUIRED_BINDING_IDS) {
    expect(ids, id).toContain(id);
  }
  expect(ids).toHaveLength(REQUIRED_BINDING_IDS.length);
});

test("AC3 — PageUp and F3 are always-on; leader and T are scope-focus", () => {
  expect(bindingById("range-in")?.focus).toBe("always");
  expect(bindingById("range-in")?.windowsKeys).toBe("PageUp");
  expect(bindingById("initiate-track")?.focus).toBe("always");
  expect(bindingById("initiate-track")?.windowsKeys).toBe("F3");
  expect(bindingById("leader")?.focus).toBe("scope");
  expect(bindingById("datablock")?.focus).toBe("scope");
  expect(bindingById("datablock")?.windowsKeys).toBe("T");
});

test("AC2 — bindings list PageUp/PageDown, Home, End, F3, F4, F7, F8, L1–L9, T, M, F filter, Tab", () => {
  const blob = KEY_BINDINGS.map((b) => `${b.windowsKeys} ${b.action}`).join("\n");
  expect(blob).toMatch(/PageUp/);
  expect(blob).toMatch(/PageDown/);
  expect(blob).toMatch(/Home/);
  expect(blob).toMatch(/End/);
  expect(blob).toMatch(/F3/);
  expect(blob).toMatch(/F4/);
  expect(blob).toMatch(/F7/);
  expect(blob).toMatch(/F8/);
  expect(blob).toMatch(/L then 1–9/);
  expect(blob).toMatch(/\bT\b/);
  expect(blob).toMatch(/\bM\b/);
  expect(blob).toMatch(/F then 3-digit min/);
  expect(blob).toMatch(/Tab/);
});

test("AC9 — help copy uses glossary terms and at least one CRC analog → our key row", () => {
  expect(HELP_FOOTER).toBe("TRAINER KEYS — NOT CRC");
  expect(HELP_KEYS_POINTER).toBe("F1 lists keys.");
  expect(HELP_GLOSSARY_NOTE).toMatch(/range/);
  expect(HELP_GLOSSARY_NOTE).toMatch(/datablock/);
  expect(HELP_GLOSSARY_NOTE).toMatch(/leader/);
  expect(HELP_GLOSSARY_NOTE).toMatch(/initiate track/);
  const leader = bindingById("leader")!;
  expect(leader.crcAnalog).toMatch(/CRC/);
  expect(leader.windowsKeys).toMatch(/L then 1–9/);
  expect(leader.crcAnalog).not.toEqual(leader.windowsKeys);
  const cheat = KEY_BINDINGS.map((b) => b.crcAnalog).join("\n");
  expect(cheat).not.toMatch(/beaconator cheat/i);
});

test("AC8 — radio commands stay on the command line; L090 warning is explicit", () => {
  expect(RADIO_CONFLICT_WARNING).toMatch(/Radio commands stay on the command line/);
  expect(RADIO_CONFLICT_WARNING).toMatch(/never come from scope keys/);
  expect(RADIO_CONFLICT_WARNING).toMatch(/L090/);
});

test("mouse gestures are always-on KeyBinding rows; slash is scope-focus", () => {
  expect(mouseKeyBindings().every(isMouseBinding)).toBe(true);
  expect(alwaysOnKeyBindings().some((b) => b.windowsKeys === "F1")).toBe(true);
  expect(scopeFocusKeyBindings().some((b) => b.id === "radio-focus")).toBe(true);
  expect(bindingById("radio-focus")?.windowsKeys).toBe("/");
});

test("F1 / Tab / unmodified slash classifiers match the frozen focus model", () => {
  expect(isHelpToggleKey("F1")).toBe(true);
  expect(isHelpToggleKey("F3")).toBe(false);
  expect(isCycleFocusKey("Tab")).toBe(true);
  expect(isCycleFocusKey("F1")).toBe(false);
  expect(isRadioFocusSlashKey("/")).toBe(true);
  expect(isRadioFocusSlashKey("?")).toBe(false);
});

test("T04-17 AC5 — help overlay lists click-accept inbound handoff", () => {
  const blob = KEY_BINDINGS.map((b) => `${b.windowsKeys} ${b.action}`).join("\n");
  expect(blob).toMatch(/CLICK accept inbound handoff/);
  expect(blob).toMatch(/CRC slew analog/);
  expect(bindingById("mouse-accept-handoff")?.action).toMatch(/CLICK accept inbound handoff/);
});

test("T04-20 AC5 — F1 Keymap help overlay documents Shift+H as the unified handoff shortcut for Tower/Center", () => {
  const binding = bindingById("tower-handoff");
  expect(binding).toBeDefined();
  expect(binding?.windowsKeys).toBe("Shift+H");
  expect(binding?.action).toBe(
    "Initiate handoff: Tower (if on approach) or Center (if climbing outbound)",
  );
});
