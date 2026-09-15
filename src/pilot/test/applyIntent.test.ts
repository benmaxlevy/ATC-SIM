import { expect, test } from "vitest";
import { createAircraft } from "@core";
import type { CatalogStar } from "@core";
import { applyIntent } from "../applyIntent";
import proceduresJson from "../../scenario/data/kdem/procedures.json";

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
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
});

test("TURN_DEGREES turns from present heading", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }], 0);
  expect(ac.intent.assignedHeadingDeg).toBe(350);
});

test("ALTITUDE changes flight intent without creating controller altitude provenance", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "ALTITUDE", altitudeFt: 4000, verb: "DESCEND" }], 0);
  expect(ac.intent.assignedAltitudeFt).toBe(4000);
  expect(ac.intent.controllerAssignedAltitudeFt).toBeUndefined();
});

test("VIA altitude instructions preserve controller altitude provenance", () => {
  const ac = jet();
  ac.intent.controllerAssignedAltitudeFt = 9000;
  applyIntent(ac, [{ type: "DESCEND_VIA", procedureId: "DEM1" }], 0);
  expect(ac.intent.controllerAssignedAltitudeFt).toBe(9000);
});

test("DESCEND_VIA with catalog joins the STAR", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "DESCEND_VIA", procedureId: "DEM1" }], 0, { catalog: dem1Catalog });
  expect(ac.intent.lateral?.type === "PROCEDURE" || ac.intent.vertical?.type === "VIA_STAR").toBe(
    true,
  );
});

test("CLEARED_APPROACH arms INTERCEPT_LOC", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "CLEARED_APPROACH", approachId: "ILS27" }], 0);
  expect(ac.intent.clearedApproachId).toBe("ILS27");
});

test("AC1: ALTITUDE on STAR transitions vertical to ASSIGNED, clears cross, preserves lateral PROCEDURE", () => {
  const ac = jet();
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 1,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  };
  ac.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };
  ac.intent.cross = { fixId: "NELBO", altitudeFt: 7000, restriction: "AT" };

  applyIntent(ac, [{ type: "ALTITUDE", altitudeFt: 5000, verb: "DESCEND" }], 0);

  expect(ac.intent.assignedAltitudeFt).toBe(5000);
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(ac.intent.cross).toBeUndefined();
  expect(ac.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 1,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  });
});

test("AC3: FLY_HEADING before localizer capture preserves clearedApproachId and arms INTERCEPT_LOC", () => {
  const ac = jet();
  ac.intent.clearedApproachId = "ILS27";
  ac.intent.lateral = { type: "INTERCEPT_LOC", approachId: "ILS27" };

  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 240, turn: "LEFT" }], 0);

  expect(ac.intent.assignedHeadingDeg).toBe(240);
  expect(ac.intent.turn).toBe("LEFT");
  expect(ac.intent.clearedApproachId).toBe("ILS27");
  expect(ac.intent.locInterceptApproachId).toBe("ILS27");
  expect(ac.intent.lateral).toEqual({ type: "INTERCEPT_LOC", approachId: "ILS27" });
});

test("AC4: FLY_HEADING when established on LOC breaks out to HEADING and clears clearedApproachId", () => {
  const ac = jet();
  ac.intent.clearedApproachId = "ILS27";
  ac.intent.locInterceptApproachId = "ILS27";
  ac.intent.lateral = { type: "LOC", approachId: "ILS27" };
  ac.intent.vertical = { type: "GS", approachId: "ILS27" };

  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 240, turn: "LEFT" }], 0);

  expect(ac.intent.assignedHeadingDeg).toBe(240);
  expect(ac.intent.turn).toBe("LEFT");
  expect(ac.intent.clearedApproachId).toBeNull();
  expect(ac.intent.locInterceptApproachId).toBeNull();
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 240 });
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
});

test("CANCEL_APPROACH clears generic approach guidance and continues present heading", () => {
  const ac = jet();
  ac.headingDeg = 217;
  ac.intent.expectedApproachId = "RNAV09";
  ac.intent.clearedApproachId = "RNAV09";
  ac.intent.locInterceptApproachId = "RNAV09";
  ac.intent.lateral = { type: "LOC", approachId: "RNAV09" };
  ac.intent.vertical = { type: "GS", approachId: "RNAV09" };

  applyIntent(ac, [{ type: "CANCEL_APPROACH" }], 0);

  expect(ac.intent.expectedApproachId).toBeNull();
  expect(ac.intent.clearedApproachId).toBeNull();
  expect(ac.intent.locInterceptApproachId).toBeNull();
  expect(ac.intent.assignedHeadingDeg).toBe(217);
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 217 });
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
});

test("CANCEL_APPROACH does not replace missed or landing lifecycle state", () => {
  const missed = jet();
  missed.intent.clearedApproachId = "RNAV09";
  missed.intent.lateral = { type: "MISSED", approachId: "RNAV09" };
  applyIntent(missed, [{ type: "CANCEL_APPROACH" }], 0);
  expect(missed.intent.clearedApproachId).toBe("RNAV09");
  expect(missed.intent.lateral).toEqual({ type: "MISSED", approachId: "RNAV09" });

  const landing = jet();
  landing.intent.clearedApproachId = "RNAV09";
  landing.intent.lateral = { type: "LANDING", approachId: "RNAV09" };
  applyIntent(landing, [{ type: "CANCEL_APPROACH" }], 0);
  expect(landing.intent.clearedApproachId).toBe("RNAV09");
  expect(landing.intent.lateral).toEqual({ type: "LANDING", approachId: "RNAV09" });
});

test("AC7: DSR and SPEED intent application and via reset", () => {
  const ac = jet();
  ac.intent.controllerAssignedSpeedKt = 210;
  ac.intent.speedUntil = { type: "DME", distanceNm: 5 };

  // DSR sets speedRestrictionsDeleted = true and clears controllerAssignedSpeedKt and speedUntil
  applyIntent(ac, [{ type: "DELETE_SPEED_RESTRICTIONS" }], 0);
  expect(ac.intent.speedRestrictionsDeleted).toBe(true);
  expect(ac.intent.controllerAssignedSpeedKt).toBeUndefined();
  expect(ac.intent.speedUntil).toBeUndefined();

  // Re-clearing via resets the flag to false
  applyIntent(ac, [{ type: "DESCEND_VIA", procedureId: "DEM1" }], 0, { catalog: dem1Catalog });
  expect(ac.intent.speedRestrictionsDeleted).toBe(false);

  // Assigning SPEED sets speed, controller speed, speedUntil, and clears speedRestrictionsDeleted
  applyIntent(ac, [{ type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "FAF" } }], 0);
  expect(ac.intent.assignedSpeedKt).toBe(180);
  expect(ac.intent.controllerAssignedSpeedKt).toBe(180);
  expect(ac.intent.speedUntil).toEqual({ type: "FAF" });
  expect(ac.intent.speedRestrictionsDeleted).toBeUndefined();
});
