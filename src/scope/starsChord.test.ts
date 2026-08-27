import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { createScopeView } from "./scopeView";
import {
  STARS_CHORD_NM_MAX,
  STARS_CHORD_NM_MIN,
  applyStarsChordAction,
  beginStarsChordEntry,
  commitStarsChord,
  expireStarsChordEntry,
  formatStarsChordReadout,
  handleStarsChordEntryKey,
  idleStarsChordEntry,
  parseStarsChord,
  type StarsChordAction,
  type StarsChordResult,
} from "./starsChord";
import { CHORD_TIMEOUT_MS } from "./keymap";

function action(expected: StarsChordAction): StarsChordResult {
  return { kind: "action", action: expected };
}

const TABLE: { buffer: string; result: StarsChordResult }[] = [
  { buffer: "*", result: { kind: "incomplete" } },
  { buffer: "**", result: { kind: "incomplete" } },
  { buffer: "*D", result: { kind: "incomplete" } },
  { buffer: "*A", result: { kind: "incomplete" } },
  { buffer: "*B", result: { kind: "incomplete" } },
  { buffer: "*J2.", result: { kind: "incomplete" } },
  { buffer: "*P10.", result: { kind: "incomplete" } },
  { buffer: "*J", result: action({ type: "jRingClear", target: "slewed" }) },
  { buffer: "**J", result: action({ type: "jRingClear", target: "all" }) },
  { buffer: "*J3", result: action({ type: "jRing", target: "slewed", radiusNm: 3 }) },
  { buffer: "*J2.5", result: action({ type: "jRing", target: "slewed", radiusNm: 2.5 }) },
  { buffer: "*J1", result: action({ type: "jRing", target: "slewed", radiusNm: 1 }) },
  { buffer: "*J30", result: action({ type: "jRing", target: "slewed", radiusNm: 30 }) },
  { buffer: "*J30.0", result: action({ type: "jRing", target: "slewed", radiusNm: 30 }) },
  { buffer: "*P", result: action({ type: "coneClear", target: "slewed" }) },
  { buffer: "**P", result: action({ type: "coneClear", target: "all" }) },
  { buffer: "*P10", result: action({ type: "cone", target: "slewed", lengthNm: 10 }) },
  { buffer: "*P2.5", result: action({ type: "cone", target: "slewed", lengthNm: 2.5 }) },
  { buffer: "*D+", result: action({ type: "tpaSizeReadout", mode: "toggle" }) },
  { buffer: "*D+E", result: action({ type: "tpaSizeReadout", mode: "enable" }) },
  { buffer: "*D+I", result: action({ type: "tpaSizeReadout", mode: "inhibit" }) },
  { buffer: "*AE", result: action({ type: "atpaWarningAlert", mode: "enable" }) },
  { buffer: "*AI", result: action({ type: "atpaWarningAlert", mode: "inhibit" }) },
  { buffer: "*BE", result: action({ type: "atpaMonitor", mode: "enable" }) },
  { buffer: "*BI", result: action({ type: "atpaMonitor", mode: "inhibit" }) },
  { buffer: "*DE", result: action({ type: "inTrailDistance", mode: "enable" }) },
  { buffer: "*DI", result: action({ type: "inTrailDistance", mode: "inhibit" }) },
];

test("AC1 / AC2 / AC3 — table-driven STARS TPA/ATPA chords (R07 Table 36)", () => {
  for (const row of TABLE) {
    expect(parseStarsChord(row.buffer), row.buffer).toEqual(row.result);
  }
});

test("AC1 — *P0.5 and 31 NM are invalid; range is 1–30 inclusive, never clamped", () => {
  expect(STARS_CHORD_NM_MIN).toBe(1);
  expect(STARS_CHORD_NM_MAX).toBe(30);
  expect(parseStarsChord("*P0.5").kind).toBe("invalid");
  expect(parseStarsChord("*J0.5").kind).toBe("invalid");
  expect(parseStarsChord("*J0").kind).toBe("invalid");
  expect(parseStarsChord("*J31").kind).toBe("invalid");
  expect(parseStarsChord("*P31").kind).toBe("invalid");
  expect(parseStarsChord("*J30.1").kind).toBe("invalid");
  expect(parseStarsChord("*J2.55").kind).toBe("invalid");
  expect(parseStarsChord("*J1").kind).toBe("action");
  expect(parseStarsChord("*J30").kind).toBe("action");
});

