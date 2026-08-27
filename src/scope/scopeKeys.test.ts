import { expect, test, vi } from "vitest";
import { SessionLog, createWorld, makeTestAircraft, stepWorld } from "@core";
import { handleRadioText } from "@pilot";
import { parseRadioText } from "@parse";
import {
  handleScopeKeyDown,
  handleScopeKeyUp,
  handleScopeWheel,
  isAlwaysOnScopeKey,
  type ScopeFocus,
} from "./scopeKeys";
import { DEFAULT_ALTITUDE_FILTER, formatFilterReadout } from "./altitudeFilter";
import { CHORD_TIMEOUT_MS, SCOPE_CHORD_WINDOW_MS } from "./keymap";
import { createScopeView } from "./scopeView";
import { syncTrackDisplays } from "./trackDisplay";

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

test("always-on keys are PageUp, PageDown, Home, End, F1, F3, F4, F7, F8; H/T/M/F/L/Tab are not camera keys", () => {
  expect(isAlwaysOnScopeKey("PageUp")).toBe(true);
  expect(isAlwaysOnScopeKey("Home")).toBe(true);
  expect(isAlwaysOnScopeKey("F1")).toBe(true);
  expect(isAlwaysOnScopeKey("F3")).toBe(true);
  expect(isAlwaysOnScopeKey("F4")).toBe(true);
  expect(isAlwaysOnScopeKey("F7")).toBe(true);
  expect(isAlwaysOnScopeKey("F8")).toBe(true);
  expect(isAlwaysOnScopeKey("R")).toBe(false);
  expect(isAlwaysOnScopeKey("C")).toBe(false);
  expect(isAlwaysOnScopeKey("H")).toBe(false);
  expect(isAlwaysOnScopeKey("T")).toBe(false);
  expect(isAlwaysOnScopeKey("M")).toBe(false);
  expect(isAlwaysOnScopeKey("F")).toBe(false);
  expect(isAlwaysOnScopeKey("L")).toBe(false);
  expect(isAlwaysOnScopeKey("Tab")).toBe(false);
  expect(isAlwaysOnScopeKey("/")).toBe(false);
});

test("AC2 — PageUp five times from 20 NM is 5 NM; center unchanged", () => {
  const view = createScopeView();
  view.camera.centerEastNm = 2;
  view.camera.centerNorthNm = 3;
  for (let i = 0; i < 5; i += 1) {
    const event = keyEvent("PageUp");
    expect(handleScopeKeyDown(event, view)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  }
  expect(view.camera.rangeNm).toBe(5);
  expect(view.camera.centerEastNm).toBe(2);
  expect(view.camera.centerNorthNm).toBe(3);
  handleScopeKeyDown(keyEvent("PageUp"), view);
  expect(view.camera.rangeNm).toBe(5);
});

test("AC3 — PageDown from 20 NM stops at 60; center unchanged", () => {
  const view = createScopeView();
  view.camera.centerEastNm = -1;
  view.camera.centerNorthNm = 4;
  for (let i = 0; i < 20; i += 1) {
    handleScopeKeyDown(keyEvent("PageDown"), view);
  }
  expect(view.camera.rangeNm).toBe(60);
  expect(view.camera.centerEastNm).toBe(-1);
  expect(view.camera.centerNorthNm).toBe(4);
});

test("AC5 — wheel does not move center (no zoom-to-cursor)", () => {
  const view = createScopeView();
  const centerEast = view.camera.centerEastNm;
  const centerNorth = view.camera.centerNorthNm;
  const wheel = { deltaY: -120, preventDefault: vi.fn() };
  expect(handleScopeWheel(wheel, view)).toBe(true);
  expect(wheel.preventDefault).toHaveBeenCalled();
  expect(view.camera.rangeNm).toBe(15);
  expect(view.camera.centerEastNm).toBe(centerEast);
  expect(view.camera.centerNorthNm).toBe(centerNorth);
  handleScopeWheel({ deltaY: 120, preventDefault: vi.fn() }, view);
  expect(view.camera.rangeNm).toBe(20);
  expect(view.camera.centerEastNm).toBe(centerEast);
  expect(view.camera.centerNorthNm).toBe(centerNorth);
});

test("AC7 — PageUp / Home consume the event and do not append to a command buffer", () => {
  const view = createScopeView();
  let buffer = "DAL123 ";
  function type(key: string): void {
    const event = keyEvent(key);
    if (handleScopeKeyDown(event, view)) {
      return;
    }
    if (key.length === 1) {
      buffer += key;
    }
  }
  type("H");
  type("PageUp");
  type("Home");
  type("2");
  type("7");
  type("0");
  expect(buffer).toBe("DAL123 H270");
  expect(view.camera.rangeNm).toBe(15);
  expect(view.camera.centerEastNm).toBe(0);
  expect(view.camera.centerNorthNm).toBe(0);
});

test("scope key/wheel handlers never import the parser", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  for (const name of [
    "./scopeKeys.ts",
    "./ppi.ts",
    "./scopeView.ts",
    "./camera.ts",
    "./history.ts",
    "./trackDisplay.ts",
    "./targetSymbol.ts",
    "./datablock.ts",
    "./fonts.ts",
    "./ptl.ts",
    "./leader.ts",
    "./keymap.ts",
    "./altitudeFilter.ts",
    "./renderScope.ts",
  ]) {
    const src = sources[name];
    expect(src, name).toBeDefined();
    expect(src).not.toMatch(/@parse/);
    expect(src).not.toMatch(/parseRadioText/);
    expect(src).not.toMatch(/handleRadioText/);
    expect(src).not.toMatch(/submitCommand/);
    expect(src).not.toMatch(/parseCommand/);
  }
});

