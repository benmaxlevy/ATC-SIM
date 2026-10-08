import { describe, expect, it } from "vitest";
import {
  createAircraft,
  buildFixRegistry,
  createWorld,
  SessionLog,
  type ActiveIfrClearance,
  type Aircraft,
} from "@core";
import { parseRegionalPack, type RegionalFacility } from "@scenario";
import {
  bearingToCardinalDirection,
  createVfrRequestQueue,
  defaultIfrCancellationValidator,
  formatIfrPickupRequest,
  formatVfrPositionReport,
  isAirborneVfrEligible,
  validateVfrRequestConfig,
  VFR_CANCEL_DELAY_MAX_MS,
  VFR_CANCEL_DELAY_MIN_MS,
  VFR_REQUEST_DEFAULT_SEED,
  VFR_REQUEST_IDLE_GAP_MS,
  type VfrRequestRadio,
} from "../vfrRequestQueue";

const dummyClearance: ActiveIfrClearance = {
  route: {
    route: { text: "", segments: [] },
    nextIndex: 0,
    revision: 1,
    lifecycle: "active",
  },
  limitId: "KPDK",
  access: { type: "RADAR_VECTORS" },
  issuedAtSimMs: 0,
};

const SYNTHETIC_REGIONAL_MANIFEST = {
  schemaVersion: 1,
  centerAirportId: "KSYN",
  radiusNm: 40,
  source: { families: ["CIFP", "NASR_APT"] },
  files: { airports: "regional-airports.json", airspace: "regional-airspace.json" },
};

const SYNTHETIC_REGIONAL_AIRPORTS = [
  {
    icao: "KPDK",
    name: "Peachtree-DeKalb Airport",
    arp: { latDeg: 33.8756, lonDeg: -84.302 },
    fieldElevFt: 1003,
    magVarDeg: -5,
    publicUse: true,
    towered: true,
    eligible: true,
    serviceMetadata: {
      publicUse: true,
      towered: true,
      sourceFile: "APT.csv",
      sourceRecordId: "KPDK",
    },
    catalogRef: "airports/KPDK",
    runways: [
      {
        id: "21L",
        threshold: { latDeg: 33.8756, lonDeg: -84.302 },
        headingTrueDeg: 210,
        headingMagDeg: 215,
        lengthFt: 6001,
      },
    ],
    hasPublishedApproaches: true,
  },
  {
    icao: "KFTY",
    name: "Fulton County Airport",
    arp: { latDeg: 33.779, lonDeg: -84.521 },
    fieldElevFt: 841,
    magVarDeg: -5,
    publicUse: true,
    towered: true,
    eligible: true,
    serviceMetadata: {
      publicUse: true,
      towered: true,
      sourceFile: "APT.csv",
      sourceRecordId: "KFTY",
    },
    catalogRef: "airports/KFTY",
    runways: [
      {
        id: "08",
        threshold: { latDeg: 33.779, lonDeg: -84.521 },
        headingTrueDeg: 80,
        headingMagDeg: 85,
        lengthFt: 5797,
      },
    ],
    hasPublishedApproaches: true,
  },
];

const SYNTHETIC_REGIONAL_AIRSPACE = [
  {
    id: "KATL-CLASS-B-CORE",
    name: "KATL Class B Surface Area",
    type: "CONTROLLED",
    class: "B",
    centerAirportId: "KATL",
    lowerLimit: { altitudeFt: 0, unit: "MSL", reference: "MSL" },
    upperLimit: { altitudeFt: 12500, unit: "MSL", reference: "MSL" },
    segments: [
      {
        sequence: 1,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.1, lonDeg: -84.1 },
      },
      {
        sequence: 2,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.1, lonDeg: -83.9 },
      },
      {
        sequence: 3,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 32.9, lonDeg: -83.9 },
      },
      {
        sequence: 4,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 32.9, lonDeg: -84.1 },
      },
      {
        sequence: 5,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.1, lonDeg: -84.1 },
      },
    ],
  },
];

function createSyntheticRegional(): RegionalFacility {
  return parseRegionalPack(
    SYNTHETIC_REGIONAL_MANIFEST,
    SYNTHETIC_REGIONAL_AIRPORTS,
    SYNTHETIC_REGIONAL_AIRSPACE,
    { latDeg: 33.0, lonDeg: -84.0 },
  );
}

function createEmptyRegional(): RegionalFacility {
  return parseRegionalPack(SYNTHETIC_REGIONAL_MANIFEST, [], [], { latDeg: 33.0, lonDeg: -84.0 });
}

function createSyntheticVfrAircraft(
  overrides?: Partial<Parameters<typeof createAircraft>[0]> & {
    ambientVfr?: Partial<NonNullable<Aircraft["ambientVfr"]>>;
  },
): Aircraft {
  const ac = createAircraft({
    callsign: "N172SP",
    xNm: 15,
    yNm: 15,
    headingDeg: 90,
    altitudeFt: 4500,
    speedKt: 110,
    aircraftType: "C172",
    flightRules: "VFR",
    ...overrides,
  });
  ac.ambientVfr = {
    mission: "LOCAL",
    zoneId: "TEST_ZONE",
    spawnedAtSimMs: 0,
    alertEligibility: "AMBIENT_SUPPRESSED",
    phase: "CRUISE",
    ...(overrides?.ambientVfr ?? {}),
  };
  return ac;
}

