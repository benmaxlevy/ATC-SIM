/**
 * Analog: CRC STARS MAPS / video maps / range rings (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: KDEM trainer-authored JSON only (runway, localizer feather,
 * generated **range rings** at RR 2/5/10 NM). Default origin is airport ref;
 * PLACE RR moves the origin in world NM (RR CNTR snaps it to view **center**).
 * MAPS visibility is per catalog id. Not OSM / tiles (R12). Not NAS STARS.
 *
 * Scope never emits Command IR. Geometry is NM east/north of ARP + camera.
 */

import { normalizeHeadingDeg } from "@core";
import type {
  DigitalMapCoastline,
  DigitalMapLocalizer,
  DigitalMapRangeRings,
  DigitalMapRunway,
  LoadedVideoMap,
  ScenarioMaps,
  VideoMapGroupSet,
} from "@scenario";
import { nmToScreen, pxPerNm, type ScopeCamera, type ScopeViewSize } from "./camera";
import {
  generateCompassRoseGeometry,
  type CompassRoseGeometry,
  type CompassRoseLabel,
} from "./compassRose";

export interface NmPoint {
  eastNm: number;
  northNm: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface DigitalMap {
  runway?: DigitalMapRunway;
  localizer?: DigitalMapLocalizer;
  rangeRings: DigitalMapRangeRings;
  coastline?: DigitalMapCoastline;
  loadedVideoMaps?: LoadedVideoMap[];
  /** DCB group layout when `video-maps/<ICAO>/groups.json` loaded. Not identity. */
  videoMapGroups?: VideoMapGroupSet;
}

export interface MapLayerFlags {
  showRunway: boolean;
  showLocalizer: boolean;
  showRings: boolean;
  showCoastline: boolean;
  showCompassRose?: boolean;
}

export interface MapCacheView {
  camera: ScopeCamera;
  digitalMap: DigitalMap;
  showRunway: boolean;
  showLocalizer: boolean;
  showRings: boolean;
  showCoastline: boolean;
  showCompassRose?: boolean;
  airportEastNm: number;
  airportNorthNm: number;
  mapVisibility?: ReadonlyMap<string, boolean>;
  ringIntervalNm?: number;
  /** Rebuild map cache when MPA / MPB / RR BRITE change (T02-26). */
  brite?: { mpa: number; mpb: number; rr: number };
  briteMpa?: number;
  briteMpb?: number;
  briteRr?: number;
  rangeRingEastNm?: number;
  rangeRingNorthNm?: number;
}

export interface MapCacheInput {
  digitalMap: DigitalMap;
  camera: ScopeCamera;
  viewSize: ScopeViewSize;
  layers: MapLayerFlags;
  airportEastNm: number;
  airportNorthNm: number;
  mapVisibility?: ReadonlyMap<string, boolean>;
  ringIntervalNm: number;
  briteMpa?: number;
  briteMpb?: number;
  briteRr?: number;
  /** World origin of **range rings**. Defaults to airport ref. */
  rangeRingEastNm?: number;
  rangeRingNorthNm?: number;
}

export interface MapCache {
  key: string;
  ringRadiiNm: number[];
  ringCircles: { x: number; y: number; radiusPx: number }[];
  coastline: ScreenPoint[] | null;
  runway: ScreenPoint[] | null;
  localizer: ScreenPoint[] | null;
  /** Every visible localizer feather (LOC27, LOC09, …). `localizer` is the first. */
  localizers: ScreenPoint[][];
  runwayLabels: { text: string; x: number; y: number }[];
  videoStrokes: {
    mapId: string;
    color: "map" | "mapDim";
    closed: boolean;
    points: ScreenPoint[];
  }[];
  videoLabels: { mapId: string; text: string; x: number; y: number; color: "map" | "mapDim" }[];
  ringsPath: Path2D | null;
  coastlinePath: Path2D | null;
  runwayPath: Path2D | null;
  localizerPath: Path2D | null;
  compassRose: CompassRoseGeometry | null;
  compassRosePath: Path2D | null;
  compassRoseLabels: CompassRoseLabel[];
}

export const DEFAULT_RANGE_RINGS: DigitalMapRangeRings = { intervalNm: 5, maxNm: 60 };

export const DEFAULT_DIGITAL_MAP: DigitalMap = {
  rangeRings: DEFAULT_RANGE_RINGS,
  loadedVideoMaps: [],
};

export const DEFAULT_MAP_LAYER_FLAGS: MapLayerFlags = {
  showRunway: true,
  showLocalizer: true,
  showRings: true,
  showCoastline: false,
  showCompassRose: true,
};

export const FEATHER_NM_TOLERANCE = 0.05;

let missingRunwayWarned = false;

export function resetDigitalMapWarnings(): void {
  missingRunwayWarned = false;
}

/**
 * Pull map geometry from scenario JSON. Missing runway warns once and still
 * yields range-ring defaults so the tick can boot.
 */
export function parseDigitalMap(maps: Partial<ScenarioMaps>): DigitalMap {
  if (!maps.runway && !missingRunwayWarned) {
    console.warn("Digital map missing runway; drawing range rings only");
    missingRunwayWarned = true;
  }
  return {
    runway: maps.runway,
    localizer: maps.localizer,
    rangeRings: maps.rangeRings ?? DEFAULT_RANGE_RINGS,
    coastline: maps.coastline,
    loadedVideoMaps: maps.loadedVideoMaps ?? [],
    ...(maps.videoMapGroups !== undefined ? { videoMapGroups: maps.videoMapGroups } : {}),
  };
}

export function headingOffsetNm(
  eastNm: number,
  northNm: number,
  headingTrueDeg: number,
  distanceNm: number,
): NmPoint {
  const rad = (normalizeHeadingDeg(headingTrueDeg) * Math.PI) / 180;
  return {
    eastNm: eastNm + distanceNm * Math.sin(rad),
    northNm: northNm + distanceNm * Math.cos(rad),
  };
}

/**
 * Localizer feather as an isosceles triangle in NM.
 * Apex = rwy threshold. Far corners lie `featherLengthNm` along the *approach*
 * radial (inbound course + 180°) ± halfWidthDeg.
 * ILS 27: inbound 270, feather east along 090 ± 2.5°.
 * ILS 09: inbound 090, feather west along 270 ± 2.5° from the RWY 09 threshold.
 */
export function buildLocalizerFeather(
  runway: DigitalMapRunway,
  loc: DigitalMapLocalizer,
): [NmPoint, NmPoint, NmPoint] {
  const apex: NmPoint = {
    eastNm: runway.thresholdEastNm,
    northNm: runway.thresholdNorthNm,
  };
  const approachRadial = normalizeHeadingDeg(loc.courseTrueDeg + 180);
  const left = headingOffsetNm(
    apex.eastNm,
    apex.northNm,
    approachRadial - loc.halfWidthDeg,
    loc.featherLengthNm,
  );
  const right = headingOffsetNm(
    apex.eastNm,
    apex.northNm,
    approachRadial + loc.halfWidthDeg,
    loc.featherLengthNm,
  );
  return [apex, left, right];
}

export function nmDistance(a: NmPoint, b: NmPoint): number {
  return Math.hypot(a.eastNm - b.eastNm, a.northNm - b.northNm);
}

export function activeRingRadiiNm(
  rangeNmOrRings: number | DigitalMapRangeRings = DEFAULT_RANGE_RINGS,
  maybeRings?: DigitalMapRangeRings,
): number[] {
  let rings: DigitalMapRangeRings;
  if (typeof rangeNmOrRings === "object") {
    rings = rangeNmOrRings;
  } else if (maybeRings) {
    rings = maybeRings;
  } else {
    rings = { ...DEFAULT_RANGE_RINGS, maxNm: rangeNmOrRings };
  }
  const interval = rings.intervalNm;
  const max = rings.maxNm;
  if (!(interval > 0) || !(max > 0)) {
    return [];
  }
  const radii: number[] = [];
  for (let rNm = interval; rNm <= max + 1e-9; rNm += interval) {
    radii.push(rNm);
  }
  return radii;
}

export function buildRunwayCorners(runway: DigitalMapRunway): [NmPoint, NmPoint, NmPoint, NmPoint] {
  const half = runway.widthNm / 2;
  const alongFar = headingOffsetNm(
    runway.thresholdEastNm,
    runway.thresholdNorthNm,
    runway.headingTrueDeg,
    runway.lengthNm,
  );
  const rightThresh = headingOffsetNm(
    runway.thresholdEastNm,
    runway.thresholdNorthNm,
    runway.headingTrueDeg + 90,
    half,
  );
  const leftThresh = headingOffsetNm(
    runway.thresholdEastNm,
    runway.thresholdNorthNm,
    runway.headingTrueDeg - 90,
    half,
  );
  const rightFar = headingOffsetNm(
    alongFar.eastNm,
    alongFar.northNm,
    runway.headingTrueDeg + 90,
    half,
  );
  const leftFar = headingOffsetNm(
    alongFar.eastNm,
    alongFar.northNm,
    runway.headingTrueDeg - 90,
    half,
  );
  return [rightThresh, rightFar, leftFar, leftThresh];
}

export function toMapCacheInput(view: MapCacheView, viewSize: ScopeViewSize): MapCacheInput {
  return {
    digitalMap: view.digitalMap,
    camera: view.camera,
    viewSize,
    layers: {
      showRunway: view.showRunway,
      showLocalizer: view.showLocalizer,
      showRings: view.showRings,
      showCoastline: view.showCoastline,
      showCompassRose: view.showCompassRose !== false,
    },
    airportEastNm: view.airportEastNm,
    airportNorthNm: view.airportNorthNm,
    mapVisibility: view.mapVisibility,
    ringIntervalNm: view.ringIntervalNm ?? view.digitalMap.rangeRings.intervalNm,
    briteMpa: view.brite?.mpa ?? view.briteMpa,
    briteMpb: view.brite?.mpb ?? view.briteMpb,
    briteRr: view.brite?.rr ?? view.briteRr,
    rangeRingEastNm: view.rangeRingEastNm ?? view.airportEastNm,
    rangeRingNorthNm: view.rangeRingNorthNm ?? view.airportNorthNm,
  };
}

function visibilityKey(
  maps: LoadedVideoMap[],
  visibility: ReadonlyMap<string, boolean> | undefined,
): string {
  return maps.map((map) => ((visibility?.get(map.id) ?? map.defaultOn) ? "1" : "0")).join("");
}

export function buildMapCacheKey(input: MapCacheInput): string {
  const { camera: cam, viewSize, layers } = input;
  return [
    cam.rangeNm,
    cam.centerEastNm,
    cam.centerNorthNm,
    viewSize.widthPx,
    viewSize.heightPx,
    layers.showRunway ? 1 : 0,
    layers.showLocalizer ? 1 : 0,
    layers.showRings ? 1 : 0,
    layers.showCoastline ? 1 : 0,
    layers.showCompassRose !== false ? 1 : 0,
    input.airportEastNm,
    input.airportNorthNm,
    input.ringIntervalNm,
    input.briteMpa ?? "",
    input.briteMpb ?? "",
    input.briteRr ?? "",
    input.rangeRingEastNm ?? input.airportEastNm,
    input.rangeRingNorthNm ?? input.airportNorthNm,
    visibilityKey(input.digitalMap.loadedVideoMaps ?? [], input.mapVisibility),
  ].join("|");
}

function project(point: NmPoint, cam: ScopeCamera, view: ScopeViewSize): ScreenPoint {
  return nmToScreen(point.eastNm, point.northNm, cam, view);
}

function addPolylineToPath(path: Path2D, pts: ScreenPoint[], close: boolean): void {
  const first = pts[0];
  if (!first) {
    return;
  }
  path.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i += 1) {
    const pt = pts[i]!;
    path.lineTo(pt.x, pt.y);
  }
  if (close) {
    path.closePath();
  }
}

