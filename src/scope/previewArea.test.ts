import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { loadKdem, loadVideoMapGroups, loadVideoMapSet } from "@scenario";
import { CHORD_TIMEOUT_MS } from "./keymap";
import {
  applyPreviewBeaconAction,
  armPreviewCntl,
  beginPreviewBeaconEntry,
  beginPreviewBufferEntry,
  cancelPreviewArea,
  commitPreviewCommand,
  expirePreviewArea,
  formatPreviewReadout,
  handlePreviewBeaconKey,
  handlePreviewBufferKey,
  handlePreviewEscape,
  handlePreviewFlidKey,
  idlePreviewArea,
  isPreviewBufferStartChar,
  parsePreviewCommand,
  parseAltitudeFilterCommand,
  parseBeaconFilterCommand,
  parseScopeDisplayCommand,
  parseTrackingSlewBuffer,
  previewAreaIsLive,
  previewTrackingSlew,
  previewBufferCharFromKey,
  previewCntlArmed,
  previewFlidMatchesSlew,
  previewRelocateListId,
  rejectPreviewArea,
  rejectPreviewCntl,
  resolveScopeFlid,
  addBeaconSelectCode,
  removeBeaconSelectCode,
  toggleBeaconSelectCode,
  type PreviewAreaState,
  type PreviewArmedAction,
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
  {
    buffer: "B45",
    parse: "action",
    commit: "action",
    action: { type: "beaconBlock", digits: "45" },
  },
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

test("T02-65 — *BCN add is idempotent; DEL removes; B45 still toggles", () => {
  const codes: string[] = [];
  expect(applyPreviewBeaconAction(codes, { type: "addBeaconCodeFilter", code: "45" })).toBe(true);
  expect(codes).toEqual(["45"]);
  applyPreviewBeaconAction(codes, { type: "addBeaconCodeFilter", code: "45" });
  expect(codes).toEqual(["45"]);
  applyPreviewBeaconAction(codes, { type: "addBeaconCodeFilter", code: "4501" });
  expect(codes).toEqual(["45", "4501"]);
  applyPreviewBeaconAction(codes, { type: "removeBeaconCodeFilter", code: "45" });
  expect(codes).toEqual(["4501"]);
  applyPreviewBeaconAction(codes, { type: "removeBeaconCodeFilter", code: "45" });
  expect(codes).toEqual(["4501"]);
  addBeaconSelectCode(codes, "1200");
  removeBeaconSelectCode(codes, "4501");
  expect(codes).toEqual(["1200"]);
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

test("T02-61 — * stays incomplete; + / Enter arm INIT/TERM; unknown is INV", () => {
  expect(parsePreviewCommand("*")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("+")).toEqual({
    kind: "action",
    action: { type: "initCntl" },
  });
  expect(parsePreviewCommand("/")).toEqual({
    kind: "action",
    action: { type: "termCntl" },
  });
  expect(parsePreviewCommand("* ")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("+DAL")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("/A")).toEqual({ kind: "incomplete" });
  expect(commitPreviewCommand("*")).toMatchObject({ kind: "invalid" });
  expect(commitPreviewCommand("+")).toEqual({
    kind: "action",
    action: { type: "initCntl" },
  });
  expect(commitPreviewCommand("/")).toEqual({
    kind: "action",
    action: { type: "termCntl" },
  });
  expect(parsePreviewCommand("Q")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("B")).toEqual({ kind: "incomplete" });
});

test("T02-61 — handlePreviewBufferKey captures, Backspace edits, Enter flashes INV", () => {
  const state = idlePreviewArea();
  beginPreviewBufferEntry(state, "*", 0);
  expect(state.phase).toBe("entry");
  expect(formatPreviewReadout(state)).toBe("*");

  expect(handlePreviewBufferKey(state, "T", 1).consumed).toBe(true);
  expect(state.buffer).toBe("*T");
  expect(formatPreviewReadout(state)).toBe("*T");

  expect(handlePreviewBufferKey(state, " ", 2).consumed).toBe(true);
  expect(state.buffer).toBe("*T ");
  expect(handlePreviewBufferKey(state, "Backspace", 3).consumed).toBe(true);
  expect(state.buffer).toBe("*T");

  expect(handlePreviewBufferKey(state, "Enter", 4)).toEqual({
    consumed: true,
    action: { type: "toggleList", listId: "TAB" },
  });
  expect(state.phase).toBe("idle");
  expect(state.buffer).toBe("");

  const plus = idlePreviewArea();
  beginPreviewBufferEntry(plus, "+", 0);
  handlePreviewBufferKey(plus, "Q", 1);
  expect(handlePreviewBufferKey(plus, "Enter", 2)).toEqual({ consumed: true, action: null });
  expect(plus.rejection).toBe("+Q INV");
  expect(plus.phase).toBe("idle");
  expect(formatPreviewReadout(plus)).toBe("+Q INV");
  expect(expirePreviewArea(plus, 2 + CHORD_TIMEOUT_MS)).toBe(true);
  expect(plus.rejection).toBeNull();

  const slash = idlePreviewArea();
  beginPreviewBufferEntry(slash, "/", 0);
  expect(handlePreviewBufferKey(slash, "Enter", 1)).toEqual({
    consumed: true,
    action: { type: "termCntl" },
  });
  expect(slash.phase).toBe("idle");
  expect(slash.rejection).toBeNull();

  const unknown = idlePreviewArea();
  beginPreviewBufferEntry(unknown, "Q", 0);
  expect(formatPreviewReadout(unknown)).toBe("Q");
  expect(handlePreviewBufferKey(unknown, "Enter", 1)).toEqual({ consumed: true, action: null });
  expect(unknown.rejection).toBe("Q INV");
});

test("T02-61 — Backspace to empty idles; Esc cancels immediately; *J3 stays for starsChord", () => {
  const state = idlePreviewArea();
  beginPreviewBufferEntry(state, "*", 0);
  handlePreviewBufferKey(state, "J", 1);
  handlePreviewBufferKey(state, "3", 2);
  expect(state.buffer).toBe("*J3");
  expect(handlePreviewBufferKey(state, "Enter", 3)).toEqual({
    consumed: true,
    action: null,
    starsBuffer: "*J3",
  });
  expect(state.phase).toBe("entry");

  const edit = idlePreviewArea();
  beginPreviewBufferEntry(edit, "+", 0);
  expect(handlePreviewBufferKey(edit, "Backspace", 1).consumed).toBe(true);
  expect(edit.phase).toBe("idle");
  expect(edit.buffer).toBe("");

  const esc = idlePreviewArea();
  beginPreviewBufferEntry(esc, "/", 0);
  handlePreviewBufferKey(esc, "X", 1);
  expect(handlePreviewEscape(esc)).toBe(true);
  expect(esc.phase).toBe("idle");
  expect(esc.buffer).toBe("");
  expect(esc.rejection).toBeNull();
  expect(formatPreviewReadout(esc)).toBeNull();
});

test("T02-61 — previewBufferCharFromKey maps prefixes, numpad, letters, space", () => {
  expect(previewBufferCharFromKey("*")).toBe("*");
  expect(previewBufferCharFromKey("Multiply")).toBe("*");
  expect(previewBufferCharFromKey("+")).toBe("+");
  expect(previewBufferCharFromKey("Add")).toBe("+");
  expect(previewBufferCharFromKey("/")).toBe("/");
  expect(previewBufferCharFromKey(" ")).toBe(" ");
  expect(previewBufferCharFromKey("a")).toBe("A");
  expect(previewBufferCharFromKey("7")).toBe("7");
  expect(previewBufferCharFromKey(".", "Decimal")).toBe(".");
  expect(previewBufferCharFromKey("_")).toBe("_");
  expect(previewBufferCharFromKey("Tab")).toBeNull();
  expect(previewBufferCharFromKey("Enter")).toBeNull();
  expect(isPreviewBufferStartChar("*")).toBe(true);
  expect(isPreviewBufferStartChar(".")).toBe(false);
  expect(isPreviewBufferStartChar("Q")).toBe(true);
});

const LIST_TOGGLE_CASES: ReadonlyArray<{ buffer: string; listId: string }> = [
  { buffer: "*T", listId: "TAB" },
  { buffer: "* T", listId: "TAB" },
  { buffer: "*TAB", listId: "TAB" },
  { buffer: "*TV", listId: "VFR" },
  { buffer: "* TV", listId: "VFR" },
  { buffer: "*TC", listId: "COAST" },
  { buffer: "*TS", listId: "SIGN_ON" },
  { buffer: "* P1", listId: "TOWER_1" },
  { buffer: "* P2", listId: "TOWER_2" },
  { buffer: "* P3", listId: "TOWER_3" },
  { buffer: "*TM", listId: "ALERT" },
  { buffer: "*TX", listId: "MAPS" },
  { buffer: "*TN", listId: "CRDA" },
];

test("T02-62 — list mnemonics toggle; spaces optional; *TAB aliases *T", () => {
  for (const row of LIST_TOGGLE_CASES) {
    expect(parsePreviewCommand(row.buffer), row.buffer).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: row.listId },
    });
    expect(commitPreviewCommand(row.buffer), `commit ${row.buffer}`).toEqual({
      kind: "action",
      action: { type: "toggleList", listId: row.listId },
    });
  }
});

