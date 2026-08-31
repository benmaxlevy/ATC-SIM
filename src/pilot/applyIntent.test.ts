import { expect, test } from "vitest";
import { createAircraft } from "@core";
import type { CatalogStar } from "@core";
import { IDENT_FLASH_MS, applyIntent } from "./applyIntent";
import proceduresJson from "../scenario/data/kdem/procedures.json";

const dem1Catalog = { stars: proceduresJson.stars as CatalogStar[] };

function jet() {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: 10,
    altitudeFt: 8000,
    speedKt: 220,
  });
}

test("FLY_HEADING sets assigned heading and HEADING mode", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }], 0);
  expect(ac.intent.assignedHeadingDeg).toBe(270);
  expect(ac.intent.turn).toBe("SHORTEST");
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
});

test("TURN_DEGREES turns from present heading, not assigned", () => {
  const ac = jet();
  ac.intent.assignedHeadingDeg = 90;
  ac.intent.turn = "RIGHT";
  applyIntent(ac, [{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }], 0);
  expect(ac.headingDeg).toBe(10);
  expect(ac.intent.assignedHeadingDeg).toBe(350);
  expect(ac.intent.turn).toBe("LEFT");
});

test("left-to-right: TURN then FLY_HEADING, heading instruction wins last", () => {
  const ac = jet();
  applyIntent(
    ac,
    [
      { type: "TURN_DEGREES", direction: "LEFT", degrees: 20 },
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    ],
    0,
  );
  expect(ac.intent.assignedHeadingDeg).toBe(270);
  expect(ac.intent.turn).toBe("SHORTEST");
});

test("PRESENT_HEADING snaps assigned to current heading", () => {
  const ac = jet();
  ac.intent.assignedHeadingDeg = 90;
  ac.intent.turn = "RIGHT";
  applyIntent(ac, [{ type: "PRESENT_HEADING" }], 0);
  expect(ac.intent.assignedHeadingDeg).toBe(10);
  expect(ac.intent.turn).toBe("SHORTEST");
});

test("IDENT sets identUntilSimMs and does not change assigned intent", () => {
  const ac = jet();
  const before = { ...ac.intent };
  applyIntent(ac, [{ type: "IDENT" }], 1000);
  expect(ac.identUntilSimMs).toBe(1000 + IDENT_FLASH_MS);
  expect(ac.intent).toEqual(before);
});

test("DIRECT sets lateral DIRECT; heading tokens cancel it", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "DIRECT", fixId: "NEMAX" }], 0);
  expect(ac.intent.lateral).toEqual({ type: "DIRECT", fixId: "NEMAX" });
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 90, turn: "SHORTEST" }], 0);
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
  expect(ac.intent.assignedHeadingDeg).toBe(90);
});

test("DCT to a STAR fix is lone DIRECT, not a join", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "DIRECT", fixId: "NELBO" }], 0, { catalog: dem1Catalog });
  expect(ac.intent.lateral).toEqual({ type: "DIRECT", fixId: "NELBO" });
  expect(ac.intent.vertical?.type === "VIA_STAR").toBe(false);
});

test("DCT MERGE and DCT DEM are lone DIRECT", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "DIRECT", fixId: "MERGE" }], 0, { catalog: dem1Catalog });
  expect(ac.intent.lateral).toEqual({ type: "DIRECT", fixId: "MERGE" });
  applyIntent(ac, [{ type: "DIRECT", fixId: "DEM" }], 0, { catalog: dem1Catalog });
  expect(ac.intent.lateral).toEqual({ type: "DIRECT", fixId: "DEM" });
});

test("DCT to a later STAR fix leaves the procedure for lone DIRECT", () => {
  const ac = jet();
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  };
  applyIntent(ac, [{ type: "DIRECT", fixId: "NJOIN" }], 0, { catalog: dem1Catalog });
  expect(ac.intent.lateral).toEqual({ type: "DIRECT", fixId: "NJOIN" });
});

