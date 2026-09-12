import { expect, test } from "vitest";
import { makeTestAircraft } from "@core";
import {
  datablockRect,
  datablockMetrics,
  formatAltitudeHundreds,
  formatDatablockFields,
  formatPartialDatablockFields,
  formatTcp,
  formatLimitedDatablock,
  formatFullDatablock,
  formatPartialDatablock,
  physicalDatablockLines,
  linesForDatablock,
  pointInDatablock,
  getSpecialPurposeCode,
  buildDatablockRuntimeState,
} from "../datablock";
import { createWorld } from "@core";
import { DEFAULT_LEADER_DIR, LEADER_LENGTH_PX } from "../leader";

test("runtime adapter projects associated plan and preserves beacon provenance", () => {
  const ac = makeTestAircraft({
    id: "runtime-associated",
    callsign: "RAW123",
    squawk: "4321",
    altitudeFt: 6000,
    speedKt: 180,
    aircraftType: "C172",
  });
  const world = createWorld({
    aircraft: [ac],
    flightPlans: [
      {
        id: "runtime-plan",
        status: "active",
        acid: "FILED123",
        assignedBeacon: "1234",
        requestedAltitudeFt: 9000,
        assignedAltitudeFt: 8000,
        aircraftType: "B738",
        scratchpads: ["ILS 27", "S21"],
        fixes: [],
        associatedAircraftId: ac.id,
      },
    ],
  });
  const beforeIntent = structuredClone(ac.intent);
  const track = {
    ownership: "owned" as const,
    datablockMode: "full" as const,
    squawk: "4321",
    queriedUntilSimMs: world.simTimeMs + 1000,
    atpaInTrailDistanceEnabled: true,
  };

  const state = buildDatablockRuntimeState(world, ac, {
    track,
    modeCVisible: true,
    localTcp: "D",
    fieldInputs: { field0Indicators: ["CA"] },
  });

  expect(state.source.callsign).toBe("FILED123");
  expect(state.source.assignedSquawk).toBe("1234");
  expect(state.source.reportedSquawk).toBe("4321");
  expect(state.source.aircraftType).toBe("B738");
  expect(state.source.requestedAltitudeFt).toBe(9000);
  expect(state.display.queried).toBe(true);
  expect(state.display.scratchpads).toEqual({ sp1: "ILS2", sp2: "S21" });
  expect(state.options.field0Indicators).toEqual(["CA"]);
  expect(ac.intent).toEqual(beforeIntent);
});

test.each(["pending", "suspended"] as const)(
  "runtime adapter does not project a non-associated %s plan",
  (status) => {
    const ac = makeTestAircraft({ id: `runtime-${status}`, callsign: "RAW456", squawk: "5678" });
    const world = createWorld({
      aircraft: [ac],
      flightPlans: [
        {
          id: `runtime-${status}-plan`,
          status,
          acid: "FILED456",
          assignedBeacon: "2468",
          aircraftType: "B738",
          scratchpads: ["BAD"],
          fixes: [],
        },
      ],
    });
    const state = buildDatablockRuntimeState(world, ac, {
      track: { ownership: "unowned", unassociated: true, squawk: "5678" },
    });
    expect(state.mode).toBe("limited");
    expect(state.source.callsign).toBe("RAW456");
    expect(state.source.assignedSquawk).toBe(ac.assignedSquawk);
    expect(state.source.aircraftType).toBe(ac.aircraftType);
    expect(state.display.scratchpads).toEqual({ sp1: "", sp2: "" });
  },
);

test("runtime adapter centralizes handoff, beaconator, alert, and unsupported state", () => {
  const ac = makeTestAircraft({ id: "runtime-handoff", callsign: "HAND1", squawk: "7000" });
  const world = createWorld({ aircraft: [ac] });
  world.handoffs.set(ac.id, { kind: "outbound", toSectorId: "C", status: "initiated" });
  const state = buildDatablockRuntimeState(world, ac, {
    track: {
      ownership: "owned",
      datablockMode: "full",
      beaconatorUntilSimMs: world.simTimeMs + 1000,
      queriedUntilSimMs: world.simTimeMs + 1000,
      squawk: "7000",
    },
    localTcp: "D",
    fieldInputs: { field0Indicators: [] },
  });
  expect(state.display.handoff).toEqual(world.handoffs.get(ac.id));
  expect(state.display.beaconatorReadout).toBe(true);
  expect(state.source.callsign).toBe("7000");
  expect(state.options.handoffSectorId).toBe("C");
  expect(state.options.queried).toBe(true);
  expect(state.source).not.toHaveProperty("csmm");
});

