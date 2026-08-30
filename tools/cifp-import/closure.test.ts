import { expect, test } from "vitest";
import { closeProcedureReferences } from "./closure.ts";
import { FAR, fix, fixtureSource, ident, radiusSeed, runway, tf } from "./closureFixture.ts";
import { emitCatalogFromSource } from "./normalize.ts";
import { catalogDctIds } from "../../src/scenario/procedures/types.ts";

test("AC1 — SID runway-transition, STAR, and approach fixes outside seed radius close", () => {
  const source = fixtureSource();
  const seed = radiusSeed(source);
  expect(seed.selected.fixes.some((row) => row.id === "FARRW")).toBe(false);
  expect(seed.selected.fixes.some((row) => row.id === "FARST")).toBe(false);
  expect(seed.selected.fixes.some((row) => row.id === "FARAF")).toBe(false);
  expect(seed.selected.navaids.some((row) => row.id === "IAAAGS")).toBe(false);

  const result = closeProcedureReferences(source, seed, { kind: "airport-all" });
  const ids = result.closed.fixes.map((row) => row.id).sort();
  expect(ids).toEqual(
    expect.arrayContaining(["FARRW", "FAREN", "FARST", "FARAF", "FARMS", "NEARX"]),
  );
  expect(result.closed.navaids.map((row) => row.id).sort()).toEqual(
    expect.arrayContaining(["IAAA", "IAAAGS"]),
  );
  expect(result.closed.sids).toHaveLength(1);
  expect(result.closed.sids[0]?.runwayTransitions[0]?.legs[0]?.fixId).toBe("FARRW");
  expect(result.addedCounts.fixes).toBeGreaterThan(0);
  expect(result.radiusNm).toBe(20);
});

test("AC2 — every emitted fixId, navaid, approach ref, and missed fix resolves", () => {
  const source = fixtureSource();
  const result = closeProcedureReferences(source, radiusSeed(source), { kind: "airport-all" });
  const { catalog } = emitCatalogFromSource(result.closed, { airportId: "KAAA" });
  const ids = catalogDctIds(catalog);
  for (const sid of catalog.sids) {
    for (const transition of sid.runwayTransitions ?? []) {
      for (const leg of transition.legs) {
        expect(ids.has(leg.fixId), `SID ${sid.id} ${leg.fixId}`).toBe(true);
      }
    }
    for (const leg of sid.common) {
      expect(ids.has(leg.fixId), `SID ${sid.id} common ${leg.fixId}`).toBe(true);
    }
    for (const transition of sid.enrouteTransitions ?? []) {
      for (const leg of transition.legs ?? []) {
        expect(ids.has(leg.fixId), `SID ${sid.id} ${transition.id} ${leg.fixId}`).toBe(true);
      }
    }
  }
  for (const star of catalog.stars) {
    for (const transition of star.transitions) {
      for (const leg of transition.legs) {
        expect(ids.has(leg.fixId), `STAR ${star.id} ${leg.fixId}`).toBe(true);
      }
    }
    for (const leg of star.common) {
      expect(ids.has(leg.fixId), `STAR ${star.id} common ${leg.fixId}`).toBe(true);
    }
  }
  const ils = catalog.approaches.find((row) => row.id === "ILS27");
  expect(ils).toBeDefined();
  expect(ids.has(ils!.locNavaidId!)).toBe(true);
  expect(ids.has(ils!.gsNavaidId!)).toBe(true);
  expect(ids.has(ils!.fafFixId!)).toBe(true);
  expect(ids.has(ils!.thresholdFixId!)).toBe(true);
  expect(ids.has(ils!.missed!.directFixId!)).toBe(true);
});

test("AC3 — closure is deterministic and terminates on repeated / cyclic navaid pairing", () => {
  const source = fixtureSource();
  const loc = source.navaids.find((row) => row.id === "IAAA")!;
  loc.pairedLocId = "IAAAGS";
  const first = closeProcedureReferences(source, radiusSeed(source), { kind: "airport-all" });
  const second = closeProcedureReferences(source, radiusSeed(source), { kind: "airport-all" });
  expect(first.closed.fixes.map((row) => row.identity.key)).toEqual(
    second.closed.fixes.map((row) => row.identity.key),
  );
  expect(first.closed.navaids.map((row) => row.identity.key)).toEqual(
    second.closed.navaids.map((row) => row.identity.key),
  );
  expect(first.closed.sids.map((row) => row.id)).toEqual(second.closed.sids.map((row) => row.id));
  expect(first.closed.navaids.some((row) => row.id === "IAAA")).toBe(true);
  expect(first.closed.navaids.some((row) => row.id === "IAAAGS")).toBe(true);
});

