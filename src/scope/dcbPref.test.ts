/**
 * T02-29 DCB PREF: eight localStorage display snapshots (CRC analog, not NAS).
 */

import { expect, test } from "vitest";
import { loadKdem, type RadarSite } from "@scenario";
import { isVideoMapOn, toggleVideoMap } from "./dcbFunctions";
import {
  DCB_PREF_NAME_MAX_CHARS,
  DCB_PREF_READABLE_VERSIONS,
  DCB_PREF_READOUT_MAX_CHARS,
  DCB_PREF_SLOT_COUNT,
  DCB_PREF_SCHEMA_VERSION,
  DCB_THICKNESS_PX,
  activeDcbPrefName,
  applyDcbPref,
  applyDcbPrefDefaults,
  beginDcbPrefSaveAs,
  beginDcbPrefSession,
  cancelDcbPrefSaveAs,
  commitDcbPrefSaveAs,
  dcbPrefStorageKey,
  deleteDcbPref,
  drawablePpiSize,
  formatDcbPrefReadout,
  isDcbPrefSaveAsPending,
  isVerticalDcbDock,
  loadDcbPrefFromStorage,
  parseDcbPrefJson,
  parseDcbPrefName,
  restoreDcbPrefSession,
  saveDcbPref,
  selectDcbPrefSlot,
  serializeDcbPref,
  type DcbPrefStorage,
} from "./dcbPref";
import { parseDigitalMap } from "./mapLayers";
import { createScopeView, setDcbDock } from "./scopeView";
import { createTrackDisplay } from "./trackDisplay";

function syntheticSite(id: string): RadarSite {
  return {
    id,
    name: id,
    kind: "asr",
    xNm: 0,
    yNm: 0,
    rangeNm: 60,
    periodMs: 4800,
  };
}

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
  expect(isVideoMapOn(view, "DEM1_27")).toBe(true);
  toggleVideoMap(view, "DEM1_27");
  expect(isVideoMapOn(view, "DEM1_27")).toBe(false);

  saveDcbPref(view, store);
  expect(store.getItem(dcbPrefStorageKey("KDEM"))).toContain("DEM1_27");

  const reloaded = kdemView();
  loadDcbPrefFromStorage(reloaded, "KDEM", store);
  expect(reloaded.camera.rangeNm).toBe(40);
  expect(reloaded.dcbDock).toBe("LEFT");
  expect(isVideoMapOn(reloaded, "DEM1_27")).toBe(false);
  expect(serializeDcbPref(reloaded).rangeNm).toBe(40);
  expect(typeof applyDcbPref).toBe("function");
});

test("AC2 — DEFAULT restores factory range 20 and default maps without clearing tracks", () => {
  const view = kdemView();
  view.tracks.set("keep", createTrackDisplay());
  view.camera.rangeNm = 40;
  setDcbDock(view, "BOTTOM");
  toggleVideoMap(view, "DEM1_27");
  expect(isVideoMapOn(view, "DEM1_27")).toBe(false);

  applyDcbPrefDefaults(view);

  expect(view.camera.rangeNm).toBe(20);
  expect(view.dcbDock).toBe("TOP");
  expect(isVideoMapOn(view, "DEM1_27")).toBe(true);
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
  toggleVideoMap(view, "DEM1_27");
  restoreDcbPrefSession(view);
  expect(view.camera.rangeNm).toBe(40);
  expect(view.dcbDock).toBe("RIGHT");
});

test("SAVE AS begin does not write; alphanumeric Enter fills the first empty slot", () => {
  const store = memoryStorage();
  const view = createScopeView();
  view.dcbPref.icao = "KXXX";
  view.camera.rangeNm = 30;
  beginDcbPrefSaveAs(view);
  expect(isDcbPrefSaveAsPending(view)).toBe(true);
  expect(view.dcbPref.slots[0]).toBeNull();
  expect(store.data.size).toBe(0);

  const first = commitDcbPrefSaveAs(view, "NIGHT", store);
  expect(first).toBe(0);
  expect(view.dcbPref.slots[0]?.name).toBe("NIGHT");
  expect(view.dcbPref.slots[0]?.body.rangeNm).toBe(30);
  expect(view.dcbPref.activeIndex).toBe(0);
  expect(isDcbPrefSaveAsPending(view)).toBe(false);

  view.camera.rangeNm = 50;
  beginDcbPrefSaveAs(view);
  const second = commitDcbPrefSaveAs(view, "DAY", store);
  expect(second).toBe(1);
  expect(view.dcbPref.slots[1]?.name).toBe("DAY");
  expect(view.dcbPref.slots[0]?.name).toBe("NIGHT");
});

