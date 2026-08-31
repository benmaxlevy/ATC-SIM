/**
 * T02-54 — Preview Area addendum end-to-end acceptance.
 *
 * Drives a real World + ScopeView through handleScopeKeyDown and
 * handlePpiLeftClick. Ownership, beacon-select, and *J dispatch stay in the
 * shipped helpers; this file does not re-derive them.
 */
import { expect, test } from "vitest";
import { SessionLog, createWorld, handoffFor, makeTestAircraft, type World } from "@core";
import { handleRadioText } from "@pilot";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { DEFAULT_ALTITUDE_FILTER, formatFilterReadout } from "./altitudeFilter";
import { DEFAULT_SCOPE_CAMERA, nmToScreen, type ScopeCamera } from "./camera";
import { bindingById } from "./keymap";
import { PALETTE } from "./palette";
import { handlePpiLeftClick } from "./ppi";
import { formatPreviewReadout } from "./previewArea";
import { renderScope } from "./renderScope";
import { handleScopeKeyDown } from "./scopeKeys";
import { createScopeView } from "./scopeView";
import { drawWeatherLayer } from "./weatherLayer";
import { bboxFromArp, decodeRgbaToVipMasks } from "./wx";
import { formatStarsChordReadout } from "./starsChord";
import { targetSymbolDescriptor } from "./targetSymbol";
import { syncTrackDisplays } from "./trackDisplay";

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

function paint(world: World, view: ReturnType<typeof createScopeView>) {
  const strokeRects: { x: number; y: number; w: number; h: number }[] = [];
  const fillTexts: { text: string; x: number; y: number; fillStyle: string }[] = [];
  let currentFillStyle = "#FFFFFF";
  let currentStrokeStyle = "#FFFFFF";
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    arc() {},
    clip() {},
    rect() {},
    fillRect() {},
    stroke() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    setTransform() {},
    strokeRect(x: number, y: number, w: number, h: number) {
      strokeRects.push({ x, y, w, h });
    },
    measureText(text: string) {
      return { width: Math.max(0, text.length) * 7.2 };
    },
    fillText(text: string, x: number, y: number) {
      fillTexts.push({ text, x, y, fillStyle: currentFillStyle });
    },
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(val: string) {
      currentFillStyle = String(val);
    },
    get strokeStyle() {
      return currentStrokeStyle;
    },
    set strokeStyle(val: string) {
      currentStrokeStyle = String(val);
    },
    lineWidth: 1,
    font: "12px monospace",
    textBaseline: "alphabetic",
    textAlign: "start",
  };
  renderScope(ctx as unknown as CanvasRenderingContext2D, world, view, CSS, CSS);
  return { fillTexts, strokeRects };
}

function squareNear(
  strokeRects: { x: number; y: number; w: number; h: number }[],
  cx: number,
  cy: number,
): boolean {
  return strokeRects.some(
    (r) => Math.abs(r.x + r.w / 2 - cx) <= 2 && Math.abs(r.y + r.h / 2 - cy) <= 2,
  );
}

function starNear(
  fillTexts: { text: string; x: number; y: number }[],
  cx: number,
  cy: number,
): boolean {
  return fillTexts.some(
    (t) => t.text === "*" && Math.abs(t.x - cx) <= 4 && Math.abs(t.y - cy) <= 4,
  );
}

