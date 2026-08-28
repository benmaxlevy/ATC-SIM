import { expect, test } from "vitest";
import { createAircraft, createWorld, handoffFor, type Intent } from "@core";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { DEFAULT_SCOPE_CAMERA, nmToScreen, type ScopeCamera } from "./camera";
import { CHORD_TIMEOUT_MS } from "./keymap";
import { handlePpiLeftClick } from "./ppi";
import { handleScopeKeyDown } from "./scopeKeys";
import { createScopeView } from "./scopeView";
import { expireStarsChordEntry, formatStarsChordReadout } from "./starsChord";
import { syncTrackDisplays } from "./trackDisplay";

const CAM: ScopeCamera = DEFAULT_SCOPE_CAMERA;
const CSS_W = 800;
const CSS_H = 800;
const VIEW = { widthPx: CSS_W, heightPx: CSS_H };

function keyEvent(key: string) {
  return {
    key,
    preventDefault(): void {},
    stopPropagation(): void {},
  };
}

function typeChord(
  view: ReturnType<typeof createScopeView>,
  world: ReturnType<typeof createWorld>,
  keys: string[],
) {
  let now = 0;
  for (const key of keys) {
    handleScopeKeyDown(keyEvent(key), view, "scope", world, now);
    now += 100;
  }
}

function sample(callsign: string, id: string, xNm: number, yNm: number, headingDeg = 100) {
  return createAircraft({
    id,
    callsign,
    xNm,
    yNm,
    headingDeg,
    altitudeFt: 8000,
    speedKt: 220,
  });
}

function cloneIntent(intent: Intent): Intent {
  return { ...intent };
}

test("armed *J3 click applies the 3 NM ring to that track; a second click does not re-apply", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const aal = sample("AAL456", "ac-aal", -16, 0);
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  typeChord(view, world, ["*", "J", "3", "Enter"]);
  expect(view.starsChordArmed).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });

  const dalTick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS_W, CSS_H);
  expect(view.starsChordArmed).toBeNull();
  expect(world.selectedAircraftId).toBe(dal.id);
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(3);
  expect(view.tracks.get(aal.id)?.tpaRingNm).toBeUndefined();

  const aalTick = nmToScreen(aal.xNm, aal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, aalTick.x, aalTick.y, CSS_W, CSS_H);
  expect(view.tracks.get(aal.id)?.tpaRingNm).toBeUndefined();
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(3);
  expect(world.selectedAircraftId).toBe(aal.id);
});

test("a click that misses every target leaves the armed chord waiting", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  // *P1/*P2/*P3 are T02-62 tower lists; TPA cone mileage uses *P4+.
  typeChord(view, world, ["*", "P", "4", "Enter"]);
  expect(view.starsChordArmed).toEqual({ type: "cone", target: "slewed", lengthNm: 4 });

  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, tick.x + 40, tick.y, CSS_W, CSS_H);
  expect(view.starsChordArmed).toEqual({ type: "cone", target: "slewed", lengthNm: 4 });
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBeUndefined();
  expect(world.selectedAircraftId).toBeNull();
});

test("armed slew click does not accept a pending inbound handoff", () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  expect(handoffFor(world, dal.id).kind).toBe("inbound");
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  const intent = cloneIntent(dal.intent);

  typeChord(view, world, ["*", "J", "3", "Enter"]);
  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  handlePpiLeftClick(view, world, tick.x, tick.y, CSS_W, CSS_H);

  expect(handoffFor(world, dal.id).kind).toBe("inbound");
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  expect(world.sessionLog?.byType("handoff.inbound.accepted") ?? []).toHaveLength(0);
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(3);
  expect(world.selectedAircraftId).toBe(dal.id);
  expect(view.starsChordArmed).toBeNull();
  expect(dal.intent).toEqual(intent);
});

test("PLACE CNTR still wins over an armed chord", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  typeChord(view, world, ["*", "J", "3", "Enter"]);
  view.placeCenterArmed = true;
  const empty = nmToScreen(5, -3, CAM, VIEW);
  handlePpiLeftClick(view, world, empty.x, empty.y, CSS_W, CSS_H);
  expect(view.placeCenterArmed).toBe(false);
  expect(view.camera.centerEastNm).toBeCloseTo(5);
  expect(view.camera.centerNorthNm).toBeCloseTo(-3);
  expect(view.starsChordArmed).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBeUndefined();
});

