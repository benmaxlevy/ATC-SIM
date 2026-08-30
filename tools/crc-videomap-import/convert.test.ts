import { expect, test } from "vitest";
import { parseVideoMapFile } from "../../src/scenario/loadVideoMaps.ts";
import { latLonToNm } from "./coordinates.ts";
import {
  convertCrcArtccMaps,
  convertCrcGeojson,
  formatConvertReport,
  trainerVideoMapJson,
  type ConvertArp,
} from "./convert.ts";
import { parseCrcArtccMaps } from "./parse.ts";
import type { NormalizedCrcVideoMap } from "./types.ts";
import cleanupGeojson from "../../testdata/crc-videomaps/geojson-cleanup.json";
import emptyGeojson from "../../testdata/crc-videomaps/geojson-empty.json";
import geometryGeojson from "../../testdata/crc-videomaps/geojson-geometry.json";
import convertMetadata from "../../testdata/crc-videomaps/convert-metadata.json";

const originZero: ConvertArp = { latDeg: 0, lonDeg: 0 };
const katlWest: ConvertArp = { latDeg: 33.6367, lonDeg: -84.4278638888889 };

function mapRow(
  partial: Partial<NormalizedCrcVideoMap> & Pick<NormalizedCrcVideoMap, "id" | "title">,
): NormalizedCrcVideoMap {
  return {
    tdm: false,
    tags: ["STARS", "A80"],
    ...partial,
  };
}

function expectConverted(result: ReturnType<typeof convertCrcGeojson>) {
  if (!("file" in result)) {
    throw new Error(`expected converted map, got ${result.reason}: ${result.detail}`);
  }
  return result;
}

test("LineString, MultiLineString, Polygon outlines, and Point text convert through latLonToNm", () => {
  const map = mapRow({
    id: "01SYNCVT00000000000000001",
    title: "SYN LINES",
    starsId: 11,
    brightness: "A",
    sourceFilename: "LINES.geojson",
  });
  const converted = expectConverted(convertCrcGeojson(geometryGeojson, map, originZero));
  expect(converted.file.id).toBe("01SYNCVT00000000000000001");
  expect(converted.file.id).not.toBe("11");
  expect(converted.file.id).not.toBe("1");
  expect(converted.color).toBe("map");
  expect(converted.file.note).toMatch(/starsId 11/);
  expect(converted.file.note).toMatch(/brightness A→map/);
  expect(converted.file.note).not.toMatch(/dcbNumber/);

  const nm10 = latLonToNm({ latDeg: 0, lonDeg: 1 }, originZero);
  const nm11 = latLonToNm({ latDeg: 1, lonDeg: 1 }, originZero);
  expect(converted.file.features[0]).toEqual({
    type: "polyline",
    closed: false,
    pointsNm: [
      [nm10.xNm, nm10.yNm],
      [nm11.xNm, nm11.yNm],
    ],
  });

  const multi = converted.file.features.filter(
    (feature, i) => i >= 1 && i <= 2 && feature.type === "polyline",
  );
  expect(multi).toHaveLength(2);
  expect(multi[0]).toMatchObject({ type: "polyline", closed: false });
  expect(multi[1]?.type).toBe("polyline");
  if (multi[1]?.type === "polyline") {
    expect(multi[1].pointsNm).toHaveLength(3);
  }

  const polygons = converted.file.features.filter(
    (feature) => feature.type === "polyline" && feature.closed,
  );
  expect(polygons).toHaveLength(2);
  expect(polygons[0]?.type === "polyline" && polygons[0].pointsNm).toHaveLength(4);

  const text = converted.file.features.find((feature) => feature.type === "text");
  expect(text).toEqual({
    type: "text",
    text: "FIX1",
    atNm: [
      latLonToNm({ latDeg: 1, lonDeg: 6 }, originZero).xNm,
      latLonToNm({ latDeg: 1, lonDeg: 6 }, originZero).yNm,
    ],
  });

  parseVideoMapFile(converted.file, converted.file.id, "synthetic/geometry.json");
});

test("stroke-font labels remain polylines with no OCR text features", () => {
  const map = mapRow({ id: "01SYNCVT00000000000000001", title: "SYN LINES", brightness: "A" });
  const converted = expectConverted(convertCrcGeojson(geometryGeojson, map, originZero));
  const stroke = converted.file.features.slice(-2);
  expect(stroke.every((feature) => feature.type === "polyline")).toBe(true);
  expect(converted.file.features.filter((feature) => feature.type === "text")).toHaveLength(1);
  expect(converted.file.note).toMatch(/Stroke-font labels kept as polylines/);
});