test("AC1 — F3 slew paints INIT CNTL; click unowned arrival owns white FDB; empty click keeps the arm", () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  expect(handoffFor(world, dal.id).kind).toBe("inbound");
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  expect(world.selectedAircraftId).toBeNull();

  handleScopeKeyDown(keyEvent("F3"), view, "scope", world, 0);
  expect(view.preview.phase).toBe("armed");
  expect(view.preview.mnemonic).toBe("INIT CNTL");
  expect(formatPreviewReadout(view.preview)).toBe("INIT CNTL");
  expect(formatPreviewReadout(view.preview)).not.toBe("F3");
  const armedPaint = paint(world, view);
  expect(armedPaint.fillTexts.some((t) => t.text === "INIT CNTL")).toBe(true);
  expect(armedPaint.fillTexts.some((t) => t.text === "F3")).toBe(false);

  handlePpiLeftClick(view, world, 10, 10, CSS, CSS);
  expect(view.preview.phase).toBe("armed");
  expect(view.preview.mnemonic).toBe("INIT CNTL");
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");

  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  handlePpiLeftClick(view, world, tick.x, tick.y, CSS, CSS);
  expect(view.preview.phase).toBe("idle");
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(handoffFor(world, dal.id).kind).not.toBe("inbound");
  expect(world.selectedAircraftId).toBe(dal.id);

  const ownedPaint = paint(world, view);
  expect(ownedPaint.fillTexts.find((t) => t.text === "DAL123")?.fillStyle).toBe(PALETTE.owned);
  expect(PALETTE.owned).toBe("#FFFFFF");
});

test("AC2 — F3 FLID Enter owns DAL123 with nothing selected; unknown/ambiguous INV", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 16, yNm: 8 });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL123", xNm: -16, yNm: 0 });
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  expect(world.selectedAircraftId).toBeNull();

  typeKeys(view, world, ["F3", "D", "A", "L", "1", "2", "3", "Enter"], "radio");
  expect(world.selectedAircraftId).toBeNull();
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(view.tracks.get(aal.id)!.ownership).toBe("unowned");
  expect(view.preview.phase).toBe("idle");

  handleScopeKeyDown(keyEvent("F3"), view, "radio", world, 1000);
  typeKeys(view, world, ["X", "Y", "Z", "9", "Enter"], "radio", 1100);
  expect(view.preview.rejection).toBe("INIT CNTL XYZ9 INV");
  expect(view.tracks.get(aal.id)!.ownership).toBe("unowned");

  handleScopeKeyDown(keyEvent("F3"), view, "radio", world, 2000);
  typeKeys(view, world, ["1", "2", "3", "Enter"], "radio", 2100);
  expect(view.preview.rejection).toBe("INIT CNTL 123 INV");
  expect(view.tracks.get(aal.id)!.ownership).toBe("unowned");
});

test("AC2 — F4 slew drops; implied select-then-F4 still drops", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 16, yNm: 8 });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL456", xNm: -16, yNm: 0 });
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  world.selectedAircraftId = dal.id;
  handleScopeKeyDown(keyEvent("F3"), view, "scope", world, 0);
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(view.preview.phase).toBe("idle");

  world.selectedAircraftId = null;
  handleScopeKeyDown(keyEvent("F4"), view, "scope", world, 100);
  expect(view.preview.phase).toBe("armed");
  expect(view.preview.mnemonic).toBe("TERM CNTL");
  expect(formatPreviewReadout(view.preview)).toBe("TERM CNTL");
  expect(formatPreviewReadout(view.preview)).not.toBe("F4");
  const termPaint = paint(world, view);
  expect(termPaint.fillTexts.some((t) => t.text === "TERM CNTL")).toBe(true);
  expect(termPaint.fillTexts.some((t) => t.text === "F4")).toBe(false);

  handlePpiLeftClick(view, world, 10, 10, CSS, CSS);
  expect(view.preview.phase).toBe("armed");
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");

  const dalTick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS, CSS);
  expect(view.preview.phase).toBe("idle");
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");

  world.selectedAircraftId = aal.id;
  handleScopeKeyDown(keyEvent("F3"), view, "scope", world, 200);
  expect(view.tracks.get(aal.id)!.ownership).toBe("owned");
  handleScopeKeyDown(keyEvent("F4"), view, "scope", world, 300);
  expect(view.tracks.get(aal.id)!.ownership).toBe("unowned");
  expect(view.preview.phase).toBe("idle");
});

