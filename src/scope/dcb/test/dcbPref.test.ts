import { expect, test } from "vitest";
import { loadKdem } from "@scenario";
import { isVideoMapOn, toggleVideoMap } from "../dcbFunctions";
import {
  loadDcbPrefFromStorage,
  parseDcbPrefName,
  saveDcbPref,
  type DcbPrefStorage,
} from "../dcbPref";
import { parseDigitalMap } from "../../mapLayers";
import { createScopeView, setDcbDock } from "../../scopeView";

function memoryStorage(): DcbPrefStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

function kdemView() {
  return createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
}

test("SAVE then reload restores range, a toggled map, and dock", () => {
  const store = memoryStorage();
  const view = kdemView();
  view.dcbPref.icao = "KDEM";
  view.camera.rangeNm = 40;
  setDcbDock(view, "LEFT");
  toggleVideoMap(view, "DEM1_27");
  expect(isVideoMapOn(view, "DEM1_27")).toBe(false);
  saveDcbPref(view, store);
  const boot = kdemView();
  loadDcbPrefFromStorage(boot, "KDEM", store);
  expect(boot.camera.rangeNm).toBe(40);
  expect(boot.dcbDock).toBe("LEFT");
  expect(isVideoMapOn(boot, "DEM1_27")).toBe(false);
});

test("parseDcbPrefName rejects empty, non-alnum, and digit-only text", () => {
  expect(parseDcbPrefName("NIGHT")).toEqual({ ok: true, name: "NIGHT" });
  expect(parseDcbPrefName("")).toEqual({ ok: false, reason: "empty" });
  expect(parseDcbPrefName("22/27")).toEqual({ ok: false, reason: "non-alnum" });
  expect(parseDcbPrefName("123")).toEqual({ ok: false, reason: "digit-only" });
});

test("SAVE then reload restores historyRateSec, dwellMode, cursorHome, cursorSpeed", () => {
  const store = memoryStorage();
  const view = kdemView();
  view.dcbPref.icao = "KDEM";
  view.historyRateSec = 6.0;
  view.dwellMode = "LOCK";
  view.cursorHome = true;
  view.cursorSpeed = 8;
  saveDcbPref(view, store);

  const boot = kdemView();
  expect(boot.historyRateSec).toBe(4.5);
  expect(boot.dwellMode).toBe("OFF");
  expect(boot.cursorHome).toBe(false);
  expect(boot.cursorSpeed).toBe(4);

  loadDcbPrefFromStorage(boot, "KDEM", store);
  expect(boot.historyRateSec).toBe(6.0);
  expect(boot.dwellMode).toBe("LOCK");
  expect(boot.cursorHome).toBe(true);
  expect(boot.cursorSpeed).toBe(8);
});