test("SAVE AS replaces the last slot when the table is full", () => {
  const store = memoryStorage();
  const view = createScopeView();
  view.dcbPref.icao = "KXXX";
  for (let i = 0; i < DCB_PREF_SLOT_COUNT; i += 1) {
    view.camera.rangeNm = 15;
    beginDcbPrefSaveAs(view);
    commitDcbPrefSaveAs(view, `SET${i}`, store);
  }
  expect(view.dcbPref.slots.every((slot) => slot !== null)).toBe(true);
  expect(view.dcbPref.slots[0]?.name).toBe("SET0");
  view.camera.rangeNm = 60;
  beginDcbPrefSaveAs(view);
  const overflow = commitDcbPrefSaveAs(view, "FULL", store);
  expect(overflow).toBe(31);
  expect(view.dcbPref.slots[31]?.name).toBe("FULL");
  expect(view.dcbPref.slots[31]?.body.rangeNm).toBe(60);
  expect(view.dcbPref.slots[0]?.name).toBe("SET0");
});

test("Esc cancel and invalid names leave slots unchanged", () => {
  const store = memoryStorage();
  const view = createScopeView();
  view.dcbPref.icao = "KXXX";
  view.camera.rangeNm = 40;
  beginDcbPrefSaveAs(view);
  commitDcbPrefSaveAs(view, "KEEP", store);
  const before = JSON.stringify(view.dcbPref.slots);

  beginDcbPrefSaveAs(view);
  view.camera.rangeNm = 10;
  cancelDcbPrefSaveAs(view);
  expect(isDcbPrefSaveAsPending(view)).toBe(false);
  expect(JSON.stringify(view.dcbPref.slots)).toBe(before);
  expect(view.dcbPref.activeIndex).toBe(0);
  expect(activeDcbPrefName(view)).toBe("KEEP");

  beginDcbPrefSaveAs(view);
  expect(commitDcbPrefSaveAs(view, "", store)).toBeNull();
  expect(commitDcbPrefSaveAs(view, "22/27", store)).toBeNull();
  expect(commitDcbPrefSaveAs(view, "123", store)).toBeNull();
  expect(isDcbPrefSaveAsPending(view)).toBe(true);
  expect(JSON.stringify(view.dcbPref.slots)).toBe(before);
  expect(activeDcbPrefName(view)).toBe("KEEP");
});

