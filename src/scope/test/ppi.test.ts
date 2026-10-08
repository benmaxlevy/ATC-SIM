import { expect, test } from "vitest";
import { createAircraft, createWorld } from "@core";
import { vi } from "vitest";
import { DEFAULT_SCOPE_CAMERA, nmToScreen, type ScopeCamera } from "../camera";
import { handlePpiCanvasPointerHover, handlePpiLeftClick } from "../ppi";
import { armDcbSpinner } from "../dcb/dcbMenu";
import { handleScopeWheel } from "../scopeKeys";
import { handleScopeKeyDown } from "../scopeKeys";
import { createScopeView } from "../scopeView";
import { syncTrackDisplays } from "../trackDisplay";

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

test("armed *J3 click applies the ring; miss leaves the arm", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 16,
    yNm: 8,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  typeChord(view, world, ["*", "J", "3", "Enter"]);
  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiLeftClick(view, world, tick.x + 40, tick.y, CSS_W, CSS_H);
  expect(view.starsChordArmed).toEqual({ type: "jRing", target: "slewed", radiusNm: 3 });
  handlePpiLeftClick(view, world, tick.x, tick.y, CSS_W, CSS_H);
  expect(view.tracks.get(dal.id)?.tpaRingNm).toBe(3);
  expect(view.starsChordArmed).toBeNull();
});

test("T02-171 live *FP slew opens the target's callsign without an association", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 16,
    yNm: 8,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  typeChord(view, world, ["*", "F", "P"]);
  const open = vi.fn();
  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  handlePpiLeftClick(view, world, tick.x, tick.y, CSS_W, CSS_H, undefined, open);
  expect(open).toHaveBeenCalledWith({ targetAircraftId: dal.id });
  expect(view.preview.phase).toBe("idle");
});

test("handlePpiCanvasPointerHover with dwellMode ON highlights on hover and clears on miss", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 16,
    yNm: 8,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  view.dwellMode = "ON";
  const canvas = {
    getBoundingClientRect: () => ({ left: 50, top: 20, width: CSS_W, height: CSS_H }),
  } as unknown as HTMLCanvasElement;

  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  // Hover over aircraft symbol (adjusted for rect offset)
  handlePpiCanvasPointerHover(canvas, world, tick.x + 50, tick.y + 20, view);
  expect(view.dwellLockedAircraftId).toBe(dal.id);

  // Hover away
  handlePpiCanvasPointerHover(canvas, world, tick.x + 50 + 100, tick.y + 20 + 100, view);
  expect(view.dwellLockedAircraftId).toBeNull();
});

test("handlePpiCanvasPointerHover with dwellMode LOCK retains lock until hovering another aircraft", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 16,
    yNm: 8,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const ual = createAircraft({
    id: "ac-ual",
    callsign: "UAL456",
    xNm: -10,
    yNm: -5,
    headingDeg: 270,
    altitudeFt: 12000,
    speedKt: 250,
  });
  const world = createWorld({ aircraft: [dal, ual] });
  const view = createScopeView();
  view.dwellMode = "LOCK";
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CSS_W, height: CSS_H }),
  } as unknown as HTMLCanvasElement;

  const tickDal = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  const tickUal = nmToScreen(ual.xNm, ual.yNm, CAM, VIEW);

  // Hover over DAL
  handlePpiCanvasPointerHover(canvas, world, tickDal.x, tickDal.y, view);
  expect(view.dwellLockedAircraftId).toBe(dal.id);

  // Hover away - should retain lock
  handlePpiCanvasPointerHover(canvas, world, tickDal.x + 100, tickDal.y + 100, view);
  expect(view.dwellLockedAircraftId).toBe(dal.id);

  // Hover over UAL - should switch lock
  handlePpiCanvasPointerHover(canvas, world, tickUal.x, tickUal.y, view);
  expect(view.dwellLockedAircraftId).toBe(ual.id);
});

test("handlePpiCanvasPointerHover with dwellMode OFF does nothing", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 16,
    yNm: 8,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  view.dwellMode = "OFF";
  view.dwellLockedAircraftId = null;
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CSS_W, height: CSS_H }),
  } as unknown as HTMLCanvasElement;

  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  handlePpiCanvasPointerHover(canvas, world, tick.x, tick.y, view);
  expect(view.dwellLockedAircraftId).toBeNull();
});

test("typed range is committed when returning to the scope or scrolling", () => {
  const view = createScopeView();
  const world = createWorld({ aircraft: [] });
  armDcbSpinner(view, "RANGE");
  typeChord(view, world, ["3", "7"]);
  handlePpiLeftClick(view, world, 400, 400, CSS_W, CSS_H);
  expect(view.camera.rangeNm).toBe(37);
  expect(view.dcbSpinner.armed).toBe(false);
  armDcbSpinner(view, "RANGE");
  typeChord(view, world, ["4", "7"]);
  handleScopeWheel({ deltaY: 1, preventDefault() {} }, view);
  expect(view.camera.rangeNm).toBe(50);
  expect(view.dcbSpinner.armed).toBe(false);
});
