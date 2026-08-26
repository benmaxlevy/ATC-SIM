import { describe, expect, test } from "vitest";
import { loadCatalog } from "./loadCatalog";
import { findSidProcedure, sidRouteFixIds, sidSpokenName } from "./sidHelpers";
import type { ProcedureCatalog } from "./types";
import multiSidJson from "../../../testdata/catalogs/multi-sid.json";

const kdemCatalog = loadCatalog("src/scenario/data/kdem");

const multiCatalog: ProcedureCatalog = {
  schemaVersion: 1,
  airportId: multiSidJson.airportId,
  name: multiSidJson.name,
  magVarDeg: 0,
  fieldElevFt: 100,
  arp: { latDeg: 40, lonDeg: -74 },
  navaids: [],
  fixes: multiSidJson.fixes.map((f) => ({
    id: f.id,
    kind: f.kind as "WAYPOINT" | "THRESHOLD",
    xNm: f.xNm,
    yNm: f.yNm,
  })),
  stars: [],
  approaches: [],
  sids: multiSidJson.sids as ProcedureCatalog["sids"],
};

describe("sidRouteFixIds — KDEM BAY1 procedure", () => {
  test("AC2 — sidRouteFixIds(catalog, 'BAY1', '27', 'NORMA') resolves full ordered route", () => {
    const route = sidRouteFixIds(kdemCatalog, "BAY1", "27", "NORMA");
    expect(route).toEqual(["BAYEE", "BAYNW", "NORMA"]);
  });

  test("resolves RWY 27 via OCTTA transition", () => {
    const route = sidRouteFixIds(kdemCatalog, "BAY1", "27", "OCTTA");
    expect(route).toEqual(["BAYEE", "BAYSO", "OCTTA"]);
  });

  test("resolves RWY 27 without enroute transition", () => {
    const route = sidRouteFixIds(kdemCatalog, "BAY1", "27");
    expect(route).toEqual(["BAYEE"]);
  });

  test("resolves enroute transition without runway transition", () => {
    const route = sidRouteFixIds(kdemCatalog, "BAY1", undefined, "NORMA");
    expect(route).toEqual(["BAYNW", "NORMA"]);
  });

  test("resolves common route only when runway and transition are omitted", () => {
    const route = sidRouteFixIds(kdemCatalog, "BAY1");
    expect(route).toEqual([]);
  });

  test("case insensitivity and whitespace trimming", () => {
    const route = sidRouteFixIds(kdemCatalog, " bay1 ", " 27 ", " norma ");
    expect(route).toEqual(["BAYEE", "BAYNW", "NORMA"]);
  });

  test("throws on unknown SID", () => {
    expect(() => sidRouteFixIds(kdemCatalog, "NONEXISTENT", "27", "NORMA")).toThrow(
      /Unknown SID NONEXISTENT/,
    );
  });

  test("throws on unknown runway transition", () => {
    expect(() => sidRouteFixIds(kdemCatalog, "BAY1", "09", "NORMA")).toThrow(
      /Unknown runway transition 09 on SID BAY1/,
    );
  });

  test("throws on unknown enroute transition", () => {
    expect(() => sidRouteFixIds(kdemCatalog, "BAY1", "27", "INVALID")).toThrow(
      /Unknown enroute transition INVALID on SID BAY1/,
    );
  });
});

describe("sidRouteFixIds — generic multi-SID fixture (AC5)", () => {
  test("AC5 — resolves multi-SID fixture DEP1 with runway 27 and NORTH exit", () => {
    const route = sidRouteFixIds(multiCatalog, "DEP1", "27", "NORTH");
    expect(route).toEqual(["RW27", "DRAFT", "MIDDL", "NORTH"]);
  });

  test("AC5 — resolves multi-SID fixture DEP1 with runway 09 and SOUTH exit", () => {
    const route = sidRouteFixIds(multiCatalog, "DEP1", "09", "SOUTH");
    expect(route).toEqual(["RW09", "EASTY", "MIDDL", "SOUTH"]);
  });

  test("AC5 — resolves multi-SID fixture DEP2 common only", () => {
    const route = sidRouteFixIds(multiCatalog, "DEP2");
    expect(route).toEqual(["DRAFT", "MIDDL"]);
  });

  test("findSidProcedure returns procedure object", () => {
    const sid = findSidProcedure(multiCatalog, "dep1");
    expect(sid.id).toBe("DEP1");
    expect(sid.name).toBe("DEPARTURE ONE");
  });
});

describe("Extensibility — data-first, no hardcoded facility branching", () => {
  test("sidHelpers source contains no hardcoded facility or procedure literals", () => {
    const sources = import.meta.glob("./sidHelpers.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const src = sources["./sidHelpers.ts"] ?? "";
    expect(src).not.toMatch(/["']KDEM["']/);
    expect(src).not.toMatch(/["']DEM1["']/);
    expect(src).not.toMatch(/["']BAY1["']/);
    expect(src).not.toMatch(/["']NORMA["']/);
    expect(src).not.toMatch(/["']OCTTA["']/);
  });
});

describe("sidSpokenName (AC2)", () => {
  test("AC2 — sidSpokenName(catalog, 'BAY1') returns 'BAY ONE' from catalog metadata", () => {
    expect(sidSpokenName(kdemCatalog, "BAY1")).toBe("BAY ONE");
    expect(sidSpokenName({ sids: [{ id: "BAY1", name: "BAY ONE" }] }, "BAY1")).toBe("BAY ONE");
  });

  test("resolves spoken name from multi-SID catalog", () => {
    expect(sidSpokenName(multiCatalog, "DEP1")).toBe("DEPARTURE ONE");
    expect(sidSpokenName(multiCatalog, "DEP2")).toBe("DEPARTURE TWO");
  });

  test("falls back to sidId when not found in catalog or catalog is missing", () => {
    expect(sidSpokenName(kdemCatalog, "UNKNOWN_SID")).toBe("UNKNOWN_SID");
    expect(sidSpokenName(null, "BAY1")).toBe("BAY1");
    expect(sidSpokenName(undefined, "BAY1")).toBe("BAY1");
    expect(sidSpokenName({ sids: [] }, "MY_SID")).toBe("MY_SID");
  });

  test("case insensitivity and trimming", () => {
    expect(sidSpokenName(kdemCatalog, " bay1 ")).toBe("BAY ONE");
  });
});
