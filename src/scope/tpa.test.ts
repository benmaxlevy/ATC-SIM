import { expect, test } from "vitest";
import { SessionLog, createWorld, makeTestAircraft } from "@core";
import { handleRadioText } from "@pilot";
import { nmToScreen, pxPerNm, type ScopeViewSize } from "./camera";
import { PALETTE } from "./palette";
import { serializeDcbPref } from "./dcbPref";
import { renderScope } from "./renderScope";
import { applyStarsChordAction } from "./starsChord";
import { ATPA_CONE_HALF_ANGLE_DEG, atpaSuppressesManualTpaCone } from "./atpaCone";
import {
  createScopeView,
  stepTpaRadius,
  toggleAtpaAlertCones,
  toggleAtpaConeMileage,
  toggleAtpaInTrailDistance,
  toggleAtpaMonitorCones,
  toggleAtpaOn,
  toggleTpaOn,
} from "./scopeView";
import {
  DEFAULT_ATPA_STATE,
  DEFAULT_TPA_RADIUS_NM,
  DEFAULT_TPA_STATE,
  TPA_RADIUS_NM,
  TPA_RING_DIGIT_CLOCK_DEG,
  TPA_STROKE_COLOR,
  aircraftForTpaRings,
  atpaFeatureEffective,
  formatDcbTpaMiReadout,
  formatTpaSizeReadout,
  manualTpaConePoints,
  shouldPaintAtpaGeometry,
  stepTpaRadiusNm,
  tpaConeDigitPlacement,
  tpaConesToPaint,
  tpaRingDigitPlacement,
  tpaRingPoints,
  tpaRingsToPaint,
  tpaScreenRadiusPx,
  tpaSizeReadoutEnabled,
} from "./tpa";
import { syncTrackDisplays } from "./trackDisplay";

const VIEW: ScopeViewSize = { widthPx: 800, heightPx: 800 };

interface PathStroke {
  points: { x: number; y: number }[];
  strokeStyle: string;
  lineWidth: number;
}

interface FillText {
  text: string;
  x: number;
  y: number;
  fillStyle: string;
}

function createMockCtx(): {
  ctx: CanvasRenderingContext2D;
  pathStrokes: PathStroke[];
  fillTexts: FillText[];
} {
  const pathStrokes: PathStroke[] = [];
  const fillTexts: FillText[] = [];
  let currentPath: { x: number; y: number }[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textBaseline: "alphabetic",
    textAlign: "start",
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {
      currentPath = [];
    },
    closePath() {
      if (currentPath[0]) {
        currentPath.push({ ...currentPath[0] });
      }
    },
    arc() {},
    clip() {},
    stroke(this: { strokeStyle: string; lineWidth: number }) {
      if (currentPath.length >= 2) {
        pathStrokes.push({
          points: currentPath.slice(),
          strokeStyle: String(this.strokeStyle),
          lineWidth: this.lineWidth,
        });
      }
    },
    fill() {},
    moveTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    lineTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    setTransform() {},
    strokeRect() {},
    measureText(text: string) {
      return { width: Math.max(0, text.length) * 7.2 };
    },
    fillText(this: { fillStyle: string }, text: string, x: number, y: number) {
      fillTexts.push({ text, x, y, fillStyle: String(this.fillStyle) });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pathStrokes, fillTexts };
}

function tpaStrokes(pathStrokes: PathStroke[]): PathStroke[] {
  return pathStrokes.filter((s) => s.strokeStyle === TPA_STROKE_COLOR && s.points.length >= 16);
}

function tpaConeStrokes(pathStrokes: PathStroke[]): PathStroke[] {
  return pathStrokes.filter((s) => s.strokeStyle === TPA_STROKE_COLOR && s.points.length === 4);
}

function ringRadiusPx(stroke: PathStroke, cx: number, cy: number): number {
  const p = stroke.points[0]!;
  return Math.hypot(p.x - cx, p.y - cy);
}

test("AC1 — TPA on + selected track: 3 NM ring radius matches camera scale", () => {
  const view = createScopeView();
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 4, yNm: -2 });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  syncTrackDisplays(view.tracks, world);
  view.tpa.on = true;
  view.tpa.radiusNm = 3;

  const expectedPx = tpaScreenRadiusPx(3, view.camera, VIEW);
  expect(expectedPx).toBeCloseTo(3 * pxPerNm(view.camera, VIEW), 6);

  const center = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  const pts = tpaRingPoints(dal.xNm, dal.yNm, 3).map((p) =>
    nmToScreen(p.eastNm, p.northNm, view.camera, VIEW),
  );
  expect(pts.length).toBeGreaterThan(16);
  for (const p of pts) {
    expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(expectedPx, 4);
  }

  const { ctx, pathStrokes } = createMockCtx();
  renderScope(ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  const rings = tpaStrokes(pathStrokes);
  expect(rings).toHaveLength(1);
  expect(rings[0]!.strokeStyle).toBe(PALETTE.tools);
  expect(rings[0]!.strokeStyle).not.toBe(PALETTE.alert);
  const painted = rings[0]!.points[0]!;
  expect(Math.hypot(painted.x - center.x, painted.y - center.y)).toBeCloseTo(expectedPx, 4);
});

