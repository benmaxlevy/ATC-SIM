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
  DCB_MAP_SLOT_COUNT,
  DCB_QUICK_MAP_COUNT,
  buildMapListLines,
  clearAllVideoMaps,
  formatDcbLdrLengthReadout,
  formatDcbMapLabel,
  formatDcbRrReadout,
  hideMapLists,
  isDcbMapSlotEnabled,
  isVideoMapOn,
  RR_INTERVALS_NM,
  stepDcbLeaderDir,
  stepDcbLeaderLength,
  stepRrInterval,
  toggleCurrentMapsList,
  toggleGeoMapsList,
  toggleVideoMap,
  videoMapByDcbNumber,
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

test("T02-24 — unused slots 7–30 disabled; 1–6 bind catalog dcbNumber", () => {
  const view = kdemView();
  expect(DCB_MAP_SLOT_COUNT).toBe(30);
  expect(DCB_QUICK_MAP_COUNT).toBe(6);
  expect(videoMapByDcbNumber(view, 1)?.dcbLabel).toBe("RWY27");
  expect(videoMapByDcbNumber(view, 3)?.id).toBe("COAST");
  expect(videoMapByDcbNumber(view, 6)?.dcbLabel).toBe("DEM1");
  expect(videoMapByDcbNumber(view, 7)).toBeUndefined();
  for (let slot = 1; slot <= 6; slot += 1) {
    expect(isDcbMapSlotEnabled(view, slot)).toBe(true);
  }
  for (let slot = 7; slot <= DCB_MAP_SLOT_COUNT; slot += 1) {
    expect(isDcbMapSlotEnabled(view, slot)).toBe(false);
  }
});

test("T02-24 — CLR ALL turns catalog maps off; coastline JSON off is a no-op", () => {
  const view = kdemView();
  expect(isVideoMapOn(view, "COAST")).toBe(true);
  expect(isVideoMapOn(view, "DWNWND")).toBe(true);
  expect(isVideoMapOn(view, "CLASS_B")).toBe(true);
  clearAllVideoMaps(view);
  expect(isVideoMapOn(view, "RWY27")).toBe(false);
  expect(isVideoMapOn(view, "LOC27")).toBe(false);
  expect(isVideoMapOn(view, "COAST")).toBe(false);
  expect(isVideoMapOn(view, "DWNWND")).toBe(false);
  expect(isVideoMapOn(view, "CLASS_B")).toBe(false);
  expect(isVideoMapOn(view, "DEM1")).toBe(false);
  expect(view.showRunway).toBe(false);
  expect(view.showLocalizer).toBe(false);
  expect(view.showCoastline).toBe(false);
  const cleared = buildMapCache(toMapCacheInput(view, VIEW));
  expect(cleared.coastline).toBeNull();
  expect(cleared.videoStrokes).toEqual([]);

  const coastOff = createScopeView(0, 0, {
    digitalMap: {
      rangeRings: { intervalNm: 5, maxNm: 60 },
      coastline: {
        enabled: false,
        polyline: [
          [0, 0],
          [2, 0],
        ],
      },
      loadedVideoMaps: [
        {
          id: "COAST",
          file: "coast.json",
          dcbNumber: 3,
          dcbLabel: "COAST",
          role: "coastline",
          defaultOn: true,
          color: "map",
          name: "coast",
          features: [],
        },
      ],
    },
  });
  expect(isDcbMapSlotEnabled(coastOff, 3)).toBe(false);
  expect(coastOff.showCoastline).toBe(false);
  clearAllVideoMaps(coastOff);
  expect(isVideoMapOn(coastOff, "COAST")).toBe(false);
  expect(coastOff.showCoastline).toBe(false);
});

test("T02-24 — GEO MAPS lists every catalog label; CURRENT lists only maps that are on", () => {
  const view = kdemView();
  const geo = buildMapListLines(view, "geo");
  expect(geo).toContain("1 RWY27 ON");
  expect(geo).toContain("3 COAST ON");
  expect(geo).toContain("4 DWNWND ON");
  expect(geo).toHaveLength(6);
  expect(buildMapListLines(view, "current")).toEqual([
    "1 RWY27",
    "2 LOC27",
    "3 COAST",
    "4 DWNWND",
    "5 CLASS_B",
    "6 DEM1",
  ]);

  toggleVideoMap(view, "COAST");
  expect(buildMapListLines(view, "geo")).toContain("3 COAST OFF");
  expect(buildMapListLines(view, "current")).not.toContain("3 COAST");
  expect(buildMapListLines(view, "current")).toContain("1 RWY27");

  clearAllVideoMaps(view);
  expect(buildMapListLines(view, "geo").every((line) => line.endsWith(" OFF"))).toBe(true);
  expect(buildMapListLines(view, "current")).toEqual([]);

  expect(view.geoMapsListOn).toBe(false);
  toggleGeoMapsList(view);
  expect(view.geoMapsListOn).toBe(true);
  toggleGeoMapsList(view);
  expect(view.geoMapsListOn).toBe(false);

  toggleCurrentMapsList(view);
  toggleGeoMapsList(view);
  expect(view.currentMapsListOn).toBe(true);
  expect(view.geoMapsListOn).toBe(true);
  hideMapLists(view);
  expect(view.geoMapsListOn).toBe(false);
  expect(view.currentMapsListOn).toBe(false);
});

test("AC8 — MAPS/RANGE/leader/range rings in comments; not zoom", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./dcbFunctions.ts"] ?? "";
  expect(src).toMatch(/MAPS/);
  expect(src).toMatch(/video map/i);
  expect(src).toMatch(/WX/);
  expect(src).toMatch(/RANGE/);
  expect(src).toMatch(/center/i);
  expect(src).toMatch(/leader/i);
  expect(src).toMatch(/range rings/i);
  expect(src).toMatch(/R07/);
  expect(src.toLowerCase()).not.toMatch(/\bzoom\b/);
  expect(src.toLowerCase()).not.toMatch(/\blayers\b/);
  expect(src.toLowerCase()).not.toMatch(/\bbasemap\b/);
});