describe("VfrRequestConfig validation (T04-72)", () => {
  it("defaults omitted config to all zeros", () => {
    expect(validateVfrRequestConfig(undefined)).toBeUndefined();
    expect(validateVfrRequestConfig(null)).toBeUndefined();
    const parsed = validateVfrRequestConfig({});
    expect(parsed).toEqual({
      flightFollowingPercent: 0,
      ifrPickupPercent: 0,
      requestCapPerHour: 0,
      ifrCancellationPercent: 0,
    });
  });

  it("throws stable error for non-object config", () => {
    expect(() => validateVfrRequestConfig("invalid")).toThrow("vfrRequests must be an object");
    expect(() => validateVfrRequestConfig(123)).toThrow("vfrRequests must be an object");
  });

  it("validates flightFollowingPercent range [0, 100]", () => {
    expect(() => validateVfrRequestConfig({ flightFollowingPercent: -5 })).toThrow(
      "vfrRequests.flightFollowingPercent must be in [0, 100]",
    );
    expect(() => validateVfrRequestConfig({ flightFollowingPercent: 101 })).toThrow(
      "vfrRequests.flightFollowingPercent must be in [0, 100]",
    );
    expect(() => validateVfrRequestConfig({ flightFollowingPercent: NaN })).toThrow(
      "vfrRequests.flightFollowingPercent must be in [0, 100]",
    );
  });

  it("validates ifrPickupPercent range [0, 100]", () => {
    expect(() => validateVfrRequestConfig({ ifrPickupPercent: -1 })).toThrow(
      "vfrRequests.ifrPickupPercent must be in [0, 100]",
    );
    expect(() => validateVfrRequestConfig({ ifrPickupPercent: 120 })).toThrow(
      "vfrRequests.ifrPickupPercent must be in [0, 100]",
    );
  });

  it("validates that flightFollowingPercent + ifrPickupPercent <= 100", () => {
    expect(() =>
      validateVfrRequestConfig({ flightFollowingPercent: 60, ifrPickupPercent: 50 }),
    ).toThrow("vfrRequests.flightFollowingPercent + vfrRequests.ifrPickupPercent must be <= 100");
  });

  it("validates requestCapPerHour is finite and >= 0", () => {
    expect(() => validateVfrRequestConfig({ requestCapPerHour: -1 })).toThrow(
      "vfrRequests.requestCapPerHour must be a finite number >= 0",
    );
    expect(() => validateVfrRequestConfig({ requestCapPerHour: Infinity })).toThrow(
      "vfrRequests.requestCapPerHour must be a finite number >= 0",
    );
  });

  it("validates ifrCancellationPercent range [0, 100]", () => {
    expect(() => validateVfrRequestConfig({ ifrCancellationPercent: -10 })).toThrow(
      "vfrRequests.ifrCancellationPercent must be in [0, 100]",
    );
    expect(() => validateVfrRequestConfig({ ifrCancellationPercent: 105 })).toThrow(
      "vfrRequests.ifrCancellationPercent must be in [0, 100]",
    );
  });

  it("accepts valid config and fills omitted fields with 0", () => {
    const config = validateVfrRequestConfig({
      flightFollowingPercent: 30,
      ifrPickupPercent: 20,
      requestCapPerHour: 6,
    });
    expect(config).toEqual({
      flightFollowingPercent: 30,
      ifrPickupPercent: 20,
      requestCapPerHour: 6,
      ifrCancellationPercent: 0,
    });
  });

  it("verifies exported delay and stream constants", () => {
    expect(VFR_REQUEST_DEFAULT_SEED).toBe(1);
    expect(VFR_REQUEST_IDLE_GAP_MS).toBe(500);
    expect(VFR_CANCEL_DELAY_MIN_MS).toBe(30_000);
    expect(VFR_CANCEL_DELAY_MAX_MS).toBe(120_000);
  });
});

describe("VfrRequestQueue eligibility (T04-72)", () => {
  it("rejects non-ambient aircraft", () => {
    const ac = createAircraft({
      callsign: "DAL123",
      flightRules: "VFR",
      xNm: 0,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 5000,
      speedKt: 200,
    });
    expect(isAirborneVfrEligible(ac)).toBe(false);
  });

  it("rejects IFR aircraft", () => {
    const ac = createSyntheticVfrAircraft({ flightRules: "IFR" });
    expect(isAirborneVfrEligible(ac)).toBe(false);
  });

  it("rejects aircraft with active IFR clearance", () => {
    const ac = createSyntheticVfrAircraft();
    ac.activeClearance = dummyClearance;
    expect(isAirborneVfrEligible(ac)).toBe(false);
  });

  it("rejects ground aircraft (altitude 0)", () => {
    const ac = createSyntheticVfrAircraft({ altitudeFt: 0 });
    expect(isAirborneVfrEligible(ac)).toBe(false);
  });

  it("rejects explicitly grounded aircraft even with positive altitude", () => {
    const ac = createSyntheticVfrAircraft({ altitudeFt: 4500, airborne: false });
    expect(isAirborneVfrEligible(ac)).toBe(false);
  });

  it("rejects exiting or handed-off ambient VFR aircraft", () => {
    const ac1 = createSyntheticVfrAircraft();
    ac1.ambientVfr!.phase = "EXITING";
    expect(isAirborneVfrEligible(ac1)).toBe(false);

    const ac2 = createSyntheticVfrAircraft();
    ac2.ambientVfr!.phase = "HANDOFF_COMPLETED";
    expect(isAirborneVfrEligible(ac2)).toBe(false);
  });

  it("accepts active airborne ambient VFR aircraft", () => {
    const ac = createSyntheticVfrAircraft();
    expect(isAirborneVfrEligible(ac)).toBe(true);
  });
});

