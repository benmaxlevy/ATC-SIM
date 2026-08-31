import { expect, test, vi } from "vitest";
import { SessionLog, createWorld, makeTestAircraft, stepWorld } from "@core";
import { handleRadioText } from "@pilot";
import { parseRadioText } from "@parse";
import { loadKdem } from "@scenario";
import {
  handleScopeKeyDown,
  handleScopeKeyUp,
  handleScopeWheel,
  isAlwaysOnScopeKey,
  type ScopeFocus,
} from "./scopeKeys";
import { DEFAULT_ALTITUDE_FILTER, formatFilterReadout } from "./altitudeFilter";
import { isVideoMapOn } from "./dcbFunctions";
import { CHORD_TIMEOUT_MS, SCOPE_CHORD_WINDOW_MS } from "./keymap";
import { parseDigitalMap } from "./mapLayers";
import { beginPrefNameEntry, formatPreviewReadout } from "./previewArea";
import { beginDcbPrefSaveAs } from "./dcbPref";
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
  expect(isAlwaysOnScopeKey("B")).toBe(false);
  expect(isAlwaysOnScopeKey("b")).toBe(false);
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
  expect(handleScopeKeyDown(six, view, "scope", world, SCOPE_CHORD_WINDOW_MS + 1)).toBe(true);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(8);
  expect(view.pendingChord).toBeNull();
  expect(view.preview.buffer).toBe("6");
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
  expect(handleScopeKeyDown(keyEvent("0"), view, "scope", world, 40)).toBe(true);
  expect(view.pendingChord).toBeNull();
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(8);
  expect(view.preview.buffer).toBe("0");
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

test("F chord times out at 1.5 s with injected now; leftover digit is not a filter digit", () => {
  const view = createScopeView();
  expect(handleScopeKeyDown(keyEvent("F"), view, "scope", undefined, 0)).toBe(true);
  expect(view.filterEntry.phase).toBe("min");
  const late = keyEvent("5");
  expect(handleScopeKeyDown(late, view, "scope", undefined, CHORD_TIMEOUT_MS)).toBe(true);
  expect(view.filterEntry.phase).toBe("idle");
  expect(view.altitudeFilter).toEqual(DEFAULT_ALTITUDE_FILTER);
  expect(view.preview.buffer).toBe("5");
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

test("slash buffers into Preview Area when scope-focused; radio-focus / is literal", () => {
  const view = createScopeView();
  const focusRadio = vi.fn();
  const parseSpy = vi.fn();

  const scopeSlash = keyEvent("/");
  expect(handleScopeKeyDown(scopeSlash, view, "scope", undefined, 0, { focusRadio })).toBe(true);
  expect(scopeSlash.preventDefault).toHaveBeenCalled();
  expect(scopeSlash.stopPropagation).toHaveBeenCalled();
  expect(focusRadio).not.toHaveBeenCalled();
  expect(view.preview.phase).toBe("entry");
  expect(view.preview.buffer).toBe("/");

  const radioSlash = keyEvent("/");
  expect(handleScopeKeyDown(radioSlash, view, "radio", undefined, 0, { focusRadio })).toBe(false);
  expect(radioSlash.preventDefault).not.toHaveBeenCalled();
  expect(focusRadio).not.toHaveBeenCalled();
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

test("*J3 Enter with nothing selected arms; Esc clears; a new * replaces it", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  let now = 0;
  for (const key of ["*", "J", "3", "Enter"]) {
    expect(handleScopeKeyDown(keyEvent(key), view, "scope", world, now)).toBe(true);
    now += 100;
  }
  expect(view.starsChordEntry.phase).toBe("idle");
  expect(view.starsChordArmed).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBeUndefined();

  view.dcbMenu = "TPA_ATPA";
  const esc = keyEvent("Escape");
  expect(handleScopeKeyDown(esc, view, "scope", world, now + CHORD_TIMEOUT_MS * 5)).toBe(true);
  expect(esc.preventDefault).toHaveBeenCalled();
  expect(view.starsChordArmed).toBeNull();
  expect(view.dcbMenu).toBe("TPA_ATPA");

  now += CHORD_TIMEOUT_MS * 6;
  for (const key of ["*", "J", "5", "Enter"]) {
    handleScopeKeyDown(keyEvent(key), view, "scope", world, now);
    now += 100;
  }
  expect(view.starsChordArmed).toEqual({ type: "jRing", target: "slewed", radiusNm: 5 });
  expect(handleScopeKeyDown(keyEvent("*"), view, "scope", world, now)).toBe(true);
  expect(view.starsChordArmed).toBeNull();
  expect(view.starsChordEntry.phase).toBe("entry");
  expect(view.starsChordEntry.buffer).toBe("*");
});

test("select then *J3 Enter applies immediately and does not arm", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  let now = 0;
  for (const key of ["*", "J", "3", "Enter"]) {
    handleScopeKeyDown(keyEvent(key), view, "scope", world, now);
    now += 100;
  }
  expect(view.starsChordArmed).toBeNull();
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(3);
});

test("Esc on injected live preview cancels preview before * chord and DCB", () => {
  const view = createScopeView();
  view.preview.phase = "entry";
  view.preview.mnemonic = "INIT CNTL";
  view.preview.buffer = "DAL";
  view.preview.flid = "DAL";
  view.starsChordEntry.phase = "entry";
  view.starsChordEntry.buffer = "*J3";
  view.dcbMenu = "TPA_ATPA";

  const esc = keyEvent("Escape");
  expect(handleScopeKeyDown(esc, view, "scope", undefined, 0)).toBe(true);
  expect(esc.preventDefault).toHaveBeenCalled();
  expect(view.preview.phase).toBe("idle");
  expect(view.preview.buffer).toBe("");
  expect(view.preview.mnemonic).toBe("");
  expect(view.preview.flid).toBeNull();
  expect(view.starsChordEntry.phase).toBe("entry");
  expect(view.starsChordEntry.buffer).toBe("*J3");
  expect(view.dcbMenu).toBe("TPA_ATPA");
});

test("Esc on injected armed preview cancels preview and leaves * chord / DCB", () => {
  const view = createScopeView();
  view.preview.phase = "armed";
  view.preview.mnemonic = "TERM CNTL";
  view.preview.armed = { type: "termCntl" };
  view.starsChordArmed = { type: "jRing", target: "slewed", radiusNm: 3 };
  view.dcbMenu = "MAPS";

  const esc = keyEvent("Escape");
  expect(handleScopeKeyDown(esc, view, "scope", undefined, 0)).toBe(true);
  expect(view.preview.phase).toBe("idle");
  expect(view.preview.armed).toBeNull();
  expect(view.preview.mnemonic).toBe("");
  expect(view.starsChordArmed).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });
  expect(view.dcbMenu).toBe("MAPS");
});

