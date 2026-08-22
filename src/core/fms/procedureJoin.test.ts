import { expect, test } from "vitest";
import { joinNamedProcedure, procedureRouteContainingFix } from "./procedureJoin";
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

test("joinNamedProcedure keeps the current STAR and does not guess a transition without a hint", () => {
  expect(
    joinNamedProcedure({
      catalog: { stars: dem1 },
      procedureId: "DEM1",
      current: {
        type: "PROCEDURE",
        starId: "DEM1",
        routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
        toFixIndex: 2,
      },
    }),
  ).toEqual({
    starId: "DEM1",
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
    toFixIndex: 2,
  });
  expect(joinNamedProcedure({ catalog: { stars: dem1 }, procedureId: "DEM1" })).toBeUndefined();
});

test("joinNamedProcedure uses the nearest published fix when position is known", () => {
  const xy: Record<string, { xNm: number; yNm: number }> = {
    NEMAX: { xNm: 17, yNm: 12 },
    NELBO: { xNm: 16, yNm: 7 },
    NJOIN: { xNm: 12, yNm: 4 },
    MERGE: { xNm: 10, yNm: 0 },
    SEMAX: { xNm: 17, yNm: -12 },
    SELBO: { xNm: 16, yNm: -7 },
    SJOIN: { xNm: 12, yNm: -4 },
  };
  expect(
    joinNamedProcedure({
      catalog: { stars: dem1 },
      procedureId: "DEM1",
      xNm: 20,
      yNm: -12,
      fixXy: (id) => xy[id],
    }),
  ).toEqual({
    starId: "DEM1",
    routeFixIds: ["SEMAX", "SELBO", "SJOIN", "MERGE"],
    toFixIndex: 0,
  });
});

test("joinNamedProcedure joins a unique SID from the start", () => {
  expect(
    joinNamedProcedure({
      catalog: { sids: [{ id: "KDEM1", legs: [{ fixId: "OCTTA" }, { fixId: "DEMEE" }] }] },
      procedureId: "KDEM1",
    }),
  ).toEqual({
    starId: "KDEM1",
    routeFixIds: ["OCTTA", "DEMEE"],
    toFixIndex: 0,
  });
});