function pathFromPolyline(pts: ScreenPoint[], close: boolean): Path2D | null {
  if (typeof Path2D !== "function" || pts.length < 2) {
    return null;
  }
  const path = new Path2D();
  addPolylineToPath(path, pts, close);
  return path;
}

function pathFromClosedShapes(shapes: ScreenPoint[][]): Path2D | null {
  if (typeof Path2D !== "function") {
    return null;
  }
  const usable = shapes.filter((pts) => pts.length >= 2);
  if (usable.length === 0) {
    return null;
  }
  const path = new Path2D();
  for (const pts of usable) {
    addPolylineToPath(path, pts, true);
  }
  return path;
}

function pathFromRings(circles: MapCache["ringCircles"]): Path2D | null {
  if (typeof Path2D !== "function" || circles.length === 0) {
    return null;
  }
  const path = new Path2D();
  for (const circle of circles) {
    path.moveTo(circle.x + circle.radiusPx, circle.y);
    path.arc(circle.x, circle.y, circle.radiusPx, 0, Math.PI * 2);
  }
  return path;
}

function pathFromCompassRose(rose: CompassRoseGeometry | null): Path2D | null {
  if (typeof Path2D !== "function" || !rose) {
    return null;
  }
  const path = new Path2D();
  const { minX, minY, maxX, maxY } = rose.bounds;
  path.moveTo(minX, minY);
  path.lineTo(maxX, minY);
  path.lineTo(maxX, maxY);
  path.lineTo(minX, maxY);
  path.closePath();

  for (const tick of rose.ticks) {
    path.moveTo(tick.x1, tick.y1);
    path.lineTo(tick.x2, tick.y2);
  }
  return path;
}

