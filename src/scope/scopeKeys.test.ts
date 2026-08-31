import { expect, test, vi } from "vitest";
import { handleScopeKeyDown, handleScopeWheel, isAlwaysOnScopeKey } from "./scopeKeys";
import { createScopeView } from "./scopeView";

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

test("always-on keys include PageUp, Home, F3, F7; H and T are not", () => {
  expect(isAlwaysOnScopeKey("PageUp")).toBe(true);
  expect(isAlwaysOnScopeKey("Home")).toBe(true);
  expect(isAlwaysOnScopeKey("F3")).toBe(true);
  expect(isAlwaysOnScopeKey("F7")).toBe(true);
  expect(isAlwaysOnScopeKey("H")).toBe(false);
  expect(isAlwaysOnScopeKey("T")).toBe(false);
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

test("F7 toggles PTL ALL", () => {
  const view = createScopeView();
  expect(view.ptlOn).toBe(false);
  handleScopeKeyDown(keyEvent("F7"), view);
  expect(view.ptlOn).toBe(true);
  handleScopeKeyDown(keyEvent("F7"), view);
  expect(view.ptlOn).toBe(false);
});
