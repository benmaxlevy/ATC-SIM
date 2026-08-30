/**
 * CRC / vNAS GeoJSON → trainer `arp-enu-nm` video-map files (T04-37).
 *
 * Offline. Caller supplies already-loaded JSON (tests use in-repo fixtures).
 * Do not fetch vNAS. Do not import this module from `src/`. Do not import `src/`.
 *
 * Output `id` is the CRC ULID. `starsId` stays in provenance `note`.
 * Brightness A → `map`, B → `mapDim`. Stroke-font labels stay polylines.
 */

import { latLonToNm, type LatLon } from "./coordinates.ts";
import { crcBrightnessToVideoMapColor } from "./identity.ts";
import type { NormalizedCrcArtccMaps, NormalizedCrcVideoMap } from "./types.ts";

export type ConvertArp = LatLon;

export type ConvertSkipReason =
  | "null-geometry"
  | "empty-geometry"
  | "default-feature"
  | "zero-coordinates"
  | "malformed"
  | "unsupported-geometry"
  | "point-without-text"
  | "too-few-vertices"
  | "missing-geojson"
  | "invalid-geojson"
  | "no-valid-features";

export interface ConvertDiagnostic {
  mapId: string;
  featureIndex: number;
  reason: ConvertSkipReason;
  detail: string;
}

export interface NmBounds {
  eastMinNm: number;
  eastMaxNm: number;
  northMinNm: number;
  northMaxNm: number;
}

export type TrainerVideoMapFeature =
  | {
      type: "polyline";
      closed: boolean;
      pointsNm: [number, number][];
    }
  | {
      type: "text";
      text: string;
      atNm: [number, number];
    };

export interface TrainerVideoMapFile {
  id: string;
  name: string;
  note: string;
  features: TrainerVideoMapFeature[];
}

export interface ConvertedVideoMap {
  file: TrainerVideoMapFile;
  color: "map" | "mapDim";
  diagnostics: ConvertDiagnostic[];
  convertedFeatureCount: number;
  skippedFeatureCount: number;
  bounds: NmBounds | null;
}

export interface SkippedMap {
  mapId: string;
  reason: ConvertSkipReason;
  detail: string;
  diagnostics: ConvertDiagnostic[];
}

export interface ConvertBatchResult {
  maps: ConvertedVideoMap[];
  skippedMaps: SkippedMap[];
  diagnostics: ConvertDiagnostic[];
  totals: {
    inputMaps: number;
    convertedMaps: number;
    skippedMaps: number;
    convertedFeatures: number;
    skippedFeatures: number;
    skippedByReason: Partial<Record<ConvertSkipReason, number>>;
  };
  bounds: NmBounds | null;
}

export type GeojsonByMapId = ReadonlyMap<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function provenanceNote(
  map: NormalizedCrcVideoMap,
  arp: ConvertArp,
  color: "map" | "mapDim",
): string {
  const stars = map.starsId === undefined ? "starsId omitted" : `starsId ${map.starsId}`;
  const source = map.sourceFilename ?? "source filename omitted";
  const brightness =
    map.brightness === undefined
      ? `brightness omitted→${color}`
      : `brightness ${map.brightness}→${color}`;
  return `CRC ULID ${map.id}; ${stars}; ${source}; ${brightness}; frame arp-enu-nm; ARP ${arp.latDeg},${arp.lonDeg}. Stroke-font labels kept as polylines.`;
}

function skip(
  mapId: string,
  featureIndex: number,
  reason: ConvertSkipReason,
  detail: string,
): ConvertDiagnostic {
  return { mapId, featureIndex, reason, detail };
}

function isDefaultFeature(properties: Record<string, unknown> | undefined): boolean {
  if (properties === undefined) {
    return false;
  }
  return (
    properties.isLineDefaults === true ||
    properties.isTextDefaults === true ||
    properties.isSymbolDefaults === true
  );
}