test("runtime adapter carries the complete supported Field 0–8 contract", () => {
  const ac = makeTestAircraft({ id: "runtime-fields", callsign: "FIELD1", squawk: "7001" });
  const world = createWorld({ aircraft: [ac] });
  world.alerts.atpa.push({
    trailingCallsign: ac.callsign,
    leadingCallsign: "LEAD1",
    volumeId: "VOL1",
    distanceNm: 2.4,
    requiredNm: 3,
    closureKt: 10,
    status: "warning",
  });
  const state = buildDatablockRuntimeState(world, ac, {
    track: { ownership: "owned", datablockMode: "full" },
    modeCVisible: false,
    localTcp: "D",
    atpa: { enabled: true },
    alertState: { field0Indicators: ["TSAS"], requiresBlink: true },
    fieldInputs: {
      field0Indicators: ["IGNORED"],
      tsasSequence: 4,
      exitGate: "G1",
      exitFix: "FIX1",
      tcp: "1N",
      field4Indicator: "R",
      duplicateBeaconCode: "7001",
      aircraftCount: 2,
      atpaNowgt: true,
      atpaTpa: true,
      noFlightPlan: false,
      duplicateTargetAddress: true,
      moaAssignment: "MOA1",
      selectedBeaconCode: "7002",
      tsasRunwayId: "27",
      tsasAdvisedSpeedKt: 180,
      tsasEarlyLate: { status: "E", minutes: 1, seconds: 30 },
      pointoutReceiverTcp: "N",
      pointoutUn: true,
      pointoutRd: false,
      pointoutAcceptCount: 2,
      pointoutInhibited: false,
    },
  });

  expect(state.mode).toBe("full");
  expect(state.options).toMatchObject({
    modeCVisible: false,
    field0Indicators: ["TSAS"],
    tsasSequence: 4,
    exitGate: "G1",
    exitFix: "FIX1",
    tcp: "1N",
    field4Indicator: "R",
    duplicateBeaconCode: "7001",
    aircraftCount: 2,
    atpaNowgt: true,
    atpaTpa: true,
    duplicateTargetAddress: true,
    moaAssignment: "MOA1",
    selectedBeaconCode: "7002",
    tsasRunwayId: "27",
    tsasAdvisedSpeedKt: 180,
    tsasEarlyLate: { status: "E", minutes: 1, seconds: 30 },
    pointoutReceiverTcp: "N",
    pointoutUn: true,
    pointoutAcceptCount: 2,
  });
  expect(state.source.atpaDistance).toBe("2.40");
  expect(state.display.alertState).toEqual({ requiresBlink: true });
});

test("runtime adapter leaves unsupported Field 0–8 values absent", () => {
  const ac = makeTestAircraft({ id: "runtime-empty", callsign: "EMPTY1" });
  const state = buildDatablockRuntimeState(createWorld({ aircraft: [ac] }), ac, {
    track: { ownership: "unowned", unassociated: true },
  });

  expect(state.mode).toBe("limited");
  expect(state.options.field0Indicators).toBeUndefined();
  expect(state.options.exitGate).toBeUndefined();
  expect(state.options.exitFix).toBeUndefined();
  expect(state.options.pointoutReceiverTcp).toBeUndefined();
  expect(state.options.atpaInTrailDistance).toBeUndefined();
  expect(state.options.csmm).toBeUndefined();
  expect(state.source.atpaDistance).toBeUndefined();
  expect(state.display.field0Indicators).toEqual([]);
  expect(state.display.alertState).toEqual({ requiresBlink: false });
});

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

test("FDB Field 0 stays above callsign and keeps TSAS sequence separate", () => {
  const ac = makeTestAircraft({ callsign: "DAL133", altitudeFt: 4000, speedKt: 180, spc: "EM" });
  const fdb = formatFullDatablock(ac, { tsasSequence: 7 });

  expect(fdb.line0).toBe("EM/7");
  expect(fdb.line1).toBe("DAL133");
  expect(fdb.line1).not.toContain("EM");
  expect(fdb.line1).not.toContain("7");
  expect(datablockMetrics(fdb).heightPx).toBe(
    datablockMetrics({ ...fdb, line0: undefined }).heightPx + 12,
  );
});