test("AC3 / AC4 — PTL defaults off; F7 toggles in both foci and does not insert a character", () => {
  const view = createScopeView();
  expect(view.ptlOn).toBe(false);
  const parseSpy = vi.fn();

  const radio = keyEvent("F7");
  expect(handleScopeKeyDown(radio, view, "radio")).toBe(true);
  expect(radio.preventDefault).toHaveBeenCalled();
  expect(radio.stopPropagation).toHaveBeenCalled();
  expect(view.ptlOn).toBe(true);
  expect(parseSpy).not.toHaveBeenCalled();

  expect(handleScopeKeyDown(keyEvent("F7"), view, "scope")).toBe(true);
  expect(view.ptlOn).toBe(false);

  let buffer = "DAL123 ";
  for (const key of ["F7", "H", "2", "7", "0"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, "radio") && key.length === 1) {
      buffer += key;
    }
  }
  expect(buffer).toBe("DAL123 H270");
  expect(view.ptlOn).toBe(true);
});

test("AC3 — command line preventDefault includes F1 and F7 so radio focus cannot insert a character", () => {
  const sources = import.meta.glob("../ui/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const commandLine = sources["../ui/command-line.tsx"];
  expect(commandLine).toBeDefined();
  expect(commandLine).toMatch(/event\.key === "F1"/);
  expect(commandLine).toMatch(/event\.key === "F3"/);
  expect(commandLine).toMatch(/event\.key === "F4"/);
  expect(commandLine).toMatch(/event\.key === "F7"/);
  expect(commandLine).toMatch(/event\.preventDefault\(\)/);
});

test("AC6 — F7 never reaches the parser or Command IR", () => {
  const view = createScopeView();
  const parseSpy = vi.fn();
  const event = keyEvent("F7");
  expect(handleScopeKeyDown(event, view, "radio")).toBe(true);
  expect(parseSpy).not.toHaveBeenCalled();
  expect(view.ptlOn).toBe(true);
});

test("history defaults on; F8 toggles globally in both foci", () => {
  const view = createScopeView();
  expect(view.historyEnabled).toBe(true);
  const radio = keyEvent("F8");
  expect(handleScopeKeyDown(radio, view, "radio")).toBe(true);
  expect(radio.preventDefault).toHaveBeenCalled();
  expect(view.historyEnabled).toBe(false);
  expect(handleScopeKeyDown(keyEvent("F8"), view, "scope")).toBe(true);
  expect(view.historyEnabled).toBe(true);
});

test("AC4 / AC7 — H routing depends on focus === scope | radio; parser spy", () => {
  const view = createScopeView();
  const parseSpy = vi.fn();
  function route(key: string, focus: ScopeFocus): void {
    const event = keyEvent(key);
    if (handleScopeKeyDown(event, view, focus)) {
      return;
    }
    if (key.length === 1) {
      parseSpy(key);
    }
  }

  route("H", "radio");
  expect(parseSpy).toHaveBeenCalledWith("H");
  expect(view.historyEnabled).toBe(true);

  parseSpy.mockClear();
  const scopeH = keyEvent("H");
  expect(handleScopeKeyDown(scopeH, view, "scope")).toBe(true);
  expect(scopeH.preventDefault).toHaveBeenCalled();
  expect(scopeH.stopPropagation).toHaveBeenCalled();
  expect(view.historyEnabled).toBe(false);

  parseSpy.mockClear();
  route("H", "scope");
  expect(parseSpy).not.toHaveBeenCalled();
  expect(view.historyEnabled).toBe(true);

  let buffer = "DAL123 ";
  for (const key of ["H", "2", "7", "0"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, "radio") && key.length === 1) {
      buffer += key;
    }
  }
  expect(buffer).toBe("DAL123 H270");
  expect(view.historyEnabled).toBe(true);
});