test("AC3 — B4500 paints matching unassociated □; unmatched stays *; toggle-off restores *", () => {
  const match = makeTestAircraft({
    id: "ac-match",
    callsign: "SEL1",
    xNm: -2,
    yNm: 0,
    squawk: "4500",
  });
  const miss = makeTestAircraft({
    id: "ac-miss",
    callsign: "DAL2",
    xNm: 2,
    yNm: 0,
    squawk: "0342",
  });
  const world = createWorld({ aircraft: [match, miss] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  typeKeys(view, world, ["B", "4", "5", "0", "0"], "scope");
  expect(view.beaconSelectCodes).toEqual(["4500"]);
  expect(view.preview.phase).toBe("idle");
  expect(
    targetSymbolDescriptor({
      ownership: "unowned",
      squawk: "4500",
      beaconSelect: view.beaconSelectCodes,
    }).symbol,
  ).toBe("□");
  expect(
    targetSymbolDescriptor({
      ownership: "unowned",
      squawk: "0342",
      beaconSelect: view.beaconSelectCodes,
    }).symbol,
  ).toBe("*");

  const pMatch = nmToScreen(match.xNm, match.yNm, view.camera, VIEW);
  const pMiss = nmToScreen(miss.xNm, miss.yNm, view.camera, VIEW);
  const selected = paint(world, view);
  expect(squareNear(selected.strokeRects, pMatch.x, pMatch.y)).toBe(true);
  expect(starNear(selected.fillTexts, pMiss.x, pMiss.y)).toBe(true);

  typeKeys(view, world, ["B", "4", "5", "0", "0"], "scope", 1000);
  expect(view.beaconSelectCodes).toEqual([]);
  const cleared = paint(world, view);
  expect(starNear(cleared.fillTexts, pMatch.x, pMatch.y)).toBe(true);
  expect(starNear(cleared.fillTexts, pMiss.x, pMiss.y)).toBe(true);
});

test("AC4 / AC5 — radio DAL123 H270 still turns; preview keys emit zero command.accepted", async () => {
  const log = new SessionLog();
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    headingDeg: 90,
    xNm: 16,
    yNm: 8,
  });
  const world = createWorld({ aircraft: [dal], sessionLog: log });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  typeKeys(view, world, ["F3"], "radio");
  typeKeys(view, world, ["D", "A", "L", "1", "2", "3", "Enter"], "radio", 100);
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(log.byType("command.accepted")).toHaveLength(0);

  world.selectedAircraftId = dal.id;
  handleScopeKeyDown(keyEvent("F4"), view, "radio", world, 800);
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  expect(log.byType("command.accepted")).toHaveLength(0);

  typeKeys(view, world, ["B", "4", "5", "0", "0"], "scope", 900);
  expect(view.beaconSelectCodes).toEqual(["4500"]);
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(dal.intent.assignedHeadingDeg).toBe(90);

  let radio = "";
  for (const key of ["D", "A", "L", "1", "2", "3", " ", "H", "2", "7", "0"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, "radio", world, 2000) && key.length === 1) {
      radio += key;
    }
  }
  expect(radio).toBe("DAL123 H270");
  const result = await handleRadioText(world, radio, log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(log.byType("command.accepted").length).toBeGreaterThanOrEqual(1);
});