test("parseDcbPrefName rejects empty, non-alnum, and digit-only text", () => {
  expect(parseDcbPrefName("NIGHT")).toEqual({ ok: true, name: "NIGHT" });
  expect(parseDcbPrefName("  day1  ")).toEqual({ ok: true, name: "day1" });
  expect(parseDcbPrefName("")).toEqual({ ok: false, reason: "empty" });
  expect(parseDcbPrefName("   ")).toEqual({ ok: false, reason: "empty" });
  expect(parseDcbPrefName("22/27")).toEqual({ ok: false, reason: "non-alnum" });
  expect(parseDcbPrefName("123")).toEqual({ ok: false, reason: "digit-only" });
  expect(DCB_PREF_NAME_MAX_CHARS).toBe(8);
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

test("AC6 — 32 slots; PREF is not Command IR; DAL123 H270 still works", async () => {
  expect(DCB_PREF_SLOT_COUNT).toBe(32);
  const view = kdemView();
  expect(view.dcbPref.slots).toHaveLength(32);
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

  const view = createScopeView();
  expect(activeDcbPrefName(view)).toBe("");
  beginDcbPrefSaveAs(view);
  commitDcbPrefSaveAs(view, "NIGHT");
  expect(activeDcbPrefName(view)).toBe("NIGHT");
  expect(formatDcbPrefReadout(activeDcbPrefName(view))).toBe("NIGHT");
  view.dcbPref.slots[0]!.name = "Approach Night";
  expect(formatDcbPrefReadout(activeDcbPrefName(view))).toBe("APPROA");
});

test("AC7 — PREF comments cite CRC analog, 32-slot STARS spec, not settings/theme", () => {
  const sources = import.meta.glob("./*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const text = sources["./dcbPref.ts"]!;
  expect(text).toMatch(/PREF/);
  expect(text).toMatch(/CRC/);
  expect(text).toMatch(/\b32\b/);
  expect(text).toMatch(/localStorage/);
  expect(text).toMatch(/not a settings panel/i);
  expect(text).toMatch(/theme picker/i);
  expect(text).toMatch(/No window\.prompt/);
});

test("parseDcbPrefJson gracefully handles legacy 8-slot configs by padding with null to 32 slots", () => {
  const view = kdemView();
  const legacy8Slots = Array.from({ length: 8 }, (_, i) => ({
    name: `PREF ${i + 1}`,
    body: serializeDcbPref(view),
  }));
  const legacyConfig = JSON.stringify({
    v: 2,
    icao: "KDEM",
    activeIndex: 5,
    slots: legacy8Slots,
  });

  const parsed = parseDcbPrefJson(legacyConfig, "KDEM");
  expect(parsed.slots).toHaveLength(32);
  expect(parsed.activeIndex).toBe(5);
  for (let i = 0; i < 8; i += 1) {
    expect(parsed.slots[i]?.name).toBe(`PREF ${i + 1}`);
  }
  for (let i = 8; i < 32; i += 1) {
    expect(parsed.slots[i]).toBeNull();
  }
});

test("AC4 — drawable PPI shrinks on the docked edge", () => {
  expect(DCB_THICKNESS_PX).toBe(36);
  expect(drawablePpiSize(800, 600, "TOP")).toEqual({ widthPx: 800, heightPx: 564 });
  expect(drawablePpiSize(800, 600, "BOTTOM")).toEqual({ widthPx: 800, heightPx: 564 });
  expect(drawablePpiSize(800, 600, "LEFT")).toEqual({ widthPx: 764, heightPx: 600 });
  expect(drawablePpiSize(800, 600, "RIGHT")).toEqual({ widthPx: 764, heightPx: 600 });
});

test("LEFT/RIGHT are the vertical DCB stack", () => {
  expect(isVerticalDcbDock("LEFT")).toBe(true);
  expect(isVerticalDcbDock("RIGHT")).toBe(true);
  expect(isVerticalDcbDock("TOP")).toBe(false);
  expect(isVerticalDcbDock("BOTTOM")).toBe(false);
});

test("comments say DCB position / HISTORY-adjacent PPI edge, not a dock panel", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./dcbPref.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/\bDCB\b/);
  expect(src).toMatch(/docs\.virtualnas\.net\/crc\/stars/);
  expect(src).toMatch(/TOP \/ LEFT \/ RIGHT \/ BOTTOM/);
  expect(src.toLowerCase()).not.toMatch(/dock panel/);
  expect(src.toLowerCase()).not.toMatch(/\bhud\b/);
});

test("T02-46 — omitted ATPA readout flags default on when an old PREF snapshot loads", () => {
  const view = createScopeView();
  const body = serializeDcbPref(view);
  body.atpa = { on: true } as typeof body.atpa;
  view.atpa.inTrailDistance = false;
  view.atpa.coneMileage = false;
  view.atpa.alertCones = false;
  view.atpa.monitorCones = false;
  applyDcbPref(view, body);
  expect(view.atpa.on).toBe(true);
  expect(view.atpa.inTrailDistance).toBe(true);
  expect(view.atpa.coneMileage).toBe(true);
  expect(view.atpa.alertCones).toBe(true);
  expect(view.atpa.monitorCones).toBe(true);
});

test("T02-47 — PREF round-trips five ATPA fields; v1 migrates; v4 and corrupt stay factory", async () => {
  expect(DCB_PREF_SCHEMA_VERSION).toBe(3);
  expect(DCB_PREF_READABLE_VERSIONS).toEqual([1, 2, 3]);
  const store = memoryStorage();
  const view = kdemView();
  view.dcbPref.icao = "KDEM";
  view.atpa.on = true;
  view.atpa.inTrailDistance = false;
  view.atpa.coneMileage = false;
  view.atpa.alertCones = false;
  view.atpa.monitorCones = true;
  saveDcbPref(view, store);
  const saved = JSON.parse(store.getItem(dcbPrefStorageKey("KDEM"))!) as {
    v: number;
    slots: Array<{ name: string; body: { atpa: unknown } } | null>;
  };
  expect(saved.v).toBe(3);
  expect(saved.slots[0]?.body.atpa).toEqual({
    on: true,
    inTrailDistance: false,
    coneMileage: false,
    alertCones: false,
    monitorCones: true,
  });

  const reloaded = kdemView();
  loadDcbPrefFromStorage(reloaded, "KDEM", store);
  expect(reloaded.atpa).toEqual({
    on: true,
    inTrailDistance: false,
    coneMileage: false,
    alertCones: false,
    monitorCones: true,
  });

  saved.v = 1;
  saved.slots[0]!.body.atpa = { on: true };
  store.setItem(dcbPrefStorageKey("KDEM"), JSON.stringify(saved));
  const migrated = kdemView();
  expect(() => loadDcbPrefFromStorage(migrated, "KDEM", store)).not.toThrow();
  expect(migrated.atpa).toEqual({
    on: true,
    inTrailDistance: true,
    coneMileage: true,
    alertCones: true,
    monitorCones: true,
  });
  expect(parseDcbPrefJson(store.getItem(dcbPrefStorageKey("KDEM")), "KDEM").v).toBe(3);

  saved.v = 2;
  saved.slots[0]!.body.atpa = { on: false };
  store.setItem(dcbPrefStorageKey("KDEM"), JSON.stringify(saved));
  const missingV2 = kdemView();
  loadDcbPrefFromStorage(missingV2, "KDEM", store);
  expect(missingV2.atpa.on).toBe(false);
  expect(missingV2.atpa.inTrailDistance).toBe(true);
  expect(missingV2.atpa.coneMileage).toBe(true);
  expect(missingV2.atpa.alertCones).toBe(true);
  expect(missingV2.atpa.monitorCones).toBe(true);

  saved.v = 4;
  store.setItem(dcbPrefStorageKey("KDEM"), JSON.stringify(saved));
  const unknown = kdemView();
  loadDcbPrefFromStorage(unknown, "KDEM", store);
  expect(unknown.dcbPref.slots.every((slot) => slot === null)).toBe(true);

  store.setItem(dcbPrefStorageKey("KDEM"), "{not-json");
  const corrupt = kdemView();
  expect(() => loadDcbPrefFromStorage(corrupt, "KDEM", store)).not.toThrow();
  expect(corrupt.dcbPref.slots.every((slot) => slot === null)).toBe(true);

  const { parseRadioText } = await import("@parse");
  const heading = parseRadioText("DAL123 H270");
  expect(heading.ok).toBe(true);
  if (heading.ok) {
    expect(heading.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    ]);
  }
});