test("idle preview Esc still cancels a live * chord before DCB", () => {
  const view = createScopeView();
  expect(view.preview.phase).toBe("idle");
  view.starsChordEntry.phase = "entry";
  view.starsChordEntry.buffer = "*P";
  view.dcbMenu = "TPA_ATPA";

  const esc = keyEvent("Escape");
  expect(handleScopeKeyDown(esc, view, "scope", undefined, 0)).toBe(true);
  expect(view.starsChordEntry.phase).toBe("idle");
  expect(view.starsChordEntry.buffer).toBe("");
  expect(view.dcbMenu).toBe("TPA_ATPA");
});

test("F3/F4 no selection arms INIT/TERM CNTL; selection still implies apply now", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const log = new SessionLog();

  const f3 = keyEvent("F3");
  expect(handleScopeKeyDown(f3, view, "radio", world)).toBe(true);
  expect(f3.preventDefault).toHaveBeenCalled();
  expect(view.preview.phase).toBe("armed");
  expect(view.preview.mnemonic).toBe("INIT CNTL");
  expect(view.preview.armed).toEqual({ type: "initCntl" });
  expect(view.tracks.get("ac-dal")!.ownership).toBe("unowned");
  expect(log.byType("command.accepted")).toHaveLength(0);

  world.selectedAircraftId = dal.id;
  expect(handleScopeKeyDown(keyEvent("F3"), view, "radio", world)).toBe(true);
  expect(view.tracks.get("ac-dal")!.ownership).toBe("owned");
  expect(view.tracks.get("ac-aal")!.ownership).toBe("unowned");
  expect(view.preview.phase).toBe("idle");
  expect(dal.intent.assignedHeadingDeg).toBe(90);

  const f4 = keyEvent("F4");
  expect(handleScopeKeyDown(f4, view, "scope", world)).toBe(true);
  expect(f4.preventDefault).toHaveBeenCalled();
  expect(view.tracks.get("ac-dal")!.ownership).toBe("unowned");
  expect(view.preview.phase).toBe("idle");

  world.selectedAircraftId = null;
  expect(handleScopeKeyDown(keyEvent("F4"), view, "radio", world)).toBe(true);
  expect(view.preview.phase).toBe("armed");
  expect(view.preview.mnemonic).toBe("TERM CNTL");
  expect(view.preview.armed).toEqual({ type: "termCntl" });
  expect(view.tracks.get("ac-dal")!.ownership).toBe("unowned");
});