test("AC2 — TPA MI spinner is 2/3/5/10 NM; default 5 NM off", () => {
  expect(TPA_RADIUS_NM).toEqual([2, 3, 5, 10]);
  expect(DEFAULT_TPA_RADIUS_NM).toBe(5);
  expect(DEFAULT_TPA_STATE).toEqual({ on: false, radiusNm: 5 });
  const view = createScopeView();
  expect(view.tpa.on).toBe(false);
  expect(view.tpa.radiusNm).toBe(5);
  expect(formatDcbTpaMiReadout(view.tpa.radiusNm)).toBe("5");
  expect(stepTpaRadiusNm(5, -1)).toBe(3);
  expect(stepTpaRadiusNm(3, -1)).toBe(2);
  expect(stepTpaRadiusNm(2, -1)).toBe(2);
  expect(stepTpaRadiusNm(5, 1)).toBe(10);
  expect(stepTpaRadiusNm(10, 1)).toBe(10);
  stepTpaRadius(view, -1);
  expect(view.tpa.radiusNm).toBe(3);
  toggleTpaOn(view);
  expect(view.tpa.on).toBe(true);
});

test("no selection: TPA rings owned tracks only (not unowned)", () => {
  const view = createScopeView();
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 0, yNm: 0 });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45", xNm: 8, yNm: 0 });
  const world = createWorld({ aircraft: [dal, aal], selectedAircraftId: null });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(dal.id)!.ownership = "owned";
  expect(
    aircraftForTpaRings(true, world.selectedAircraftId, world.aircraft, view.tracks).map(
      (ac) => ac.id,
    ),
  ).toEqual([dal.id]);
  view.tpa.on = true;
  view.tpa.radiusNm = 5;
  const { ctx, pathStrokes } = createMockCtx();
  renderScope(ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  expect(tpaStrokes(pathStrokes)).toHaveLength(1);
});

test("AC3 — ATPA on with an empty pair set paints no extra stroke", () => {
  const view = createScopeView();
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 1, yNm: 1 });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  syncTrackDisplays(view.tracks, world);
  const off = createMockCtx();
  renderScope(off.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  toggleAtpaOn(view);
  expect(view.atpa.on).toBe(true);
  expect(world.alerts.atpa).toEqual([]);
  expect(shouldPaintAtpaGeometry(view.atpa.on, "monitor")).toBe(true);
  const on = createMockCtx();
  renderScope(on.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  expect(tpaStrokes(on.pathStrokes)).toHaveLength(0);
  expect(on.pathStrokes.length).toBe(off.pathStrokes.length);
});

