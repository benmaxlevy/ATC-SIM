import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import {
  arincRecord,
  detectCifpDialect,
  parsePackedLat,
  parsePackedLon,
  readTrim,
} from "./arincLayout.ts";
import {
  buildConflictSubset,
  buildDanglingFixSubset,
  buildDanglingSidSubset,
  buildFixedWidthSubset,
  buildMalformedCoordSubset,
  buildUnsupportedLegsSubset,
  buildUnsupportedSidSubset,
  pa,
  pc,
  vhf,
} from "./fixedWidthRecords.ts";
import { emitCatalogFromSource } from "./normalize.ts";
import { parseCifpSubset, parseFixedWidthCifp } from "./parse.ts";
import { sourceErrorCount } from "./types.ts";

test("detects comma vs fixed-width dialect", () => {
  expect(detectCifpDialect("PA,KSYN,X,N00000000,E000000000,0,0\n")).toBe("comma-separated");
  expect(detectCifpDialect(buildFixedWidthSubset())).toBe("fixed-width");
});

test("fixed-width fields are 1-based and 132 chars", () => {
  const line = arincRecord([
    [1, 1, "S"],
    [5, 1, "P"],
    [13, 1, "A"],
    [7, 4, "KSYN"],
  ]);
  expect(line).toHaveLength(132);
  expect(readTrim(line, 7, 4)).toBe("KSYN");
  expect(line[0]).toBe("S");
});

test("packed coordinates match comma-subset NEMAX", () => {
  expect(parsePackedLat("N00120000")).toBeCloseTo(0.2, 10);
  expect(parsePackedLon("E000170000")).toBeCloseTo(0.2833333333333333, 10);
});

test("AC1 — testdata/cifp/fixed-width-subset.cifp parses offline", () => {
  const fetchWas = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("CIFP import must not fetch");
  };
  try {
    const text = readFileSync(
      new URL("../../testdata/cifp/fixed-width-subset.cifp", import.meta.url),
      "utf8",
    );
    const result = parseCifpSubset(text);
    expect(result.catalog.airportId).toBe("KSYN");
    expect(result.catalog.approaches.some((row) => row.type === "ILS")).toBe(true);
    expect(result.catalog.sids.some((row) => row.id === "DEP1")).toBe(true);
  } finally {
    globalThis.fetch = fetchWas;
  }
});

test("AC1 — in-memory fixed-width subset emits catalog schema", () => {
  const fetchWas = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("CIFP import must not fetch");
  };
  try {
    const text = buildFixedWidthSubset();
    const source = parseFixedWidthCifp(text);
    expect(source.dialect).toBe("fixed-width");
    expect(source.airports).toHaveLength(1);
    expect(source.airports[0]?.airportId).toBe("KSYN");
    expect(source.airports[0]?.arp).toEqual({ latDeg: 0, lonDeg: 0 });
    expect(source.sids).toHaveLength(1);
    expect(source.sids[0]?.id).toBe("DEP1");
    expect(source.skippedByType.PD).toBeUndefined();
    const result = parseCifpSubset(text);
    expect(result.catalog.schemaVersion).toBe(1);
    expect(result.catalog.airportId).toBe("KSYN");
    expect(result.catalog.sids).toHaveLength(1);
    expect(result.catalog.sids[0]?.id).toBe("DEP1");
    expect(result.catalog.atpaVolumes).toEqual([]);
    expect(Array.isArray(result.catalog.navaids)).toBe(true);
    expect(Array.isArray(result.catalog.fixes)).toBe(true);
    expect(Array.isArray(result.catalog.stars)).toBe(true);
    expect(Array.isArray(result.catalog.approaches)).toBe(true);
  } finally {
    globalThis.fetch = fetchWas;
  }
});

