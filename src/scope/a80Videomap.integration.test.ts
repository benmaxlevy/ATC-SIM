/**
 * T04-42 — A80 videomap integration: KATL scenario load, default group
 * MAIN/submenu order, GEO reachability, ARP alignment, A/B BRITE, and
 * *D ALL / NONE / CLR ALL / CURRENT sync. Not OSM / tiles. Live src must
 * not import the converter package. Runtime never fetches vNAS.
 *
 * Chrome visual leftover is skip-with-reason. Do not invent a visual pass.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { createWorld, latLonToNm, type LatLon } from "@core";
import { loadPlayableScenario, loadVideoMapSet, type LoadedVideoMap } from "@scenario";
import { DisplayControlBar } from "../ui/DisplayControlBar";
import { type ScopeViewSize } from "./camera";
import {
  buildMapListLines,
  clearAllVideoMaps,
  dcbCatalogMaps,
  dcbMapsPageSlotNumbers,
  formatDcbMapLabel,
  isDcbMapSlotEnabled,
  isVideoMapOn,
  loadedCatalogMaps,
  selectedVideoMapGroup,
  setAllVideoMaps,
  stepBriteChannel,
  videoMapByDcbNumber,
  videoMapTokenLayout,
} from "./dcbFunctions";
import { openDcbMenu } from "./dcbMenu";
import { parseDigitalMap } from "./mapLayers";
import { PALETTE, applyBrite } from "./palette";
import { parsePreviewCommand } from "./previewArea";
import { renderScope } from "./renderScope";
import { createScopeView } from "./scopeView";

const VIEW: ScopeViewSize = { widthPx: 800, heightPx: 800 };
const GEO_ONLY_ULID = "01GP6Y38GCS0BQSWSVRDK7JH5C";
const HIGH_STARS_ULID = "01HAAN6X3E0DWSRETPY4BJ8RDH";

/**
 * Converted CRC is not NAS-identical. RWY-* maps are final-approach courses
 * whose nearest vertex sits a few NM from the threshold; TRACON maps span
 * tens of NM. Documented hypot tolerances vs ARP / `latLonToNm(threshold)`.
 */
const RWY_NEAR_ARP_NM = 12;
const RWY_NEAR_THRESHOLD_NM = 8;
const TRACON_SPAN_NM = 200;
const TRACON_HAS_NEAR_NM = 80;

function katlScenarioView() {
  const scenario = loadPlayableScenario("katl");
  return {
    scenario,
    view: createScopeView(0, 0, {
      digitalMap: {
        rangeRings: scenario.maps.rangeRings ?? { intervalNm: 5, maxNm: 60 },
        loadedVideoMaps: scenario.maps.loadedVideoMaps,
        videoMapGroups: scenario.maps.videoMapGroups,
        runway: scenario.maps.runway,
        localizer: scenario.maps.localizer,
        coastline: scenario.maps.coastline,
      },
    }),
  };
}

function dcbHtml(view: ReturnType<typeof createScopeView>): string {
  return renderToStaticMarkup(
    createElement(DisplayControlBar, { view, onChange: () => undefined }),
  );
}

function polylinePoints(map: LoadedVideoMap): [number, number][] {
  const pts: [number, number][] = [];
  for (const feature of map.features) {
    if (feature.type === "polyline") {
      for (const pt of feature.pointsNm) {
        pts.push(pt);
      }
    }
  }
  return pts;
}

function minHypotNm(points: [number, number][], origin: { xNm: number; yNm: number }): number {
  let min = Number.POSITIVE_INFINITY;
  for (const [eastNm, northNm] of points) {
    const d = Math.hypot(eastNm - origin.xNm, northNm - origin.yNm);
    if (d < min) {
      min = d;
    }
  }
  return min;
}

function byLabel(maps: readonly LoadedVideoMap[], dcbLabel: string): LoadedVideoMap {
  const hit = maps.find((map) => map.dcbLabel === dcbLabel);
  if (!hit) {
    throw new Error(`missing map ${dcbLabel}`);
  }
  return hit;
}

