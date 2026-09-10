import { expect, test } from "vitest";
import { makeTestAircraft } from "@core";
import {
  datablockRect,
  formatAltitudeHundreds,
  formatDatablockFields,
  formatLimitedDatablock,
  linesForDatablock,
  pointInDatablock,
} from "../datablock";
import { DEFAULT_LEADER_DIR, LEADER_LENGTH_PX } from "../leader";

test("limited datablock is Mode C hundreds only", () => {
  const ac = makeTestAircraft({
    callsign: "DAL123",
    altitudeFt: 3250,
    speedKt: 210,
    aircraftType: "B738",
  });
  ac.intent.assignedAltitudeFt = 4000;
  expect(formatLimitedDatablock(ac)).toEqual({ line1: "033" });
  expect(linesForDatablock(ac, "limited", true, "ABCD")).toEqual({ line1: "033" });
});

test("Mode C hundreds clamp to 000–999", () => {
  expect(formatAltitudeHundreds(-50)).toBe("000");
  expect(formatAltitudeHundreds(100_000)).toBe("999");
  expect(formatAltitudeHundreds(Number.NaN)).toBe("000");
});

test("default L8 offset is north 36 px; rect contains the text cell", () => {
  expect(DEFAULT_LEADER_DIR).toBe(8);
  expect(LEADER_LENGTH_PX).toBe(36);
  const full = datablockRect(100, 200, { line1: "DAL123", line2: "030  21" }, 7.2, 12);
  expect(full.h).toBe(24);
  expect(pointInDatablock(full.x + full.w / 2, full.y + full.h / 2, full)).toBe(true);
  expect(pointInDatablock(100, 200, full)).toBe(false);
});

test("explicit datablock fields format Figure 2-20 Fields 0–5", () => {
  const ac = makeTestAircraft({
    callsign: "ual1234",
    altitudeFt: 12000,
    speedKt: 180,
    aircraftType: "b789",
    flightRules: "IFR",
    wakeCategory: "H",
    requestedAltitudeFt: 10000,
    squawk: "1200",
  });
  const fields = formatDatablockFields(ac, {
    sp1: "sp1",
    exitFix: "DCTAB",
    tcp: "1n",
    tsasSequence: 1,
    duplicateBeaconCode: "1200",
    aircraftCount: 2,
    timeSharePhase: 0,
  });

  expect(fields).toEqual({
    field0: "1",
    field1: "UAL1234",
    field2: "",
    field3: "120",
    field4: "1N",
    field5: "18H",
    field6: "1200",
    field7: "",
    field8: "",
  });
});

test("explicit field alternatives time-share without inventing absent values", () => {
  const ac = makeTestAircraft({ callsign: "DAL1", altitudeFt: 3000, speedKt: 210 });
  expect(formatDatablockFields(ac, { exitGate: "G", timeSharePhase: 1 }).field3).toBe("G");
  expect(formatDatablockFields(ac, { exitGate: "G", timeSharePhase: 2 }).field3).toBe("030");
  expect(formatDatablockFields(ac, { timeSharePhase: 0 }).field4).toBe("");
  expect(formatDatablockFields(ac, { timeSharePhase: 0 }).field0).toBe("");
});

test("Fields 6–8 format documented optional values with per-field priority", () => {
  const ac = makeTestAircraft({
    callsign: "TEST1",
    altitudeFt: 5000,
    speedKt: 210,
    squawk: "1200",
  });
  ac.intent.controllerAssignedAltitudeFt = 7000;
  const options = {
    atpaInTrailDistance: "2.40",
    atpaNowgt: true,
    atpaTpa: true,
    noFlightPlan: true,
    duplicateBeaconCode: "4321",
    duplicateTargetAddress: true,
    moaAssignment: "MOA1",
    csmm: true,
    selectedBeaconCode: "2468",
    tsasRunwayId: "27",
    tsasAdvisedSpeedKt: 180,
    tsasEarlyLate: { status: "E" as const, minutes: 2, seconds: 5 },
    pointoutReceiverTcp: "1n",
    pointoutUn: true,
    pointoutRd: true,
    pointoutAcceptCount: 3,
  };

  expect(formatDatablockFields(ac, { ...options, timeSharePhase: 0 }).field6).toBe("2.40");
  expect(formatDatablockFields(ac, { ...options, timeSharePhase: 3 }).field6).toBe("NO FP");
  expect(formatDatablockFields(ac, { ...options, timeSharePhase: 6 }).field6).toBe("MOA1");
  expect(formatDatablockFields(ac, { ...options, timeSharePhase: 7 }).field6).toBe("CSMM");
  expect(formatDatablockFields(ac, { ...options, timeSharePhase: 8 }).field6).toBe("2468");
  expect(formatDatablockFields(ac, { ...options, timeSharePhase: 9 }).field6).toBe("A27");

  expect(formatDatablockFields(ac, { ...options, timeSharePhase: 0 }).field7).toBe("A070");
  expect(formatDatablockFields(ac, { ...options, timeSharePhase: 1 }).field7).toBe("18");
  expect(formatDatablockFields(ac, { ...options, timeSharePhase: 2 }).field7).toBe("E205");

  expect(formatDatablockFields(ac, { ...options, timeSharePhase: 0 }).field8).toBe("PO 1N");
  expect(formatDatablockFields(ac, { ...options, pointoutReceiverTcp: undefined }).field8).toBe(
    "UN",
  );
  expect(
    formatDatablockFields(ac, {
      ...options,
      pointoutReceiverTcp: undefined,
      pointoutUn: false,
      pointoutRd: false,
      timeSharePhase: 0,
    }).field8,
  ).toBe("3");
});

test("duplicate beacon formatting is independent from squawk mismatch", () => {
  const ac = makeTestAircraft({ callsign: "TEST2", altitudeFt: 4000, speedKt: 190 });
  ac.assignedSquawk = "1200";
  ac.reportedSquawk = "3400";

  expect(formatDatablockFields(ac, { timeSharePhase: 0 }).field6).toBe("3400");
  expect(formatDatablockFields(ac, { duplicateBeaconCode: "7788", timeSharePhase: 0 }).field6).toBe(
    "3400",
  );
  expect(formatDatablockFields(ac, { duplicateBeaconCode: "7788", timeSharePhase: 1 }).field6).toBe(
    "7788",
  );
  expect(formatDatablockFields(ac, { timeSharePhase: 0 }).field7).toBe("1200");
});

test("Fields 6–8 omit unsupported and absent values", () => {
  const ac = makeTestAircraft({ callsign: "EMPTY", altitudeFt: 4000, speedKt: 190 });
  expect(formatDatablockFields(ac)).toMatchObject({ field6: "", field7: "", field8: "" });
  expect(
    formatDatablockFields(ac, { pointoutAcceptCount: 4, pointoutInhibited: true }).field8,
  ).toBe("");
});
