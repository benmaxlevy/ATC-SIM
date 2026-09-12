import { expect, test, vi } from "vitest";
import { createWorld, makeTestAircraft, setSelectedAircraft } from "@core";
import {
  handleScopeKeyDown,
  handleScopeKeyUp,
  handleScopeWheel,
  isAlwaysOnScopeKey,
} from "../scopeKeys";
import { createScopeView } from "../scopeView";

function keyEvent(key: string, opts?: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) {
  return {
    key,
    ctrlKey: opts?.ctrlKey,
    shiftKey: opts?.shiftKey,
    altKey: opts?.altKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

test("always-on keys include PageUp, Home, F1-F6, F7-F11, Insert, ?; H and T are not", () => {
  expect(isAlwaysOnScopeKey("PageUp")).toBe(true);
  expect(isAlwaysOnScopeKey("Home")).toBe(true);
  expect(isAlwaysOnScopeKey("F1")).toBe(true);
  expect(isAlwaysOnScopeKey("F2")).toBe(true);
  expect(isAlwaysOnScopeKey("F3")).toBe(true);
  expect(isAlwaysOnScopeKey("F4")).toBe(true);
  expect(isAlwaysOnScopeKey("F5")).toBe(true);
  expect(isAlwaysOnScopeKey("F6")).toBe(true);
  expect(isAlwaysOnScopeKey("F7")).toBe(true);
  expect(isAlwaysOnScopeKey("F8")).toBe(true);
  expect(isAlwaysOnScopeKey("F9")).toBe(true);
  expect(isAlwaysOnScopeKey("F10")).toBe(true);
  expect(isAlwaysOnScopeKey("F11")).toBe(true);
  expect(isAlwaysOnScopeKey("Insert")).toBe(true);
  expect(isAlwaysOnScopeKey("Ins")).toBe(true);
  expect(isAlwaysOnScopeKey("?")).toBe(true);
  expect(isAlwaysOnScopeKey("H")).toBe(false);
  expect(isAlwaysOnScopeKey("T")).toBe(false);
});

test("scope L and a digit stay in Preview Area; they never apply a leader direction", () => {
  const ac = makeTestAircraft({ id: "ac1", callsign: "DAL123" });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  const before = view.tracks.get(ac.id)?.leaderDir;

  expect(handleScopeKeyDown(keyEvent("L"), view, "scope", world)).toBe(true);
  expect(view.preview.buffer).toBe("L");
  expect(handleScopeKeyDown(keyEvent("1"), view, "scope", world)).toBe(true);
  expect(view.preview.buffer).toBe("L1");
  expect(view.tracks.get(ac.id)?.leaderDir).toBe(before);
});

test("PageUp five times from 20 NM is 5 NM; center unchanged", () => {
  const view = createScopeView();
  view.camera.centerEastNm = 2;
  view.camera.centerNorthNm = 3;
  for (let i = 0; i < 5; i += 1) {
    expect(handleScopeKeyDown(keyEvent("PageUp"), view)).toBe(true);
  }
  expect(view.camera.rangeNm).toBe(5);
  expect(view.camera.centerEastNm).toBe(2);
});

test("wheel changes range and does not move center", () => {
  const view = createScopeView();
  const centerEast = view.camera.centerEastNm;
  const wheel = { deltaY: -120, preventDefault: vi.fn() };
  expect(handleScopeWheel(wheel, view)).toBe(true);
  expect(view.camera.rangeNm).toBe(15);
  expect(view.camera.centerEastNm).toBe(centerEast);
});

test("Appendix D: F1 arms INIT CNTL and F3 reserves Track Suspend", () => {
  const view = createScopeView();
  expect(view.helpOpen).toBe(false);

  handleScopeKeyDown(keyEvent("F1"), view);
  expect(view.preview.armed).toEqual({ type: "initCntl" });
  expect(view.helpOpen).toBe(false);

  handleScopeKeyDown(keyEvent("Escape"), view);
  handleScopeKeyDown(keyEvent("F1"), view);
  expect(view.preview.armed).toEqual({ type: "initCntl" });

  handleScopeKeyUp(keyEvent("F1"), view);
  expect(view.preview.armed).toEqual({ type: "initCntl" });

  handleScopeKeyDown(keyEvent("Escape"), view);
  handleScopeKeyDown(keyEvent("F3"), view);
  expect(view.preview.armed).toBeNull();
  expect(view.helpOpen).toBe(false);
});

test("Appendix D: F6 enters FLT DATA in both focus modes and consumes key", () => {
  for (const focus of ["scope", "radio"] as const) {
    const view = createScopeView();
    const event = keyEvent("F6");
    expect(handleScopeKeyDown(event, view, focus)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(view.preview.phase).toBe("entry");
    expect(view.preview.mnemonic).toBe("FLT DATA");
    expect(view.preview.buffer).toBe("");
  }
});

test("Help overlay toggle via ? / Shift+/ and Alt+F1; Escape closes it", () => {
  const view = createScopeView();
  expect(view.helpOpen).toBe(false);

  // Toggle open via ?
  handleScopeKeyDown(keyEvent("?"), view);
  expect(view.helpOpen).toBe(true);

  // Escape closes help overlay
  handleScopeKeyDown(keyEvent("Escape"), view);
  expect(view.helpOpen).toBe(false);

  // Toggle open via Shift+/
  handleScopeKeyDown(keyEvent("/", { shiftKey: true }), view);
  expect(view.helpOpen).toBe(true);

  // Toggle closed via ?
  handleScopeKeyDown(keyEvent("?"), view);
  expect(view.helpOpen).toBe(false);

  // Toggle open via Alt+F1
  handleScopeKeyDown(keyEvent("F1", { altKey: true }), view);
  expect(view.helpOpen).toBe(true);
  handleScopeKeyDown(keyEvent("Escape"), view);
  expect(view.helpOpen).toBe(false);
});

test("Table 18: Ctrl+F1 <CNTR> centers on airport", () => {
  const view = createScopeView();
  view.camera.centerEastNm = 15;
  view.camera.centerNorthNm = 25;
  handleScopeKeyDown(keyEvent("F1", { ctrlKey: true }), view);
  expect(view.camera.centerEastNm).toBe(view.airportEastNm);
  expect(view.camera.centerNorthNm).toBe(view.airportNorthNm);
});

test("Table 18: Ctrl+F2 <MAPS> opens DCB MAPS submenu", () => {
  const view = createScopeView();
  expect(view.dcbMenu).toBe("MAIN");
  handleScopeKeyDown(keyEvent("F2", { ctrlKey: true }), view);
  expect(view.dcbMenu).toBe("MAPS");
});

test("Table 18: Ctrl+F3 <BRITE> opens DCB BRITE submenu", () => {
  const view = createScopeView();
  expect(view.dcbMenu).toBe("MAIN");
  handleScopeKeyDown(keyEvent("F3", { ctrlKey: true }), view);
  expect(view.dcbMenu).toBe("BRITE");
});

test("Table 18: Ctrl+F4 <LDR> opens DCB LDR submenu", () => {
  const view = createScopeView();
  expect(view.dcbMenu).toBe("MAIN");
  handleScopeKeyDown(keyEvent("F4", { ctrlKey: true }), view);
  expect(view.dcbMenu).toBe("LDR");
});

test("Table 18: Ctrl+F5 <CHAR SIZE> opens DCB CHAR SIZE submenu", () => {
  const view = createScopeView();
  expect(view.dcbMenu).toBe("MAIN");
  handleScopeKeyDown(keyEvent("F5", { ctrlKey: true }), view);
  expect(view.dcbMenu).toBe("CHAR_SIZE");
});

test("Table 18: Ctrl+F7 <SHIFT> toggles DCB main/aux menus", () => {
  const view = createScopeView();
  expect(view.dcbMenu).toBe("MAIN");
  handleScopeKeyDown(keyEvent("F7", { ctrlKey: true }), view);
  expect(view.dcbMenu).toBe("AUX");
  handleScopeKeyDown(keyEvent("F7", { ctrlKey: true }), view);
  expect(view.dcbMenu).toBe("MAIN");
});

test("Table 18: Ctrl+F8 <DCB> toggles DCB display visibility", () => {
  const view = createScopeView();
  expect(view.dcbVisible).toBe(true);
  handleScopeKeyDown(keyEvent("F8", { ctrlKey: true }), view);
  expect(view.dcbVisible).toBe(false);
  handleScopeKeyDown(keyEvent("F8", { ctrlKey: true }), view);
  expect(view.dcbVisible).toBe(true);
});

test("Table 18: Ctrl+F9 <RNG RING> arms DCB RR spinner", () => {
  const view = createScopeView();
  expect(view.dcbSpinner.armed).toBe(false);
  handleScopeKeyDown(keyEvent("F9", { ctrlKey: true }), view);
  expect(view.dcbSpinner.armed).toBe(true);
  expect(view.dcbSpinner.cell).toBe("RR");
});

test("Table 18: Ctrl+F10 <RANGE> arms DCB RANGE spinner", () => {
  const view = createScopeView();
  expect(view.dcbSpinner.armed).toBe(false);
  handleScopeKeyDown(keyEvent("F10", { ctrlKey: true }), view);
  expect(view.dcbSpinner.armed).toBe(true);
  expect(view.dcbSpinner.cell).toBe("RANGE");
});

test("Table 18: Ctrl+F11 <WX> toggles WX layers on/off", () => {
  const view = createScopeView();
  expect(view.wxLevels.some(Boolean)).toBe(false);
  handleScopeKeyDown(keyEvent("F11", { ctrlKey: true }), view);
  expect(view.wxLevels.every(Boolean)).toBe(true);
  handleScopeKeyDown(keyEvent("F11", { ctrlKey: true }), view);
  expect(view.wxLevels.some(Boolean)).toBe(false);
});

test("Table 18: Ins / Insert <PREF SET> initiates DCB PREF function", () => {
  const view = createScopeView();
  expect(view.dcbMenu).toBe("MAIN");
  handleScopeKeyDown(keyEvent("Insert"), view);
  expect(view.dcbMenu).toBe("PREF");

  view.dcbMenu = "MAIN";
  handleScopeKeyDown(keyEvent("Ins"), view);
  expect(view.dcbMenu).toBe("PREF");
});

test("Table 18: F5 <HND OFF> triggers handoff on selection (and Shift+H backwards alias)", () => {
  const ac = makeTestAircraft({ id: "ac1", callsign: "DAL123" });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  setSelectedAircraft(world, "ac1");

  expect(handleScopeKeyDown(keyEvent("F5"), view, "radio", world)).toBe(true);
  // Shift+H alias also works
  expect(handleScopeKeyDown(keyEvent("H", { shiftKey: true }), view, "radio", world)).toBe(true);
});

test("Table 18: F7 <MULTI FUNC> initiates STARS multi-func preview buffer (*)", () => {
  const view = createScopeView();
  expect(view.preview.phase).toBe("idle");
  handleScopeKeyDown(keyEvent("F7"), view);
  expect(view.preview.phase).toBe("entry");
  expect(view.preview.buffer).toBe("*");

  // Appends * when already in entry phase
  handleScopeKeyDown(keyEvent("F7"), view);
  expect(view.preview.buffer).toBe("**");
});

test("Table 18: F10 <PTL> toggles PTL ALL", () => {
  const view = createScopeView();
  expect(view.ptlOn).toBe(false);
  handleScopeKeyDown(keyEvent("F10"), view);
  expect(view.ptlOn).toBe(true);
  handleScopeKeyDown(keyEvent("F10"), view);
  expect(view.ptlOn).toBe(false);
});

test("Table 18: F11 <CA> functional key buffers CA into preview area", () => {
  const view = createScopeView();
  expect(view.preview.phase).toBe("idle");
  handleScopeKeyDown(keyEvent("F11"), view);
  expect(view.preview.phase).toBe("entry");
  expect(view.preview.buffer).toBe("CA ");
});

test("Escape closes DCB submenu without hiding map lists (ML)", () => {
  const view = createScopeView();
  view.dcbMenu = "MAPS";
  view.systemLists.ML.visible = true;
  view.geoMapsListOn = true;
  view.mapListMode = "GEO";

  const res = handleScopeKeyDown(keyEvent("Escape"), view);
  expect(res).toBe(true);
  expect(view.dcbMenu).toBe("MAIN");
  expect(view.systemLists.ML.visible).toBe(true);
  expect(view.geoMapsListOn).toBe(true);
});