test("KATL west-flow ARP projects WGS84 [lon, lat] to [eastNm, northNm]", () => {
  const map = mapRow({ id: "01SYNCVT00000000000000001", title: "SYN LINES", brightness: "B" });
  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [-84.4, 33.7],
            [-84.3, 33.8],
          ],
        },
      },
    ],
  };
  const converted = expectConverted(convertCrcGeojson(geojson, map, katlWest));
  expect(converted.color).toBe("mapDim");
  const a = latLonToNm({ latDeg: 33.7, lonDeg: -84.4 }, katlWest);
  const b = latLonToNm({ latDeg: 33.8, lonDeg: -84.3 }, katlWest);
  expect(converted.file.features[0]).toEqual({
    type: "polyline",
    closed: false,
    pointsNm: [
      [a.xNm, a.yNm],
      [b.xNm, b.yNm],
    ],
  });
  expect(converted.file.note).toMatch(/ARP 33\.6367,-84\.4278638888889/);
});

test("null, empty, default, malformed, and zero-coordinate features skip with diagnostics", () => {
  const map = mapRow({
    id: "01SYNCVT00000000000000002",
    title: "SYN CLEANUP",
    brightness: "B",
    starsId: 12,
  });
  const converted = expectConverted(convertCrcGeojson(cleanupGeojson, map, originZero));
  expect(converted.color).toBe("mapDim");
  expect(converted.file.features).toHaveLength(2);
  expect(converted.file.features[0]).toMatchObject({ type: "polyline", closed: false });
  expect(converted.file.features[1]).toMatchObject({ type: "polyline", closed: false });
  if (converted.file.features[1]?.type === "polyline") {
    expect(converted.file.features[1].pointsNm).toHaveLength(2);
  }
  const reasons = converted.diagnostics.map((row) => row.reason);
  expect(reasons).toEqual([
    "null-geometry",
    "empty-geometry",
    "default-feature",
    "default-feature",
    "default-feature",
    "zero-coordinates",
    "zero-coordinates",
    "point-without-text",
    "malformed",
    "unsupported-geometry",
    "unsupported-geometry",
    "too-few-vertices",
    "malformed",
  ]);
  expect(converted.file.features.every((feature) => feature.type !== "text")).toBe(true);
  parseVideoMapFile(converted.file, converted.file.id, "synthetic/cleanup.json");
});

test("all-skip GeoJSON yields no invalid output map", () => {
  const map = mapRow({ id: "01SYNCVT00000000000000004", title: "SYN EMPTY", brightness: "A" });
  const skipped = convertCrcGeojson(emptyGeojson, map, originZero);
  expect("file" in skipped).toBe(false);
  if ("file" in skipped) {
    return;
  }
  expect(skipped.reason).toBe("no-valid-features");
  expect(skipped.diagnostics.map((row) => row.reason)).toEqual([
    "default-feature",
    "null-geometry",
  ]);
});

test("invalid FeatureCollection is rejected without output", () => {
  const map = mapRow({ id: "U1", title: "BAD" });
  const skipped = convertCrcGeojson({ type: "Feature" }, map, originZero);
  expect("file" in skipped).toBe(false);
  if ("file" in skipped) {
    return;
  }
  expect(skipped.reason).toBe("invalid-geojson");
});

test("batch conversion keeps ULID identity, reports skips and NM bounds", () => {
  const artcc = parseCrcArtccMaps(convertMetadata);
  const geojsonByMapId = new Map<string, unknown>([
    ["01SYNCVT00000000000000001", geometryGeojson],
    ["01SYNCVT00000000000000002", cleanupGeojson],
    ["01SYNCVT00000000000000004", emptyGeojson],
  ]);
  const batch = convertCrcArtccMaps(artcc, geojsonByMapId, originZero);
  expect(batch.totals.inputMaps).toBe(4);
  expect(batch.totals.convertedMaps).toBe(2);
  expect(batch.skippedMaps.map((row) => row.reason)).toEqual([
    "missing-geojson",
    "no-valid-features",
  ]);
  expect(batch.maps.map((row) => row.file.id)).toEqual([
    "01SYNCVT00000000000000001",
    "01SYNCVT00000000000000002",
  ]);
  expect(batch.maps[0]?.color).toBe("map");
  expect(batch.maps[1]?.color).toBe("mapDim");
  expect(batch.bounds).not.toBeNull();
  expect(batch.bounds!.eastMinNm).toBeLessThan(batch.bounds!.eastMaxNm);
  const report = formatConvertReport(batch);
  expect(report).toMatch(/maps input=4 converted=2 skipped=2/);
  expect(report).toMatch(/features converted=/);
  expect(report).toMatch(/missing-geojson=1/);
  expect(report).toMatch(/no-valid-features=1/);
  expect(report).toMatch(/null-geometry=/);
  expect(report).toMatch(/bounds NM east=/);
  const again = convertCrcArtccMaps(artcc, geojsonByMapId, originZero);
  expect(trainerVideoMapJson(again.maps[0]!.file)).toBe(trainerVideoMapJson(batch.maps[0]!.file));
});