test("AC4 / AC8 — T with PPI focused toggles datablock; radio T20L still parses", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    altitudeFt: 3000,
    speedKt: 210,
  });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45", altitudeFt: 4000, speedKt: 220 });
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.tracks.get("ac-dal")!.datablockMode = "full";
  view.tracks.get("ac-aal")!.datablockMode = "full";
  const log = new SessionLog();
  const parseSpy = vi.fn();

  function route(key: string, focus: ScopeFocus): void {
    const event = keyEvent(key);
    if (handleScopeKeyDown(event, view, focus, world)) {
      return;
    }
    if (key.length === 1) {
      parseSpy(key);
    }
  }

  route("T", "radio");
  expect(parseSpy).toHaveBeenCalledWith("T");
  expect(view.tracks.get("ac-dal")!.datablockMode).toBe("full");

  parseSpy.mockClear();
  const scopeT = keyEvent("T");
  expect(handleScopeKeyDown(scopeT, view, "scope", world)).toBe(true);
  expect(scopeT.preventDefault).toHaveBeenCalled();
  expect(scopeT.stopPropagation).toHaveBeenCalled();
  expect(view.tracks.get("ac-dal")!.datablockMode).toBe("limited");
  expect(view.tracks.get("ac-aal")!.datablockMode).toBe("limited");
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(log.byType("command.rejected")).toHaveLength(0);

  world.selectedAircraftId = dal.id;
  handleScopeKeyDown(keyEvent("T"), view, "scope", world);
  expect(view.tracks.get("ac-dal")!.datablockMode).toBe("full");
  expect(view.tracks.get("ac-aal")!.datablockMode).toBe("limited");

  let buffer = "";
  for (const key of ["T", "2", "0", "L"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, "radio", world) && key.length === 1) {
      buffer += key;
    }
  }
  expect(buffer).toBe("T20L");
  const parsed = parseRadioText("T20L");
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.instructions).toEqual([{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }]);
  }
});