test("AC4 — *J3 still arms/slews; live * hint wins over idle preview; F1 beaconator; F7 PTL ALL", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 16, yNm: 8 });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL456", xNm: -16, yNm: 0 });
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  typeKeys(view, world, ["*", "J", "3", "Enter"], "scope");
  expect(view.starsChordArmed).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });
  expect(formatPreviewReadout(view.preview)).toBeNull();
  const armedChord = paint(world, view);
  expect(armedChord.fillTexts.some((t) => t.text === "*J3")).toBe(true);

  const dalTick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS, CSS);
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(3);
  expect(view.tracks.get(aal.id)?.tpaRingNm).toBeUndefined();
  expect(view.starsChordArmed).toBeNull();

  world.selectedAircraftId = null;
  handleScopeKeyDown(keyEvent("F3"), view, "scope", world, 500);
  expect(formatPreviewReadout(view.preview)).toBe("INIT CNTL");
  handleScopeKeyDown(keyEvent("*"), view, "scope", world, 600);
  expect(formatStarsChordReadout(view.starsChordEntry, view.starsChordArmed)).toBe("*");
  const starred = paint(world, view);
  expect(starred.fillTexts.some((t) => t.text === "*" && t.x === 8)).toBe(true);
  expect(starred.fillTexts.some((t) => t.text === "INIT CNTL")).toBe(false);

  handleScopeKeyDown(keyEvent("Escape"), view, "scope", world, 700);
  handleScopeKeyDown(keyEvent("Escape"), view, "scope", world, 800);
  handleScopeKeyDown(keyEvent("F1"), view, "scope", world, 900);
  expect(view.beaconatorActive).toBe(true);
  handleScopeKeyDown(keyEvent("F7"), view, "scope", world, 1000);
  expect(view.ptlOn).toBe(true);
});

test("AC5 — KEY_BINDINGS overlay text includes INIT CNTL command-then-slew", () => {
  const init = bindingById("initiate-track")!;
  expect(init.action).toMatch(/command-then-slew/);
  expect(init.action).toMatch(/FLID/);
  expect(init.crcAnalog).toMatch(/INIT CNTL/);
  expect(bindingById("help")?.crcAnalog).toMatch(/beaconator/);
  expect(bindingById("ptl")?.action).toMatch(/PTL ALL/);
});

test("T02-64 — *C Enter then PPI click recenters; *OFF resets to KDEM ARP", () => {
  const world = createWorld();
  const view = createScopeView();
  expect(view.camera.centerEastNm).toBe(view.airportEastNm);
  expect(view.camera.centerNorthNm).toBe(view.airportNorthNm);

  typeKeys(view, world, ["*", "C", "Enter"], "scope");
  expect(view.placeCenterArmed).toBe(true);
  expect(view.preview.phase).toBe("idle");
  expect(formatPreviewReadout(view.preview)).toBeNull();

  const p = nmToScreen(5, -3, view.camera, VIEW);
  handlePpiLeftClick(view, world, p.x, p.y, CSS, CSS);
  expect(view.camera.centerEastNm).toBeCloseTo(5);
  expect(view.camera.centerNorthNm).toBeCloseTo(-3);
  expect(view.placeCenterArmed).toBe(false);

  typeKeys(view, world, ["*", "O", "F", "F", "Enter"], "scope", 500);
  expect(view.camera.centerEastNm).toBe(view.airportEastNm);
  expect(view.camera.centerNorthNm).toBe(view.airportNorthNm);
});