function createRecordingCtx(): {
  ctx: CanvasRenderingContext2D;
  fillTexts: string[];
  pathStrokes: { strokeStyle: string; points: { x: number; y: number }[] }[];
} {
  const rec = {
    ctx: null as unknown as CanvasRenderingContext2D,
    fillTexts: [] as string[],
    pathStrokes: [] as { strokeStyle: string; points: { x: number; y: number }[] }[],
  };
  let currentPath: { x: number; y: number }[] = [];
  rec.ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textBaseline: "alphabetic",
    textAlign: "start",
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {
      currentPath = [];
    },
    closePath() {},
    arc() {},
    clip() {},
    rect() {},
    stroke(this: { strokeStyle: string }) {
      if (currentPath.length >= 2) {
        rec.pathStrokes.push({
          points: currentPath.slice(),
          strokeStyle: String(this.strokeStyle),
        });
      }
    },
    fill() {},
    moveTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    lineTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    setTransform() {},
    strokeRect() {},
    measureText(text: string) {
      return { width: Math.max(0, text.length) * 7.2 };
    },
    fillText(text: string) {
      rec.fillTexts.push(text);
    },
  } as unknown as CanvasRenderingContext2D;
  return rec;
}

test("T04-42 — KATL loads 90 maps through generic loaders; KDEM stays default", () => {
  expect(loadPlayableScenario().icao).toBe("KDEM");
  expect(loadPlayableScenario().maps.videoMapSet).toBe("KDEM");
  const kdemMaps = loadPlayableScenario().maps.loadedVideoMaps;
  expect(kdemMaps).toHaveLength(7);
  expect(kdemMaps.map((map) => map.dcbNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(loadVideoMapSet("KDEM")).toHaveLength(7);

  const scenario = loadPlayableScenario("katl");
  expect(scenario.icao).toBe("KATL");
  expect(scenario.maps.videoMapSet).toBe("KATL");
  expect(scenario.maps.loadedVideoMaps).toHaveLength(90);
  expect(scenario.maps.videoMapGroups?.mapsAbsentFromGroups).toHaveLength(17);
  expect(scenario.maps.loadedVideoMaps.every((map) => map.dcbNumber === undefined)).toBe(true);
  expect(scenario.maps.loadedVideoMaps.map((map) => map.id)).toEqual(
    loadVideoMapSet("KATL").map((map) => map.id),
  );

  const east = loadPlayableScenario("katl-08");
  expect(east.maps.videoMapSet).toBe("KATL");
  expect(east.maps.loadedVideoMaps).toHaveLength(90);
});

test("T04-42 — default group MAIN/submenu keep CRC starsId order; empty slots disabled", () => {
  const { view } = katlScenarioView();
  const group = selectedVideoMapGroup(view);
  expect(group?.sourceIndex).toBe(0);
  expect(group?.main).toHaveLength(6);
  expect(group?.main.map((slot) => slot.starsId)).toEqual([3, 1, 32, 30, 22, 25]);
  expect(formatDcbMapLabel(videoMapByDcbNumber(view, 1)!)).toBe("3 MVA");
  expect(formatDcbMapLabel(videoMapByDcbNumber(view, 2)!)).toBe("1 CLASS B");
  expect(formatDcbMapLabel(videoMapByDcbNumber(view, 3)!)).toBe("32 DW WP N");
  expect(formatDcbMapLabel(videoMapByDcbNumber(view, 4)!)).toBe("30 DE WP N");
  expect(formatDcbMapLabel(videoMapByDcbNumber(view, 5)!)).toBe("22 AW DW N");
  expect(formatDcbMapLabel(videoMapByDcbNumber(view, 6)!)).toBe("25 AE DW N");
  expect(videoMapByDcbNumber(view, 1)?.id).toBe("01GP6Y4FAAN3CQ94T4XN6FTT4C");

  const main = dcbHtml(view);
  expect(main).toMatch(/aria-label="3 MVA"/);
  expect(main).toContain('data-dcb-map-id="01GP6Y4FAAN3CQ94T4XN6FTT4C"');
  expect(main).toContain('data-dcb-map-slot="1"');
  expect(main).not.toContain('data-dcb-map-slot="7"');

  openDcbMenu(view, "MAPS");
  expect(dcbMapsPageSlotNumbers(view)[0]).toBe(7);
  expect(videoMapByDcbNumber(view, 7)?.starsId).toBe(27);
  expect(formatDcbMapLabel(videoMapByDcbNumber(view, 7)!)).toBe("27 W DEP");
  const mapsPage = dcbHtml(view);
  expect(mapsPage).toMatch(/aria-label="27 W DEP"/);
  expect(mapsPage).toContain('data-dcb-map-slot="7"');
  expect(mapsPage).toContain('data-dcb-map-slot="38"');

  const empty = group!.submenu.findIndex(
    (slot) => slot.starsId === null || slot.mapId === undefined,
  );
  expect(empty).toBeGreaterThanOrEqual(0);
  const emptySlot = 7 + empty;
  expect(isDcbMapSlotEnabled(view, emptySlot)).toBe(false);
  expect(mapsPage).toMatch(new RegExp(`aria-label="Map ${emptySlot}"[^>]*\\bdisabled\\b`));

  const kdem = createScopeView(0, 0, {
    digitalMap: parseDigitalMap(loadPlayableScenario().maps),
  });
  expect(dcbCatalogMaps(kdem)).toHaveLength(7);
  expect(dcbMapsPageSlotNumbers(kdem)[0]).toBe(1);
  expect(isDcbMapSlotEnabled(kdem, 1)).toBe(true);
});

test("T04-42 — GEO lists 90 including GEO-only; *D ALL/NONE/CLR ALL stay with CURRENT", () => {
  const { view, scenario } = katlScenarioView();
  const geoOnly = scenario.maps.videoMapGroups!.mapsAbsentFromGroups[1]!;
  expect(geoOnly).toBe(GEO_ONLY_ULID);
  expect(scenario.maps.videoMapGroups!.mapsAbsentFromGroups).toHaveLength(17);

  const geo = buildMapListLines(view, "geo");
  expect(geo).toHaveLength(90);
  expect(geo.some((line) => line.startsWith("136 "))).toBe(true);
  expect(geo.some((line) => line.includes("40DME F"))).toBe(true);
  expect(loadedCatalogMaps(view).some((map) => map.id === GEO_ONLY_ULID)).toBe(true);
  expect(dcbCatalogMaps(view)).toEqual([]);

  const defaultOn = loadedCatalogMaps(view).filter((map) => isVideoMapOn(view, map.id)).length;
  expect(buildMapListLines(view, "current")).toHaveLength(defaultOn);
  expect(defaultOn).toBeGreaterThan(0);
  expect(defaultOn).toBeLessThan(90);

  const layout = videoMapTokenLayout(view);
  const maps = loadedCatalogMaps(view);
  expect(parsePreviewCommand("*D ALL", maps, layout)).toEqual({
    kind: "action",
    action: { type: "setAllVideoMaps", enabled: true },
  });
  expect(parsePreviewCommand("*D NONE", maps, layout)).toEqual({
    kind: "action",
    action: { type: "setAllVideoMaps", enabled: false },
  });

  setAllVideoMaps(view, true);
  expect(isVideoMapOn(view, GEO_ONLY_ULID)).toBe(true);
  expect(buildMapListLines(view, "current")).toHaveLength(90);
  expect(buildMapListLines(view, "geo")).toHaveLength(90);

  clearAllVideoMaps(view);
  expect(buildMapListLines(view, "current")).toHaveLength(0);
  expect(loadedCatalogMaps(view).every((map) => isVideoMapOn(view, map.id) === false)).toBe(true);
  expect(buildMapListLines(view, "geo")).toHaveLength(90);

  setAllVideoMaps(view, true);
  setAllVideoMaps(view, false);
  expect(buildMapListLines(view, "current")).toHaveLength(0);
  expect(isVideoMapOn(view, GEO_ONLY_ULID)).toBe(false);

  view.geoMapsListOn = true;
  view.currentMapsListOn = true;
  setAllVideoMaps(view, true);
  const rec = createRecordingCtx();
  renderScope(rec.ctx, createWorld(), view, VIEW.widthPx, VIEW.heightPx);
  expect(rec.fillTexts).toContain("GEO MAPS");
  expect(rec.fillTexts).toContain("CURRENT");
  expect(rec.fillTexts.some((t) => t.startsWith("136 "))).toBe(true);
});

test("T04-42 — high/sparse CRC starsId toggles without remapping ULID identity", () => {
  const { view } = katlScenarioView();
  const maps = loadedCatalogMaps(view);
  const layout = videoMapTokenLayout(view);
  const high = maps.find((map) => map.id === HIGH_STARS_ULID);
  expect(high?.starsId).toBe(201);
  expect(high?.id).toBe(HIGH_STARS_ULID);
  expect(high?.id).not.toBe("201");
  expect(maps.every((map) => map.id !== String(map.starsId))).toBe(true);

  expect(parsePreviewCommand("*D 201", maps, layout)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: HIGH_STARS_ULID },
  });
  expect(parsePreviewCommand("*D 136", maps, layout)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: GEO_ONLY_ULID },
  });
  expect(parsePreviewCommand(`*D ${HIGH_STARS_ULID}`, maps, layout)).toEqual({
    kind: "action",
    action: { type: "toggleVideoMap", mapId: HIGH_STARS_ULID },
  });

  expect(isVideoMapOn(view, HIGH_STARS_ULID)).toBe(high!.defaultOn);
  setAllVideoMaps(view, false);
  expect(isVideoMapOn(view, HIGH_STARS_ULID)).toBe(false);
  expect(isVideoMapOn(view, GEO_ONLY_ULID)).toBe(false);
});

