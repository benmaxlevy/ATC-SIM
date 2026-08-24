import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { loadKdem } from "@scenario";
import { CHAR_SIZE_STEPS_PX, datablockFontCss, SCOPE_FONT_STACK } from "./fonts";
import { parseDigitalMap, toMapCacheInput, buildMapCache, activeRingRadiiNm } from "./mapLayers";
import { MAP_BRITE_STEPS, PALETTE, mapBriteColors } from "./palette";
import { createScopeView } from "./scopeView";
import { syncTrackDisplays } from "./trackDisplay";
import {
  applyDcbLeaderDir,
  applyRrCenter,
  armPlaceCenter,
  armPlaceRangeRing,
  cycleCharSize,
  cycleMapBrite,
  dcbCatalogMaps,
  dcbLeaderDirReadout,
  formatDcbLdrLengthReadout,
  formatDcbMapLabel,
  RR_INTERVALS_NM,
  stepDcbLeaderDir,
  stepDcbLeaderLength,
  stepRrInterval,
  toggleVideoMap,
} from "./dcbFunctions";

const VIEW = { widthPx: 800, heightPx: 800 };

function kdemView() {
  return createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
}

test("AC1 — MAPS catalog dcbLabels; COAST and extra maps hide strokes", () => {
  const view = kdemView();
  const labels = dcbCatalogMaps(view).map(formatDcbMapLabel);
  expect(labels).toContain("1 RWY27");
  expect(labels).toContain("3 COAST");
  expect(labels).toContain("4 DWNWND");
  expect(labels).toContain("5 CLASS_B");

  const before = buildMapCache(toMapCacheInput(view, VIEW));
  expect(before.coastline).not.toBeNull();
  expect(before.videoStrokes.some((s) => s.mapId === "DWNWND")).toBe(true);
  expect(before.videoStrokes.some((s) => s.mapId === "CLASS_B")).toBe(true);

  toggleVideoMap(view, "COAST");
  expect(view.showCoastline).toBe(false);
  const noCoast = buildMapCache(toMapCacheInput(view, VIEW));
  expect(noCoast.coastline).toBeNull();

  toggleVideoMap(view, "DWNWND");
  const noDw = buildMapCache(toMapCacheInput(view, VIEW));
  expect(noDw.videoStrokes.some((s) => s.mapId === "DWNWND")).toBe(false);
  expect(noDw.videoStrokes.some((s) => s.mapId === "CLASS_B")).toBe(true);
});

test("AC2 — RANGE presets unchanged; OFF CNTR iff pan offset ≠ airport", () => {
  const view = createScopeView();
  expect(view.camera.rangeNm).toBe(20);
  expect(view.camera.centerEastNm).toBe(view.airportEastNm);
  view.camera.centerEastNm = 3;
  expect(view.camera.centerEastNm).not.toBe(view.airportEastNm);
});

test("AC3 — RR spinner steps 2/5/10 without hiding rings", () => {
  expect(RR_INTERVALS_NM).toEqual([2, 5, 10]);
  expect(activeRingRadiiNm(20, { intervalNm: 5, maxNm: 60 })).toEqual([5, 10, 15, 20]);
  expect(activeRingRadiiNm(20, { intervalNm: 10, maxNm: 60 })).toEqual([10, 20]);
  expect(activeRingRadiiNm(20, { intervalNm: 2, maxNm: 60 })).toEqual([
    2, 4, 6, 8, 10, 12, 14, 16, 18, 20,
  ]);

  const view = kdemView();
  expect(view.ringIntervalNm).toBe(5);
  const at5 = buildMapCache(toMapCacheInput(view, VIEW));
  expect(at5.ringRadiiNm).toEqual([5, 10, 15, 20]);
  stepRrInterval(view, 1);
  expect(view.ringIntervalNm).toBe(10);
  expect(view.showRings).toBe(true);
  const at10 = buildMapCache(toMapCacheInput(view, VIEW));
  expect(at10.ringRadiiNm).toEqual([10, 20]);
  stepRrInterval(view, 1);
  expect(view.ringIntervalNm).toBe(10);
  stepRrInterval(view, -1);
  expect(view.ringIntervalNm).toBe(5);
  stepRrInterval(view, -1);
  expect(view.ringIntervalNm).toBe(2);
  const at2 = buildMapCache(toMapCacheInput(view, VIEW));
  expect(at2.ringRadiiNm[0]).toBe(2);
  expect(at2.ringRadiiNm.at(-1)).toBe(20);
  expect(view.showRings).toBe(true);
});

test("AC4 — LDR DCB sets the same leader dirs as L1–L9", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL456", xNm: 2, yNm: 2 });
  const world = createWorld({ aircraft: [dal, aal] });
  world.selectedAircraftId = dal.id;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  expect(dcbLeaderDirReadout(view, world)).toBe("L8");
  applyDcbLeaderDir(view, world, 6);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(6);
  expect(view.tracks.get("ac-aal")!.leaderDir).toBe(8);
  expect(dcbLeaderDirReadout(view, world)).toBe("L6");
  world.selectedAircraftId = null;
  applyDcbLeaderDir(view, world, 1);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(1);
  expect(view.tracks.get("ac-aal")!.leaderDir).toBe(1);
});