test("T02-47 — four DCB latches default on; master-off suppresses every feature", () => {
  expect(DEFAULT_ATPA_STATE).toEqual({
    on: false,
    inTrailDistance: true,
    coneMileage: true,
    alertCones: true,
    monitorCones: true,
  });
  const view = createScopeView();
  expect(view.atpa).toEqual(DEFAULT_ATPA_STATE);
  for (const feature of ["coneMileage", "inTrailDistance", "alertCones", "monitorCones"] as const) {
    expect(atpaFeatureEffective(view.atpa, feature)).toBe(false);
  }

  toggleAtpaOn(view);
  expect(view.atpa.on).toBe(true);
  expect(atpaFeatureEffective(view.atpa, "coneMileage")).toBe(true);
  expect(atpaFeatureEffective(view.atpa, "inTrailDistance")).toBe(true);
  expect(atpaFeatureEffective(view.atpa, "alertCones")).toBe(true);
  expect(atpaFeatureEffective(view.atpa, "monitorCones")).toBe(true);
  expect(shouldPaintAtpaGeometry(view.atpa.on, "monitor", view.atpa)).toBe(true);
  expect(shouldPaintAtpaGeometry(view.atpa.on, "warning", view.atpa)).toBe(true);
  expect(shouldPaintAtpaGeometry(view.atpa.on, "alert", view.atpa)).toBe(true);

  toggleAtpaConeMileage(view);
  expect(view.atpa.coneMileage).toBe(false);
  expect(atpaFeatureEffective(view.atpa, "coneMileage")).toBe(false);
  expect(atpaFeatureEffective(view.atpa, "inTrailDistance")).toBe(true);
  toggleAtpaInTrailDistance(view);
  expect(view.atpa.inTrailDistance).toBe(false);
  toggleAtpaAlertCones(view);
  expect(view.atpa.alertCones).toBe(false);
  expect(shouldPaintAtpaGeometry(view.atpa.on, "alert", view.atpa)).toBe(false);
  expect(shouldPaintAtpaGeometry(view.atpa.on, "warning", view.atpa)).toBe(false);
  expect(shouldPaintAtpaGeometry(view.atpa.on, "monitor", view.atpa)).toBe(true);
  toggleAtpaMonitorCones(view);
  expect(view.atpa.monitorCones).toBe(false);
  expect(shouldPaintAtpaGeometry(view.atpa.on, "monitor", view.atpa)).toBe(false);

  view.atpa.coneMileage = true;
  view.atpa.inTrailDistance = true;
  view.atpa.alertCones = true;
  view.atpa.monitorCones = true;
  toggleAtpaOn(view);
  expect(view.atpa.on).toBe(false);
  expect(atpaFeatureEffective(view.atpa, "coneMileage")).toBe(false);
  expect(atpaFeatureEffective(view.atpa, "inTrailDistance")).toBe(false);
  expect(atpaFeatureEffective(view.atpa, "alertCones")).toBe(false);
  expect(atpaFeatureEffective(view.atpa, "monitorCones")).toBe(false);
  expect(shouldPaintAtpaGeometry(view.atpa.on, "monitor", view.atpa)).toBe(false);
  expect(shouldPaintAtpaGeometry(view.atpa.on, "alert", view.atpa)).toBe(false);
  expect(view.atpa.coneMileage).toBe(true);
  expect(view.atpa.inTrailDistance).toBe(true);
  expect(view.atpa.alertCones).toBe(true);
  expect(view.atpa.monitorCones).toBe(true);
});

test("AC4 — CA lite still has no automatic 3 NM halo (TPA 3 NM is display-only)", () => {
  const src = [
    ...Object.values(
      import.meta.glob("./renderScope.ts", {
        query: "?raw",
        import: "default",
        eager: true,
      }) as Record<string, string>,
    ),
    ...Object.values(
      import.meta.glob("./tpa.ts", { query: "?raw", import: "default", eager: true }) as Record<
        string,
        string
      >,
    ),
  ].join("\n");
  expect(src).toMatch(/not a 3 NM (circle|halo)/i);
  expect(src).not.toMatch(/ctx\.clip/);
  const view = createScopeView();
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 0, yNm: 0 });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  syncTrackDisplays(view.tracks, world);
  const { ctx, pathStrokes } = createMockCtx();
  renderScope(ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  expect(tpaStrokes(pathStrokes)).toHaveLength(0);
  expect(pathStrokes.every((s) => s.strokeStyle !== PALETTE.alert)).toBe(true);
});

test("AC5 — TPA/ATPA clicks are not Command IR; DAL123 H270 still works", async () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    headingDeg: 90,
  });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const log = new SessionLog();
  toggleTpaOn(view);
  stepTpaRadius(view, -1);
  toggleAtpaOn(view);
  toggleAtpaConeMileage(view);
  toggleAtpaInTrailDistance(view);
  toggleAtpaAlertCones(view);
  toggleAtpaMonitorCones(view);
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(log.byType("command.rejected")).toHaveLength(0);
  expect(dal.intent.assignedHeadingDeg).not.toBe(270);

  const result = await handleRadioText(world, "DAL123 H270", log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(log.byType("command.accepted")).toHaveLength(1);
});

