import { expect, test } from "vitest";
import { createAircraft, createWorld } from "@core";
import { nmToScreen } from "./camera";
import { handlePpiDoubleClick, handlePpiLeftClick } from "./ppi";
import {
  beginAltitudeFilterChord,
  centerOnAirport,
  centerOnLastClick,
  createScopeView,
  isCoastlineToggleEnabled,
  isRangeRingOffViewCenter,
  isViewOffAirport,
  setRangeRingOrigin,
  snapRangeRingToViewCenter,
  setDcbDock,
  setHistoryDotCount,
  stepHistoryDots,
  stepPtlLength,
  toggleHistoryEnabled,
  toggleMapLayer,
  togglePtlOn,
  togglePtlOwn,
} from "./scopeView";

const VIEW = { widthPx: 800, heightPx: 800 };

test("AC4 — End centers last click; Home returns to airport ref", () => {
  const view = createScopeView(0, 0);
  const world = createWorld();
  const clickEast = 6;
  const clickNorth = -4;
  const p = nmToScreen(clickEast, clickNorth, view.camera, VIEW);
  handlePpiLeftClick(view, world, p.x, p.y, VIEW.widthPx, VIEW.heightPx);

  expect(view.lastClickEastNm).toBeCloseTo(clickEast);
  expect(view.lastClickNorthNm).toBeCloseTo(clickNorth);

  centerOnLastClick(view);
  const centered = nmToScreen(clickEast, clickNorth, view.camera, VIEW);
  expect(Math.abs(centered.x - 400)).toBeLessThanOrEqual(2);
  expect(Math.abs(centered.y - 400)).toBeLessThanOrEqual(2);

  centerOnAirport(view);
  const airport = nmToScreen(0, 0, view.camera, VIEW);
  expect(Math.abs(airport.x - 400)).toBeLessThanOrEqual(2);
  expect(Math.abs(airport.y - 400)).toBeLessThanOrEqual(2);
});

test("End with no click yet is the same as Home", () => {
  const view = createScopeView(0, 0);
  view.camera.centerEastNm = 9;
  view.camera.centerNorthNm = 9;
  centerOnLastClick(view);
  expect(view.camera.centerEastNm).toBe(0);
  expect(view.camera.centerNorthNm).toBe(0);
});

test("double-click empty PPI centers there; double-click on a track does not", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  const empty = nmToScreen(5, 5, view.camera, VIEW);
  handlePpiDoubleClick(view, world, empty.x, empty.y, VIEW.widthPx, VIEW.heightPx);
  expect(view.camera.centerEastNm).toBeCloseTo(5);
  expect(view.camera.centerNorthNm).toBeCloseTo(5);

  const onTrack = nmToScreen(0, 0, view.camera, VIEW);
  const beforeEast = view.camera.centerEastNm;
  const beforeNorth = view.camera.centerNorthNm;
  handlePpiDoubleClick(view, world, onTrack.x, onTrack.y, VIEW.widthPx, VIEW.heightPx);
  expect(view.camera.centerEastNm).toBe(beforeEast);
  expect(view.camera.centerNorthNm).toBe(beforeNorth);
});

test("AC4 — PTL defaults off; history defaults on; altitude filter 000-180", () => {
  const view = createScopeView();
  expect(view.ptlOn).toBe(false);
  expect(view.historyEnabled).toBe(true);
  expect(view.helpOpen).toBe(false);
  expect(view.altitudeFilter).toEqual({ minHundreds: 0, maxHundreds: 180 });
  expect(view.filterEntry.phase).toBe("idle");
});

test("toggleMapLayer hides runway, loc, rings, coastline independently; CST no-op if JSON off", () => {
  const view = createScopeView(0, 0, {
    digitalMap: {
      rangeRings: { intervalNm: 5, maxNm: 60 },
      coastline: {
        enabled: false,
        polyline: [
          [0, 0],
          [1, 0],
        ],
      },
    },
  });
  expect(isCoastlineToggleEnabled(view)).toBe(false);
  expect(view.showCoastline).toBe(false);
  toggleMapLayer(view, "coastline");
  expect(view.showCoastline).toBe(false);

  toggleMapLayer(view, "runway");
  toggleMapLayer(view, "localizer");
  toggleMapLayer(view, "rings");
  expect(view.showRunway).toBe(false);
  expect(view.showLocalizer).toBe(false);
  expect(view.showRings).toBe(false);
  toggleMapLayer(view, "runway");
  expect(view.showRunway).toBe(true);

  const withCoast = createScopeView(0, 0, {
    digitalMap: {
      rangeRings: { intervalNm: 5, maxNm: 60 },
      coastline: {
        enabled: true,
        polyline: [
          [0, 0],
          [1, 1],
        ],
      },
    },
  });
  expect(isCoastlineToggleEnabled(withCoast)).toBe(true);
  expect(withCoast.showCoastline).toBe(true);
  toggleMapLayer(withCoast, "coastline");
  expect(withCoast.showCoastline).toBe(false);
});

test("PTL and history toggles match F7/F8 (click ≡ key)", () => {
  const view = createScopeView();
  expect(view.ptlOn).toBe(false);
  expect(view.historyEnabled).toBe(true);
  togglePtlOn(view);
  toggleHistoryEnabled(view);
  expect(view.ptlOn).toBe(true);
  expect(view.historyEnabled).toBe(false);
  togglePtlOn(view);
  toggleHistoryEnabled(view);
  expect(view.ptlOn).toBe(false);
  expect(view.historyEnabled).toBe(true);
});