test("live *J3 survives far past the 1.5 s window and still applies on a target click", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const aal = sample("AAL456", "ac-aal", -16, 0);
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  typeChord(view, world, ["*", "J", "3"]);
  expect(view.starsChordEntry.phase).toBe("entry");
  expect(view.starsChordEntry.buffer).toBe("*J3");
  expect(view.starsChordArmed).toBeNull();

  const later = view.starsChordEntry.lastKeyAtMs + CHORD_TIMEOUT_MS * 10;
  expect(expireStarsChordEntry(view.starsChordEntry, later)).toBe(false);
  expect(view.starsChordEntry.phase).toBe("entry");
  expect(formatStarsChordReadout(view.starsChordEntry, view.starsChordArmed)).toBe("*J3");

  const dalTick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS_W, CSS_H);
  expect(view.starsChordEntry.phase).toBe("idle");
  expect(view.starsChordArmed).toBeNull();
  expect(world.selectedAircraftId).toBe(dal.id);
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(3);
  expect(view.tracks.get(aal.id)?.tpaRingNm).toBeUndefined();
});

test("live *P5 / *J / *P click-commit the clicked track; *DI is per-track when slewed", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const aal = sample("AAL456", "ac-aal", -16, 0);
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const dalTick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  const aalTick = nmToScreen(aal.xNm, aal.yNm, CAM, VIEW);

  typeChord(view, world, ["*", "P", "5"]);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS_W, CSS_H);
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBe(5);
  expect(view.tracks.get(aal.id)?.tpaConeNm).toBeUndefined();
  expect(view.starsChordEntry.phase).toBe("idle");

  typeChord(view, world, ["*", "J", "3"]);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS_W, CSS_H);
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(3);

  typeChord(view, world, ["*", "J"]);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS_W, CSS_H);
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBeUndefined();
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBe(5);

  typeChord(view, world, ["*", "P"]);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS_W, CSS_H);
  expect(view.tracks.get(dal.id)?.tpaConeNm).toBeUndefined();

  expect(view.atpa.inTrailDistance).toBe(true);
  typeChord(view, world, ["*", "D", "I"]);
  handlePpiLeftClick(view, world, aalTick.x, aalTick.y, CSS_W, CSS_H);
  expect(world.selectedAircraftId).toBe(aal.id);
  expect(view.tracks.get(aal.id)?.atpaInTrailDistanceEnabled).toBe(false);
  expect(view.tracks.get(dal.id)?.atpaInTrailDistanceEnabled).toBe(true);
  expect(view.atpa.inTrailDistance).toBe(true);
  expect(view.starsChordEntry.phase).toBe("idle");
});

test("a click that misses every target leaves the live * buffer waiting", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  typeChord(view, world, ["*", "J", "3"]);

  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, tick.x + 40, tick.y, CSS_W, CSS_H);
  expect(view.starsChordEntry.phase).toBe("entry");
  expect(view.starsChordEntry.buffer).toBe("*J3");
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBeUndefined();
  expect(world.selectedAircraftId).toBeNull();
});

test("incomplete live buffer at click shows INV, does not throw, and does not swallow the click", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const aal = sample("AAL456", "ac-aal", -16, 0);
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const dalTick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  const aalTick = nmToScreen(aal.xNm, aal.yNm, CAM, VIEW);

  typeChord(view, world, ["*", "D"]);
  expect(() => handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS_W, CSS_H)).not.toThrow();
  expect(view.starsChordEntry.phase).toBe("idle");
  expect(view.starsChordEntry.rejection).toBe("*D INV");
  expect(formatStarsChordReadout(view.starsChordEntry, view.starsChordArmed)).toBe("*D INV");
  expect(world.selectedAircraftId).toBe(dal.id);
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBeUndefined();

  typeChord(view, world, ["*"]);
  expect(() => handlePpiLeftClick(view, world, aalTick.x, aalTick.y, CSS_W, CSS_H)).not.toThrow();
  expect(view.starsChordEntry.rejection).toBe("* INV");
  expect(world.selectedAircraftId).toBe(aal.id);
});

test("live *J3 slew click does not accept a pending inbound handoff", () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  expect(handoffFor(world, dal.id).kind).toBe("inbound");
  const intent = cloneIntent(dal.intent);

  typeChord(view, world, ["*", "J", "3"]);
  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  handlePpiLeftClick(view, world, tick.x, tick.y, CSS_W, CSS_H);

  expect(handoffFor(world, dal.id).kind).toBe("inbound");
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  expect(world.sessionLog?.byType("handoff.inbound.accepted") ?? []).toHaveLength(0);
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(3);
  expect(world.selectedAircraftId).toBe(dal.id);
  expect(view.starsChordEntry.phase).toBe("idle");
  expect(dal.intent).toEqual(intent);
});