function coastlineScreenPoints(
  coast: DigitalMapCoastline | undefined,
  cam: ScopeCamera,
  view: ScopeViewSize,
): ScreenPoint[] | null {
  if (!coast || !coast.enabled || coast.polyline.length < 2) {
    return null;
  }
  return coast.polyline.map(([eastNm, northNm]) => project({ eastNm, northNm }, cam, view));
}

function runwayLabelPoint(
  runway: DigitalMapRunway,
  cam: ScopeCamera,
  view: ScopeViewSize,
): ScreenPoint {
  const mid = headingOffsetNm(
    runway.thresholdEastNm,
    runway.thresholdNorthNm,
    runway.headingTrueDeg,
    runway.lengthNm / 2,
  );
  const screen = project(mid, cam, view);
  return { x: screen.x, y: screen.y + 10 };
}

function digitalRunwayFromVideo(
  maps: LoadedVideoMap[],
  runwayId: string,
  fallback: DigitalMapRunway | undefined,
): DigitalMapRunway | undefined {
  for (const map of maps) {
    if (map.role !== "runway") {
      continue;
    }
    for (const feature of map.features) {
      if (feature.type === "runway" && feature.id === runwayId) {
        return {
          id: feature.id,
          thresholdEastNm: feature.thresholdNm[0],
          thresholdNorthNm: feature.thresholdNm[1],
          lengthNm: feature.lengthNm,
          headingTrueDeg: feature.headingTrueDeg,
          widthNm: feature.widthNm,
        };
      }
    }
  }
  return fallback?.id === runwayId ? fallback : undefined;
}

