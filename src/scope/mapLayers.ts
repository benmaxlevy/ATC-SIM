/**
 * Analog: CRC STARS MAPS / video maps / range rings (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: KDEM trainer-authored JSON only (runway, localizer feather,
 * generated range rings at RR 2/5/10 NM about airport ref, optional coastline).
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
} from "@scenario";
import { nmToScreen, pxPerNm, type ScopeCamera, type ScopeViewSize } from "./camera";

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
}

export interface MapLayerFlags {
  showRunway: boolean;
  showLocalizer: boolean;
  showRings: boolean;
  showCoastline: boolean;
}

export interface MapCacheView {
  camera: ScopeCamera;
  digitalMap: DigitalMap;
  showRunway: boolean;
  showLocalizer: boolean;
  showRings: boolean;
  showCoastline: boolean;
  airportEastNm: number;
  airportNorthNm: number;
  mapVisibility?: ReadonlyMap<string, boolean>;
  ringIntervalNm?: number;
  mapBriteIndex?: number;
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
  mapBriteIndex?: number;
}

export interface MapCache {
  key: string;
  ringRadiiNm: number[];
  ringCircles: { x: number; y: number; radiusPx: number }[];
  coastline: ScreenPoint[] | null;
  runway: ScreenPoint[] | null;
  localizer: ScreenPoint[] | null;
  runwayLabel: { text: string; x: number; y: number } | null;
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
  rangeNm: number,
  rings: DigitalMapRangeRings = DEFAULT_RANGE_RINGS,
): number[] {
  const interval = rings.intervalNm;
  if (!(interval > 0) || !(rangeNm > 0)) {
    return [];
  }
  const max = Math.min(rangeNm, rings.maxNm);
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
    },
    airportEastNm: view.airportEastNm,
    airportNorthNm: view.airportNorthNm,
    mapVisibility: view.mapVisibility,
    ringIntervalNm: view.ringIntervalNm ?? view.digitalMap.rangeRings.intervalNm,
    mapBriteIndex: view.mapBriteIndex,
  };
}

function visibilityKey(
  maps: LoadedVideoMap[],
  visibility: ReadonlyMap<string, boolean> | undefined,
): string {
  return maps.map((map) => (visibility?.get(map.id) ?? map.defaultOn ? "1" : "0")).join("");
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
    input.airportEastNm,
    input.airportNorthNm,
    input.ringIntervalNm,
    input.mapBriteIndex ?? "",
    visibilityKey(input.digitalMap.loadedVideoMaps ?? [], input.mapVisibility),
  ].join("|");
}

function project(point: NmPoint, cam: ScopeCamera, view: ScopeViewSize): ScreenPoint {
  return nmToScreen(point.eastNm, point.northNm, cam, view);
}

function pathFromPolyline(pts: ScreenPoint[], close: boolean): Path2D | null {
  if (typeof Path2D !== "function" || pts.length < 2) {
    return null;
  }
  const path = new Path2D();
  const first = pts[0]!;
  path.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i += 1) {
    const pt = pts[i]!;
    path.lineTo(pt.x, pt.y);
  }
  if (close) {
    path.closePath();
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
      strokes.push({
        mapId: map.id,
        color: map.color,
        closed: feature.closed,
        points: feature.pointsNm.map(([eastNm, northNm]) =>
          project({ eastNm, northNm }, cam, view),
        ),
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
      if (feature.type !== "text") {
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
  const ringRadiiNm = layers.showRings ? activeRingRadiiNm(camera.rangeNm, rings) : [];
  const airportScreen = nmToScreen(airportEastNm, airportNorthNm, camera, viewSize);
  const scale = pxPerNm(camera, viewSize);
  const ringCircles = ringRadiiNm.map((radiusNm) => ({
    x: airportScreen.x,
    y: airportScreen.y,
    radiusPx: radiusNm * scale,
  }));

  let runway: ScreenPoint[] | null = null;
  let runwayLabel: MapCache["runwayLabel"] = null;
  if (layers.showRunway && digitalMap.runway) {
    runway = buildRunwayCorners(digitalMap.runway).map((pt) => project(pt, camera, viewSize));
    runwayLabel = {
      text: digitalMap.runway.id,
      ...runwayLabelPoint(digitalMap.runway, camera, viewSize),
    };
  }

  let localizer: ScreenPoint[] | null = null;
  if (layers.showLocalizer && digitalMap.runway && digitalMap.localizer) {
    localizer = buildLocalizerFeather(digitalMap.runway, digitalMap.localizer).map((pt) =>
      project(pt, camera, viewSize),
    );
  }

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

  return {
    key,
    ringRadiiNm,
    ringCircles,
    coastline,
    runway,
    localizer,
    runwayLabel,
    videoStrokes,
    videoLabels,
    ringsPath: pathFromRings(ringCircles),
    coastlinePath: coastline ? pathFromPolyline(coastline, false) : null,
    runwayPath: runway ? pathFromPolyline(runway, true) : null,
    localizerPath: localizer ? pathFromPolyline(localizer, true) : null,
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