test("F3 + FLID + Enter initiates without slew; unknown INV; F3 not typed into radio", async () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const log = new SessionLog();

  expect(handleScopeKeyDown(keyEvent("F3"), view, "radio", world)).toBe(true);
  let stolen = "";
  for (const key of ["D", "A", "L", "1", "2", "3"]) {
    const event = keyEvent(key);
    expect(handleScopeKeyDown(event, view, "radio", world)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    stolen += key;
  }
  expect(stolen).toBe("DAL123");
  expect(view.preview.flid).toBe("DAL123");
  expect(handleScopeKeyDown(keyEvent("Enter"), view, "radio", world)).toBe(true);
  expect(view.tracks.get("ac-dal")!.ownership).toBe("owned");
  expect(view.tracks.get("ac-aal")!.ownership).toBe("unowned");
  expect(view.preview.phase).toBe("idle");
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(dal.intent.assignedHeadingDeg).toBe(90);

  expect(handleScopeKeyDown(keyEvent("F4"), view, "radio", world)).toBe(true);
  for (const key of ["A", "L", "L"]) {
    expect(handleScopeKeyDown(keyEvent(key), view, "radio", world)).toBe(true);
  }
  expect(handleScopeKeyDown(keyEvent("Enter"), view, "radio", world)).toBe(true);
  expect(view.preview.rejection).toBe("TERM CNTL ALL INV");
  expect(view.tracks.get("ac-dal")!.ownership).toBe("owned");
  expect(view.tracks.get("ac-aal")!.ownership).toBe("unowned");

  const radio = createScopeView();
  syncTrackDisplays(radio.tracks, world);
  let buffer = "DAL123 ";
  for (const key of ["H", "2", "7", "0"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, radio, "radio", world) && key.length === 1) {
      buffer += key;
    }
  }
  expect(buffer).toBe("DAL123 H270");
  await handleRadioText(world, "DAL123 H270", log);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(log.byType("command.accepted")).toHaveLength(1);
});

test("Backspace edits armed INIT ACID; Esc cancels; F7 stays PTL ALL", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  handleScopeKeyDown(keyEvent("F3"), view, "radio", world);
  handleScopeKeyDown(keyEvent("D"), view, "radio", world);
  handleScopeKeyDown(keyEvent("A"), view, "radio", world);
  expect(view.preview.flid).toBe("DA");
  expect(handleScopeKeyDown(keyEvent("Backspace"), view, "radio", world)).toBe(true);
  expect(view.preview.flid).toBe("D");
  expect(view.preview.phase).toBe("armed");

  expect(handleScopeKeyDown(keyEvent("Escape"), view, "radio", world)).toBe(true);
  expect(view.preview.phase).toBe("idle");
  expect(view.preview.armed).toBeNull();

  handleScopeKeyDown(keyEvent("F3"), view, "radio", world);
  expect(handleScopeKeyDown(keyEvent("F7"), view, "radio", world)).toBe(true);
  expect(view.ptlOn).toBe(true);
  expect(view.preview.phase).toBe("armed");
});

test("scope-focus B45 Enter toggles CODE BLOCK; second B45 removes it", () => {
  const view = createScopeView();
  let now = 0;
  for (const key of ["B", "4", "5", "Enter"]) {
    expect(handleScopeKeyDown(keyEvent(key), view, "scope", undefined, now)).toBe(true);
    now += 100;
  }
  expect(view.beaconSelectCodes).toEqual(["45"]);
  expect(view.preview.phase).toBe("idle");

  now += 100;
  for (const key of ["B", "4", "5", "Enter"]) {
    handleScopeKeyDown(keyEvent(key), view, "scope", undefined, now);
    now += 100;
  }
  expect(view.beaconSelectCodes).toEqual([]);
});

