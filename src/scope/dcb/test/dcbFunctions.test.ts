import { expect, test } from "vitest";
import { loadKdem } from "@scenario";
import { parseDigitalMap, toMapCacheInput, buildMapCache } from "../../mapLayers";
import { createScopeView } from "../../scopeView";
import {
  formatDcbMapLabel,
  dcbCatalogMaps,
  isVideoMapOn,
  toggleVideoMap,
  toggleWxLevel,
  stepHistoryRate,
  formatDcbHistoryRateReadout,
  stepDwellMode,
  cycleDwellMode,
  formatDcbDwellReadout,
  toggleCursorHome,
  stepCursorSpeed,
  formatDcbCursorSpeedReadout,
} from "../dcbFunctions";

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

test("H_RATE spinner cycles through presets", () => {
  const view = createScopeView();
  expect(view.historyRateSec).toBe(4.5);
  expect(formatDcbHistoryRateReadout(view.historyRateSec)).toBe("4.5");
  stepHistoryRate(view, 1);
  expect(view.historyRateSec).toBe(5.0);
  stepHistoryRate(view, -1);
  expect(view.historyRateSec).toBe(4.5);
  stepHistoryRate(view, -10);
  expect(view.historyRateSec).toBe(1.0);
  stepHistoryRate(view, 20);
  expect(view.historyRateSec).toBe(10.0);
});

test("DWELL mode spinner and cycle", () => {
  const view = createScopeView();
  expect(view.dwellMode).toBe("OFF");
  expect(formatDcbDwellReadout(view.dwellMode)).toBe("OFF");
  cycleDwellMode(view);
  expect(view.dwellMode).toBe("ON");
  cycleDwellMode(view);
  expect(view.dwellMode).toBe("LOCK");
  cycleDwellMode(view);
  expect(view.dwellMode).toBe("OFF");

  stepDwellMode(view, 1);
  expect(view.dwellMode).toBe("ON");
  stepDwellMode(view, 1);
  expect(view.dwellMode).toBe("LOCK");
  stepDwellMode(view, 1);
  expect(view.dwellMode).toBe("LOCK");
  stepDwellMode(view, -1);
  expect(view.dwellMode).toBe("ON");
});

test("CURSOR HOME toggle and CSR SPD spinner", () => {
  const view = createScopeView();
  expect(view.cursorHome).toBe(false);
  toggleCursorHome(view);
  expect(view.cursorHome).toBe(true);
  toggleCursorHome(view);
  expect(view.cursorHome).toBe(false);

  expect(view.cursorSpeed).toBe(4);
  expect(formatDcbCursorSpeedReadout(view.cursorSpeed)).toBe("4");
  stepCursorSpeed(view, 1);
  expect(view.cursorSpeed).toBe(5);
  stepCursorSpeed(view, -10);
  expect(view.cursorSpeed).toBe(1);
  stepCursorSpeed(view, 20);
  expect(view.cursorSpeed).toBe(10);
});