test("AC6 — comments cite CRC TPA J-rings; CA is not a circle; ATPA cones stroke", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = `${sources["./tpa.ts"] ?? ""}\n${sources["./renderScope.ts"] ?? ""}`;
  expect(src).toMatch(/TPA/);
  expect(src).toMatch(/J-ring/i);
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/ATPA/);
  expect(src).toMatch(/cone/i);
  expect(src).toMatch(/world\.alerts\.atpa/);
  expect(src).not.toMatch(/no pairing|paints nothing/i);
  expect(src).toMatch(/not a 3 NM (circle|halo)/i);
  expect(src).toMatch(/TLS|tools/);
  expect(src).not.toMatch(/Command IR/);
  expect(src).toMatch(/TPA ATPA Submenu/);
  expect(src).toMatch(/displays mileage in the A\/TPA cone/);
  expect(src).toMatch(/displays intrail distance in the datablock/);
  expect(src).toMatch(/displays alert cones at this TCP/);
  expect(src).toMatch(/displays monitor cones at this TCP/);
  expect(src).toMatch(/no separate Warning Cones cell/);
  expect(src).toMatch(/TPA J-Rings and Cones/);
  expect(src).toMatch(/1–30/);
  expect(src).toMatch(/ground track/i);
  expect(src).toMatch(/size-readout inhibit/i);
  expect(src).toMatch(/\*\*J/);
  expect(src).toMatch(/\*\*P/);
  expect(src).toMatch(/deliberately different/);
  expect(src).toMatch(/session state, not PREF/);
});

test("AC1 — two tracks carry independent J-ring radii; DCB overlay stays selected-else-owned", () => {
  const view = createScopeView();
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL122", xNm: 0, yNm: 0 });
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL495", xNm: 10, yNm: 0 });
  const world = createWorld({ aircraft: [aal, dal], selectedAircraftId: null });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(aal.id)!.tpaRingNm = 3;
  view.tracks.get(dal.id)!.tpaRingNm = 5;
  const painted = tpaRingsToPaint(
    false,
    world.selectedAircraftId,
    world.aircraft,
    view.tracks,
    view.tpa.radiusNm,
  );
  expect(painted.map((p) => [p.aircraft.id, p.radiusNm])).toEqual([
    [aal.id, 3],
    [dal.id, 5],
  ]);

  view.tpa.on = true;
  view.tpa.radiusNm = 10;
  const swa = makeTestAircraft({ id: "ac-swa", callsign: "SWA9", xNm: 4, yNm: 4 });
  world.aircraft.push(swa);
  world.selectedAircraftId = swa.id;
  syncTrackDisplays(view.tracks, world);
  const withDcb = tpaRingsToPaint(true, swa.id, world.aircraft, view.tracks, 10);
  expect(withDcb.find((p) => p.aircraft.id === aal.id)?.radiusNm).toBe(3);
  expect(withDcb.find((p) => p.aircraft.id === dal.id)?.radiusNm).toBe(5);
  expect(withDcb.find((p) => p.aircraft.id === swa.id)?.radiusNm).toBe(10);
});

test("AC4 — DCB spinner stays 2/3/5/10; chord radii 1, 7.5, 30 are stored unclamped", () => {
  expect(TPA_RADIUS_NM).toEqual([2, 3, 5, 10]);
  expect(DEFAULT_TPA_STATE).toEqual({ on: false, radiusNm: 5 });
  const view = createScopeView();
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  syncTrackDisplays(view.tracks, world);
  for (const nm of [1, 7.5, 30]) {
    view.tracks.get(dal.id)!.tpaRingNm = nm;
    const painted = tpaRingsToPaint(false, dal.id, world.aircraft, view.tracks, view.tpa.radiusNm);
    expect(painted).toHaveLength(1);
    expect(painted[0]!.radiusNm).toBe(nm);
  }
  expect(stepTpaRadiusNm(5, 1)).toBe(10);
  expect(view.tpa.radiusNm).toBe(5);
});