test("T02-76 — PREF round-trips SITE mode; unknown site id falls back to FUSED", () => {
  const sites = [syntheticSite("ASR-N"), syntheticSite("ASR-S")];
  const store = memoryStorage();
  const view = createScopeView(0, 0, { radarSites: sites });
  view.dcbPref.icao = "KXXX";
  view.surveillanceMode = { siteId: "ASR-N" };
  view.ptlByAircraftId.set("ac-1", true);
  saveDcbPref(view, store);
  const saved = JSON.parse(store.getItem(dcbPrefStorageKey("KXXX"))!) as {
    slots: Array<{ body: Record<string, unknown> } | null>;
  };
  expect(saved.slots[0]?.body.surveillanceMode).toEqual({ siteId: "ASR-N" });
  expect(saved.slots[0]?.body).not.toHaveProperty("ptlByAircraftId");
  expect(JSON.stringify(saved.slots[0]?.body)).not.toMatch(/ptlByAircraftId/);

  const reloaded = createScopeView(0, 0, { radarSites: sites });
  reloaded.ptlByAircraftId.set("keep", false);
  loadDcbPrefFromStorage(reloaded, "KXXX", store);
  expect(reloaded.surveillanceMode).toEqual({ siteId: "ASR-N" });
  expect(reloaded.ptlByAircraftId.get("keep")).toBe(false);
  expect(reloaded.ptlByAircraftId.has("ac-1")).toBe(false);

  view.surveillanceMode = "MULTI";
  saveDcbPref(view, store);
  const multi = createScopeView(0, 0, { radarSites: sites });
  loadDcbPrefFromStorage(multi, "KXXX", store);
  expect(multi.surveillanceMode).toBe("MULTI");

  view.surveillanceMode = { siteId: "ASR-N" };
  saveDcbPref(view, store);
  const missingSite = createScopeView(0, 0, { radarSites: [syntheticSite("ASR-S")] });
  loadDcbPrefFromStorage(missingSite, "KXXX", store);
  expect(missingSite.surveillanceMode).toBe("FUSED");

  view.surveillanceMode = "MULTI";
  saveDcbPref(view, store);
  const emptySites = createScopeView(0, 0, { radarSites: [] });
  loadDcbPrefFromStorage(emptySites, "KXXX", store);
  expect(emptySites.surveillanceMode).toBe("FUSED");

  const omitted = serializeDcbPref(createScopeView());
  delete (omitted as { surveillanceMode?: unknown }).surveillanceMode;
  const factory = createScopeView(0, 0, { radarSites: sites, surveillanceMode: "MULTI" });
  applyDcbPref(factory, omitted);
  expect(factory.surveillanceMode).toBe("FUSED");
});