function visibleLocalizerFeathersNm(
  maps: LoadedVideoMap[],
  visibility: ReadonlyMap<string, boolean> | undefined,
  fallbackRunway: DigitalMapRunway | undefined,
  fallbackLoc: DigitalMapLocalizer | undefined,
): [NmPoint, NmPoint, NmPoint][] {
  const feathers: [NmPoint, NmPoint, NmPoint][] = [];
  let sawLocalizerMap = false;
  for (const map of maps) {
    if (map.role !== "localizer") {
      continue;
    }
    sawLocalizerMap = true;
    if (!isExtraMapOn(map, visibility)) {
      continue;
    }
    for (const feature of map.features) {
      if (feature.type !== "localizerFeather") {
        continue;
      }
      const runway = digitalRunwayFromVideo(maps, feature.runwayId, fallbackRunway);
      if (!runway) {
        continue;
      }
      feathers.push(
        buildLocalizerFeather(runway, {
          runwayId: feature.runwayId,
          courseTrueDeg: feature.courseTrueDeg,
          featherLengthNm: feature.featherLengthNm,
          halfWidthDeg: feature.halfWidthDeg,
        }),
      );
    }
  }
  if (!sawLocalizerMap && fallbackRunway && fallbackLoc) {
    feathers.push(buildLocalizerFeather(fallbackRunway, fallbackLoc));
  }
  return feathers;
}

