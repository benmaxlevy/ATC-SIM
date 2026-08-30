import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { loadKdem, loadVideoMapGroups, loadVideoMapSet } from "@scenario";
import {
  CHAR_SIZE_STEPS_PX,
  DCB_CHAR_SIZE_STEPS_PX,
  POS_SIZE_STEPS_PX,
  datablockFontCss,
  SCOPE_FONT_STACK,
} from "./fonts";
import { parseDigitalMap, toMapCacheInput, buildMapCache, activeRingRadiiNm } from "./mapLayers";
import { BRITE_DISABLED_CHANNELS, BRITE_STEPS, PALETTE, applyBrite } from "./palette";
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
  dcbMapsPageSlotNumbers,
  DCB_GROUP_SLOT_COUNT,
  DCB_GROUP_SUBMENU_SLOT_START,
  DCB_MAP_SLOT_COUNT,
  DCB_QUICK_MAP_COUNT,
  defaultSelectedMapGroupId,
  buildMapListLines,
  clearAllVideoMaps,
  formatDcbLdrLengthReadout,
  formatDcbMapLabel,
  hideMapLists,
  isDcbMapSlotEnabled,
  isVideoMapOn,
  resolveVideoMapToken,
  selectedVideoMapGroup,
  RR_INTERVALS_NM,
  setAllVideoMaps,
  stepBriteChannel,
  stepCharSizeChannel,
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

test("AC1 — MAPS catalog dcbLabels; extra maps hide strokes", () => {
  const view = kdemView();
  const labels = dcbCatalogMaps(view).map(formatDcbMapLabel);
  expect(labels).toContain("1 RWY");
  expect(labels).toContain("4 DEM1_27");
  expect(labels).toContain("6 BAY1_27");

  const before = buildMapCache(toMapCacheInput(view, VIEW));
  expect(before.videoStrokes.some((s) => s.mapId === "DEM1_27")).toBe(true);
  expect(before.videoStrokes.some((s) => s.mapId === "BAY1_27")).toBe(true);

  toggleVideoMap(view, "DEM1_27");
  const noDem = buildMapCache(toMapCacheInput(view, VIEW));
  expect(noDem.videoStrokes.some((s) => s.mapId === "DEM1_27")).toBe(false);
  expect(noDem.videoStrokes.some((s) => s.mapId === "BAY1_27")).toBe(true);
});

