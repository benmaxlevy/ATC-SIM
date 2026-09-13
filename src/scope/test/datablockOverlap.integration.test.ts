import { expect, test } from "vitest";
import { createAircraft, createWorld, initiateOutboundHandoff, initiatePointout } from "@core";
import { DEFAULT_SCOPE_CAMERA, nmToScreen } from "../camera";
import { buildDatablockRuntimeState, datablockRect, linesForDatablock } from "../datablock";
import { solveDatablockLayout } from "../datablockLayout";
import { pickAircraftAt } from "../pick";
import {
  buildScopeDatablockPresentation,
  collectDatablockProtectedGeometry,
  drawDatablock,
  drawTracks,
} from "../render/renderScopePaint";
import { createScopeView } from "../scopeView";
import { syncTrackDisplays } from "../trackDisplay";
import { createMockCtx } from "./mockCanvas";

function primeDatablockSnapshot(
  world: ReturnType<typeof createWorld>,
  view: ReturnType<typeof createScopeView>,
) {
  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    if (td && !td.lastReport) {
      td.lastReport = {
        aircraftId: ac.id,
        xNm: ac.xNm,
        yNm: ac.yNm,
        headingDeg: ac.headingDeg,
        speedKt: ac.speedKt,
        altitudeFt: ac.altitudeFt,
        reportedAtSimMs: world.simTimeMs,
        sourceSiteId: null,
        paint: "fused-puck",
      };
    }
  }
  drawTracks(createMockCtx().ctx, world, view, { widthPx: 800, heightPx: 800 });
}

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
  for (const ac of aircraft) {
    view.tracks.get(ac.id)!.lastReport = {
      aircraftId: ac.id,
      xNm: ac.xNm,
      yNm: ac.yNm,
      headingDeg: ac.headingDeg,
      speedKt: ac.speedKt,
      altitudeFt: ac.altitudeFt,
      reportedAtSimMs: world.simTimeMs,
      sourceSiteId: null,
      paint: "fused-puck",
    };
  }
  primeDatablockSnapshot(world, view);
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
  const protectedGeometry = collectDatablockProtectedGeometry(world, view, {
    widthPx: size.widthPx,
    heightPx: size.heightPx,
  });
  const layouts = solveDatablockLayout(inputs, {
    bounds: { x: 0, y: 0, width: 800, height: 800 },
    protectedGeometry,
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

test("paint, layout, and pick share the runtime datablock projection", () => {
  const ac = createAircraft({
    id: "parity",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    altitudeFt: 8000,
    speedKt: 220,
    headingDeg: 0,
  });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const td = view.tracks.get(ac.id)!;
  td.lastReport = {
    aircraftId: ac.id,
    xNm: ac.xNm,
    yNm: ac.yNm,
    headingDeg: ac.headingDeg,
    speedKt: ac.speedKt,
    altitudeFt: ac.altitudeFt,
    reportedAtSimMs: world.simTimeMs,
    sourceSiteId: null,
    paint: "fused-puck",
  };
  primeDatablockSnapshot(world, view);

  const presentation = buildScopeDatablockPresentation(view, world, ac);
  const directRuntime = buildDatablockRuntimeState(world, ac, {
    track: td,
    mode: presentation.mode,
    modeCVisible: view.modeCVisible,
    beaconatorActive: view.beaconatorActive,
    localTcp: view.sectorId,
  });
  expect(presentation.base).toEqual(
    linesForDatablock(directRuntime.source, directRuntime.mode, directRuntime.options),
  );

  const size = { widthPx: 800, heightPx: 800 };
  const point = nmToScreen(ac.xNm, ac.yNm, DEFAULT_SCOPE_CAMERA, size);
  const rect = datablockRect(point.x, point.y, presentation.lines, view.datablockCellWidthPx);
  const metrics = { widthPx: rect.w, heightPx: rect.h };
  const layout = solveDatablockLayout(
    [
      {
        aircraftId: ac.id,
        targetPoint: point,
        preferredRect: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
        metrics,
        leaderDir: td.leaderDir,
        leaderLengthPx: td.leaderLengthPx ?? view.leaderLengthPx,
        displayPriority: presentation.mode,
      },
    ],
    { bounds: { x: 0, y: 0, width: 800, height: 800 } },
  )[0]!;
  const rendered = createMockCtx();
  drawDatablock(rendered.ctx, ac, point.x, point.y, view, world, layout);
  expect(rendered.fillTexts.map((entry) => entry.text)).toContain(presentation.lines.line1);

  const hitPoint = { x: layout.rect!.x + 2, y: layout.rect!.y + 2 };
  expect(
    pickAircraftAt(world, hitPoint.x, hitPoint.y, DEFAULT_SCOPE_CAMERA, 800, 800, 12, view)?.id,
  ).toBe(ac.id);
});

test.each([
  { name: "FDB", mode: "full" as const, ownership: "owned" as const },
  { name: "PDB", mode: "partial" as const, ownership: "unowned" as const },
  { name: "LDB", mode: "limited" as const, ownership: "unowned" as const, unassociated: true },
])(
  "snapshot parity holds for $name and beaconator/time-share state",
  ({ mode, ownership, unassociated }) => {
    const ac = createAircraft({
      id: `snapshot-${mode}`,
      callsign: "DAL123",
      xNm: 0,
      yNm: 0,
      headingDeg: 0,
      altitudeFt: 8000,
      speedKt: 220,
      squawk: "4321",
    });
    const world = createWorld({ aircraft: [ac] });
    world.simTimeMs = 2500;
    const view = createScopeView();
    syncTrackDisplays(view.tracks, world);
    const td = view.tracks.get(ac.id)!;
    td.ownership = ownership;
    td.datablockMode = mode;
    td.unassociated = unassociated;
    td.squawk = "4321";
    view.beaconatorActive = true;
    td.lastReport = {
      aircraftId: ac.id,
      xNm: ac.xNm,
      yNm: ac.yNm,
      headingDeg: ac.headingDeg,
      speedKt: ac.speedKt,
      altitudeFt: ac.altitudeFt,
      reportedAtSimMs: world.simTimeMs,
      sourceSiteId: null,
      paint: "fused-puck",
    };
    primeDatablockSnapshot(world, view);

    const snapshot = buildScopeDatablockPresentation(view, world, ac);
    const point = nmToScreen(ac.xNm, ac.yNm, DEFAULT_SCOPE_CAMERA, { widthPx: 800, heightPx: 800 });
    const rect = datablockRect(point.x, point.y, snapshot.lines, view.datablockCellWidthPx);
    const layout = solveDatablockLayout(
      [
        {
          aircraftId: ac.id,
          targetPoint: point,
          preferredRect: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
          metrics: { widthPx: rect.w, heightPx: rect.h },
          leaderDir: td.leaderDir,
          leaderLengthPx: td.leaderLengthPx ?? view.leaderLengthPx,
          displayPriority: snapshot.mode,
        },
      ],
      { bounds: { x: 0, y: 0, width: 800, height: 800 } },
    )[0]!;
    const rendered = createMockCtx();
    drawDatablock(rendered.ctx, ac, point.x, point.y, view, world, layout, snapshot);
    expect(rendered.fillTexts.map((entry) => entry.text)).toContain(snapshot.lines.line1);
    expect(
      pickAircraftAt(
        world,
        layout.rect!.x + 2,
        layout.rect!.y + 2,
        DEFAULT_SCOPE_CAMERA,
        800,
        800,
        12,
        view,
      ),
    ).toBe(ac);
  },
);

test("snapshot parity preserves handoff and pointout tags", () => {
  for (const kind of ["handoff", "pointout"] as const) {
    const ac = createAircraft({
      id: `tag-${kind}`,
      callsign: "DAL456",
      xNm: 0,
      yNm: 0,
      headingDeg: 0,
      altitudeFt: 8000,
      speedKt: 220,
    });
    const world = createWorld({ aircraft: [ac] });
    const view = createScopeView();
    syncTrackDisplays(view.tracks, world);
    const td = view.tracks.get(ac.id)!;
    td.ownership = "owned";
    if (kind === "handoff")
      expect(initiateOutboundHandoff(ac, { world, simTimeMs: 0 }, "C")).toBe(true);
    else initiatePointout(world, ac, "C");
    primeDatablockSnapshot(world, view);
    const snapshot = buildScopeDatablockPresentation(view, world, ac);
    const point = nmToScreen(ac.xNm, ac.yNm, DEFAULT_SCOPE_CAMERA, { widthPx: 800, heightPx: 800 });
    const rect = datablockRect(point.x, point.y, snapshot.lines, view.datablockCellWidthPx);
    const layout = solveDatablockLayout(
      [
        {
          aircraftId: ac.id,
          targetPoint: point,
          preferredRect: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
          metrics: { widthPx: rect.w, heightPx: rect.h },
          leaderDir: td.leaderDir,
          leaderLengthPx: td.leaderLengthPx ?? view.leaderLengthPx,
          displayPriority: snapshot.mode,
        },
      ],
      { bounds: { x: 0, y: 0, width: 800, height: 800 } },
    )[0]!;
    const rendered = createMockCtx();
    drawDatablock(rendered.ctx, ac, point.x, point.y, view, world, layout, snapshot);
    expect(rendered.fillTexts.map((entry) => entry.text)).toContain(snapshot.lines.line1);
    expect(
      pickAircraftAt(
        world,
        layout.rect!.x + 2,
        layout.rect!.y + 2,
        DEFAULT_SCOPE_CAMERA,
        800,
        800,
        12,
        view,
      ),
    ).toBe(ac);
  }
});

test("pick uses the rendered snapshot rectangle instead of rebuilding it", () => {
  const aircraft = [
    createAircraft({
      id: "snapshot-primary",
      callsign: "DAL100",
      xNm: 0,
      yNm: 0,
      headingDeg: 0,
      altitudeFt: 8000,
      speedKt: 220,
    }),
    createAircraft({
      id: "snapshot-secondary",
      callsign: "AAL200",
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
  view.tracks.get("snapshot-secondary")!.ownership = "owned";
  view.tracks.get("snapshot-secondary")!.datablockMode = "full";
  for (const ac of aircraft) {
    view.tracks.get(ac.id)!.lastReport = {
      aircraftId: ac.id,
      xNm: ac.xNm,
      yNm: ac.yNm,
      headingDeg: ac.headingDeg,
      speedKt: ac.speedKt,
      altitudeFt: ac.altitudeFt,
      reportedAtSimMs: world.simTimeMs,
      sourceSiteId: null,
      paint: "fused-puck",
    };
  }
  drawTracks(createMockCtx().ctx, world, view, { widthPx: 800, heightPx: 800 });
  const snapshot = view.datablockRenderSnapshot!;
  const layout = snapshot.layouts.get("snapshot-secondary")!;
  const presentation = snapshot.presentations.get("snapshot-secondary")!;
  expect(presentation.lines.line1).toContain("AAL200");
  layout.rect = { x: 620, y: 620, width: layout.rect!.width, height: layout.rect!.height };

  expect(pickAircraftAt(world, 622, 622, DEFAULT_SCOPE_CAMERA, 800, 800, 12, view)).toBe(
    aircraft[1],
  );
  world.simTimeMs += 1;
  expect(pickAircraftAt(world, 622, 622, DEFAULT_SCOPE_CAMERA, 800, 800, 12, view)).toBeNull();
  view.datablockRenderSnapshot = undefined;
  expect(pickAircraftAt(world, 622, 622, DEFAULT_SCOPE_CAMERA, 800, 800, 12, view)).toBeNull();
});
