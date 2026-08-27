import { expect, test } from "vitest";
import { CHORD_TIMEOUT_MS } from "./keymap";
import {
  cancelPreviewArea,
  expirePreviewArea,
  formatPreviewReadout,
  handlePreviewEscape,
  idlePreviewArea,
  parsePreviewCommand,
  previewAreaIsLive,
  rejectPreviewArea,
  type PreviewAreaState,
  type PreviewCommandResult,
} from "./previewArea";

function injectEntry(overrides: Partial<PreviewAreaState> = {}): PreviewAreaState {
  const state = idlePreviewArea();
  state.phase = "entry";
  state.lastKeyAtMs = 0;
  Object.assign(state, overrides);
  return state;
}

test("idle / entry / armed helpers and live check", () => {
  const idle = idlePreviewArea();
  expect(idle.phase).toBe("idle");
  expect(idle.buffer).toBe("");
  expect(idle.mnemonic).toBe("");
  expect(idle.flid).toBeNull();
  expect(idle.lastKeyAtMs).toBe(0);
  expect(idle.rejection).toBeNull();
  expect(idle.armed).toBeNull();
  expect(previewAreaIsLive(idle)).toBe(false);

  const entry = injectEntry({ buffer: "B", mnemonic: "" });
  expect(entry.phase).toBe("entry");
  expect(previewAreaIsLive(entry)).toBe(true);

  const armed = injectEntry({
    phase: "armed",
    mnemonic: "INIT CNTL",
    armed: { type: "initCntl" },
  });
  expect(armed.phase).toBe("armed");
  expect(previewAreaIsLive(armed)).toBe(true);
  expect(armed.armed).toEqual({ type: "initCntl" });
});

test("parsePreviewCommand: empty and live prefix are incomplete; unknown is invalid", () => {
  expect(parsePreviewCommand("")).toEqual({ kind: "incomplete" } satisfies PreviewCommandResult);
  expect(parsePreviewCommand("B")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("Q")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("HELLO")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("TERM CNTL ALL")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("BE")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("F3")).toMatchObject({ kind: "invalid" });
});

test("unknown complete input is invalid, not a silent no-op or action", () => {
  const unknown = parsePreviewCommand("Q");
  expect(unknown.kind).toBe("invalid");
  expect(unknown).not.toEqual({ kind: "incomplete" });
  expect(unknown).not.toMatchObject({ kind: "action" });
});

test("Esc cancel clears live entry and armed to idle", () => {
  const entry = injectEntry({ buffer: "B", mnemonic: "INIT CNTL", flid: "DAL123" });
  expect(handlePreviewEscape(entry)).toBe(true);
  expect(entry.phase).toBe("idle");
  expect(entry.buffer).toBe("");
  expect(entry.mnemonic).toBe("");
  expect(entry.flid).toBeNull();
  expect(entry.armed).toBeNull();
  expect(entry.rejection).toBeNull();
  expect(formatPreviewReadout(entry)).toBeNull();

  const armed = injectEntry({
    phase: "armed",
    mnemonic: "TERM CNTL",
    armed: { type: "termCntl" },
  });
  expect(handlePreviewEscape(armed)).toBe(true);
  expect(armed.phase).toBe("idle");
  expect(armed.armed).toBeNull();
  expect(armed.mnemonic).toBe("");

  const idle = idlePreviewArea();
  expect(handlePreviewEscape(idle)).toBe(false);
  expect(idle.phase).toBe("idle");
});

test("INV flash uses buffer + INV and auto-clears on the chord timeout", () => {
  const state = injectEntry({ buffer: "Q" });
  rejectPreviewArea(state, 200);
  expect(state.phase).toBe("idle");
  expect(state.buffer).toBe("");
  expect(state.rejection).toBe("Q INV");
  expect(formatPreviewReadout(state)).toBe("Q INV");
  expect(expirePreviewArea(state, 200 + CHORD_TIMEOUT_MS - 1)).toBe(false);
  expect(state.rejection).toBe("Q INV");
  expect(expirePreviewArea(state, 200 + CHORD_TIMEOUT_MS)).toBe(true);
  expect(state.rejection).toBeNull();
  expect(formatPreviewReadout(state)).toBeNull();
});

test("live entry and armed do not expire; cancel is explicit", () => {
  const entry = injectEntry({ buffer: "B", lastKeyAtMs: 0 });
  expect(expirePreviewArea(entry, CHORD_TIMEOUT_MS * 10)).toBe(false);
  expect(entry.phase).toBe("entry");
  expect(entry.buffer).toBe("B");
  cancelPreviewArea(entry);
  expect(entry.phase).toBe("idle");

  const armed = injectEntry({
    phase: "armed",
    mnemonic: "INIT CNTL",
    lastKeyAtMs: 0,
    armed: { type: "initCntl" },
  });
  expect(expirePreviewArea(armed, CHORD_TIMEOUT_MS * 10)).toBe(false);
  expect(armed.phase).toBe("armed");
});

test("format readout paints INIT CNTL, never the literal F3", () => {
  const entry = injectEntry({ mnemonic: "INIT CNTL" });
  expect(formatPreviewReadout(entry)).toBe("INIT CNTL");
  expect(formatPreviewReadout(entry)).not.toBe("F3");

  const withFlid = injectEntry({
    phase: "armed",
    mnemonic: "INIT CNTL",
    flid: "DAL123",
    armed: { type: "initCntl" },
  });
  expect(formatPreviewReadout(withFlid)).toBe("INIT CNTL DAL123");
  expect(formatPreviewReadout(withFlid)).not.toMatch(/F3/);

  const term = injectEntry({ mnemonic: "TERM CNTL" });
  expect(formatPreviewReadout(term)).toBe("TERM CNTL");
  expect(formatPreviewReadout(term)).not.toBe("F4");
});

test("AC8 — module cites R07 Preview Area + Command Reference, display-only, T02-52/53", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./previewArea.ts"] ?? "";
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/Preview Area/);
  expect(src).toMatch(/Command Reference/);
  expect(src).toMatch(/display-only/i);
  expect(src).toMatch(/not the[\s*]+radio command line/i);
  expect(src).toMatch(/T02-52/);
  expect(src).toMatch(/T02-53/);
  expect(src).toMatch(/INIT CNTL/);
  expect(src).toMatch(/TERM CNTL/);
  expect(src).not.toMatch(/FLY_HEADING/);
  expect(src).not.toMatch(/from "@parse"/);
  expect(src).not.toMatch(/from "@pilot"/);
  expect(src).toMatch(/window\.prompt/);
  expect(src).toMatch(/<input>/);
});