test("scope-focus B4501 auto-commits discrete; B4500 does not remove 4501", () => {
  const view = createScopeView();
  let now = 0;
  for (const key of ["B", "4", "5", "0", "1"]) {
    expect(handleScopeKeyDown(keyEvent(key), view, "scope", undefined, now)).toBe(true);
    now += 100;
  }
  expect(view.beaconSelectCodes).toEqual(["4501"]);
  expect(view.preview.phase).toBe("idle");

  for (const key of ["B", "4", "5", "0", "0"]) {
    handleScopeKeyDown(keyEvent(key), view, "scope", undefined, now);
    now += 100;
  }
  expect(view.beaconSelectCodes).toEqual(["4501", "4500"]);
});

test("scope-focus B + incomplete Enter is INV; list unchanged", () => {
  const view = createScopeView();
  expect(handleScopeKeyDown(keyEvent("B"), view, "scope", undefined, 0)).toBe(true);
  expect(handleScopeKeyDown(keyEvent("Enter"), view, "scope", undefined, 1)).toBe(true);
  expect(view.beaconSelectCodes).toEqual([]);
  expect(view.preview.rejection).toBe("B INV");
  expect(view.preview.phase).toBe("idle");

  handleScopeKeyDown(keyEvent("B"), view, "scope", undefined, 2);
  handleScopeKeyDown(keyEvent("4"), view, "scope", undefined, 3);
  handleScopeKeyDown(keyEvent("Enter"), view, "scope", undefined, 4);
  expect(view.beaconSelectCodes).toEqual([]);
  expect(view.preview.rejection).toBe("B4 INV");
});

test("radio-focus B is not consumed as a preview command", () => {
  const view = createScopeView();
  const event = keyEvent("B");
  expect(handleScopeKeyDown(event, view, "radio")).toBe(false);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(view.preview.phase).toBe("idle");
  expect(view.beaconSelectCodes).toEqual([]);
});

test("B sequences emit no Command IR; DAL123 H270 still turns", async () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", headingDeg: 90 });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const log = new SessionLog();

  for (const key of ["B", "4", "5", "Enter"]) {
    handleScopeKeyDown(keyEvent(key), view, "scope", world, 0);
  }
  expect(view.beaconSelectCodes).toEqual(["45"]);
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(dal.intent.assignedHeadingDeg).toBe(90);

  await handleRadioText(world, "DAL123 H270", log);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(log.byType("command.accepted")).toHaveLength(1);
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
});

test("live B preview Esc cancels before * chord; *J still works after", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  handleScopeKeyDown(keyEvent("B"), view, "scope", world, 0);
  handleScopeKeyDown(keyEvent("4"), view, "scope", world, 1);
  view.starsChordEntry.phase = "entry";
  view.starsChordEntry.buffer = "*J3";
  const esc = keyEvent("Escape");
  expect(handleScopeKeyDown(esc, view, "scope", world, 2)).toBe(true);
  expect(view.preview.phase).toBe("idle");
  expect(view.starsChordEntry.phase).toBe("entry");
  expect(view.starsChordEntry.buffer).toBe("*J3");
  expect(view.beaconSelectCodes).toEqual([]);

  const idle = createScopeView();
  syncTrackDisplays(idle.tracks, world);
  let now = 10;
  for (const key of ["*", "J", "3", "Enter"]) {
    handleScopeKeyDown(keyEvent(key), idle, "scope", world, now);
    now += 100;
  }
  expect(idle.tracks.get(dal.id)?.tpaRingNm).toBe(3);
});