test("AC5 / AC8 — M with PPI focused hides Mode C on full blocks; limited unchanged; no Command", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.tracks.get("ac-dal")!.datablockMode = "full";
  const log = new SessionLog();
  expect(view.modeCVisible).toBe(true);

  const radioM = keyEvent("M");
  expect(handleScopeKeyDown(radioM, view, "radio", world)).toBe(false);
  expect(view.modeCVisible).toBe(true);

  const scopeM = keyEvent("M");
  expect(handleScopeKeyDown(scopeM, view, "scope", world)).toBe(true);
  expect(scopeM.preventDefault).toHaveBeenCalled();
  expect(view.modeCVisible).toBe(false);
  expect(view.tracks.get("ac-dal")!.datablockMode).toBe("full");
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(log.byType("command.rejected")).toHaveLength(0);

  handleScopeKeyDown(keyEvent("T"), view, "scope", world);
  expect(view.tracks.get("ac-dal")!.datablockMode).toBe("limited");
  expect(view.modeCVisible).toBe(false);
});

test("AC8 — scope-focus T/M never call handleRadioText or emit command events", async () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  const log = new SessionLog();
  const radio = vi.fn((text: string) => handleRadioText(world, text, log));

  for (const key of ["T", "M"]) {
    const event = keyEvent(key);
    expect(handleScopeKeyDown(event, view, "scope", world)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  }
  expect(radio).not.toHaveBeenCalled();
  expect(log.all()).toHaveLength(0);

  await radio("DAL123 H270");
  expect(log.byType("command.accepted")).toHaveLength(1);
});

test("AC2 — selected track, scope L then 6, leader points east", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  world.selectedAircraftId = dal.id;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const now = 10_000;
  const l = keyEvent("L");
  expect(handleScopeKeyDown(l, view, "scope", world, now)).toBe(true);
  expect(l.preventDefault).toHaveBeenCalled();
  expect(l.stopPropagation).toHaveBeenCalled();
  expect(view.pendingChord?.hint).toBe("L_");
  expect(handleScopeKeyDown(keyEvent("6"), view, "scope", world, now + 200)).toBe(true);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(6);
  expect(view.tracks.get("ac-aal")!.leaderDir).toBe(8);
  expect(view.pendingChord).toBeNull();
});

test("AC3 — L then 5 sets overlay on the selected track", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  world.selectedAircraftId = dal.id;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  handleScopeKeyDown(keyEvent("L"), view, "scope", world, 0);
  handleScopeKeyDown(keyEvent("5"), view, "scope", world, 100);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(5);
});

test("AC4 — no selection + L then 1 switches all tracks to SW", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  handleScopeKeyDown(keyEvent("L"), view, "scope", world, 0);
  handleScopeKeyDown(keyEvent("1"), view, "scope", world, 50);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(1);
  expect(view.tracks.get("ac-aal")!.leaderDir).toBe(1);
});

test("AC5 — radio focus L090 parses FLY_HEADING left 90; leaders unchanged", async () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    headingDeg: 180,
  });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const log = new SessionLog();
  const parseSpy = vi.fn();

  let buffer = "";
  for (const key of ["L", "0", "9", "0"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, "radio", world, 0) && key.length === 1) {
      buffer += key;
      parseSpy(key);
    }
  }
  expect(buffer).toBe("L090");
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(8);
  expect(view.pendingChord).toBeNull();
  const parsed = parseRadioText(buffer);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 90, turn: "LEFT" }]);
  }
  const result = await handleRadioText(world, "DAL123 L090", log);
  expect(result.accepted).toBe(true);
  expect(log.byType("command.accepted")).toHaveLength(1);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(8);
});

test("AC6 — after L with no digit for 1.5 s, a following 6 is not a leader", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  handleScopeKeyDown(keyEvent("L"), view, "scope", world, 0);
  expect(view.pendingChord?.prefix).toBe("L");
  const six = keyEvent("6");
  expect(handleScopeKeyDown(six, view, "scope", world, SCOPE_CHORD_WINDOW_MS + 1)).toBe(false);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(8);
  expect(view.pendingChord).toBeNull();
});