test("DCT then JOIN joins remaining legs without VIA", () => {
  const ac = jet();
  applyIntent(
    ac,
    [
      { type: "DIRECT", fixId: "NELBO" },
      { type: "JOIN_PROCEDURE", procedureId: "DEM1" },
    ],
    0,
    { catalog: dem1Catalog },
  );
  expect(ac.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 1,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  });
  expect(ac.intent.vertical?.type === "VIA_STAR").toBe(false);
});

test("VIA then DCT is DIRECT to that fix; VIA stays armed", () => {
  const ac = jet();
  applyIntent(
    ac,
    [
      { type: "DESCEND_VIA", procedureId: "DEM1" },
      { type: "DIRECT", fixId: "NELBO" },
    ],
    0,
    { catalog: dem1Catalog },
  );
  expect(ac.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
  expect(ac.intent.lateral).toEqual({ type: "DIRECT", fixId: "NELBO" });
});

test("DCT to a SID fix is lone DIRECT", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "DIRECT", fixId: "OCTTA" }], 0, {
    catalog: {
      sids: [{ id: "KDEM1", legs: [{ fixId: "OCTTA" }, { fixId: "DEMEE" }] }],
    },
  });
  expect(ac.intent.lateral).toEqual({ type: "DIRECT", fixId: "OCTTA" });
});

test("heading after GS capture clears vertical GS to ASSIGNED", () => {
  const ac = jet();
  ac.intent.lateral = { type: "LOC", approachId: "ILS27" };
  ac.intent.vertical = { type: "GS", approachId: "ILS27" };
  ac.intent.clearedApproachId = "ILS27";
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 0, turn: "SHORTEST" }], 0);
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 0 });
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(ac.intent.clearedApproachId).toBeNull();
});

test("DESCEND_VIA arms VIA_STAR; CROSS attaches a restriction", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "DESCEND_VIA", procedureId: "DEM1" }], 0);
  expect(ac.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
  expect(ac.intent.lateral?.type === "PROCEDURE").toBe(false);
  applyIntent(ac, [{ type: "CROSS", fixId: "NEMAX", altitudeFt: 4000, restriction: "AT" }], 0);
  expect(ac.intent.cross).toEqual({
    fixId: "NEMAX",
    altitudeFt: 4000,
    restriction: "AT",
  });
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }], 0);
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(ac.intent.cross).toBeUndefined();
});

test("DESCEND_VIA with catalog joins the STAR laterally and arms VIA", () => {
  const ac = jet();
  ac.xNm = 27;
  ac.yNm = 12;
  applyIntent(ac, [{ type: "DESCEND_VIA", procedureId: "DEM1" }], 0, {
    catalog: dem1Catalog,
    fixXy: (id) =>
      id === "NEMAX" ? { xNm: 17, yNm: 12 } : id === "SEMAX" ? { xNm: 17, yNm: -12 } : undefined,
  });
  expect(ac.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
  expect(ac.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  });
});

const synCatalog = {
  stars: [
    {
      id: "SYN1",
      name: "SYN ONE",
      common: [{ fixId: "MERGE" }],
      transitions: [
        { id: "N", legs: [{ fixId: "NA" }, { fixId: "NB" }] },
        { id: "S", legs: [{ fixId: "SA" }, { fixId: "SB" }] },
        { id: "RW09", runwayId: "09", legs: [{ fixId: "RA" }] },
      ],
    },
  ],
};

test("DESCEND_VIA with transition rebuilds at MERGE and keeps VIA_STAR", () => {
  const ac = jet();
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 1,
    routeFixIds: ["NA", "NB", "MERGE"],
  };
  ac.intent.vertical = { type: "VIA_STAR", starId: "SYN1", sense: "DESCEND" };
  applyIntent(ac, [{ type: "DESCEND_VIA", procedureId: "SYN1", transitionId: "S" }], 0, {
    catalog: synCatalog,
  });
  expect(ac.intent.vertical).toEqual({ type: "VIA_STAR", starId: "SYN1", sense: "DESCEND" });
  expect(ac.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 0,
    routeFixIds: ["MERGE"],
  });
});

