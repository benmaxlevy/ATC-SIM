import { expect, test } from "vitest";
import {
  approachesFromCatalog,
  catalogApproachAliases,
  catalogFixAliases,
  catalogProcedureAliases,
  compactProcedureKey,
  foldSpokenFix,
  groundApproachToCatalog,
  groundFixToCatalog,
  groundInstructionApproaches,
  groundInstructionFixes,
  groundInstructionProcedures,
  groundProcedureToCatalog,
  normalizeFixKey,
  proceduresFromCatalog,
  sanitizeCatalogApproaches,
  sanitizeFixIds,
} from "./catalog-ground";

const KDEM = ["NEMAX", "SEMAX", "NELBO", "SELBO", "MERGE", "FI27", "RW27", "MISSD", "DEM", "OCT"];
const DEM1 = { id: "DEM1", name: "DEMO ONE" };
const ILS27 = { id: "ILS27", name: "ILS RWY 27", runway: "27" };

test("sanitizeFixIds uppercases, drops junk, keeps lists past the STT header cap of 64", () => {
  expect(sanitizeFixIds(["semax", "SEMAX", "nope!", "FI27", "x"])).toEqual(["SEMAX", "FI27"]);
  const many = Array.from({ length: 80 }, (_, i) => {
    const tens = String.fromCharCode(65 + Math.floor(i / 26));
    const ones = String.fromCharCode(65 + (i % 26));
    return `F${tens}${ones}`;
  });
  expect(sanitizeFixIds(many)).toHaveLength(80);
});

test("C-Max / see max normalize to CMAX / SEEMAX", () => {
  expect(normalizeFixKey("C-Max")).toBe("CMAX");
  expect(normalizeFixKey("see max")).toBe("SEEMAX");
  expect(normalizeFixKey("c max")).toBe("CMAX");
});

test("SEMAX aliases cover the C-Max ASR misspelling", () => {
  expect(catalogFixAliases("SEMAX")).toEqual(expect.arrayContaining(["SEMAX", "CMAX", "SEEMAX"]));
  expect(groundFixToCatalog("C-Max", KDEM)).toBe("SEMAX");
  expect(groundFixToCatalog("c max", KDEM)).toBe("SEMAX");
  expect(groundFixToCatalog("see max", KDEM)).toBe("SEMAX");
  expect(groundFixToCatalog("SEMAX", KDEM)).toBe("SEMAX");
});

test("unique edit-distance-1 still snaps SEEMAX; ambiguous / unknown stay null", () => {
  expect(groundFixToCatalog("SEEMAX", KDEM)).toBe("SEMAX");
  expect(groundFixToCatalog("NOPE", KDEM)).toBeNull();
  expect(groundFixToCatalog("CMAX", ["SEMAX", "NEMAX"])).toBe("SEMAX");
  expect(groundFixToCatalog(null, KDEM)).toBeNull();
  expect(groundFixToCatalog("SEMAX", [])).toBeNull();
});

test("CMAX does not steal NEMAX when both are listed", () => {
  expect(groundFixToCatalog("CMAX", ["NEMAX", "SEMAX"])).toBe("SEMAX");
  expect(groundFixToCatalog("NEMAX", KDEM)).toBe("NEMAX");
});

test("groundInstructionFixes snaps DIRECT and CROSS only", () => {
  expect(
    groundInstructionFixes(
      [
        { type: "DIRECT", fixId: "C-Max" },
        { type: "CROSS", fixId: "cmax", altitudeFt: 4000, restriction: "AT" },
        { type: "IDENT" },
      ],
      KDEM,
    ),
  ).toEqual([
    { type: "DIRECT", fixId: "SEMAX" },
    { type: "CROSS", fixId: "SEMAX", altitudeFt: 4000, restriction: "AT" },
    { type: "IDENT" },
  ]);
});

test("demo 1 / demo one / DEMO ONE compact to DEMO1 / DEMOONE", () => {
  expect(compactProcedureKey("demo 1")).toBe("DEMO1");
  expect(compactProcedureKey("demo one")).toBe("DEMO1");
  expect(compactProcedureKey("DEMO ONE")).toBe("DEMO1");
  expect(compactProcedureKey("DEM1")).toBe("DEM1");
});

test("DEM1 aliases include the published name as DEMO1", () => {
  expect(catalogProcedureAliases(DEM1)).toEqual(expect.arrayContaining(["DEM1", "DEMO1"]));
});

