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

test("FLY_HEADING sets assigned heading and turn", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }], 0);
  expect(ac.intent.assignedHeadingDeg).toBe(270);
  expect(ac.intent.turn).toBe("SHORTEST");
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

test("SAY_* and CLEARED_APPROACH leave heading/alt/speed intent alone", () => {
  const ac = jet();
  const before = { ...ac.intent };
  applyIntent(ac, [{ type: "SAY_HEADING" }, { type: "SAY_ALTITUDE" }], 0);
  expect(ac.intent).toEqual(before);
  applyIntent(ac, [{ type: "CLEARED_APPROACH", approachId: "ILS27" }], 0);
  expect(ac.intent.assignedHeadingDeg).toBe(before.assignedHeadingDeg);
  expect(ac.intent.assignedAltitudeFt).toBe(before.assignedAltitudeFt);
  expect(ac.intent.assignedSpeedKt).toBe(before.assignedSpeedKt);
  expect(ac.intent.clearedApproachId).toBe("ILS27");
});
