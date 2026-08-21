import { expect, test, vi } from "vitest";
import {
  handleScopeKeyDown,
  handleScopeWheel,
  isAlwaysOnScopeKey,
  type ScopeFocus,
} from "./scopeKeys";
import { createScopeView } from "./scopeView";

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

test("always-on keys are PageUp, PageDown, Home, End, F8; H is not always-on", () => {
  expect(isAlwaysOnScopeKey("PageUp")).toBe(true);
  expect(isAlwaysOnScopeKey("Home")).toBe(true);
  expect(isAlwaysOnScopeKey("F8")).toBe(true);
  expect(isAlwaysOnScopeKey("R")).toBe(false);
  expect(isAlwaysOnScopeKey("C")).toBe(false);
  expect(isAlwaysOnScopeKey("H")).toBe(false);
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
    "./ppiPointer.ts",
    "./scopeView.ts",
    "./camera.ts",
    "./history.ts",
    "./trackDisplay.ts",
    "./targetSymbol.ts",
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