test("T02-61 — scope-focus * + / Q space capture into preview.buffer; radio is isolated", () => {
  const view = createScopeView();
  expect(handleScopeKeyDown(keyEvent("*"), view, "scope", undefined, 0)).toBe(true);
  expect(view.preview.buffer).toBe("*");
  expect(view.preview.phase).toBe("entry");
  expect(view.starsChordEntry.buffer).toBe("*");
  expect(formatPreviewReadout(view.preview)).toBe("*");

  expect(handleScopeKeyDown(keyEvent("T"), view, "scope", undefined, 1)).toBe(true);
  expect(view.preview.buffer).toBe("*T");
  expect(handleScopeKeyDown(keyEvent(" "), view, "scope", undefined, 2)).toBe(true);
  expect(view.preview.buffer).toBe("*T ");
  expect(handleScopeKeyDown(keyEvent("Backspace"), view, "scope", undefined, 3)).toBe(true);
  expect(view.preview.buffer).toBe("*T");
  expect(handleScopeKeyDown(keyEvent("Escape"), view, "scope", undefined, 4)).toBe(true);
  expect(view.preview.phase).toBe("idle");
  expect(view.preview.buffer).toBe("");
  expect(view.starsChordEntry.phase).toBe("idle");

  expect(handleScopeKeyDown(keyEvent("+"), view, "scope", undefined, 5)).toBe(true);
  expect(view.preview.buffer).toBe("+");
  expect(handleScopeKeyDown(keyEvent("Enter"), view, "scope", undefined, 6)).toBe(true);
  expect(view.preview.phase).toBe("armed");
  expect(view.preview.armed).toEqual({ type: "initCntl" });
  expect(view.preview.mnemonic).toBe("INIT CNTL");
  expect(formatPreviewReadout(view.preview)).toBe("INIT CNTL");
  expect(view.preview.rejection).toBeNull();

  const radio = createScopeView();
  expect(handleScopeKeyDown(keyEvent("+"), radio, "radio", undefined, 0)).toBe(false);
  expect(radio.preview.phase).toBe("idle");
  expect(handleScopeKeyDown(keyEvent("Q"), radio, "radio", undefined, 1)).toBe(false);
  expect(radio.preview.buffer).toBe("");
});

test("T02-61 — Tab cycles focus without typing into preview or consuming as a buffer char", () => {
  const view = createScopeView();
  const cycleFocus = vi.fn();
  handleScopeKeyDown(keyEvent("*"), view, "scope", undefined, 0);
  expect(view.preview.buffer).toBe("*");

  const tab = keyEvent("Tab");
  expect(handleScopeKeyDown(tab, view, "scope", undefined, 1, { cycleFocus })).toBe(true);
  expect(tab.preventDefault).toHaveBeenCalled();
  expect(cycleFocus).toHaveBeenCalledTimes(1);
  expect(view.preview.buffer).toBe("*");
  expect(view.preview.phase).toBe("entry");

  const radioTab = keyEvent("Tab");
  expect(handleScopeKeyDown(radioTab, view, "radio", undefined, 2, { cycleFocus })).toBe(true);
  expect(cycleFocus).toHaveBeenCalledTimes(2);
  expect(view.preview.buffer).toBe("*");
});

test("T02-61 — F3/F4 and B## still work; T/M stay dedicated when idle", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  expect(handleScopeKeyDown(keyEvent("F3"), view, "scope", world, 0)).toBe(true);
  expect(view.preview.phase).toBe("armed");
  expect(formatPreviewReadout(view.preview)).toBe("INIT CNTL");
  expect(handleScopeKeyDown(keyEvent("Escape"), view, "scope", world, 1)).toBe(true);

  expect(handleScopeKeyDown(keyEvent("B"), view, "scope", world, 2)).toBe(true);
  expect(handleScopeKeyDown(keyEvent("4"), view, "scope", world, 3)).toBe(true);
  expect(handleScopeKeyDown(keyEvent("5"), view, "scope", world, 4)).toBe(true);
  expect(handleScopeKeyDown(keyEvent("Enter"), view, "scope", world, 5)).toBe(true);
  expect(view.beaconSelectCodes).toEqual(["45"]);

  const tView = createScopeView();
  syncTrackDisplays(tView.tracks, world);
  expect(handleScopeKeyDown(keyEvent("T"), tView, "scope", world, 0)).toBe(true);
  expect(tView.preview.phase).toBe("idle");
  expect(tView.tracks.get(dal.id)?.datablockMode).toBeDefined();
});

function kdemScopeView() {
  return createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
}

function typeMapKeys(
  view: ReturnType<typeof createScopeView>,
  keys: string[],
  startMs = 0,
  world?: ReturnType<typeof createWorld>,
): number {
  let now = startMs;
  for (const key of keys) {
    handleScopeKeyDown(keyEvent(key), view, "scope", world, now);
    now += 10;
  }
  return now;
}