test("OFF CNTR is pressed iff the view is off the airport; click is Home", () => {
  const view = createScopeView();
  expect(isViewOffAirport(view)).toBe(false);
  view.camera.centerEastNm = 4;
  view.camera.centerNorthNm = -1;
  expect(isViewOffAirport(view)).toBe(true);
  centerOnAirport(view);
  expect(isViewOffAirport(view)).toBe(false);
});

test("DCB FILTER click starts the same F chord as scope-focus F", () => {
  const view = createScopeView();
  expect(view.filterEntry.phase).toBe("idle");
  beginAltitudeFilterChord(view, 1000);
  expect(view.filterEntry.phase).toBe("min");
  expect(view.filterEntry.digits).toBe("");
  expect(view.filterEntry.previous).toEqual({ minHundreds: 0, maxHundreds: 180 });
});

test("map / localizer / rings flags default on; coastline follows JSON enabled", () => {
  const bare = createScopeView();
  expect(bare.showRunway).toBe(true);
  expect(bare.showLocalizer).toBe(true);
  expect(bare.showRings).toBe(true);
  expect(bare.showCoastline).toBe(false);
  expect(bare.historyEnabled).toBe(true);
  expect(bare.modeCVisible).toBe(true);
  expect(bare.digitalMap.runway).toBeUndefined();

  const withCoast = createScopeView(0, 0, {
    digitalMap: {
      rangeRings: { intervalNm: 5, maxNm: 60 },
      coastline: {
        enabled: true,
        polyline: [
          [0, 0],
          [1, 1],
        ],
      },
    },
  });
  expect(withCoast.showCoastline).toBe(true);
});

test("PLACE CNTR: next PPI click sets view center and disarms", () => {
  const world = createWorld();
  const view = createScopeView();
  view.placeCenterArmed = true;
  const p = nmToScreen(5, -3, view.camera, VIEW);
  handlePpiLeftClick(view, world, p.x, p.y, VIEW.widthPx, VIEW.heightPx);
  expect(view.camera.centerEastNm).toBeCloseTo(5);
  expect(view.camera.centerNorthNm).toBeCloseTo(-3);
  expect(view.placeCenterArmed).toBe(false);
  expect(isViewOffAirport(view)).toBe(true);
});

test("PLACE RR: next PPI click sets ring origin; RR CNTR snaps to view center", () => {
  const world = createWorld();
  const view = createScopeView();
  expect(view.rangeRingEastNm).toBe(view.airportEastNm);
  expect(view.rangeRingNorthNm).toBe(view.airportNorthNm);
  expect(isRangeRingOffViewCenter(view)).toBe(false);

  view.placeRangeRingArmed = true;
  const p = nmToScreen(6, -2, view.camera, VIEW);
  handlePpiLeftClick(view, world, p.x, p.y, VIEW.widthPx, VIEW.heightPx);
  expect(view.rangeRingEastNm).toBeCloseTo(6);
  expect(view.rangeRingNorthNm).toBeCloseTo(-2);
  expect(view.placeRangeRingArmed).toBe(false);
  expect(isRangeRingOffViewCenter(view)).toBe(true);

  view.camera.centerEastNm = 3;
  view.camera.centerNorthNm = 1;
  snapRangeRingToViewCenter(view);
  expect(view.rangeRingEastNm).toBeCloseTo(3);
  expect(view.rangeRingNorthNm).toBeCloseTo(1);
  expect(isRangeRingOffViewCenter(view)).toBe(false);

  setRangeRingOrigin(view, 0, 0);
  expect(isRangeRingOffViewCenter(view)).toBe(true);
});

test("AC1 — F8 toggles HISTORY 0 ↔ last non-zero; spinner 0–5", () => {
  const view = createScopeView();
  expect(view.historyDotCount).toBe(5);
  expect(view.historyEnabled).toBe(true);
  stepHistoryDots(view, -1);
  expect(view.historyDotCount).toBe(4);
  toggleHistoryEnabled(view);
  expect(view.historyDotCount).toBe(0);
  expect(view.historyEnabled).toBe(false);
  toggleHistoryEnabled(view);
  expect(view.historyDotCount).toBe(4);
  expect(view.historyEnabled).toBe(true);
  setHistoryDotCount(view, 0);
  expect(view.historyEnabled).toBe(false);
  toggleHistoryEnabled(view);
  expect(view.historyDotCount).toBe(4);
});

test("AC2/AC3 — PTL minutes and OWN vs ALL live on the view; F7 toggles ALL", () => {
  const view = createScopeView();
  expect(view.ptlOn).toBe(false);
  expect(view.ptlOwn).toBe(false);
  expect(view.ptlMinutes).toBe(1);
  stepPtlLength(view, 1);
  expect(view.ptlMinutes).toBe(2);
  togglePtlOwn(view);
  expect(view.ptlOwn).toBe(true);
  expect(view.ptlOn).toBe(false);
  togglePtlOn(view);
  expect(view.ptlOn).toBe(true);
  togglePtlOn(view);
  expect(view.ptlOn).toBe(false);
  expect(view.ptlOwn).toBe(true);
  togglePtlOwn(view);
  expect(view.ptlOwn).toBe(false);
  togglePtlOn(view);
  expect(view.ptlOn).toBe(true);
});

test("AC4 — DCB dock enum is one edge at a time", () => {
  const view = createScopeView();
  expect(view.dcbDock).toBe("TOP");
  setDcbDock(view, "LEFT");
  expect(view.dcbDock).toBe("LEFT");
  setDcbDock(view, "BOTTOM");
  expect(view.dcbDock).toBe("BOTTOM");
});