type LonLatResult =
  { kind: "ok"; lon: number; lat: number } | { kind: "zero" } | { kind: "malformed" };

function parseLonLat(value: unknown): LonLatResult {
  if (!Array.isArray(value) || value.length < 2) {
    return { kind: "malformed" };
  }
  const lon = value[0];
  const lat = value[1];
  if (
    typeof lon !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lon) ||
    !Number.isFinite(lat)
  ) {
    return { kind: "malformed" };
  }
  if (lon === 0 && lat === 0) {
    return { kind: "zero" };
  }
  return { kind: "ok", lon, lat };
}

function lonLatToPair(lon: number, lat: number, arp: ConvertArp): [number, number] {
  const en = latLonToNm({ latDeg: lat, lonDeg: lon }, arp);
  return [en.xNm, en.yNm];
}

function extendBounds(bounds: NmBounds | null, eastNm: number, northNm: number): NmBounds {
  if (bounds === null) {
    return {
      eastMinNm: eastNm,
      eastMaxNm: eastNm,
      northMinNm: northNm,
      northMaxNm: northNm,
    };
  }
  return {
    eastMinNm: Math.min(bounds.eastMinNm, eastNm),
    eastMaxNm: Math.max(bounds.eastMaxNm, eastNm),
    northMinNm: Math.min(bounds.northMinNm, northNm),
    northMaxNm: Math.max(bounds.northMaxNm, northNm),
  };
}

function extendBoundsFromFeature(
  bounds: NmBounds | null,
  feature: TrainerVideoMapFeature,
): NmBounds | null {
  if (feature.type === "text") {
    return extendBounds(bounds, feature.atNm[0], feature.atNm[1]);
  }
  let next = bounds;
  for (const [eastNm, northNm] of feature.pointsNm) {
    next = extendBounds(next, eastNm, northNm);
  }
  return next;
}

function mergeBounds(a: NmBounds | null, b: NmBounds | null): NmBounds | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return {
    eastMinNm: Math.min(a.eastMinNm, b.eastMinNm),
    eastMaxNm: Math.max(a.eastMaxNm, b.eastMaxNm),
    northMinNm: Math.min(a.northMinNm, b.northMinNm),
    northMaxNm: Math.max(a.northMaxNm, b.northMaxNm),
  };
}

interface LineParse {
  points: [number, number][];
  zeroCount: number;
  malformed: boolean;
}

function parseLineCoordinates(coordinates: unknown, arp: ConvertArp): LineParse {
  if (!Array.isArray(coordinates)) {
    return { points: [], zeroCount: 0, malformed: true };
  }
  const points: [number, number][] = [];
  let zeroCount = 0;
  for (const vertex of coordinates) {
    const parsed = parseLonLat(vertex);
    if (parsed.kind === "malformed") {
      return { points: [], zeroCount, malformed: true };
    }
    if (parsed.kind === "zero") {
      zeroCount += 1;
      continue;
    }
    points.push(lonLatToPair(parsed.lon, parsed.lat, arp));
  }
  return { points, zeroCount, malformed: false };
}

function dropClosingDuplicate(points: [number, number][]): [number, number][] {
  if (points.length < 2) {
    return points;
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) {
    return points.slice(0, -1);
  }
  return points;
}

function lineSkipReason(parsed: LineParse, emptyCoordinates: boolean): ConvertSkipReason {
  if (parsed.malformed) {
    return "malformed";
  }
  if (emptyCoordinates) {
    return "empty-geometry";
  }
  if (parsed.points.length === 0 && parsed.zeroCount > 0) {
    return "zero-coordinates";
  }
  if (parsed.points.length < 2) {
    return parsed.zeroCount > 0 ? "zero-coordinates" : "too-few-vertices";
  }
  return "too-few-vertices";
}

