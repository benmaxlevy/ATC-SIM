import type { MvaChart, MvaPolygon, MvaVertex } from "@core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`MVA ${path} must be a finite number`);
  }
  return value;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`MVA ${path} must be a non-empty string`);
  }
  return value;
}

function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`MVA ${path} must be an array`);
  }
  return value;
}

function parseVertex(value: unknown, path: string): MvaVertex {
  if (!isRecord(value)) {
    throw new Error(`MVA ${path} must be an object`);
  }
  return {
    xNm: assertNumber(value.xNm, `${path}.xNm`),
    yNm: assertNumber(value.yNm, `${path}.yNm`),
  };
}

function parsePolygon(value: unknown, index: number): MvaPolygon {
  const path = `polygons[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`MVA ${path} must be an object`);
  }
  const verticesNm = assertArray(value.verticesNm, `${path}.verticesNm`).map((item, i) =>
    parseVertex(item, `${path}.verticesNm[${i}]`),
  );
  if (verticesNm.length < 3) {
    throw new Error(`MVA ${path}.verticesNm must have at least 3 vertices`);
  }
  return {
    id: assertString(value.id, `${path}.id`),
    minAltitudeFt: assertNumber(value.minAltitudeFt, `${path}.minAltitudeFt`),
    verticesNm,
  };
}

/**
 * Runtime-check an MVA JSON object. `airportId` is a string, not a KDEM-only
 * literal. Optional `note` is kept for authors (rectangles v1, not certified).
 */
export function parseMvaChart(raw: unknown): MvaChart {
  if (!isRecord(raw)) {
    throw new Error("MVA chart must be an object");
  }
  const note = raw.note === undefined ? undefined : assertString(raw.note, "note");
  const polygons = assertArray(raw.polygons, "polygons").map(parsePolygon);
  if (polygons.length === 0) {
    throw new Error("MVA polygons must be a non-empty array");
  }
  const chart: MvaChart = {
    airportId: assertString(raw.airportId, "airportId"),
    defaultMinAltitudeFt: assertNumber(raw.defaultMinAltitudeFt, "defaultMinAltitudeFt"),
    polygons,
  };
  if (note !== undefined) {
    chart.note = note;
  }
  return chart;
}