test("T02-62 — *S arms SSA relocate and does not toggle; *S Enter is armRelocateList", () => {
  expect(parsePreviewCommand("*S")).toEqual({
    kind: "action",
    action: { type: "armRelocateList", listId: "SSA" },
  });
  expect(parsePreviewCommand("* S")).toEqual({
    kind: "action",
    action: { type: "armRelocateList", listId: "SSA" },
  });
  const state = idlePreviewArea();
  beginPreviewBufferEntry(state, "*", 0);
  handlePreviewBufferKey(state, "S", 1);
  expect(handlePreviewBufferKey(state, "Enter", 2)).toEqual({
    consumed: true,
    action: { type: "armRelocateList", listId: "SSA" },
  });
  expect(state.phase).toBe("idle");
});

test("T02-62 — * [List] [1-100] resizes; *T 0 and *T 999 are INV", () => {
  expect(parsePreviewCommand("*T10")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "TAB", maxLines: 10 },
  });
  expect(parsePreviewCommand("*T 10")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "TAB", maxLines: 10 },
  });
  expect(parsePreviewCommand("*TV 1")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "VFR", maxLines: 1 },
  });
  expect(parsePreviewCommand("* P1 100")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "TOWER_1", maxLines: 100 },
  });
  expect(parsePreviewCommand("*T0")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("*T 0")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("*T999")).toMatchObject({ kind: "invalid" });
  expect(commitPreviewCommand("*T 0")).toMatchObject({ kind: "invalid" });
  expect(commitPreviewCommand("*T999")).toMatchObject({ kind: "invalid" });

  const zero = idlePreviewArea();
  beginPreviewBufferEntry(zero, "*", 0);
  handlePreviewBufferKey(zero, "T", 1);
  handlePreviewBufferKey(zero, "0", 2);
  expect(handlePreviewBufferKey(zero, "Enter", 3)).toEqual({ consumed: true, action: null });
  expect(zero.rejection).toBe("*T0 INV");
});

