/**
 * T02-67 — STARS keyboard command capstone.
 *
 * Drives shipped handleScopeKeyDown / handlePpiLeftClick / formatPreviewReadout
 * against a live ScopeView + World. Does not re-parse or add command behavior.
 */
import { expect, test } from "vitest";
import {
  createWorld,
  handoffFor,
  makeTestAircraft,
  offerPointout,
  type Aircraft,
  type World,
} from "@core";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { DEFAULT_ALTITUDE_FILTER, formatFilterReadout } from "../altitudeFilter";
import { DEFAULT_SCOPE_CAMERA, nmToScreen, type ScopeCamera } from "../camera";
import { datablockRect, linesForDatablock } from "../datablock";
import { RR_INTERVALS_NM, isVideoMapOn } from "../dcb/dcbFunctions";
import { parseDigitalMap } from "../mapLayers";
import { datablockLineHeightPx } from "../fonts";
import { DEFAULT_LEADER_DIR, leaderDirFromStarsClock } from "../leader";
import { pickAircraftHitAt } from "../pick";
import { handlePpiLeftClick } from "../ppi";
import { formatPreviewReadout } from "../previewArea";
import { PTL_MINUTE_PRESETS } from "../ptl";
import { handleScopeKeyDown } from "../scopeKeys";
import { createScopeView } from "../scopeView";
import { BEACONATOR_SLEW_MS, isTrackBeaconator, syncTrackDisplays } from "../trackDisplay";

const CAM: ScopeCamera = DEFAULT_SCOPE_CAMERA;
const CSS = 800;
const VIEW = { widthPx: CSS, heightPx: CSS };

function keyEvent(key: string) {
  return {
    key,
    preventDefault(): void {},
    stopPropagation(): void {},
  };
}

function typeKeys(
  view: ReturnType<typeof createScopeView>,
  world: World | undefined,
  keys: string[],
  focus: "scope" | "radio" = "scope",
  startMs = 0,
): number {
  let now = startMs;
  for (const key of keys) {
    handleScopeKeyDown(keyEvent(key), view, focus, world, now);
    now += 100;
  }
  return now;
}

function leftoverKeys(
  keys: string[],
  view: ReturnType<typeof createScopeView>,
  world: World | undefined,
  focus: "scope" | "radio",
  startMs = 0,
): string {
  let leftover = "";
  let now = startMs;
  for (const key of keys) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, focus, world, now) && key.length === 1) {
      leftover += key;
    }
    now += 100;
  }
  return leftover;
}

function kdemView() {
  return createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
}

function clickAt(
  view: ReturnType<typeof createScopeView>,
  world: World,
  xNm: number,
  yNm: number,
): void {
  const tick = nmToScreen(xNm, yNm, view.camera, VIEW);
  handlePpiLeftClick(view, world, tick.x, tick.y, CSS, CSS);
}