test("past-branch DESCEND_VIA transition does not mutate intent", () => {
  const ac = jet();
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 0,
    routeFixIds: ["NA"],
  };
  ac.intent.vertical = { type: "VIA_STAR", starId: "SYN1", sense: "DESCEND" };
  const before = structuredClone(ac.intent);
  applyIntent(ac, [{ type: "DESCEND_VIA", procedureId: "SYN1", transitionId: "S" }], 0, {
    catalog: synCatalog,
  });
  expect(ac.intent).toEqual(before);
});

test("heading after a STAR transition amend still cancels VIA", () => {
  const ac = jet();
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 0,
    routeFixIds: ["NA", "NB", "MERGE"],
  };
  applyIntent(ac, [{ type: "DESCEND_VIA", procedureId: "SYN1", transitionId: "S" }], 0, {
    catalog: synCatalog,
  });
  expect(ac.intent.vertical?.type).toBe("VIA_STAR");
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 90, turn: "SHORTEST" }], 0);
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
  applyIntent(
    ac,
    [
      { type: "DESCEND_VIA", procedureId: "SYN1" },
      { type: "TURN_DEGREES", direction: "LEFT", degrees: 20 },
    ],
    0,
    { catalog: synCatalog },
  );
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(ac.intent.lateral?.type).toBe("HEADING");
});

test("CLIMB_VIA on a unique SID joins remaining legs", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "CLIMB_VIA", procedureId: "KDEM1" }], 0, {
    catalog: {
      sids: [{ id: "KDEM1", legs: [{ fixId: "OCTTA" }, { fixId: "DEMEE" }] }],
    },
  });
  expect(ac.intent.vertical).toEqual({ type: "VIA_SID", sidId: "KDEM1" });
  expect(ac.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "KDEM1",
    toFixIndex: 0,
    routeFixIds: ["OCTTA", "DEMEE"],
  });
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }], 0);
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
});

test("SAY_* leave heading/alt/speed intent alone; CLEARED_APPROACH arms INTERCEPT_LOC", () => {
  const ac = jet();
  const before = { ...ac.intent };
  applyIntent(ac, [{ type: "SAY_HEADING" }, { type: "SAY_ALTITUDE" }], 0);
  expect(ac.intent).toEqual(before);
  applyIntent(ac, [{ type: "CLEARED_APPROACH", approachId: "ILS27" }], 0);
  expect(ac.intent.assignedHeadingDeg).toBe(before.assignedHeadingDeg);
  expect(ac.intent.assignedAltitudeFt).toBe(before.assignedAltitudeFt);
  expect(ac.intent.assignedSpeedKt).toBe(before.assignedSpeedKt);
  expect(ac.intent.clearedApproachId).toBe("ILS27");
  expect(ac.intent.locInterceptApproachId).toBe("ILS27");
  expect(ac.intent.lateral).toEqual({ type: "INTERCEPT_LOC", approachId: "ILS27" });
});

test("EXPECT_APPROACH sets scratchpad only", () => {
  const ac = jet();
  const beforeLateral = ac.intent.lateral;
  applyIntent(ac, [{ type: "EXPECT_APPROACH", approachId: "ILS27" }], 0);
  expect(ac.intent.expectedApproachId).toBe("ILS27");
  expect(ac.intent.lateral).toBe(beforeLateral);
  expect(ac.intent.clearedApproachId).toBeNull();
});

test("INTERCEPT_LOCALIZER arms INTERCEPT_LOC without clearing the approach", () => {
  const ac = jet();
  const assigned = ac.intent.assignedAltitudeFt;
  applyIntent(ac, [{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }], 0);
  expect(ac.intent.lateral).toEqual({ type: "INTERCEPT_LOC", approachId: "ILS27" });
  expect(ac.intent.locInterceptApproachId).toBe("ILS27");
  expect(ac.intent.clearedApproachId).toBeNull();
  expect(ac.intent.assignedAltitudeFt).toBe(assigned);
  expect(ac.intent.vertical?.type === "GS").toBeFalsy();
});