function runwayEndLabels(
  maps: LoadedVideoMap[],
  fallback: DigitalMapRunway | undefined,
  cam: ScopeCamera,
  view: ScopeViewSize,
): MapCache["runwayLabels"] {
  const labels: MapCache["runwayLabels"] = [];
  for (const map of maps) {
    if (map.role !== "runway") {
      continue;
    }
    for (const feature of map.features) {
      if (feature.type !== "runway") {
        continue;
      }
      const screen = project(
        { eastNm: feature.thresholdNm[0], northNm: feature.thresholdNm[1] },
        cam,
        view,
      );
      labels.push({ text: feature.label, x: screen.x, y: screen.y + 10 });
    }
  }
  if (labels.length > 0) {
    return labels;
  }
  if (fallback) {
    return [{ text: fallback.id, ...runwayLabelPoint(fallback, cam, view) }];
  }
  return [];
}

let mapCacheBuildCount = 0;

/** Spy for T02-12: increments only when Path2D/geo is rebuilt, not on reuse. */
export function getMapCacheBuildCount(): number {
  return mapCacheBuildCount;
}

export function resetMapCacheBuildCount(): void {
  mapCacheBuildCount = 0;
}

function isExtraMapOn(
  map: LoadedVideoMap,
  visibility: ReadonlyMap<string, boolean> | undefined,
): boolean {
  return visibility?.get(map.id) ?? map.defaultOn;
}

/**
 * Loader already rejects empty polylines. Cache still drops <2 finite points
 * so in-memory / slipped features never reach canvas stroke.
 */
function projectDrawablePolyline(
  pointsNm: [number, number][],
  cam: ScopeCamera,
  view: ScopeViewSize,
): ScreenPoint[] | null {
  if (pointsNm.length < 2) {
    return null;
  }
  const points: ScreenPoint[] = [];
  for (const pair of pointsNm) {
    const eastNm = pair[0];
    const northNm = pair[1];
    if (!Number.isFinite(eastNm) || !Number.isFinite(northNm)) {
      continue;
    }
    points.push(project({ eastNm, northNm }, cam, view));
  }
  return points.length >= 2 ? points : null;
}

function isDrawableText(text: string, atNm: [number, number]): boolean {
  return text.length > 0 && Number.isFinite(atNm[0]) && Number.isFinite(atNm[1]);
}

/** Extra default-on MAPS polylines (no role) — dimmer than runway/loc. Not OSM. */
function extraVideoStrokes(
  maps: LoadedVideoMap[],
  cam: ScopeCamera,
  view: ScopeViewSize,
  visibility: ReadonlyMap<string, boolean> | undefined,
): MapCache["videoStrokes"] {
  const strokes: MapCache["videoStrokes"] = [];
  for (const map of maps) {
    if (map.role !== undefined || !isExtraMapOn(map, visibility)) {
      continue;
    }
    for (const feature of map.features) {
      if (feature.type !== "polyline") {
        continue;
      }
      const points = projectDrawablePolyline(feature.pointsNm, cam, view);
      if (!points) {
        continue;
      }
      strokes.push({
        mapId: map.id,
        color: map.color,
        closed: feature.closed,
        points,
      });
    }
  }
  return strokes;
}