test("T02-62 — * P1 is list, compact *P3/*P10 stay TPA, *PTL incomplete, *TZ INV", () => {
  expect(parsePreviewCommand("* P1")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "TOWER_1" },
  });
  expect(parsePreviewCommand("*P1").kind).toBe("incomplete");
  expect(parsePreviewCommand("*P3").kind).toBe("incomplete");
  expect(parsePreviewCommand("*P")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*P10")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*PTL")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*J")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*J3")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*TZ")).toMatchObject({ kind: "invalid" });
  expect(commitPreviewCommand("*TZ")).toMatchObject({ kind: "invalid" });
  expect(commitPreviewCommand("*P")).toMatchObject({ kind: "invalid" });
});

test("T02-62 — live *T / *S relocate; *T10 does not", () => {
  const tab = injectEntry({ buffer: "*T" });
  expect(previewRelocateListId(tab)).toBe("TAB");
  const spaced = injectEntry({ buffer: "* T" });
  expect(previewRelocateListId(spaced)).toBe("TAB");
  const ssa = injectEntry({ buffer: "*S" });
  expect(previewRelocateListId(ssa)).toBe("SSA");
  const sized = injectEntry({ buffer: "*T10" });
  expect(previewRelocateListId(sized)).toBeNull();
  const tpa = injectEntry({ buffer: "*P" });
  expect(previewRelocateListId(tpa)).toBeNull();
  const armed = injectEntry({
    phase: "armed",
    buffer: "*S",
    armed: { type: "armRelocateList", listId: "SSA" },
  });
  expect(previewRelocateListId(armed)).toBe("SSA");
});