test("PD SID groups runway, common, and enroute legs with constraints", () => {
  const source = parseFixedWidthCifp(buildFixedWidthSubset());
  const sid = source.sids.find((row) => row.id === "DEP1");
  expect(sid).toBeDefined();
  expect(sid?.runwayTransitions[0]?.runwayId).toBe("27");
  expect(sid?.runwayTransitions[0]?.initialHeadingDeg).toBe(270);
  expect(sid?.runwayTransitions[0]?.legs[0]?.fixId).toBe("SIDEP");
  expect(sid?.runwayTransitions[0]?.legs[0]?.altConstraint).toEqual({
    type: "AT_OR_ABOVE",
    altitudeFt: 1500,
  });
  expect(sid?.common[0]?.fixId).toBe("MERGE");
  expect(sid?.common[0]?.altConstraint).toEqual({ type: "AT", altitudeFt: 5000 });
  expect(sid?.enrouteTransitions[0]?.id).toBe("NORMA");
  expect(sid?.enrouteTransitions[0]?.legs[0]?.fixId).toBe("NEMAX");
  expect(sid?.initialClimbFt).toBe(5000);
});

test("AC2 — VOR/NDB, fix, SID constraint, STAR constraint, ILS survive with lat/lon", () => {
  const catalog = parseCifpSubset(buildFixedWidthSubset()).catalog;
  const vor = catalog.navaids.find((row) => row.id === "DEM");
  expect(vor?.kind).toBe("VORDME");
  expect(vor?.latDeg).toBeCloseTo(0.013333333333333334, 10);
  expect(vor?.lonDeg).toBeCloseTo(0.006666666666666667, 10);
  const ndb = catalog.navaids.find((row) => row.id === "DMO");
  expect(ndb?.kind).toBe("NDB");
  expect(ndb?.latDeg).toBeDefined();
  expect(ndb?.lonDeg).toBeDefined();
  const nemax = catalog.fixes.find((row) => row.id === "NEMAX");
  expect(nemax?.latDeg).toBeCloseTo(0.2, 10);
  expect(nemax?.lonDeg).toBeCloseTo(0.2833333333333333, 10);
  expect(Math.abs((nemax?.xNm ?? NaN) - 17)).toBeLessThan(0.05);
  expect(Math.abs((nemax?.yNm ?? NaN) - 12)).toBeLessThan(0.05);
  const star = catalog.stars.find((row) => row.id === "DEM1");
  expect(star?.common[0]?.altConstraint).toEqual({ type: "AT", altitudeFt: 4000 });
  expect(star?.transitions[0]?.legs[0]?.altConstraint?.type).toBe("AT_OR_ABOVE");
  const ils = catalog.approaches.find((row) => row.type === "ILS");
  expect(ils).toBeDefined();
  expect(ils?.courseDeg).toBe(270);
  expect(ils?.locNavaidId).toBe("IDEM");
  expect(ils?.gsNavaidId).toBe("IDEMGS");
  expect(ils?.fafFixId).toBe("FI27");
  expect(ils?.missed?.directFixId).toBe("MISSD");
  const loc = catalog.navaids.find((row) => row.id === "IDEM");
  expect(loc?.latDeg).toBeDefined();
  expect(loc?.lonDeg).toBeDefined();
  const sidep = catalog.fixes.find((row) => row.id === "SIDEP");
  expect(sidep?.latDeg).toBeCloseTo(1 / 60, 10);
  expect(sidep?.lonDeg).toBeCloseTo(4 / 60, 10);
  const sid = catalog.sids.find((row) => row.id === "DEP1");
  expect(sid?.runwayTransitions?.[0]?.legs[0]?.altConstraint).toEqual({
    type: "AT_OR_ABOVE",
    altitudeFt: 1500,
  });
  expect(sid?.runwayTransitions?.[0]?.legs[0]?.fixId).toBe("SIDEP");
  expect(sid?.common[0]?.altConstraint).toEqual({ type: "AT", altitudeFt: 5000 });
  expect(sid?.initialClimbFt).toBe(5000);
});

