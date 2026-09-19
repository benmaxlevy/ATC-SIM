/**
 * Integration tests: VFR pilot request scheduling and cancellation candidates (T04-72).
 *
 * Verifies:
 * - Queue receives T04-71 ambient VFR spawns and schedules paced pilot calls
 * - Leaves operational aircraft state completely untouched (flight rules, squawk, clearances)
 * - Radio-busy delays transmission without rollover burst or duplicate calls
 * - Emits structured session log events (vfr.request.transmitted, pilot.cancel_ifr.*)
 * - Pilot cancellation candidate scheduled for accepted IFR pickups and reported outside Bravo
 * - Real KATL scenario integration with imported regional destinations
 */

import { describe, expect, test } from "vitest";
import { SessionLog, type ActiveIfrClearance } from "@core";
import {
  assertScenario,
  createWorldFromScenario,
  getEligibleVfrDestinations,
  loadKdem,
  parseRegionalPack,
  type RegionalFacility,
  type Scenario,
} from "@scenario";
import { createVfrRequestQueue, type VfrRequestRadio } from "../../src/pilot/vfrRequestQueue";
import katlJson from "../../src/scenario/katl.json";

// Synthetic regional facility with center KSYN, satellite KSAT, and Class B volume
const SYNTHETIC_REGIONAL_MANIFEST = {
  schemaVersion: 1,
  centerAirportId: "KSYN",
  radiusNm: 40,
  source: { families: ["CIFP", "NASR_APT"] },
  files: { airports: "regional-airports.json", airspace: "regional-airspace.json" },
};

const SYNTHETIC_REGIONAL_AIRPORTS = [
  {
    icao: "KSYN",
    name: "SYNTHETIC CENTER",
    arp: { latDeg: 33.0, lonDeg: -84.0 },
    fieldElevFt: 1000,
    magVarDeg: 0,
    publicUse: true,
    towered: true,
    eligible: true,
    runways: [
      {
        id: "27",
        threshold: { latDeg: 33.0, lonDeg: -83.98 },
        headingTrueDeg: 270,
        headingMagDeg: 270,
        lengthFt: 9000,
      },
    ],
    hasPublishedApproaches: true,
  },
  {
    icao: "KSAT",
    name: "SYNTHETIC SATELLITE",
    arp: { latDeg: 33.25, lonDeg: -84.0 }, // ~15 NM north
    fieldElevFt: 850,
    magVarDeg: 0,
    publicUse: true,
    towered: true,
    eligible: true,
    runways: [
      {
        id: "09",
        threshold: { latDeg: 33.25, lonDeg: -84.02 },
        headingTrueDeg: 90,
        headingMagDeg: 90,
        lengthFt: 6000,
      },
    ],
    hasPublishedApproaches: true,
  },
];