const DISPLAY_PARSE_CASES: ReadonlyArray<{
  buffer: string;
  parse: PreviewCommandResult["kind"];
  action?: PreviewArmedAction;
}> = [
  { buffer: "*C", parse: "action", action: { type: "armRecenterScope" } },
  { buffer: "* C", parse: "action", action: { type: "armRecenterScope" } },
  { buffer: "*OFF", parse: "action", action: { type: "resetScopeCenter" } },
  { buffer: "* OFF", parse: "action", action: { type: "resetScopeCenter" } },
  { buffer: "*RR2", parse: "action", action: { type: "setRangeRingInterval", intervalNm: 2 } },
  { buffer: "*RR 5", parse: "action", action: { type: "setRangeRingInterval", intervalNm: 5 } },
  { buffer: "* RR 10", parse: "action", action: { type: "setRangeRingInterval", intervalNm: 10 } },
  { buffer: "*RR20", parse: "action", action: { type: "setRangeRingInterval", intervalNm: 20 } },
  { buffer: "*RRC", parse: "action", action: { type: "armRecenterRangeRings" } },
  { buffer: "*RR C", parse: "action", action: { type: "armRecenterRangeRings" } },
  { buffer: "*RROFF", parse: "action", action: { type: "resetRangeRingsCenter" } },
  { buffer: "*RR OFF", parse: "action", action: { type: "resetRangeRingsCenter" } },
  { buffer: "*PTL0", parse: "action", action: { type: "setPtlMinutes", minutes: 0 } },
  { buffer: "*PTL 1", parse: "action", action: { type: "setPtlMinutes", minutes: 1 } },
  { buffer: "* PTL 15", parse: "action", action: { type: "setPtlMinutes", minutes: 15 } },
  { buffer: "*HIST0", parse: "action", action: { type: "setHistoryDots", count: 0 } },
  { buffer: "*HIST 9", parse: "action", action: { type: "setHistoryDots", count: 9 } },
  { buffer: "*RR", parse: "incomplete" },
  { buffer: "*PTL", parse: "incomplete" },
  { buffer: "*HIST", parse: "incomplete" },
  { buffer: "*RR7", parse: "invalid" },
  { buffer: "*PTL25", parse: "invalid" },
  { buffer: "*HIST12", parse: "invalid" },
];

test("T02-64 — parse *C / *OFF / *RR / *PTL / *HIST; spaces optional; bad params INV", () => {
  for (const row of DISPLAY_PARSE_CASES) {
    const parsed = parsePreviewCommand(row.buffer);
    expect(parsed.kind, row.buffer).toBe(row.parse);
    expect(parseScopeDisplayCommand(row.buffer)?.kind, row.buffer).toBe(row.parse);
    if (row.action && parsed.kind === "action") {
      expect(parsed.action).toEqual(row.action);
    }
    const committed = commitPreviewCommand(row.buffer);
    if (row.parse === "incomplete") {
      expect(committed.kind, `commit ${row.buffer}`).toBe("invalid");
    } else {
      expect(committed.kind, `commit ${row.buffer}`).toBe(row.parse);
    }
  }
});

test("T02-64 — *P / *P5 / *P3 stay TPA (not PTL); * P1 is a list, not PTL", () => {
  expect(parseScopeDisplayCommand("*P")).toBeNull();
  expect(parseScopeDisplayCommand("*P5")).toBeNull();
  expect(parseScopeDisplayCommand("*P1")).toBeNull();
  expect(parsePreviewCommand("*P").kind).toBe("incomplete");
  expect(parsePreviewCommand("*P5").kind).toBe("incomplete");
  expect(parsePreviewCommand("*P3").kind).toBe("incomplete");
  expect(parsePreviewCommand("* P1")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "TOWER_1" },
  });
  expect(parsePreviewCommand("*PTL").kind).toBe("incomplete");
  expect(parsePreviewCommand("*PTL5")).toEqual({
    kind: "action",
    action: { type: "setPtlMinutes", minutes: 5 },
  });
});

test("T02-64 — Enter on *C returns action; *RR7 INV without starsBuffer", () => {
  const recenter = idlePreviewArea();
  beginPreviewBufferEntry(recenter, "*", 0);
  handlePreviewBufferKey(recenter, "C", 1);
  expect(handlePreviewBufferKey(recenter, "Enter", 2)).toEqual({
    consumed: true,
    action: { type: "armRecenterScope" },
  });
  expect(recenter.phase).toBe("idle");
  expect(recenter.buffer).toBe("");

  const spaced = idlePreviewArea();
  beginPreviewBufferEntry(spaced, "*", 0);
  handlePreviewBufferKey(spaced, " ", 1);
  handlePreviewBufferKey(spaced, "R", 2);
  handlePreviewBufferKey(spaced, "R", 3);
  handlePreviewBufferKey(spaced, " ", 4);
  handlePreviewBufferKey(spaced, "1", 5);
  handlePreviewBufferKey(spaced, "0", 6);
  expect(handlePreviewBufferKey(spaced, "Enter", 7)).toEqual({
    consumed: true,
    action: { type: "setRangeRingInterval", intervalNm: 10 },
  });

  const inv = idlePreviewArea();
  beginPreviewBufferEntry(inv, "*", 0);
  for (const ch of ["R", "R", "7"]) {
    handlePreviewBufferKey(inv, ch, 1);
  }
  expect(handlePreviewBufferKey(inv, "Enter", 2)).toEqual({ consumed: true, action: null });
  expect(inv.rejection).toBe("*RR7 INV");
  expect(inv.phase).toBe("idle");

  const tpa = idlePreviewArea();
  beginPreviewBufferEntry(tpa, "*", 0);
  handlePreviewBufferKey(tpa, "P", 1);
  expect(handlePreviewBufferKey(tpa, "Enter", 2)).toEqual({
    consumed: true,
    action: null,
    starsBuffer: "*P",
  });
});