describe("VfrRequestQueue Class B access scheduling (T04-97)", () => {
  function makeClassBWorld(
    fixes = [
      { id: "FIX1", xNm: 0, yNm: 0, kind: "FIX" },
      { id: "FIX2", xNm: 10, yNm: 0, kind: "FIX" },
    ],
  ) {
    const regional = createSyntheticRegional();
    const world = createWorld({
      regional,
      fixRegistry: buildFixRegistry({ navaids: [], fixes }),
    });
    return { regional, world };
  }

  function makeCrossingAircraft(
    mission: NonNullable<Aircraft["ambientVfr"]>["mission"],
    ambient?: Partial<NonNullable<Aircraft["ambientVfr"]>>,
  ): Aircraft {
    return createSyntheticVfrAircraft({
      id: `ac-${mission.toLowerCase()}`,
      xNm: -15,
      yNm: 0,
      ambientVfr: {
        ...(ambient ?? {}),
        mission,
        zoneId: ambient?.zoneId ?? "synthetic",
        spawnedAtSimMs: ambient?.spawnedAtSimMs ?? 0,
        alertEligibility: ambient?.alertEligibility ?? "AMBIENT_SUPPRESSED",
        waypoints: ambient?.waypoints ?? [{ xNm: 0, yNm: 0, fixId: "FIX1", altitudeFt: 4500 }],
      },
    });
  }

  it.each([
    ["AIRPORT_BOUND", "THROUGH", "ARRIVAL"],
    ["TRANSIT", "THROUGH", "TRANSITION"],
    ["SATELLITE_DEPARTURE", "TO_ENTER", "DEPARTURE"],
  ] as const)("schedules generic %s Class B request", (mission, operation, intent) => {
    const { regional, world } = makeClassBWorld();
    const aircraft = makeCrossingAircraft(mission, {
      destinationAirportId: mission === "AIRPORT_BOUND" ? "KPDK" : undefined,
      originAirportId: mission === "SATELLITE_DEPARTURE" ? "KPDK" : undefined,
    });
    world.aircraft = [aircraft];

    const queue = createVfrRequestQueue({
      regional,
      config: { requestCapPerHour: 10 },
      initialSlotOffsetMs: 0,
    });
    queue.scheduleFromWorld(world, 0);

    expect(queue.getRequests()).toHaveLength(1);
    expect(queue.getRequests()[0]).toMatchObject({
      kind: "CLASS_B_ACCESS",
      classBOperation: operation,
      classBIntent: intent,
      requestedAltitudeFt: 4500,
    });
    expect(queue.getRequests()[0]!.route).toEqual([{ type: "DIRECT", fixId: "FIX1" }]);
    expect(aircraft.flightRules).toBe("VFR");
    expect(aircraft.classBClearance).toBeUndefined();
  });

  it("keeps an AIRPORT_BOUND request TO_ENTER when its projected endpoint is inside Bravo", () => {
    const { regional, world } = makeClassBWorld();
    const destination = regional.getAirport("KPDK")!;
    destination.arpNm = { xNm: 0, yNm: 0 };
    const aircraft = makeCrossingAircraft("AIRPORT_BOUND", {
      destinationAirportId: "KPDK",
    });
    world.aircraft = [aircraft];

    const queue = createVfrRequestQueue({
      regional,
      config: { requestCapPerHour: 10 },
      initialSlotOffsetMs: 0,
    });
    queue.scheduleFromWorld(world, 0);

    expect(queue.getRequests()[0]).toMatchObject({
      classBOperation: "TO_ENTER",
      classBIntent: "ARRIVAL",
    });
  });

  it("schedules a THROUGH request for an underlying-airport departure that exits Bravo", () => {
    const { regional, world } = makeClassBWorld();
    const aircraft = makeCrossingAircraft("SATELLITE_DEPARTURE", {
      originAirportId: "KPDK",
      waypoints: [
        { xNm: 0, yNm: 0, fixId: "FIX1", altitudeFt: 4500 },
        { xNm: 10, yNm: 0, fixId: "FIX2", altitudeFt: 4500 },
      ],
    });
    world.aircraft = [aircraft];

    const queue = createVfrRequestQueue({
      regional,
      config: { requestCapPerHour: 10 },
      initialSlotOffsetMs: 0,
    });
    queue.scheduleFromWorld(world, 0);

    expect(queue.getRequests()[0]).toMatchObject({
      kind: "CLASS_B_ACCESS",
      classBOperation: "THROUGH",
      classBIntent: "DEPARTURE",
      originAirportId: "KPDK",
    });
    expect(queue.getRequests()[0]!.route).toEqual([
      { type: "DIRECT", fixId: "FIX1" },
      { type: "DIRECT", fixId: "FIX2" },
    ]);
  });

  it("does not create a pilot OUT_OF request for a primary-airport departure", () => {
    const { regional, world } = makeClassBWorld();
    const aircraft = makeCrossingAircraft("SATELLITE_DEPARTURE", {
      originAirportId: regional.centerAirportId,
    });
    world.aircraft = [aircraft];

    const queue = createVfrRequestQueue({
      regional,
      config: { requestCapPerHour: 10 },
      initialSlotOffsetMs: 0,
    });
    queue.scheduleFromWorld(world, 0);

    expect(queue.getRequests()).toHaveLength(0);
  });

  it("does not request when the projected route remains below a Bravo shelf", () => {
    const { regional, world } = makeClassBWorld();
    regional.airspaces[0]!.lowerLimitFt = 6000;
    regional.airspaces[0]!.lowerLimit.altitudeFt = 6000;
    const aircraft = makeCrossingAircraft("TRANSIT");
    world.aircraft = [aircraft];

    const queue = createVfrRequestQueue({
      regional,
      config: { requestCapPerHour: 10 },
      initialSlotOffsetMs: 0,
    });
    queue.scheduleFromWorld(world, 0);

    expect(queue.getRequests()).toHaveLength(0);
  });

  it("rejects an ungrounded THROUGH route without falling back to another request", () => {
    const { regional, world } = makeClassBWorld([{ id: "FIX1", xNm: 10, yNm: 0, kind: "FIX" }]);
    const aircraft = makeCrossingAircraft("TRANSIT", {
      waypoints: [{ xNm: 0, yNm: 0, altitudeFt: 4500 }],
    });
    world.aircraft = [aircraft];

    const queue = createVfrRequestQueue({
      regional,
      config: { flightFollowingPercent: 100, requestCapPerHour: 10 },
      initialSlotOffsetMs: 0,
    });
    queue.scheduleFromWorld(world, 0);

    expect(queue.getRequests()).toHaveLength(0);
  });

  it("releases the request-cap slot when a Class B request withdraws before transmission", () => {
    const { regional, world } = makeClassBWorld();
    const first = makeCrossingAircraft("TRANSIT");
    world.aircraft = [first];
    const queue = createVfrRequestQueue({
      regional,
      config: { requestCapPerHour: 1 },
      initialSlotOffsetMs: 0,
    });
    queue.scheduleFromWorld(world, 0);
    first.ambientVfr!.phase = "EXITING";
    const log = new SessionLog();
    queue.drain({ world, log });
    expect(queue.getRequests()[0]!.state).toBe("WITHDRAWN");

    const second = makeCrossingAircraft("TRANSIT", {
      waypoints: [{ xNm: 0, yNm: 0, fixId: "FIX1" }],
    });
    second.id = "ac-second";
    world.aircraft = [second];
    world.simTimeMs = 1000;
    queue.scheduleFromWorld(world, world.simTimeMs);

    expect(queue.getRequests()[1]!.state).toBe("PENDING");
    expect(queue.getRequests()[1]!.dueAtSimMs).toBe(1000);
  });

  it("withdraws and refreshes a changed Class B plan before transmission", () => {
    const { regional, world } = makeClassBWorld();
    const aircraft = makeCrossingAircraft("TRANSIT");
    world.aircraft = [aircraft];
    const queue = createVfrRequestQueue({
      regional,
      config: { requestCapPerHour: 1 },
      initialSlotOffsetMs: 0,
    });
    queue.scheduleFromWorld(world, 0);

    aircraft.ambientVfr!.mission = "AIRPORT_BOUND";
    aircraft.ambientVfr!.originAirportId = "KFTY";
    aircraft.ambientVfr!.destinationAirportId = "KPDK";
    aircraft.ambientVfr!.waypoints = [{ xNm: 10, yNm: 0, fixId: "FIX2", altitudeFt: 5000 }];
    aircraft.requestedAltitudeFt = 5000;

    const log = new SessionLog();
    queue.drain({ world, log });

    const requests = queue.getRequests();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      state: "WITHDRAWN",
      withdrawnReason: "CLASS_B_PLAN_CHANGED",
    });
    expect(requests[1]).toMatchObject({
      state: "TRANSMITTED",
      classBOperation: "THROUGH",
      classBIntent: "ARRIVAL",
      originAirportId: "KFTY",
      destinationAirportId: "KPDK",
      requestedAltitudeFt: 5000,
      route: [{ type: "DIRECT", fixId: "FIX2" }],
    });
    expect(log.byType("vfr.request.transmitted")).toHaveLength(1);
    expect(log.byType("vfr.request.transmitted")[0]!.request).toMatchObject({
      classBIntent: "ARRIVAL",
      destinationAirportId: "KPDK",
      route: [{ type: "DIRECT", fixId: "FIX2" }],
    });
  });
});