test("LOC09 toggle paints the west feather; turning LOC27 off does not hide LOC09", () => {
  const view = kdemView();
  toggleVideoMap(view, "LOC27");
  expect(isVideoMapOn(view, "LOC27")).toBe(false);
  expect(view.showLocalizer).toBe(false);
  toggleVideoMap(view, "LOC09");
  expect(isVideoMapOn(view, "LOC09")).toBe(true);
  expect(isVideoMapOn(view, "LOC27")).toBe(false);
  expect(view.showLocalizer).toBe(true);

  const cache = buildMapCache(toMapCacheInput(view, VIEW));
  expect(cache.localizers).toHaveLength(1);
  expect(Math.max(...cache.localizer!.map((p) => p.x))).toBeLessThan(400);
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
  expect(activeRingRadiiNm({ intervalNm: 5, maxNm: 60 })).toEqual([
    5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60,
  ]);
  expect(activeRingRadiiNm({ intervalNm: 10, maxNm: 60 })).toEqual([10, 20, 30, 40, 50, 60]);
  expect(activeRingRadiiNm({ intervalNm: 2, maxNm: 60 })).toEqual([
    2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50,
    52, 54, 56, 58, 60,
  ]);

  const view = kdemView();
  expect(view.ringIntervalNm).toBe(5);
  const at5 = buildMapCache(toMapCacheInput(view, VIEW));
  expect(at5.ringRadiiNm).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  stepRrInterval(view, 1);
  expect(view.ringIntervalNm).toBe(10);
  expect(view.showRings).toBe(true);
  const at10 = buildMapCache(toMapCacheInput(view, VIEW));
  expect(at10.ringRadiiNm).toEqual([10, 20, 30, 40, 50, 60]);
  stepRrInterval(view, 1);
  expect(view.ringIntervalNm).toBe(10);
  stepRrInterval(view, -1);
  expect(view.ringIntervalNm).toBe(5);
  stepRrInterval(view, -1);
  expect(view.ringIntervalNm).toBe(2);
  const at2 = buildMapCache(toMapCacheInput(view, VIEW));
  expect(at2.ringRadiiNm[0]).toBe(2);
  expect(at2.ringRadiiNm.at(-1)).toBe(60);
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

test("AC1 — CHAR SIZE fields have ≥2 steps each; font stack still Plex/system mono", () => {
  expect(CHAR_SIZE_STEPS_PX.length).toBeGreaterThanOrEqual(2);
  expect(DCB_CHAR_SIZE_STEPS_PX.length).toBeGreaterThanOrEqual(2);
  expect(POS_SIZE_STEPS_PX.length).toBeGreaterThanOrEqual(2);
  const view = createScopeView();
  expect(view.charSizes.dataBlocks).toBe(12);
  expect(view.charSizes.lists).toBe(12);
  expect(view.charSizes.dcb).toBe(11);
  expect(view.charSizes.tools).toBe(12);
  expect(view.charSizes.pos).toBe(8);
  expect(view.charSizePx).toBe(12);

  stepCharSizeChannel(view, "dataBlocks", -1);
  expect(view.charSizes.dataBlocks).toBe(11);
  expect(view.charSizePx).toBe(11);
  stepCharSizeChannel(view, "lists", 1);
  expect(view.charSizes.lists).toBe(13);
  expect(view.charSizes.dataBlocks).toBe(11);
  stepCharSizeChannel(view, "dcb", 1);
  expect(view.charSizes.dcb).toBe(12);
  stepCharSizeChannel(view, "tools", -1);
  expect(view.charSizes.tools).toBe(11);
  stepCharSizeChannel(view, "pos", 1);
  expect(view.charSizes.pos).toBe(10);

  cycleCharSize(view);
  expect(view.charSizes.dataBlocks).toBe(12);
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

test("AC3 — BRITE FDB/LDB/MPA/HST/RR/TLS change intensity; disabled channels are stored no-ops", () => {
  expect(BRITE_STEPS.length).toBeGreaterThanOrEqual(2);
  expect(applyBrite(PALETTE.unowned, 50)).not.toBe(applyBrite(PALETTE.unowned, 100));
  expect(applyBrite(PALETTE.owned, 50)).not.toBe("#FFFFFF");
  expect(applyBrite(PALETTE.map, 40)).not.toBe(applyBrite(PALETTE.map, 100));
  expect(applyBrite(PALETTE.history, 20)).not.toBe(applyBrite(PALETTE.history, 100));
  expect(applyBrite(PALETTE.mapDim, 10)).not.toBe(applyBrite(PALETTE.mapDim, 100));
  expect(applyBrite(PALETTE.ptl, 30)).not.toBe("#FFFFFF");
  expect(PALETTE.unowned).toBe("#00FF00");
  expect(PALETTE.owned).toBe("#FFFFFF");
  expect(PALETTE.positionSymbol.toUpperCase()).toBe("#1E78FF");

  const view = kdemView();
  expect(view.brite.mpa).toBe(100);
  expect(view.brite.fdb).toBe(100);
  stepBriteChannel(view, "fdb", -1);
  expect(view.brite.fdb).toBe(90);
  expect(view.brite.ldb).toBe(100);
  stepBriteChannel(view, "ldb", -2);
  expect(view.brite.ldb).toBe(80);
  const beforeMpa = buildMapCache(toMapCacheInput(view, VIEW));
  view.mapCache = beforeMpa;
  stepBriteChannel(view, "hst", -1);
  expect(view.brite.hst).toBe(90);
  expect(view.mapCache).toBe(beforeMpa);
  stepBriteChannel(view, "mpa", -1);
  expect(view.brite.mpa).toBe(90);
  expect(view.mapCache).toBeNull();
  view.mapCache = buildMapCache(toMapCacheInput(view, VIEW));
  stepBriteChannel(view, "rr", -1);
  expect(view.brite.rr).toBe(90);
  expect(view.mapCache).toBeNull();
  stepBriteChannel(view, "tls", -1);
  expect(view.brite.tls).toBe(90);

  for (const channel of BRITE_DISABLED_CHANNELS) {
    expect(view.brite[channel]).toBe(100);
  }
  stepBriteChannel(view, "wx", -1);
  expect(view.brite.wx).toBe(90);
  cycleMapBrite(view);
  expect(view.brite.mpa).toBe(100);
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
  const heading = parseRadioText("DAL123 H270");
  expect(heading.ok).toBe(true);
  if (heading.ok) {
    expect(heading.callsignToken).toBe("DAL123");
    expect(heading.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    ]);
  }
});

test("T02-24 — unused slots 8–32 disabled; 1–7 bind catalog dcbNumber", () => {
  const view = kdemView();
  expect(DCB_MAP_SLOT_COUNT).toBe(32);
  expect(DCB_QUICK_MAP_COUNT).toBe(6);
  expect(videoMapByDcbNumber(view, 1)?.dcbLabel).toBe("RWY");
  expect(videoMapByDcbNumber(view, 2)?.id).toBe("LOC27");
  expect(videoMapByDcbNumber(view, 3)?.id).toBe("LOC09");
  expect(videoMapByDcbNumber(view, 4)?.dcbLabel).toBe("DEM1_27");
  expect(videoMapByDcbNumber(view, 5)?.dcbLabel).toBe("DEM1_09");
  expect(videoMapByDcbNumber(view, 6)?.dcbLabel).toBe("BAY1_27");
  expect(videoMapByDcbNumber(view, 7)?.dcbLabel).toBe("BAY1_09");
  expect(videoMapByDcbNumber(view, 8)).toBeUndefined();
  for (let slot = 1; slot <= 7; slot += 1) {
    expect(isDcbMapSlotEnabled(view, slot)).toBe(true);
  }
  for (let slot = 8; slot <= DCB_MAP_SLOT_COUNT; slot += 1) {
    expect(isDcbMapSlotEnabled(view, slot)).toBe(false);
  }
});

test("T04-39 — maps without dcbNumber stay out of DCB slot numbering", () => {
  const view = createScopeView(0, 0, {
    digitalMap: {
      rangeRings: { intervalNm: 5, maxNm: 60 },
      loadedVideoMaps: [
        {
          id: "01GEOONLY00000000000000136",
          file: "01GEOONLY00000000000000136.json",
          dcbLabel: "136",
          defaultOn: false,
          color: "map",
          name: "GEO",
          features: [],
        },
        {
          id: "RWY",
          file: "001-rwy.json",
          dcbNumber: 1,
          dcbLabel: "RWY",
          defaultOn: true,
          color: "map",
          name: "rwy",
          features: [],
        },
      ],
    },
  });
  expect(dcbCatalogMaps(view).map((map) => map.id)).toEqual(["RWY"]);
  expect(videoMapByDcbNumber(view, 1)?.id).toBe("RWY");
  expect(videoMapByDcbNumber(view, 136)).toBeUndefined();
  expect(formatDcbMapLabel(view.digitalMap.loadedVideoMaps![0]!)).toBe("136");
});

test("T02-24 — CLR ALL turns catalog maps off; coastline JSON off is a no-op", () => {
  const view = kdemView();
  expect(isVideoMapOn(view, "DEM1_27")).toBe(true);
  expect(isVideoMapOn(view, "BAY1_27")).toBe(true);
  clearAllVideoMaps(view);
  expect(isVideoMapOn(view, "RWY")).toBe(false);
  expect(isVideoMapOn(view, "LOC27")).toBe(false);
  expect(isVideoMapOn(view, "LOC09")).toBe(false);
  expect(isVideoMapOn(view, "DEM1_27")).toBe(false);
  expect(isVideoMapOn(view, "DEM1_09")).toBe(false);
  expect(isVideoMapOn(view, "BAY1_27")).toBe(false);
  expect(isVideoMapOn(view, "BAY1_09")).toBe(false);
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
          dcbNumber: 4,
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
  expect(isDcbMapSlotEnabled(coastOff, 4)).toBe(false);
  expect(coastOff.showCoastline).toBe(false);
  clearAllVideoMaps(coastOff);
  expect(isVideoMapOn(coastOff, "COAST")).toBe(false);
  expect(coastOff.showCoastline).toBe(false);
});

test("T02-63 — resolveVideoMapToken matches slot number and catalog id", () => {
  const maps = dcbCatalogMaps(kdemView());
  expect(resolveVideoMapToken(maps, "1")?.id).toBe("RWY");
  expect(resolveVideoMapToken(maps, "2")?.id).toBe("LOC27");
  expect(resolveVideoMapToken(maps, "loc27")?.id).toBe("LOC27");
  expect(resolveVideoMapToken(maps, "DEM1_27")?.id).toBe("DEM1_27");
  expect(resolveVideoMapToken(maps, "99")).toBeUndefined();
  expect(resolveVideoMapToken(maps, "XYZ")).toBeUndefined();
  expect(resolveVideoMapToken(maps, "")).toBeUndefined();
});

test("T02-63 — *D OFF is explicit off; ALL enables catalog; NONE clears", () => {
  const view = kdemView();
  expect(isVideoMapOn(view, "LOC27")).toBe(true);
  expect(view.showLocalizer).toBe(true);

  toggleVideoMap(view, "LOC27", false);
  expect(isVideoMapOn(view, "LOC27")).toBe(false);
  expect(isVideoMapOn(view, "LOC09")).toBe(false);
  expect(view.showLocalizer).toBe(false);
  toggleVideoMap(view, "LOC27", false);
  expect(isVideoMapOn(view, "LOC27")).toBe(false);

  view.mapCache = buildMapCache(toMapCacheInput(view, VIEW));
  setAllVideoMaps(view, true);
  expect(view.mapCache).toBeNull();
  expect(isVideoMapOn(view, "RWY")).toBe(true);
  expect(isVideoMapOn(view, "LOC27")).toBe(true);
  expect(isVideoMapOn(view, "LOC09")).toBe(true);
  expect(isVideoMapOn(view, "DEM1_27")).toBe(true);
  expect(isVideoMapOn(view, "DEM1_09")).toBe(true);
  expect(isVideoMapOn(view, "BAY1_27")).toBe(true);
  expect(isVideoMapOn(view, "BAY1_09")).toBe(true);
  expect(view.showRunway).toBe(true);
  expect(view.showLocalizer).toBe(true);

  view.mapCache = buildMapCache(toMapCacheInput(view, VIEW));
  setAllVideoMaps(view, false);
  expect(view.mapCache).toBeNull();
  expect(isVideoMapOn(view, "RWY")).toBe(false);
  expect(isVideoMapOn(view, "LOC27")).toBe(false);
  expect(isVideoMapOn(view, "DEM1_27")).toBe(false);
  expect(view.showRunway).toBe(false);
  expect(view.showLocalizer).toBe(false);
});

test("T02-24 — GEO MAPS lists every catalog label; CURRENT lists only maps that are on", () => {
  const view = kdemView();
  const geo = buildMapListLines(view, "geo");
  expect(geo).toContain("1 RWY ON");
  expect(geo).toContain("2 LOC27 ON");
  expect(geo).toContain("3 LOC09 OFF");
  expect(geo).toContain("4 DEM1_27 ON");
  expect(geo).toContain("5 DEM1_09 OFF");
  expect(geo).toContain("6 BAY1_27 ON");
  expect(geo).toContain("7 BAY1_09 OFF");
  expect(geo).toHaveLength(7);
  expect(buildMapListLines(view, "current")).toEqual([
    "1 RWY",
    "2 LOC27",
    "4 DEM1_27",
    "6 BAY1_27",
  ]);

  toggleVideoMap(view, "DEM1_27");
  expect(buildMapListLines(view, "geo")).toContain("4 DEM1_27 OFF");
  expect(buildMapListLines(view, "current")).not.toContain("4 DEM1_27");
  expect(buildMapListLines(view, "current")).toContain("1 RWY");

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
  expect(src).toMatch(/CHAR SIZE/);
  expect(src).toMatch(/BRITE/);
  expect(src).toMatch(/datablock/i);
  expect(src).toMatch(/R07/);
  expect(src.toLowerCase()).not.toMatch(/\bzoom\b/);
  expect(src.toLowerCase()).not.toMatch(/\blayers\b/);
  expect(src.toLowerCase()).not.toMatch(/\bbasemap\b/);
});

function katlView() {
  const loadedVideoMaps = loadVideoMapSet("KATL");
  const videoMapGroups = loadVideoMapGroups("KATL");
  return createScopeView(0, 0, {
    digitalMap: {
      rangeRings: { intervalNm: 5, maxNm: 60 },
      loadedVideoMaps,
      videoMapGroups,
    },
  });
}

test("T04-40 — GEO MAPS lists complete KATL inventory including GEO-only maps", () => {
  const view = katlView();
  expect(view.selectedMapGroupId).toBe(defaultSelectedMapGroupId(view.digitalMap.videoMapGroups));
  expect(selectedVideoMapGroup(view)?.sourceIndex).toBe(0);
  const geo = buildMapListLines(view, "geo");
  expect(geo).toHaveLength(90);
  expect(geo.some((line) => line.includes("40DME F"))).toBe(true);
  expect(geo.some((line) => line.startsWith("136 "))).toBe(true);
  expect(dcbCatalogMaps(view)).toHaveLength(0);
  expect(isVideoMapOn(view, "01GP6Y38GCS0BQSWSVRDK7JH5C")).toBe(false);
  expect(buildMapListLines(view, "current").length).toBeGreaterThan(0);
  expect(buildMapListLines(view, "current").length).toBeLessThan(90);
  setAllVideoMaps(view, true);
  expect(isVideoMapOn(view, "01GP6Y38GCS0BQSWSVRDK7JH5C")).toBe(true);
  expect(buildMapListLines(view, "current")).toHaveLength(90);
  toggleVideoMap(view, "01GP6Y38GCS0BQSWSVRDK7JH5C");
  expect(buildMapListLines(view, "current")).toHaveLength(89);
  expect(buildMapListLines(view, "geo")).toContain("136 40DME F OFF");
});

test("T04-40 — resolveVideoMapToken matches ULID, starsId, and group slot", () => {
  const view = katlView();
  const maps = view.digitalMap.loadedVideoMaps!;
  const layout = {
    groups: view.digitalMap.videoMapGroups,
    selectedGroupId: view.selectedMapGroupId,
  };
  expect(resolveVideoMapToken(maps, "01GP6Y38GCS0BQSWSVRDK7JH5C", layout)?.starsId).toBe(136);
  expect(resolveVideoMapToken(maps, "136", layout)?.id).toBe("01GP6Y38GCS0BQSWSVRDK7JH5C");
  expect(resolveVideoMapToken(maps, "1", layout)?.id).toBe("01GP6Y4FAAN3CQ94T4XN6FTT4C");
  expect(resolveVideoMapToken(maps, "1", layout)?.starsId).toBe(3);
  expect(resolveVideoMapToken(maps, "3", layout)?.starsId).toBe(32);
  expect(resolveVideoMapToken(maps, "201", layout)?.starsId).toBe(201);
  expect(resolveVideoMapToken(maps, "01GP6Y4FAAN3CQ94T4XN6FTT4C", layout)?.dcbLabel).toBe("MVA");
  const kdem = dcbCatalogMaps(kdemView());
  expect(resolveVideoMapToken(kdem, "3")?.id).toBe("LOC09");
  expect(resolveVideoMapToken(kdem, "3")?.starsId).toBeUndefined();
});

test("T04-40 — DCB group slots use layout; empty cells stay disabled", () => {
  const view = katlView();
  expect(DCB_GROUP_SUBMENU_SLOT_START).toBe(7);
  expect(DCB_GROUP_SLOT_COUNT).toBe(38);
  expect(videoMapByDcbNumber(view, 1)?.dcbLabel).toBe("MVA");
  expect(videoMapByDcbNumber(view, 1)?.starsId).toBe(3);
  expect(formatDcbMapLabel(videoMapByDcbNumber(view, 1)!)).toBe("3 MVA");
  expect(isDcbMapSlotEnabled(view, 1)).toBe(true);
  expect(dcbMapsPageSlotNumbers(view)).toEqual(
    Array.from({ length: 32 }, (_, i) => i + DCB_GROUP_SUBMENU_SLOT_START),
  );
  const empty = selectedVideoMapGroup(view)!.submenu.findIndex(
    (slot) => slot.starsId === null || slot.mapId === undefined,
  );
  expect(empty).toBeGreaterThanOrEqual(0);
  const emptySlot = DCB_GROUP_SUBMENU_SLOT_START + empty;
  expect(videoMapByDcbNumber(view, emptySlot)).toBeUndefined();
  expect(isDcbMapSlotEnabled(view, emptySlot)).toBe(false);
  expect(videoMapByDcbNumber(view, 136)).toBeUndefined();
  expect(dcbMapsPageSlotNumbers(kdemView())[0]).toBe(1);
});