test("IL on PROCEDURE keeps the STAR and arms loc capture", () => {
  const ac = jet();
  ac.headingDeg = 200;
  ac.intent.assignedHeadingDeg = 270;
  const star = {
    type: "PROCEDURE" as const,
    starId: "DEM1",
    toFixIndex: 2,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  };
  ac.intent.lateral = star;
  applyIntent(ac, [{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }], 0);
  expect(ac.intent.lateral).toEqual(star);
  expect(ac.intent.locInterceptApproachId).toBe("ILS27");
  expect(ac.intent.assignedHeadingDeg).toBe(270);
});

test("IL on DIRECT MERGE keeps the fix and arms loc capture", () => {
  const ac = jet();
  ac.intent.lateral = { type: "DIRECT", fixId: "MERGE" };
  applyIntent(ac, [{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }], 0);
  expect(ac.intent.lateral).toEqual({ type: "DIRECT", fixId: "MERGE" });
  expect(ac.intent.locInterceptApproachId).toBe("ILS27");
});

test("same-command DCT MERGE IL ILS27 keeps DIRECT", () => {
  const ac = jet();
  applyIntent(
    ac,
    [
      { type: "DIRECT", fixId: "MERGE" },
      { type: "INTERCEPT_LOCALIZER", approachId: "ILS27" },
    ],
    0,
  );
  expect(ac.intent.lateral).toEqual({ type: "DIRECT", fixId: "MERGE" });
  expect(ac.intent.locInterceptApproachId).toBe("ILS27");
});

test("same-command heading is the intercept heading (R240 IL ILS27)", () => {
  const ac = jet();
  ac.headingDeg = 90;
  ac.intent.assignedHeadingDeg = 90;
  applyIntent(
    ac,
    [
      { type: "FLY_HEADING", headingDeg: 240, turn: "RIGHT" },
      { type: "INTERCEPT_LOCALIZER", approachId: "ILS27" },
    ],
    0,
  );
  expect(ac.intent.assignedHeadingDeg).toBe(240);
  expect(ac.intent.turn).toBe("RIGHT");
  expect(ac.intent.lateral).toEqual({ type: "INTERCEPT_LOC", approachId: "ILS27" });
  expect(ac.intent.locInterceptApproachId).toBe("ILS27");
});

test("INTERCEPT_LOCALIZER after APP drops GS arming", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "CLEARED_APPROACH", approachId: "ILS27" }], 0);
  ac.intent.lateral = { type: "LOC", approachId: "ILS27" };
  ac.intent.vertical = { type: "GS", approachId: "ILS27" };
  applyIntent(ac, [{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }], 0);
  expect(ac.intent.clearedApproachId).toBeNull();
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(ac.intent.lateral).toEqual({ type: "LOC", approachId: "ILS27" });
});

test("heading after APP clears intercept so they must APP again", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "CLEARED_APPROACH", approachId: "ILS27" }], 0);
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 90, turn: "SHORTEST" }], 0);
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
  expect(ac.intent.clearedApproachId).toBeNull();
  expect(ac.intent.locInterceptApproachId).toBeNull();
  expect(ac.intent.assignedHeadingDeg).toBe(90);
});

test("GO_AROUND starts missed when APP is armed", () => {
  const ac = jet();
  ac.intent.clearedApproachId = "ILS27";
  ac.intent.lateral = { type: "LOC", approachId: "ILS27" };
  ac.intent.vertical = { type: "GS", approachId: "ILS27" };
  applyIntent(ac, [{ type: "GO_AROUND" }], 0);
  expect(ac.intent.lateral).toEqual({ type: "MISSED", approachId: "ILS27" });
  expect(ac.intent.vertical).toEqual({ type: "MISSED_CLIMB", altitudeFt: 3000 });
  expect(ac.intent.assignedHeadingDeg).toBe(270);
  expect(ac.intent.assignedAltitudeFt).toBe(3000);
});

test("heading after missed climb cancels MISSED lateral to HEADING", () => {
  const ac = jet();
  ac.intent.clearedApproachId = "ILS27";
  applyIntent(ac, [{ type: "GO_AROUND" }], 0);
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 0, turn: "SHORTEST" }], 0);
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 0 });
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(ac.intent.clearedApproachId).toBeNull();
});
