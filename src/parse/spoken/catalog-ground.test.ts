import { expect, test } from "vitest";
import {
  catalogFixAliases,
  catalogProcedureAliases,
  compactProcedureKey,
  groundFixToCatalog,
  groundInstructionFixes,
  groundInstructionProcedures,
  groundProcedureToCatalog,
  normalizeFixKey,
  proceduresFromCatalog,
  sanitizeFixIds,
} from "./catalog-ground";

const KDEM = ["NEMAX", "SEMAX", "NELBO", "SELBO", "MERGE", "FI27", "RW27", "MISSD", "DEM", "OCT"];
const DEM1 = { id: "DEM1", name: "DEMO ONE" };

test("sanitizeFixIds uppercases, drops junk, caps the list", () => {
  expect(sanitizeFixIds(["semax", "SEMAX", "nope!", "FI27", "x"])).toEqual(["SEMAX", "FI27"]);
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

test("groundInstructionProcedures snaps DESCEND_VIA and JOIN_PROCEDURE", () => {
  expect(
    groundInstructionProcedures(
      [
        { type: "DESCEND_VIA", procedureId: "DEMO1" },
        { type: "JOIN_PROCEDURE", procedureId: "DEMO1" },
        { type: "IDENT" },
      ],
      [DEM1],
    ),
  ).toEqual([
    { type: "DESCEND_VIA", procedureId: "DEM1" },
    { type: "JOIN_PROCEDURE", procedureId: "DEM1" },
    { type: "IDENT" },
  ]);
});

test("proceduresFromCatalog keeps star names", () => {
  expect(
    proceduresFromCatalog({
      stars: [{ id: "DEM1", name: "DEMO ONE" }],
    }),
  ).toEqual([{ id: "DEM1", name: "DEMO ONE" }]);
});
