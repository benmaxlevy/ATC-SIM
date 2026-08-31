import { expect, test } from "vitest";
import {
  joinNamedProcedure,
  joinStarTransition,
  procedureRouteContainingFix,
} from "./procedureJoin";
import type { CatalogSid, CatalogStar } from "./vertical";
import proceduresJson from "../../scenario/data/kdem/procedures.json";
import sidsJson from "../../scenario/data/kdem/sids.json";

const dem1 = proceduresJson.stars as CatalogStar[];
const kdemSids = sidsJson.sids as CatalogSid[];

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

test("MERGE joins DEM1 transition at MERGE fix", () => {
  expect(procedureRouteContainingFix({ stars: dem1 }, "MERGE")).toEqual({
    starId: "DEM1",
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
    toFixIndex: 3,
  });
});

test("WEMER joins DEM1 East Flow transition at WEMER fix", () => {
  expect(procedureRouteContainingFix({ stars: dem1 }, "WEMER")).toEqual({
    starId: "DEM1",
    routeFixIds: ["WEMAX", "WELBO", "WENJO", "WEMER"],
    toFixIndex: 3,
  });
});

test("WEMAX and SAMAX join DEM1 East Flow transitions", () => {
  expect(procedureRouteContainingFix({ stars: dem1 }, "WEMAX")).toEqual({
    starId: "DEM1",
    routeFixIds: ["WEMAX", "WELBO", "WENJO", "WEMER"],
    toFixIndex: 0,
  });
  expect(procedureRouteContainingFix({ stars: dem1 }, "SAMAX")).toEqual({
    starId: "DEM1",
    routeFixIds: ["SAMAX", "SALBO", "SANJO", "WEMER"],
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

test("procedureRouteContainingFix finds SID fixes across transitions", () => {
  const catalog = { sids: kdemSids };
  // BAYEE is on runway 27 transition of BAY1
  const bayeeJoin = procedureRouteContainingFix(catalog, "BAYEE");
  expect(bayeeJoin).toBeDefined();
  expect(bayeeJoin?.starId).toBe("BAY1");
  expect(bayeeJoin?.toFixIndex).toBe(0);
  expect(bayeeJoin?.routeFixIds[0]).toBe("BAYEE");

  // BAYNW is on the NORMA transition of BAY1
  const baynwJoin = procedureRouteContainingFix(catalog, "BAYNW");
  expect(baynwJoin).toBeDefined();
  expect(baynwJoin?.starId).toBe("BAY1");
  expect(baynwJoin?.toFixIndex).toBe(1);

  // NORMA is on the NORMA enroute transition of BAY1
  const normaJoin = procedureRouteContainingFix(catalog, "NORMA");
  expect(normaJoin).toBeDefined();
  expect(normaJoin?.starId).toBe("BAY1");
  expect(normaJoin?.toFixIndex).toBe(2);
  expect(normaJoin?.routeFixIds).toEqual(["BAYEE", "BAYNW", "NORMA"]);

  // BAYES is on runway 09 transition of BAY1
  const bayesJoin = procedureRouteContainingFix(catalog, "BAYES");
  expect(bayesJoin).toBeDefined();
  expect(bayesJoin?.starId).toBe("BAY1");
  expect(bayesJoin?.toFixIndex).toBe(0);
  expect(bayesJoin?.routeFixIds[0]).toBe("BAYES");

  // BAYNE is on the RW09 NORMA transition of BAY1
  const bayneJoin = procedureRouteContainingFix(catalog, "BAYNE");
  expect(bayneJoin).toBeDefined();
  expect(bayneJoin?.starId).toBe("BAY1");
  expect(bayneJoin?.toFixIndex).toBe(1);
  expect(bayneJoin?.routeFixIds).toEqual(["BAYES", "BAYNE", "NORMA"]);

  // BAYSE is on the RW09 OCTTA transition of BAY1
  const bayseJoin = procedureRouteContainingFix(catalog, "BAYSE");
  expect(bayseJoin).toBeDefined();
  expect(bayseJoin?.starId).toBe("BAY1");
  expect(bayseJoin?.toFixIndex).toBe(1);
  expect(bayseJoin?.routeFixIds).toEqual(["BAYES", "BAYSE", "OCTTA"]);
});

/** Synthetic STAR: two enroute transitions plus one runway-tagged. Not facility data. */
const synStar: CatalogStar = {
  id: "SYN1",
  name: "SYN ONE",
  common: [{ fixId: "MERGE" }],
  transitions: [
    { id: "N", name: "NORTH", legs: [{ fixId: "NA" }, { fixId: "NB" }] },
    { id: "S", name: "SOUTH", legs: [{ fixId: "SA" }, { fixId: "SB" }] },
    { id: "RW09", name: "RUNWAY NINE", runwayId: "09", legs: [{ fixId: "RA" }] },
  ],
};

const branchStar: CatalogStar = {
  id: "BRN1",
  transitions: [
    { id: "E", legs: [{ fixId: "E1" }, { fixId: "JOIN" }, { fixId: "EASTEND" }] },
    { id: "W", legs: [{ fixId: "W1" }, { fixId: "JOIN" }, { fixId: "WESTEND" }] },
  ],
};

test("joinStarTransition rebuilds remaining route at the shared MERGE fix", () => {
  expect(
    joinStarTransition({
      catalog: { stars: [synStar] },
      procedureId: "SYN1",
      transitionId: "S",
      remainingFixIds: ["NB", "MERGE"],
    }),
  ).toEqual({
    ok: true,
    join: { starId: "SYN1", routeFixIds: ["MERGE"], toFixIndex: 0 },
  });
});

test("joinStarTransition permits a runway-tagged transition only on the matching runway", () => {
  expect(
    joinStarTransition({
      catalog: { stars: [synStar] },
      procedureId: "SYN1",
      transitionId: "RW09",
      activeRunwayId: "09",
      remainingFixIds: ["NB", "MERGE"],
    }),
  ).toEqual({
    ok: true,
    join: { starId: "SYN1", routeFixIds: ["MERGE"], toFixIndex: 0 },
  });
  expect(
    joinStarTransition({
      catalog: { stars: [synStar] },
      procedureId: "SYN1",
      transitionId: "RW09",
      activeRunwayId: "27",
      remainingFixIds: ["NB", "MERGE"],
    }),
  ).toEqual({ ok: false, reason: "UNKNOWN_TRANSITION" });
});

test("joinStarTransition rejects unknown STAR, unknown transition, and past-branch", () => {
  expect(
    joinStarTransition({
      catalog: { stars: [synStar] },
      procedureId: "NOPE",
      transitionId: "N",
      remainingFixIds: ["NA", "NB", "MERGE"],
    }),
  ).toEqual({ ok: false, reason: "UNKNOWN_PROCEDURE" });
  expect(
    joinStarTransition({
      catalog: { stars: [synStar] },
      procedureId: "SYN1",
      transitionId: "ZZ",
      remainingFixIds: ["NA", "NB", "MERGE"],
    }),
  ).toEqual({ ok: false, reason: "UNKNOWN_TRANSITION" });
  expect(
    joinStarTransition({
      catalog: { stars: [branchStar] },
      procedureId: "BRN1",
      transitionId: "W",
      remainingFixIds: ["E1", "JOIN", "EASTEND"],
    }),
  ).toEqual({
    ok: true,
    join: { starId: "BRN1", routeFixIds: ["JOIN", "WESTEND"], toFixIndex: 0 },
  });
  expect(
    joinStarTransition({
      catalog: { stars: [branchStar] },
      procedureId: "BRN1",
      transitionId: "W",
      remainingFixIds: ["EASTEND"],
    }),
  ).toEqual({ ok: false, reason: "NOT_ON_COURSE" });
});

test("joinNamedProcedure with transitionId does not keep the current route or guess", () => {
  expect(
    joinNamedProcedure({
      catalog: { stars: [synStar] },
      procedureId: "SYN1",
      transitionId: "S",
      current: {
        type: "PROCEDURE",
        starId: "SYN1",
        routeFixIds: ["NA", "NB", "MERGE"],
        toFixIndex: 1,
      },
    }),
  ).toEqual({ starId: "SYN1", routeFixIds: ["MERGE"], toFixIndex: 0 });
  expect(
    joinNamedProcedure({
      catalog: { stars: [synStar] },
      procedureId: "SYN1",
    }),
  ).toBeUndefined();
});

test("joinStarTransition rejects ambiguous duplicate transition ids", () => {
  const dup: CatalogStar = {
    id: "SYN1",
    transitions: [
      { id: "N", legs: [{ fixId: "NA" }, { fixId: "MERGE" }] },
      { id: "N", legs: [{ fixId: "NB" }, { fixId: "MERGE" }] },
    ],
  };
  expect(
    joinStarTransition({
      catalog: { stars: [dup] },
      procedureId: "SYN1",
      transitionId: "N",
      remainingFixIds: ["MERGE"],
    }),
  ).toEqual({ ok: false, reason: "AMBIGUOUS_TRANSITION" });
});