function convertFeature(
  feature: unknown,
  featureIndex: number,
  mapId: string,
  arp: ConvertArp,
): { features: TrainerVideoMapFeature[]; diagnostics: ConvertDiagnostic[] } {
  if (!isRecord(feature)) {
    return {
      features: [],
      diagnostics: [skip(mapId, featureIndex, "malformed", "feature is not an object")],
    };
  }
  if (isDefaultFeature(isRecord(feature.properties) ? feature.properties : undefined)) {
    return {
      features: [],
      diagnostics: [
        skip(
          mapId,
          featureIndex,
          "default-feature",
          "isLineDefaults/isTextDefaults/isSymbolDefaults",
        ),
      ],
    };
  }
  const geometry = feature.geometry;
  if (geometry === null) {
    return {
      features: [],
      diagnostics: [skip(mapId, featureIndex, "null-geometry", "geometry is null")],
    };
  }
  if (!isRecord(geometry) || typeof geometry.type !== "string") {
    return {
      features: [],
      diagnostics: [skip(mapId, featureIndex, "malformed", "geometry is missing or not an object")],
    };
  }
  const geomType = geometry.type;
  const coordinates = geometry.coordinates;
  const properties = isRecord(feature.properties) ? feature.properties : undefined;

  if (geomType === "LineString") {
    const empty = Array.isArray(coordinates) && coordinates.length === 0;
    const parsed = parseLineCoordinates(coordinates, arp);
    if (parsed.malformed || parsed.points.length < 2) {
      return {
        features: [],
        diagnostics: [
          skip(
            mapId,
            featureIndex,
            lineSkipReason(parsed, empty),
            "LineString needs ≥2 valid WGS84 vertices",
          ),
        ],
      };
    }
    return {
      features: [{ type: "polyline", closed: false, pointsNm: parsed.points }],
      diagnostics: [],
    };
  }

  if (geomType === "MultiLineString") {
    if (!Array.isArray(coordinates)) {
      return {
        features: [],
        diagnostics: [
          skip(mapId, featureIndex, "malformed", "MultiLineString coordinates must be an array"),
        ],
      };
    }
    if (coordinates.length === 0) {
      return {
        features: [],
        diagnostics: [skip(mapId, featureIndex, "empty-geometry", "MultiLineString has no parts")],
      };
    }
    const polylines: TrainerVideoMapFeature[] = [];
    const diagnostics: ConvertDiagnostic[] = [];
    for (const [partIndex, part] of coordinates.entries()) {
      const empty = Array.isArray(part) && part.length === 0;
      const parsed = parseLineCoordinates(part, arp);
      if (parsed.malformed || parsed.points.length < 2) {
        diagnostics.push(
          skip(
            mapId,
            featureIndex,
            lineSkipReason(parsed, empty),
            `MultiLineString part ${partIndex} needs ≥2 valid WGS84 vertices`,
          ),
        );
        continue;
      }
      polylines.push({ type: "polyline", closed: false, pointsNm: parsed.points });
    }
    if (polylines.length > 0) {
      return { features: polylines, diagnostics };
    }
    return {
      features: [],
      diagnostics:
        diagnostics.length > 0
          ? diagnostics
          : [
              skip(
                mapId,
                featureIndex,
                "empty-geometry",
                "MultiLineString produced no valid polylines",
              ),
            ],
    };
  }

  if (geomType === "Polygon") {
    if (!Array.isArray(coordinates)) {
      return {
        features: [],
        diagnostics: [
          skip(mapId, featureIndex, "malformed", "Polygon coordinates must be an array of rings"),
        ],
      };
    }
    if (coordinates.length === 0) {
      return {
        features: [],
        diagnostics: [skip(mapId, featureIndex, "empty-geometry", "Polygon has no rings")],
      };
    }
    const rings: TrainerVideoMapFeature[] = [];
    const diagnostics: ConvertDiagnostic[] = [];
    for (const [ringIndex, ring] of coordinates.entries()) {
      const empty = Array.isArray(ring) && ring.length === 0;
      const parsed = parseLineCoordinates(ring, arp);
      const unique = parsed.malformed ? parsed.points : dropClosingDuplicate(parsed.points);
      if (parsed.malformed || unique.length < 2) {
        diagnostics.push(
          skip(
            mapId,
            featureIndex,
            lineSkipReason({ ...parsed, points: unique }, empty),
            `Polygon ring ${ringIndex} needs ≥2 valid WGS84 vertices`,
          ),
        );
        continue;
      }
      rings.push({ type: "polyline", closed: true, pointsNm: unique });
    }
    if (rings.length > 0) {
      return { features: rings, diagnostics };
    }
    return {
      features: [],
      diagnostics:
        diagnostics.length > 0
          ? diagnostics
          : [
              skip(
                mapId,
                featureIndex,
                "empty-geometry",
                "Polygon outline produced no valid rings",
              ),
            ],
    };
  }

  if (geomType === "Point") {
    const parsed = parseLonLat(coordinates);
    if (parsed.kind === "malformed") {
      return {
        features: [],
        diagnostics: [
          skip(mapId, featureIndex, "malformed", "Point coordinates must be [lon, lat]"),
        ],
      };
    }
    if (parsed.kind === "zero") {
      return {
        features: [],
        diagnostics: [skip(mapId, featureIndex, "zero-coordinates", "Point is [0, 0]")],
      };
    }
    const rawText =
      properties !== undefined && typeof properties.text === "string" ? properties.text : "";
    const text = rawText.trim();
    if (text === "") {
      return {
        features: [],
        diagnostics: [
          skip(
            mapId,
            featureIndex,
            "point-without-text",
            "Point has no text; symbols are not converted (no proprietary font)",
          ),
        ],
      };
    }
    return {
      features: [{ type: "text", text, atNm: lonLatToPair(parsed.lon, parsed.lat, arp) }],
      diagnostics: [],
    };
  }

  return {
    features: [],
    diagnostics: [
      skip(
        mapId,
        featureIndex,
        "unsupported-geometry",
        `geometry type ${geomType} is not LineString, MultiLineString, Polygon, or Point`,
      ),
    ],
  };
}

