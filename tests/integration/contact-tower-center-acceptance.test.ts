import { describe, expect, it, vi } from "vitest";
import {
  createAircraft,
  createWorld,
  deleteFlightPlan,
  handoffFor,
  isFlightPlanClosed,
  isFlightPlanOperational,
  SessionLog,
  SIM_DT_S,
  stepWorld,
  type FlightPlan,
} from "@core";
import { parseCommand, parseRadioText, schemaCheckPathC } from "@parse";
import { matchSpokenPatterns } from "../../src/parse/spoken/pattern-matcher";
import { parseSpokenGrammar } from "../../src/parse/spoken/grammar";
import { handleRadioText } from "@pilot";
import type { RegionalFacility } from "@scenario";

const ILS27 = {
  id: "ILS27",
  courseDeg: 270,
  lengthNm: 18,
  beamHalfWidthDeg: 2.5,
  thresholdFixId: "RW27",
  gsAngleDeg: 3,
  tchFt: 50,
  daFt: 200,
  missed: { headingDeg: 270, climbToFt: 3000, directFixId: "MISSD" },
} as const;

function catalog() {
  return {
    airportId: "KDEM",
    fieldElevFt: 0,
    navaids: [],
    fixes: [
      { id: "RW27", xNm: 0, yNm: 0, kind: "fix" },
      { id: "MISSD", xNm: -8, yNm: 6, kind: "fix" },
    ],
    stars: [],
    approaches: [ILS27],
    sids: [],
  };
}

function regional(towered = true): RegionalFacility {
  const airport = {
    icao: "KDEM",
    name: "SYNTHETIC DEMO",
    arp: { latDeg: 0, lonDeg: 0 },
    arpNm: { xNm: 0, yNm: 0 },
    fieldElevFt: 0,
    magVarDeg: 0,
    publicUse: true,
    towered,
    eligible: true,
    runways: [
      {
        id: "27",
        threshold: { latDeg: 0, lonDeg: 0 },
        thresholdNm: { xNm: 0, yNm: 0 },
        headingTrueDeg: 270,
        headingMagDeg: 270,
        lengthFt: 5000,
      },
    ],
    hasPublishedApproaches: true,
    catalogRef: "synthetic",
  };
  return {
    schemaVersion: 1,
    centerAirportId: "KDEM",
    facilityName: "SYNTHETIC",
    radiusNm: 40,
    arp: { latDeg: 0, lonDeg: 0 },
    source: { families: [] },
    airports: [airport],
    airspaces: [],
    getAirport: (icao: string) => (icao.toUpperCase() === airport.icao ? airport : undefined),
  } as unknown as RegionalFacility;
}

function plan(acid: string, flightType: FlightPlan["flightType"], airportId = "KDEM"): FlightPlan {
  return {
    id: `fp-${acid}`,
    status: "active",
    acid,
    flightType,
    flightRules: flightType === "IFR" ? "I" : flightType,
    airportId,
    fixes: [],
    scratchpads: [],
  };
}

function commandText(callsign: string, body: string): string {
  return `${callsign} ${body}`;
}

