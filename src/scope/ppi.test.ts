import { expect, test } from "vitest";
import { createAircraft, createWorld } from "@core";
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
