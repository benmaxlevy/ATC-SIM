import { expect, test } from "vitest";
import { HELP_COMMAND_GROUPS } from "@scope";
import { SIM_DT_S, SessionLog, createAircraft, createWorld, stepWorld } from "@core";
import { handleRadioText } from "../handleRadioText";

const ILS_APPROACH = {
  id: "ILS27",
  type: "ILS",
  courseDeg: 270,
  lengthNm: 18,
  thresholdFixId: "RW27",
  gsAngleDeg: 3,
  tchFt: 50,
} as const;

const RNAV_APPROACH = {
  id: "RNAV09",
  type: "RNAV",
  courseDeg: 90,
  lengthNm: 12,
  thresholdFixId: "RW09",
} as const;

function syntheticCatalog() {
  return {
    airportId: "TEST",
    fieldElevFt: 0,
    navaids: [],
    fixes: [
      { id: "RW27", xNm: 0, yNm: 0, kind: "RUNWAY" },
      { id: "RW09", xNm: 0, yNm: 0, kind: "RUNWAY" },
      { id: "VECTOR", xNm: 12, yNm: 0, kind: "INTERSECTION" },
    ],
    stars: [],
    approaches: [ILS_APPROACH, RNAV_APPROACH],
    sids: [],
  };
}

function approachAircraft(args: {
  approachId: "ILS27" | "RNAV09";
  lateral: "INTERCEPT_LOC" | "LOC" | "MISSED" | "LANDING";
  vertical?: "GS";
  headingDeg?: number;
  altitudeFt?: number;
}) {
  const ac = createAircraft({
    id: `ac-${args.approachId.toLowerCase()}`,
    callsign: "DAL123",
    xNm: 8,
    yNm: 0,
    headingDeg: args.headingDeg ?? 100,
    altitudeFt: args.altitudeFt ?? 2000,
    speedKt: 220,
  });
  ac.intent.expectedApproachId = args.approachId;
  ac.intent.clearedApproachId = args.approachId;
  ac.intent.locInterceptApproachId = args.approachId;
  ac.intent.lateral = { type: args.lateral, approachId: args.approachId };
  if (args.vertical) {
    ac.intent.vertical = { type: args.vertical, approachId: args.approachId };
  }
  return ac;
}

function worldFor(ac: ReturnType<typeof approachAircraft>) {
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [ac],
    catalog: syntheticCatalog(),
    sessionLog: log,
  });
  return { world, log };
}

function intentSnapshot(ac: ReturnType<typeof approachAircraft>) {
  return structuredClone(ac.intent);
}

/*
 * Manual evidence / trainer delta:
 * - FAA JO 7110.65, §4-8-1: “CANCEL APPROACH CLEARANCE (additional
 *   instructions as necessary)” — https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_8.html
 * - FAA AIM, §5-4-5 and §5-4-21 — https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_4.html
 * ATC-SIM changes local simulated intent only. It does not cancel an IFR
 * clearance, claim obstacle clearance, or model certified approach monitoring.
 * It also does not start the published missed approach; GO_AROUND remains the
 * separate missed-approach command.
 */
test("GS breakout leaves assigned flight and emits no missed or landing event", async () => {
  const ac = approachAircraft({ approachId: "ILS27", lateral: "LOC", vertical: "GS" });
  const { world, log } = worldFor(ac);

  const result = await handleRadioText(world, "DAL123 CAPP H270 A50", log);

  expect(result.accepted).toBe(true);
  expect(result.readback).toContain("cancel approach clearance");
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(ac.intent.clearedApproachId).toBeNull();
  expect(ac.intent.locInterceptApproachId).toBeNull();
  expect(ac.intent.expectedApproachId).toBeNull();

  stepWorld(world, SIM_DT_S);
  expect(world.aircraft).toHaveLength(1);
  expect(log.byType("nav.missed.started")).toHaveLength(0);
  expect(log.byType("nav.landed")).toHaveLength(0);
});

