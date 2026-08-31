import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import {
  arincRecord,
  detectCifpDialect,
  parsePackedLat,
  parsePackedLon,
  readTrim,
  sectionIdent,
} from "./arincLayout.ts";
import {
  buildConflictSubset,
  buildDanglingFixSubset,
  buildDanglingSidSubset,
  buildFaaLayoutSubset,
  buildFixedWidthSubset,
  buildGroupedRunwaySubset,
  buildMalformedCoordSubset,
  buildUnsupportedLegsSubset,
  buildUnsupportedSidSubset,
  pa,
  pc,
  pf,
  pn,
  ndb,
  vhf,
  vhfDmeOnly,
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

test("AC1 — testdata/cifp/faa-layout-subset.cifp parses offline", () => {
  const text = readFileSync(
    new URL("../../testdata/cifp/faa-layout-subset.cifp", import.meta.url),
    "utf8",
  );
  expect(detectCifpDialect(text)).toBe("fixed-width");
  const source = parseFixedWidthCifp(text);
  expect(sourceErrorCount(source)).toBe(0);
  expect(source.navaids.some((row) => row.id === "SDM")).toBe(true);
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

test("AC4 — SID heading-only, RF, and hold stay skipped and are never emitted as TF", () => {
  const text = buildUnsupportedSidSubset();
  const source = parseFixedWidthCifp(text);
  expect(source.skippedByType.VA).toBe(1);
  expect(source.skippedByType.RF).toBe(1);
  expect(source.skippedByType.HA).toBe(1);
  const unsupported = source.sids[0]?.common.filter((leg) => !leg.supported) ?? [];
  expect(unsupported.map((leg) => leg.pathTerminator).sort()).toEqual(["HA", "RF", "VA"]);
  const catalog = parseCifpSubset(text).catalog;
  expect(catalog.sids[0]?.common.map((leg) => leg.fixId)).toEqual(["SIDEP", "MERGE"]);
  expect(catalog.sids[0]?.common).toHaveLength(2);
});

test("enroute NDB same ident in different ICAO regions does not conflict", () => {
  const text = [
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    ndb({ id: "AA", name: "KENIE", lat: "N47003259", lon: "W096485466" }),
    arincRecord([
      [1, 1, "S"],
      [2, 3, "USA"],
      [5, 1, "D"],
      [6, 1, "B"],
      [14, 4, "AA"],
      [20, 2, "K7"],
      [22, 1, "0"],
      [23, 5, "03410"],
      [33, 9, "N33315982"],
      [42, 10, "W082365173"],
      [94, 30, "CEDAR"],
    ]),
    "",
  ].join("\n");
  const source = parseFixedWidthCifp(text);
  expect(sourceErrorCount(source)).toBe(0);
  expect(source.navaids.filter((row) => row.id === "AA")).toHaveLength(2);
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

test("FAA DME-only D record uses DME lat/lon when VOR columns are blank", () => {
  const text = [
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    vhfDmeOnly({
      id: "SDM",
      name: "SYN DME",
      lat: "N00004800",
      lon: "E000002400",
      classRaw: " DUW ",
    }),
    "",
  ].join("\n");
  const source = parseFixedWidthCifp(text);
  expect(sourceErrorCount(source)).toBe(0);
  const navaid = source.navaids.find((row) => row.id === "SDM");
  expect(navaid?.kind).toBe("DME");
  expect(navaid?.position.latDeg).toBeCloseTo(0.013333333333333334, 10);
  expect(navaid?.position.lonDeg).toBeCloseTo(0.006666666666666667, 10);
});

test("FAA ILS/DME D record does not collide with localizer ident", () => {
  const text = [
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    vhfDmeOnly({
      id: "IDEM",
      name: "ILS DME",
      lat: "S00000420",
      lon: "E000001080",
      classRaw: " ITW ",
      airport: "KSYN",
    }),
    "",
  ].join("\n");
  const source = parseFixedWidthCifp(text);
  expect(sourceErrorCount(source)).toBe(0);
  expect(source.navaids.map((row) => row.id)).toEqual(["IDEMDME"]);
  expect(source.navaids[0]?.kind).toBe("DME");
});

test("FAA terminal NDB uses PN subsection at column 6", () => {
  const line = pn({
    icao: "KSYN",
    id: "SYN",
    name: "SYN NDB",
    lat: "N00000900",
    lon: "E000050000",
  });
  expect(sectionIdent(line)).toBe("PN");
  const source = parseFixedWidthCifp(
    [
      pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
      line,
      "",
    ].join("\n"),
  );
  expect(sourceErrorCount(source)).toBe(0);
  const ndb = source.navaids.find((row) => row.id === "SYN");
  expect(ndb?.kind).toBe("NDB");
  expect(ndb?.airportId).toBe("KSYN");
  expect(ndb?.freqKhz).toBe(241);
});

test("hyphenated FAA approach id and continuation are parsed", () => {
  const text = [
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    pc({ icao: "KSYN", id: "FI27", lat: "N00000000", lon: "E000060000", type: "  F" }),
    pc({ icao: "KSYN", id: "RW27", lat: "N00000000", lon: "E000000000", type: "  G" }),
    pf({
      icao: "KSYN",
      appId: "R10-Y",
      routeType: "A",
      trans: "FI27",
      seq: "010",
      fixId: "FI27",
      path: "IF",
    }),
    pf({
      icao: "KSYN",
      appId: "R10-Y",
      routeType: "R",
      trans: "RW27",
      seq: "010",
      fixId: "FI27",
      path: "IF",
    }),
    arincRecord([
      [1, 1, "S"],
      [5, 1, "P"],
      [7, 4, "KSYN"],
      [13, 1, "F"],
      [14, 6, "R10-Y"],
      [39, 1, "2"],
    ]),
    "",
  ].join("\n");
  const source = parseFixedWidthCifp(text);
  expect(sourceErrorCount(source)).toBe(0);
  expect(source.approaches[0]?.id).toBe("R10-Y");
  expect(source.approaches[0]?.type).toBe("RNAV");
  expect(source.approaches[0]?.runway).toBe("10");
  expect(source.skippedByType["PF-CONT"]).toBe(1);
});

test("HDR + FAA-column fixture is fixed-width and converts", () => {
  const text = buildFaaLayoutSubset();
  expect(detectCifpDialect(text)).toBe("fixed-width");
  const source = parseFixedWidthCifp(text);
  expect(sourceErrorCount(source)).toBe(0);
  expect(source.navaids.some((row) => row.id === "SDM" && row.kind === "DME")).toBe(true);
  expect(source.navaids.some((row) => row.id === "IDEMDME")).toBe(true);
  expect(source.navaids.some((row) => row.id === "SYN" && row.kind === "NDB")).toBe(true);
  expect(source.approaches.some((row) => row.id === "R10-Y" && row.type === "RNAV")).toBe(true);
  const catalog = parseCifpSubset(text).catalog;
  expect(catalog.airportId).toBe("KSYN");
  expect(catalog.navaids.some((row) => row.id === "IDEM")).toBe(true);
  expect(catalog.navaids.some((row) => row.id === "IDEMDME")).toBe(true);
});

test("grouped FAA B SID transitions parse as 26B not a physical PG ident", () => {
  const source = parseFixedWidthCifp(buildGroupedRunwaySubset());
  expect(sourceErrorCount(source)).toBe(0);
  expect(source.runways.map((row) => row.runwayId).sort()).toEqual([
    "RW08L",
    "RW08R",
    "RW08W",
    "RW09L",
    "RW09R",
    "RW10",
    "RW26L",
    "RW26R",
    "RW27L",
    "RW27R",
  ]);
  const sid = source.sids.find((row) => row.id === "GRP1");
  expect(sid?.runwayTransitions.map((row) => row.runwayId).sort()).toEqual([
    "08B",
    "09B",
    "10",
    "26B",
    "27B",
  ]);
  const star = source.stars.find((row) => row.id === "GRR1");
  expect(star?.transitions.map((row) => row.id).sort()).toEqual(["RW10", "RW26B"]);
  expect(source.approaches[0]?.runway).toBe("26L");
});

test("testdata/cifp/grouped-runway.cifp matches the in-memory grouped fixture", () => {
  const text = readFileSync(
    new URL("../../testdata/cifp/grouped-runway.cifp", import.meta.url),
    "utf8",
  );
  expect(text.replace(/\r\n/g, "\n")).toBe(buildGroupedRunwaySubset());
  const catalog = parseCifpSubset(text).catalog;
  expect(catalog.airportId).toBe("KGRP");
  expect(catalog.sids[0]?.runwayTransitions?.map((row) => row.runwayId).sort()).toEqual([
    "08L",
    "08R",
    "09L",
    "09R",
    "10",
    "26L",
    "26R",
    "27L",
    "27R",
  ]);
});
