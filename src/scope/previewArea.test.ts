import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { CHORD_TIMEOUT_MS } from "./keymap";
import {
  armPreviewCntl,
  cancelPreviewArea,
  expirePreviewArea,
  formatPreviewReadout,
  handlePreviewEscape,
  handlePreviewFlidKey,
  idlePreviewArea,
  parsePreviewCommand,
  previewAreaIsLive,
  previewCntlArmed,
  previewFlidMatchesSlew,
  rejectPreviewArea,
  rejectPreviewCntl,
  resolveScopeFlid,
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

test("INIT/TERM arm via F-key helpers, not typed F3/F4 in parsePreviewCommand", () => {
  expect(parsePreviewCommand("F3")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("F4")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("INIT CNTL")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("TERM CNTL ALL")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("B")).toEqual({ kind: "incomplete" });

  const init = idlePreviewArea();
  armPreviewCntl(init, "initCntl", 10);
  expect(previewCntlArmed(init)).toBe(true);
  expect(init.phase).toBe("armed");
  expect(init.mnemonic).toBe("INIT CNTL");
  expect(init.armed).toEqual({ type: "initCntl" });
  expect(formatPreviewReadout(init)).toBe("INIT CNTL");
  expect(formatPreviewReadout(init)).not.toBe("F3");

  const term = idlePreviewArea();
  armPreviewCntl(term, "termCntl", 10);
  expect(term.mnemonic).toBe("TERM CNTL");
  expect(term.armed).toEqual({ type: "termCntl" });
  expect(formatPreviewReadout(term)).toBe("TERM CNTL");
  expect(formatPreviewReadout(term)).not.toBe("F4");
});

test("resolveScopeFlid: full callsign, numeric tail, unique squawk; unknown/ambiguous INV", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", squawk: "4521" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL123", squawk: "1200" });
  const jbu = makeTestAircraft({ id: "ac-jbu", callsign: "JBU99", squawk: "4521" });
  const world = createWorld({ aircraft: [dal] });

  expect(resolveScopeFlid("DAL123", world)).toEqual({ ok: true, aircraftId: "ac-dal" });
  expect(resolveScopeFlid("123", world)).toEqual({ ok: true, aircraftId: "ac-dal" });
  expect(resolveScopeFlid("4521", world)).toEqual({ ok: true, aircraftId: "ac-dal" });
  expect(resolveScopeFlid("ZZZ9", world)).toEqual({ ok: false, reason: "unknown" });
  expect(resolveScopeFlid("ALL", world)).toEqual({ ok: false, reason: "unknown" });

  const twoTails = createWorld({ aircraft: [dal, aal] });
  expect(resolveScopeFlid("123", twoTails)).toEqual({ ok: false, reason: "ambiguous" });
  expect(resolveScopeFlid("DAL123", twoTails)).toEqual({ ok: true, aircraftId: "ac-dal" });

  const tailVsSquawk = createWorld({
    aircraft: [
      makeTestAircraft({ id: "ac-tail", callsign: "DAL4521" }),
      makeTestAircraft({ id: "ac-sq", callsign: "SWA1", squawk: "4521" }),
    ],
  });
  expect(resolveScopeFlid("4521", tailVsSquawk)).toEqual({ ok: false, reason: "ambiguous" });

  const twoSquawks = createWorld({ aircraft: [dal, jbu] });
  expect(resolveScopeFlid("4521", twoSquawks)).toEqual({ ok: false, reason: "ambiguous" });
});

