/**
 * Trainer MVA / floor chart. Not certified MSAW. Sibling of the procedure
 * catalog so procedure JSON stays procedure-only (T04-10).
 *
 * Canonical evaluator types live in `@core`; this file re-exports them so
 * scenario loaders can name `MvaChart` without importing the alert module path.
 */

import type { MvaChart, MvaPolygon, MvaVertex } from "@core";
export type { MvaChart, MvaPolygon, MvaVertex, MsawInhibitGeom } from "@core";

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

const MVA_JSON = import.meta.glob<unknown>("./data/*-mva.json", {
  eager: true,
  import: "default",
});

/** Last path segment without `-mva.json`, so `KDEM` and `kdem` both work. */
export function mvaFileKey(airportId: string): string {
  return `./data/${airportId.trim().toLowerCase()}-mva.json`;
}

/**
 * Parse the committed MVA JSON for `airportId`, or `null` when that facility
 * has no chart yet.
 */
export function loadMva(airportId: string): MvaChart | null {
  const key = mvaFileKey(airportId);
  const raw = MVA_JSON[key];
  if (raw === undefined) {
    return null;
  }
  return parseMvaChart(raw);
}