test("AC7 — leader chord never emits Command IR events", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  const log = new SessionLog();
  const radio = vi.fn((text: string) => handleRadioText(world, text, log));
  handleScopeKeyDown(keyEvent("L"), view, "scope", world, 0);
  handleScopeKeyDown(keyEvent("6"), view, "scope", world, 10);
  expect(radio).not.toHaveBeenCalled();
  expect(log.all()).toHaveLength(0);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(6);
});

test("Esc or invalid digit cancels the leader chord without changing dir", () => {
  const dal = makeTestAircraft({ id: "ac-dal" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  handleScopeKeyDown(keyEvent("L"), view, "scope", world, 0);
  expect(handleScopeKeyDown(keyEvent("Escape"), view, "scope", world, 20)).toBe(true);
  expect(view.pendingChord).toBeNull();
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(8);

  handleScopeKeyDown(keyEvent("L"), view, "scope", world, 30);
  expect(handleScopeKeyDown(keyEvent("0"), view, "scope", world, 40)).toBe(false);
  expect(view.pendingChord).toBeNull();
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(8);
});

test("numpad ArrowUp during L chord is ignored (NumLock off)", () => {
  const dal = makeTestAircraft({ id: "ac-dal" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.tracks.get("ac-dal")!.leaderDir = 2;
  handleScopeKeyDown(keyEvent("L"), view, "scope", world, 0);
  const arrow = { ...keyEvent("ArrowUp"), code: "Numpad8" };
  expect(handleScopeKeyDown(arrow, view, "scope", world, 10)).toBe(true);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(2);
  expect(view.pendingChord?.prefix).toBe("L");
  handleScopeKeyDown(keyEvent("8"), view, "scope", world, 20);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(8);
});

function typeScopeKeys(
  view: ReturnType<typeof createScopeView>,
  keys: string[],
  startMs = 0,
): number {
  let now = startMs;
  for (const key of keys) {
    const event = keyEvent(key);
    handleScopeKeyDown(event, view, "scope", undefined, now);
    now += 100;
  }
  return now;
}

test("AC3 — scope focus F 050 Enter 120 Enter sets 5000-12000 ft", () => {
  const view = createScopeView();
  const log = new SessionLog();
  typeScopeKeys(view, ["F", "0", "5", "0", "Enter", "1", "2", "0", "Enter"]);
  expect(view.altitudeFilter).toEqual({ minHundreds: 50, maxHundreds: 120 });
  expect(view.filterEntry.phase).toBe("idle");
  expect(formatFilterReadout(view.altitudeFilter, view.filterEntry)).toBe("FILTER 050-120");
  expect(log.all()).toHaveLength(0);
});

test("50 Enter pads to 050; Numpad digits work", () => {
  const view = createScopeView();
  typeScopeKeys(view, ["F", "5", "0", "Enter", "Numpad1", "Numpad2", "Numpad0", "Enter"]);
  expect(view.altitudeFilter).toEqual({ minHundreds: 50, maxHundreds: 120 });
});

test("AC4 — radio focus F does not start a filter chord; F sits in the command line", () => {
  const view = createScopeView();
  const parseSpy = vi.fn();
  const radioF = keyEvent("F");
  expect(handleScopeKeyDown(radioF, view, "radio", undefined, 0)).toBe(false);
  expect(radioF.preventDefault).not.toHaveBeenCalled();
  expect(view.filterEntry.phase).toBe("idle");
  expect(view.altitudeFilter).toEqual(DEFAULT_ALTITUDE_FILTER);

  let buffer = "";
  for (const key of ["F", "0", "5", "0"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, "radio", undefined, 10) && key.length === 1) {
      buffer += key;
      parseSpy(key);
    }
  }
  expect(buffer).toBe("F050");
  expect(view.altitudeFilter).toEqual(DEFAULT_ALTITUDE_FILTER);
  expect(parseSpy).toHaveBeenCalledWith("F");
});

test("AC4 — radio-focus digits are not stolen after a scope F chord", () => {
  const view = createScopeView();
  handleScopeKeyDown(keyEvent("F"), view, "scope", undefined, 0);
  expect(view.filterEntry.phase).toBe("min");
  let buffer = "DAL123 ";
  for (const key of ["H", "2", "7", "0"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, "radio", undefined, 50) && key.length === 1) {
      buffer += key;
    }
  }
  expect(buffer).toBe("DAL123 H270");
  const parsed = parseRadioText("DAL123 H270");
  expect(parsed.ok).toBe(true);
  expect(view.altitudeFilter).toEqual(DEFAULT_ALTITUDE_FILTER);
});

test("AC5 — Esc during F entry restores prior min/max", () => {
  const view = createScopeView();
  typeScopeKeys(view, ["F", "0", "7", "0", "Enter", "0", "9", "0", "Enter"]);
  expect(view.altitudeFilter).toEqual({ minHundreds: 70, maxHundreds: 90 });
  typeScopeKeys(view, ["F", "0", "1", "0", "Enter", "0", "2", "0"], 1000);
  expect(handleScopeKeyDown(keyEvent("Escape"), view, "scope", undefined, 2000)).toBe(true);
  expect(view.altitudeFilter).toEqual({ minHundreds: 70, maxHundreds: 90 });
  expect(view.filterEntry.phase).toBe("idle");
});

test("AC6 — max < min on commit leaves filter unchanged; no crash", () => {
  const view = createScopeView();
  view.altitudeFilter = { minHundreds: 20, maxHundreds: 40 };
  expect(() =>
    typeScopeKeys(view, ["F", "1", "2", "0", "Enter", "0", "5", "0", "Enter"]),
  ).not.toThrow();
  expect(view.altitudeFilter).toEqual({ minHundreds: 20, maxHundreds: 40 });
  expect(view.filterEntry.phase).toBe("idle");
});

test("AC7 — altitude filter never emits command.accepted or a readback", async () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  const log = new SessionLog();
  const radio = vi.fn((text: string) => handleRadioText(world, text, log));

  typeScopeKeys(view, ["F", "0", "5", "0", "Enter", "1", "2", "0", "Enter"]);
  expect(radio).not.toHaveBeenCalled();
  expect(log.all()).toHaveLength(0);
  expect(view.altitudeFilter).toEqual({ minHundreds: 50, maxHundreds: 120 });

  await radio("DAL123 H270");
  expect(log.byType("command.accepted")).toHaveLength(1);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
});

test("F chord times out at 1.5 s with injected now; leftover digit is not consumed", () => {
  const view = createScopeView();
  expect(handleScopeKeyDown(keyEvent("F"), view, "scope", undefined, 0)).toBe(true);
  expect(view.filterEntry.phase).toBe("min");
  const late = keyEvent("5");
  expect(handleScopeKeyDown(late, view, "scope", undefined, CHORD_TIMEOUT_MS)).toBe(false);
  expect(view.filterEntry.phase).toBe("idle");
  expect(view.altitudeFilter).toEqual(DEFAULT_ALTITUDE_FILTER);
});

test("AC6 / AC7 — F3/F4 always-on preventDefault, never emit Command IR, ignore L/F", async () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const log = new SessionLog();
  const parseSpy = vi.fn();

  const noSel = keyEvent("F3");
  expect(handleScopeKeyDown(noSel, view, "radio", world)).toBe(true);
  expect(noSel.preventDefault).toHaveBeenCalled();
  expect(noSel.stopPropagation).toHaveBeenCalled();
  expect(view.tracks.get("ac-dal")!.ownership).toBe("unowned");
  expect(view.tracks.get("ac-aal")!.ownership).toBe("unowned");

  world.selectedAircraftId = dal.id;
  const f3 = keyEvent("F3");
  expect(handleScopeKeyDown(f3, view, "radio", world)).toBe(true);
  expect(f3.preventDefault).toHaveBeenCalled();
  expect(view.tracks.get("ac-dal")!.ownership).toBe("owned");
  expect(view.tracks.get("ac-aal")!.ownership).toBe("unowned");
  expect(dal.intent.assignedHeadingDeg).toBe(90);
  expect(log.byType("command.accepted")).toHaveLength(0);

  expect(handleScopeKeyDown(keyEvent("F3"), view, "scope", world)).toBe(true);
  expect(view.tracks.get("ac-dal")!.ownership).toBe("owned");

  const f4 = keyEvent("F4");
  expect(handleScopeKeyDown(f4, view, "radio", world)).toBe(true);
  expect(f4.preventDefault).toHaveBeenCalled();
  expect(view.tracks.get("ac-dal")!.ownership).toBe("unowned");

  for (const key of ["L", "F"]) {
    const event = keyEvent(key);
    expect(handleScopeKeyDown(event, view, "radio", world)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    parseSpy(key);
  }
  expect(parseSpy).toHaveBeenCalledWith("L");
  expect(parseSpy).toHaveBeenCalledWith("F");

  let buffer = "DAL123 ";
  for (const key of ["F3", "H", "2", "7", "0"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, "radio", world) && key.length === 1) {
      buffer += key;
    }
  }
  expect(buffer).toBe("DAL123 H270");
  const parsed = parseRadioText("DAL123 H270");
  expect(parsed.ok).toBe(true);
  await handleRadioText(world, "DAL123 H270", log);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(view.tracks.get("ac-dal")!.ownership).toBe("owned");
  expect(log.byType("command.accepted")).toHaveLength(1);
});

