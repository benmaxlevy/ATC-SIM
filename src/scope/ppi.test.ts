import { expect, test } from "vitest";
import { createAircraft, createWorld, handoffFor, type Intent } from "@core";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { DEFAULT_SCOPE_CAMERA, nmToScreen, type ScopeCamera } from "./camera";
import { handlePpiLeftClick } from "./ppi";
import { handleScopeKeyDown } from "./scopeKeys";
import { createScopeView } from "./scopeView";
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
  typeChord(view, world, ["*", "P", "3", "Enter"]);
  expect(view.starsChordArmed).toEqual({ type: "cone", target: "slewed", lengthNm: 3 });

  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, tick.x + 40, tick.y, CSS_W, CSS_H);
  expect(view.starsChordArmed).toEqual({ type: "cone", target: "slewed", lengthNm: 3 });
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