test("armed INIT CNTL click owns that track; a second click does not re-apply; miss leaves arm", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const aal = sample("AAL456", "ac-aal", -16, 0);
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  handleScopeKeyDown(keyEvent("F3"), view, "radio", world);
  expect(view.preview.phase).toBe("armed");
  expect(view.preview.armed).toEqual({ type: "initCntl" });

  const miss = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, miss.x + 40, miss.y, CSS_W, CSS_H);
  expect(view.preview.phase).toBe("armed");
  expect(view.preview.armed).toEqual({ type: "initCntl" });
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  expect(world.selectedAircraftId).toBeNull();

  const dalTick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS_W, CSS_H);
  expect(view.preview.phase).toBe("idle");
  expect(view.preview.armed).toBeNull();
  expect(world.selectedAircraftId).toBe(dal.id);
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(view.tracks.get(aal.id)!.ownership).toBe("unowned");

  const aalTick = nmToScreen(aal.xNm, aal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, aalTick.x, aalTick.y, CSS_W, CSS_H);
  expect(view.tracks.get(aal.id)!.ownership).toBe("unowned");
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(world.selectedAircraftId).toBe(aal.id);
});

test("armed TERM CNTL click drops the hit track; miss leaves arm", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const aal = sample("AAL456", "ac-aal", -16, 0);
  const world = createWorld({ aircraft: [dal, aal], selectedAircraftId: dal.id });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  handleScopeKeyDown(keyEvent("F3"), view, "radio", world);
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");

  world.selectedAircraftId = null;
  handleScopeKeyDown(keyEvent("F4"), view, "radio", world);
  expect(view.preview.armed).toEqual({ type: "termCntl" });

  const miss = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, miss.x + 40, miss.y, CSS_W, CSS_H);
  expect(view.preview.phase).toBe("armed");
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");

  handlePpiLeftClick(view, world, miss.x, miss.y, CSS_W, CSS_H);
  expect(view.preview.phase).toBe("idle");
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  expect(view.tracks.get(aal.id)!.ownership).toBe("unowned");
});

test("armed INIT slew on a pending inbound is one accept+own click", () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  expect(handoffFor(world, dal.id).kind).toBe("inbound");
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  const intent = cloneIntent(dal.intent);

  handleScopeKeyDown(keyEvent("F3"), view, "radio", world);
  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  handlePpiLeftClick(view, world, tick.x, tick.y, CSS_W, CSS_H);

  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(world.sessionLog?.byType("handoff.inbound.accepted") ?? []).toHaveLength(1);
  expect(world.sessionLog?.byType("command.accepted") ?? []).toHaveLength(0);
  expect(world.selectedAircraftId).toBe(dal.id);
  expect(view.preview.phase).toBe("idle");
  expect(dal.intent).toEqual(intent);

  handlePpiLeftClick(view, world, tick.x, tick.y, CSS_W, CSS_H);
  expect(world.sessionLog?.byType("handoff.inbound.accepted") ?? []).toHaveLength(1);
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
});

test("typed INIT FLID then slew applies only when the FLID uniquely matches the clicked track", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const aal = sample("AAL456", "ac-aal", -16, 0);
  const world = createWorld({ aircraft: [dal, aal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  handleScopeKeyDown(keyEvent("F3"), view, "radio", world);
  for (const key of ["A", "A", "L", "4", "5", "6"]) {
    handleScopeKeyDown(keyEvent(key), view, "radio", world);
  }
  const dalTick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS_W, CSS_H);
  expect(view.preview.rejection).toBe("INIT CNTL AAL456 INV");
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  expect(view.tracks.get(aal.id)!.ownership).toBe("unowned");
  expect(world.selectedAircraftId).toBeNull();

  handleScopeKeyDown(keyEvent("F3"), view, "radio", world);
  for (const key of ["D", "A", "L", "1", "2", "3"]) {
    handleScopeKeyDown(keyEvent(key), view, "radio", world);
  }
  handlePpiLeftClick(view, world, dalTick.x, dalTick.y, CSS_W, CSS_H);
  expect(view.preview.phase).toBe("idle");
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(view.tracks.get(aal.id)!.ownership).toBe("unowned");
});

test("empty PPI click does not apply or consume a B command", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  typeChord(view, world, ["B", "4", "5"]);
  expect(view.preview.phase).toBe("entry");
  expect(view.preview.buffer).toBe("B45");
  expect(view.beaconSelectCodes).toEqual([]);

  handlePpiLeftClick(view, world, 10, 10, CSS_W, CSS_H);
  expect(view.preview.phase).toBe("entry");
  expect(view.preview.buffer).toBe("B45");
  expect(view.beaconSelectCodes).toEqual([]);

  typeChord(view, world, ["Enter"]);
  expect(view.beaconSelectCodes).toEqual(["45"]);
  expect(view.preview.phase).toBe("idle");

  handlePpiLeftClick(view, world, 10, 10, CSS_W, CSS_H);
  expect(view.beaconSelectCodes).toEqual(["45"]);
});