describe("VfrRequestQueue seeded distribution & exclusivity (T04-72)", () => {
  it("each eligible ambient spawn draws one outcome once", () => {
    const regional = createSyntheticRegional();
    const queue = createVfrRequestQueue({
      config: {
        flightFollowingPercent: 40,
        ifrPickupPercent: 40,
        requestCapPerHour: 10,
      },
      regional,
      seed: 42,
    });

    const world = createWorld();
    const ac1 = createSyntheticVfrAircraft({ id: "ac-1", callsign: "N111AA" });
    world.aircraft = [ac1];

    queue.scheduleFromWorld(world, 0);
    const requestsAfterFirst = queue.getRequests();
    expect(requestsAfterFirst.length).toBeLessThanOrEqual(1);

    // Repeated scheduleFromWorld does not re-roll or duplicate
    queue.scheduleFromWorld(world, 1000);
    expect(queue.getRequests().length).toBe(requestsAfterFirst.length);
  });

  it("repeating with same seed yields exact same outcome", () => {
    const regional = createSyntheticRegional();
    const q1 = createVfrRequestQueue({
      config: { flightFollowingPercent: 50, ifrPickupPercent: 50, requestCapPerHour: 10 },
      regional,
      seed: 99,
      initialSlotOffsetMs: 1000,
    });
    const q2 = createVfrRequestQueue({
      config: { flightFollowingPercent: 50, ifrPickupPercent: 50, requestCapPerHour: 10 },
      regional,
      seed: 99,
      initialSlotOffsetMs: 1000,
    });

    const world1 = createWorld();
    const world2 = createWorld();
    for (let i = 0; i < 10; i++) {
      world1.aircraft.push(createSyntheticVfrAircraft({ id: `ac-${i}`, callsign: `N${100 + i}` }));
      world2.aircraft.push(createSyntheticVfrAircraft({ id: `ac-${i}`, callsign: `N${100 + i}` }));
    }

    q1.scheduleFromWorld(world1, 0);
    q2.scheduleFromWorld(world2, 0);

    const r1 = q1.getRequests();
    const r2 = q2.getRequests();
    expect(r1.length).toBe(r2.length);
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i].kind).toBe(r2[i].kind);
      expect(r1[i].dueAtSimMs).toBe(r2[i].dueAtSimMs);
    }
  });

  it("withdraws with NO_DESTINATION when IFR pickup has no eligible regional destinations", () => {
    const emptyRegional = createEmptyRegional();
    const queue = createVfrRequestQueue({
      config: {
        flightFollowingPercent: 0,
        ifrPickupPercent: 100, // force IFR pickup
        requestCapPerHour: 10,
      },
      regional: emptyRegional,
      seed: 1,
    });

    const world = createWorld();
    const ac = createSyntheticVfrAircraft({ id: "ac-1", callsign: "N12345" });
    world.aircraft = [ac];

    queue.scheduleFromWorld(world, 0);
    const reqs = queue.getRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0].state).toBe("WITHDRAWN");
    expect(reqs[0].withdrawnReason).toBe("NO_DESTINATION");
  });
});

