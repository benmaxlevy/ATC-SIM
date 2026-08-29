import { expect, test } from "vitest";
import { createWorld, makeTestAircraft, type AtpaPair, type AtpaStatus } from "@core";
import { nmToScreen, pxPerNm, type ScopeCamera, type ScopeViewSize } from "./camera";
import {
  ATPA_CONE_HALF_ANGLE_DEG,
  atpaConeColor,
  atpaConePoints,
  atpaSuppressesManualTpaCone,
  selectAtpaConesToPaint,
  shouldPaintAtpaGeometry,
} from "./atpaCone";
import { PALETTE } from "./palette";
import { renderScope } from "./renderScope";
import { createScopeView } from "./scopeView";
import { syncTrackDisplays } from "./trackDisplay";

const VIEW: ScopeViewSize = { widthPx: 800, heightPx: 800 };
const CAMERA: ScopeCamera = { rangeNm: 20, centerEastNm: 0, centerNorthNm: 0 };

function pair(
  partial: Partial<AtpaPair> & Pick<AtpaPair, "trailingCallsign" | "status">,
): AtpaPair {
  return {
    leadingCallsign: "LEAD1",
    volumeId: "vol-ils27",
    distanceNm: 4,
    requiredNm: 3,
    closureKt: 0,
    ...partial,
  };
}

test("AC7 — atpaCone comments cite R07 cones, prose supersession, and Fig 39 discrepancy", () => {
  const sources = import.meta.glob("./atpaCone.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./atpaCone.ts"]!;
  expect(src).toMatch(/TPA J-Rings and Cones/);
  expect(src).toMatch(/Monitor/);
  expect(src).toMatch(/Warning/);
  expect(src).toMatch(/Alert Cone/);
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/supersede/i);
  expect(src).toMatch(/one ATPA cone per trailing track/i);
  expect(src).toMatch(/Fig 39/);
  expect(src).toMatch(/pointing opposite/);
  expect(src).toMatch(/known, not implemented/);
});

test("AC1 — vertex coincides with the trailer; axis points at the leader; 3 NM axial length matches camera scale", () => {
  const trailEast = 4;
  const trailNorth = -2;
  const leadEast = 4;
  const leadNorth = 8;
  const lengthNm = 3;
  const pts = atpaConePoints(trailEast, trailNorth, leadEast, leadNorth, lengthNm);
  expect(pts.length).toBe(4);
  expect(pts[0]).toEqual({ eastNm: trailEast, northNm: trailNorth });
  expect(pts[3]).toEqual(pts[0]);

  const vertex = nmToScreen(pts[0]!.eastNm, pts[0]!.northNm, CAMERA, VIEW);
  const trailer = nmToScreen(trailEast, trailNorth, CAMERA, VIEW);
  expect(vertex.x).toBeCloseTo(trailer.x, 6);
  expect(vertex.y).toBeCloseTo(trailer.y, 6);

  const capMidEast = (pts[1]!.eastNm + pts[2]!.eastNm) / 2;
  const capMidNorth = (pts[1]!.northNm + pts[2]!.northNm) / 2;
  expect(capMidEast).toBeCloseTo(trailEast, 6);
  expect(capMidNorth).toBeCloseTo(trailNorth + lengthNm, 6);

  const capMid = nmToScreen(capMidEast, capMidNorth, CAMERA, VIEW);
  const axialPx = Math.hypot(capMid.x - vertex.x, capMid.y - vertex.y);
  expect(axialPx).toBeCloseTo(lengthNm * pxPerNm(CAMERA, VIEW), 4);
});