test("empty FDB Field 0 preserves three-row physical geometry", () => {
  const ac = makeTestAircraft({ callsign: "DAL134", altitudeFt: 4000, speedKt: 180 });
  const fdb = formatFullDatablock(ac);

  expect(fdb.line0).toBeUndefined();
  expect(datablockMetrics(fdb).heightPx).toBe(2 * 12);
});

test.each(["EM", "RF", "HJ"] as const)("limited Field 0 preserves existing SPC %s", (spc) => {
  const ac = makeTestAircraft({ callsign: "LDBSPC", altitudeFt: 4500, squawk: "1200", spc });
  const ldb = formatLimitedDatablock(ac);

  expect(ldb).toEqual({ line0: spc, line1: "1200", line2: "045" });
  expect(ldb.line0).not.toBe(ldb.line1);
});

test("limited Field 0 omits arbitrary explicit SPC while FDB SPC projection remains unchanged", () => {
  const ac = makeTestAircraft({
    callsign: "LDBSPC",
    altitudeFt: 4500,
    squawk: "1200",
    spc: "CUSTOM",
  });

  expect(getSpecialPurposeCode(ac)).toBe("CUSTOM");
  expect(formatLimitedDatablock(ac)).toEqual({ line1: "1200", line2: "045" });
  expect(formatDatablockFields(ac).field0).toBe("CUST");
});

test("limited Field 0 accepts existing CA renderer state only", () => {
  const ac = makeTestAircraft({ callsign: "LDBALERT", altitudeFt: 4500, squawk: "1200" });

  expect(formatLimitedDatablock(ac, { field0Indicators: ["LA", "CA"] })).toEqual({
    line0: "CA",
    line1: "1200",
    line2: "045",
  });
  expect(formatLimitedDatablock(ac, { field0Indicators: ["MI", "LL", "CA"] }).line0).toBe("CA");
});

