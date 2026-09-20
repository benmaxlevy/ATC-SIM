import { describe, expect, test } from "vitest";
import {
  createAircraft,
  createWorld,
  closeFlightPlan,
  deleteFlightPlan,
  despawnLandedAircraft,
  handoffFor,
  isFlightPlanOperational,
  type FlightPlan,
} from "@core";
import { handleRadioCommand } from "../handleRadioText";
import { SessionLog } from "../../core/events/session-log";

function regional(towered = true) {
  const airport = {
    icao: "KAAA",
    name: "SYNTHETIC",
    arp: { latDeg: 0, lonDeg: 0 },
    arpNm: { xNm: 0, yNm: 0 },
    fieldElevFt: 1000,
    magVarDeg: 0,
    publicUse: true,
    towered,
    eligible: true,
    runways: [
      {
        id: "09",
        threshold: { latDeg: 0, lonDeg: 0 },
        thresholdNm: { xNm: 0, yNm: 0 },
        headingTrueDeg: 90,
        headingMagDeg: 90,
        lengthFt: 5000,
      },
    ],
    hasPublishedApproaches: false,
    catalogRef: "synthetic",
  };
  return {
    airports: [airport],
    airspaces: [],
    getAirport: (icao: string) => (icao.toUpperCase() === airport.icao ? airport : undefined),
  };
}

function command(
  callsign: string,
  instruction: Extract<import("@core").Instruction, { type: "CONTACT_TOWER" | "CONTACT_CENTER" }>,
) {
  return {
    id: "test-command",
    callsign,
    instructions: [instruction],
    sourceText: callsign,
    issuedAtSimMs: 0,
    parseStage: "typed" as const,
    source: "text" as const,
  };
}

function vfrArrival() {
  return createAircraft({
    id: "vfr-arrival",
    callsign: "N12345",
    xNm: -3,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 1900,
    speedKt: 100,
    flightRules: "VFR",
    airborne: true,
    ambientVfr: {
      mission: "AIRPORT_BOUND",
      zoneId: "synthetic",
      destinationAirportId: "KAAA",
      destinationRunwayId: "09",
      spawnedAtSimMs: 0,
      alertEligibility: "CONTROLLED",
      waypoints: [],
      waypointIndex: 0,
    },
  });
}

describe("T04-102 contact transfer runtime", () => {
  test("CONTACT TOWER accepts an eligible VFR arrival and preserves VFR", () => {
    const aircraft = vfrArrival();
    const world = createWorld({ aircraft: [aircraft], regional: regional() });
    const result = handleRadioCommand(
      world,
      command("N12345", { type: "CONTACT_TOWER", facilityName: "ATHENS" }),
      new SessionLog(),
    );

    expect(result.accepted).toBe(true);
    expect(aircraft.flightRules).toBe("VFR");
    expect(aircraft.intent.lateral).toMatchObject({ type: "VISUAL_FINAL", runwayId: "09" });
    expect(aircraft.ambientVfr?.phase).toBe("HANDOFF_COMPLETED");
  });

  test("CONTACT TOWER rejects VFR transit atomically", () => {
    const aircraft = vfrArrival();
    aircraft.ambientVfr!.mission = "TRANSIT";
    const before = structuredClone(aircraft);
    const world = createWorld({ aircraft: [aircraft], regional: regional() });
    const result = handleRadioCommand(
      world,
      command("N12345", { type: "CONTACT_TOWER", facilityName: "ATHENS" }),
      new SessionLog(),
    );

    expect(result).toMatchObject({
      accepted: false,
      reason: "CONTACT_TOWER",
      detail: "CONTACT TOWER: aircraft is not eligible for tower transfer",
    });
    expect(aircraft).toEqual(before);
  });

  test("CONTACT CENTER initiates the generic outbound handoff", () => {
    const aircraft = createAircraft({
      id: "center-departure",
      callsign: "N54321",
      xNm: 2,
      yNm: 2,
      headingDeg: 90,
      altitudeFt: 6000,
      speedKt: 220,
      flightRules: "VFR",
      airborne: true,
    });
    const world = createWorld({ aircraft: [aircraft], regional: regional() });
    const result = handleRadioCommand(
      world,
      command("N54321", { type: "CONTACT_CENTER", facilityName: "ATLANTA" }),
      new SessionLog(),
    );

    expect(result.accepted).toBe(true);
    expect(handoffFor(world, aircraft.id)).toMatchObject({ kind: "outbound", toSectorId: "C" });
    expect(aircraft.flightRules).toBe("VFR");
  });

  test.each([false, true])("CONTACT TOWER rejects missing/non-towered destination", (towered) => {
    const aircraft = vfrArrival();
    aircraft.ambientVfr!.destinationAirportId = towered ? "KBBB" : "KAAA";
    const world = createWorld({ aircraft: [aircraft], regional: regional(towered) });
    const result = handleRadioCommand(
      world,
      command("N12345", { type: "CONTACT_TOWER", facilityName: "ATHENS" }),
      new SessionLog(),
    );

    expect(result.accepted).toBe(false);
    expect(result.detail).toBe("CONTACT TOWER: no eligible towered destination");
  });
});