test("AC2 — cone length equals requiredNm including 2.5, not a draw-path literal", () => {
  const trail = { eastNm: 0, northNm: 0 };
  const lead = { eastNm: 10, northNm: 0 };
  for (const lengthNm of [3, 2.5]) {
    const pts = atpaConePoints(trail.eastNm, trail.northNm, lead.eastNm, lead.northNm, lengthNm);
    const capMidEast = (pts[1]!.eastNm + pts[2]!.eastNm) / 2;
    const capMidNorth = (pts[1]!.northNm + pts[2]!.northNm) / 2;
    const axialNm = Math.hypot(capMidEast - trail.eastNm, capMidNorth - trail.northNm);
    expect(axialNm).toBeCloseTo(lengthNm, 6);
  }
  const src = import.meta.glob("./atpaCone.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  expect(src["./atpaCone.ts"]).toMatch(/lengthNm/);
  expect(src["./atpaCone.ts"]).not.toMatch(/lengthNm\s*=\s*3/);
});

test("half-angle is a named 2–4° needle; end cap is flat and closed", () => {
  expect(ATPA_CONE_HALF_ANGLE_DEG).toBeGreaterThanOrEqual(2);
  expect(ATPA_CONE_HALF_ANGLE_DEG).toBeLessThanOrEqual(4);
  const lengthNm = 3;
  const pts = atpaConePoints(0, 0, 0, 10, lengthNm);
  expect(pts).toHaveLength(4);
  expect(pts[0]).toEqual(pts[3]);
  const halfWidthNm =
    Math.hypot(pts[1]!.eastNm - pts[2]!.eastNm, pts[1]!.northNm - pts[2]!.northNm) / 2;
  const expectedHalf = lengthNm * Math.tan((ATPA_CONE_HALF_ANGLE_DEG * Math.PI) / 180);
  expect(halfWidthNm).toBeCloseTo(expectedHalf, 6);
  const capDotAxis =
    (pts[2]!.eastNm - pts[1]!.eastNm) * 0 + (pts[2]!.northNm - pts[1]!.northNm) * 1;
  expect(capDotAxis).toBeCloseTo(0, 6);
});

test("degenerate axis or length yields no polyline", () => {
  expect(atpaConePoints(1, 1, 1, 1, 3)).toEqual([]);
  expect(atpaConePoints(0, 0, 1, 1, 0)).toEqual([]);
  expect(atpaConePoints(0, 0, 1, 1, -2)).toEqual([]);
});

test("AC3 — monitor tools, warning caution, alert atpaAlert; never CA red", () => {
  expect(atpaConeColor("monitor")).toBe(PALETTE.tools);
  expect(atpaConeColor("warning")).toBe(PALETTE.atpaWarning);
  expect(atpaConeColor("alert")).toBe(PALETTE.atpaAlert);
  expect(atpaConeColor("alert")).not.toBe(PALETTE.alert);
  expect(PALETTE.alert).toBe("#FF0000");
});

test("AC4 — one cone per trailer at highest status; warning/alert suppress manual TPA cones", () => {
  expect(atpaSuppressesManualTpaCone("monitor")).toBe(false);
  expect(atpaSuppressesManualTpaCone("warning")).toBe(true);
  expect(atpaSuppressesManualTpaCone("alert")).toBe(true);

  const painted = selectAtpaConesToPaint([
    pair({ trailingCallsign: "DAL123", status: "monitor" }),
    pair({ trailingCallsign: "DAL123", status: "alert", leadingCallsign: "AAL45" }),
    pair({ trailingCallsign: "SWA9", status: "warning" }),
  ]);
  expect(painted).toHaveLength(2);
  expect(painted.find((p) => p.trailingCallsign === "DAL123")?.status).toBe("alert");
  expect(painted.find((p) => p.trailingCallsign === "SWA9")?.status).toBe("warning");
});

test("AC5 — gate is off with master off; flags default on; inhibit drops that status", () => {
  expect(shouldPaintAtpaGeometry("monitor")).toBe(true);
  expect(shouldPaintAtpaGeometry("warning")).toBe(true);
  expect(shouldPaintAtpaGeometry("alert")).toBe(true);
  expect(shouldPaintAtpaGeometry("monitor", { atpaMonitorEnabled: false })).toBe(false);
  expect(shouldPaintAtpaGeometry("warning", { atpaWarningAlertEnabled: false })).toBe(false);
  expect(shouldPaintAtpaGeometry("alert", { atpaWarningAlertEnabled: false })).toBe(false);
  expect(shouldPaintAtpaGeometry("monitor", { atpaWarningAlertEnabled: false })).toBe(true);
  expect(shouldPaintAtpaGeometry("alert", { atpaMonitorEnabled: false })).toBe(true);
  expect(shouldPaintAtpaGeometry("monitor", { monitorCones: false })).toBe(false);
  expect(shouldPaintAtpaGeometry("warning", { monitorCones: false })).toBe(true);
  expect(shouldPaintAtpaGeometry("alert", { monitorCones: false })).toBe(true);
  expect(shouldPaintAtpaGeometry("alert", { alertCones: false })).toBe(false);
  expect(shouldPaintAtpaGeometry("warning", { alertCones: false })).toBe(false);
  expect(shouldPaintAtpaGeometry("monitor", { alertCones: false })).toBe(true);
});

interface PathStroke {
  points: { x: number; y: number }[];
  strokeStyle: string;
  lineWidth: number;
}

function createMockCtx(): {
  ctx: CanvasRenderingContext2D;
  pathStrokes: PathStroke[];
  fills: { count: number };
} {
  const pathStrokes: PathStroke[] = [];
  const fills = { count: 0 };
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
    rect() {},
    stroke(this: { strokeStyle: string; lineWidth: number }) {
      if (currentPath.length >= 2) {
        pathStrokes.push({
          points: currentPath.slice(),
          strokeStyle: String(this.strokeStyle),
          lineWidth: this.lineWidth,
        });
      }
    },
    fill() {
      fills.count += 1;
    },
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
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pathStrokes, fills };
}