test("AC2 — **J / **P are target all; *J / *P are slewed; neither form swallows the other", () => {
  expect(parseStarsChord("**J")).toEqual(action({ type: "jRingClear", target: "all" }));
  expect(parseStarsChord("*J")).toEqual(action({ type: "jRingClear", target: "slewed" }));
  expect(parseStarsChord("**P")).toEqual(action({ type: "coneClear", target: "all" }));
  expect(parseStarsChord("*P")).toEqual(action({ type: "coneClear", target: "slewed" }));
  expect(parseStarsChord("**J")).not.toEqual(parseStarsChord("*J"));
  expect(parseStarsChord("**P")).not.toEqual(parseStarsChord("*P"));
  expect(parseStarsChord("**J3").kind).toBe("invalid");
  expect(parseStarsChord("**P10").kind).toBe("invalid");
});

test("AC3 — bare *D commit is invalid; *D+ / *D+E / *D+I / *DE / *DI are distinct", () => {
  expect(parseStarsChord("*D")).toEqual({ kind: "incomplete" });
  expect(commitStarsChord("*D")).toMatchObject({ kind: "invalid" });
  expect(commitStarsChord("*")).toMatchObject({ kind: "invalid" });
  expect(commitStarsChord("*J2.")).toMatchObject({ kind: "invalid" });
  expect(parseStarsChord("*D+")).toEqual(action({ type: "tpaSizeReadout", mode: "toggle" }));
  expect(parseStarsChord("*D+E")).toEqual(action({ type: "tpaSizeReadout", mode: "enable" }));
  expect(parseStarsChord("*D+I")).toEqual(action({ type: "tpaSizeReadout", mode: "inhibit" }));
  expect(parseStarsChord("*DE")).toEqual(action({ type: "inTrailDistance", mode: "enable" }));
  expect(parseStarsChord("*DI")).toEqual(action({ type: "inTrailDistance", mode: "inhibit" }));
  expect(parseStarsChord("*D+")).not.toEqual(parseStarsChord("*DE"));
  expect(parseStarsChord("*D+E")).not.toEqual(parseStarsChord("*DE"));
});

test("out-of-table *T / stray input is invalid; *J2. is still a live prefix", () => {
  expect(parseStarsChord("*T").kind).toBe("invalid");
  expect(parseStarsChord("*HELLO").kind).toBe("invalid");
  expect(parseStarsChord("J3").kind).toBe("invalid");
  expect(parseStarsChord("*DX").kind).toBe("invalid");
  expect(parseStarsChord("*J2.").kind).toBe("incomplete");
});

test("AC6 — module cites R07 Table 36, display-only, MULTI FUNC deferred", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./starsChord.ts"] ?? "";
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/Table 36/);
  expect(src).toMatch(/Display-only/);
  expect(src).toMatch(/Never Command IR/);
  expect(src).toMatch(/<MULTI FUNC>/);
  expect(src).toMatch(/remain deferred/);
  expect(src).not.toMatch(/FLY_HEADING/);
  expect(src).not.toMatch(/from "@parse"/);
  expect(src).toMatch(/window\.prompt/);
  expect(src).toMatch(/<input>/);
});

test("FIL-style entry: * opens, keys append, Enter commits, Esc cancels, Backspace edits", () => {
  const entry = idleStarsChordEntry();
  beginStarsChordEntry(entry, 0);
  expect(formatStarsChordReadout(entry)).toBe("*");
  expect(handleStarsChordEntryKey(entry, "j", 10).consumed).toBe(true);
  expect(handleStarsChordEntryKey(entry, "3", 20).consumed).toBe(true);
  expect(formatStarsChordReadout(entry)).toBe("*J3");
  const committed = handleStarsChordEntryKey(entry, "Enter", 30);
  expect(committed.consumed).toBe(true);
  expect(committed.action).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });
  expect(entry.phase).toBe("idle");
  expect(formatStarsChordReadout(entry)).toBeNull();

  beginStarsChordEntry(entry, 40);
  handleStarsChordEntryKey(entry, "D", 50);
  expect(handleStarsChordEntryKey(entry, "Enter", 60).action).toBeNull();
  expect(entry.phase).toBe("idle");
  expect(formatStarsChordReadout(entry)).toBe("*D INV");

  beginStarsChordEntry(entry, 70);
  handleStarsChordEntryKey(entry, "J", 80);
  handleStarsChordEntryKey(entry, "2", 90);
  handleStarsChordEntryKey(entry, "Backspace", 100);
  expect(formatStarsChordReadout(entry)).toBe("*J");
  expect(handleStarsChordEntryKey(entry, "Escape", 110).consumed).toBe(true);
  expect(entry.phase).toBe("idle");
  expect(formatStarsChordReadout(entry)).toBeNull();
});