describe("T04-103 contact tower/center integrated acceptance", () => {
  it("keeps CONTACT_TOWER/CENTER identical across typed, Path A/B, PTT, and Path C schema routes", async () => {
    const tower = { type: "CONTACT_TOWER", facilityName: "ATLANTA" } as const;
    const center = { type: "CONTACT_CENTER", facilityName: "ATLANTA" } as const;

    expect(parseRadioText(commandText("DAL123", "CONTACT ATLANTA TOWER"))).toMatchObject({
      ok: true,
      instructions: [tower],
    });
    expect(
      parseSpokenGrammar(
        "delta one two three contact atlanta tower",
        undefined,
        "delta one two three contact atlanta tower",
      ),
    ).toMatchObject({ ok: true, instructions: [tower] });
    expect(
      matchSpokenPatterns(
        "delta one two three contact atlanta center",
        undefined,
        "Delta 123 contact Atlanta center",
      ),
    ).toMatchObject({ ok: true, instructions: [center] });

    const ptt = await parseCommand("delta one two three contact atlanta center", {
      source: "voice",
      pathC: false,
    });
    expect(ptt).toMatchObject({ ok: true, instructions: [center] });

    const pathC = schemaCheckPathC({
      ok: true,
      callsignToken: "DAL123",
      instructions: [{ type: "CONTACT_TOWER", facilityName: "atlanta" }],
    });
    expect(pathC).toEqual({ callsignToken: "DAL123", instructions: [tower] });

    const mockedSpeechRoute = vi.fn(async () => ({
      callsignToken: "DAL123",
      instructions: [tower],
    }));
    const speechMiss = await parseCommand("DAL123 contact atlanta tower 118.5", {
      source: "voice",
      pathC: true,
      parsePathC: mockedSpeechRoute,
    });
    expect(mockedSpeechRoute).toHaveBeenCalled();
    expect(speechMiss.ok).toBe(false);
  });

  it("transfers an eligible IFR arrival, then closes only at actual nav.landed", async () => {
    const log = new SessionLog();
    const aircraft = createAircraft({
      id: "ifr-arrival",
      callsign: "IFR123",
      destination: "KDEM",
      xNm: 0.8,
      yNm: 0,
      headingDeg: 270,
      altitudeFt: 310,
      speedKt: 160,
      flightRules: "IFR",
      airborne: true,
    });
    aircraft.intent.lateral = { type: "LOC", approachId: "ILS27" };
    aircraft.intent.vertical = { type: "GS", approachId: "ILS27" };
    aircraft.intent.clearedApproachId = "ILS27";
    aircraft.assignedSquawk = "4521";
    const flightPlan = plan("IFR123", "IFR");
    const world = createWorld({
      aircraft: [aircraft],
      catalog: catalog(),
      flightPlans: [flightPlan],
      regional: regional(),
      sessionLog: log,
    });

    const transferred = await handleRadioText(world, "IFR123 CONTACT ATLANTA TOWER", log);
    expect(transferred.accepted).toBe(true);
    expect(aircraft.intent.lateral).toEqual({ type: "LANDING", approachId: "ILS27" });
    expect(aircraft.flightRules).toBe("IFR");
    expect(aircraft.assignedSquawk).toBe("4521");
    expect(flightPlan.closedAtSimMs).toBeUndefined();

    while (world.aircraft.length > 0 && world.simTimeMs < 120_000) {
      stepWorld(world, SIM_DT_S);
    }

    expect(log.byType("nav.landed")).toHaveLength(1);
    expect(flightPlan.closedAtSimMs).toBe(world.simTimeMs);
    expect(isFlightPlanClosed(flightPlan)).toBe(true);
    expect(isFlightPlanOperational(flightPlan)).toBe(false);
    expect(world.flightPlans).toContain(flightPlan);
    expect(deleteFlightPlan(flightPlan)).toBe(flightPlan);
  });

  it("transfers an eligible VFR arrival without changing VFR or authorizing Bravo", async () => {
    const aircraft = createAircraft({
      id: "vfr-arrival",
      callsign: "N12345",
      destination: "KDEM",
      xNm: 3,
      yNm: 0,
      headingDeg: 270,
      altitudeFt: 1900,
      speedKt: 100,
      flightRules: "VFR",
      airborne: true,
      ambientVfr: {
        mission: "AIRPORT_BOUND",
        zoneId: "synthetic",
        destinationAirportId: "KDEM",
        destinationRunwayId: "27",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
        waypoints: [],
        waypointIndex: 0,
      },
    });
    const flightPlan = plan("N12345", "VFR");
    const world = createWorld({
      aircraft: [aircraft],
      flightPlans: [flightPlan],
      regional: regional(),
      sessionLog: new SessionLog(),
    });

    const transferred = await handleRadioText(
      world,
      "N12345 CONTACT ATHENS TOWER",
      world.sessionLog!,
    );
    expect(transferred.accepted).toBe(true);
    expect(aircraft.flightRules).toBe("VFR");
    expect(aircraft.classBClearance).toBeUndefined();
    expect(aircraft.ambientVfr?.phase).toBe("HANDOFF_COMPLETED");
    expect(aircraft.intent.lateral?.type).toBe("VISUAL_FINAL");

    while (world.aircraft.length > 0 && world.simTimeMs < 180_000) {
      stepWorld(world, SIM_DT_S);
    }

    expect(world.sessionLog?.byType("nav.landed")).toHaveLength(1);
    expect(flightPlan.closedAtSimMs).toBeUndefined();
    expect(isFlightPlanOperational(flightPlan)).toBe(true);
  });

  it("preserves center-transfer state and rejects an ineligible tower command atomically", async () => {
    const centerAircraft = createAircraft({
      id: "center-departure",
      callsign: "N54321",
      xNm: 2,
      yNm: 2,
      headingDeg: 90,
      altitudeFt: 6000,
      speedKt: 220,
      flightRules: "VFR",
      squawk: "1200",
      airborne: true,
    });
    centerAircraft.flightFollowing = { active: true, approvedAtSimMs: 0, requestId: "ff-1" };
    const centerWorld = createWorld({ aircraft: [centerAircraft], regional: regional() });
    const before = structuredClone({
      intent: centerAircraft.intent,
      flightRules: centerAircraft.flightRules,
      squawk: centerAircraft.squawk,
      flightFollowing: centerAircraft.flightFollowing,
    });
    const centerResult = await handleRadioText(
      centerWorld,
      "N54321 CONTACT ATLANTA CENTER",
      new SessionLog(),
    );
    expect(centerResult.accepted).toBe(true);
    expect(handoffFor(centerWorld, centerAircraft.id)).toMatchObject({
      kind: "outbound",
      toSectorId: "C",
    });
    expect({
      intent: centerAircraft.intent,
      flightRules: centerAircraft.flightRules,
      squawk: centerAircraft.squawk,
      flightFollowing: centerAircraft.flightFollowing,
    }).toEqual(before);

    const transit = createAircraft({
      id: "vfr-transit",
      callsign: "N99999",
      xNm: 3,
      yNm: 0,
      headingDeg: 270,
      altitudeFt: 1900,
      speedKt: 100,
      flightRules: "VFR",
      airborne: true,
      ambientVfr: {
        mission: "TRANSIT",
        zoneId: "synthetic",
        destinationAirportId: "KDEM",
        destinationRunwayId: "27",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
        waypoints: [],
        waypointIndex: 0,
      },
    });
    const transitWorld = createWorld({ aircraft: [transit], regional: regional() });
    const transitBefore = structuredClone(transit);
    const rejected = await handleRadioText(
      transitWorld,
      "N99999 CONTACT ATHENS TOWER",
      new SessionLog(),
    );
    expect(rejected.accepted).toBe(false);
    expect(rejected.detail).toBe("CONTACT TOWER: aircraft is not eligible for tower transfer");
    expect(transit).toEqual(transitBefore);
  });

  it.each([
    ["VFR", true],
    ["DVFR", true],
    ["IFR", false],
  ] as const)("keeps %s or non-towered IFR plans open after touchdown", (flightRules, towered) => {
    const callsign = `${flightRules}456`;
    const aircraft = createAircraft({
      id: `landed-${flightRules}`,
      callsign,
      destination: "KDEM",
      xNm: -0.1,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 50,
      speedKt: 100,
      flightRules,
      airborne: true,
    });
    aircraft.intent.lateral = {
      type: "VISUAL_FINAL",
      runwayId: "27",
      threshold: { xNm: 0, yNm: 0 },
      headingDeg: 90,
      fieldElevFt: 0,
    };
    const flightPlan = plan(callsign, flightRules, "KDEM");
    const world = createWorld({
      aircraft: [aircraft],
      flightPlans: [flightPlan],
      regional: regional(towered),
      sessionLog: new SessionLog(),
    });

    stepWorld(world, 0);

    expect(world.aircraft).toHaveLength(0);
    expect(flightPlan.closedAtSimMs).toBeUndefined();
    expect(isFlightPlanOperational(flightPlan)).toBe(true);
  });
});
