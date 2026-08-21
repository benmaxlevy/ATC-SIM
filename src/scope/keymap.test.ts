import { expect, test } from "vitest";
import {
  SCOPE_CHORD_WINDOW_MS,
  beginScopeChord,
  digitFromKey,
  isArrowKey,
  isLeaderPrefixKey,
  isScopeChordLive,
  leaderDigitFromKey,
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