test("pre-capture ILS and generic RNAV cancellation both break to heading", async () => {
  const preCapture = approachAircraft({ approachId: "ILS27", lateral: "INTERCEPT_LOC" });
  const preCaptureWorld = worldFor(preCapture);
  const preCaptureResult = await handleRadioText(
    preCaptureWorld.world,
    "DAL123 CAPP H270 A50",
    preCaptureWorld.log,
  );

  expect(preCaptureResult.accepted).toBe(true);
  expect(preCapture.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  stepWorld(preCaptureWorld.world, 20);
  expect(preCaptureWorld.log.byType("nav.loc.captured")).toHaveLength(0);

  const rnav = approachAircraft({ approachId: "RNAV09", lateral: "LOC", vertical: "GS" });
  const rnavWorld = worldFor(rnav);
  const rnavResult = await handleRadioText(rnavWorld.world, "DAL123 CAPP H270 A50", rnavWorld.log);

  expect(rnavResult.accepted).toBe(true);
  expect(rnav.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  expect(rnav.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(rnav.intent.clearedApproachId).toBeNull();
});

test("CAPP alone uses present heading and preserves assigned vertical mode", async () => {
  const ac = approachAircraft({
    approachId: "RNAV09",
    lateral: "LOC",
    vertical: "GS",
    headingDeg: 217,
    altitudeFt: 7000,
  });
  const { world, log } = worldFor(ac);

  const result = await handleRadioText(world, "DAL123 CAPP", log);

  expect(result.accepted).toBe(true);
  expect(ac.intent.assignedHeadingDeg).toBe(217);
  expect(ac.intent.assignedAltitudeFt).toBe(7000);
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 217 });
  expect(ac.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(log.byType("nav.missed.started")).toHaveLength(0);
  expect(log.byType("nav.landed")).toHaveLength(0);
});

test("typed and PTT spoken canonical forms produce equivalent runtime state", async () => {
  const typed = approachAircraft({ approachId: "ILS27", lateral: "LOC", vertical: "GS" });
  const spoken = approachAircraft({ approachId: "ILS27", lateral: "LOC", vertical: "GS" });
  const typedWorld = worldFor(typed);
  const spokenWorld = worldFor(spoken);

  const typedResult = await handleRadioText(
    typedWorld.world,
    "DAL123 CAPP H270 A50",
    typedWorld.log,
  );
  const spokenResult = await handleRadioText(
    spokenWorld.world,
    "DAL123 cancel approach clearance, fly heading 270, maintain 5000",
    spokenWorld.log,
    0,
    { source: "voice" },
  );

  expect(typedResult.accepted).toBe(true);
  expect(spokenResult.accepted).toBe(true);
  expect(spokenResult.command?.source).toBe("voice");
  expect(spokenResult.command?.parseStage).toBe("spoken_a");
  expect(spokenResult.command?.instructions).toEqual(typedResult.command?.instructions);
  expect(spoken.intent).toEqual(typed.intent);
});

test("projected cancellation validates later direct and speed instructions", async () => {
  const ac = approachAircraft({ approachId: "RNAV09", lateral: "LOC", vertical: "GS" });
  const { world, log } = worldFor(ac);

  const result = await handleRadioText(world, "DAL123 CAPP DCT VECTOR S180", log);

  expect(result.accepted).toBe(true);
  expect(ac.intent.clearedApproachId).toBeNull();
  expect(ac.intent.lateral).toEqual({
    type: "DIRECT",
    fixId: "VECTOR",
    continuation: { type: "PRESENT_HEADING", headingDeg: 100 },
  });
  expect(ac.intent.assignedSpeedKt).toBe(180);
  expect(ac.intent.controllerAssignedSpeedKt).toBe(180);
});

test("supported turn-right and climb-and-maintain spoken variant stays ordered", async () => {
  const ac = approachAircraft({ approachId: "ILS27", lateral: "INTERCEPT_LOC", altitudeFt: 8000 });
  const { world, log } = worldFor(ac);

  const result = await handleRadioText(
    world,
    "DAL123 cancel approach clearance, turn right heading 270, climb and maintain 9000",
    log,
    0,
    { source: "voice" },
  );

  expect(result.accepted).toBe(true);
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  expect(ac.intent.turn).toBe("RIGHT");
  expect(ac.intent.assignedAltitudeFt).toBe(9000);
});

test.each(["DAL123 CAPP CAPP", "DAL123 CAPP H A50", "DAL123 CAPP H270 A"])(
  "malformed cancellation %s rejects without mutation",
  async (sourceText) => {
    const ac = approachAircraft({ approachId: "ILS27", lateral: "LOC", vertical: "GS" });
    const before = intentSnapshot(ac);
    const { world, log } = worldFor(ac);

    const result = await handleRadioText(world, sourceText, log);

    expect(result.accepted).toBe(false);
    expect(ac.intent).toEqual(before);
    expect(log.byType("command.accepted")).toHaveLength(0);
  },
);

test("spoken cancellation/re-arm near miss rejects without mutation", async () => {
  const ac = approachAircraft({ approachId: "ILS27", lateral: "LOC", vertical: "GS" });
  const before = intentSnapshot(ac);
  const { world, log } = worldFor(ac);

  const result = await handleRadioText(
    world,
    "DAL123 cancel approach clearance, fly heading 270, cleared ILS runway 27 approach",
    log,
    0,
    { source: "voice" },
  );

  expect(result.accepted).toBe(false);
  // The deterministic spoken grammar rejects this unsupported re-arm wording
  // at the parse boundary; it must still never reach pilot application.
  expect(result.reason).toBe("PARSE");
  expect(ac.intent).toEqual(before);
});

test.each(["MISSED", "LANDING"] as const)(
  "cancellation does not alter %s lifecycle state",
  async (lateral) => {
    const ac = approachAircraft({ approachId: "RNAV09", lateral });
    const before = intentSnapshot(ac);
    const { world, log } = worldFor(ac);

    const result = await handleRadioText(world, "DAL123 CAPP", log);

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("NOT_ON_APPROACH");
    expect(result.readback).toBe("Delta 123 unable, not on approach");
    expect(ac.intent).toEqual(before);
    expect(log.byType("nav.missed.started")).toHaveLength(0);
    expect(log.byType("nav.landed")).toHaveLength(0);
  },
);

test("existing command reference documents CAPP without adding a scope command", () => {
  const radio = HELP_COMMAND_GROUPS.find((group) => group.id === "radio");
  const entry = radio?.entries.find((item) => item.id === "cancel-approach");

  expect(entry).toMatchObject({
    command: "CAPP / cancel approach clearance",
    input: "Radio",
  });
  expect(entry?.result).toMatch(/start the missed approach/i);
});