test("T02-64 — *RR spacing/origin and *PTL / *HIST; invalid params do not mutate", () => {
  const world = createWorld();
  const view = createScopeView();
  view.showRings = false;
  const startRr = view.ringIntervalNm;
  const startPtl = view.ptlMinutes;
  const startHist = view.historyDotCount;

  typeKeys(view, world, ["*", "R", "R", "7", "Enter"], "scope");
  expect(view.preview.rejection).toBe("*RR7 INV");
  expect(view.ringIntervalNm).toBe(startRr);
  expect(view.showRings).toBe(false);

  typeKeys(view, world, ["*", "R", "R", "2", "0", "Enter"], "scope", 200);
  expect(view.ringIntervalNm).toBe(20);
  expect(view.showRings).toBe(true);

  typeKeys(view, world, ["*", " ", "R", "R", " ", "1", "0", "Enter"], "scope", 400);
  expect(view.ringIntervalNm).toBe(10);

  typeKeys(view, world, ["*", "R", "R", "C", "Enter"], "scope", 600);
  expect(view.placeRangeRingArmed).toBe(true);
  expect(view.placeCenterArmed).toBe(false);
  expect(view.preview.phase).toBe("idle");
  const ringAt = nmToScreen(6, -2, view.camera, VIEW);
  handlePpiLeftClick(view, world, ringAt.x, ringAt.y, CSS, CSS);
  expect(view.rangeRingEastNm).toBeCloseTo(6);
  expect(view.rangeRingNorthNm).toBeCloseTo(-2);
  expect(view.placeRangeRingArmed).toBe(false);

  view.camera.centerEastNm = 3;
  view.camera.centerNorthNm = 1;
  typeKeys(view, world, ["*", "R", "R", "O", "F", "F", "Enter"], "scope", 800);
  expect(view.rangeRingEastNm).toBeCloseTo(3);
  expect(view.rangeRingNorthNm).toBeCloseTo(1);

  typeKeys(view, world, ["*", "P", "T", "L", "2", "5", "Enter"], "scope", 1000);
  expect(view.preview.rejection).toBe("*PTL25 INV");
  expect(view.ptlMinutes).toBe(startPtl);

  view.ptlOn = true;
  typeKeys(view, world, ["*", "P", "T", "L", "0", "Enter"], "scope", 1200);
  expect(view.ptlMinutes).toBe(0);
  expect(view.ptlOn).toBe(false);
  typeKeys(view, world, ["*", "P", "T", "L", "1", "5", "Enter"], "scope", 1400);
  expect(view.ptlMinutes).toBe(15);

  typeKeys(view, world, ["*", "H", "I", "S", "T", "1", "2", "Enter"], "scope", 1600);
  expect(view.preview.rejection).toBe("*HIST12 INV");
  expect(view.historyDotCount).toBe(startHist);

  typeKeys(view, world, ["*", "H", "I", "S", "T", "0", "Enter"], "scope", 1800);
  expect(view.historyDotCount).toBe(0);
  expect(view.historyEnabled).toBe(false);
  typeKeys(view, world, ["*", "H", "I", "S", "T", "9", "Enter"], "scope", 2000);
  expect(view.historyDotCount).toBe(9);
  expect(view.historyEnabled).toBe(true);
});

test("T02-64 — *PTL does not steal TPA *P / *P5; *J3 still arms", () => {
  const world = createWorld();
  const view = createScopeView();

  typeKeys(view, world, ["*", "P", "Enter"], "scope");
  expect(view.starsChordArmed).toEqual({ type: "coneClear", target: "slewed" });
  expect(view.ptlMinutes).toBe(1);

  view.starsChordArmed = null;
  typeKeys(view, world, ["*", "P", "5", "Enter"], "scope", 200);
  expect(view.starsChordArmed).toEqual({ type: "cone", target: "slewed", lengthNm: 5 });
  expect(view.ptlMinutes).toBe(1);

  view.starsChordArmed = null;
  typeKeys(view, world, ["*", "P", "T", "L", "4", "Enter"], "scope", 400);
  expect(view.ptlMinutes).toBe(4);
  expect(view.starsChordArmed).toBeNull();

  typeKeys(view, world, ["*", "J", "3", "Enter"], "scope", 600);
  expect(view.starsChordArmed).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });
});

