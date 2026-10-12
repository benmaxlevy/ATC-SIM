import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyDcbPref, applyDcbPrefDefaults, createScopeView } from "@scope";
import { loadPlayableScenario } from "@scenario";
import { bindScenarioDisplayContext } from "../../ui/sessionScenarioBinding";
import type { FmaAmz } from "../../core/alerts/fmaGeometry";
import { renderPref } from "../../ui/dcb/DisplayControlBarMenus";
import { rebindFmaScenarioAmzs } from "../scopeView";
import {
  applyFmaAmzPreference,
  beginDcbPrefSaveAs,
  commitDcbPrefSaveAs,
  dcbPrefStorageKey,
  enterFmaConfirmation,
  commitFmaConfirmation,
  loadDcbPrefFromStorage,
  persistDcbPref,
  saveDcbPref,
  saveFmaAmzPreference,
  selectDcbPrefOwner,
  selectDcbPrefSlot,
  serializeDcbPref,
  beginPrefUserEntry,
  beginPrefNameEntry,
  type DcbPrefStorage,
} from "@scope";

function memoryStorage(): DcbPrefStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

function installGroups(view: ReturnType<typeof createScopeView>): void {
  view.digitalMap.videoMapGroups = {
    facilityId: "KXYZ",
    facilityName: "Synthetic",
    mapsAbsentFromGroups: [],
    groups: [1, 2, 3].map((seed) => ({
      id: `group-${seed}`,
      sourceIndex: seed - 1,
      tcps: [],
      main: [],
      submenu: [],
    })),
  };
}

function setDisplay(view: ReturnType<typeof createScopeView>, seed: number): void {
  view.camera.rangeNm = (seed === 1 ? 15 : seed === 2 ? 30 : 40) as typeof view.camera.rangeNm;
  view.camera.centerEastNm = seed * 11;
  view.camera.centerNorthNm = seed * -7;
  view.brite.fdb = (40 + seed) as typeof view.brite.fdb;
  view.charSizes.dataBlocks = (seed === 3 ? 13 : 12) as typeof view.charSizes.dataBlocks;
  view.charSizePx = view.charSizes.dataBlocks;
  view.historyDotCount = seed as typeof view.historyDotCount;
  view.historyEnabled = seed > 0;
  view.ptlOn = seed % 2 === 0;
  view.ptlOwn = seed % 2 === 1;
  view.altitudeFilter = { minHundreds: seed * 10, maxHundreds: 180 - seed * 10 };
  view.associatedAltitudeFilter = { minHundreds: seed * 5, maxHundreds: 150 };
  view.vol = seed as typeof view.vol;
  view.dcbVisible = seed % 2 === 0;
  view.modeCVisible = seed % 2 === 1;
  view.mapListMode = seed % 2 === 0 ? "CURRENT" : "GEO";
  view.geoMapsListOn = seed % 2 === 1;
  view.currentMapsListOn = seed % 2 === 0;
  view.selectedMapGroupId = `group-${seed}`;
  view.beaconSelectCodes = [`45${seed}0`];
  view.caControllerOwnedPairsInhibited = seed % 2 === 0;
  view.systemLists.FL = {
    ...view.systemLists.FL!,
    visible: seed % 2 === 1,
    x: seed / 10,
    y: seed / 12,
    maxLines: 10 + seed,
  };
  view.fmaMag = seed + 1;
  view.fmaPtlSeconds = seed * 5;
  view.fmaVoiceLevel = seed + 5;
}

function displaySnapshot(view: ReturnType<typeof createScopeView>) {
  const body = serializeDcbPref(view);
  delete body.selectedFmaAmzId;
  return body;
}

function findDcbCell(
  node: unknown,
  id: string,
): { type?: unknown; props?: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null;
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (element.props?.dataDcb === id) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findDcbCell(child, id);
    if (found) return found;
  }
  return null;
}

const amz = (id: string): FmaAmz => ({ id, members: [], ntzs: [] }) as unknown as FmaAmz;