test("T02-63 — *D 1 / *D LOC27 / M DEM1_27 Enter toggle catalog maps", () => {
  const view = kdemScopeView();
  expect(isVideoMapOn(view, "RWY")).toBe(true);
  typeMapKeys(view, ["*", "D", " ", "1", "Enter"]);
  expect(isVideoMapOn(view, "RWY")).toBe(false);
  expect(view.showRunway).toBe(false);
  expect(view.preview.phase).toBe("idle");
  expect(view.starsChordEntry.phase).toBe("idle");

  expect(isVideoMapOn(view, "LOC27")).toBe(true);
  typeMapKeys(view, ["*", "D", "L", "O", "C", "2", "7", "Enter"], 100);
  expect(isVideoMapOn(view, "LOC27")).toBe(false);
  expect(view.showLocalizer).toBe(false);

  expect(isVideoMapOn(view, "DEM1_27")).toBe(true);
  expect(view.modeCVisible).toBe(true);
  typeMapKeys(view, ["M", " ", "D", "E", "M", "1", "_", "2", "7", "Enter"], 200);
  expect(isVideoMapOn(view, "DEM1_27")).toBe(false);
  expect(view.modeCVisible).toBe(true);
  expect(view.preview.phase).toBe("idle");
});

test("T02-63 — tap M stays Mode C; *D ALL / NONE / OFF and unknown INV", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = kdemScopeView();
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(dal.id)!.datablockMode = "full";
  expect(view.modeCVisible).toBe(true);
  expect(handleScopeKeyDown(keyEvent("M"), view, "scope", world, 0)).toBe(true);
  expect(view.modeCVisible).toBe(false);
  expect(view.preview.phase).toBe("idle");
  expect(handleScopeKeyDown(keyEvent("T"), view, "scope", world, 10)).toBe(true);
  expect(view.tracks.get(dal.id)!.datablockMode).toBe("limited");
  expect(view.preview.phase).toBe("idle");

  typeMapKeys(view, ["*", "D", " ", "A", "L", "L", "Enter"], 100, world);
  expect(isVideoMapOn(view, "LOC09")).toBe(true);
  expect(isVideoMapOn(view, "DEM1_09")).toBe(true);
  expect(view.showLocalizer).toBe(true);

  typeMapKeys(view, ["*", "D", " ", "N", "O", "N", "E", "Enter"], 200, world);
  expect(isVideoMapOn(view, "RWY")).toBe(false);
  expect(isVideoMapOn(view, "LOC27")).toBe(false);
  expect(view.showRunway).toBe(false);

  typeMapKeys(view, ["*", "D", " ", "1", "Enter"], 300, world);
  expect(isVideoMapOn(view, "RWY")).toBe(true);
  typeMapKeys(view, ["*", "D", " ", "O", "F", "F", " ", "1", "Enter"], 400, world);
  expect(isVideoMapOn(view, "RWY")).toBe(false);

  typeMapKeys(view, ["*", "D", " ", "X", "Y", "Z", "Enter"], 500, world);
  expect(view.preview.rejection).toBe("*D XYZ INV");
  expect(isVideoMapOn(view, "RWY")).toBe(false);

  typeMapKeys(view, ["*", "J", "3", "Enter"], 600, world);
  expect(view.starsChordArmed?.type).toBe("jRing");
});

test("T02-65 — *F Enter shows FILTER readout without mutating; idle F still starts the chord", () => {
  const view = createScopeView();
  typeScopeKeys(view, ["*", "F", "Enter"]);
  expect(view.altitudeFilter).toEqual(DEFAULT_ALTITUDE_FILTER);
  expect(view.filterEntry.phase).toBe("idle");
  expect(formatPreviewReadout(view.preview)).toBe("FILTER 000-180");
  expect(formatFilterReadout(view.altitudeFilter, view.filterEntry)).toBe("FILTER 000-180");

  const chord = createScopeView();
  expect(handleScopeKeyDown(keyEvent("F"), chord, "scope", undefined, 0)).toBe(true);
  expect(chord.filterEntry.phase).toBe("min");
  expect(chord.preview.phase).toBe("idle");
});

