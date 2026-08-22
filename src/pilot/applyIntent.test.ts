import { expect, test } from "vitest";
import { createAircraft } from "@core";
import { IDENT_FLASH_MS, applyIntent } from "./applyIntent";

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

test("heading after APP clears intercept so they must APP again", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "CLEARED_APPROACH", approachId: "ILS27" }], 0);
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 90, turn: "SHORTEST" }], 0);
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
  expect(ac.intent.clearedApproachId).toBeNull();
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