function datablockCenter(
  view: ReturnType<typeof createScopeView>,
  ac: Aircraft,
  tick: { x: number; y: number },
  simTimeMs = 0,
): { x: number; y: number } {
  const td = view.tracks.get(ac.id);
  const mode = td?.datablockMode ?? "partial";
  const lines = linesForDatablock(
    ac,
    mode,
    view.modeCVisible,
    td?.scratchpad ?? "",
    undefined,
    simTimeMs,
  );
  const lineH = datablockLineHeightPx(view.charSizePx);
  const rect = datablockRect(
    tick.x,
    tick.y,
    lines,
    view.datablockCellWidthPx,
    lineH,
    td?.leaderDir ?? DEFAULT_LEADER_DIR,
    view.leaderLengthPx,
  );
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

test("AC1 — *T *TV * P1 toggle lists; *T 15 resizes; live *T/*S click relocates", () => {
  const world = createWorld();
  const view = createScopeView();
  expect(view.systemLists.TAB.visible).toBe(false);
  expect(view.systemLists.VFR.visible).toBe(false);
  expect(view.systemLists.TOWER_1.visible).toBe(false);

  typeKeys(view, world, ["*", "T", "Enter"]);
  expect(view.systemLists.TAB.visible).toBe(true);
  expect(view.preview.phase).toBe("idle");

  typeKeys(view, world, ["*", "T", "V", "Enter"], "scope", 200);
  expect(view.systemLists.VFR.visible).toBe(true);
  expect(view.systemLists.TAB.visible).toBe(true);

  const tpaBefore = view.starsChordArmed;
  typeKeys(view, world, ["*", " ", "P", "1", "Enter"], "scope", 400);
  expect(view.systemLists.TOWER_1.visible).toBe(true);
  expect(view.systemLists.TAB.visible).toBe(true);
  expect(view.starsChordArmed).toBe(tpaBefore);

  typeKeys(view, world, ["*", "P", "3", "Enter"], "scope", 500);
  expect(view.starsChordArmed).toEqual({ type: "cone", target: "slewed", lengthNm: 3 });
  expect(view.systemLists.TOWER_3.visible).toBe(false);

  typeKeys(view, world, ["*", "T", " ", "1", "5", "Enter"], "scope", 600);
  expect(view.systemLists.TAB.maxLines).toBe(15);
  expect(view.systemLists.TAB.visible).toBe(true);

  typeKeys(view, world, ["*", "T"], "scope", 800);
  expect(view.preview.phase).toBe("entry");
  handlePpiLeftClick(view, world, 400, 200, CSS, CSS);
  expect(view.systemLists.TAB.x).toBe(0.5);
  expect(view.systemLists.TAB.y).toBe(0.25);
  expect(view.preview.phase).toBe("idle");

  typeKeys(view, world, ["*", "S"], "scope", 1000);
  handlePpiLeftClick(view, world, 0, 800, CSS, CSS);
  expect(view.systemLists.SSA.x).toBe(0);
  expect(view.systemLists.SSA.y).toBe(1);
  expect(view.preview.phase).toBe("idle");
});

test("AC1 — *D slot/id/ALL/NONE toggle maps; bare *D Enter stays TPA; tap-M is Mode C", () => {
  const world = createWorld();
  const view = kdemView();
  expect(isVideoMapOn(view, "RWY")).toBe(true);
  expect(isVideoMapOn(view, "LOC27")).toBe(true);

  typeKeys(view, world, ["*", "D", " ", "1", "Enter"]);
  expect(isVideoMapOn(view, "RWY")).toBe(false);
  expect(view.showRunway).toBe(false);

  typeKeys(view, world, ["*", "D", " ", "L", "O", "C", "2", "7", "Enter"], "scope", 200);
  expect(isVideoMapOn(view, "LOC27")).toBe(false);

  typeKeys(view, world, ["*", "D", " ", "A", "L", "L", "Enter"], "scope", 400);
  expect(isVideoMapOn(view, "RWY")).toBe(true);
  expect(isVideoMapOn(view, "LOC27")).toBe(true);

  typeKeys(view, world, ["*", "D", " ", "N", "O", "N", "E", "Enter"], "scope", 600);
  expect(isVideoMapOn(view, "RWY")).toBe(false);
  expect(isVideoMapOn(view, "LOC27")).toBe(false);

  const mapsAfterNone = { rwy: isVideoMapOn(view, "RWY"), loc: isVideoMapOn(view, "LOC27") };
  typeKeys(view, world, ["*", "D", "Enter"], "scope", 800);
  expect(view.preview.rejection).toBe("*D INV");
  expect(isVideoMapOn(view, "RWY")).toBe(mapsAfterNone.rwy);
  expect(isVideoMapOn(view, "LOC27")).toBe(mapsAfterNone.loc);

  typeKeys(view, world, ["*", "D", " ", "A", "L", "L", "Enter"], "scope", 1000);
  expect(isVideoMapOn(view, "DEM1_27")).toBe(true);
  expect(view.modeCVisible).toBe(true);
  typeKeys(view, world, ["M", " ", "D", "E", "M", "1", "_", "2", "7", "Enter"], "scope", 1200);
  expect(isVideoMapOn(view, "DEM1_27")).toBe(false);
  expect(view.modeCVisible).toBe(true);

  handleScopeKeyDown(keyEvent("M"), view, "scope", world, 2000);
  expect(view.modeCVisible).toBe(false);
  expect(view.preview.phase).toBe("idle");
});

test("AC1 — *C click recenters; *OFF; *RR 5/C/OFF; *PTL 3; *HIST 4; DCB lists frozen", () => {
  const world = createWorld();
  const view = createScopeView();
  expect(RR_INTERVALS_NM).toEqual([2, 5, 10]);
  expect(PTL_MINUTE_PRESETS).toEqual([0.5, 1, 2, 4]);

  typeKeys(view, world, ["*", "C", "Enter"]);
  expect(view.placeCenterArmed).toBe(true);
  const p = nmToScreen(5, -3, view.camera, VIEW);
  handlePpiLeftClick(view, world, p.x, p.y, CSS, CSS);
  expect(view.camera.centerEastNm).toBeCloseTo(5);
  expect(view.camera.centerNorthNm).toBeCloseTo(-3);
  expect(view.placeCenterArmed).toBe(false);

  typeKeys(view, world, ["*", "O", "F", "F", "Enter"], "scope", 200);
  expect(view.camera.centerEastNm).toBe(view.airportEastNm);
  expect(view.camera.centerNorthNm).toBe(view.airportNorthNm);

  view.ringIntervalNm = 10;
  view.showRings = false;
  typeKeys(view, world, ["*", "R", "R", " ", "5", "Enter"], "scope", 400);
  expect(view.ringIntervalNm).toBe(5);
  expect(view.showRings).toBe(true);

  typeKeys(view, world, ["*", "R", "R", "2", "0", "Enter"], "scope", 600);
  expect(view.ringIntervalNm).toBe(20);
  expect(RR_INTERVALS_NM).toEqual([2, 5, 10]);

  typeKeys(view, world, ["*", "R", "R", "C", "Enter"], "scope", 800);
  expect(view.placeRangeRingArmed).toBe(true);
  const ringAt = nmToScreen(6, -2, view.camera, VIEW);
  handlePpiLeftClick(view, world, ringAt.x, ringAt.y, CSS, CSS);
  expect(view.rangeRingEastNm).toBeCloseTo(6);
  expect(view.rangeRingNorthNm).toBeCloseTo(-2);
  expect(view.placeRangeRingArmed).toBe(false);

  view.camera.centerEastNm = 3;
  view.camera.centerNorthNm = 1;
  typeKeys(view, world, ["*", "R", "R", " ", "O", "F", "F", "Enter"], "scope", 1000);
  expect(view.rangeRingEastNm).toBeCloseTo(3);
  expect(view.rangeRingNorthNm).toBeCloseTo(1);

  typeKeys(view, world, ["*", "P", "T", "L", " ", "3", "Enter"], "scope", 1200);
  expect(view.ptlMinutes).toBe(3);
  expect(PTL_MINUTE_PRESETS).toEqual([0.5, 1, 2, 4]);

  typeKeys(view, world, ["*", "H", "I", "S", "T", " ", "4", "Enter"], "scope", 1400);
  expect(view.historyDotCount).toBe(4);
  expect(view.historyEnabled).toBe(true);
});

test("AC1 — *F flashes FILTER; *LA writes hundreds; *BCN add/DEL; incomplete INV", () => {
  const view = createScopeView();
  const world = createWorld();
  expect(view.altitudeFilter).toEqual(DEFAULT_ALTITUDE_FILTER);

  typeKeys(view, world, ["*", "F", "Enter"]);
  expect(view.altitudeFilter).toEqual(DEFAULT_ALTITUDE_FILTER);
  expect(view.filterEntry.phase).toBe("idle");
  expect(formatPreviewReadout(view.preview)).toBe("FILTER 000-180");
  expect(formatFilterReadout(view.altitudeFilter, view.filterEntry)).toBe("FILTER 000-180");

  typeKeys(
    view,
    world,
    ["*", "L", "A", " ", "0", "0", "0", " ", "1", "5", "0", "Enter"],
    "scope",
    200,
  );
  expect(view.altitudeFilter).toEqual({ minHundreds: 0, maxHundreds: 150 });
  expect(view.preview.phase).toBe("idle");

  typeKeys(view, world, ["*", "B", "C", "N", " ", "4", "5", "Enter"], "scope", 400);
  expect(view.beaconSelectCodes).toEqual(["45"]);
  typeKeys(
    view,
    world,
    ["*", "B", "C", "N", " ", "D", "E", "L", " ", "4", "5", "Enter"],
    "scope",
    600,
  );
  expect(view.beaconSelectCodes).toEqual([]);

  typeKeys(view, world, ["*", "B", "Enter"], "scope", 800);
  expect(view.preview.rejection).toBe("*B INV");
  expect(view.beaconSelectCodes).toEqual([]);
  expect(view.altitudeFilter).toEqual({ minHundreds: 0, maxHundreds: 150 });

  typeKeys(view, world, ["*", "L", "A", "Enter"], "scope", 1000);
  expect(view.preview.rejection).toBe("*LA INV");
  expect(view.altitudeFilter).toEqual({ minHundreds: 0, maxHundreds: 150 });

  typeKeys(view, world, ["*", "B", "C", "N", "Enter"], "scope", 1200);
  expect(view.preview.rejection).toBe("*BCN INV");
  expect(view.beaconSelectCodes).toEqual([]);
  expect(view.altitudeFilter).toEqual({ minHundreds: 0, maxHundreds: 150 });

  const chord = createScopeView();
  handleScopeKeyDown(keyEvent("F"), chord, "scope", undefined, 0);
  expect(chord.filterEntry.phase).toBe("min");
  expect(chord.preview.phase).toBe("idle");
});

test("AC1 — + / Enter * chords mutate tracks; / DB toggles PDB↔FDB; F3/F4 apply vs arm", () => {
  const hoWorld = createWorldFromScenario(loadKdem(), 1);
  const hoDal = hoWorld.aircraft[0]!;
  const hoView = createScopeView();
  syncTrackDisplays(hoView.tracks, hoWorld);
  expect(handoffFor(hoWorld, hoDal.id).kind).toBe("inbound");
  typeKeys(hoView, hoWorld, ["Enter"]);
  expect(hoView.preview.armed).toEqual({ type: "acceptHandoff" });
  clickAt(hoView, hoWorld, hoDal.xNm, hoDal.yNm);
  expect(handoffFor(hoWorld, hoDal.id).kind).not.toBe("inbound");
  expect(hoView.tracks.get(hoDal.id)!.ownership).toBe("owned");

  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 16, yNm: 8 });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  typeKeys(view, world, ["+"]);
  expect(view.preview.phase).toBe("entry");
  clickAt(view, world, dal.xNm, dal.yNm);
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(view.preview.phase).toBe("idle");

  typeKeys(view, world, ["/"], "scope", 200);
  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  const symbol = pickAircraftHitAt(world, tick.x, tick.y, CAM, CSS, CSS, 12, view);
  expect(symbol?.region).toBe("symbol");
  handlePpiLeftClick(view, world, tick.x, tick.y, CSS, CSS);
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  expect(view.preview.phase).toBe("idle");

  world.selectedAircraftId = dal.id;
  handleScopeKeyDown(keyEvent("F3"), view, "scope", world, 400);
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(view.preview.phase).toBe("idle");
  expect(view.tracks.get(dal.id)!.datablockMode).toBe("full");

  world.selectedAircraftId = null;
  typeKeys(view, world, ["/"], "scope", 500);
  const db = datablockCenter(view, dal, tick);
  const dbHit = pickAircraftHitAt(world, db.x, db.y, CAM, CSS, CSS, 12, view);
  expect(dbHit?.region).toBe("datablock");
  handlePpiLeftClick(view, world, db.x, db.y, CSS, CSS);
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(view.tracks.get(dal.id)!.datablockMode).toBe("partial");
  expect(view.preview.phase).toBe("idle");

  world.selectedAircraftId = dal.id;
  handleScopeKeyDown(keyEvent("F4"), view, "scope", world, 700);
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  expect(view.preview.phase).toBe("idle");

  world.selectedAircraftId = null;
  handleScopeKeyDown(keyEvent("F3"), view, "scope", world, 800);
  expect(view.preview.phase).toBe("armed");
  expect(view.preview.armed).toEqual({ type: "initCntl" });
  expect(formatPreviewReadout(view.preview)).toBe("INIT CNTL");
  handleScopeKeyDown(keyEvent("Escape"), view, "scope", world, 900);

  handleScopeKeyDown(keyEvent("F4"), view, "scope", world, 1000);
  expect(view.preview.armed).toEqual({ type: "termCntl" });
  handleScopeKeyDown(keyEvent("Escape"), view, "scope", world, 1100);

  typeKeys(view, world, ["+"], "scope", 1200);
  clickAt(view, world, dal.xNm, dal.yNm);
  typeKeys(view, world, ["*"], "scope", 1400);
  clickAt(view, world, dal.xNm, dal.yNm);
  expect(view.tracks.get(dal.id)!.highlighted).toBe(true);

  typeKeys(view, world, ["*", "3", "Enter"], "scope", 1600);
  clickAt(view, world, dal.xNm, dal.yNm);
  expect(view.tracks.get(dal.id)!.leaderDir).toBe(leaderDirFromStarsClock(3));

  view.tracks.get(dal.id)!.leaderDir = 6;
  typeKeys(view, world, ["*", "0", "Enter"], "scope", 1800);
  clickAt(view, world, dal.xNm, dal.yNm);
  expect(view.tracks.get(dal.id)!.leaderDir).toBe(view.defaultLeaderDir);

  const uncorr = makeTestAircraft({
    id: "ac-unc",
    callsign: "N1",
    xNm: -16,
    yNm: 0,
    squawk: "0342",
  });
  const beaconWorld = createWorld({ aircraft: [uncorr], simTimeMs: 1000 });
  const beaconView = createScopeView();
  syncTrackDisplays(beaconView.tracks, beaconWorld);
  typeKeys(beaconView, beaconWorld, ["*", "B"], "scope", 0);
  clickAt(beaconView, beaconWorld, uncorr.xNm, uncorr.yNm);
  const td = beaconView.tracks.get(uncorr.id)!;
  expect(isTrackBeaconator(td, beaconWorld.simTimeMs)).toBe(true);
  expect(td.beaconatorUntilSimMs).toBe(1000 + BEACONATOR_SLEW_MS);
  expect(beaconView.preview.phase).toBe("idle");

  offerPointout(beaconWorld, uncorr, "C");
  typeKeys(beaconView, beaconWorld, ["*"], "scope", 200);
  clickAt(beaconView, beaconWorld, uncorr.xNm, uncorr.yNm);
  const po = handoffFor(beaconWorld, uncorr.id);
  expect(po.kind === "pointout_inbound" && po.status === "accepted").toBe(true);
  expect(beaconView.tracks.get(uncorr.id)!.pointoutAccepted).toBe(true);
});

