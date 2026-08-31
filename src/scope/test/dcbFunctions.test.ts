import { expect, test } from "vitest";
import { loadKdem } from "@scenario";
import { parseDigitalMap, toMapCacheInput, buildMapCache } from "../mapLayers";
import { createScopeView } from "../scopeView";
import {
  formatDcbMapLabel,
  dcbCatalogMaps,
  isVideoMapOn,
  toggleVideoMap,
  toggleWxLevel,
} from "../dcb/dcbFunctions";

const VIEW = { widthPx: 800, heightPx: 800 };

function kdemView() {
  return createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
}

test("MAPS catalog labels; toggle hides that map's strokes", () => {
  const view = kdemView();
  const labels = dcbCatalogMaps(view).map(formatDcbMapLabel);
  expect(labels).toContain("1 RWY");
  const before = buildMapCache(toMapCacheInput(view, VIEW));
  expect(before.videoStrokes.some((s) => s.mapId === "DEM1_27")).toBe(true);
  toggleVideoMap(view, "DEM1_27");
  expect(isVideoMapOn(view, "DEM1_27")).toBe(false);
  const after = buildMapCache(toMapCacheInput(view, VIEW));
  expect(after.videoStrokes.some((s) => s.mapId === "DEM1_27")).toBe(false);
});

test("RANGE default is 20 NM; pan is off airport", () => {
  const view = createScopeView();
  expect(view.camera.rangeNm).toBe(20);
  view.camera.centerEastNm = 3;
  expect(view.camera.centerEastNm).not.toBe(view.airportEastNm);
});

test("WX1–6 toggle independent bits", () => {
  const view = createScopeView();
  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);
  toggleWxLevel(view, 1);
  toggleWxLevel(view, 6);
  expect(view.wxLevels).toEqual([true, false, false, false, false, true]);
});