test("spoken demo 1 snaps to catalog DEM1", () => {
  const catalog = [DEM1];
  expect(groundProcedureToCatalog("demo 1", catalog)).toBe("DEM1");
  expect(groundProcedureToCatalog("demo one", catalog)).toBe("DEM1");
  expect(groundProcedureToCatalog("DEMO ONE", catalog)).toBe("DEM1");
  expect(groundProcedureToCatalog("DEM1", catalog)).toBe("DEM1");
  expect(groundProcedureToCatalog("DEMO1", catalog)).toBe("DEM1");
  expect(groundProcedureToCatalog("NOPE", catalog)).toBeNull();
});

test("groundInstructionProcedures snaps DESCEND_VIA, CLIMB_VIA, and JOIN_PROCEDURE", () => {
  const BAY1 = { id: "BAY1", name: "BAY ONE DEPARTURE" };
  expect(
    groundInstructionProcedures(
      [
        { type: "DESCEND_VIA", procedureId: "DEMO1" },
        { type: "CLIMB_VIA", procedureId: "BAY 1" },
        { type: "JOIN_PROCEDURE", procedureId: "BAY ONE" },
        { type: "IDENT" },
      ],
      [DEM1, BAY1],
    ),
  ).toEqual([
    { type: "DESCEND_VIA", procedureId: "DEM1" },
    { type: "CLIMB_VIA", procedureId: "BAY1" },
    { type: "JOIN_PROCEDURE", procedureId: "BAY1" },
    { type: "IDENT" },
  ]);
});

test("proceduresFromCatalog extracts both STARs and SIDs dynamically from catalog", () => {
  expect(
    proceduresFromCatalog({
      stars: [{ id: "DEM1", name: "DEMO ONE" }],
      sids: [{ id: "BAY1", name: "BAY ONE DEPARTURE" }],
    }),
  ).toEqual([
    { id: "DEM1", name: "DEMO ONE" },
    { id: "BAY1", name: "BAY ONE DEPARTURE" },
  ]);
});

test("groundFixToCatalog snaps SID departure fixes (BAYEE, BAYNW, BAYSO, NORMA, OCTTA)", () => {
  const fixes = ["BAYEE", "BAYNW", "BAYSO", "NORMA", "OCTTA", "MISSD"];
  expect(groundFixToCatalog("bay ee", fixes)).toBe("BAYEE");
  expect(groundFixToCatalog("BAY-EE", fixes)).toBe("BAYEE");
  expect(groundFixToCatalog("bay nw", fixes)).toBe("BAYNW");
  expect(groundFixToCatalog("bay so", fixes)).toBe("BAYSO");
  expect(groundFixToCatalog("norma", fixes)).toBe("NORMA");
  expect(groundFixToCatalog("octta", fixes)).toBe("OCTTA");
});

test("sanitizeCatalogApproaches sanitizes and formats", () => {
  expect(
    sanitizeCatalogApproaches([
      { id: "ils27", name: "ILS RWY 27", runway: "27" },
      { id: "ILS27" },
      { id: "bad!!!" },
    ]),
  ).toEqual([{ id: "ILS27", name: "ILS RWY 27", runway: "27" }]);
});

test("catalogApproachAliases contains standard spoken and typed variants", () => {
  const aliases = catalogApproachAliases(ILS27);
  expect(aliases).toEqual(expect.arrayContaining(["ILS27", "IL27", "RW27", "RWY27", "27"]));
});

test("groundApproachToCatalog snaps noisy tokens to catalog ILS27", () => {
  const catalog = [ILS27];
  expect(groundApproachToCatalog("IL27", catalog)).toBe("ILS27");
  expect(groundApproachToCatalog("RW27", catalog)).toBe("ILS27");
  expect(groundApproachToCatalog("RWY27", catalog)).toBe("ILS27");
  expect(groundApproachToCatalog("27", catalog)).toBe("ILS27");
  expect(groundApproachToCatalog("ILS 27", catalog)).toBe("ILS27");
  expect(groundApproachToCatalog("ILS-27", catalog)).toBe("ILS27");
  expect(groundApproachToCatalog("LOC27", catalog)).toBe("ILS27");
  expect(groundApproachToCatalog("ILS", catalog)).toBe("ILS27");
  expect(groundApproachToCatalog("NOPE", catalog)).toBeNull();
});