test("T02-65 — *F readout, *LA bounds, *BCN □ paint; *B / idle F / B45 unchanged", () => {
  const ac = makeTestAircraft({
    id: "ac-bcn",
    callsign: "DAL45",
    squawk: "4521",
    altitudeFt: 5000,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  typeKeys(view, world, ["*", "F", "Enter"], "scope");
  expect(view.altitudeFilter).toEqual(DEFAULT_ALTITUDE_FILTER);
  expect(formatPreviewReadout(view.preview)).toBe("FILTER 000-180");

  typeKeys(view, world, ["*", "L", "A", "0", "0", "0", "1", "2", "0", "Enter"], "scope", 200);
  expect(view.altitudeFilter).toEqual({ minHundreds: 0, maxHundreds: 120 });
  expect(formatFilterReadout(view.altitudeFilter, view.filterEntry)).toBe("FILTER 000-120");

  typeKeys(view, world, ["*", "B", "C", "N", "4", "5", "Enter"], "scope", 400);
  expect(view.beaconSelectCodes).toEqual(["45"]);
  expect(
    targetSymbolDescriptor({
      ownership: "unowned",
      squawk: ac.squawk,
      beaconSelect: view.beaconSelectCodes,
    }).symbol,
  ).toBe("□");

  typeKeys(view, world, ["*", "B", "C", "N", "D", "E", "L", "4", "5", "Enter"], "scope", 600);
  expect(view.beaconSelectCodes).toEqual([]);
  expect(
    targetSymbolDescriptor({
      ownership: "unowned",
      squawk: ac.squawk,
      beaconSelect: view.beaconSelectCodes,
    }).symbol,
  ).toBe("*");

  typeKeys(view, world, ["B", "4", "5", "Enter"], "scope", 800);
  expect(view.beaconSelectCodes).toEqual(["45"]);

  const filterView = createScopeView();
  typeKeys(filterView, world, ["F"], "scope");
  expect(filterView.filterEntry.phase).toBe("min");
  expect(filterView.preview.phase).toBe("idle");

  const tpa = createScopeView();
  tpa.atpa.monitorCones = false;
  typeKeys(tpa, world, ["*", "B", "E", "Enter"], "scope");
  expect(tpa.atpa.monitorCones).toBe(true);
  expect(tpa.beaconSelectCodes).toEqual([]);
  expect(tpa.preview.rejection).toBeNull();
});

test("T02-74 — *R Enter plus click toggles one track; miss keeps arm; *RR and F7 stay global", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 8,
    yNm: 0,
    headingDeg: 90,
    speedKt: 180,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL456",
    xNm: -8,
    yNm: 0,
    headingDeg: 90,
    speedKt: 180,
  });
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();

  typeKeys(view, world, ["*", "R", "Enter"], "scope");
  expect(view.preview.armed).toEqual({ type: "armPerTrackPtl" });
  expect(formatPreviewReadout(view.preview)).toBe("*R");

  const miss = nmToScreen(0, 8, view.camera, VIEW);
  handlePpiLeftClick(view, world, miss.x, miss.y, CSS, CSS);
  expect(view.ptlByAircraftId.size).toBe(0);
  expect(view.preview.armed).toEqual({ type: "armPerTrackPtl" });
  expect(world.selectedAircraftId).toBeNull();

  const dalTick = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS, CSS);
  expect(view.ptlByAircraftId.get(dal.id)).toBe(true);
  expect(view.ptlByAircraftId.has(aal.id)).toBe(false);
  expect(view.preview.armed).toBeNull();
  expect(world.selectedAircraftId).toBeNull();
  expect(view.ptlOn).toBe(false);
  expect(view.ptlMinutes).toBe(1);

  const aalTick = nmToScreen(aal.xNm, aal.yNm, view.camera, VIEW);
  handlePpiLeftClick(view, world, aalTick.x, aalTick.y, CSS, CSS);
  expect(view.ptlByAircraftId.has(aal.id)).toBe(false);

  handleScopeKeyDown(keyEvent("F7"), view, "scope", world, 400);
  expect(view.ptlOn).toBe(true);
  expect(view.ptlByAircraftId.get(dal.id)).toBe(true);

  typeKeys(view, world, ["*", "R", "Enter"], "scope", 500);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS, CSS);
  expect(view.ptlByAircraftId.get(dal.id)).toBe(false);
  expect(view.ptlOn).toBe(true);
  expect(view.ptlMinutes).toBe(1);

  typeKeys(view, world, ["*", "P", "T", "L", "3", "Enter"], "scope", 700);
  expect(view.ptlMinutes).toBe(3);
  expect(view.ptlByAircraftId.get(dal.id)).toBe(false);

  typeKeys(view, world, ["*", "R", "R", "5", "Enter"], "scope", 900);
  expect(view.ringIntervalNm).toBe(5);
  expect(view.showRings).toBe(true);
  expect(view.ptlByAircraftId.get(dal.id)).toBe(false);
});

