/**
 * T02-50 — TPA / ATPA addendum end-to-end acceptance.
 *
 * Drives a real World through stepWorld against the committed KDEM catalog
 * and a real ScopeView. Pairing is whatever `world.alerts.atpa` contains
 * after a tick; this file does not re-derive it. `world.alerts.atpa` is
 * poked only as a negative control (master-off still has pairs).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  ATPA_ALERT_S,
  ATPA_WARNING_S,
  CA_LATERAL_NM,
  SessionLog,
  SIM_DT_S,
  alongCourseDistanceNm,
  createWorld,
  makeTestAircraft,
  resolveAtpaGeometry,
  stepWorld,
  type AtpaPair,
  type AtpaStatus,
  type AtpaVolumeGeometry,
  type World,
} from "@core";
import { handleRadioText } from "@pilot";
import { loadCatalog, type ProcedureCatalog } from "@scenario";
import { createCaAlertTone } from "../app/ca-alert-tone";
import { DisplayControlBar } from "../ui/DisplayControlBar";
import {
  DCB_PREF_SCHEMA_VERSION,
  dcbPrefStorageKey,
  loadDcbPrefFromStorage,
  parseDcbPrefJson,
  saveDcbPref,
  serializeDcbPref,
  type DcbPrefStorage,
} from "./dcbPref";
import { nmToScreen, pxPerNm, type ScopeViewSize } from "./camera";
import { applyDcbShift, openDcbMenu } from "./dcbMenu";
import { PALETTE } from "./palette";
import { renderScope } from "./renderScope";
import { applyStarsChordAction, parseStarsChord } from "./starsChord";
import { atpaConeColor, atpaSuppressesManualTpaCone } from "./atpaCone";
import { formatAtpaConeMileage, formatAtpaInTrailDistance } from "./atpaReadout";
import {
  createScopeView,
  toggleAtpaAlertCones,
  toggleAtpaConeMileage,
  toggleAtpaInTrailDistance,
  toggleAtpaMonitorCones,
  toggleAtpaOn,
} from "./scopeView";
import { DEFAULT_ATPA_STATE, TPA_STROKE_COLOR, atpaFeatureEffective } from "./tpa";
import { syncTrackDisplays } from "./trackDisplay";

const VIEW: ScopeViewSize = { widthPx: 800, heightPx: 800 };
const CATALOG_DIR = "src/scenario/data/kdem";

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
  fills: { count: number };
} {
  const pathStrokes: PathStroke[] = [];
  const fillTexts: FillText[] = [];
  const fills = { count: 0 };
  let currentPath: { x: number; y: number }[] = [];
  let currentFillStyle = "#FFFFFF";
  let currentStrokeStyle = "#FFFFFF";
  let currentLineWidth = 1;
  let currentFont = "12px monospace";

  const ctx = {
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
    fillRect() {},
    strokeRect() {},
    setTransform() {},
    measureText(text: string) {
      return { width: Math.max(0, text.length) * 7.2 };
    },
    moveTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    lineTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    stroke() {
      if (currentPath.length >= 2) {
        pathStrokes.push({
          points: currentPath.slice(),
          strokeStyle: currentStrokeStyle,
          lineWidth: currentLineWidth,
        });
      }
    },
    fill() {
      fills.count += 1;
    },
    fillText(text: string, x: number, y: number) {
      fillTexts.push({ text, x, y, fillStyle: currentFillStyle });
    },
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(val: string) {
      currentFillStyle = String(val);
    },
    get strokeStyle() {
      return currentStrokeStyle;
    },
    set strokeStyle(val: string) {
      currentStrokeStyle = String(val);
    },
    get lineWidth() {
      return currentLineWidth;
    },
    set lineWidth(val: number) {
      currentLineWidth = val;
    },
    get font() {
      return currentFont;
    },
    set font(val: string) {
      currentFont = val;
    },
    textBaseline: "alphabetic",
    textAlign: "start",
  };

  return { ctx: ctx as unknown as CanvasRenderingContext2D, pathStrokes, fillTexts, fills };
}

function memoryStorage(): DcbPrefStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

function kdemCatalog(): ProcedureCatalog {
  return loadCatalog(CATALOG_DIR);
}

function inboundPose(geometry: AtpaVolumeGeometry, alongNm: number) {
  const rad = ((geometry.courseDeg + 180) * Math.PI) / 180;
  return {
    xNm: geometry.xNm + alongNm * Math.sin(rad),
    yNm: geometry.yNm + alongNm * Math.cos(rad),
    headingDeg: geometry.courseDeg,
  };
}

interface FinalPairOpts {
  volumeId: "ATPA27" | "ATPA09";
  leaderAlongNm: number;
  trailerAlongNm: number;
  leaderSpeedKt: number;
  trailerSpeedKt: number;
  leaderWake?: string;
  trailerWake?: string;
}

function finalPairWorld(opts: FinalPairOpts): {
  world: World;
  catalog: ProcedureCatalog;
  geometry: AtpaVolumeGeometry;
  volume: ProcedureCatalog["atpaVolumes"][number];
  leader: ReturnType<typeof makeTestAircraft>;
  trailer: ReturnType<typeof makeTestAircraft>;
} {
  const catalog = kdemCatalog();
  const volume = catalog.atpaVolumes.find((row) => row.id === opts.volumeId);
  if (volume === undefined) {
    throw new Error(`KDEM catalog missing volume ${opts.volumeId}`);
  }
  const geometryById = resolveAtpaGeometry(catalog, catalog.atpaVolumes);
  const geometry = geometryById[opts.volumeId];
  if (geometry === undefined) {
    throw new Error(`resolveAtpaGeometry omitted ${opts.volumeId}`);
  }
  const leadPose = inboundPose(geometry, opts.leaderAlongNm);
  const trailPose = inboundPose(geometry, opts.trailerAlongNm);
  const leader = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: leadPose.xNm,
    yNm: leadPose.yNm,
    headingDeg: leadPose.headingDeg,
    altitudeFt: 3000,
    speedKt: opts.leaderSpeedKt,
    ...(opts.leaderWake !== undefined ? { wakeCategory: opts.leaderWake } : {}),
  });
  const trailer = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: trailPose.xNm,
    yNm: trailPose.yNm,
    headingDeg: trailPose.headingDeg,
    altitudeFt: 3000,
    speedKt: opts.trailerSpeedKt,
    ...(opts.trailerWake !== undefined ? { wakeCategory: opts.trailerWake } : {}),
  });
  const world = createWorld({
    aircraft: [leader, trailer],
    catalog,
    selectedAircraftId: trailer.id,
  });
  return { world, catalog, geometry, volume, leader, trailer };
}

function ownedView(world: World) {
  const view = createScopeView();
  view.camera.rangeNm = 40;
  view.historyEnabled = false;
  view.historyDotCount = 0;
  view.atpa.on = true;
  syncTrackDisplays(view.tracks, world);
  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    if (!td) {
      continue;
    }
    td.ownership = "owned";
    td.datablockMode = "full";
  }
  return view;
}

function paint(world: World, view: ReturnType<typeof createScopeView>) {
  const mock = createMockCtx();
  renderScope(mock.ctx, world, view, VIEW.widthPx, VIEW.heightPx);
  return mock;
}

function atpaConeStrokes(pathStrokes: PathStroke[]): PathStroke[] {
  return pathStrokes.filter(
    (s) =>
      s.points.length === 4 &&
      (s.strokeStyle === PALETTE.tools ||
        s.strokeStyle === PALETTE.atpaWarning ||
        s.strokeStyle === PALETTE.atpaAlert),
  );
}

function jRingStrokes(pathStrokes: PathStroke[]): PathStroke[] {
  return pathStrokes.filter((s) => s.strokeStyle === TPA_STROKE_COLOR && s.points.length >= 16);
}

function coneAxialNm(
  stroke: PathStroke,
  trailer: { xNm: number; yNm: number },
  view: ReturnType<typeof createScopeView>,
): number {
  const vertex = nmToScreen(trailer.xNm, trailer.yNm, view.camera, VIEW);
  const capMid = {
    x: (stroke.points[1]!.x + stroke.points[2]!.x) / 2,
    y: (stroke.points[1]!.y + stroke.points[2]!.y) / 2,
  };
  return Math.hypot(capMid.x - vertex.x, capMid.y - vertex.y) / pxPerNm(view.camera, VIEW);
}

function stepUntil(
  world: World,
  pred: (pair: AtpaPair | undefined) => boolean,
  maxSimS: number,
): AtpaPair {
  const steps = Math.ceil(maxSimS / SIM_DT_S);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, SIM_DT_S);
    const pair = world.alerts.atpa[0];
    if (pred(pair)) {
      return pair!;
    }
  }
  throw new Error(
    `predicate not met in ${maxSimS}s; last=${world.alerts.atpa[0]?.status} dist=${world.alerts.atpa[0]?.distanceNm}`,
  );
}

function dcbHtml(view: ReturnType<typeof createScopeView>): string {
  return renderToStaticMarkup(
    createElement(DisplayControlBar, { view, onChange: () => undefined }),
  );
}

function liveAtpaSources(): string {
  const files = import.meta.glob(
    [
      "../core/alerts/atpa.ts",
      "../core/world.ts",
      "./atpaCone.ts",
      "./atpaReadout.ts",
      "../scenario/atpaVolume.ts",
    ],
    { query: "?raw", import: "default", eager: true },
  ) as Record<string, string>;
  return Object.values(files).join("\n");
}

describe("TPA / ATPA integration and acceptance (T02-50)", () => {
  describe("AC1: end-to-end status progression on ILS 27", () => {
    test("two arrivals inside ATPA27 form one pair; frontmost has none; status walks monitor → warning → alert", () => {
      expect(ATPA_WARNING_S).toBe(45);
      expect(ATPA_ALERT_S).toBe(24);

      const { world, volume, geometry, leader, trailer } = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 180,
        trailerSpeedKt: 230,
      });
      expect(alongCourseDistanceNm(geometry, leader.xNm, leader.yNm)).toBeGreaterThan(
        volume.reducedWithinNm,
      );
      expect(alongCourseDistanceNm(geometry, trailer.xNm, trailer.yNm)).toBeGreaterThan(
        volume.reducedWithinNm,
      );

      stepWorld(world, 0);
      expect(world.alerts.atpa).toHaveLength(1);
      const initial = world.alerts.atpa[0]!;
      expect(initial.trailingCallsign).toBe("DAL123");
      expect(initial.leadingCallsign).toBe("AAL45");
      expect(initial.volumeId).toBe("ATPA27");
      expect(initial.requiredNm).toBe(volume.basicSeparationNm);
      expect(initial.requiredNm).not.toBe(volume.reducedSeparationNm);
      expect(initial.status).toBe("monitor");
      expect(world.alerts.atpa.some((pair) => pair.trailingCallsign === "AAL45")).toBe(false);

      const warned = stepUntil(world, (pair) => pair?.status === "warning", 90);
      expect(warned.status).toBe("warning");
      expect(warned.trailingCallsign).toBe("DAL123");
      expect(warned.requiredNm).toBe(volume.basicSeparationNm);

      const alerted = stepUntil(world, (pair) => pair?.status === "alert", 90);
      expect(alerted.status).toBe("alert");
      expect(alerted.trailingCallsign).toBe("DAL123");
      expect(world.alerts.atpa).toHaveLength(1);
      expect(alerted.distanceNm).toBeGreaterThanOrEqual(CA_LATERAL_NM);
      expect(world.alerts.ca).toEqual([]);

      const inside = stepUntil(
        world,
        (pair) => pair !== undefined && pair.distanceNm < CA_LATERAL_NM,
        90,
      );
      expect(inside.status).toBe("alert");
      expect(world.alerts.ca).toHaveLength(1);
      const view = ownedView(world);
      const mixed = paint(world, view);
      expect(mixed.fillTexts.find((t) => t.text === "CA")?.fillStyle).toBe(PALETTE.alert);
      expect(atpaConeStrokes(mixed.pathStrokes)[0]?.strokeStyle).toBe(PALETTE.atpaAlert);
      expect(mixed.pathStrokes.every((s) => s.strokeStyle !== PALETTE.alert)).toBe(true);
    });

    test("an opening or parallel pair never warns", () => {
      const opening = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 250,
        trailerSpeedKt: 180,
      });
      stepWorld(opening.world, 0);
      expect(opening.world.alerts.atpa[0]?.status).toBe("monitor");
      expect(opening.world.alerts.atpa[0]?.closureKt).toBeLessThan(0);
      for (let i = 0; i < Math.ceil(20 / SIM_DT_S); i += 1) {
        stepWorld(opening.world, SIM_DT_S);
        expect(opening.world.alerts.atpa[0]?.status).toBe("monitor");
      }

      const parallel = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 180,
        trailerSpeedKt: 180,
      });
      stepWorld(parallel.world, 0);
      expect(parallel.world.alerts.atpa[0]?.status).toBe("monitor");
      expect(parallel.world.alerts.atpa[0]?.closureKt).toBeCloseTo(0, 5);
      for (let i = 0; i < Math.ceil(10 / SIM_DT_S); i += 1) {
        stepWorld(parallel.world, SIM_DT_S);
        expect(parallel.world.alerts.atpa[0]?.status).toBe("monitor");
      }
    });
  });

  describe("AC2: cone strokes, colors, mileage, and fill", () => {
    test("monitor / warning / alert paint one unfilled wedge at the trailer; mileage is 3; PALETTE.alert unused", () => {
      const colors: [AtpaStatus, number, number, string][] = [
        ["monitor", 180, 180, PALETTE.tools],
        ["warning", 180, 270, PALETTE.atpaWarning],
        ["alert", 70, 250, PALETTE.atpaAlert],
      ];
      for (const [status, leadKt, trailKt, color] of colors) {
        const { world, trailer, volume } = finalPairWorld({
          volumeId: "ATPA27",
          leaderAlongNm: 11,
          trailerAlongNm: 15,
          leaderSpeedKt: leadKt,
          trailerSpeedKt: trailKt,
        });
        stepWorld(world, 0);
        expect(world.alerts.atpa[0]?.status, status).toBe(status);
        expect(world.alerts.atpa[0]?.requiredNm).toBe(volume.basicSeparationNm);

        const view = ownedView(world);
        const off = paint(world, view);
        view.atpa.on = false;
        const offPaint = paint(world, view);
        view.atpa.on = true;
        const on = paint(world, view);

        const cones = atpaConeStrokes(on.pathStrokes);
        expect(cones, status).toHaveLength(1);
        expect(cones[0]!.strokeStyle).toBe(color);
        expect(cones[0]!.strokeStyle).toBe(atpaConeColor(status));
        expect(cones[0]!.strokeStyle).not.toBe(PALETTE.alert);

        const vertex = nmToScreen(trailer.xNm, trailer.yNm, view.camera, VIEW);
        expect(cones[0]!.points[0]!.x).toBeCloseTo(vertex.x, 4);
        expect(cones[0]!.points[0]!.y).toBeCloseTo(vertex.y, 4);
        expect(coneAxialNm(cones[0]!, trailer, view)).toBeCloseTo(volume.basicSeparationNm, 3);

        const mileage = formatAtpaConeMileage(volume.basicSeparationNm);
        expect(mileage).toBe("3");
        expect(on.fillTexts.some((t) => t.text === mileage && t.fillStyle === color)).toBe(true);
        expect(on.fills.count).toBe(offPaint.fills.count);
        expect(atpaConeStrokes(offPaint.pathStrokes)).toHaveLength(0);
        expect(off.pathStrokes.every((s) => s.strokeStyle !== PALETTE.alert)).toBe(true);
      }
    });

    test("both tracks inside 10 DME use reducedSeparationNm from JSON; mileage is 2.5", () => {
      const { world, trailer, volume } = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 5,
        trailerAlongNm: 8,
        leaderSpeedKt: 180,
        trailerSpeedKt: 180,
      });
      stepWorld(world, 0);
      const pair = world.alerts.atpa[0]!;
      expect(pair.requiredNm).toBe(volume.reducedSeparationNm);
      expect(pair.requiredNm).not.toBe(volume.basicSeparationNm);
      expect(pair.status).toBe("monitor");

      const view = ownedView(world);
      const painted = paint(world, view);
      const cones = atpaConeStrokes(painted.pathStrokes);
      expect(cones).toHaveLength(1);
      expect(coneAxialNm(cones[0]!, trailer, view)).toBeCloseTo(volume.reducedSeparationNm, 3);
      expect(formatAtpaConeMileage(pair.requiredNm)).toBe("2.5");
      expect(painted.fillTexts.some((t) => t.text === "2.5" && t.fillStyle === PALETTE.tools)).toBe(
        true,
      );
    });
  });

  describe("AC3: datablock in-trail distance", () => {
    test("warning / alert paint two-decimal mileage on the trailer only; monitor omits it", () => {
      const warned = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 180,
        trailerSpeedKt: 270,
      });
      stepWorld(warned.world, 0);
      expect(warned.world.alerts.atpa[0]?.status).toBe("warning");
      const warnView = ownedView(warned.world);
      const warnPaint = paint(warned.world, warnView);
      const warnText = formatAtpaInTrailDistance(warned.world.alerts.atpa[0]!.distanceNm);
      expect(warnText).toMatch(/^\d+\.\d{2}$/);
      expect(warnPaint.fillTexts.find((t) => t.text === warnText)?.fillStyle).toBe(
        PALETTE.atpaWarning,
      );
      expect(warnPaint.fillTexts.find((t) => t.text === "DAL123")).toBeDefined();
      expect(warnPaint.fillTexts.find((t) => t.text === "AAL45")).toBeDefined();

      const alerted = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 70,
        trailerSpeedKt: 250,
      });
      stepWorld(alerted.world, 0);
      expect(alerted.world.alerts.atpa[0]?.status).toBe("alert");
      const alertView = ownedView(alerted.world);
      const alertPaint = paint(alerted.world, alertView);
      const alertText = formatAtpaInTrailDistance(alerted.world.alerts.atpa[0]!.distanceNm);
      expect(alertPaint.fillTexts.find((t) => t.text === alertText)?.fillStyle).toBe(
        PALETTE.atpaAlert,
      );
      expect(alertPaint.fillTexts.find((t) => t.text === alertText)?.fillStyle).not.toBe(
        PALETTE.alert,
      );

      const monitor = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 180,
        trailerSpeedKt: 180,
      });
      stepWorld(monitor.world, 0);
      expect(monitor.world.alerts.atpa[0]?.status).toBe("monitor");
      const monView = ownedView(monitor.world);
      const monPaint = paint(monitor.world, monView);
      const monDist = formatAtpaInTrailDistance(monitor.world.alerts.atpa[0]!.distanceNm);
      expect(monPaint.fillTexts.find((t) => t.text === monDist)).toBeUndefined();
    });
  });

  describe("AC4: DCB cells, PREF v2, and no Command IR", () => {
    test("master plus four cells each gate only their piece; PREF round-trips; v1 migrates", () => {
      expect(DEFAULT_ATPA_STATE).toEqual({
        on: false,
        inTrailDistance: true,
        coneMileage: true,
        alertCones: true,
        monitorCones: true,
      });

      const { world } = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 180,
        trailerSpeedKt: 270,
      });
      stepWorld(world, 0);
      expect(world.alerts.atpa[0]?.status).toBe("warning");
      const view = ownedView(world);

      applyDcbShift(view);
      openDcbMenu(view, "TPA_ATPA");
      const html = dcbHtml(view);
      expect(html).toMatch(/data-dcb-cell="atpa"/);
      expect(html).toMatch(/data-dcb-cell="atpa-mileage"/);
      expect(html).toMatch(/data-dcb-cell="atpa-intrail"/);
      expect(html).toMatch(/data-dcb-cell="atpa-alert"/);
      expect(html).toMatch(/data-dcb-cell="atpa-monitor"/);

      view.atpa.on = false;
      expect(atpaFeatureEffective(view.atpa, "coneMileage")).toBe(false);
      const masterOff = paint(world, view);
      expect(atpaConeStrokes(masterOff.pathStrokes)).toHaveLength(0);
      expect(masterOff.fillTexts.some((t) => t.text === "3")).toBe(false);
      const warnDist = formatAtpaInTrailDistance(world.alerts.atpa[0]!.distanceNm);
      expect(masterOff.fillTexts.find((t) => t.text === warnDist)).toBeUndefined();
      expect(world.alerts.atpa).toHaveLength(1);

      view.atpa.on = true;
      toggleAtpaConeMileage(view);
      expect(atpaFeatureEffective(view.atpa, "coneMileage")).toBe(false);
      expect(atpaFeatureEffective(view.atpa, "inTrailDistance")).toBe(true);
      const noMiles = paint(world, view);
      expect(atpaConeStrokes(noMiles.pathStrokes)).toHaveLength(1);
      expect(
        noMiles.fillTexts.some((t) => t.text === "3" && t.fillStyle === PALETTE.atpaWarning),
      ).toBe(false);

      toggleAtpaConeMileage(view);
      toggleAtpaInTrailDistance(view);
      expect(atpaFeatureEffective(view.atpa, "inTrailDistance")).toBe(false);
      const noTrail = paint(world, view);
      expect(noTrail.fillTexts.find((t) => t.text === warnDist)).toBeUndefined();
      expect(atpaConeStrokes(noTrail.pathStrokes)).toHaveLength(1);

      toggleAtpaInTrailDistance(view);
      toggleAtpaAlertCones(view);
      expect(atpaFeatureEffective(view.atpa, "alertCones")).toBe(false);
      const noAlert = paint(world, view);
      expect(atpaConeStrokes(noAlert.pathStrokes)).toHaveLength(0);

      toggleAtpaAlertCones(view);
      const monitorWorld = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 180,
        trailerSpeedKt: 180,
      });
      stepWorld(monitorWorld.world, 0);
      const monView = ownedView(monitorWorld.world);
      toggleAtpaMonitorCones(monView);
      expect(atpaFeatureEffective(monView.atpa, "monitorCones")).toBe(false);
      const noMon = paint(monitorWorld.world, monView);
      expect(atpaConeStrokes(noMon.pathStrokes)).toHaveLength(0);
      toggleAtpaMonitorCones(monView);
      const monOn = paint(monitorWorld.world, monView);
      expect(atpaConeStrokes(monOn.pathStrokes)[0]?.strokeStyle).toBe(PALETTE.tools);

      const store = memoryStorage();
      view.dcbPref.icao = "KDEM";
      view.atpa.on = true;
      view.atpa.inTrailDistance = false;
      view.atpa.coneMileage = false;
      view.atpa.alertCones = false;
      view.atpa.monitorCones = true;
      saveDcbPref(view, store);
      const saved = JSON.parse(store.getItem(dcbPrefStorageKey("KDEM"))!) as {
        v: number;
        slots: Array<{ body: { atpa: unknown } } | null>;
      };
      expect(saved.v).toBe(DCB_PREF_SCHEMA_VERSION);
      expect(DCB_PREF_SCHEMA_VERSION).toBe(2);
      expect(saved.slots[0]?.body.atpa).toEqual({
        on: true,
        inTrailDistance: false,
        coneMileage: false,
        alertCones: false,
        monitorCones: true,
      });

      const reloaded = createScopeView();
      loadDcbPrefFromStorage(reloaded, "KDEM", store);
      expect(reloaded.atpa).toEqual({
        on: true,
        inTrailDistance: false,
        coneMileage: false,
        alertCones: false,
        monitorCones: true,
      });

      saved.v = 1;
      saved.slots[0]!.body.atpa = { on: true };
      store.setItem(dcbPrefStorageKey("KDEM"), JSON.stringify(saved));
      const migrated = createScopeView();
      expect(() => loadDcbPrefFromStorage(migrated, "KDEM", store)).not.toThrow();
      expect(migrated.atpa).toEqual({
        on: true,
        inTrailDistance: true,
        coneMileage: true,
        alertCones: true,
        monitorCones: true,
      });
      expect(parseDcbPrefJson(store.getItem(dcbPrefStorageKey("KDEM")), "KDEM").v).toBe(2);
      expect(serializeDcbPref(migrated).atpa).toEqual(migrated.atpa);
    });

    test("DCB and * chords never emit Command IR; DAL123 H270 still turns", async () => {
      const { world, trailer } = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 180,
        trailerSpeedKt: 180,
      });
      const view = ownedView(world);
      const log = new SessionLog();
      toggleAtpaOn(view);
      toggleAtpaConeMileage(view);
      toggleAtpaInTrailDistance(view);
      toggleAtpaAlertCones(view);
      toggleAtpaMonitorCones(view);
      const parsed = parseStarsChord("*J3");
      expect(parsed.kind).toBe("action");
      if (parsed.kind === "action") {
        expect(applyStarsChordAction(view, world, parsed.action)).toBe("applied");
      }
      expect(log.byType("command.accepted")).toHaveLength(0);
      expect(log.byType("command.rejected")).toHaveLength(0);
      trailer.headingDeg = 90;
      trailer.intent.assignedHeadingDeg = 90;
      expect(trailer.intent.assignedHeadingDeg).not.toBe(270);

      const result = await handleRadioText(world, "DAL123 H270", log);
      expect(result.accepted).toBe(true);
      expect(trailer.intent.assignedHeadingDeg).toBe(270);
      expect(log.byType("command.accepted")).toHaveLength(1);

      const bar = (
        import.meta.glob("../ui/DisplayControlBar.tsx", {
          query: "?raw",
          import: "default",
          eager: true,
        }) as Record<string, string>
      )["../ui/DisplayControlBar.tsx"]!;
      expect(bar).not.toMatch(/handleRadioText|submitCommand|parseRadioText/);
      expect(bar).toMatch(/Never a Command/);
    });
  });

  describe("AC5: *J3 beside ATPA, *P suppression, CA untouched", () => {
    test("*J3 still paints under an ATPA cone; *P is suppressed only on warning/alert", () => {
      const { world, trailer } = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 180,
        trailerSpeedKt: 270,
      });
      stepWorld(world, 0);
      expect(world.alerts.atpa[0]?.status).toBe("warning");
      expect(atpaSuppressesManualTpaCone("warning")).toBe(true);
      expect(atpaSuppressesManualTpaCone("alert")).toBe(true);
      expect(atpaSuppressesManualTpaCone("monitor")).toBe(false);

      const view = ownedView(world);
      const j3 = parseStarsChord("*J3");
      const p5 = parseStarsChord("*P5");
      expect(j3.kind).toBe("action");
      expect(p5.kind).toBe("action");
      if (j3.kind === "action") {
        expect(applyStarsChordAction(view, world, j3.action)).toBe("applied");
      }
      if (p5.kind === "action") {
        expect(applyStarsChordAction(view, world, p5.action)).toBe("applied");
      }
      expect(view.tracks.get(trailer.id)?.tpaRingNm).toBe(3);
      expect(view.tracks.get(trailer.id)?.tpaConeNm).toBe(5);

      const warning = paint(world, view);
      expect(jRingStrokes(warning.pathStrokes)).toHaveLength(1);
      expect(atpaConeStrokes(warning.pathStrokes)).toHaveLength(1);
      expect(atpaConeStrokes(warning.pathStrokes)[0]!.strokeStyle).toBe(PALETTE.atpaWarning);
      const warningManual = warning.pathStrokes.filter(
        (s) => s.strokeStyle === TPA_STROKE_COLOR && s.points.length === 4,
      );
      expect(warningManual).toHaveLength(0);
      expect(warning.pathStrokes.every((s) => s.strokeStyle !== PALETTE.alert)).toBe(true);

      trailer.speedKt = 180;
      trailer.intent.assignedSpeedKt = 180;
      const lead = world.aircraft.find((ac) => ac.callsign === "AAL45")!;
      lead.speedKt = 180;
      lead.intent.assignedSpeedKt = 180;
      stepWorld(world, 0);
      expect(world.alerts.atpa[0]?.status).toBe("monitor");
      const monitor = paint(world, view);
      expect(jRingStrokes(monitor.pathStrokes)).toHaveLength(1);
      expect(
        monitor.pathStrokes.filter(
          (s) => s.points.length === 4 && s.strokeStyle === TPA_STROKE_COLOR,
        ).length,
      ).toBeGreaterThanOrEqual(1);
    });

    test("conflict alert still has CA text plus tone and no 3 NM halo; ATPA orange is not CA red", () => {
      const dal = makeTestAircraft({
        id: "ac-dal",
        callsign: "DAL123",
        xNm: 0,
        yNm: 0,
        headingDeg: 90,
        altitudeFt: 8000,
        speedKt: 250,
      });
      const aal = makeTestAircraft({
        id: "ac-aal",
        callsign: "AAL45",
        xNm: 2,
        yNm: 0,
        headingDeg: 90,
        altitudeFt: 8000,
        speedKt: 250,
      });
      const world = createWorld({ aircraft: [dal, aal], catalog: kdemCatalog() });
      stepWorld(world, 0);
      expect(world.alerts.ca).toHaveLength(1);
      expect(world.alerts.ca[0]?.distNm).toBeLessThan(CA_LATERAL_NM);
      expect(world.alerts.atpa).toEqual([]);

      const view = ownedView(world);
      const painted = paint(world, view);
      expect(painted.fillTexts.find((t) => t.text === "CA")?.fillStyle).toBe(PALETTE.alert);
      expect(jRingStrokes(painted.pathStrokes)).toHaveLength(0);
      expect(painted.pathStrokes.filter((s) => s.strokeStyle === PALETTE.alert)).toHaveLength(0);

      const tone = createCaAlertTone({ getAudioContext: () => null });
      expect(() => tone.sync(world.alerts.ca.length > 0)).not.toThrow();
      tone.dispose();

      const appSrc = (
        import.meta.glob("../app/create-app.ts", {
          query: "?raw",
          import: "default",
          eager: true,
        }) as Record<string, string>
      )["../app/create-app.ts"]!;
      expect(appSrc).toMatch(/caAlertTone\.sync\(world\.alerts\.ca\.length > 0\)/);
      expect(liveAtpaSources()).not.toMatch(/createCaAlertTone|ca-alert-tone/);
    });
  });

  describe("AC6: RW09 data-first parity, wake independence, minima from JSON", () => {
    test("the same helper on ATPA09 matches RW27 pairing, status, cones, and datablock readout", () => {
      const run = (volumeId: "ATPA27" | "ATPA09") => {
        const { world, volume, trailer } = finalPairWorld({
          volumeId,
          leaderAlongNm: 11,
          trailerAlongNm: 15,
          leaderSpeedKt: 180,
          trailerSpeedKt: 270,
        });
        stepWorld(world, 0);
        const pair = world.alerts.atpa[0]!;
        const view = ownedView(world);
        const painted = paint(world, view);
        const cones = atpaConeStrokes(painted.pathStrokes);
        return {
          volumeId: pair.volumeId,
          status: pair.status,
          requiredNm: pair.requiredNm,
          trailing: pair.trailingCallsign,
          leading: pair.leadingCallsign,
          jsonBasic: volume.basicSeparationNm,
          jsonReduced: volume.reducedSeparationNm,
          jsonWithin: volume.reducedWithinNm,
          coneColor: cones[0]?.strokeStyle,
          coneCount: cones.length,
          coneLengthNm: cones[0] ? coneAxialNm(cones[0], trailer, view) : NaN,
          inTrail: painted.fillTexts.find(
            (t) => t.text === formatAtpaInTrailDistance(pair.distanceNm),
          )?.fillStyle,
        };
      };

      const rwy27 = run("ATPA27");
      const rwy09 = run("ATPA09");
      expect(rwy27.volumeId).toBe("ATPA27");
      expect(rwy09.volumeId).toBe("ATPA09");
      expect(rwy09.status).toBe(rwy27.status);
      expect(rwy09.requiredNm).toBe(rwy27.requiredNm);
      expect(rwy09.trailing).toBe(rwy27.trailing);
      expect(rwy09.leading).toBe(rwy27.leading);
      expect(rwy09.jsonBasic).toBe(rwy27.jsonBasic);
      expect(rwy09.jsonReduced).toBe(rwy27.jsonReduced);
      expect(rwy09.jsonWithin).toBe(rwy27.jsonWithin);
      expect(rwy09.coneColor).toBe(rwy27.coneColor);
      expect(rwy09.coneCount).toBe(1);
      expect(rwy27.coneCount).toBe(1);
      expect(rwy09.coneLengthNm).toBeCloseTo(rwy27.coneLengthNm, 3);
      expect(rwy09.inTrail).toBe(rwy27.inTrail);
      expect(rwy09.inTrail).toBe(PALETTE.atpaWarning);
    });

    test("heavy vs light leader: identical requiredNm and cone length; engine never reads wakeCategory", () => {
      const light = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 180,
        trailerSpeedKt: 180,
        leaderWake: "L",
      });
      const heavy = finalPairWorld({
        volumeId: "ATPA27",
        leaderAlongNm: 11,
        trailerAlongNm: 15,
        leaderSpeedKt: 180,
        trailerSpeedKt: 180,
        leaderWake: "H",
      });
      stepWorld(light.world, 0);
      stepWorld(heavy.world, 0);
      expect(light.world.alerts.atpa[0]?.requiredNm).toBe(heavy.world.alerts.atpa[0]?.requiredNm);
      expect(light.world.alerts.atpa[0]?.requiredNm).toBe(light.volume.basicSeparationNm);

      const lightView = ownedView(light.world);
      const heavyView = ownedView(heavy.world);
      const lightCone = atpaConeStrokes(paint(light.world, lightView).pathStrokes)[0]!;
      const heavyCone = atpaConeStrokes(paint(heavy.world, heavyView).pathStrokes)[0]!;
      expect(coneAxialNm(lightCone, light.trailer, lightView)).toBeCloseTo(
        coneAxialNm(heavyCone, heavy.trailer, heavyView),
        5,
      );

      const engine = (
        import.meta.glob("../core/alerts/atpa.ts", {
          query: "?raw",
          import: "default",
          eager: true,
        }) as Record<string, string>
      )["../core/alerts/atpa.ts"]!;
      expect(engine.length).toBeGreaterThan(500);
      expect(engine).toMatch(/volume\.basicSeparationNm/);
      expect(engine).toMatch(/volume\.reducedSeparationNm/);
      expect(engine).toMatch(/volume\.reducedWithinNm/);
      expect(engine).not.toMatch(/\b2\.5\b/);
      expect(engine).not.toMatch(/requiredNm\s*=\s*3\b/);
      expect(engine).not.toMatch(/wakeCategory/);
      const live = liveAtpaSources();
      expect(live).toMatch(/evaluateAtpa/);
      expect(live).not.toMatch(/wakeCategory/);
      expect(live).not.toMatch(/airportId\s*===/);
      expect(live).not.toMatch(/if\s*\(\s*(airportId|runwayId|runway)\s*===/);
    });
  });
});