test("groundInstructionApproaches snaps CLEARED_APPROACH, INTERCEPT_LOCALIZER, EXPECT_APPROACH", () => {
  expect(
    groundInstructionApproaches(
      [
        { type: "CLEARED_APPROACH", approachId: "RW27" },
        { type: "INTERCEPT_LOCALIZER", approachId: "IL27" },
        { type: "EXPECT_APPROACH", approachId: "27" },
        { type: "DIRECT", fixId: "NEMAX" },
      ],
      [ILS27],
    ),
  ).toEqual([
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
    { type: "INTERCEPT_LOCALIZER", approachId: "ILS27" },
    { type: "EXPECT_APPROACH", approachId: "ILS27" },
    { type: "DIRECT", fixId: "NEMAX" },
  ]);
});

test("approachesFromCatalog extracts approaches with runway", () => {
  expect(
    approachesFromCatalog({
      approaches: [{ id: "ILS27", name: "ILS RWY 27", runway: "27" }],
    }),
  ).toEqual([{ id: "ILS27", name: "ILS RWY 27", runway: "27" }]);
});

test("Haynes / AJ spoken names snap to unique catalog ids", () => {
  const fixes = ["HAINZ", "AJAAY", "NEMAX", "SEMAX"];
  expect(foldSpokenFix("HAINZ")).toBe("HAINS");
  expect(catalogFixAliases("AJAAY")).toEqual(expect.arrayContaining(["AJAAY", "AJAY", "AJ"]));
  expect(groundFixToCatalog("Haynes", fixes)).toBe("HAINZ");
  expect(groundFixToCatalog("hainz", fixes)).toBe("HAINZ");
  expect(groundFixToCatalog("AJ", fixes)).toBe("AJAAY");
  expect(groundFixToCatalog("Ajay", fixes)).toBe("AJAAY");
});

test("spoken Haynes still snaps when the id sits past the old 64-fix STT cap", () => {
  const padding = Array.from({ length: 70 }, (_, i) => {
    const tens = String.fromCharCode(65 + Math.floor(i / 26));
    const ones = String.fromCharCode(65 + (i % 26));
    return `Z${tens}${ones}`;
  });
  expect(groundFixToCatalog("Haynes", [...padding, "HAINZ"])).toBe("HAINZ");
});

test("sanitizeCatalogApproaches keeps CIFP ids including hyphen suffixes", () => {
  expect(
    sanitizeCatalogApproaches([
      { id: "I26R", name: "ILS RWY 26R", runway: "26R", type: "ILS" },
      { id: "H28-Z", name: "RNAV RWY 28", runway: "28", type: "RNAV" },
    ]),
  ).toEqual([
    { id: "I26R", name: "ILS RWY 26R", runway: "26R", type: "ILS" },
    { id: "H28-Z", name: "RNAV RWY 28", runway: "28", type: "RNAV" },
  ]);
});

test("ILS26R snaps to CIFP I26R when LOC/RNAV share the runway", () => {
  const catalog = [
    { id: "I26R", name: "ILS RWY 26R", runway: "26R", type: "ILS" },
    { id: "L26R", name: "LOC RWY 26R", runway: "26R", type: "LOC" },
    { id: "H26RZ", name: "RNAV RWY 26R", runway: "26R", type: "RNAV" },
  ];
  expect(catalogApproachAliases(catalog[0]!)).toEqual(expect.arrayContaining(["I26R", "ILS26R"]));
  expect(catalogApproachAliases(catalog[1]!)).not.toContain("ILS26R");
  expect(groundApproachToCatalog("ILS26R", catalog)).toBe("I26R");
  expect(groundApproachToCatalog("ILS 26R", catalog)).toBe("I26R");
  expect(groundApproachToCatalog("I26R", catalog)).toBe("I26R");
  expect(
    groundInstructionApproaches([{ type: "CLEARED_APPROACH", approachId: "ILS26R" }], catalog),
  ).toEqual([{ type: "CLEARED_APPROACH", approachId: "I26R" }]);
});

test("approachesFromCatalog keeps CIFP type so ILS aliases stay unique", () => {
  expect(
    approachesFromCatalog({
      approaches: [{ id: "I26R", name: "ILS RWY 26R", runway: "26R", type: "ILS" }],
    }),
  ).toEqual([{ id: "I26R", name: "ILS RWY 26R", runway: "26R", type: "ILS" }]);
});