function plan(overrides: Partial<FlightPlan> = {}): FlightPlan {
  return {
    id: "fp-ifr",
    status: "active",
    acid: "IFR123",
    flightType: "IFR",
    flightRules: "I",
    airportId: "KAAA",
    fixes: [],
    scratchpads: [],
    ...overrides,
  };
}

test("touchdown closes only active IFR plan at functioning towered airport", async () => {
  const aircraft = createAircraft({
    id: "ifr-arrival",
    callsign: "IFR123",
    xNm: -0.1,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 1050,
    speedKt: 120,
    flightRules: "IFR",
    airborne: true,
  });
  aircraft.intent.lateral = {
    type: "VISUAL_FINAL",
    runwayId: "09",
    threshold: { xNm: 0, yNm: 0 },
    headingDeg: 90,
    fieldElevFt: 1000,
  };
  const flightPlan = plan();
  const world = createWorld({
    aircraft: [aircraft],
    flightPlans: [flightPlan],
    regional: regional(),
    simTimeMs: 1234,
  });

  despawnLandedAircraft(world);

  expect(world.aircraft).toHaveLength(0);
  expect(flightPlan.closedAtSimMs).toBe(1234);
  expect(isFlightPlanOperational(flightPlan)).toBe(false);
  expect(world.flightPlans).toContain(flightPlan);
});

test("VFR touchdown and non-towered IFR touchdown do not auto-close plans", async () => {
  const vfr = vfrArrival();
  vfr.xNm = -0.1;
  vfr.altitudeFt = 1050;
  vfr.intent.lateral = {
    type: "VISUAL_FINAL",
    runwayId: "09",
    threshold: { xNm: 0, yNm: 0 },
    headingDeg: 90,
    fieldElevFt: 1000,
  };
  const vfrPlan = plan({ id: "fp-vfr", acid: "N12345", flightType: "VFR", flightRules: "VFR" });
  const ifr = createAircraft({
    id: "ifr-untowered",
    callsign: "IFR456",
    xNm: -0.1,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 1050,
    speedKt: 120,
    flightRules: "IFR",
    airborne: true,
  });
  ifr.intent.lateral = {
    type: "VISUAL_FINAL",
    runwayId: "09",
    threshold: { xNm: 0, yNm: 0 },
    headingDeg: 90,
    fieldElevFt: 1000,
  };
  const ifrPlan = plan({ id: "fp-untowered", acid: "IFR456", airportId: "KBBB" });
  const world = createWorld({
    aircraft: [vfr, ifr],
    flightPlans: [vfrPlan, ifrPlan],
    regional: { ...regional(false), getAirport: () => undefined },
  });

  despawnLandedAircraft(world);

  expect(vfrPlan.closedAtSimMs).toBeUndefined();
  expect(ifrPlan.closedAtSimMs).toBeUndefined();
});

test("closed plan remains historical and cannot be reopened or deleted", () => {
  const closed = closeFlightPlan(plan(), 5000);
  expect(deleteFlightPlan(closed)).toEqual(closed);
  expect(closed.closedAtSimMs).toBe(5000);
});
