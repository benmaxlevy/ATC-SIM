import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { CHORD_TIMEOUT_MS } from "./keymap";
import {
  applyPreviewBeaconAction,
  armPreviewCntl,
  beginPreviewBeaconEntry,
  cancelPreviewArea,
  commitPreviewCommand,
  expirePreviewArea,
  formatPreviewReadout,
  handlePreviewBeaconKey,
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
  toggleBeaconSelectCode,
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

const BEACON_PARSE_CASES: ReadonlyArray<{
  buffer: string;
  parse: PreviewCommandResult["kind"];
  commit: PreviewCommandResult["kind"];
  action?: { type: "beaconBlock" | "beaconDiscrete"; digits: string };
}> = [
  { buffer: "B", parse: "incomplete", commit: "invalid" },
  { buffer: "B4", parse: "incomplete", commit: "invalid" },
  { buffer: "B45", parse: "action", commit: "action", action: { type: "beaconBlock", digits: "45" } },
  { buffer: "B450", parse: "incomplete", commit: "invalid" },
  {
    buffer: "B4501",
    parse: "action",
    commit: "action",
    action: { type: "beaconDiscrete", digits: "4501" },
  },
  { buffer: "B45012", parse: "invalid", commit: "invalid" },
  { buffer: "BE", parse: "invalid", commit: "invalid" },
  { buffer: "B45A", parse: "invalid", commit: "invalid" },
];

test("parsePreviewCommand table: B45 CODE BLOCK, B4501 discrete, incomplete Enter is INV", () => {
  for (const row of BEACON_PARSE_CASES) {
    const parsed = parsePreviewCommand(row.buffer);
    expect(parsed.kind, row.buffer).toBe(row.parse);
    if (row.action && parsed.kind === "action") {
      expect(parsed.action).toEqual(row.action);
    }
    const committed = commitPreviewCommand(row.buffer);
    expect(committed.kind, `commit ${row.buffer}`).toBe(row.commit);
    if (row.action && committed.kind === "action") {
      expect(committed.action).toEqual(row.action);
    }
  }
});

test("B45 / B4501 toggle twice; B4500 does not toggle 4501", () => {
  const codes: string[] = [];
  const block = parsePreviewCommand("B45");
  expect(block.kind).toBe("action");
  if (block.kind !== "action") {
    return;
  }
  expect(block.action).toEqual({ type: "beaconBlock", digits: "45" });
  expect(applyPreviewBeaconAction(codes, block.action)).toBe(true);
  expect(codes).toEqual(["45"]);
  applyPreviewBeaconAction(codes, { type: "beaconBlock", digits: "45" });
  expect(codes).toEqual([]);

  applyPreviewBeaconAction(codes, { type: "beaconDiscrete", digits: "4501" });
  expect(codes).toEqual(["4501"]);
  applyPreviewBeaconAction(codes, { type: "beaconDiscrete", digits: "4500" });
  expect(codes).toEqual(["4501", "4500"]);
  applyPreviewBeaconAction(codes, { type: "beaconDiscrete", digits: "4501" });
  expect(codes).toEqual(["4500"]);
});

test("toggleBeaconSelectCode add-if-absent remove-if-present; block and discrete coexist", () => {
  const codes: string[] = [];
  toggleBeaconSelectCode(codes, "45");
  toggleBeaconSelectCode(codes, "4501");
  expect(codes).toEqual(["45", "4501"]);
  toggleBeaconSelectCode(codes, "45");
  expect(codes).toEqual(["4501"]);
});

test("Enter with 0/1/3 digits is INV; two digits wait; four digits auto-commit", () => {
  const state = idlePreviewArea();
  beginPreviewBeaconEntry(state, 0);
  expect(handlePreviewBeaconKey(state, "Enter", 1).action).toBeNull();
  expect(state.rejection).toBe("B INV");

  beginPreviewBeaconEntry(state, 2);
  expect(handlePreviewBeaconKey(state, "4", 3).action).toBeNull();
  expect(state.phase).toBe("entry");
  expect(handlePreviewBeaconKey(state, "Enter", 4).action).toBeNull();
  expect(state.rejection).toBe("B4 INV");

  beginPreviewBeaconEntry(state, 5);
  handlePreviewBeaconKey(state, "4", 6);
  handlePreviewBeaconKey(state, "5", 7);
  expect(state.buffer).toBe("B45");
  expect(state.phase).toBe("entry");
  const block = handlePreviewBeaconKey(state, "Enter", 8);
  expect(block.action).toEqual({ type: "beaconBlock", digits: "45" });
  expect(state.phase).toBe("idle");

  beginPreviewBeaconEntry(state, 9);
  handlePreviewBeaconKey(state, "4", 10);
  handlePreviewBeaconKey(state, "5", 11);
  handlePreviewBeaconKey(state, "0", 12);
  expect(state.buffer).toBe("B450");
  expect(handlePreviewBeaconKey(state, "Enter", 13).action).toBeNull();
  expect(state.rejection).toBe("B450 INV");

  beginPreviewBeaconEntry(state, 14);
  handlePreviewBeaconKey(state, "4", 15);
  handlePreviewBeaconKey(state, "5", 16);
  handlePreviewBeaconKey(state, "0", 17);
  const discrete = handlePreviewBeaconKey(state, "1", 18);
  expect(discrete.action).toEqual({ type: "beaconDiscrete", digits: "4501" });
  expect(state.phase).toBe("idle");
});

test("non-digit after B is INV, not parse-and-no-op", () => {
  const state = idlePreviewArea();
  beginPreviewBeaconEntry(state, 0);
  const outcome = handlePreviewBeaconKey(state, "E", 1);
  expect(outcome.consumed).toBe(true);
  expect(outcome.action).toBeNull();
  expect(state.phase).toBe("idle");
  expect(state.rejection).toBe("BE INV");
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
  expect(src).toMatch(/Table 30/);
  expect(src).toMatch(/display-only/i);
  expect(src).toMatch(/not the[\s*]+radio command line/i);
  expect(src).toMatch(/B##/);
  expect(src).toMatch(/B####/);
  expect(src).toMatch(/BE/);
  expect(src).toMatch(/BI/);
  expect(src).toMatch(/M ####/);
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