test("AC4 — missing reference names procedure and source record", () => {
  const source = fixtureSource();
  source.stars[0]!.transitions[0]!.legs[0]!.fixId = "GHOST";
  expect(() =>
    closeProcedureReferences(source, radiusSeed(source), { kind: "airport-all" }),
  ).toThrow(/STAR FAR1 \(PE:KAAA:FAR1\).*GHOST: missing reference/);

  const reported = closeProcedureReferences(source, radiusSeed(source), {
    kind: "airport-all",
    onError: "report",
  });
  const missing = reported.diagnostics.find((row) => row.code === "MISSING_REFERENCE");
  expect(missing?.procedureKind).toBe("STAR");
  expect(missing?.procedureId).toBe("FAR1");
  expect(missing?.sourceRecord).toBe("PE:KAAA:FAR1");
  expect(missing?.refId).toBe("GHOST");
  expect(missing?.message).toMatch(/STAR FAR1 \(PE:KAAA:FAR1\)/);
});

test("AC4 — ambiguous identifier names procedure and source record", () => {
  const source = fixtureSource();
  source.fixes.push(fix("NEARX", { latDeg: 0.06, lonDeg: 0.01 }));
  source.fixes[source.fixes.length - 1]!.identity = ident("EA", "KAAA", "NEARX-DUP");
  const reported = closeProcedureReferences(source, radiusSeed(source), {
    kind: "airport-all",
    onError: "report",
  });
  const ambiguous = reported.diagnostics.filter((row) => row.code === "AMBIGUOUS_REFERENCE");
  expect(ambiguous.length).toBeGreaterThanOrEqual(1);
  expect(ambiguous.some((row) => row.procedureId === "OUT1" && row.refId === "NEARX")).toBe(true);
  expect(ambiguous[0]?.sourceRecord).toBeDefined();
  expect(ambiguous[0]?.message).toMatch(/ambiguous/);
});

test("AC4 — cross-airport leakage names procedure and source record", () => {
  const source = fixtureSource();
  source.sids[0]!.common[0]!.fixId = "BBBFX";
  const reported = closeProcedureReferences(source, radiusSeed(source), {
    kind: "airport-all",
    onError: "report",
  });
  const leak = reported.diagnostics.find((row) => row.code === "CROSS_AIRPORT_LEAKAGE");
  expect(leak?.procedureKind).toBe("SID");
  expect(leak?.procedureId).toBe("OUT1");
  expect(leak?.sourceRecord).toBe("PD:KAAA:OUT1");
  expect(leak?.refId).toBe("BBBFX");
  expect(leak?.message).toMatch(/cross-airport leakage \(KBBB\)/);
});

test("AC5 — radius seed is smaller than closure; unrelated airport procedures stay out", () => {
  const source = fixtureSource();
  const seed = radiusSeed(source, {
    stars: [...source.stars],
    fixes: [
      ...source.fixes.filter((row) => row.id === "NEARX" || row.id === "RW27"),
      ...source.fixes.filter((row) => row.airportId === "KBBB"),
    ],
  });
  expect(seed.selected.stars.some((row) => row.id === "BBB1")).toBe(true);
  expect(seed.selected.fixes.some((row) => row.id === "FARRW")).toBe(false);

  const result = closeProcedureReferences(source, seed, { kind: "airport-all" });
  expect(result.closed.stars.map((row) => row.id)).toEqual(["FAR1"]);
  expect(result.closed.stars.some((row) => row.id === "BBB1")).toBe(false);
  expect(result.closed.sids.some((row) => row.airportId === "KBBB")).toBe(false);
  expect(result.closed.fixes.some((row) => row.id === "FARRW")).toBe(true);
  expect(result.closed.fixes.some((row) => row.id === "BBBFX")).toBe(false);
  expect(result.closedCounts.fixes).toBeGreaterThan(result.seedCounts.fixes);
  expect(result.addedCounts.fixes).toBeGreaterThan(0);

  const explicit = closeProcedureReferences(source, seed, {
    kind: "explicit",
    sidIds: ["OUT1"],
  });
  expect(explicit.closed.sids.map((row) => row.id)).toEqual(["OUT1"]);
  expect(explicit.closed.stars).toEqual([]);
  expect(explicit.closed.approaches).toEqual([]);
  expect(explicit.closed.fixes.some((row) => row.id === "FARRW")).toBe(true);
  expect(explicit.closed.fixes.some((row) => row.id === "FARST")).toBe(false);
});