export function convertCrcGeojson(
  geojson: unknown,
  map: NormalizedCrcVideoMap,
  arp: ConvertArp,
): ConvertedVideoMap | SkippedMap {
  const color = crcBrightnessToVideoMapColor(map.brightness ?? "A");
  const note = provenanceNote(map, arp, color);
  if (
    !isRecord(geojson) ||
    geojson.type !== "FeatureCollection" ||
    !Array.isArray(geojson.features)
  ) {
    return {
      mapId: map.id,
      reason: "invalid-geojson",
      detail: "document must be a FeatureCollection with a features array",
      diagnostics: [
        skip(
          map.id,
          -1,
          "invalid-geojson",
          "document must be a FeatureCollection with a features array",
        ),
      ],
    };
  }
  const diagnostics: ConvertDiagnostic[] = [];
  const features: TrainerVideoMapFeature[] = [];
  let bounds: NmBounds | null = null;
  for (const [i, raw] of geojson.features.entries()) {
    const converted = convertFeature(raw, i, map.id, arp);
    diagnostics.push(...converted.diagnostics);
    for (const feature of converted.features) {
      features.push(feature);
      bounds = extendBoundsFromFeature(bounds, feature);
    }
  }
  if (features.length === 0) {
    return {
      mapId: map.id,
      reason: "no-valid-features",
      detail: `GeoJSON for ${map.id} produced no valid trainer features`,
      diagnostics,
    };
  }
  return {
    file: {
      id: map.id,
      name: map.title,
      note,
      features,
    },
    color,
    diagnostics,
    convertedFeatureCount: features.length,
    skippedFeatureCount: diagnostics.length,
    bounds,
  };
}