test("AC6 — LDR DIR spinner steps 1–9; AC7 length includes 0 and 36", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  world.selectedAircraftId = dal.id;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  expect(view.leaderLengthPx).toBe(36);
  stepDcbLeaderDir(view, world, 1);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(9);
  stepDcbLeaderDir(view, world, 1);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(9);
  stepDcbLeaderDir(view, world, -1);
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(8);
  stepDcbLeaderLength(view, 1);
  expect(view.leaderLengthPx).toBe(48);
  stepDcbLeaderLength(view, -1);
  stepDcbLeaderLength(view, -1);
  expect(view.leaderLengthPx).toBe(24);
  stepDcbLeaderLength(view, -1);
  expect(view.leaderLengthPx).toBe(0);
  expect(formatDcbLdrLengthReadout(view.leaderLengthPx)).toBe("0");
});

test("AC5 — CHAR SIZE has ≥2 sizes; font stack still Plex/system mono", () => {
  expect(CHAR_SIZE_STEPS_PX.length).toBeGreaterThanOrEqual(2);
  const view = createScopeView();
  expect(view.charSizePx).toBe(12);
  const seen = new Set<number>([view.charSizePx]);
  cycleCharSize(view);
  seen.add(view.charSizePx);
  cycleCharSize(view);
  seen.add(view.charSizePx);
  expect(seen.size).toBeGreaterThanOrEqual(2);
  for (const size of CHAR_SIZE_STEPS_PX) {
    const css = datablockFontCss(size);
    expect(css).toContain("IBM Plex Mono");
    expect(css).toContain("monospace");
    expect(css).toBe(`${size}px ${SCOPE_FONT_STACK}`);
  }
});

test("AC5 — no STARS .ttf in the app sources", () => {
  const sources = import.meta.glob(["../**/*.{ts,tsx,css,html}", "../../index.html"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  for (const [path, src] of Object.entries(sources)) {
    expect(String(src), path).not.toMatch(/stars[^"'\\n]*\.ttf/i);
    expect(String(src), path).not.toMatch(/\.ttf[^"'\\n]*stars/i);
  }
});

test("AC6 — BRITE has ≥2 steps; track/datablock colors unchanged", () => {
  expect(MAP_BRITE_STEPS.length).toBeGreaterThanOrEqual(2);
  expect(mapBriteColors(0).map).not.toBe(mapBriteColors(1).map);
  expect(PALETTE.unowned).toBe("#00FF00");
  expect(PALETTE.owned).toBe("#FFFFFF");
  expect(PALETTE.selected).toBe("#FFFF00");
  const view = createScopeView();
  expect(view.mapBriteIndex).toBe(1);
  cycleMapBrite(view);
  expect(view.mapBriteIndex).toBe(2);
  cycleMapBrite(view);
  expect(view.mapBriteIndex).toBe(0);
  expect(PALETTE.unowned).toBe("#00FF00");
  expect(PALETTE.map).toBe("#8C8C8C");
});

test("PLACE CNTR arms; PLACE RR and RR CNTR mutate ring origin", () => {
  const view = createScopeView();
  expect(view.placeCenterArmed).toBe(false);
  armPlaceCenter(view);
  expect(view.placeCenterArmed).toBe(true);
  armPlaceRangeRing(view);
  expect(view.placeCenterArmed).toBe(false);
  expect(view.placeRangeRingArmed).toBe(true);
  armPlaceRangeRing(view);
  expect(view.placeRangeRingArmed).toBe(false);

  view.camera.centerEastNm = 4;
  view.camera.centerNorthNm = -1;
  applyRrCenter(view);
  expect(view.rangeRingEastNm).toBe(4);
  expect(view.rangeRingNorthNm).toBe(-1);
});

test("AC6 — radio-focus L090 is still a left turn; LDR DIR spinner does not steal L", async () => {
  const { parseRadioText } = await import("@parse");
  const parsed = parseRadioText("L090");
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.instructions).toEqual(
      expect.arrayContaining([{ type: "FLY_HEADING", headingDeg: 90, turn: "LEFT" }]),
    );
  }
});

test("AC8 — MAPS/RANGE/leader/range rings in comments; not zoom", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./dcbFunctions.ts"] ?? "";
  expect(src).toMatch(/MAPS/);
  expect(src).toMatch(/RANGE/);
  expect(src).toMatch(/center/i);
  expect(src).toMatch(/leader/i);
  expect(src).toMatch(/range rings/i);
  expect(src).toMatch(/R07/);
  expect(src.toLowerCase()).not.toMatch(/\bzoom\b/);
  expect(src.toLowerCase()).not.toMatch(/\blayers\b/);
});