const KDEM_MAPS = loadKdem().maps.loadedVideoMaps;

test("T02-63 — parsePreviewCommand toggles by slot, id, and M shorthand", () => {
  expect(parsePreviewCommand("*D 1", KDEM_MAPS)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "RWY" },
  });
  expect(parsePreviewCommand("*D1", KDEM_MAPS)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "RWY" },
  });
  expect(parsePreviewCommand("*D LOC27", KDEM_MAPS)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "LOC27" },
  });
  expect(parsePreviewCommand("*DLOC27", KDEM_MAPS)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "LOC27" },
  });
  expect(parsePreviewCommand("* D LOC27", KDEM_MAPS)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "LOC27" },
  });
  expect(parsePreviewCommand("M DEM1_27", KDEM_MAPS)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "DEM1_27" },
  });
  expect(parsePreviewCommand("MDEM1_27", KDEM_MAPS)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "DEM1_27" },
  });
});

test("T02-63 — *D OFF / ALL / NONE; unknown id is INV not a TPA fallback", () => {
  expect(parsePreviewCommand("*D OFF LOC27", KDEM_MAPS)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "LOC27", explicitState: false },
  });
  expect(parsePreviewCommand("*DOFF1", KDEM_MAPS)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "RWY", explicitState: false },
  });
  expect(parsePreviewCommand("*D ALL", KDEM_MAPS)).toEqual({
    kind: "action",
    action: { type: "setAllVideoMaps", enabled: true },
  });
  expect(parsePreviewCommand("*DALL")).toEqual({
    kind: "action",
    action: { type: "setAllVideoMaps", enabled: true },
  });
  expect(parsePreviewCommand("*D NONE")).toEqual({
    kind: "action",
    action: { type: "setAllVideoMaps", enabled: false },
  });
  expect(parsePreviewCommand("*D 99", KDEM_MAPS)).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("*D XYZ", KDEM_MAPS)).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("*D", KDEM_MAPS)).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*DE", KDEM_MAPS)).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*DI", KDEM_MAPS)).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*D+", KDEM_MAPS)).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*J3", KDEM_MAPS)).toEqual({ kind: "incomplete" });
});

test("T04-40 — *D resolves KATL by ULID, starsId, and group slot; ALL reaches GEO-only", () => {
  const maps = loadVideoMapSet("KATL");
  const groups = loadVideoMapGroups("KATL");
  const layout = {
    groups,
    selectedGroupId: groups?.groups.find((g) => g.sourceIndex === 0)?.id,
  };
  expect(parsePreviewCommand("*D 01GP6Y38GCS0BQSWSVRDK7JH5C", maps, layout)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "01GP6Y38GCS0BQSWSVRDK7JH5C" },
  });
  expect(parsePreviewCommand("*D 136", maps, layout)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "01GP6Y38GCS0BQSWSVRDK7JH5C" },
  });
  expect(parsePreviewCommand("*D 1", maps, layout)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: "01GP6Y4FAAN3CQ94T4XN6FTT4C" },
  });
  expect(parsePreviewCommand("*D ALL", maps, layout)).toEqual({
    kind: "action",
    action: { type: "setAllVideoMaps", enabled: true },
  });
});