function prepareNormalSet(view: ReturnType<typeof createScopeView>): void {
  view.dcbPref.slots[0] = { name: "NORMAL", body: serializeDcbPref(view) };
  view.dcbPref.activeIndex = 0;
  view.dcbPref.lastApplied = { owner: "FSSTARS", index: 0, name: "NORMAL" };
  view.dcbPref.lastNormal = { index: 0, name: "NORMAL" };
  view.dcbPref.ownerConfirmed = true;
}

function saveAsFmaSet(
  view: ReturnType<typeof createScopeView>,
  name: string,
  storage: DcbPrefStorage,
): number {
  selectDcbPrefOwner(view, "FMA");
  beginDcbPrefSaveAs(view);
  const index = commitDcbPrefSaveAs(view, name, storage);
  if (index === null) throw new Error(`Could not create FMA PREF ${name}`);
  return index;
}

describe("T02-232 complete disjoint FMA display profiles", () => {
  test("USER roll stages without applying, and pointer commit cancels typed entry", () => {
    const view = createScopeView();
    const initial = displaySnapshot(view);
    beginPrefUserEntry(view.preview, 1);
    view.preview.buffer = "FM";
    const cell = findDcbCell(
      renderPref(view, () => undefined),
      "pref-user",
    );
    const onWheel = cell?.props?.onWheel as (event: {
      deltaY: number;
      preventDefault(): void;
      stopPropagation(): void;
    }) => void;
    onWheel({ deltaY: -1, preventDefault() {}, stopPropagation() {} });
    expect(view.dcbPref.ownerCandidate).toBe("FMA");
    expect(view.dcbPref.menuOwner).toBe("FSSTARS");
    expect(view.preview.phase).toBe("idle");
    expect(displaySnapshot(view)).toEqual(initial);
    const rerenderedCell = findDcbCell(
      renderPref(view, () => undefined),
      "pref-user",
    );
    (rerenderedCell?.props?.onClick as () => void)();
    expect(view.dcbPref.menuOwner).toBe("FMA");
    expect(view.dcbPref.ownerCandidate).toBeNull();
  });

  test("v3 and owners-only storage preserve normal records and migrate FMA names", () => {
    const legacyStorage = memoryStorage();
    const legacyBody = serializeDcbPref(createScopeView());
    const legacyAmzPreference = {
      amzId: "LEGACY2",
      mag: 4,
      displayProfile: { ...legacyBody, rangeNm: 30 },
    };
    legacyStorage.setItem(
      dcbPrefStorageKey("KXYZ"),
      JSON.stringify({
        v: 3,
        icao: "KXYZ",
        activeIndex: 0,
        slots: [
          {
            name: "NORMAL1",
            body: {
              ...legacyBody,
              amzPreferences: {
                LEGACY1: { amzId: "LEGACY1", rangeNm: 20 },
                LEGACY2: legacyAmzPreference,
              },
            },
          },
        ],
        amzPreferences: { LEGACY1: { amzId: "LEGACY1", rangeNm: 40, centerEastNm: 25 } },
        normalProfile: legacyBody,
      }),
    );
    const migrated = createScopeView();
    loadDcbPrefFromStorage(migrated, "KXYZ", legacyStorage);
    expect(migrated.dcbPref.slots[0]?.name).toBe("NORMAL1");
    expect(migrated.dcbPref.fmaSlots.slice(0, 2).map((slot) => slot?.name)).toEqual([
      "LEGACY1",
      "LEGACY2",
    ]);
    expect(migrated.dcbPref.fmaSlots[0]?.body).toMatchObject({
      rangeNm: 40,
      centerEastNm: 25,
    });
    expect(migrated.amzPreferences.get("LEGACY1")?.rangeNm).toBe(40);
    expect(migrated.amzPreferences.get("LEGACY2")?.displayProfile?.rangeNm).toBe(30);

    const ownerOnlyStorage = memoryStorage();
    ownerOnlyStorage.setItem(
      dcbPrefStorageKey("KXYZ"),
      JSON.stringify({
        v: 4,
        icao: "KXYZ",
        normalActiveIndex: 0,
        owners: {
          FSSTARS: [{ name: "OWNER1", body: legacyBody }],
          FMA: [],
        },
      }),
    );
    const ownerOnly = createScopeView();
    loadDcbPrefFromStorage(ownerOnly, "KXYZ", ownerOnlyStorage);
    expect(ownerOnly.dcbPref.slots[0]?.name).toBe("OWNER1");

    ownerOnlyStorage.setItem(
      dcbPrefStorageKey("KXYZ"),
      JSON.stringify({
        v: 4,
        icao: "KXYZ",
        slots: [{ name: "ROOT1", body: legacyBody }],
        owners: { FMA: [] },
      }),
    );
    const rootOnly = createScopeView();
    loadDcbPrefFromStorage(rootOnly, "KXYZ", ownerOnlyStorage);
    expect(rootOnly.dcbPref.slots[0]?.name).toBe("ROOT1");
  });

  test("explicit FSSTARS SAVE AS while FMA is active does not write FMA records", () => {
    const view = createScopeView();
    view.dcbPref.icao = "KXYZ";
    view.fmaAmzs = [amz("AMZ1")];
    view.fmaSurveillance.enabled = true;
    view.fmaSurveillance.selectedAmzId = "AMZ1";
    saveFmaAmzPreference(view, "AMZ1");
    view.dcbPref.fmaSlots[0] = { name: "AMZ1", body: serializeDcbPref(view) };
    const originalFmaSlots = structuredClone(view.dcbPref.fmaSlots);
    const originalAmzPreferences = structuredClone(view.amzPreferences);

    selectDcbPrefOwner(view, "FSSTARS");
    beginDcbPrefSaveAs(view);
    expect(commitDcbPrefSaveAs(view, "DAY", memoryStorage())).toBe(0);
    expect(view.dcbPref.fmaSlots).toEqual(originalFmaSlots);
    expect(view.amzPreferences).toEqual(originalAmzPreferences);
  });

  test("AMZ helper updates project through the same numbered FMA record on reload", () => {
    const storage = memoryStorage();
    const view = createScopeView();
    view.dcbPref.icao = "KXYZ";
    view.fmaAmzs = [amz("AMZ1")];
    saveFmaAmzPreference(view, "AMZ1");
    view.camera.rangeNm = 40;
    saveFmaAmzPreference(view, "AMZ1", { rangeNm: 40 });
    persistDcbPref(view, storage);

    const reloaded = createScopeView();
    loadDcbPrefFromStorage(reloaded, "KXYZ", storage);
    expect(reloaded.dcbPref.fmaSlots[0]?.name).toBe("AMZ1");
    expect(reloaded.dcbPref.fmaSlots[0]?.body.rangeNm).toBe(40);
    expect(reloaded.amzPreferences.get("AMZ1")?.displayProfile?.rangeNm).toBe(40);
  });

  test("normal, AMZ A, and AMZ B retain complete independent bodies through exit and reload", () => {
    const storage = memoryStorage();
    const view = createScopeView();
    installGroups(view);
    view.dcbPref.icao = "KXYZ";
    setDisplay(view, 1);
    prepareNormalSet(view);
    saveDcbPref(view, storage);
    const normal = structuredClone(view.dcbPref.normalProfile!);
    expect(normal).toMatchObject({
      rangeNm: 15,
      altitudeFilter: { minHundreds: 10, maxHundreds: 170 },
      modeCVisible: true,
      mapListMode: "GEO",
      selectedMapGroupId: "group-1",
      beaconSelectCodes: ["4510"],
    });

    view.fmaAmzs = [amz("AMZA"), amz("AMZB")];
    view.fmaSurveillance.selectedAmzId = "AMZA";
    view.fmaSurveillance.enabled = true;
    setDisplay(view, 2);
    const amzAIndex = saveAsFmaSet(view, "AMZA", storage);
    expect(view.amzPreferences.get("AMZA")?.displayProfile?.systemLists?.FL?.x).toBe(0.2);
    const normalSlots = structuredClone(view.dcbPref.slots);
    const normalBeforeSaveAs = structuredClone(view.dcbPref.normalProfile!);

    view.fmaSurveillance.selectedAmzId = "AMZB";
    setDisplay(view, 3);
    const amzBIndex = saveAsFmaSet(view, "AMZB", storage);
    expect(view.amzPreferences.get("AMZA")?.displayProfile?.rangeNm).toBe(30);
    expect(view.amzPreferences.get("AMZB")?.displayProfile?.rangeNm).toBe(40);
    expect(view.dcbPref.slots).toEqual(normalSlots);
    expect(view.dcbPref.normalProfile).toEqual(normalBeforeSaveAs);

    view.fmaSurveillance.selectedAmzId = "AMZA";
    expect(applyFmaAmzPreference(view, "AMZA")).toBe(true);
    expect(view.camera.rangeNm).toBe(30);
    expect(view.mapListMode).toBe("CURRENT");
    expect(view.systemLists.FL?.x).toBe(0.2);
    expect(view.fmaMag).toBe(3);
    setDisplay(view, 3);
    view.dcbPref.icao = "KXYZ";
    selectDcbPrefSlot(view, amzAIndex);
    setDisplay(view, 3);
    saveDcbPref(view, storage);
    applyDcbPrefDefaults(view);
    expect(view.brite.fdb).toBe(43);
    expect(view.charSizes.dataBlocks).toBe(13);
    expect(view.systemLists.FL?.maxLines).toBe(13);
    view.fmaSurveillance.tracks = new Map([["STALE", {} as never]]);
    selectDcbPrefSlot(view, amzBIndex);
    expect(view.fmaSurveillance.selectedAmzId).toBe("AMZB");
    expect(view.fmaSurveillance.tracks.size).toBe(0);
    expect(view.camera.rangeNm).toBe(40);
    expect(view.mapListMode).toBe("GEO");
    expect(view.fmaMag).toBe(4);

    // Explicit normal-owner selection applies normal settings without disabling FMA.
    selectDcbPrefOwner(view, "FSSTARS");
    selectDcbPrefSlot(view, 0);
    expect(view.fmaSurveillance.enabled).toBe(true);
    expect(view.fmaSurveillance.selectedAmzId).toBe("AMZB");
    expect(view.camera.rangeNm).toBe(15);

    // Unsaved normal edits must not become the exit target.
    setDisplay(view, 3);
    enterFmaConfirmation(view);
    expect(commitFmaConfirmation(view)).toBe(true);
    expect(view.fmaSurveillance.enabled).toBe(false);
    expect(serializeDcbPref(view)).toMatchObject(normal);

    // A later FMA SAVE persists the AMZ namespace while boot restores normal.
    view.fmaSurveillance.enabled = true;
    view.fmaSurveillance.selectedAmzId = "AMZB";
    selectDcbPrefOwner(view, "FMA");
    selectDcbPrefSlot(view, amzBIndex);
    setDisplay(view, 3);
    setDisplay(view, 3);
    saveDcbPref(view, storage);
    const reloaded = createScopeView();
    installGroups(reloaded);
    loadDcbPrefFromStorage(reloaded, "KXYZ", storage);
    expect(reloaded.fmaSurveillance.enabled).toBe(false);
    expect(serializeDcbPref(reloaded)).toMatchObject(normal);
    expect(reloaded.amzPreferences.get("AMZA")?.displayProfile?.rangeNm).toBe(40);
    expect(reloaded.amzPreferences.get("AMZB")?.displayProfile?.rangeNm).toBe(40);
    expect(storage.data.has(dcbPrefStorageKey("KXYZ"))).toBe(true);
  });

  test("session replacement binds target maps before loading the target normal profile", () => {
    const storage = memoryStorage();
    const target = loadPlayableScenario("katl");
    const targetMap = target.maps.loadedVideoMaps[0];
    const targetGroup = target.maps.videoMapGroups?.groups[0];
    if (!targetMap || !targetGroup) throw new Error("KATL scenario must include maps and groups");

    const view = createScopeView();
    view.digitalMap.loadedVideoMaps = [
      {
        id: "old-facility-map",
        name: "Old",
        file: "old.json",
        dcbLabel: "OLD",
        defaultOn: true,
        color: "map",
        features: [],
      },
    ];
    view.mapVisibility = new Map([["old-facility-map", true]]);
    view.mapCache = {} as never;
    view.dcbPref.icao = target.icao;
    prepareNormalSet(view);
    view.mapVisibility = new Map([[targetMap.id, false]]);
    view.mapListMode = "CURRENT";
    view.selectedMapGroupId = targetGroup.id;
    saveDcbPref(view, storage);

    bindScenarioDisplayContext(view, target, storage);

    expect(view.digitalMap.loadedVideoMaps?.map((map) => map.id)).toContain(targetMap.id);
    expect(view.mapVisibility.get(targetMap.id)).toBe(false);
    expect(view.mapVisibility.has("old-facility-map")).toBe(false);
    expect(view.mapListMode).toBe("CURRENT");
    expect(view.selectedMapGroupId).toBe(targetGroup.id);
    expect(view.mapCache).toBeNull();
    expect(view.fmaAmzs.length).toBeGreaterThan(0);

    view.amzPreferences.set("OLD-AMZ", { amzId: "OLD-AMZ" });
    view.fmaSurveillance.enabled = true;
    view.serviceMode = "FMA";
    bindScenarioDisplayContext(view, target, null);
    expect(view.amzPreferences.has("OLD-AMZ")).toBe(false);
    expect(view.fmaSurveillance.enabled).toBe(false);
    expect(view.serviceMode).not.toBe("FMA");
    expect(view.dcbPref.normalProfile?.centerEastNm).toBe(target.arpNm.xNm);
    expect(view.dcbPref.normalProfile?.centerNorthNm).toBe(target.arpNm.yNm);
  });

  test("scenario replacement cancels staged USER and SAVE AS entry state", () => {
    const view = createScopeView();
    const target = loadPlayableScenario("katl");
    view.dcbPref.menuOwner = "FMA";
    view.dcbPref.ownerCandidate = "FMA";
    beginPrefUserEntry(view.preview, 1);
    bindScenarioDisplayContext(view, target, null);
    expect(view.dcbPref.ownerCandidate).toBeNull();
    expect(view.dcbPref.menuOwner).toBe("FSSTARS");
    expect(view.preview.phase).toBe("idle");

    view.dcbPref.menuOwner = "FMA";
    view.dcbPref.ownerConfirmed = true;
    beginDcbPrefSaveAs(view);
    beginPrefNameEntry(view.preview, 2);
    bindScenarioDisplayContext(view, target, null);
    expect(view.dcbPref.pendingSaveAs).toBe(false);
    expect(view.dcbPref.menuOwner).toBe("FSSTARS");
    expect(view.preview.phase).toBe("idle");
  });

  test("FMA DEFAULT reapplies its complete profile and missing preference preserves display", () => {
    const view = createScopeView();
    installGroups(view);
    view.fmaAmzs = [amz("AMZA")];
    view.fmaSurveillance.enabled = true;
    view.fmaSurveillance.selectedAmzId = "AMZA";
    setDisplay(view, 2);
    saveFmaAmzPreference(view, "AMZA");
    setDisplay(view, 3);
    applyDcbPrefDefaults(view);
    expect(view.camera.rangeNm).toBe(30);
    expect(view.fmaMag).toBe(3);

    const before = displaySnapshot(view);
    view.fmaSurveillance.selectedAmzId = "NO-PREFERENCE";
    applyDcbPrefDefaults(view);
    expect(view.lastWarning).toBe("NO PREF SET FOUND");
    expect(displaySnapshot(view)).toEqual(before);
  });

  test("rendered DEFAULT exposes its native button and callback targets the active AMZ", () => {
    const view = createScopeView();
    view.fmaAmzs = [amz("AMZA")];
    view.fmaSurveillance.enabled = true;
    view.fmaSurveillance.selectedAmzId = "AMZA";
    setDisplay(view, 2);
    saveFmaAmzPreference(view, "AMZA");
    setDisplay(view, 3);
    const tree = renderPref(view, () => undefined);
    const html = renderToStaticMarkup(createElement(() => tree));
    expect(html).toContain('aria-label="Default"');
    expect(html).toContain('type="button"');
    const cell = findDcbCell(tree, "pref-default");
    expect((cell?.type as { name?: string }).name).toBe("DcbCell");
    (cell?.props?.onClick as () => void)();
    expect(view.camera.rangeNm).toBe(30);
    expect(view.brite.fdb).toBe(42);
  });

  test("profile apply restores loaded map visibility and group, then invalidates map cache", () => {
    const view = createScopeView();
    installGroups(view);
    view.digitalMap.loadedVideoMaps = [
      { id: "map-a", file: "a.json", dcbLabel: "A", defaultOn: true, color: "map", features: [] },
      { id: "map-b", file: "b.json", dcbLabel: "B", defaultOn: true, color: "map", features: [] },
    ] as never;
    view.mapVisibility.set("map-a", true);
    view.mapVisibility.set("map-b", true);
    view.selectedMapGroupId = "group-2";
    view.fmaAmzs = [amz("AMZ-A")];
    view.amzPreferences.set("AMZ-A", {
      amzId: "AMZ-A",
      mag: 2,
      displayProfile: {
        ...serializeDcbPref(view),
        mapVisibility: { "map-a": false },
        selectedMapGroupId: "group-1",
      },
    });
    view.mapCache = {} as never;
    expect(applyFmaAmzPreference(view, "AMZ-A")).toBe(true);
    expect(view.mapVisibility.get("map-a")).toBe(false);
    expect(view.mapVisibility.get("map-b")).toBe(false);
    expect(view.selectedMapGroupId).toBe("group-1");
    expect(view.mapCache).toBeNull();
  });

  test("reloading discards FMA runtime state and persists display profile only", () => {
    const storage = memoryStorage();
    const view = createScopeView();
    view.dcbPref.icao = "KXYZ";
    view.fmaAmzs = [amz("AMZA")];
    view.fmaSurveillance.enabled = true;
    view.fmaSurveillance.selectedAmzId = "AMZA";
    view.fmaSurveillance = {
      ...view.fmaSurveillance,
      tracks: new Map([["AC1", {} as never]]),
      reportWatermarks: new Map([["AC1", 1000]]),
    };
    view.fmaCandidateMode = true;
    view.serviceMode = "FMA";
    view.fmaSpeechEvents.push({ type: "test", level: 7 });
    view.fmaAcknowledgedEpisodeIds.add("episode-1");
    view.fmaSilencedEpisodeIds.add("episode-2");
    view.fmaAlertInhibit = { aircraftIds: new Set(["AC1"]) };
    saveAsFmaSet(view, "AMZA", storage);
    saveDcbPref(view, storage);
    const persisted = storage.getItem(dcbPrefStorageKey("KXYZ"))!;
    for (const runtimeKey of [
      "fmaSurveillance",
      "fmaCandidateMode",
      "fmaSpeechEvents",
      "fmaAcknowledgedEpisodeIds",
      "fmaSilencedEpisodeIds",
      "fmaAlertInhibit",
      "fmaAlertState",
      "fmaAlertResults",
      "serviceMode",
    ]) {
      expect(persisted).not.toContain(`"${runtimeKey}"`);
    }
    loadDcbPrefFromStorage(view, "KXYZ", storage);
    expect(view.fmaSurveillance.enabled).toBe(false);
    expect(view.fmaSurveillance.selectedAmzId).toBeNull();
    const reloaded = createScopeView();
    loadDcbPrefFromStorage(reloaded, "KXYZ", storage);
    expect(reloaded.fmaSurveillance.enabled).toBe(false);
    expect(reloaded.fmaSurveillance.tracks.size).toBe(0);
    expect(reloaded.fmaSurveillance.reportWatermarks.size).toBe(0);
    expect(reloaded.fmaCandidateMode).toBe(false);
    expect(reloaded.serviceMode).toBe("FSL");
    expect(reloaded.fmaSpeechEvents).toEqual([]);
    expect(reloaded.fmaAcknowledgedEpisodeIds.size).toBe(0);
    expect(reloaded.fmaSilencedEpisodeIds.size).toBe(0);
    expect(reloaded.fmaAlertInhibit.aircraftIds?.size ?? 0).toBe(0);
  });

  test("scenario replacement with no AMZ exits FMA and restores saved normal profile", () => {
    const view = createScopeView();
    setDisplay(view, 1);
    view.dcbPref.normalProfile = serializeDcbPref(view);
    view.fmaAmzs = [amz("AMZ-A")];
    view.fmaSurveillance.enabled = true;
    view.fmaSurveillance.selectedAmzId = "AMZ-A";
    setDisplay(view, 3);
    rebindFmaScenarioAmzs(view, [], null);
    expect(view.fmaSurveillance.enabled).toBe(false);
    expect(view.camera.rangeNm).toBe(15);
    expect(view.brite.fdb).toBe(41);
  });

  test("scenario replacement selects only a currently valid AMZ profile", () => {
    const view = createScopeView();
    view.fmaAmzs = [amz("AMZ-OLD")];
    view.fmaSurveillance.enabled = true;
    view.fmaSurveillance.selectedAmzId = "AMZ-OLD";
    view.amzPreferences.set("AMZ-OLD", { amzId: "AMZ-OLD", rangeNm: 15, mag: 2 });
    view.amzPreferences.set("AMZ-NEW", { amzId: "AMZ-NEW", rangeNm: 40, mag: 4 });
    rebindFmaScenarioAmzs(view, [amz("AMZ-NEW")], "AMZ-NEW");
    expect(view.fmaSurveillance.selectedAmzId).toBe("AMZ-NEW");
    expect(view.camera.rangeNm).toBe(40);
    expect(view.fmaMag).toBe(4);
  });

  test("FMA SAVE AS accepts only the exact active AMZ ID and leaves normal PREF identity alone", () => {
    const storage = memoryStorage();
    const view = createScopeView();
    view.dcbPref.icao = "KXYZ";
    view.fmaAmzs = [amz("AMZA")];
    view.fmaSurveillance.enabled = true;
    view.fmaSurveillance.selectedAmzId = "AMZA";
    const slots = structuredClone(view.dcbPref.slots);
    const normal = view.dcbPref.normalProfile;
    selectDcbPrefOwner(view, "FMA");
    beginDcbPrefSaveAs(view);
    expect(commitDcbPrefSaveAs(view, "OTHER", storage)).toBeNull();
    expect(view.dcbPref.pendingSaveAs).toBe(true);
    expect(commitDcbPrefSaveAs(view, "AMZA", storage)).toBe(0);
    expect(view.dcbPref.activeIndex).toBe(-1);
    expect(view.dcbPref.pendingSaveAs).toBe(false);
    expect(view.amzPreferences.get("AMZA")?.displayProfile).toBeDefined();
    expect(view.dcbPref.slots).toEqual(slots);
    expect(view.dcbPref.normalProfile).toBe(normal);
  });

  test("complete maps turn off maps omitted from the saved profile; legacy preferences use normal baseline", () => {
    const view = createScopeView();
    view.dcbPref.normalProfile = serializeDcbPref(view);
    view.fmaAmzs = [amz("AMZ-A")];
    view.amzPreferences.set("AMZ-A", {
      amzId: "AMZ-A",
      mag: 2,
      rangeNm: 25,
      mapVisibility: {},
    });
    view.fmaSurveillance.enabled = true;
    view.fmaSurveillance.selectedAmzId = "AMZ-A";
    view.fmaMag = 8;
    expect(applyFmaAmzPreference(view, "AMZ-A")).toBe(true);
    expect(view.fmaMag).toBe(2);
    expect(view.amzPreferences.get("AMZ-A")?.displayProfile).toBeDefined();

    const body = serializeDcbPref(view);
    const restored = createScopeView();
    applyDcbPref(restored, body);
    expect(restored.amzPreferences.get("AMZ-A")?.displayProfile).toBeDefined();
  });

  test("corrupt complete profile falls back to the normal baseline without leaking invalid state", () => {
    const view = createScopeView();
    setDisplay(view, 1);
    view.dcbPref.normalProfile = serializeDcbPref(view);
    view.fmaAmzs = [amz("AMZ-BAD")];
    view.amzPreferences.set("AMZ-BAD", {
      amzId: "AMZ-BAD",
      displayProfile: { dcbDock: "INVALID", rangeNm: 999, mapVisibility: [] } as never,
    });
    view.fmaSurveillance.enabled = true;
    view.fmaSurveillance.selectedAmzId = "AMZ-BAD";
    expect(() => applyFmaAmzPreference(view, "AMZ-BAD")).not.toThrow();
    expect(view.camera.rangeNm).toBe(15);
    expect(view.dcbDock).toBe("TOP");
    expect(Array.isArray(view.amzPreferences.get("AMZ-BAD")?.displayProfile?.mapVisibility)).toBe(
      false,
    );
  });
});
