import { expect, test } from "vitest";
import {
  catalogProcedureAliases,
  compactProcedureKey,
  groundInstructionProcedures,
  groundProcedureToCatalog,
  proceduresFromCatalog,
} from "./procedure-ground";

const DEM1 = { id: "DEM1", name: "DEMO ONE" };

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

test("groundInstructionProcedures snaps DESCEND_VIA only", () => {
  expect(
    groundInstructionProcedures(
      [
        { type: "DESCEND_VIA", procedureId: "DEMO1" },
        { type: "IDENT" },
      ],
      [DEM1],
    ),
  ).toEqual([
    { type: "DESCEND_VIA", procedureId: "DEM1" },
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