test("AC3 — conflicting records produce deterministic diagnostics", () => {
  const source = parseFixedWidthCifp(buildConflictSubset());
  const conflicts = source.diagnostics.filter((row) => row.code === "CONFLICTING_RECORD");
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0]?.airportId).toBeUndefined();
  expect(conflicts[0]?.section).toBe("D");
  expect(conflicts[0]?.message).toMatch(/conflicting D record DEM/);
  expect(conflicts[0]?.lineNo).toBeDefined();
  expect(() => emitCatalogFromSource(source)).toThrow(/conflicting D record DEM/);
});

test("AC3 — dangling STAR fix fails conversion clearly", () => {
  expect(() => parseCifpSubset(buildDanglingFixSubset())).toThrow(/unknown id MERGE/);
});

test("AC3 — dangling SID fix fails conversion clearly", () => {
  expect(() => parseCifpSubset(buildDanglingSidSubset())).toThrow(/unknown id GHOST/);
});

test("malformed coordinate is a sourced error with airport/section", () => {
  const source = parseFixedWidthCifp(buildMalformedCoordSubset());
  expect(sourceErrorCount(source)).toBeGreaterThanOrEqual(1);
  const malformed = source.diagnostics.find((row) => row.code === "MALFORMED_RECORD");
  expect(malformed?.message).toMatch(/invalid packed latitude/);
  expect(malformed?.airportId).toBe("KSYN");
  expect(malformed?.section).toBe("PC");
  expect(() => emitCatalogFromSource(source)).toThrow(/invalid packed latitude/);
});

test("AC4 — unsupported RF/hold/arc/PT are counted and never emitted as TF", () => {
  const text = buildUnsupportedLegsSubset();
  const source = parseFixedWidthCifp(text);
  expect(source.skippedByType.RF).toBe(1);
  expect(source.skippedByType.HA).toBe(1);
  expect(source.skippedByType.AF).toBe(1);
  expect(source.skippedByType.PI).toBe(1);
  const unsupported = source.stars[0]?.common.filter((leg) => !leg.supported) ?? [];
  expect(unsupported.map((leg) => leg.pathTerminator).sort()).toEqual(["AF", "HA", "PI", "RF"]);
  const catalog = parseCifpSubset(text).catalog;
  const star = catalog.stars[0];
  expect(star?.common.map((leg) => leg.fixId)).toEqual(["NEMAX", "MERGE"]);
  expect(star?.common).toHaveLength(2);
});

test("AC4 — SID RF is counted and never emitted as a TF catalog leg", () => {
  const text = buildUnsupportedSidSubset();
  const source = parseFixedWidthCifp(text);
  expect(source.skippedByType.RF).toBe(1);
  const unsupported = source.sids[0]?.common.filter((leg) => !leg.supported) ?? [];
  expect(unsupported.map((leg) => leg.pathTerminator)).toEqual(["RF"]);
  const catalog = parseCifpSubset(text).catalog;
  expect(catalog.sids[0]?.common.map((leg) => leg.fixId)).toEqual(["SIDEP", "MERGE"]);
  expect(catalog.sids[0]?.common).toHaveLength(2);
});

test("identical duplicate navaid is a warning, not a conflict", () => {
  const text = [
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    vhf({ id: "DEM", name: "DEMO", lat: "N00004800", lon: "E000002400" }),
    vhf({ id: "DEM", name: "DEMO", lat: "N00004800", lon: "E000002400" }),
    pc({ icao: "KSYN", id: "NEMAX", lat: "N00120000", lon: "E000170000" }),
    "",
  ].join("\n");
  const source = parseFixedWidthCifp(text);
  expect(source.navaids.filter((row) => row.id === "DEM")).toHaveLength(1);
  expect(source.diagnostics.some((row) => row.code === "DUPLICATE_IDENTICAL")).toBe(true);
  expect(sourceErrorCount(source)).toBe(0);
});