test("T02-63 — handlePreviewBufferKey commits map actions and leaves TPA *D to starsBuffer", () => {
  const maps = KDEM_MAPS;
  const loc = idlePreviewArea();
  beginPreviewBufferEntry(loc, "*", 0);
  for (const key of ["D", " ", "L", "O", "C", "2", "7"]) {
    handlePreviewBufferKey(loc, key, 1, undefined, maps);
  }
  expect(handlePreviewBufferKey(loc, "Enter", 2, undefined, maps)).toEqual({
    consumed: true,
    action: { type: "toggleVideoMap", mapId: "LOC27" },
  });
  expect(loc.phase).toBe("idle");

  const bare = idlePreviewArea();
  beginPreviewBufferEntry(bare, "*", 0);
  handlePreviewBufferKey(bare, "D", 1, undefined, maps);
  expect(handlePreviewBufferKey(bare, "Enter", 2, undefined, maps)).toEqual({
    consumed: true,
    action: null,
    starsBuffer: "*D",
  });
  expect(bare.phase).toBe("entry");
  expect(bare.buffer).toBe("*D");

  const tpa = idlePreviewArea();
  beginPreviewBufferEntry(tpa, "*", 0);
  handlePreviewBufferKey(tpa, "D", 1, undefined, maps);
  handlePreviewBufferKey(tpa, "E", 2, undefined, maps);
  expect(handlePreviewBufferKey(tpa, "Enter", 3, undefined, maps)).toEqual({
    consumed: true,
    action: null,
    starsBuffer: "*DE",
  });

  const unknown = idlePreviewArea();
  beginPreviewBufferEntry(unknown, "*", 0);
  for (const key of ["D", " ", "X", "Y", "Z"]) {
    handlePreviewBufferKey(unknown, key, 1, undefined, maps);
  }
  expect(handlePreviewBufferKey(unknown, "Enter", 2, undefined, maps)).toEqual({
    consumed: true,
    action: null,
  });
  expect(unknown.rejection).toBe("*D XYZ INV");
  expect(unknown.phase).toBe("idle");

  const slot = idlePreviewArea();
  beginPreviewBufferEntry(slot, "*", 0);
  handlePreviewBufferKey(slot, "D", 1, undefined, maps);
  handlePreviewBufferKey(slot, "1", 2, undefined, maps);
  expect(handlePreviewBufferKey(slot, "Enter", 3, undefined, maps)).toEqual({
    consumed: true,
    action: { type: "toggleVideoMap", mapId: "RWY" },
  });
});

const FILTER_PARSE_CASES: ReadonlyArray<{
  buffer: string;
  parse: PreviewCommandResult["kind"];
  action?: PreviewArmedAction;
}> = [
  { buffer: "*F", parse: "action", action: { type: "displayFilters" } },
  { buffer: "* F", parse: "action", action: { type: "displayFilters" } },
  {
    buffer: "*LA 000 120",
    parse: "action",
    action: { type: "setAltitudeFilterLimits", floorHundreds: 0, ceilingHundreds: 120 },
  },
  {
    buffer: "*LA000120",
    parse: "action",
    action: { type: "setAltitudeFilterLimits", floorHundreds: 0, ceilingHundreds: 120 },
  },
  {
    buffer: "* LA 000 180",
    parse: "action",
    action: { type: "setAltitudeFilterLimits", floorHundreds: 0, ceilingHundreds: 180 },
  },
  { buffer: "*L", parse: "incomplete" },
  { buffer: "*LA", parse: "incomplete" },
  { buffer: "*LA000", parse: "incomplete" },
  { buffer: "*LA 000 999", parse: "invalid" },
  { buffer: "*LA000999", parse: "invalid" },
  { buffer: "*LA 120 000", parse: "invalid" },
  { buffer: "*LA120000", parse: "invalid" },
  { buffer: "*LA000181", parse: "invalid" },
];

test("T02-65 — parse *F / *LA; spaces optional; out of range and floor>ceiling INV", () => {
  for (const row of FILTER_PARSE_CASES) {
    const parsed = parsePreviewCommand(row.buffer);
    expect(parsed.kind, row.buffer).toBe(row.parse);
    expect(parseAltitudeFilterCommand(row.buffer)?.kind, row.buffer).toBe(row.parse);
    if (row.action && parsed.kind === "action") {
      expect(parsed.action).toEqual(row.action);
    }
    const committed = commitPreviewCommand(row.buffer);
    if (row.parse === "incomplete") {
      expect(committed.kind, `commit ${row.buffer}`).toBe("invalid");
    } else {
      expect(committed.kind, `commit ${row.buffer}`).toBe(row.parse);
    }
  }
  expect(parseAltitudeFilterCommand("*FILTER")).toBeNull();
  expect(parsePreviewCommand("*FILTER").kind).toBe("incomplete");
  expect(parsePreviewCommand("*T")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "TAB" },
  });
  expect(parsePreviewCommand("*C")).toEqual({
    kind: "action",
    action: { type: "armRecenterScope" },
  });
});