describe("VfrRequestQueue pacing and admission cap (T04-72)", () => {
  it("cap 0 disables new requests immediately", () => {
    const queue = createVfrRequestQueue({
      config: {
        flightFollowingPercent: 100,
        requestCapPerHour: 0,
      },
      seed: 1,
    });

    const world = createWorld();
    const ac = createSyntheticVfrAircraft({ id: "ac-1", callsign: "N12345" });
    world.aircraft = [ac];

    queue.scheduleFromWorld(world, 0);
    const reqs = queue.getRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0].state).toBe("WITHDRAWN");
    expect(reqs[0].withdrawnReason).toBe("CAP_ZERO");
  });

  it("enforces paced admission spacing (3_600_000 / cap) and bounded first slot offset", () => {
    const regional = createSyntheticRegional();
    const cap = 6; // spacing = 600,000 ms
    const queue = createVfrRequestQueue({
      config: {
        flightFollowingPercent: 100,
        requestCapPerHour: cap,
      },
      regional,
      seed: 1234,
      initialSlotOffsetMs: 50_000,
    });

    const world = createWorld();
    const log = new SessionLog();
    // Spawn 7 aircraft at t=0
    for (let i = 0; i < 7; i++) {
      world.aircraft.push(createSyntheticVfrAircraft({ id: `ac-${i}`, callsign: `N${200 + i}` }));
    }

    queue.scheduleFromWorld(world, 0);
    const reqs = queue.getRequests();
    expect(reqs).toHaveLength(7);

    // Verify slot spacing is at least 3_600_000 / cap = 600_000 ms
    expect(reqs[0].dueAtSimMs).toBe(50_000);
    expect(reqs[1].dueAtSimMs).toBe(650_000);
    expect(reqs[2].dueAtSimMs).toBe(1_250_000);
    expect(reqs[3].dueAtSimMs).toBe(1_850_000);
    expect(reqs[4].dueAtSimMs).toBe(2_450_000);
    expect(reqs[5].dueAtSimMs).toBe(3_050_000);
    // 7th candidate must not exceed rolling hour cap
    expect(reqs[6].dueAtSimMs).toBeGreaterThanOrEqual(reqs[0].dueAtSimMs + 3_600_000);

    // Drain up to 100,000 ms: first request transmits
    world.simTimeMs = 50_000;
    queue.drain({ world, log });
    expect(reqs[0].state).toBe("TRANSMITTED");
    expect(log.byType("vfr.request.transmitted")).toHaveLength(1);

    // Drain before second slot: no additional transmission
    world.simTimeMs = 300_000;
    queue.drain({ world, log });
    expect(log.byType("vfr.request.transmitted")).toHaveLength(1);

    // Drain at second slot: second request transmits
    world.simTimeMs = 650_000;
    queue.drain({ world, log });
    expect(reqs[1].state).toBe("TRANSMITTED");
    expect(log.byType("vfr.request.transmitted")).toHaveLength(2);
  });

  it("due candidates wait FIFO and do not burst on rollover", () => {
    const regional = createSyntheticRegional();
    const queue = createVfrRequestQueue({
      config: {
        flightFollowingPercent: 100,
        requestCapPerHour: 2, // 1_800_000 ms spacing
      },
      regional,
      seed: 1,
      initialSlotOffsetMs: 0,
    });

    const world = createWorld();
    const log = new SessionLog();
    world.aircraft = [
      createSyntheticVfrAircraft({ id: "ac-1", callsign: "N1" }),
      createSyntheticVfrAircraft({ id: "ac-2", callsign: "N2" }),
    ];

    queue.scheduleFromWorld(world, 0);
    const reqs = queue.getRequests();
    expect(reqs[0].callsign).toBe("N1");
    expect(reqs[0].dueAtSimMs).toBe(0);
    expect(reqs[1].callsign).toBe("N2");
    expect(reqs[1].dueAtSimMs).toBe(1_800_000);

    // Even if world time advances to 2_000_000 ms in one jump, drain delivers FIFO
    world.simTimeMs = 2_000_000;
    queue.drain({ world, log });
    // First call transmits
    expect(reqs[0].state).toBe("TRANSMITTED");
    expect(reqs[1].state).toBe("PENDING");
  });
});

describe("VfrRequestQueue radio busy and withdrawal (T04-72)", () => {
  it("retains admitted request when radio is busy and delivers once when idle", () => {
    const regional = createSyntheticRegional();
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, requestCapPerHour: 10 },
      regional,
      seed: 1,
      initialSlotOffsetMs: 1000,
    });

    const world = createWorld();
    const log = new SessionLog();
    world.aircraft = [createSyntheticVfrAircraft({ id: "ac-1", callsign: "N123" })];
    queue.scheduleFromWorld(world, 0);

    let radioBusy = true;
    const radio: VfrRequestRadio = {
      isBusy: () => radioBusy,
    };

    world.simTimeMs = 1500;
    // Due, but radio is busy
    queue.drain({ world, log, radio });
    expect(queue.getRequests()[0].state).toBe("PENDING");
    expect(log.byType("vfr.request.transmitted")).toHaveLength(0);

    // Radio clears
    radioBusy = false;
    queue.drain({ world, log, radio });
    expect(queue.getRequests()[0].state).toBe("TRANSMITTED");
    expect(log.byType("vfr.request.transmitted")).toHaveLength(1);
    expect(log.byType("vfr.request.transmitted")[0].callsign).toBe("N123");
  });

  it("withdraws request cleanly if aircraft exits before due time", () => {
    const regional = createSyntheticRegional();
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, requestCapPerHour: 10 },
      regional,
      seed: 1,
      initialSlotOffsetMs: 5000,
    });

    const world = createWorld();
    const log = new SessionLog();
    const ac = createSyntheticVfrAircraft({ id: "ac-1", callsign: "N123" });
    world.aircraft = [ac];
    queue.scheduleFromWorld(world, 0);

    // Aircraft exits before due time
    world.aircraft = [];
    world.simTimeMs = 6000;

    queue.drain({ world, log });
    const req = queue.getRequests()[0];
    expect(req.state).toBe("WITHDRAWN");
    expect(req.withdrawnReason).toBe("AIRCRAFT_EXITED");
    expect(log.byType("vfr.request.transmitted")).toHaveLength(0);
    expect(log.byType("vfr.request.withdrawn")).toHaveLength(1);
  });

  it("transmitting does not mutate aircraft operational state", () => {
    const regional = createSyntheticRegional();
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, requestCapPerHour: 10 },
      regional,
      seed: 1,
      initialSlotOffsetMs: 0,
    });

    const world = createWorld();
    const log = new SessionLog();
    const ac = createSyntheticVfrAircraft({ id: "ac-1", callsign: "N123", squawk: "1200" });
    world.aircraft = [ac];

    const originalFlightRules = ac.flightRules;
    const originalSquawk = ac.squawk;

    queue.scheduleFromWorld(world, 0);
    world.simTimeMs = 0;
    queue.drain({ world, log });

    expect(queue.getRequests()[0].state).toBe("TRANSMITTED");
    expect(ac.flightRules).toBe(originalFlightRules);
    expect(ac.squawk).toBe(originalSquawk);
    expect(ac.activeClearance).toBeUndefined();
  });
});