test("AC1 — radio leftover *T does not toggle lists; scope *T Enter is not radio leftover", () => {
  const world = createWorld();
  const radio = createScopeView();
  const radioLeftover = leftoverKeys(["*", "T", "Enter"], radio, world, "radio");
  expect(radioLeftover).toBe("*T");
  expect(radio.systemLists.TAB.visible).toBe(false);
  expect(radio.preview.phase).toBe("idle");
  expect(radio.preview.buffer).toBe("");

  const scope = createScopeView();
  const scopeLeftover = leftoverKeys(["*", "T", "Enter"], scope, world, "scope");
  expect(scopeLeftover).toBe("");
  expect(scope.systemLists.TAB.visible).toBe(true);
  expect(scope.preview.phase).toBe("idle");
});

test("T02-71 — *WX 1 / ALL / OFF / INV; radio leftover does not latch WX", () => {
  const world = createWorld();
  const view = createScopeView();
  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);

  typeKeys(view, world, ["*", "W", "X", "1", "Enter"]);
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);

  typeKeys(view, world, ["*", "W", "X", " ", "A", "L", "L", "Enter"], "scope", 200);
  expect(view.wxLevels).toEqual([true, true, true, true, true, true]);

  typeKeys(view, world, ["*", "W", "X", " ", "O", "F", "F", "Enter"], "scope", 400);
  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);

  typeKeys(view, world, ["*", "W", "X", "7", "Enter"], "scope", 600);
  expect(view.preview.rejection).toBe("*WX7 INV");
  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);

  const radio = createScopeView();
  const leftover = leftoverKeys(["*", "W", "X", "1", "Enter"], radio, world, "radio");
  expect(leftover).toBe("*WX1");
  expect(radio.wxLevels).toEqual([false, false, false, false, false, false]);
  expect(radio.preview.phase).toBe("idle");

  const scopeLeftover = leftoverKeys(["*", "W", "X", "1", "Enter"], view, world, "scope", 800);
  expect(scopeLeftover).toBe("");
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);
});