test("unsupported SID path terminator is reported and its fixId still closes", () => {
  const source = fixtureSource();
  source.sids[0]!.common.push(
    tf("FARRF", 40, { pathTerminator: "RF", supported: false, routeType: "2" }),
  );
  source.fixes.push(fix("FARRF", FAR));
  const result = closeProcedureReferences(source, radiusSeed(source), {
    kind: "airport-all",
    onError: "report",
  });
  const unsupported = result.diagnostics.find((row) => row.code === "UNSUPPORTED_ELEMENT");
  expect(unsupported?.procedureId).toBe("OUT1");
  expect(unsupported?.sourceRecord).toBe("PD:KAAA:OUT1");
  expect(unsupported?.message).toMatch(/pathTerminator RF is unsupported/);
  expect(result.closed.fixes.some((row) => row.id === "FARRF")).toBe(true);
});

test("explicit unknown procedure is an actionable diagnostic", () => {
  const source = fixtureSource();
  const reported = closeProcedureReferences(source, radiusSeed(source), {
    kind: "explicit",
    sidIds: ["NOPE"],
    onError: "report",
  });
  const unknown = reported.diagnostics.find((row) => row.code === "UNKNOWN_PROCEDURE");
  expect(unknown?.procedureKind).toBe("SID");
  expect(unknown?.procedureId).toBe("NOPE");
  expect(unknown?.message).toMatch(/SID NOPE is not in the normalized source/);
});

test("source lat/lon of a far SID runway-transition fix is preserved", () => {
  const source = fixtureSource();
  const result = closeProcedureReferences(source, radiusSeed(source), { kind: "airport-all" });
  const farrw = result.closed.fixes.find((row) => row.id === "FARRW");
  expect(farrw?.position).toEqual(FAR);
  const { catalog } = emitCatalogFromSource(result.closed, { airportId: "KAAA" });
  const emitted = catalog.fixes.find((row) => row.id === "FARRW");
  expect(emitted?.latDeg).toBe(FAR.latDeg);
  expect(emitted?.lonDeg).toBe(FAR.lonDeg);
});

test("grouped 26B/27B/08B/09B close to L/R PG records and not water", () => {
  const source = fixtureSource();
  source.runways = [
    ...source.runways,
    runway("KAAA", "RW08L"),
    runway("KAAA", "RW08R"),
    runway("KAAA", "RW08W"),
    runway("KAAA", "RW09L"),
    runway("KAAA", "RW09R"),
    runway("KAAA", "RW26L"),
    runway("KAAA", "RW26R"),
    runway("KAAA", "RW27L"),
    runway("KAAA", "RW27R"),
  ];
  source.sids[0]!.runwayTransitions = [
    {
      runwayId: "26B",
      legs: [tf("FARRW", 10, { routeType: "4", transitionId: "RW26B" })],
    },
    {
      runwayId: "27B",
      legs: [tf("FARRW", 11, { routeType: "4", transitionId: "RW27B" })],
    },
    {
      runwayId: "08B",
      legs: [tf("FARRW", 12, { routeType: "4", transitionId: "RW08B" })],
    },
    {
      runwayId: "09B",
      legs: [tf("FARRW", 13, { routeType: "4", transitionId: "RW09B" })],
    },
  ];
  const result = closeProcedureReferences(source, radiusSeed(source), { kind: "airport-all" });
  const missing = result.diagnostics.filter((row) => row.code === "MISSING_REFERENCE");
  expect(missing).toEqual([]);
  const ids = result.closed.runways.map((row) => row.runwayId).sort();
  expect(ids).toEqual(
    expect.arrayContaining([
      "RW08L",
      "RW08R",
      "RW09L",
      "RW09R",
      "RW26L",
      "RW26R",
      "RW27L",
      "RW27R",
    ]),
  );
  const { catalog } = emitCatalogFromSource(result.closed, { airportId: "KAAA" });
  expect(catalog.sids[0]?.runwayTransitions?.map((row) => row.runwayId).sort()).toEqual([
    "08L",
    "08R",
    "09L",
    "09R",
    "26L",
    "26R",
    "27L",
    "27R",
  ]);
  expect(catalog.sids[0]?.runwayTransitions?.some((row) => row.runwayId === "08W")).toBe(false);
});

test("exact 27 still does not match 27L; 26B does not match 27L", () => {
  const source = fixtureSource();
  source.runways = [runway("KAAA", "RW27L"), runway("KAAA", "RW27R")];
  const reported = closeProcedureReferences(source, radiusSeed(source), {
    kind: "airport-all",
    onError: "report",
  });
  const missing = reported.diagnostics.filter(
    (row) => row.code === "MISSING_REFERENCE" && row.refId === "27",
  );
  expect(missing.length).toBeGreaterThanOrEqual(1);

  source.sids[0]!.runwayTransitions[0]!.runwayId = "26B";
  const groupedWrong = closeProcedureReferences(source, radiusSeed(source), {
    kind: "airport-all",
    onError: "report",
  });
  expect(
    groupedWrong.diagnostics.some((row) => row.code === "MISSING_REFERENCE" && row.refId === "26B"),
  ).toBe(true);
});