const BCN_PARSE_CASES: ReadonlyArray<{
  buffer: string;
  parse: PreviewCommandResult["kind"];
  action?: PreviewArmedAction;
}> = [
  {
    buffer: "*BCN 45",
    parse: "action",
    action: { type: "addBeaconCodeFilter", code: "45" },
  },
  {
    buffer: "*BCN45",
    parse: "action",
    action: { type: "addBeaconCodeFilter", code: "45" },
  },
  {
    buffer: "* BCN 4501",
    parse: "action",
    action: { type: "addBeaconCodeFilter", code: "4501" },
  },
  {
    buffer: "*BCN DEL 45",
    parse: "action",
    action: { type: "removeBeaconCodeFilter", code: "45" },
  },
  {
    buffer: "*BCNDEL45",
    parse: "action",
    action: { type: "removeBeaconCodeFilter", code: "45" },
  },
  { buffer: "*BC", parse: "incomplete" },
  { buffer: "*BCN", parse: "incomplete" },
  { buffer: "*BCN 4", parse: "incomplete" },
  { buffer: "*BCN DEL", parse: "incomplete" },
  { buffer: "*BCN 48", parse: "invalid" },
  { buffer: "*BCN 4508", parse: "invalid" },
  { buffer: "*BCN 45012", parse: "invalid" },
];

test("T02-65 — parse *BCN / *BCN DEL; octal only; *B / *BE stay TPA", () => {
  for (const row of BCN_PARSE_CASES) {
    const parsed = parsePreviewCommand(row.buffer);
    expect(parsed.kind, row.buffer).toBe(row.parse);
    expect(parseBeaconFilterCommand(row.buffer)?.kind, row.buffer).toBe(row.parse);
    if (row.action && parsed.kind === "action") {
      expect(parsed.action).toEqual(row.action);
    }
    const committed = commitPreviewCommand(row.buffer);
    if (row.parse === "incomplete") {
      expect(committed.kind, `commit ${row.buffer}`).toBe("invalid");
    } else {
      expect(committed.kind, `commit ${row.buffer}`).toBe(row.parse);
    }
  }
  expect(parseBeaconFilterCommand("*B")).toBeNull();
  expect(parseBeaconFilterCommand("*BE")).toBeNull();
  expect(parseBeaconFilterCommand("*BI")).toBeNull();
  expect(parsePreviewCommand("*B").kind).toBe("incomplete");
  expect(parsePreviewCommand("*BE").kind).toBe("incomplete");
  expect(parsePreviewCommand("*BI").kind).toBe("incomplete");
  expect(parsePreviewCommand("B45")).toEqual({
    kind: "action",
    action: { type: "beaconBlock", digits: "45" },
  });
});

test("T02-65 — Enter on *F / *LA / *BCN returns actions; bad params INV; *B stays starsBuffer", () => {
  const display = idlePreviewArea();
  beginPreviewBufferEntry(display, "*", 0);
  handlePreviewBufferKey(display, "F", 1);
  expect(handlePreviewBufferKey(display, "Enter", 2)).toEqual({
    consumed: true,
    action: { type: "displayFilters" },
  });
  expect(display.phase).toBe("idle");

  const spaced = idlePreviewArea();
  beginPreviewBufferEntry(spaced, "*", 0);
  for (const ch of [" ", "L", "A", " ", "0", "0", "0", " ", "1", "2", "0"]) {
    handlePreviewBufferKey(spaced, ch, 1);
  }
  expect(handlePreviewBufferKey(spaced, "Enter", 2)).toEqual({
    consumed: true,
    action: { type: "setAltitudeFilterLimits", floorHundreds: 0, ceilingHundreds: 120 },
  });

  const inv = idlePreviewArea();
  beginPreviewBufferEntry(inv, "*", 0);
  for (const ch of ["L", "A", "0", "0", "0", "9", "9", "9"]) {
    handlePreviewBufferKey(inv, ch, 1);
  }
  expect(handlePreviewBufferKey(inv, "Enter", 2)).toEqual({ consumed: true, action: null });
  expect(inv.rejection).toBe("*LA000999 INV");
  expect(inv.phase).toBe("idle");

  const bcn = idlePreviewArea();
  beginPreviewBufferEntry(bcn, "*", 0);
  for (const ch of ["B", "C", "N", " ", "4", "5"]) {
    handlePreviewBufferKey(bcn, ch, 1);
  }
  expect(handlePreviewBufferKey(bcn, "Enter", 2)).toEqual({
    consumed: true,
    action: { type: "addBeaconCodeFilter", code: "45" },
  });

  const del = idlePreviewArea();
  beginPreviewBufferEntry(del, "*", 0);
  for (const ch of ["B", "C", "N", "D", "E", "L", "4", "5"]) {
    handlePreviewBufferKey(del, ch, 1);
  }
  expect(handlePreviewBufferKey(del, "Enter", 2)).toEqual({
    consumed: true,
    action: { type: "removeBeaconCodeFilter", code: "45" },
  });

  const tpa = idlePreviewArea();
  beginPreviewBufferEntry(tpa, "*", 0);
  handlePreviewBufferKey(tpa, "B", 1);
  expect(handlePreviewBufferKey(tpa, "Enter", 2)).toEqual({
    consumed: true,
    action: null,
    starsBuffer: "*B",
  });
});