test("T04-42 — ARP alignment: RWY/finals near threshold; MVA/TAR/DEP/SAT finite NM", () => {
  const scenario = loadPlayableScenario("katl");
  const arp: LatLon = scenario.arp;
  expect(arp).toEqual({ latDeg: 33.6367, lonDeg: -84.4278638888889 });
  const maps = scenario.maps.loadedVideoMaps;
  const origin = { xNm: 0, yNm: 0 };

  const samples: { label: string; runwayId?: string }[] = [
    { label: "RWY 26R", runwayId: "26R" },
    { label: "RWY 10", runwayId: "10" },
    { label: "WFINALS" },
    { label: "EFINALS" },
    { label: "MVA" },
    { label: "W TAR" },
    { label: "E DEP" },
    { label: "W SAT" },
    { label: "E SAT" },
  ];
  for (const sample of samples) {
    const map = byLabel(maps, sample.label);
    const pts = polylinePoints(map);
    expect(pts.length, sample.label).toBeGreaterThan(0);
    expect(
      pts.every(([e, n]) => Number.isFinite(e) && Number.isFinite(n)),
      sample.label,
    ).toBe(true);
    expect(
      pts.every(([e, n]) => Math.hypot(e, n) < TRACON_SPAN_NM),
      sample.label,
    ).toBe(true);
    expect(minHypotNm(pts, origin), sample.label).toBeLessThan(TRACON_HAS_NEAR_NM);

    if (sample.runwayId) {
      const rwy = scenario.runways.find((row) => row.id === sample.runwayId);
      expect(rwy?.thresholdLatLon).toBeDefined();
      const threshold = latLonToNm(rwy!.thresholdLatLon!, arp);
      expect(Number.isFinite(threshold.xNm) && Number.isFinite(threshold.yNm)).toBe(true);
      expect(minHypotNm(pts, origin), sample.label).toBeLessThan(RWY_NEAR_ARP_NM);
      expect(minHypotNm(pts, threshold), sample.label).toBeLessThan(RWY_NEAR_THRESHOLD_NM);
    }
  }
});