test("stars chord entry times out at 1.5 s from last key", () => {
  const entry = idleStarsChordEntry();
  beginStarsChordEntry(entry, 0);
  handleStarsChordEntryKey(entry, "J", 100);
  expect(expireStarsChordEntry(entry, 100 + CHORD_TIMEOUT_MS)).toBe(true);
  expect(entry.phase).toBe("idle");
});

test("applyStarsChordAction returns unsupported for rings, cones, and ATPA cone flags", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const world = createWorld({ aircraft: [dal] });
  world.selectedAircraftId = dal.id;
  const view = createScopeView();
  const actions: StarsChordAction[] = [
    { type: "jRing", target: "slewed", radiusNm: 3 },
    { type: "jRingClear", target: "slewed" },
    { type: "jRingClear", target: "all" },
    { type: "cone", target: "slewed", lengthNm: 10 },
    { type: "coneClear", target: "slewed" },
    { type: "coneClear", target: "all" },
    { type: "atpaWarningAlert", mode: "enable" },
    { type: "atpaWarningAlert", mode: "inhibit" },
    { type: "atpaMonitor", mode: "enable" },
    { type: "atpaMonitor", mode: "inhibit" },
  ];
  for (const action of actions) {
    expect(() => applyStarsChordAction(view, world, action)).not.toThrow();
    expect(applyStarsChordAction(view, world, action)).toBe("unsupported");
  }
  expect(view.tpa).toEqual({ on: false, radiusNm: 5 });
  expect(view.atpa).toEqual({
    on: false,
    inTrailDistance: true,
    coneMileage: true,
    alertCones: true,
    monitorCones: true,
  });
  expect(dal.intent.assignedHeadingDeg).toBe(90);
});

test("T02-46 — *DE / *DI mutate in-trail flags; *D+ family mutates cone mileage", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  expect(view.atpa.inTrailDistance).toBe(true);
  expect(view.atpa.coneMileage).toBe(true);

  expect(applyStarsChordAction(view, world, { type: "inTrailDistance", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(view.atpa.inTrailDistance).toBe(false);
  expect(view.atpa.coneMileage).toBe(true);
  expect(applyStarsChordAction(view, world, { type: "inTrailDistance", mode: "enable" })).toBe(
    "applied",
  );
  expect(view.atpa.inTrailDistance).toBe(true);

  expect(applyStarsChordAction(view, world, { type: "tpaSizeReadout", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(view.atpa.coneMileage).toBe(false);
  expect(view.atpa.inTrailDistance).toBe(true);
  expect(applyStarsChordAction(view, world, { type: "tpaSizeReadout", mode: "enable" })).toBe(
    "applied",
  );
  expect(view.atpa.coneMileage).toBe(true);
  expect(applyStarsChordAction(view, world, { type: "tpaSizeReadout", mode: "toggle" })).toBe(
    "applied",
  );
  expect(view.atpa.coneMileage).toBe(false);

  world.selectedAircraftId = dal.id;
  view.atpa.inTrailDistance = true;
  view.atpa.coneMileage = true;
  expect(applyStarsChordAction(view, world, { type: "inTrailDistance", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(view.atpa.inTrailDistance).toBe(true);
  expect(view.tracks.get(dal.id)?.atpaInTrailDistanceEnabled).toBe(false);
  expect(view.tracks.get(dal.id)?.atpaConeMileageEnabled).toBe(true);
  expect(applyStarsChordAction(view, world, { type: "tpaSizeReadout", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(view.atpa.coneMileage).toBe(true);
  expect(view.tracks.get(dal.id)?.atpaConeMileageEnabled).toBe(false);
  expect(dal.intent.assignedHeadingDeg).toBe(90);
});
