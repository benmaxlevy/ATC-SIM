import { expect, test } from "vitest";
import { createAircraft, createWorld, setSelectedAircraft, type Intent } from "@core";
import { DEFAULT_SCOPE_CAMERA, nmToScreen, type ScopeCamera } from "./camera";
import { HIT_RADIUS_CSS_PX, pickAircraftAt, selectAircraftAt } from "./pick";

const CAM: ScopeCamera = DEFAULT_SCOPE_CAMERA;
const CSS_W = 800;
const CSS_H = 800;
const VIEW = { widthPx: CSS_W, heightPx: CSS_H };

function cloneIntent(intent: Intent): Intent {
  return { ...intent };
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

test("HIT_RADIUS_CSS_PX is the frozen 12 CSS pixel radius", () => {
  expect(HIT_RADIUS_CSS_PX).toBe(12);
});

test("AC1 — click projected pixel selects aircraft; 40 px away returns null", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const world = createWorld({ aircraft: [dal] });
  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);

  const hit = pickAircraftAt(world, tick.x, tick.y, CAM, CSS_W, CSS_H, HIT_RADIUS_CSS_PX);
  expect(hit).toBe(dal);

  const miss = pickAircraftAt(world, tick.x + 40, tick.y, CAM, CSS_W, CSS_H, HIT_RADIUS_CSS_PX);
  expect(miss).toBeNull();
});

test("two aircraft far apart: click on one selects only that track", () => {
  const dal = sample("DAL123", "ac-dal", 16, 0);
  const aal = sample("AAL456", "ac-aal", -16, 0);
  const world = createWorld({ aircraft: [dal, aal] });
  const dalTick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  const aalTick = nmToScreen(aal.xNm, aal.yNm, CAM, VIEW);

  expect(pickAircraftAt(world, dalTick.x, dalTick.y, CAM, CSS_W, CSS_H, HIT_RADIUS_CSS_PX)).toBe(
    dal,
  );
  expect(pickAircraftAt(world, aalTick.x, aalTick.y, CAM, CSS_W, CSS_H, HIT_RADIUS_CSS_PX)).toBe(
    aal,
  );
});

test("two targets inside the radius: nearest wins", () => {
  const closer = sample("DAL123", "ac-dal", 0, 0);
  const farther = sample("AAL456", "ac-aal", 0.4, 0);
  const world = createWorld({ aircraft: [farther, closer] });
  const origin = nmToScreen(0, 0, CAM, VIEW);
  const fartherTick = nmToScreen(farther.xNm, farther.yNm, CAM, VIEW);
  expect(Math.hypot(fartherTick.x - origin.x, fartherTick.y - origin.y)).toBeLessThan(
    HIT_RADIUS_CSS_PX,
  );

  const hit = pickAircraftAt(world, origin.x, origin.y, CAM, CSS_W, CSS_H, HIT_RADIUS_CSS_PX);
  expect(hit).toBe(closer);
});

test("click empty canvas clears selection via selectAircraftAt", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8);
  const world = createWorld({ aircraft: [dal] });
  setSelectedAircraft(world, dal.id);
  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);

  const miss = selectAircraftAt(world, tick.x + 40, tick.y, CAM, CSS_W, CSS_H);
  expect(miss).toBeNull();
  expect(world.selectedAircraftId).toBeNull();
});

test("AC6 — pick + setSelectedAircraft does not change assigned heading/intent", () => {
  const dal = sample("DAL123", "ac-dal", 16, 8, 100);
  const aal = sample("AAL456", "ac-aal", -16, 0, 90);
  const world = createWorld({ aircraft: [dal, aal] });
  const dalIntent = cloneIntent(dal.intent);
  const aalIntent = cloneIntent(aal.intent);
  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);

  const hit = pickAircraftAt(world, tick.x, tick.y, CAM, CSS_W, CSS_H, HIT_RADIUS_CSS_PX);
  expect(hit).toBe(dal);
  setSelectedAircraft(world, hit!.id);

  expect(world.selectedAircraftId).toBe("ac-dal");
  expect(dal.intent.assignedHeadingDeg).toBe(100);
  expect(dal.intent).toEqual(dalIntent);
  expect(aal.intent).toEqual(aalIntent);
  expect(dal.headingDeg).toBe(100);
  expect(dal.xNm).toBe(16);
  expect(dal.identUntilSimMs).toBe(0);
});

test("AC5 — selectAircraftAt does not import the radio pipeline or write intent", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const pick = sources["./pick.ts"];
  const ppi = sources["./ppi.ts"];
  expect(pick).toBeDefined();
  expect(ppi).toBeDefined();
  for (const src of [pick!, ppi!]) {
    expect(src).not.toMatch(/handleRadioText/);
    expect(src).not.toMatch(/submitCommand/);
    expect(src).not.toMatch(/formatReadback/);
    expect(src).not.toMatch(/applyIntent/);
    expect(src).not.toMatch(/\.intent\s*=/);
    expect(src).not.toMatch(/assignedHeadingDeg\s*=/);
  }
});