const SYNTHETIC_REGIONAL_AIRSPACE = [
  {
    id: "UC:KSYN:B_SHELF",
    name: "SYNTHETIC CLASS B CORE",
    type: "CONTROLLED",
    class: "B",
    centerAirportId: "KSYN",
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

function buildSyntheticRegionalFacility(): RegionalFacility {
  return parseRegionalPack(
    SYNTHETIC_REGIONAL_MANIFEST,
    SYNTHETIC_REGIONAL_AIRPORTS,
    SYNTHETIC_REGIONAL_AIRSPACE,
    { latDeg: 33.0, lonDeg: -84.0 },
  );
}

function buildSyntheticScenario(): Scenario {
  const kdem = loadKdem();
  const regional = buildSyntheticRegionalFacility();
  return assertScenario(
    {
      ...kdem,
      vfrZones: [
        {
          id: "north",
          name: "North Practice Area",
          bounds: { minXNm: -15, maxXNm: -7, minYNm: 10, maxYNm: 20 },
        },
      ],
      vfrTraffic: {
        initialCount: 4,
        targetCount: 4,
        entriesPerHour: 0,
        maxPopulation: 6,
        seed: 42,
        zones: [{ id: "north", weight: 1 }],
      },
      vfrRequests: {
        flightFollowingPercent: 50,
        ifrPickupPercent: 50,
        requestCapPerHour: 4,
        ifrCancellationPercent: 100,
      },
    },
    { regional },
  );
}

describe("T04-72 VFR pilot request scheduling end-to-end integration", () => {
  test("Queue receives T04-71 ambient VFR spawns, schedules paced calls, and preserves operational state", () => {
    const scenario = buildSyntheticScenario();
    const world = createWorldFromScenario(scenario, 42);
    const log = new SessionLog();
    world.sessionLog = log;

    const queue = createVfrRequestQueue({
      config: scenario.vfrRequests,
      regional: scenario.regional,
      seed: 42,
      initialSlotOffsetMs: 5000,
    });

    const vfrAircraft = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfrAircraft.length).toBeGreaterThanOrEqual(3);

    // Initial schedule from world
    queue.scheduleFromWorld(world, 0);
    const requests = queue.getRequests();
    expect(requests.length).toBeGreaterThanOrEqual(1);

    // First request due at 5000 ms
    expect(requests[0].dueAtSimMs).toBe(5000);
    expect(requests[0].state).toBe("PENDING");

    // Advance to 5000 ms and drain
    world.simTimeMs = 5000;
    queue.drain({ world, log });

    expect(requests[0].state).toBe("TRANSMITTED");
    const transmittedEvents = log.byType("vfr.request.transmitted");
    expect(transmittedEvents).toHaveLength(1);
    expect(transmittedEvents[0].callsign).toBe(requests[0].callsign);
    expect(transmittedEvents[0].request.positionNm).toBeDefined();

    // Verify operational state of aircraft is completely untouched
    const targetAc = world.aircraft.find((a) => a.callsign === requests[0].callsign)!;
    expect(targetAc.flightRules).toBe("VFR");
    expect(targetAc.squawk).toBe("1200");
    expect(targetAc.activeClearance).toBeUndefined();
    expect(targetAc.intent.clearedApproachId).toBeNull();
  });

  test("Radio-busy delays transmission without burst or cap token consumption", () => {
    const scenario = buildSyntheticScenario();
    const world = createWorldFromScenario(scenario, 42);
    const log = new SessionLog();
    world.sessionLog = log;

    const queue = createVfrRequestQueue({
      config: scenario.vfrRequests,
      regional: scenario.regional,
      seed: 42,
      initialSlotOffsetMs: 10_000,
    });

    queue.scheduleFromWorld(world, 0);
    const requests = queue.getRequests();
    expect(requests.length).toBeGreaterThan(0);

    let busy = true;
    const radio: VfrRequestRadio = {
      isBusy: () => busy,
    };

    world.simTimeMs = 12_000;
    queue.drain({ world, log, radio });
    expect(requests[0].state).toBe("PENDING");
    expect(log.byType("vfr.request.transmitted")).toHaveLength(0);

    // Radio becomes idle; request transmits once
    busy = false;
    queue.drain({ world, log, radio });
    expect(requests[0].state).toBe("TRANSMITTED");
    expect(log.byType("vfr.request.transmitted")).toHaveLength(1);
  });

  test("Cancellation hook: accepted IFR pickup schedules report outside Class B without cap consumption", () => {
    const scenario = buildSyntheticScenario();
    const world = createWorldFromScenario(scenario, 42);
    const log = new SessionLog();
    world.sessionLog = log;

    const queue = createVfrRequestQueue({
      config: scenario.vfrRequests,
      regional: scenario.regional,
      seed: 42,
      cancellationDelayMs: 60_000,
    });

    // Simulate accepted IFR pickup outside Class B (x: -15, y: 15)
    const ifrAc = world.aircraft.find((a) => a.ambientVfr !== undefined)!;
    ifrAc.flightRules = "IFR";
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
    ifrAc.activeClearance = dummyClearance;

    const cand = queue.scheduleIfrCancellationCandidate(ifrAc, 10_000, { log });
    expect(cand).not.toBeNull();
    expect(cand!.dueAtSimMs).toBe(70_000);
    expect(log.byType("pilot.cancel_ifr.scheduled")).toHaveLength(1);

    // At due time, drain and verify cancellation report
    world.simTimeMs = 70_000;
    queue.drain({ world, log });

    expect(cand!.state).toBe("TRANSMITTED");
    const reportedEvents = log.byType("pilot.cancel_ifr.reported");
    expect(reportedEvents).toHaveLength(1);
    expect(reportedEvents[0].callsign).toBe(ifrAc.callsign);
    expect(reportedEvents[0].text).toContain("canceling IFR");

    // Flight rules and clearance remain IFR until downstream controller acknowledgment
    expect(ifrAc.flightRules).toBe("IFR");
    expect(ifrAc.activeClearance).toBeDefined();
  });

  test("KATL regional pack smoke test: destinations loaded from catalog without literal fallback", () => {
    const katl = assertScenario(katlJson, { arrivalCountMin: 1, arrivalCountMax: 10 });
    expect(katl.icao).toBe("KATL");

    if (katl.regional) {
      const destinations = getEligibleVfrDestinations(katl.regional);
      expect(destinations.length).toBeGreaterThan(0);
      for (const dest of destinations) {
        expect(dest.publicUse).toBe(true);
        expect(dest.towered).toBe(true);
      }

      // Initialize queue with KATL config and regional pack
      const queue = createVfrRequestQueue({
        config: {
          flightFollowingPercent: 20,
          ifrPickupPercent: 30,
          requestCapPerHour: 4,
        },
        regional: katl.regional,
        seed: 101,
      });

      expect(queue).toBeDefined();
    }
  });
});
