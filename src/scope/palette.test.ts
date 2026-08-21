import { expect, test } from "vitest";
import {
  HISTORY_TRAIL,
  MAP_BRITE_STEPS,
  PALETTE,
  historyTrailColor,
  mapBriteColors,
} from "./palette";

test("TCW palette follows FAA/CRC/vice grammar, not a green CRT game map", () => {
  expect(PALETTE.background).toBe("#000000");
  expect(PALETTE.map.toUpperCase()).toBe("#8C8C8C");
  expect(PALETTE.mapDim.toUpperCase()).toBe("#606060");
  expect(PALETTE.map.toLowerCase()).not.toBe("#00aa00");
  expect(PALETTE.unowned).toBe("#00FF00");
  expect(PALETTE.unowned.toUpperCase()).not.toBe("#B8E0D0");
  expect(PALETTE.unowned.toUpperCase()).not.toBe("#DDDDDD");
  expect(PALETTE.owned).toBe("#FFFFFF");
  expect(PALETTE.owned.toUpperCase()).not.toBe("#00FF66");
  expect(PALETTE.positionSymbol.toUpperCase()).toBe("#1E78FF");
  expect(PALETTE.history.toUpperCase()).toBe("#1E50C8");
  expect(PALETTE.ptl).toBe("#FFFFFF");
  expect(PALETTE.ssa).toBe("#00FF00");
  expect(PALETTE.dcbText).toBe("#00FF00");
  expect(PALETTE.selected).toBe("#FFFF00");
  expect(PALETTE.owned.toLowerCase()).not.toBe("#ff0000");
  expect(PALETTE.unowned.toLowerCase()).not.toBe("#ff0000");
});

test("history trail is independent blue, newest brighter than oldest", () => {
  expect(HISTORY_TRAIL).toHaveLength(5);
  expect(historyTrailColor(0, 5)).toBe(HISTORY_TRAIL[4]);
  expect(historyTrailColor(4, 5)).toBe(HISTORY_TRAIL[0]);
  expect(historyTrailColor(0, 1)).toBe(HISTORY_TRAIL[0]);
  expect(historyTrailColor(0, 5).toLowerCase()).not.toBe("#808080");
  expect(historyTrailColor(0, 5).toLowerCase()).not.toBe(PALETTE.unowned.toLowerCase());
  expect(historyTrailColor(0, 5).toLowerCase()).not.toBe(PALETTE.owned.toLowerCase());
});

test("BRITE steps gray maps only; SSA/track colors stay put", () => {
  expect(MAP_BRITE_STEPS.length).toBe(3);
  expect(mapBriteColors(0).map).not.toBe(mapBriteColors(1).map);
  expect(mapBriteColors(1).map).toBe(PALETTE.map);
  expect(mapBriteColors(2).map.toLowerCase()).not.toBe("#00ee00");
  expect(PALETTE.unowned).toBe("#00FF00");
  expect(PALETTE.owned).toBe("#FFFFFF");
});

test("palette comments name video map / datablock grammar, not tiles or nametags", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./palette.ts"]!;
  expect(src).toMatch(/7210\.3/);
  expect(src).toMatch(/CRC STARS/);
  expect(src).toMatch(/vice/);
  expect(src).toMatch(/Owned FDB white/);
  expect(src).toMatch(/dim gray/);
  expect(src.toLowerCase()).not.toMatch(/\bosm\b/);
  expect(src.toLowerCase()).not.toMatch(/nametag/);
  expect(src.toLowerCase()).not.toMatch(/sprite/);
});
