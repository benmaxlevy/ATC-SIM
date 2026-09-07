import { expect, test } from "vitest";
import { createAircraft, createWorld } from "@core";
import { DEFAULT_SCOPE_CAMERA, nmToScreen } from "../camera";
import { datablockRect, linesForDatablock } from "../datablock";
import { solveDatablockLayout } from "../datablockLayout";
import { pickAircraftAt } from "../pick";
import { collectDatablockProtectedGeometry } from "../render/renderScopePaint";
import { createScopeView } from "../scopeView";
import { syncTrackDisplays } from "../trackDisplay";

test("resolved overlap rectangles are the pick regions", () => {
  const aircraft = [
    createAircraft({
      id: "a",
      callsign: "DAL123",
      xNm: 0,
      yNm: 0,
      headingDeg: 0,
      altitudeFt: 8000,
      speedKt: 220,
    }),
    createAircraft({
      id: "b",
      callsign: "AAL456",
      xNm: 0,
      yNm: 0,
      headingDeg: 0,
      altitudeFt: 8000,
      speedKt: 220,
    }),
  ];
  const world = createWorld({ aircraft });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.datablockCellWidthPx = 7.2;
  const size = { widthPx: 800, heightPx: 800 };
  const inputs = aircraft.map((ac) => {
    const p = nmToScreen(ac.xNm, ac.yNm, DEFAULT_SCOPE_CAMERA, size);
    const lines = linesForDatablock(ac, "partial", { modeCVisible: true });
    const rect = datablockRect(p.x, p.y, lines, view.datablockCellWidthPx);
    return {
      aircraftId: ac.id,
      targetPoint: p,
      preferredRect: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
      metrics: { widthPx: rect.w, heightPx: rect.h },
      leaderDir: 8 as const,
      leaderLengthPx: 36,
      displayPriority: "partial" as const,
    };
  });
  const layouts = solveDatablockLayout(inputs, {
    bounds: { x: 0, y: 0, width: 800, height: 800 },
    protectedGeometry: collectDatablockProtectedGeometry(world, view, {
      widthPx: size.width,
      heightPx: size.height,
    }),
  });
  const moved = layouts.find(
    (item) =>
      item.rect &&
      item.rect.x !== inputs.find((input) => input.aircraftId === item.aircraftId)!.preferredRect.x,
  )!;
  expect(moved.rect).toBeDefined();
  const old = inputs.find((input) => input.aircraftId === moved.aircraftId)!.preferredRect;
  const point = { x: moved.rect!.x + 2, y: moved.rect!.y + 2 };
  expect(
    pickAircraftAt(world, point.x, point.y, DEFAULT_SCOPE_CAMERA, 800, 800, 12, view)?.id,
  ).toBe(moved.aircraftId);
  expect(
    pickAircraftAt(world, old.x + 2, old.y + 2, DEFAULT_SCOPE_CAMERA, 800, 800, 12, view)?.id,
  ).not.toBe(moved.aircraftId);
});
