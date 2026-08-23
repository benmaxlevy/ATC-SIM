import { expect, test } from "vitest";
import { createAircraft, createWorld, handoffFor, setSelectedAircraft, type Intent } from "@core";
import { createWorldFromScenario, loadKdem, loadKdemIls27 } from "@scenario";
import { DEFAULT_SCOPE_CAMERA, nmToScreen, type ScopeCamera } from "./camera";
import { datablockRect, linesForDatablock } from "./datablock";
import { PALETTE } from "./palette";
import {
  HIT_RADIUS_CSS_PX,
  pickAircraftAt,
  selectAircraftAt,
  selectOrAcceptAircraftAt,
} from "./pick";
import { handlePpiLeftClick } from "./ppiPointer";
import { trackPaintColor } from "./ownership";
import { createScopeView } from "./scopeView";
import { syncTrackDisplays } from "./trackDisplay";

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

test("AC6 — clicking the datablock rectangle selects that track, not a nearby miss", () => {
  const dal = sample("DAL123", "ac-dal", 0, 0);
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  const lines = linesForDatablock(dal, "full", true);
  const rect = datablockRect(tick.x, tick.y, lines, view.datablockCellWidthPx);
  const onBlock = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  expect(Math.hypot(onBlock.x - tick.x, onBlock.y - tick.y)).toBeGreaterThan(HIT_RADIUS_CSS_PX);

  const missWithoutBlock = pickAircraftAt(
    world,
    onBlock.x,
    onBlock.y,
    CAM,
    CSS_W,
    CSS_H,
    HIT_RADIUS_CSS_PX,
  );
  expect(missWithoutBlock).toBeNull();

  const hit = pickAircraftAt(
    world,
    onBlock.x,
    onBlock.y,
    CAM,
    CSS_W,
    CSS_H,
    HIT_RADIUS_CSS_PX,
    view,
  );
  expect(hit).toBe(dal);

  const selected = selectAircraftAt(
    world,
    onBlock.x,
    onBlock.y,
    CAM,
    CSS_W,
    CSS_H,
    HIT_RADIUS_CSS_PX,
    view,
  );
  expect(selected).toBe(dal);
  expect(world.selectedAircraftId).toBe("ac-dal");
  expect(dal.intent.assignedHeadingDeg).toBe(100);
});

test("filtered track: datablock rectangle is not pickable; the target still selects", () => {
  const dal = sample("DAL123", "ac-dal", 0, 0);
  dal.altitudeFt = 6000;
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.altitudeFilter = { minHundreds: 70, maxHundreds: 90 };
  const tick = nmToScreen(dal.xNm, dal.yNm, CAM, VIEW);
  const onBlock = { x: tick.x + 16, y: tick.y - 18 };
  expect(Math.hypot(onBlock.x - tick.x, onBlock.y - tick.y)).toBeGreaterThan(HIT_RADIUS_CSS_PX);

  expect(
    pickAircraftAt(world, onBlock.x, onBlock.y, CAM, CSS_W, CSS_H, HIT_RADIUS_CSS_PX, view),
  ).toBeNull();

  const onSymbol = pickAircraftAt(
    world,
    tick.x,
    tick.y,
    CAM,
    CSS_W,
    CSS_H,
    HIT_RADIUS_CSS_PX,
    view,
  );
  expect(onSymbol).toBe(dal);
  const selected = selectAircraftAt(
    world,
    tick.x,
    tick.y,
    CAM,
    CSS_W,
    CSS_H,
    HIT_RADIUS_CSS_PX,
    view,
  );
  expect(selected).toBe(dal);
  expect(world.selectedAircraftId).toBe("ac-dal");
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

test("T04-17 AC1 — click pending inbound DAL123 accepts, owns white, logs once", () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  expect(handoffFor(world, dal.id).kind).toBe("inbound");
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");

  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  handlePpiLeftClick(view, world, tick.x, tick.y, CSS_W, CSS_H);

  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(trackPaintColor(view.tracks.get(dal.id)!.ownership)).toBe(PALETTE.owned);
  expect(PALETTE.owned).toBe("#FFFFFF");
  expect(world.sessionLog?.byType("handoff.inbound.accepted")).toHaveLength(1);
  expect(world.selectedAircraftId).toBe(dal.id);

  handlePpiLeftClick(view, world, tick.x, tick.y, CSS_W, CSS_H);
  expect(world.sessionLog?.byType("handoff.inbound.accepted")).toHaveLength(1);
  expect(world.selectedAircraftId).toBe(dal.id);
});

test("T04-17 AC4 — ils27 click is select-only and does not log accepted", () => {
  const world = createWorldFromScenario(loadKdemIls27());
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const before = world.sessionLog?.byType("handoff.inbound.accepted")?.length ?? 0;
  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });

  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  const hit = selectOrAcceptAircraftAt(
    world,
    view.tracks,
    tick.x,
    tick.y,
    view.camera,
    CSS_W,
    CSS_H,
    HIT_RADIUS_CSS_PX,
    view,
  );
  expect(hit).toBe(dal);
  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });
  expect(view.tracks.get(dal.id)!.ownership).toBe("unowned");
  expect(world.selectedAircraftId).toBe(dal.id);
  expect(world.sessionLog?.byType("handoff.inbound.accepted")?.length ?? 0).toBe(before);
});

test("T04-17 AC7 — comments cite CRC slew-accept + owned white; no CA halo", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const pick = sources["./pick.ts"] ?? "";
  const render = sources["./renderScope.ts"] ?? "";
  expect(pick).toMatch(/slew the track/);
  expect(pick).toMatch(/white/);
  expect(pick).toMatch(/not a 3 NM circle/);
  expect(render).toMatch(/not a 3 NM circle/);
});