describe("VfrRequestQueue reset behavior (T04-72)", () => {
  it("clears pending records and resets stream without leaking stale IDs", () => {
    const regional = createSyntheticRegional();
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, requestCapPerHour: 10 },
      regional,
      seed: 1,
    });

    const world = createWorld();
    world.aircraft = [createSyntheticVfrAircraft({ id: "ac-1", callsign: "N1" })];
    queue.scheduleFromWorld(world, 0);
    expect(queue.getRequests()).toHaveLength(1);

    queue.reset();
    expect(queue.getRequests()).toHaveLength(0);

    // Rescheduling the same aircraft ID works because evaluated IDs were cleared
    queue.scheduleFromWorld(world, 0);
    expect(queue.getRequests()).toHaveLength(1);
  });
});

describe("VfrRequestQueue IFR cancellation candidate hook (T04-72)", () => {
  it("cancellation percent 0 never schedules candidate", () => {
    const queue = createVfrRequestQueue({
      config: { ifrCancellationPercent: 0 },
      seed: 1,
    });
    const ac = createSyntheticVfrAircraft({ flightRules: "IFR" });
    const result = queue.scheduleIfrCancellationCandidate(ac, 1000);
    expect(result).toBeNull();
    expect(queue.getCancellationCandidates()).toHaveLength(0);
  });

  it("cancellation percent 100 schedules candidate with seeded delay", () => {
    const queue = createVfrRequestQueue({
      config: { ifrCancellationPercent: 100 },
      seed: 1,
      cancellationDelayMs: 45_000,
    });
    const log = new SessionLog();
    const ac = createSyntheticVfrAircraft({ flightRules: "IFR" });
    const result = queue.scheduleIfrCancellationCandidate(ac, 10_000, { log });

    expect(result).not.toBeNull();
    expect(result!.callsign).toBe(ac.callsign);
    expect(result!.dueAtSimMs).toBe(55_000);
    expect(result!.state).toBe("PENDING");

    expect(log.byType("pilot.cancel_ifr.scheduled")).toHaveLength(1);
    expect(log.byType("pilot.cancel_ifr.scheduled")[0].dueSimMs).toBe(55_000);
  });

  it("default validator checks flightRules and clearance", () => {
    const world = createWorld();
    const ac1 = createSyntheticVfrAircraft({ flightRules: "VFR" });
    expect(defaultIfrCancellationValidator(ac1, world)).toEqual({
      ok: false,
      reason: "ALREADY_VFR",
    });

    const ac2 = createSyntheticVfrAircraft({ flightRules: "IFR" });
    expect(defaultIfrCancellationValidator(ac2, world)).toEqual({
      ok: false,
      reason: "NO_ACTIVE_IFR",
    });

    ac2.activeClearance = dummyClearance;
    expect(defaultIfrCancellationValidator(ac2, world)).toEqual({ ok: true });
  });

  it("at due time: emits pilot.cancel_ifr.reported when outside Class B and communicating", () => {
    const regional = createSyntheticRegional();
    const queue = createVfrRequestQueue({
      config: { ifrCancellationPercent: 100 },
      regional,
      seed: 1,
      cancellationDelayMs: 30_000,
    });
    const log = new SessionLog();
    const world = createWorld();
    world.regional = regional;

    // Aircraft outside Class B core (x: 20, y: 20)
    const ac = createSyntheticVfrAircraft({
      id: "ifr-1",
      callsign: "N999IFR",
      flightRules: "IFR",
      xNm: 20,
      yNm: 20,
      altitudeFt: 5000,
    });
    ac.activeClearance = dummyClearance;
    world.aircraft = [ac];

    queue.scheduleIfrCancellationCandidate(ac, 0, { log });
    expect(queue.getCancellationCandidates()).toHaveLength(1);

    // Before due time
    world.simTimeMs = 15_000;
    queue.drain({ world, log });
    expect(queue.getCancellationCandidates()[0].state).toBe("PENDING");
    expect(log.byType("pilot.cancel_ifr.reported")).toHaveLength(0);

    // At due time
    world.simTimeMs = 30_000;
    queue.drain({ world, log });
    expect(queue.getCancellationCandidates()[0].state).toBe("TRANSMITTED");
    expect(log.byType("pilot.cancel_ifr.reported")).toHaveLength(1);
    expect(log.byType("pilot.cancel_ifr.reported")[0].callsign).toBe("N999IFR");
    expect(log.byType("pilot.cancel_ifr.reported")[0].text).toContain("canceling IFR");
  });

  it("at due time: withdraws with INSIDE_CLASS_B if inside Class B core", () => {
    const regional = createSyntheticRegional();
    const queue = createVfrRequestQueue({
      config: { ifrCancellationPercent: 100 },
      regional,
      seed: 1,
      cancellationDelayMs: 30_000,
    });
    const log = new SessionLog();
    const world = createWorld();
    world.regional = regional;

    // Inside KATL surface Class B core (x: 0, y: 0, alt: 3000)
    const ac = createSyntheticVfrAircraft({
      id: "ifr-2",
      callsign: "N888IFR",
      flightRules: "IFR",
      xNm: 0,
      yNm: 0,
      altitudeFt: 3000,
    });
    ac.activeClearance = dummyClearance;
    world.aircraft = [ac];

    queue.scheduleIfrCancellationCandidate(ac, 0, { log });
    world.simTimeMs = 30_000;
    queue.drain({ world, log });

    const cand = queue.getCancellationCandidates()[0];
    expect(cand.state).toBe("WITHDRAWN");
    expect(cand.withdrawnReason).toBe("INSIDE_CLASS_B");
    expect(log.byType("pilot.cancel_ifr.withdrawn")).toHaveLength(1);
    expect(log.byType("pilot.cancel_ifr.withdrawn")[0].reason).toBe("INSIDE_CLASS_B");
  });

  it("at due time: withdraws with ALREADY_VFR if aircraft is no longer IFR", () => {
    const queue = createVfrRequestQueue({
      config: { ifrCancellationPercent: 100 },
      seed: 1,
      cancellationDelayMs: 30_000,
    });
    const log = new SessionLog();
    const world = createWorld();

    const ac = createSyntheticVfrAircraft({
      id: "ifr-3",
      callsign: "N777IFR",
      flightRules: "VFR", // already reverted to VFR
    });
    world.aircraft = [ac];

    queue.scheduleIfrCancellationCandidate(ac, 0, { log });
    world.simTimeMs = 30_000;
    queue.drain({ world, log });

    const cand = queue.getCancellationCandidates()[0];
    expect(cand.state).toBe("WITHDRAWN");
    expect(cand.withdrawnReason).toBe("ALREADY_VFR");
    expect(log.byType("pilot.cancel_ifr.withdrawn")).toHaveLength(1);
  });
});

