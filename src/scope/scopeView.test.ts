import { expect, test } from "vitest";
import { createAircraft, createWorld } from "@core";
import { nmToScreen } from "./camera";
import { handlePpiDoubleClick, handlePpiLeftClick } from "./ppiPointer";
import { centerOnAirport, centerOnLastClick, createScopeView } from "./scopeView";

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

test("map / localizer / rings flags default on; coastline follows JSON enabled", () => {
  const bare = createScopeView();
  expect(bare.showRunway).toBe(true);
  expect(bare.showLocalizer).toBe(true);
  expect(bare.showRings).toBe(true);
  expect(bare.showCoastline).toBe(false);
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