test("per-track TPA entries drop when the track leaves the world", () => {
  const view = createScopeView();
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(dal.id)!.tpaRingNm = 3;
  view.tracks.get(dal.id)!.tpaConeNm = 2.5;
  world.aircraft = [];
  syncTrackDisplays(view.tracks, world);
  expect(view.tracks.has(dal.id)).toBe(false);
});

test("size-readout tenths formatter and 7–8 o'clock ring digit stay inside the ring", () => {
  expect(formatTpaSizeReadout(3)).toBe("3");
  expect(formatTpaSizeReadout(2.5)).toBe("2.5");
  expect(formatTpaSizeReadout(7.5)).toBe("7.5");
  expect(TPA_RING_DIGIT_CLOCK_DEG).toBeGreaterThanOrEqual(210);
  expect(TPA_RING_DIGIT_CLOCK_DEG).toBeLessThanOrEqual(240);
  const digit = tpaRingDigitPlacement(0, 0, 5);
  expect(digit.text).toBe("5");
  expect(digit.eastNm).toBeLessThan(0);
  expect(digit.northNm).toBeLessThan(0);
  expect(Math.hypot(digit.eastNm, digit.northNm)).toBeLessThan(5);
  expect(tpaSizeReadoutEnabled(undefined)).toBe(true);
  expect(tpaSizeReadoutEnabled({ tpaSizeReadoutEnabled: false } as never)).toBe(false);
});

test("AC3 — *P cone reuses T02-45 wedge along ground track, not assigned heading", () => {
  const lengthNm = 3;
  const headingDeg = 90;
  const pts = manualTpaConePoints(0, 0, headingDeg, lengthNm);
  expect(pts).toHaveLength(4);
  expect(pts[0]).toEqual({ eastNm: 0, northNm: 0 });
  expect(pts[3]).toEqual(pts[0]);
  const capMidEast = (pts[1]!.eastNm + pts[2]!.eastNm) / 2;
  const capMidNorth = (pts[1]!.northNm + pts[2]!.northNm) / 2;
  expect(capMidEast).toBeCloseTo(lengthNm, 6);
  expect(capMidNorth).toBeCloseTo(0, 6);
  const halfWidthNm =
    Math.hypot(pts[1]!.eastNm - pts[2]!.eastNm, pts[1]!.northNm - pts[2]!.northNm) / 2;
  const expectedHalf = lengthNm * Math.tan((ATPA_CONE_HALF_ANGLE_DEG * Math.PI) / 180);
  expect(halfWidthNm).toBeCloseTo(expectedHalf, 6);

  const north = manualTpaConePoints(2, 4, 0, 2.5);
  const northCapEast = (north[1]!.eastNm + north[2]!.eastNm) / 2;
  const northCapNorth = (north[1]!.northNm + north[2]!.northNm) / 2;
  expect(northCapEast).toBeCloseTo(2, 6);
  expect(northCapNorth).toBeCloseTo(6.5, 6);

  const digit3 = tpaConeDigitPlacement(0, 0, 90, 3);
  const digit25 = tpaConeDigitPlacement(0, 0, 90, 2.5);
  expect(digit3.text).toBe("3");
  expect(digit25.text).toBe("2.5");
});

test("AC6 — warning/alert ATPA cones suppress the manual *P cone; monitor does not; J-rings stay", () => {
  expect(atpaSuppressesManualTpaCone("monitor")).toBe(false);
  expect(atpaSuppressesManualTpaCone("warning")).toBe(true);
  expect(atpaSuppressesManualTpaCone("alert")).toBe(true);

  const view = createScopeView();
  const trail = makeTestAircraft({
    id: "ac-trail",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
  });
  const lead = makeTestAircraft({ id: "ac-lead", callsign: "AAL45", xNm: 10, yNm: 0 });
  const world = createWorld({
    aircraft: [trail, lead],
    alerts: {
      ca: [],
      msaw: [],
      atpa: [
        {
          trailingCallsign: "DAL123",
          leadingCallsign: "AAL45",
          volumeId: "vol-ils27",
          distanceNm: 4,
          requiredNm: 3,
          closureKt: 0,
          status: "warning",
        },
      ],
    },
  });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(trail.id)!.tpaConeNm = 5;
  view.tracks.get(trail.id)!.tpaRingNm = 3;
  view.atpa.on = true;

  expect(tpaConesToPaint(world.aircraft, view.tracks, world.alerts.atpa, true)).toHaveLength(0);
  world.alerts.atpa[0]!.status = "monitor";
  expect(tpaConesToPaint(world.aircraft, view.tracks, world.alerts.atpa, true)).toHaveLength(1);
  world.alerts.atpa[0]!.status = "alert";
  expect(tpaConesToPaint(world.aircraft, view.tracks, world.alerts.atpa, true)).toHaveLength(0);
  expect(
    tpaRingsToPaint(false, null, world.aircraft, view.tracks, 5).map((p) => p.radiusNm),
  ).toEqual([3]);
});

