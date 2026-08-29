import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { beginFilterEntry, expireFilterEntry, idleFilterEntry } from "./altitudeFilter";
import { shouldPaintAtpaGeometry } from "./atpaCone";
import {
  CHORD_TIMEOUT_MS,
  SCOPE_CHORD_WINDOW_MS,
  beginScopeChord,
  isScopeChordLive,
} from "./keymap";
import { createScopeView } from "./scopeView";
import {
  STARS_CHORD_NM_MAX,
  STARS_CHORD_NM_MIN,
  applyStarsChordAction,
  armOrApplyStarsChordAction,
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

test("live * chord buffer does not expire; INV flash still clears after 1.5 s", () => {
  const entry = idleStarsChordEntry();
  beginStarsChordEntry(entry, 0);
  handleStarsChordEntryKey(entry, "J", 100);
  expect(expireStarsChordEntry(entry, 100 + CHORD_TIMEOUT_MS * 10)).toBe(false);
  expect(entry.phase).toBe("entry");
  expect(entry.buffer).toBe("*J");
  const late = handleStarsChordEntryKey(entry, "3", 100 + CHORD_TIMEOUT_MS * 10);
  expect(late.consumed).toBe(true);
  expect(entry.buffer).toBe("*J3");

  const inv = idleStarsChordEntry();
  beginStarsChordEntry(inv, 0);
  handleStarsChordEntryKey(inv, "D", 100);
  handleStarsChordEntryKey(inv, "Enter", 200);
  expect(inv.rejection).toBe("*D INV");
  expect(expireStarsChordEntry(inv, 200 + CHORD_TIMEOUT_MS - 1)).toBe(false);
  expect(inv.rejection).toBe("*D INV");
  expect(expireStarsChordEntry(inv, 200 + CHORD_TIMEOUT_MS)).toBe(true);
  expect(inv.rejection).toBeNull();
});

test("L leader chord and F filter chord still expire on the 1.5 s window", () => {
  const chord = beginScopeChord("L", 0, "L_");
  expect(isScopeChordLive(chord, SCOPE_CHORD_WINDOW_MS)).toBe(true);
  expect(isScopeChordLive(chord, SCOPE_CHORD_WINDOW_MS + 1)).toBe(false);

  const filter = { minHundreds: 10, maxHundreds: 20 };
  const entry = idleFilterEntry(filter);
  beginFilterEntry(entry, filter, 0);
  expect(expireFilterEntry(entry, filter, CHORD_TIMEOUT_MS)).toBe(true);
  expect(entry.phase).toBe("idle");
  expect(filter).toEqual({ minHundreds: 10, maxHundreds: 20 });
});

test("ATPA *AE / *AI / *BE / *BI apply to slewed track; global when none slewed", () => {
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL122", headingDeg: 180 });
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const world = createWorld({ aircraft: [aal, dal] });
  const view = createScopeView();

  expect(applyStarsChordAction(view, world, { type: "atpaWarningAlert", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(view.atpa.alertCones).toBe(false);
  expect(view.atpa.monitorCones).toBe(true);
  expect(view.tracks.size).toBe(0);
  expect(applyStarsChordAction(view, world, { type: "atpaWarningAlert", mode: "enable" })).toBe(
    "applied",
  );
  expect(view.atpa.alertCones).toBe(true);

  expect(applyStarsChordAction(view, world, { type: "atpaMonitor", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(view.atpa.monitorCones).toBe(false);
  expect(view.atpa.alertCones).toBe(true);
  expect(applyStarsChordAction(view, world, { type: "atpaMonitor", mode: "enable" })).toBe(
    "applied",
  );
  expect(view.atpa.monitorCones).toBe(true);

  world.selectedAircraftId = dal.id;
  expect(applyStarsChordAction(view, world, { type: "atpaWarningAlert", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(view.atpa.alertCones).toBe(true);
  expect(view.tracks.get(dal.id)?.atpaWarningAlertEnabled).toBe(false);
  expect(view.tracks.get(dal.id)?.atpaMonitorEnabled).toBe(true);
  expect(view.tracks.has(aal.id)).toBe(false);

  expect(applyStarsChordAction(view, world, { type: "atpaWarningAlert", mode: "enable" })).toBe(
    "applied",
  );
  expect(view.tracks.get(dal.id)?.atpaWarningAlertEnabled).toBe(true);

  expect(applyStarsChordAction(view, world, { type: "atpaMonitor", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(view.atpa.monitorCones).toBe(true);
  expect(view.tracks.get(dal.id)?.atpaMonitorEnabled).toBe(false);
  expect(view.tracks.get(dal.id)?.atpaWarningAlertEnabled).toBe(true);

  expect(applyStarsChordAction(view, world, { type: "atpaMonitor", mode: "enable" })).toBe(
    "applied",
  );
  expect(view.tracks.get(dal.id)?.atpaMonitorEnabled).toBe(true);

  expect(view.tpa).toEqual({ on: false, radiusNm: 5 });
  expect(dal.intent.assignedHeadingDeg).toBe(90);
  expect(aal.intent.assignedHeadingDeg).toBe(180);
});

test("ATPA *AE affects warning+alert not monitor; *BE affects monitor only; inhibit suppresses paint", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();

  expect(applyStarsChordAction(view, world, { type: "atpaWarningAlert", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(shouldPaintAtpaGeometry("warning", { alertCones: view.atpa.alertCones })).toBe(false);
  expect(shouldPaintAtpaGeometry("alert", { alertCones: view.atpa.alertCones })).toBe(false);
  expect(shouldPaintAtpaGeometry("monitor", { monitorCones: view.atpa.monitorCones })).toBe(true);

  expect(applyStarsChordAction(view, world, { type: "atpaWarningAlert", mode: "enable" })).toBe(
    "applied",
  );
  expect(applyStarsChordAction(view, world, { type: "atpaMonitor", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(shouldPaintAtpaGeometry("monitor", { monitorCones: view.atpa.monitorCones })).toBe(false);
  expect(shouldPaintAtpaGeometry("warning", { alertCones: view.atpa.alertCones })).toBe(true);
  expect(shouldPaintAtpaGeometry("alert", { alertCones: view.atpa.alertCones })).toBe(true);

  world.selectedAircraftId = dal.id;
  view.atpa.alertCones = true;
  view.atpa.monitorCones = true;
  expect(applyStarsChordAction(view, world, { type: "atpaWarningAlert", mode: "inhibit" })).toBe(
    "applied",
  );
  const afterAe = view.tracks.get(dal.id)!;
  expect(
    shouldPaintAtpaGeometry("warning", {
      atpaWarningAlertEnabled: afterAe.atpaWarningAlertEnabled,
      atpaMonitorEnabled: afterAe.atpaMonitorEnabled,
    }),
  ).toBe(false);
  expect(
    shouldPaintAtpaGeometry("alert", {
      atpaWarningAlertEnabled: afterAe.atpaWarningAlertEnabled,
      atpaMonitorEnabled: afterAe.atpaMonitorEnabled,
    }),
  ).toBe(false);
  expect(
    shouldPaintAtpaGeometry("monitor", {
      atpaWarningAlertEnabled: afterAe.atpaWarningAlertEnabled,
      atpaMonitorEnabled: afterAe.atpaMonitorEnabled,
    }),
  ).toBe(true);

  expect(applyStarsChordAction(view, world, { type: "atpaWarningAlert", mode: "enable" })).toBe(
    "applied",
  );
  expect(applyStarsChordAction(view, world, { type: "atpaMonitor", mode: "inhibit" })).toBe(
    "applied",
  );
  const afterBe = view.tracks.get(dal.id)!;
  expect(
    shouldPaintAtpaGeometry("monitor", {
      atpaWarningAlertEnabled: afterBe.atpaWarningAlertEnabled,
      atpaMonitorEnabled: afterBe.atpaMonitorEnabled,
    }),
  ).toBe(false);
  expect(
    shouldPaintAtpaGeometry("warning", {
      atpaWarningAlertEnabled: afterBe.atpaWarningAlertEnabled,
      atpaMonitorEnabled: afterBe.atpaMonitorEnabled,
    }),
  ).toBe(true);
  expect(
    shouldPaintAtpaGeometry("alert", {
      atpaWarningAlertEnabled: afterBe.atpaWarningAlertEnabled,
      atpaMonitorEnabled: afterBe.atpaMonitorEnabled,
    }),
  ).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(90);
});

test("T02-48 — *J / *P / **J / **P mutate per-track rings and cones; no longer unsupported", () => {
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL122", headingDeg: 90 });
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL495", headingDeg: 270 });
  const world = createWorld({ aircraft: [aal, dal] });
  const view = createScopeView();

  world.selectedAircraftId = aal.id;
  expect(applyStarsChordAction(view, world, { type: "jRing", target: "slewed", radiusNm: 3 })).toBe(
    "applied",
  );
  expect(
    applyStarsChordAction(view, world, { type: "cone", target: "slewed", lengthNm: 2.5 }),
  ).toBe("applied");
  world.selectedAircraftId = dal.id;
  expect(
    applyStarsChordAction(view, world, { type: "jRing", target: "slewed", radiusNm: 7.5 }),
  ).toBe("applied");
  expect(applyStarsChordAction(view, world, { type: "cone", target: "slewed", lengthNm: 30 })).toBe(
    "applied",
  );
  expect(view.tracks.get(aal.id)?.tpaRingNm).toBe(3);
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(7.5);
  expect(view.tracks.get(aal.id)?.tpaConeNm).toBe(2.5);
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBe(30);
  expect(view.tpa).toEqual({ on: false, radiusNm: 5 });

  expect(applyStarsChordAction(view, world, { type: "jRingClear", target: "slewed" })).toBe(
    "applied",
  );
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBeUndefined();
  expect(view.tracks.get(aal.id)?.tpaRingNm).toBe(3);
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBe(30);

  expect(applyStarsChordAction(view, world, { type: "coneClear", target: "slewed" })).toBe(
    "applied",
  );
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBeUndefined();
  expect(view.tracks.get(aal.id)?.tpaConeNm).toBe(2.5);

  expect(applyStarsChordAction(view, world, { type: "jRingClear", target: "all" })).toBe("applied");
  expect(applyStarsChordAction(view, world, { type: "coneClear", target: "all" })).toBe("applied");
  expect(view.tracks.get(aal.id)?.tpaRingNm).toBeUndefined();
  expect(view.tracks.get(aal.id)?.tpaConeNm).toBeUndefined();
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBeUndefined();
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBeUndefined();
  expect(aal.intent.assignedHeadingDeg).toBe(90);
});

test("T02-48 — *J1 / *J7.5 / *J30 / *P2.5 store the parsed NM; never clamp to DCB 2/3/5/10", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  const view = createScopeView();
  for (const nm of [1, 7.5, 30]) {
    const parsed = parseStarsChord(`*J${nm}`);
    expect(parsed.kind).toBe("action");
    if (parsed.kind === "action") {
      expect(applyStarsChordAction(view, world, parsed.action)).toBe("applied");
    }
    expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(nm);
  }
  const cone = parseStarsChord("*P2.5");
  expect(cone.kind).toBe("action");
  if (cone.kind === "action") {
    expect(applyStarsChordAction(view, world, cone.action)).toBe("applied");
  }
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBe(2.5);
  expect(view.tpa.radiusNm).toBe(5);
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
  expect(view.tracks.get(dal.id)?.tpaSizeReadoutEnabled).toBe(false);
  expect(applyStarsChordAction(view, world, { type: "tpaSizeReadout", mode: "enable" })).toBe(
    "applied",
  );
  expect(view.tracks.get(dal.id)?.tpaSizeReadoutEnabled).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(90);
});

test("track-scoped *J3 with nothing selected arms; select-then-Enter still applies immediately", () => {
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL122", headingDeg: 180 });
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const world = createWorld({ aircraft: [aal, dal] });
  const view = createScopeView();

  expect(
    armOrApplyStarsChordAction(view, world, { type: "jRing", target: "slewed", radiusNm: 3 }),
  ).toBe("armed");
  expect(view.starsChordArmed).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });
  expect(view.tracks.size).toBe(0);
  expect(formatStarsChordReadout(view.starsChordEntry, view.starsChordArmed)).toBe("*J3");

  world.selectedAircraftId = dal.id;
  expect(
    armOrApplyStarsChordAction(view, world, { type: "jRing", target: "slewed", radiusNm: 3 }),
  ).toBe("applied");
  expect(view.starsChordArmed).toBeNull();
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(3);
  expect(view.tracks.has(aal.id)).toBe(false);
  expect(formatStarsChordReadout(view.starsChordEntry, view.starsChordArmed)).toBeNull();

  world.selectedAircraftId = null;
  expect(armOrApplyStarsChordAction(view, world, { type: "jRingClear", target: "slewed" })).toBe(
    "armed",
  );
  expect(view.starsChordArmed).toEqual({ type: "jRingClear", target: "slewed" });
  expect(formatStarsChordReadout(view.starsChordEntry, view.starsChordArmed)).toBe("*J");
  expect(
    armOrApplyStarsChordAction(view, world, { type: "cone", target: "slewed", lengthNm: 3 }),
  ).toBe("armed");
  expect(view.starsChordArmed).toEqual({ type: "cone", target: "slewed", lengthNm: 3 });
  expect(formatStarsChordReadout(view.starsChordEntry, view.starsChordArmed)).toBe("*P3");
});

test("armed *J3 survives well past the 1.5 s chord timeout", () => {
  const world = createWorld({ aircraft: [makeTestAircraft({ id: "ac-dal", callsign: "DAL123" })] });
  const view = createScopeView();
  const entry = view.starsChordEntry;
  beginStarsChordEntry(entry, 0);
  handleStarsChordEntryKey(entry, "J", 100);
  handleStarsChordEntryKey(entry, "3", 200);
  const committed = handleStarsChordEntryKey(entry, "Enter", 300);
  expect(committed.action).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });
  expect(armOrApplyStarsChordAction(view, world, committed.action!)).toBe("armed");
  expect(entry.phase).toBe("idle");

  expect(expireStarsChordEntry(entry, 300 + CHORD_TIMEOUT_MS * 10)).toBe(false);
  expect(view.starsChordArmed).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });
  expect(formatStarsChordReadout(entry, view.starsChordArmed)).toBe("*J3");
});

test("**J / **P clear all immediately with nothing selected and do not arm", () => {
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL122" });
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [aal, dal] });
  const view = createScopeView();
  world.selectedAircraftId = aal.id;
  applyStarsChordAction(view, world, { type: "jRing", target: "slewed", radiusNm: 5 });
  applyStarsChordAction(view, world, { type: "cone", target: "slewed", lengthNm: 4 });
  world.selectedAircraftId = dal.id;
  applyStarsChordAction(view, world, { type: "jRing", target: "slewed", radiusNm: 8 });
  applyStarsChordAction(view, world, { type: "cone", target: "slewed", lengthNm: 6 });
  world.selectedAircraftId = null;

  expect(armOrApplyStarsChordAction(view, world, { type: "jRingClear", target: "all" })).toBe(
    "applied",
  );
  expect(view.starsChordArmed).toBeNull();
  expect(view.tracks.get(aal.id)?.tpaRingNm).toBeUndefined();
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBeUndefined();
  expect(view.tracks.get(aal.id)?.tpaConeNm).toBe(4);
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBe(6);

  expect(armOrApplyStarsChordAction(view, world, { type: "coneClear", target: "all" })).toBe(
    "applied",
  );
  expect(view.starsChordArmed).toBeNull();
  expect(view.tracks.get(aal.id)?.tpaConeNm).toBeUndefined();
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBeUndefined();
});

test("flag families still fall back to the global view.atpa latch with nothing selected", () => {
  const world = createWorld({
    aircraft: [makeTestAircraft({ id: "ac-dal", callsign: "DAL123" })],
  });
  const view = createScopeView();
  expect(view.atpa.inTrailDistance).toBe(true);
  expect(view.atpa.coneMileage).toBe(true);
  expect(view.atpa.alertCones).toBe(true);
  expect(view.atpa.monitorCones).toBe(true);

  expect(
    armOrApplyStarsChordAction(view, world, { type: "inTrailDistance", mode: "inhibit" }),
  ).toBe("applied");
  expect(view.starsChordArmed).toBeNull();
  expect(view.atpa.inTrailDistance).toBe(false);
  expect(view.tracks.size).toBe(0);

  expect(armOrApplyStarsChordAction(view, world, { type: "tpaSizeReadout", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(view.starsChordArmed).toBeNull();
  expect(view.atpa.coneMileage).toBe(false);

  expect(
    armOrApplyStarsChordAction(view, world, { type: "atpaWarningAlert", mode: "inhibit" }),
  ).toBe("applied");
  expect(view.starsChordArmed).toBeNull();
  expect(view.atpa.alertCones).toBe(false);

  expect(armOrApplyStarsChordAction(view, world, { type: "atpaMonitor", mode: "inhibit" })).toBe(
    "applied",
  );
  expect(view.starsChordArmed).toBeNull();
  expect(view.atpa.monitorCones).toBe(false);
});