describe("VfrRequestQueue position report on callup", () => {
  it("formats distance/cardinal relative to the nearest airport", () => {
    const regional = createSyntheticRegional();
    // KPDK arp projects near the scenario origin; 15 NM due north.
    const kpdk = regional.getAirport("KPDK")!;
    expect(
      formatVfrPositionReport({ xNm: kpdk.arpNm.xNm, yNm: kpdk.arpNm.yNm + 15 }, regional),
    ).toBe("15 miles north of KPDK");
  });

  it("uses singular mile and 8-point cardinals", () => {
    const regional = createSyntheticRegional();
    const kpdk = regional.getAirport("KPDK")!;
    expect(
      formatVfrPositionReport({ xNm: kpdk.arpNm.xNm + 1, yNm: kpdk.arpNm.yNm }, regional),
    ).toBe("1 mile east of KPDK");
    expect(bearingToCardinalDirection(45)).toBe("northeast");
    expect(bearingToCardinalDirection(350)).toBe("north");
  });

  it("falls back to position-less call when no airport inventory exists", () => {
    expect(formatVfrPositionReport({ xNm: 0, yNm: 0 }, null)).toBeUndefined();
    expect(formatVfrPositionReport({ xNm: 0, yNm: 0 }, createEmptyRegional())).toBeUndefined();
  });

  it("initial flight-following call emits cold call and stores enriched details in world.radioRequests", () => {
    const regional = createSyntheticRegional();
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, requestCapPerHour: 10 },
      regional,
      seed: 1,
      initialSlotOffsetMs: 0,
    });
    const world = createWorld();
    world.regional = regional;
    const kpdk = regional.getAirport("KPDK")!;
    const ac = createSyntheticVfrAircraft({
      id: "ac-pos",
      callsign: "N123",
      xNm: kpdk.arpNm.xNm,
      yNm: kpdk.arpNm.yNm + 15,
    });
    world.aircraft = [ac];
    const log = new SessionLog();
    const heard: string[] = [];
    let statusText: string | undefined;
    queue.scheduleFromWorld(world, 0);
    queue.drain({
      world,
      log,
      setStatus: (text) => {
        statusText = text;
      },
      radio: { isBusy: () => false, play: (t) => void heard.push(t) },
    });
    expect(heard).toHaveLength(1);
    expect(heard[0]).toBe("Approach, N123");
    expect(statusText).toBe("Approach, N123");

    const req = queue.getRequests()[0]!;
    expect(req.destinationAirportId).toBeDefined();
    expect(req.requestedAltitudeFt).toBe(4500);

    expect(world.radioRequests).toHaveLength(1);
    const radioReq = world.radioRequests![0];
    expect(radioReq.status).toBe("PENDING");
    expect(radioReq.kind).toBe("FLIGHT_FOLLOWING");
    expect(radioReq.callsign).toBe("N123");
    expect(radioReq.details.aircraftType).toBe("C172");
    expect(radioReq.details.destinationAirportId).toBe(req.destinationAirportId);
    expect(radioReq.details.requestedAltitudeFt).toBe(4500);
    expect(radioReq.details.positionNm).toEqual({ xNm: ac.xNm, yNm: ac.yNm });
    expect(radioReq.details.altitudeFt).toBe(4500);
    expect(radioReq.details.headingDeg).toBe(90);
  });

  it("flight-following destination selection skips an ineligible nearest airport", () => {
    const regional = createSyntheticRegional();
    regional.airports[0]!.eligible = false;
    regional.airports[0]!.exclusionReason = "untowered";
    const nearest = regional.airports[0]!;
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, requestCapPerHour: 10 },
      regional,
      seed: 1,
      initialSlotOffsetMs: 0,
    });
    const world = createWorld();
    world.regional = regional;
    world.aircraft = [
      createSyntheticVfrAircraft({
        id: "ac-eligible-farther",
        xNm: nearest.arpNm.xNm,
        yNm: nearest.arpNm.yNm,
      }),
    ];

    queue.scheduleFromWorld(world, 0);

    expect(queue.getRequests()[0]!.destinationAirportId).toBe("KFTY");
  });

  it("flight-following keeps destination absent when no eligible airport exists", () => {
    const regional = createSyntheticRegional();
    for (const airport of regional.airports) {
      airport.eligible = false;
      airport.exclusionReason = "missing_catalog";
    }
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, requestCapPerHour: 10 },
      regional,
      seed: 1,
      initialSlotOffsetMs: 0,
    });
    const world = createWorld();
    world.regional = regional;
    world.aircraft = [createSyntheticVfrAircraft({ id: "ac-no-destination" })];

    queue.scheduleFromWorld(world, 0);

    expect(queue.getRequests()[0]!.destinationAirportId).toBeUndefined();
  });

  it("initial check-in emits facility prefix when facilityName is provided", () => {
    const regional = createSyntheticRegional();
    regional.facilityName = "Atlanta";
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, requestCapPerHour: 10 },
      regional,
      seed: 1,
      initialSlotOffsetMs: 0,
    });
    const world = createWorld();
    world.regional = regional;
    const ac = createSyntheticVfrAircraft({
      id: "ac-atl",
      callsign: "Skyhawk 172SP",
    });
    ac.callsign = "Skyhawk 172SP";
    world.aircraft = [ac];
    const log = new SessionLog();
    const heard: string[] = [];
    queue.scheduleFromWorld(world, 0);
    queue.drain({
      world,
      log,
      radio: { isBusy: () => false, play: (t) => void heard.push(t) },
    });
    expect(heard).toHaveLength(1);
    expect(heard[0]).toBe("Atlanta Approach, Skyhawk 172SP");
  });

  it("initial IFR pickup call emits cold call and stores enriched details with PENDING status", () => {
    const regional = createSyntheticRegional();
    regional.facilityName = "Atlanta";
    regional.airspaces.push({
      id: "KPDK-CLASS-D",
      name: "KPDK Class D",
      type: "CONTROLLED",
      class: "D",
      centerAirportId: "KPDK",
      lowerLimit: { reference: "MSL", unit: "MSL", altitudeFt: 0 },
      upperLimit: { reference: "MSL", unit: "MSL", altitudeFt: 3000 },
      lowerLimitFt: 0,
      upperLimitFt: 3000,
      segments: [],
    });
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 0, ifrPickupPercent: 100, requestCapPerHour: 10 },
      regional,
      seed: 1,
      initialSlotOffsetMs: 0,
    });
    const world = createWorld();
    world.regional = regional;
    const ac = createSyntheticVfrAircraft({
      id: "ac-ifr",
      callsign: "Cessna 210AB",
      aircraftType: "C210",
      altitudeFt: 5500,
      headingDeg: 180,
    });
    ac.callsign = "Cessna 210AB";
    world.aircraft = [ac];
    const log = new SessionLog();
    const heard: string[] = [];
    queue.scheduleFromWorld(world, 0);
    queue.drain({
      world,
      log,
      radio: { isBusy: () => false, play: (t) => void heard.push(t) },
    });
    expect(heard).toHaveLength(1);
    expect(heard[0]).toBe("Atlanta Approach, Cessna 210AB");

    expect(world.radioRequests).toHaveLength(1);
    const radioReq = world.radioRequests![0];
    expect(radioReq.status).toBe("PENDING");
    expect(radioReq.kind).toBe("IFR_PICKUP");
    expect(radioReq.callsign).toBe("Cessna 210AB");
    expect(radioReq.details.aircraftType).toBe("C210");
    expect(radioReq.details.destinationAirportId).toBeDefined();
    expect(radioReq.details.requestedAltitudeFt).toBeDefined();
    expect(radioReq.details.positionNm).toEqual({ xNm: ac.xNm, yNm: ac.yNm });
    expect(radioReq.details.altitudeFt).toBe(5500);
    expect(radioReq.details.headingDeg).toBe(180);
  });

  it("flight-following details repeat type, destination, and altitude", () => {
    const regional = createSyntheticRegional();
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, requestCapPerHour: 10 },
      regional,
      seed: 1,
      initialSlotOffsetMs: 0,
    });
    const world = createWorld();
    world.regional = regional;
    const kpdk = regional.getAirport("KPDK")!;
    const ac = createSyntheticVfrAircraft({
      id: "ac-detail",
      callsign: "N456",
      xNm: kpdk.arpNm.xNm,
      yNm: kpdk.arpNm.yNm + 15,
    });
    world.aircraft = [ac];
    const log = new SessionLog();
    queue.scheduleFromWorld(world, 0);
    queue.drain({ world, log });
    const radioReq = world.radioRequests?.[0];
    expect(radioReq).toBeDefined();
    radioReq!.status = "AWAITING_DETAILS";
    const details = queue.emitRequestDetails(world, ac.id, log);
    expect(details).toBeDefined();
    expect(details!).toContain("N456");
    expect(details!).toContain("C172");
    expect(details!).toContain("request flight following to");
    expect(details!).toContain(`to ${radioReq!.details.destinationAirportId}`);
    expect(details!).toContain(`at ${radioReq!.details.requestedAltitudeFt}`);
  });
});

