/**
 * T02-29 DCB PREF: eight localStorage display snapshots (CRC analog, not NAS).
 */

import { expect, test } from "vitest";
import { loadKdem } from "@scenario";
import { isVideoMapOn, toggleVideoMap } from "./dcbFunctions";
import {
  DCB_PREF_READOUT_MAX_CHARS,
  DCB_PREF_SLOT_COUNT,
  activeDcbPrefName,
  applyDcbPref,
  applyDcbPrefDefaults,
  beginDcbPrefSession,
  dcbPrefStorageKey,
  deleteDcbPref,
  formatDcbPrefReadout,
  loadDcbPrefFromStorage,
  restoreDcbPrefSession,
  saveAsDcbPref,
  saveDcbPref,
  selectDcbPrefSlot,
  serializeDcbPref,
  type DcbPrefStorage,
} from "./dcbPref";
import { parseDigitalMap } from "./mapLayers";
import { createScopeView, setDcbDock } from "./scopeView";
import { createTrackDisplay } from "./trackDisplay";

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

test("AC1 — SAVE then reload helper restores range, a toggled map, and dock", () => {
  const store = memoryStorage();
  const view = kdemView();
  view.dcbPref.icao = "KDEM";
  view.camera.rangeNm = 40;
  setDcbDock(view, "LEFT");
  expect(isVideoMapOn(view, "DWNWND")).toBe(true);
  toggleVideoMap(view, "DWNWND");
  expect(isVideoMapOn(view, "DWNWND")).toBe(false);

  saveDcbPref(view, store);
  expect(store.getItem(dcbPrefStorageKey("KDEM"))).toContain("DWNWND");

  const reloaded = kdemView();
  loadDcbPrefFromStorage(reloaded, "KDEM", store);
  expect(reloaded.camera.rangeNm).toBe(40);
  expect(reloaded.dcbDock).toBe("LEFT");
  expect(isVideoMapOn(reloaded, "DWNWND")).toBe(false);
  expect(serializeDcbPref(reloaded).rangeNm).toBe(40);
  expect(typeof applyDcbPref).toBe("function");
});

test("AC2 — DEFAULT restores factory range 20 and default maps without clearing tracks", () => {
  const view = kdemView();
  view.tracks.set("keep", createTrackDisplay());
  view.camera.rangeNm = 40;
  setDcbDock(view, "BOTTOM");
  toggleVideoMap(view, "DWNWND");
  expect(isVideoMapOn(view, "DWNWND")).toBe(false);

  applyDcbPrefDefaults(view);

  expect(view.camera.rangeNm).toBe(20);
  expect(view.dcbDock).toBe("TOP");
  expect(isVideoMapOn(view, "DWNWND")).toBe(true);
  expect(view.tracks.has("keep")).toBe(true);
  expect(view.tracks.size).toBe(1);
});

test("AC3 — RESTORE undoes changes made after opening PREF", () => {
  const view = kdemView();
  view.camera.rangeNm = 40;
  setDcbDock(view, "RIGHT");
  beginDcbPrefSession(view);
  view.camera.rangeNm = 10;
  setDcbDock(view, "LEFT");
  toggleVideoMap(view, "COAST");
  restoreDcbPrefSession(view);
  expect(view.camera.rangeNm).toBe(40);
  expect(view.dcbDock).toBe("RIGHT");
});

test("AC4 — SAVE AS fills the first empty slot named PREF n with no prompt/input", () => {
  const store = memoryStorage();
  const view = kdemView();
  view.dcbPref.icao = "KDEM";
  view.camera.rangeNm = 30;
  const first = saveAsDcbPref(view, store);
  expect(first).toBe(0);
  expect(view.dcbPref.slots[0]?.name).toBe("PREF 1");
  expect(view.dcbPref.activeIndex).toBe(0);
  view.camera.rangeNm = 50;
  const second = saveAsDcbPref(view, store);
  expect(second).toBe(1);
  expect(view.dcbPref.slots[1]?.name).toBe("PREF 2");

  for (let i = 2; i < DCB_PREF_SLOT_COUNT; i += 1) {
    view.camera.rangeNm = 15;
    saveAsDcbPref(view, store);
  }
  expect(view.dcbPref.slots.every((slot) => slot !== null)).toBe(true);
  view.camera.rangeNm = 60;
  const overflow = saveAsDcbPref(view, store);
  expect(overflow).toBe(7);
  expect(view.dcbPref.slots[7]?.name).toBe("PREF 8");
  expect(view.dcbPref.slots[7]?.body.rangeNm).toBe(60);
});

test("AC5 — DELETE clears the active slot; corrupt JSON falls back to factory", () => {
  const store = memoryStorage();
  const view = kdemView();
  view.dcbPref.icao = "KDEM";
  saveDcbPref(view, store);
  expect(view.dcbPref.slots[0]).not.toBeNull();
  deleteDcbPref(view, store);
  expect(view.dcbPref.slots[0]).toBeNull();

  store.setItem(dcbPrefStorageKey("KDEM"), "{not-json");
  const boot = kdemView();
  expect(() => loadDcbPrefFromStorage(boot, "KDEM", store)).not.toThrow();
  expect(boot.camera.rangeNm).toBe(20);
  expect(boot.dcbDock).toBe("TOP");
  expect(boot.dcbPref.slots.every((slot) => slot === null)).toBe(true);
});

test("AC6 — eight slots only; PREF is not Command IR; DAL123 H270 still works", async () => {
  expect(DCB_PREF_SLOT_COUNT).toBe(8);
  const view = kdemView();
  expect(view.dcbPref.slots).toHaveLength(8);
  selectDcbPrefSlot(view, 3);
  expect(view.dcbPref.activeIndex).toBe(3);

  const { parseRadioText } = await import("@parse");
  const heading = parseRadioText("DAL123 H270");
  expect(heading.ok).toBe(true);
  if (heading.ok) {
    expect(heading.callsignToken).toBe("DAL123");
    expect(heading.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    ]);
  }
});

test("MAIN PREF second line is the active set name, abbreviated to the cap budget", () => {
  expect(formatDcbPrefReadout("")).toBe("");
  expect(formatDcbPrefReadout("22/27")).toBe("22/27");
  expect(formatDcbPrefReadout("pref 1")).toBe("PREF 1");
  expect(formatDcbPrefReadout("Approach Night")).toBe("APPROA");
  expect(formatDcbPrefReadout("  night  ops ")).toBe("NIGHT");
  expect(DCB_PREF_READOUT_MAX_CHARS).toBe(6);

  const view = kdemView();
  expect(activeDcbPrefName(view)).toBe("");
  saveAsDcbPref(view);
  expect(activeDcbPrefName(view)).toBe("PREF 1");
  expect(formatDcbPrefReadout(activeDcbPrefName(view))).toBe("PREF 1");
  view.dcbPref.slots[0]!.name = "Approach Night";
  expect(formatDcbPrefReadout(activeDcbPrefName(view))).toBe("APPROA");
});

test("AC7 — PREF comments cite CRC analog, 8-slot trainer delta, not settings/theme", () => {
  const sources = import.meta.glob("./*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const text = sources["./dcbPref.ts"]!;
  expect(text).toMatch(/PREF/);
  expect(text).toMatch(/CRC/);
  expect(text).toMatch(/\b8\b/);
  expect(text).toMatch(/localStorage/);
  expect(text).toMatch(/32 NAS/);
  expect(text).toMatch(/not a settings panel/i);
  expect(text).toMatch(/theme picker/i);
  expect(text).toMatch(/No window\.prompt/);
});
