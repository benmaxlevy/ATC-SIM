import { expect, test } from "vitest";
import { formatFpsDebug, isFpsDebugEnabled } from "./fpsHud";

test("T02-12 — FPS HUD is opt-in via ?debug=fps", () => {
  expect(isFpsDebugEnabled("")).toBe(false);
  expect(isFpsDebugEnabled("?traffic=30")).toBe(false);
  expect(isFpsDebugEnabled("?debug=fps")).toBe(true);
  expect(isFpsDebugEnabled("?traffic=30&debug=fps")).toBe(true);
  expect(isFpsDebugEnabled("?debug=other")).toBe(false);
});

test("T02-12 AC7 — bench chrome says TRACKS, not planes or sprites", () => {
  expect(formatFpsDebug(30, 59)).toBe("30 TRACKS  FPS 59");
  expect(formatFpsDebug(30, 59).toLowerCase()).not.toMatch(/plane/);
  expect(formatFpsDebug(30, 59).toLowerCase()).not.toMatch(/sprite/);
});