test("AC2 — invalid *XYZ *T 999 *D 99 flash buffer INV and do not mutate", () => {
  const world = createWorld();
  const lists = createScopeView();
  const tabBefore = { ...lists.systemLists.TAB };
  typeKeys(lists, world, ["*", "X", "Y", "Z", "Enter"]);
  expect(lists.preview.rejection).toBe("*XYZ INV");
  expect(formatPreviewReadout(lists.preview)).toBe("*XYZ INV");
  expect(lists.systemLists.TAB).toEqual(tabBefore);

  typeKeys(lists, world, ["*", "T", " ", "9", "9", "9", "Enter"], "scope", 200);
  expect(lists.preview.rejection).toBe("*T 999 INV");
  expect(lists.systemLists.TAB.maxLines).toBe(tabBefore.maxLines);
  expect(lists.systemLists.TAB.visible).toBe(tabBefore.visible);

  const maps = kdemView();
  const rwy = isVideoMapOn(maps, "RWY");
  const loc = isVideoMapOn(maps, "LOC27");
  typeKeys(maps, world, ["*", "D", " ", "9", "9", "Enter"]);
  expect(maps.preview.rejection).toBe("*D 99 INV");
  expect(isVideoMapOn(maps, "RWY")).toBe(rwy);
  expect(isVideoMapOn(maps, "LOC27")).toBe(loc);
});