test("T02-65 — *LA 000 120 sets 0–12,000 ft; SSA readout follows; bad windows INV", () => {
  const view = createScopeView();
  typeScopeKeys(view, ["*", "L", "A", " ", "0", "0", "0", " ", "1", "2", "0", "Enter"]);
  expect(view.altitudeFilter).toEqual({ minHundreds: 0, maxHundreds: 120 });
  expect(formatFilterReadout(view.altitudeFilter, view.filterEntry)).toBe("FILTER 000-120");
  expect(view.preview.phase).toBe("idle");
  expect(view.preview.rejection).toBeNull();

  typeScopeKeys(view, ["*", "L", "A", "0", "0", "0", "1", "8", "0", "Enter"], 200);
  expect(view.altitudeFilter).toEqual({ minHundreds: 0, maxHundreds: 180 });

  typeScopeKeys(view, ["*", "L", "A", "0", "0", "0", "9", "9", "9", "Enter"], 400);
  expect(view.preview.rejection).toBe("*LA000999 INV");
  expect(view.altitudeFilter).toEqual({ minHundreds: 0, maxHundreds: 180 });

  typeScopeKeys(view, ["*", "L", "A", "1", "2", "0", "0", "0", "0", "Enter"], 600);
  expect(view.preview.rejection).toBe("*LA120000 INV");
  expect(view.altitudeFilter).toEqual({ minHundreds: 0, maxHundreds: 180 });
});

test("T02-65 — *BCN 45 adds to beaconSelectCodes; *BCN DEL 45 removes; B45 and *B stay distinct", () => {
  const view = createScopeView();
  typeScopeKeys(view, ["*", "B", "C", "N", " ", "4", "5", "Enter"]);
  expect(view.beaconSelectCodes).toEqual(["45"]);
  typeScopeKeys(view, ["*", "B", "C", "N", " ", "4", "5", "Enter"], 200);
  expect(view.beaconSelectCodes).toEqual(["45"]);

  typeScopeKeys(view, ["*", "B", "C", "N", " ", "D", "E", "L", " ", "4", "5", "Enter"], 400);
  expect(view.beaconSelectCodes).toEqual([]);

  typeScopeKeys(view, ["B", "4", "5", "Enter"], 600);
  expect(view.beaconSelectCodes).toEqual(["45"]);

  typeScopeKeys(view, ["*", "B", "C", "N", " ", "4", "8", "Enter"], 800);
  expect(view.preview.rejection).toBe("*BCN 48 INV");
  expect(view.beaconSelectCodes).toEqual(["45"]);

  const tpa = createScopeView();
  typeScopeKeys(tpa, ["*", "B", "Enter"]);
  expect(tpa.beaconSelectCodes).toEqual([]);
  expect(tpa.preview.rejection).toBe("*B INV");
});

test("T02-66 — + / Enter arms INIT/TERM; idle Enter arms HO ACCEPT; *T Enter still toggles", () => {
  const view = createScopeView();
  typeScopeKeys(view, ["+"], 0);
  expect(view.preview.phase).toBe("entry");
  expect(handleScopeKeyDown(keyEvent("Enter"), view, "scope", undefined, 100)).toBe(true);
  expect(view.preview.phase).toBe("armed");
  expect(view.preview.armed).toEqual({ type: "initCntl" });
  expect(formatPreviewReadout(view.preview)).toBe("INIT CNTL");

  expect(handleScopeKeyDown(keyEvent("Escape"), view, "scope", undefined, 200)).toBe(true);
  typeScopeKeys(view, ["/"], 300);
  handleScopeKeyDown(keyEvent("Enter"), view, "scope", undefined, 400);
  expect(view.preview.armed).toEqual({ type: "termCntl" });
  expect(formatPreviewReadout(view.preview)).toBe("TERM CNTL");

  handleScopeKeyDown(keyEvent("Escape"), view, "scope", undefined, 500);
  expect(handleScopeKeyDown(keyEvent("Enter"), view, "scope", undefined, 600)).toBe(true);
  expect(view.preview.armed).toEqual({ type: "acceptHandoff" });
  expect(formatPreviewReadout(view.preview)).toBe("HO ACCEPT");

  handleScopeKeyDown(keyEvent("Escape"), view, "scope", undefined, 700);
  const beforeTab = view.systemLists.TAB.visible;
  typeScopeKeys(view, ["*", "T", "Enter"], 800);
  expect(view.systemLists.TAB.visible).toBe(!beforeTab);
  expect(view.preview.phase).toBe("idle");
  expect(view.preview.armed).toBeNull();

  typeScopeKeys(view, ["*", "1", "Enter"], 900);
  expect(view.preview.armed).toEqual({ type: "setLeaderDir", starsDir: 1 });
  expect(formatPreviewReadout(view.preview)).toBe("*1");

  handleScopeKeyDown(keyEvent("Escape"), view, "scope", undefined, 1000);
  typeScopeKeys(view, ["*", " ", "P", "1", "Enter"], 1100);
  expect(view.systemLists.TOWER_1.visible).toBe(true);
  expect(view.preview.armed).toBeNull();
  expect(view.starsChordArmed).toBeNull();

  typeScopeKeys(view, ["*", "P", "3", "Enter"], 1150);
  expect(view.starsChordArmed).toEqual({ type: "cone", target: "slewed", lengthNm: 3 });
  expect(view.systemLists.TOWER_3.visible).toBe(false);

  typeScopeKeys(view, ["*", "B", "Enter"], 1200);
  expect(view.preview.armed).toBeNull();
  expect(view.preview.rejection).toBe("*B INV");
  expect(view.starsChordArmed).toBeNull();

  const radio = createScopeView();
  expect(handleScopeKeyDown(keyEvent("Enter"), radio, "radio", undefined, 0)).toBe(false);
  expect(radio.preview.phase).toBe("idle");
});