function vip1Mosaic() {
  const rgba = new Uint8Array(2 * 2 * 4);
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    rgba[o] = 0;
    rgba[o + 1] = 255;
    rgba[o + 2] = 0;
    rgba[o + 3] = 255;
  }
  return decodeRgbaToVipMasks(rgba, 2, 2, bboxFromArp({ latDeg: 0, lonDeg: 0 }, 4), 1_000);
}

test("T02-71 — *WX 1-6 / ALL / OFF mutate view.wxLevels; INV leaves prior bits", () => {
  const world = createWorld();
  const view = createScopeView();
  const prior = [...view.wxLevels];
  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);

  typeKeys(view, world, ["*", "W", "X", "7", "Enter"], "scope");
  expect(view.preview.rejection).toBe("*WX7 INV");
  expect(view.wxLevels).toEqual(prior);

  typeKeys(view, world, ["*", "W", "X", " ", "F", "O", "O", "Enter"], "scope", 200);
  expect(view.preview.rejection).toBe("*WX FOO INV");
  expect(view.wxLevels).toEqual(prior);

  typeKeys(view, world, ["*", "W", "X", "0", "Enter"], "scope", 400);
  expect(view.preview.rejection).toBe("*WX0 INV");
  expect(view.wxLevels).toEqual(prior);

  typeKeys(view, world, ["*", "W", "X", "1", "Enter"], "scope", 600);
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);
  typeKeys(view, world, ["*", "W", "X", "1", "Enter"], "scope", 800);
  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);

  typeKeys(view, world, ["*", " ", "W", "X", " ", "2", "Enter"], "scope", 1000);
  expect(view.wxLevels).toEqual([false, true, false, false, false, false]);

  typeKeys(view, world, ["*", "W", "X", " ", "A", "L", "L", "Enter"], "scope", 1200);
  expect(view.wxLevels).toEqual([true, true, true, true, true, true]);

  typeKeys(view, world, ["*", " ", "W", "X", " ", "O", "F", "F", "Enter"], "scope", 1400);
  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);
});

test("T02-71 — weather paint reads the same wxLevels *WX writes; radio DAL123 H270 still turns", async () => {
  const log = new SessionLog();
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    headingDeg: 90,
    xNm: 16,
    yNm: 8,
  });
  const world = createWorld({ aircraft: [dal], sessionLog: log });
  const view = createScopeView();
  view.wxMosaic = vip1Mosaic();
  syncTrackDisplays(view.tracks, world);

  const size = { widthPx: 800, heightPx: 800 };
  const drawImages: unknown[] = [];
  const ctx = {
    drawImage(image: unknown) {
      drawImages.push(image);
    },
  } as unknown as CanvasRenderingContext2D;

  drawWeatherLayer(ctx, view, size);
  expect(drawImages).toHaveLength(0);

  typeKeys(view, world, ["*", "W", "X", "1", "Enter"], "scope");
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(dal.intent.assignedHeadingDeg).toBe(90);

  drawWeatherLayer(ctx, view, size);
  expect(drawImages).toHaveLength(1);

  let radio = "";
  for (const key of ["D", "A", "L", "1", "2", "3", " ", "H", "2", "7", "0"]) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, "radio", world, 2000) && key.length === 1) {
      radio += key;
    }
  }
  expect(radio).toBe("DAL123 H270");
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);
  const result = await handleRadioText(world, radio, log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);
});