test("limited Field 0 persists across queried and beacon-inhibited output", () => {
  const ac = makeTestAircraft({
    callsign: "LDBQUERY",
    altitudeFt: 4500,
    speedKt: 180,
    squawk: "1200",
  });

  expect(formatLimitedDatablock(ac, { field0Indicators: ["CA"], queried: true })).toEqual({
    line0: "CA",
    line1: "1200",
    line2: "045 18",
  });
  expect(formatLimitedDatablock(ac, { field0Indicators: ["LA"], beaconVisible: false })).toEqual({
    line1: "045",
  });
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

test.each([
  ["n", "N"],
  [" 1n ", "1N"],
  ["1-n!", "1N"],
  ["abc", "AB"],
  ["...", undefined],
  ["", undefined],
] as const)("TCP adaptation normalizes %j to %j", (raw, expected) => {
  expect(formatTcp(raw)).toBe(expected);
});

test("TCP remains intact in Field 4 for full and partial datablocks", () => {
  const ac = makeTestAircraft({ callsign: "TCP1", altitudeFt: 3000, speedKt: 180 });

  expect(formatDatablockFields(ac, { tcp: "1n" }).field4).toBe("1N");
  expect(formatDatablockFields(ac, { tcp: "n" }).field4).toBe("N");
  expect(formatPartialDatablock(ac, { tcp: "1n" }).line1).toContain("030");
  expect(formatPartialDatablock(ac, { tcp: "1n" }).fields.field4).toBe("1N");
});

test("PDB projection follows Figure 2-22 and omits FDB-only values", () => {
  const ac = makeTestAircraft({
    callsign: "PDB1",
    altitudeFt: 8500,
    speedKt: 180,
    aircraftType: "B738",
    wakeCategory: "H",
    requestedAltitudeFt: 12000,
  });

  const projection = formatPartialDatablockFields(ac, {
    handoffSectorId: "N",
    identIndicator: "id",
  });

  expect(projection).toEqual({
    field0: "",
    field1: "085",
    field2: "N",
    field3: "18H",
    field4: "ID",
    field5: "",
    field6: "",
    field7: "",
    field8: "",
  });
  expect(formatPartialDatablock(ac, { handoffSectorId: "N", identIndicator: "ID" }).line1).toBe(
    "085  N   18H  ID",
  );
});

test("PDB projection preserves empty, hidden Mode C, and suppressed speed values", () => {
  const ac = makeTestAircraft({ callsign: "PDB2", altitudeFt: 3500, speedKt: 120 });

  expect(formatPartialDatablockFields(ac)).toMatchObject({
    field0: "",
    field1: "035",
    field2: "",
    field3: "12",
    field4: "",
    field5: "",
    field6: "",
    field7: "",
    field8: "",
  });
  expect(formatPartialDatablockFields(ac, { modeCVisible: false, suppressPdbSpeed: true })).toEqual(
    {
      field0: "",
      field1: "",
      field2: "",
      field3: "",
      field4: "",
      field5: "",
      field6: "",
      field7: "",
      field8: "",
    },
  );
});

test("PDB Field 0 keeps supported cautions but never copies SPCs", () => {
  const ac = makeTestAircraft({
    callsign: "PDB3",
    altitudeFt: 4000,
    speedKt: 180,
    squawk: "7700",
  });

  expect(formatPartialDatablock(ac).pdbFields.field0).toBe("");
  expect(formatPartialDatablockFields(ac, { field0Indicators: ["TRK", "EM", "ISR"] }).field0).toBe(
    "TRK/ISR",
  );
  expect(formatPartialDatablock(ac, { field0Indicators: ["TRK", "ISR"] }).line0).toBe("TRK/ISR");
  expect(formatPartialDatablock(ac).line0).toBeUndefined();
});

test("PDB caution row participates in physical geometry while empty PDB geometry is unchanged", () => {
  const ac = makeTestAircraft({ callsign: "PDB6", altitudeFt: 4000, speedKt: 180 });
  const empty = linesForDatablock(ac, "partial", { modeCVisible: true });
  const caution = linesForDatablock(ac, "partial", {
    modeCVisible: true,
    field0Indicators: ["TRK", "ISR"],
  });
  const emptyMetrics = datablockMetrics(empty);
  const cautionMetrics = datablockMetrics(caution);

  expect(empty.line0).toBeUndefined();
  expect(caution.line0).toBe("TRK/ISR");
  expect(
    datablockMetrics(formatPartialDatablock(ac, { field0Indicators: ["TRK", "ISR"] })),
  ).toEqual(cautionMetrics);
  expect(cautionMetrics.heightPx).toBeGreaterThan(emptyMetrics.heightPx);
  expect(cautionMetrics.widthPx).toBeGreaterThanOrEqual(emptyMetrics.widthPx);

  const rect = datablockRect(100, 200, caution);
  expect(pointInDatablock(rect.x + 1, rect.y + 1, rect)).toBe(true);
  expect(rect.h).toBe(cautionMetrics.heightPx);
});

test("PDB physical output does not time-share FDB type or requested altitude", () => {
  const ac = makeTestAircraft({
    callsign: "PDB4",
    altitudeFt: 8500,
    speedKt: 180,
    aircraftType: "B738",
    requestedAltitudeFt: 12000,
  });

  const pdb = formatPartialDatablock(ac, { timeSharePhase: 1 });
  expect(pdb.line1).toBe("085  18");
  expect(pdb.line1).not.toContain("B738");
  expect(pdb.line1).not.toContain("R120");
  expect(pdb.fields.field5).toBe("R120");
});

test("PDB Field 1 excludes FDB exit gate and exit fix values", () => {
  const ac = makeTestAircraft({ callsign: "PDB5", altitudeFt: 8500, speedKt: 180 });

  expect(
    formatPartialDatablockFields(ac, { exitGate: "G1", exitFix: "FIX01", timeSharePhase: 1 })
      .field1,
  ).toBe("085");
});

test.each([
  ["N", "030  N   18"],
  ["1N", "030  1N  18"],
] as const)("physical Field 4 center slot keeps %s TCP stable", (tcp, expected) => {
  const ac = makeTestAircraft({ callsign: "CELL1", altitudeFt: 3000, speedKt: 180 });
  const full = formatDatablockFields(ac, { tcp, timeSharePhase: 0 });
  expect(physicalDatablockLines(full).line2).toBe(expected);
});

test("Field 0 stays logical and is not duplicated on physical line 1", () => {
  const ac = makeTestAircraft({ callsign: "FDB0", altitudeFt: 3000, speedKt: 180 });
  const fields = formatDatablockFields(ac, { tsasSequence: 7, timeSharePhase: 0 });
  const lines = physicalDatablockLines(fields);

  expect(fields.field0).toBe("7");
  expect(lines.line1).toBe("FDB0");
  expect(lines.line1).not.toContain(fields.field0);
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