test("AC1 render — two independent J-rings paint at camera scale with lower-left digits", () => {
  const view = createScopeView();
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL122", xNm: 0, yNm: 0 });
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL495", xNm: 12, yNm: 0 });
  const world = createWorld({ aircraft: [aal, dal], selectedAircraftId: null });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(aal.id)!.tpaRingNm = 3;
  view.tracks.get(dal.id)!.tpaRingNm = 5;
  const { ctx, pathStrokes, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  const rings = tpaStrokes(pathStrokes);
  expect(rings).toHaveLength(2);
  const aalCenter = nmToScreen(aal.xNm, aal.yNm, view.camera, VIEW);
  const dalCenter = nmToScreen(dal.xNm, dal.yNm, view.camera, VIEW);
  const aalPx = 3 * pxPerNm(view.camera, VIEW);
  const dalPx = 5 * pxPerNm(view.camera, VIEW);
  const radii = rings.map((r) => {
    const toAal = ringRadiusPx(r, aalCenter.x, aalCenter.y);
    const toDal = ringRadiusPx(r, dalCenter.x, dalCenter.y);
    return toAal < toDal ? toAal : toDal;
  });
  expect(radii.some((r) => Math.abs(r - aalPx) < 0.05)).toBe(true);
  expect(radii.some((r) => Math.abs(r - dalPx) < 0.05)).toBe(true);
  expect(fillTexts.some((t) => t.text === "3" && t.fillStyle === TPA_STROKE_COLOR)).toBe(true);
  expect(fillTexts.some((t) => t.text === "5" && t.fillStyle === TPA_STROKE_COLOR)).toBe(true);
});

test("AC3 render — two *P cones (3 and 2.5) along ground track; axial px is lengthNm * pxPerNm", () => {
  const view = createScopeView();
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL766",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
  });
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL276",
    xNm: 0,
    yNm: 8,
    headingDeg: 90,
  });
  const world = createWorld({ aircraft: [aal, dal] });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(aal.id)!.tpaConeNm = 3;
  view.tracks.get(dal.id)!.tpaConeNm = 2.5;
  const { ctx, pathStrokes, fillTexts } = createMockCtx();
  renderScope(ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  const cones = tpaConeStrokes(pathStrokes);
  expect(cones).toHaveLength(2);
  const scale = pxPerNm(view.camera, VIEW);
  const lengths = cones.map((c) => {
    const vertex = c.points[0]!;
    const capMid = {
      x: (c.points[1]!.x + c.points[2]!.x) / 2,
      y: (c.points[1]!.y + c.points[2]!.y) / 2,
    };
    return Math.hypot(capMid.x - vertex.x, capMid.y - vertex.y);
  });
  expect(lengths.some((l) => Math.abs(l - 3 * scale) < 0.05)).toBe(true);
  expect(lengths.some((l) => Math.abs(l - 2.5 * scale) < 0.05)).toBe(true);
  expect(fillTexts.some((t) => t.text === "3" && t.fillStyle === TPA_STROKE_COLOR)).toBe(true);
  expect(fillTexts.some((t) => t.text === "2.5" && t.fillStyle === TPA_STROKE_COLOR)).toBe(true);
});