test("T04-42 — A/B map vs mapDim channels follow MPA/MPB; BRITE does not change availability", () => {
  const { view } = katlScenarioView();
  const maps = loadedCatalogMaps(view);
  const tar = byLabel(maps, "W TAR");
  const klassB = byLabel(maps, "CLASS B");
  expect(tar.color).toBe("map");
  expect(klassB.color).toBe("mapDim");

  setAllVideoMaps(view, false);
  expect(isVideoMapOn(view, tar.id)).toBe(false);
  expect(isVideoMapOn(view, klassB.id)).toBe(false);
  setAllVideoMaps(view, true);
  expect(isVideoMapOn(view, tar.id)).toBe(true);
  expect(isVideoMapOn(view, klassB.id)).toBe(true);

  view.showRunway = false;
  view.showLocalizer = false;
  view.showRings = false;
  view.showCoastline = false;
  view.brite.mpa = 80;
  view.brite.mpb = 40;
  const rec = createRecordingCtx();
  renderScope(rec.ctx, createWorld(), view, VIEW.widthPx, VIEW.heightPx);
  const mpa = applyBrite(PALETTE.map, 80);
  const mpb = applyBrite(PALETTE.mapDim, 40);
  expect(mpa).not.toBe(mpb);
  expect(rec.pathStrokes.some((s) => s.strokeStyle === mpa)).toBe(true);
  expect(rec.pathStrokes.some((s) => s.strokeStyle === mpb)).toBe(true);

  const availableBefore = buildMapListLines(view, "current").length;
  stepBriteChannel(view, "mpa", -4);
  stepBriteChannel(view, "mpb", -3);
  expect(buildMapListLines(view, "current")).toHaveLength(availableBefore);
  expect(isVideoMapOn(view, tar.id)).toBe(true);
});

test("T04-42 — live src does not import the converter tree or fetch vNAS", () => {
  const sources = import.meta.glob("../**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const converter = ["crc", "videomap", "import"].join("-");
  const toolTree = ["tools", "crc"].join("/");
  for (const [path, text] of Object.entries(sources)) {
    expect(text.includes(converter) || text.includes(toolTree), path).toBe(false);
    expect(text, path).not.toMatch(/https?:\/\/(?!docs\.virtualnas\.net)[^\s"'`]*vnas/i);
  }
});

test.skip("T04-42 Chrome visual leftover — KATL MAPS / GEO / BRITE walk (manual)", () => {
  // skip-with-reason: this worker has no visual operator. Do not invent a visual pass.
});