test("T02-70 — v3 PREF round-trips wxLevels; v2 missing field is six false", async () => {
  expect(DCB_PREF_SCHEMA_VERSION).toBe(3);
  expect(DCB_PREF_READABLE_VERSIONS).toEqual([1, 2, 3]);
  const store = memoryStorage();
  const view = kdemView();
  view.dcbPref.icao = "KDEM";
  view.wxLevels = [true, false, true, false, false, true];
  view.camera.rangeNm = 40;
  saveDcbPref(view, store);
  const saved = JSON.parse(store.getItem(dcbPrefStorageKey("KDEM"))!) as {
    v: number;
    slots: Array<{ body: { wxLevels?: unknown; rangeNm?: number } } | null>;
  };
  expect(saved.v).toBe(3);
  expect(saved.slots[0]?.body.wxLevels).toEqual([true, false, true, false, false, true]);
  expect(saved.slots[0]?.body.rangeNm).toBe(40);

  const reloaded = kdemView();
  loadDcbPrefFromStorage(reloaded, "KDEM", store);
  expect(reloaded.wxLevels).toEqual([true, false, true, false, false, true]);
  expect(reloaded.camera.rangeNm).toBe(40);

  saved.v = 2;
  delete saved.slots[0]!.body.wxLevels;
  store.setItem(dcbPrefStorageKey("KDEM"), JSON.stringify(saved));
  const fromV2 = kdemView();
  fromV2.wxLevels = [true, true, true, true, true, true];
  loadDcbPrefFromStorage(fromV2, "KDEM", store);
  expect(fromV2.wxLevels).toEqual([false, false, false, false, false, false]);
  expect(fromV2.camera.rangeNm).toBe(40);

  saved.v = 3;
  saved.slots[0]!.body.wxLevels = [true, "nope", false, false, false, false];
  store.setItem(dcbPrefStorageKey("KDEM"), JSON.stringify(saved));
  const malformed = kdemView();
  malformed.wxLevels = [true, true, true, true, true, true];
  loadDcbPrefFromStorage(malformed, "KDEM", store);
  expect(malformed.wxLevels).toEqual([false, false, false, false, false, false]);
  expect(malformed.camera.rangeNm).toBe(40);

  const reset = kdemView();
  reset.wxLevels = [true, false, false, false, false, false];
  applyDcbPrefDefaults(reset);
  expect(reset.wxLevels).toEqual([false, false, false, false, false, false]);

  const { parseRadioText } = await import("@parse");
  const heading = parseRadioText("DAL123 H270");
  expect(heading.ok).toBe(true);
  if (heading.ok) {
    expect(heading.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    ]);
  }
});