export function convertCrcArtccMaps(
  artcc: NormalizedCrcArtccMaps,
  geojsonByMapId: GeojsonByMapId,
  arp: ConvertArp,
): ConvertBatchResult {
  const maps: ConvertedVideoMap[] = [];
  const skippedMaps: SkippedMap[] = [];
  const diagnostics: ConvertDiagnostic[] = [];
  const skippedByReason: Partial<Record<ConvertSkipReason, number>> = {};
  const bump = (reason: ConvertSkipReason): void => {
    skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
  };
  let convertedFeatures = 0;
  let skippedFeatures = 0;
  let bounds: NmBounds | null = null;

  for (const map of artcc.videoMaps) {
    if (!geojsonByMapId.has(map.id)) {
      const skipped: SkippedMap = {
        mapId: map.id,
        reason: "missing-geojson",
        detail: `${map.id}.geojson is not in the map directory`,
        diagnostics: [
          skip(map.id, -1, "missing-geojson", `${map.id}.geojson is not in the map directory`),
        ],
      };
      skippedMaps.push(skipped);
      diagnostics.push(...skipped.diagnostics);
      bump("missing-geojson");
      skippedFeatures += 1;
      continue;
    }
    const result = convertCrcGeojson(geojsonByMapId.get(map.id), map, arp);
    if ("file" in result) {
      maps.push(result);
      diagnostics.push(...result.diagnostics);
      convertedFeatures += result.convertedFeatureCount;
      skippedFeatures += result.skippedFeatureCount;
      for (const diagnostic of result.diagnostics) {
        bump(diagnostic.reason);
      }
      bounds = mergeBounds(bounds, result.bounds);
      continue;
    }
    skippedMaps.push(result);
    diagnostics.push(...result.diagnostics);
    if (result.diagnostics.length === 0) {
      diagnostics.push(skip(map.id, -1, result.reason, result.detail));
    }
    bump(result.reason);
    if (result.diagnostics.length === 0) {
      skippedFeatures += 1;
    } else {
      skippedFeatures += result.diagnostics.length;
      for (const diagnostic of result.diagnostics) {
        if (diagnostic.reason !== result.reason) {
          bump(diagnostic.reason);
        }
      }
    }
  }

  return {
    maps,
    skippedMaps,
    diagnostics,
    totals: {
      inputMaps: artcc.videoMaps.length,
      convertedMaps: maps.length,
      skippedMaps: skippedMaps.length,
      convertedFeatures,
      skippedFeatures,
      skippedByReason,
    },
    bounds,
  };
}

function formatBounds(bounds: NmBounds | null): string {
  if (bounds === null) {
    return "bounds NM (none)";
  }
  return `bounds NM east=[${bounds.eastMinNm}, ${bounds.eastMaxNm}] north=[${bounds.northMinNm}, ${bounds.northMaxNm}]`;
}

const SKIP_REASON_ORDER: ConvertSkipReason[] = [
  "null-geometry",
  "empty-geometry",
  "default-feature",
  "zero-coordinates",
  "malformed",
  "unsupported-geometry",
  "point-without-text",
  "too-few-vertices",
  "missing-geojson",
  "invalid-geojson",
  "no-valid-features",
];

export function formatConvertReport(batch: ConvertBatchResult): string {
  const { totals } = batch;
  const skipParts = SKIP_REASON_ORDER.filter((reason) => (totals.skippedByReason[reason] ?? 0) > 0)
    .map((reason) => `${reason}=${totals.skippedByReason[reason]}`)
    .join(" ");
  const skipLine =
    skipParts.length > 0 ? `crc-videomaps: skipped ${skipParts}` : "crc-videomaps: skipped (none)";
  return [
    `crc-videomaps: maps input=${totals.inputMaps} converted=${totals.convertedMaps} skipped=${totals.skippedMaps}`,
    `crc-videomaps: features converted=${totals.convertedFeatures} skipped=${totals.skippedFeatures}`,
    skipLine,
    `crc-videomaps: ${formatBounds(batch.bounds)}`,
  ].join("\n");
}

export function trainerVideoMapJson(file: TrainerVideoMapFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