test("FLID typing, Backspace, Enter apply, unknown INV, Esc cancel", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const state = idlePreviewArea();
  armPreviewCntl(state, "initCntl", 0);

  expect(handlePreviewFlidKey(state, "d", 1, world)).toEqual({ consumed: true });
  expect(handlePreviewFlidKey(state, "A", 2, world)).toEqual({ consumed: true });
  expect(handlePreviewFlidKey(state, "L", 3, world)).toEqual({ consumed: true });
  expect(state.flid).toBe("DAL");
  expect(formatPreviewReadout(state)).toBe("INIT CNTL DAL");

  expect(handlePreviewFlidKey(state, "Backspace", 4, world)).toEqual({ consumed: true });
  expect(state.flid).toBe("DA");
  expect(handlePreviewFlidKey(state, "L", 5, world)).toEqual({ consumed: true });
  expect(handlePreviewFlidKey(state, "1", 6, world)).toEqual({ consumed: true });
  expect(handlePreviewFlidKey(state, "2", 7, world)).toEqual({ consumed: true });
  expect(handlePreviewFlidKey(state, "3", 8, world)).toEqual({ consumed: true });
  expect(state.flid).toBe("DAL123");

  const applied = handlePreviewFlidKey(state, "Enter", 9, world);
  expect(applied).toEqual({
    consumed: true,
    apply: { type: "initCntl", aircraftId: "ac-dal" },
  });
  expect(state.phase).toBe("idle");
  expect(state.armed).toBeNull();

  const unknown = idlePreviewArea();
  armPreviewCntl(unknown, "initCntl", 0);
  for (const ch of ["X", "Y", "Z", "9"]) {
    handlePreviewFlidKey(unknown, ch, 1, world);
  }
  expect(handlePreviewFlidKey(unknown, "Enter", 2, world)).toEqual({ consumed: true });
  expect(unknown.phase).toBe("idle");
  expect(unknown.rejection).toBe("INIT CNTL XYZ9 INV");

  const armed = idlePreviewArea();
  armPreviewCntl(armed, "termCntl", 0);
  handlePreviewFlidKey(armed, "D", 1, world);
  expect(handlePreviewEscape(armed)).toBe(true);
  expect(armed.phase).toBe("idle");
  expect(armed.flid).toBeNull();
});

test("TERM CNTL ALL is invalid INV, not drop-all; empty Enter stays armed", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const state = idlePreviewArea();
  armPreviewCntl(state, "termCntl", 0);
  expect(handlePreviewFlidKey(state, "Enter", 1, world)).toEqual({ consumed: true });
  expect(state.phase).toBe("armed");
  expect(state.armed).toEqual({ type: "termCntl" });

  for (const ch of ["A", "L", "L"]) {
    handlePreviewFlidKey(state, ch, 2, world);
  }
  expect(state.flid).toBe("ALL");
  expect(handlePreviewFlidKey(state, "Enter", 3, world)).toEqual({ consumed: true });
  expect(state.phase).toBe("idle");
  expect(state.rejection).toBe("TERM CNTL ALL INV");
  expect(formatPreviewReadout(state)).toBe("TERM CNTL ALL INV");
});

test("idle preview does not steal typing; F-key armed slew FLID must uniquely match the track", () => {
  const idle = idlePreviewArea();
  expect(handlePreviewFlidKey(idle, "D", 0)).toEqual({ consumed: false });
  expect(handlePreviewFlidKey(idle, "Enter", 0)).toEqual({ consumed: false });
  expect(handlePreviewFlidKey(idle, "Backspace", 0)).toEqual({ consumed: false });

  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const state = idlePreviewArea();
  armPreviewCntl(state, "initCntl", 0);
  expect(previewFlidMatchesSlew(state, dal.id, world)).toBe(true);
  for (const ch of ["D", "A", "L", "1", "2", "3"]) {
    handlePreviewFlidKey(state, ch, 1, world);
  }
  expect(previewFlidMatchesSlew(state, dal.id, world)).toBe(true);
  expect(previewFlidMatchesSlew(state, aal.id, world)).toBe(false);

  const inv = idlePreviewArea();
  armPreviewCntl(inv, "initCntl", 0);
  rejectPreviewCntl(inv, 5);
  expect(inv.rejection).toBe("INIT CNTL INV");
});