function coneStrokes(pathStrokes: PathStroke[]): PathStroke[] {
  return pathStrokes.filter((s) => s.points.length === 4);
}

function pairedWorld(status: AtpaStatus, requiredNm = 3) {
  const trail = makeTestAircraft({ id: "ac-trail", callsign: "DAL123", xNm: 0, yNm: 0 });
  const lead = makeTestAircraft({ id: "ac-lead", callsign: "AAL45", xNm: 0, yNm: 10 });
  const world = createWorld({
    aircraft: [trail, lead],
    selectedAircraftId: trail.id,
    alerts: {
      ca: [],
      msaw: [],
      atpa: [
        pair({
          trailingCallsign: trail.callsign,
          leadingCallsign: lead.callsign,
          status,
          requiredNm,
          distanceNm: 10,
        }),
      ],
    },
  });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  view.atpa.on = true;
  return { world, view, trail };
}

test("render — monitor/warning/alert stroke the cone color; wedge is never filled", () => {
  const colors: [AtpaStatus, string][] = [
    ["monitor", PALETTE.tools],
    ["warning", PALETTE.atpaWarning],
    ["alert", PALETTE.atpaAlert],
  ];
  for (const [status, color] of colors) {
    const { world, view } = pairedWorld(status);
    const offFill = createMockCtx();
    view.atpa.alertCones = false;
    view.atpa.monitorCones = false;
    renderScope(offFill.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
    view.atpa.alertCones = true;
    view.atpa.monitorCones = true;
    const on = createMockCtx();
    renderScope(on.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
    const cones = coneStrokes(on.pathStrokes);
    expect(cones, status).toHaveLength(1);
    expect(cones[0]!.strokeStyle).toBe(color);
    expect(cones[0]!.strokeStyle).not.toBe(PALETTE.alert);
    expect(on.fills.count).toBe(offFill.fills.count);
  }
});

test("render — 3 NM cone axial length is 3 * pxPerNm; length comes from requiredNm", () => {
  const { world, view, trail } = pairedWorld("monitor", 3);
  const { ctx, pathStrokes } = createMockCtx();
  renderScope(ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  const cone = coneStrokes(pathStrokes)[0]!;
  const vertex = nmToScreen(trail.xNm, trail.yNm, view.camera, VIEW);
  expect(cone.points[0]!.x).toBeCloseTo(vertex.x, 4);
  expect(cone.points[0]!.y).toBeCloseTo(vertex.y, 4);
  const capMid = {
    x: (cone.points[1]!.x + cone.points[2]!.x) / 2,
    y: (cone.points[1]!.y + cone.points[2]!.y) / 2,
  };
  expect(Math.hypot(capMid.x - vertex.x, capMid.y - vertex.y)).toBeCloseTo(
    3 * pxPerNm(view.camera, VIEW),
    4,
  );
});

test("render — DCB cone latch off paints no cone; inhibit drops monitor; alert supersedes monitor on the same trailer", () => {
  const { world, view } = pairedWorld("monitor");
  view.atpa.monitorCones = false;
  const off = createMockCtx();
  renderScope(off.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  expect(coneStrokes(off.pathStrokes)).toHaveLength(0);

  view.atpa.monitorCones = true;
  const td = view.tracks.get("ac-trail")!;
  td.atpaMonitorEnabled = false;
  const inhibited = createMockCtx();
  renderScope(inhibited.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  expect(coneStrokes(inhibited.pathStrokes)).toHaveLength(0);

  td.atpaMonitorEnabled = true;
  world.alerts.atpa = [
    pair({ trailingCallsign: "DAL123", leadingCallsign: "AAL45", status: "monitor" }),
    pair({ trailingCallsign: "DAL123", leadingCallsign: "AAL45", status: "alert" }),
  ];
  const both = createMockCtx();
  renderScope(both.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  const cones = coneStrokes(both.pathStrokes);
  expect(cones).toHaveLength(1);
  expect(cones[0]!.strokeStyle).toBe(PALETTE.atpaAlert);
});

test("drawAtpaCones never fills the wedge", () => {
  const sources = import.meta.glob("./renderScope.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./renderScope.ts"]!;
  const fn = src.slice(
    src.indexOf("function strokeConeAroundDigits"),
    src.indexOf("const SSA_LEFT_PX"),
  );
  expect(fn).toMatch(/ctx\.stroke\(\)/);
  expect(fn).not.toMatch(/ctx\.fill\(/);
  expect(fn).toMatch(/requiredNm/);
});