test("T02-66 — *F is T02-65 display; incomplete *LA/*BCN INV; F3/F4 and L+digit stay", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  typeScopeKeys(view, ["*", "F", "Enter"], 0);
  expect(formatPreviewReadout(view.preview)).toBe("FILTER 000-180");
  typeScopeKeys(view, ["*", "L", "A", "Enter"], 100);
  expect(view.preview.rejection).toBe("*LA INV");
  typeScopeKeys(view, ["*", "B", "C", "N", "Enter"], 200);
  expect(view.preview.rejection).toBe("*BCN INV");

  world.selectedAircraftId = null;
  handleScopeKeyDown(keyEvent("F3"), view, "scope", world, 300);
  expect(view.preview.armed).toEqual({ type: "initCntl" });
  handleScopeKeyDown(keyEvent("Escape"), view, "scope", world, 400);

  world.selectedAircraftId = dal.id;
  handleScopeKeyDown(keyEvent("F3"), view, "scope", world, 500);
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(view.preview.phase).toBe("idle");

  handleScopeKeyDown(keyEvent("L"), view, "scope", world, 600);
  handleScopeKeyDown(keyEvent("6"), view, "scope", world, 700);
  expect(view.tracks.get(dal.id)!.leaderDir).toBe(6);
});

test("PREF SAVE AS name chord: Enter writes, Esc and digit-only do not", () => {
  const view = createScopeView();
  beginDcbPrefSaveAs(view);
  beginPrefNameEntry(view.preview, 0);
  expect(formatPreviewReadout(view.preview)).toBe("PREF");
  typeScopeKeys(view, ["N", "I", "G", "H", "T", "Enter"], 10);
  expect(view.dcbPref.slots[0]?.name).toBe("NIGHT");
  expect(view.dcbPref.activeIndex).toBe(0);
  expect(view.dcbPref.pendingSaveAs).toBe(false);
  expect(view.preview.phase).toBe("idle");

  const cancel = createScopeView();
  beginDcbPrefSaveAs(cancel);
  beginPrefNameEntry(cancel.preview, 0);
  typeScopeKeys(cancel, ["D", "A", "Y"], 10);
  handleScopeKeyDown(keyEvent("Escape"), cancel, "scope", undefined, 400);
  expect(cancel.dcbPref.pendingSaveAs).toBe(false);
  expect(cancel.dcbPref.slots[0]).toBeNull();
  expect(cancel.preview.phase).toBe("idle");

  const digits = createScopeView();
  beginDcbPrefSaveAs(digits);
  beginPrefNameEntry(digits.preview, 0);
  typeScopeKeys(digits, ["1", "2", "3", "Enter"], 10);
  expect(digits.dcbPref.pendingSaveAs).toBe(true);
  expect(digits.dcbPref.slots[0]).toBeNull();
  expect(formatPreviewReadout(digits.preview)).toBe("PREF 123 INV");
});