describe("formatIfrPickupRequest (T04-84)", () => {
  it("formats complete fields per FAA AIM §5-1-14", () => {
    const str = formatIfrPickupRequest({
      callsign: "N123",
      positionPhrase: "15 miles NE of PDK",
      aircraftType: "C172",
      destinationAirportId: "KPDK",
      requestedAltitudeFt: 5000,
    });
    expect(str).toBe(
      "N123, 15 miles NE of PDK, C172, request IFR to KPDK, requested altitude 5000",
    );
  });

  it("omits missing optional segments cleanly without malformed or duplicate commas", () => {
    // Missing position and aircraftType
    expect(
      formatIfrPickupRequest({
        callsign: "N123",
        destinationAirportId: "KPDK",
        requestedAltitudeFt: 5000,
      }),
    ).toBe("N123, request IFR to KPDK, requested altitude 5000");

    // Missing altitude
    expect(
      formatIfrPickupRequest({
        callsign: "N123",
        positionPhrase: "15 miles NE of PDK",
        aircraftType: "C172",
        destinationAirportId: "KPDK",
      }),
    ).toBe("N123, 15 miles NE of PDK, C172, request IFR to KPDK");

    // Missing destination and altitude
    expect(
      formatIfrPickupRequest({
        callsign: "N123",
        aircraftType: "C172",
      }),
    ).toBe("N123, C172, request IFR");

    // Minimal callsign only
    expect(
      formatIfrPickupRequest({
        callsign: "Skyhawk 172SP",
      }),
    ).toBe("Skyhawk 172SP, request IFR");
  });

  it("preserves 500ms post-utterance quiet gap when radio.play is asynchronous", async () => {
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, requestCapPerHour: 3600 },
      seed: 1,
      initialSlotOffsetMs: 0,
    });
    const world = createWorld();
    world.simTimeMs = 1000;
    const ac1 = createSyntheticVfrAircraft({ id: "ac-1", callsign: "N111" });
    const ac2 = createSyntheticVfrAircraft({ id: "ac-2", callsign: "N222" });
    world.aircraft = [ac1, ac2];
    const log = new SessionLog();

    let resolvePlay: () => void = () => {};
    const playCalls: string[] = [];
    let busy = false;
    const radio = {
      isBusy: () => busy,
      play: (text: string) => {
        playCalls.push(text);
        busy = true;
        return new Promise<void>((resolve) => {
          resolvePlay = () => {
            busy = false;
            resolve();
          };
        });
      },
    };

    queue.scheduleFromWorld(world, 1000);
    queue.drain({ world, log, radio });
    expect(playCalls).toHaveLength(1);

    // Simulate playback completing at simTimeMs = 3000
    world.simTimeMs = 3000;
    resolvePlay();
    await Promise.resolve();

    // Within the 500ms quiet gap (e.g., simTimeMs = 3300)
    world.simTimeMs = 3300;
    queue.drain({ world, log, radio });
    expect(playCalls).toHaveLength(1);

    // After the 500ms quiet gap (e.g., simTimeMs = 3500)
    world.simTimeMs = 3500;
    queue.drain({ world, log, radio });
    expect(playCalls).toHaveLength(2);
  });
});