test("T02-66 — + / +FLID / *1–*8 / *0 parse; * P1 is list; compact *P1 is TPA; *B stays TPA; *F is T02-65", () => {
  expect(parsePreviewCommand("+DAL123")).toEqual({
    kind: "action",
    action: { type: "initCntl", flid: "DAL123" },
  });
  expect(parsePreviewCommand("+ DAL123")).toEqual({
    kind: "action",
    action: { type: "initCntl", flid: "DAL123" },
  });
  expect(parsePreviewCommand("+HOLD")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("/ALL")).toMatchObject({ kind: "invalid" });
  expect(parsePreviewCommand("/DAL123")).toEqual({
    kind: "action",
    action: { type: "termCntl", flid: "DAL123" },
  });

  expect(parsePreviewCommand("*1")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", starsDir: 1 },
  });
  expect(parsePreviewCommand("* 8")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", starsDir: 8 },
  });
  expect(parsePreviewCommand("*0")).toEqual({
    kind: "action",
    action: { type: "resetLeaderDir" },
  });
  expect(parsePreviewCommand("* P1")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "TOWER_1" },
  });
  expect(parsePreviewCommand("*P1").kind).toBe("incomplete");
  expect(parsePreviewCommand("*P1")).not.toMatchObject({ type: "setLeaderDir" });

  expect(parsePreviewCommand("*")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*B")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*F")).toEqual({
    kind: "action",
    action: { type: "displayFilters" },
  });
  expect(parsePreviewCommand("*LA")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*BCN")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("*9")).toEqual({ kind: "incomplete" });
  expect(commitPreviewCommand("*B")).toMatchObject({ kind: "invalid" });
  expect(commitPreviewCommand("*")).toMatchObject({ kind: "invalid" });

  expect(parseTrackingSlewBuffer("*")).toEqual({ type: "ackPointout" });
  expect(parseTrackingSlewBuffer("*B")).toEqual({ type: "beaconatorSlew" });
  expect(parseTrackingSlewBuffer("*BE")).toBeNull();
  expect(parseTrackingSlewBuffer("*BCN")).toBeNull();
  expect(parseTrackingSlewBuffer("*J3")).toBeNull();
  expect(parseTrackingSlewBuffer("+")).toEqual({ type: "initCntl" });
  expect(parseTrackingSlewBuffer("/")).toEqual({ type: "termCntl" });

  const plus = idlePreviewArea();
  beginPreviewBufferEntry(plus, "+", 0);
  expect(handlePreviewBufferKey(plus, "Enter", 1)).toEqual({
    consumed: true,
    action: { type: "initCntl" },
  });

  const star = idlePreviewArea();
  beginPreviewBufferEntry(star, "*", 0);
  expect(handlePreviewBufferKey(star, "Enter", 1)).toEqual({
    consumed: true,
    action: null,
    starsBuffer: "*",
  });

  const bcn = idlePreviewArea();
  beginPreviewBufferEntry(bcn, "*", 0);
  handlePreviewBufferKey(bcn, "B", 1);
  expect(handlePreviewBufferKey(bcn, "Enter", 2)).toEqual({
    consumed: true,
    action: null,
    starsBuffer: "*B",
  });

  const leader = idlePreviewArea();
  beginPreviewBufferEntry(leader, "*", 0);
  handlePreviewBufferKey(leader, "1", 1);
  expect(handlePreviewBufferKey(leader, "Enter", 2)).toEqual({
    consumed: true,
    action: { type: "setLeaderDir", starsDir: 1 },
  });

  const live = idlePreviewArea();
  beginPreviewBufferEntry(live, "+", 0);
  expect(previewTrackingSlew(live)).toEqual({ type: "initCntl" });
});