function extraVideoLabels(
  maps: LoadedVideoMap[],
  cam: ScopeCamera,
  view: ScopeViewSize,
  visibility: ReadonlyMap<string, boolean> | undefined,
): MapCache["videoLabels"] {
  const labels: MapCache["videoLabels"] = [];
  for (const map of maps) {
    if (map.role !== undefined || !isExtraMapOn(map, visibility)) {
      continue;
    }
    for (const feature of map.features) {
      if (feature.type !== "text" || !isDrawableText(feature.text, feature.atNm)) {
        continue;
      }
      const screen = project({ eastNm: feature.atNm[0], northNm: feature.atNm[1] }, cam, view);
      labels.push({
        mapId: map.id,
        text: feature.text,
        x: screen.x,
        y: screen.y,
        color: map.color,
      });
    }
  }
  return labels;
}

export function buildMapCache(
  input: MapCacheInput,
  key: string = buildMapCacheKey(input),
): MapCache {
  mapCacheBuildCount += 1;
  const { digitalMap, camera, viewSize, layers, airportEastNm, airportNorthNm } = input;
  const rings = {
    intervalNm: input.ringIntervalNm,
    maxNm: digitalMap.rangeRings.maxNm,
  };
  const ringRadiiNm = layers.showRings ? activeRingRadiiNm(rings) : [];
  const ringEastNm = input.rangeRingEastNm ?? airportEastNm;
  const ringNorthNm = input.rangeRingNorthNm ?? airportNorthNm;
  const ringOriginScreen = nmToScreen(ringEastNm, ringNorthNm, camera, viewSize);
  const scale = pxPerNm(camera, viewSize);
  const ringCircles = ringRadiiNm.map((radiusNm) => ({
    x: ringOriginScreen.x,
    y: ringOriginScreen.y,
    radiusPx: radiusNm * scale,
  }));

  let runway: ScreenPoint[] | null = null;
  let runwayLabels: MapCache["runwayLabels"] = [];
  if (layers.showRunway && digitalMap.runway) {
    runway = buildRunwayCorners(digitalMap.runway).map((pt) => project(pt, camera, viewSize));
    runwayLabels = runwayEndLabels(
      digitalMap.loadedVideoMaps ?? [],
      digitalMap.runway,
      camera,
      viewSize,
    );
  }

  const localizers: ScreenPoint[][] = layers.showLocalizer
    ? visibleLocalizerFeathersNm(
        digitalMap.loadedVideoMaps ?? [],
        input.mapVisibility,
        digitalMap.runway,
        digitalMap.localizer,
      ).map((feather) => feather.map((pt) => project(pt, camera, viewSize)))
    : [];
  const localizer = localizers[0] ?? null;

  const coastline = layers.showCoastline
    ? coastlineScreenPoints(digitalMap.coastline, camera, viewSize)
    : null;

  const videoStrokes = extraVideoStrokes(
    digitalMap.loadedVideoMaps ?? [],
    camera,
    viewSize,
    input.mapVisibility,
  );
  const videoLabels = extraVideoLabels(
    digitalMap.loadedVideoMaps ?? [],
    camera,
    viewSize,
    input.mapVisibility,
  );

  const showCompassRose = layers.showCompassRose !== false && layers.showRings;
  const compassRose: CompassRoseGeometry | null = showCompassRose
    ? generateCompassRoseGeometry(ringOriginScreen, viewSize)
    : null;
  const compassRosePath = pathFromCompassRose(compassRose);
  const compassRoseLabels = compassRose?.labels ?? [];

  return {
    key,
    ringRadiiNm,
    ringCircles,
    coastline,
    runway,
    localizer,
    localizers,
    runwayLabels,
    videoStrokes,
    videoLabels,
    ringsPath: pathFromRings(ringCircles),
    coastlinePath: coastline ? pathFromPolyline(coastline, false) : null,
    runwayPath: runway ? pathFromPolyline(runway, true) : null,
    localizerPath: pathFromClosedShapes(localizers),
    compassRose,
    compassRosePath,
    compassRoseLabels,
  };
}

/** Rebuild only when range/center/size/layer flags change — not every rAF. */
export function reuseOrBuildMapCache(prev: MapCache | null, input: MapCacheInput): MapCache {
  const key = buildMapCacheKey(input);
  if (prev && prev.key === key) {
    return prev;
  }
  return buildMapCache(input, key);
}
