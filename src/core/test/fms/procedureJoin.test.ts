import { expect, test } from "vitest";
import { procedureRouteContainingFix } from "../../fms/procedureJoin";
import type { CatalogStar } from "../../fms/vertical";
import proceduresJson from "../../../scenario/data/kdem/procedures.json";

const dem1 = proceduresJson.stars as CatalogStar[];

test("NEMAX joins DEMO ONE north remaining legs", () => {
  expect(procedureRouteContainingFix({ stars: dem1 }, "NEMAX")).toEqual({
    starId: "DEM1",
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
    toFixIndex: 0,
  });
});

test("navaid and unknown ids stay undefined so DCT stays DIRECT", () => {
  expect(procedureRouteContainingFix({ stars: dem1 }, "DEM")).toBeUndefined();
  expect(procedureRouteContainingFix({ stars: dem1 }, "NOPE")).toBeUndefined();
  expect(procedureRouteContainingFix(undefined, "NEMAX")).toBeUndefined();
});