test("AC5 — *D+I hides size digits and keeps the ring and cone stroke", () => {
  const view = createScopeView();
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 2,
    yNm: 2,
    headingDeg: 0,
  });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  syncTrackDisplays(view.tracks, world);
  applyStarsChordAction(view, world, { type: "jRing", target: "slewed", radiusNm: 3 });
  applyStarsChordAction(view, world, { type: "cone", target: "slewed", lengthNm: 2.5 });
  const shown = createMockCtx();
  renderScope(shown.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  expect(tpaStrokes(shown.pathStrokes)).toHaveLength(1);
  expect(tpaConeStrokes(shown.pathStrokes)).toHaveLength(1);
  expect(shown.fillTexts.some((t) => t.text === "3" && t.fillStyle === TPA_STROKE_COLOR)).toBe(
    true,
  );
  expect(shown.fillTexts.some((t) => t.text === "2.5" && t.fillStyle === TPA_STROKE_COLOR)).toBe(
    true,
  );

  applyStarsChordAction(view, world, { type: "tpaSizeReadout", mode: "inhibit" });
  const hidden = createMockCtx();
  renderScope(hidden.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  expect(tpaStrokes(hidden.pathStrokes)).toHaveLength(1);
  expect(tpaConeStrokes(hidden.pathStrokes)).toHaveLength(1);
  expect(hidden.fillTexts.some((t) => t.text === "3" && t.fillStyle === TPA_STROKE_COLOR)).toBe(
    false,
  );
  expect(hidden.fillTexts.some((t) => t.text === "2.5" && t.fillStyle === TPA_STROKE_COLOR)).toBe(
    false,
  );

  applyStarsChordAction(view, world, { type: "tpaSizeReadout", mode: "enable" });
  const restored = createMockCtx();
  renderScope(restored.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  expect(restored.fillTexts.some((t) => t.text === "3" && t.fillStyle === TPA_STROKE_COLOR)).toBe(
    true,
  );
  expect(restored.fillTexts.some((t) => t.text === "2.5" && t.fillStyle === TPA_STROKE_COLOR)).toBe(
    true,
  );
});

test("AC6 render — warning suppresses the manual cone; the J-ring still paints; no CA halo", () => {
  const view = createScopeView();
  const trail = makeTestAircraft({
    id: "ac-trail",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
  });
  const lead = makeTestAircraft({ id: "ac-lead", callsign: "AAL45", xNm: 10, yNm: 0 });
  const world = createWorld({
    aircraft: [trail, lead],
    alerts: {
      ca: [],
      msaw: [],
      atpa: [
        {
          trailingCallsign: "DAL123",
          leadingCallsign: "AAL45",
          volumeId: "vol-ils27",
          distanceNm: 4,
          requiredNm: 3,
          closureKt: 0,
          status: "warning",
        },
      ],
    },
  });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(trail.id)!.tpaConeNm = 5;
  view.tracks.get(trail.id)!.tpaRingNm = 3;
  view.atpa.on = true;
  const warning = createMockCtx();
  renderScope(warning.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  expect(tpaStrokes(warning.pathStrokes)).toHaveLength(1);
  expect(tpaConeStrokes(warning.pathStrokes)).toHaveLength(0);
  expect(warning.pathStrokes.every((s) => s.strokeStyle !== PALETTE.alert)).toBe(true);

  world.alerts.atpa[0]!.status = "monitor";
  const monitor = createMockCtx();
  renderScope(monitor.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  const scale = pxPerNm(view.camera, VIEW);
  const manualLen = tpaConeStrokes(monitor.pathStrokes).map((c) => {
    const vertex = c.points[0]!;
    const capMid = {
      x: (c.points[1]!.x + c.points[2]!.x) / 2,
      y: (c.points[1]!.y + c.points[2]!.y) / 2,
    };
    return Math.hypot(capMid.x - vertex.x, capMid.y - vertex.y);
  });
  expect(manualLen.some((l) => Math.abs(l - 5 * scale) < 0.05)).toBe(true);
  expect(tpaStrokes(monitor.pathStrokes)).toHaveLength(1);
});

test("per-track TPA graphics do not persist in PREF", () => {
  const view = createScopeView();
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(dal.id)!.tpaRingNm = 7.5;
  view.tracks.get(dal.id)!.tpaConeNm = 2.5;
  view.tpa.on = true;
  view.tpa.radiusNm = 3;
  const body = serializeDcbPref(view);
  expect(body.tpa).toEqual({ on: true, radiusNm: 3 });
  expect(JSON.stringify(body)).not.toMatch(/tpaRingNm|tpaConeNm|7\.5/);
});
