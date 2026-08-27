import { expect, test } from "vitest";
import { SessionLog, createWorld, makeTestAircraft } from "@core";
import { handleRadioText } from "@pilot";
import { nmToScreen, pxPerNm, type ScopeViewSize } from "./camera";
import { PALETTE } from "./palette";
import { renderScope } from "./renderScope";
import { createScopeView, stepTpaRadius, toggleAtpaOn, toggleTpaOn } from "./scopeView";
import {
  DEFAULT_TPA_RADIUS_NM,
  DEFAULT_TPA_STATE,
  TPA_RADIUS_NM,
  TPA_STROKE_COLOR,
  aircraftForTpaRings,
  formatDcbTpaMiReadout,
  shouldPaintAtpaGeometry,
  stepTpaRadiusNm,
  tpaRingPoints,
  tpaScreenRadiusPx,
} from "./tpa";
import { syncTrackDisplays } from "./trackDisplay";

const VIEW: ScopeViewSize = { widthPx: 800, heightPx: 800 };

interface PathStroke {
  points: { x: number; y: number }[];
  strokeStyle: string;
  lineWidth: number;
}

function createMockCtx(): {
  ctx: CanvasRenderingContext2D;
  pathStrokes: PathStroke[];
} {
  const pathStrokes: PathStroke[] = [];
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
    fillText() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pathStrokes };
}

function tpaStrokes(pathStrokes: PathStroke[]): PathStroke[] {
  return pathStrokes.filter((s) => s.strokeStyle === TPA_STROKE_COLOR && s.points.length >= 16);
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
});
