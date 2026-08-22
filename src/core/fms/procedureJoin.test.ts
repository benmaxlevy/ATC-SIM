import { expect, test } from "vitest";
import { procedureRouteContainingFix } from "./procedureJoin";
import type { CatalogStar } from "./vertical";
import proceduresJson from "../../scenario/data/kdem/procedures.json";

const dem1 = proceduresJson.stars as CatalogStar[];

test("NEMAX joins DEMO ONE north remaining legs", () => {
  expect(procedureRouteContainingFix({ stars: dem1 }, "NEMAX")).toEqual({
    starId: "DEM1",
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
    toFixIndex: 0,
  });
});

test("NJOIN joins the north STAR from that fix", () => {
  expect(procedureRouteContainingFix({ stars: dem1 }, "njoin")).toEqual({
    starId: "DEM1",
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
    toFixIndex: 2,
  });
});

test("SEMAX joins the south transition", () => {
  expect(procedureRouteContainingFix({ stars: dem1 }, "SEMAX")).toEqual({
    starId: "DEM1",
    routeFixIds: ["SEMAX", "SELBO", "SJOIN", "MERGE"],
    toFixIndex: 0,
  });
});

test("MERGE joins common only, not a random transition", () => {
  expect(procedureRouteContainingFix({ stars: dem1 }, "MERGE")).toEqual({
    starId: "DEM1",
    routeFixIds: ["MERGE"],
    toFixIndex: 0,
  });
});

test("navaid and unknown ids stay undefined so DCT stays DIRECT", () => {
  expect(procedureRouteContainingFix({ stars: dem1 }, "DEM")).toBeUndefined();
  expect(procedureRouteContainingFix({ stars: dem1 }, "NORMA")).toBeUndefined();
  expect(procedureRouteContainingFix({ stars: dem1 }, "NOPE")).toBeUndefined();
  expect(procedureRouteContainingFix(undefined, "NEMAX")).toBeUndefined();
});

test("preferStarId picks the named SID over a STAR sharing the fix", () => {
  const catalog = {
    stars: dem1,
    sids: [{ id: "KDEM1", legs: [{ fixId: "NEMAX" }, { fixId: "RW27" }] }],
  };
  expect(procedureRouteContainingFix(catalog, "NEMAX", "KDEM1")).toEqual({
    starId: "KDEM1",
    routeFixIds: ["NEMAX", "RW27"],
    toFixIndex: 0,
  });
  expect(procedureRouteContainingFix(catalog, "NEMAX")).toEqual({
    starId: "DEM1",
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
    toFixIndex: 0,
  });
});