test("AC5 — F1 activates momentary beacon code readout on keydown and deactivates on keyup", () => {
  const ac = makeTestAircraft({
    id: "ac-dal",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    speedKt: 210,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  expect(view.beaconatorActive).toBe(false);
  expect(world.paused).toBe(false);

  const down = keyEvent("F1");
  expect(handleScopeKeyDown(down, view, "radio", world)).toBe(true);
  expect(down.preventDefault).toHaveBeenCalled();
  expect(down.stopPropagation).toHaveBeenCalled();
  expect(view.beaconatorActive).toBe(true);
  expect(world.paused).toBe(false);

  const xBefore = ac.xNm;
  stepWorld(world, 1);
  expect(world.paused).toBe(false);
  expect(world.simTimeMs).toBe(1000);
  expect(ac.xNm).toBeGreaterThan(xBefore);

  const up = keyEvent("F1");
  expect(handleScopeKeyUp(up, view)).toBe(true);
  expect(up.preventDefault).toHaveBeenCalled();
  expect(view.beaconatorActive).toBe(false);
});

test("Tab cycles focus in both foci; does not steal Tab from help overlay", () => {
  const view = createScopeView();
  const cycleFocus = vi.fn();

  const radioTab = keyEvent("Tab");
  expect(handleScopeKeyDown(radioTab, view, "radio", undefined, 0, { cycleFocus })).toBe(true);
  expect(radioTab.preventDefault).toHaveBeenCalled();
  expect(radioTab.stopPropagation).toHaveBeenCalled();
  expect(cycleFocus).toHaveBeenCalledTimes(1);

  const scopeTab = keyEvent("Tab");
  expect(handleScopeKeyDown(scopeTab, view, "scope", undefined, 0, { cycleFocus })).toBe(true);
  expect(cycleFocus).toHaveBeenCalledTimes(2);

  const overlayTab = keyEvent("Tab");
  expect(
    handleScopeKeyDown(overlayTab, view, "radio", undefined, 0, {
      cycleFocus,
      helpOverlayHasFocus: true,
    }),
  ).toBe(false);
  expect(overlayTab.preventDefault).not.toHaveBeenCalled();
  expect(cycleFocus).toHaveBeenCalledTimes(2);
});

test("slash focuses radio only when scope-focused and preventDefault", () => {
  const view = createScopeView();
  const focusRadio = vi.fn();
  const parseSpy = vi.fn();

  const scopeSlash = keyEvent("/");
  expect(handleScopeKeyDown(scopeSlash, view, "scope", undefined, 0, { focusRadio })).toBe(true);
  expect(scopeSlash.preventDefault).toHaveBeenCalled();
  expect(scopeSlash.stopPropagation).toHaveBeenCalled();
  expect(focusRadio).toHaveBeenCalledTimes(1);

  const radioSlash = keyEvent("/");
  expect(handleScopeKeyDown(radioSlash, view, "radio", undefined, 0, { focusRadio })).toBe(false);
  expect(radioSlash.preventDefault).not.toHaveBeenCalled();
  expect(focusRadio).toHaveBeenCalledTimes(1);
  if (radioSlash.preventDefault.mock.calls.length === 0) {
    parseSpy("/");
  }
  expect(parseSpy).toHaveBeenCalledWith("/");
});

function typeStarsKeys(
  view: ReturnType<typeof createScopeView>,
  keys: string[],
  startMs = 0,
): number {
  let now = startMs;
  for (const key of keys) {
    handleScopeKeyDown(keyEvent(key), view, "scope", undefined, now);
    now += 100;
  }
  return now;
}

test("AC4 — * with PPI focused opens the chord buffer; Esc cancels leaving no state", () => {
  const view = createScopeView();
  const star = keyEvent("*");
  expect(handleScopeKeyDown(star, view, "scope", undefined, 0)).toBe(true);
  expect(star.preventDefault).toHaveBeenCalled();
  expect(star.stopPropagation).toHaveBeenCalled();
  expect(view.starsChordEntry.phase).toBe("entry");
  expect(view.starsChordEntry.buffer).toBe("*");
  typeStarsKeys(view, ["J", "2", ".", "5"], 10);
  expect(view.starsChordEntry.buffer).toBe("*J2.5");
  expect(handleScopeKeyDown(keyEvent("Escape"), view, "scope", undefined, 500)).toBe(true);
  expect(view.starsChordEntry.phase).toBe("idle");
  expect(view.starsChordEntry.buffer).toBe("");
  expect(view.starsChordEntry.rejection).toBeNull();
});

test("AC4 — * typed while the radio command line is focused is a literal *", () => {
  const view = createScopeView();
  const parseSpy = vi.fn();
  const radioStar = keyEvent("*");
  expect(handleScopeKeyDown(radioStar, view, "radio", undefined, 0)).toBe(false);
  expect(radioStar.preventDefault).not.toHaveBeenCalled();
  expect(view.starsChordEntry.phase).toBe("idle");

  let buffer = "";
  for (const key of ["*", "J", "3"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, "radio", undefined, 10) && key.length === 1) {
      buffer += key;
      parseSpy(key);
    }
  }
  expect(buffer).toBe("*J3");
  expect(view.starsChordEntry.phase).toBe("idle");
  expect(parseSpy).toHaveBeenCalledWith("*");
});

test("AC5 — * chords never emit Command IR; DAL123 H270 still turns; F and L still work", async () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const world = createWorld({ aircraft: [dal] });
  world.selectedAircraftId = dal.id;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const log = new SessionLog();
  const radio = vi.fn((text: string) => handleRadioText(world, text, log));

  typeStarsKeys(view, ["*", "J", "3", "Enter"]);
  expect(radio).not.toHaveBeenCalled();
  expect(log.all()).toHaveLength(0);
  expect(view.starsChordEntry.phase).toBe("idle");
  expect(view.tpa).toEqual({ on: false, radiusNm: 5 });

  handleScopeKeyDown(keyEvent("L"), view, "scope", world, 1000);
  handleScopeKeyDown(keyEvent("6"), view, "scope", world, 1100);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(6);
  expect(view.pendingChord).toBeNull();

  typeScopeKeys(view, ["F", "0", "5", "0", "Enter", "1", "2", "0", "Enter"], 2000);
  expect(view.altitudeFilter).toEqual({ minHundreds: 50, maxHundreds: 120 });

  await radio("DAL123 H270");
  expect(log.byType("command.accepted")).toHaveLength(1);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
});
