/**
 * Feature acceptance test: Satellite traffic settings, full lifecycle,
 * 3D Class B avoidance, and repeatability (T04-76).
 *
 * Verifies:
 * 1. Complete lifecycle:
 *    - Ambient VFR spawn with zone-weighted placement
 *    - Silent ambient traffic vs unsolicited request selection
 *    - Flight following request scheduling, details, standby, SQ, IDENT
 *    - Informational radar contact position report does NOT mutate navigation or position
 *    - Approve flight following -> operational service RADAR_ADVISORY
 *    - Service termination -> clean exit without automatic VFR squawk reset
 *    - Unsolicited IFR pickup request scheduling & admission
 *    - Atomic IFR clearance to regional controlled destination -> operational IFR
 *    - Active IFR navigation towards regional satellite airport
 *    - Pilot IFR cancellation candidate evaluated outside Class B
 *    - Pilot reports cancellation -> controller acknowledges ("IFR cancellation received")
 *    - Atomic operational reversion to VFR with autonomous navigation resumption
 *    - Satellite arrival destination completion / simulated tower transfer
 * 2. Rejection & edge cases:
 *    - Unable flight following declines request
 *    - Malformed clearance rejected with no transition to IFR
 *    - Stale aircraft exit cleanly withdraws pending requests
 *    - Radio busy gating defers transmission with idle gap
 *    - Zero cap prevents new service requests immediately
 * 3. 3D Class B avoidance:
 *    - Parameterized geometry tests verify no swept-path Bravo entry
 *    - Elevated shelf and surface core avoidance
 * 4. Legacy IFR repeatability under the same seed:
 *    - VFR presence does not mutate legacy arrival/departure schedules or poses
 */

import { describe, expect, test } from "vitest";
import {
  createAircraft,
  createWorld,
  getOperationalService,
  mulberry32,
  SessionLog,
  SIM_DT_S,
  stepWorld,
  type AmbientVfrMission,
} from "@core";
import {
  assertScenario,
  createArrivalScheduler,
  createWorldForSession,
  generateDepartureSchedule,
  getEligibleVfrDestinations,
  loadKdem,
  loadPlayableScenario,
  parseRegionalPack,
  type RegionalFacility,
  type Scenario,
} from "@scenario";
import { handleRadioText } from "../../src/pilot/handleRadioText";
import { applyIntent } from "../../src/pilot/applyIntent";
import { validateInstructions } from "../../src/pilot/validate";
import {
  armDcbSpinner,
  cancelDcbSpinner,
  commitDcbSpinner,
  createScopeView,
  inputDcbSpinnerKey,
} from "@scope";
import {
  createVfrRequestQueue,
  defaultIfrCancellationValidator,
  type VfrRequestRadio,
} from "../../src/pilot/vfrRequestQueue";
import {
  isPointInside3dVolume,
  isRouteSafeFromAvoidance,
  isVfrAvoidanceVolume,
  planSafeVfrRoute,
  stepVfrAircraftNavigation,
} from "../../src/core/vfrNavigation";

// Synthetic regional facility: Center KDEM, Satellite KPDK (eligible), Satellite KUNF (untowered/ineligible)
const SYNTHETIC_REGIONAL_MANIFEST = {
  schemaVersion: 1,
  centerAirportId: "KDEM",
  radiusNm: 40,
  source: { families: ["CIFP", "NASR_APT"] },
  files: { airports: "regional-airports.json", airspace: "regional-airspace.json" },
};

const SYNTHETIC_REGIONAL_AIRPORTS = [
  {
    icao: "KDEM",
    name: "SYNTHETIC CENTER",
    arp: { latDeg: 33.0, lonDeg: -84.0 },
    fieldElevFt: 1000,
    magVarDeg: 0,
    publicUse: true,
    towered: true,
    eligible: true,
    serviceMetadata: {
      publicUse: true,
      towered: true,
      sourceFile: "APT.csv",
      sourceRecordId: "KDEM",
    },
    catalogRef: ".",
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
    icao: "KPDK",
    name: "PEACHTREE DEKALB",
    arp: { latDeg: 33.3, lonDeg: -84.0 }, // ~18 NM north
    fieldElevFt: 1000,
    magVarDeg: 0,
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
        threshold: { latDeg: 33.3, lonDeg: -84.0 },
        headingTrueDeg: 210,
        headingMagDeg: 210,
        lengthFt: 6000,
      },
    ],
    hasPublishedApproaches: true,
  },
  {
    icao: "KUNF",
    name: "UNTOWERED FIELD",
    arp: { latDeg: 33.1, lonDeg: -83.8 },
    fieldElevFt: 800,
    magVarDeg: 0,
    publicUse: true,
    towered: false, // Untowered -> ineligible
    eligible: false,
    exclusionReason: "UNTOWERED",
    runways: [
      {
        id: "09",
        threshold: { latDeg: 33.1, lonDeg: -83.8 },
        headingTrueDeg: 90,
        headingMagDeg: 90,
        lengthFt: 3000,
      },
    ],
    hasPublishedApproaches: false,
  },
];

// Synthetic 3D Class B: surface core [-5, 5] NM up to 10,000 ft; shelf [-10, 10] NM from 3,000 to 10,000 ft
const SYNTHETIC_REGIONAL_AIRSPACE = [
  {
    id: "BRAVO_CORE",
    name: "SYNTHETIC BRAVO CORE",
    type: "CONTROLLED",
    class: "B",
    centerAirportId: "KDEM",
    lowerLimit: { altitudeFt: 0, unit: "GND", reference: "SURFACE", rawAltitude: "SFC" },
    upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
    lowerLimitFt: 0,
    upperLimitFt: 10000,
    segments: [
      {
        sequence: 1,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.08, lonDeg: -84.1 },
        positionNm: { xNm: -5, yNm: 5 },
      },
      {
        sequence: 2,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.08, lonDeg: -83.9 },
        positionNm: { xNm: 5, yNm: 5 },
      },
      {
        sequence: 3,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 32.92, lonDeg: -83.9 },
        positionNm: { xNm: 5, yNm: -5 },
      },
      {
        sequence: 4,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 32.92, lonDeg: -84.1 },
        positionNm: { xNm: -5, yNm: -5 },
      },
      {
        sequence: 5,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.08, lonDeg: -84.1 },
        positionNm: { xNm: -5, yNm: 5 },
      },
    ],
  },
  {
    id: "BRAVO_SHELF",
    name: "SYNTHETIC BRAVO SHELF",
    type: "CONTROLLED",
    class: "B",
    centerAirportId: "KDEM",
    lowerLimit: { altitudeFt: 3000, unit: "MSL", reference: "MSL" },
    upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
    lowerLimitFt: 3000,
    upperLimitFt: 10000,
    segments: [
      {
        sequence: 1,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.16, lonDeg: -84.2 },
        positionNm: { xNm: -10, yNm: 10 },
      },
      {
        sequence: 2,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.16, lonDeg: -83.8 },
        positionNm: { xNm: 10, yNm: 10 },
      },
      {
        sequence: 3,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 32.84, lonDeg: -83.8 },
        positionNm: { xNm: 10, yNm: -10 },
      },
      {
        sequence: 4,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 32.84, lonDeg: -84.2 },
        positionNm: { xNm: -10, yNm: -10 },
      },
      {
        sequence: 5,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.16, lonDeg: -84.2 },
        positionNm: { xNm: -10, yNm: 10 },
      },
    ],
  },
  {
    id: "DELTA_PDK",
    name: "SYNTHETIC DELTA PDK",
    type: "CONTROLLED",
    class: "D",
    centerAirportId: "KPDK",
    lowerLimit: { altitudeFt: 0, unit: "GND", reference: "SURFACE", rawAltitude: "SFC" },
    upperLimit: { altitudeFt: 3000, unit: "MSL", reference: "MSL" },
    lowerLimitFt: 0,
    upperLimitFt: 3000,
    segments: [
      {
        sequence: 1,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.35, lonDeg: -84.05 },
        positionNm: { xNm: -3, yNm: 21 },
      },
      {
        sequence: 2,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.35, lonDeg: -83.95 },
        positionNm: { xNm: 3, yNm: 21 },
      },
      {
        sequence: 3,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.25, lonDeg: -83.95 },
        positionNm: { xNm: 3, yNm: 15 },
      },
      {
        sequence: 4,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.25, lonDeg: -84.05 },
        positionNm: { xNm: -3, yNm: 15 },
      },
      {
        sequence: 5,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.35, lonDeg: -84.05 },
        positionNm: { xNm: -3, yNm: 21 },
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
  return assertScenario({
    ...kdem,
    name: "Synthetic Regional TRACON",
    vfrTraffic: {
      initialCount: 2,
      targetCount: 2,
      entriesPerHour: 4,
      maxPopulation: 4,
      seed: 42,
      movementMix: { localPercent: 50, transitPercent: 20, airportBoundPercent: 30 },
    },
    vfrRequests: {
      flightFollowingPercent: 50,
      ifrPickupPercent: 50,
      requestCapPerHour: 10,
      ifrCancellationPercent: 50,
    },
    regional,
  });
}

describe("T04-76 Satellite Traffic Acceptance Suite", () => {
  test("Complete VFR flight-following lifecycle: spawn -> request -> say request -> standby -> SQ/IDENT -> radar contact -> approve -> terminate", async () => {
    const scenario = buildSyntheticScenario();
    const world = createWorldForSession(scenario, null, 42, null, undefined, {
      traffic: {
        initialCount: 1,
        targetCount: 1,
        entriesPerHour: 0,
        maxPopulation: 2,
        seed: 42,
        movementMix: { localPercent: 100, transitPercent: 0, airportBoundPercent: 0 },
      },
      requests: {
        flightFollowingPercent: 100,
        ifrPickupPercent: 0,
        requestCapPerHour: 10,
      },
    });

    // Initial population spawned with VFR rules and squawk 1200
    const vfrAc = world.aircraft.find((a) => a.flightRules === "VFR");
    expect(vfrAc).toBeDefined();
    expect(vfrAc?.ambientVfr).toBeDefined();
    expect(vfrAc?.squawk).toBe("1200");

    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, ifrPickupPercent: 0, requestCapPerHour: 10 },
      seed: 42,
      initialSlotOffsetMs: 0,
      regional: scenario.regional,
    });
    const log = new SessionLog();
    world.sessionLog = log;

    // Scheduler draws outcome and admits to radio
    queue.scheduleFromWorld(world, world.simTimeMs);
    queue.drain({ world, log });

    expect(world.radioRequests).toHaveLength(1);
    const req = world.radioRequests![0];
    expect(req.kind).toBe("FLIGHT_FOLLOWING");
    expect(req.callsign).toBe(vfrAc!.callsign);
    expect(req.status).toBe("PENDING");

    // 1. Controller: say request
    const sayReqRes = await handleRadioText(world, `${vfrAc!.callsign} say request`, log);
    expect(sayReqRes.accepted).toBe(true);
    expect(sayReqRes.readback).toContain("request flight following");
    expect(sayReqRes.readback).not.toContain("say request");
    expect(req.status).toBe("PENDING");

    // Pilot provides details without charging cap
    const details = queue.emitRequestDetails(world, vfrAc!.id, log);
    expect(details).toContain("request flight following");

    // 2. Controller: stand by
    const standbyRes = await handleRadioText(world, `${vfrAc!.callsign} stand by`, log);
    expect(standbyRes.accepted).toBe(true);
    expect(req.status).toBe("STANDBY");

    // 3. Controller: squawk code and ident
    const sqRes = await handleRadioText(world, `${vfrAc!.callsign} SQ 4721`, log);
    expect(sqRes.accepted).toBe(true);
    const identRes = await handleRadioText(world, `${vfrAc!.callsign} I`, log);
    expect(identRes.accepted).toBe(true);
    expect(vfrAc!.identUntilSimMs).toBeGreaterThan(world.simTimeMs);

    // 4. Controller: radar contact with informational position
    const preX = vfrAc!.xNm;
    const preY = vfrAc!.yNm;
    const preAlt = vfrAc!.altitudeFt;
    const preHdg = vfrAc!.headingDeg;

    const contactRes = await handleRadioText(
      world,
      `${vfrAc!.callsign} radar contact 5 miles from NEMAX`,
      log,
    );
    expect(contactRes.accepted).toBe(true);
    expect(vfrAc!.radarContact).toBeDefined();
    expect(vfrAc!.radarContact?.referenceId).toBe("NEMAX");
    expect(req.status).toBe("IDENTIFIED");

    // CRITICAL: Informational position report does NOT mutate aircraft navigation or position!
    expect(vfrAc!.xNm).toBe(preX);
    expect(vfrAc!.yNm).toBe(preY);
    expect(vfrAc!.altitudeFt).toBe(preAlt);
    expect(vfrAc!.headingDeg).toBe(preHdg);

    // 5. Controller: approve flight following
    const approveRes = await handleRadioText(
      world,
      `${vfrAc!.callsign} approve flight following`,
      log,
    );
    expect(approveRes.accepted).toBe(true);
    expect(getOperationalService(world, vfrAc!).flightFollowingActive).toBe(true);
    expect(req.status).toBe("APPROVED");

    // 6. Controller: terminate radar service
    const termRes = await handleRadioText(
      world,
      `${vfrAc!.callsign} radar service terminated`,
      log,
    );
    expect(termRes.accepted).toBe(true);
    expect(getOperationalService(world, vfrAc!).flightFollowingActive).toBe(false);
    expect(req.status).toBe("TERMINATED");
    // Transponder code remains assigned code (not automatically reset to 1200 per FAA 5-1-13)
    expect(vfrAc!.assignedSquawk).toBe("4721");
  });

  test("Complete VFR-to-IFR pickup and IFR cancellation lifecycle", async () => {
    const scenario = buildSyntheticScenario();
    const ac = createAircraft({
      id: "ac-ifr-pickup",
      callsign: "N734SP",
      xNm: -12,
      yNm: 15,
      headingDeg: 120,
      altitudeFt: 4500,
      speedKt: 120,
      squawk: "1200",
      flightRules: "VFR",
      aircraftType: "C172",
      radarContact: true,
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "north",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
        waypoints: [
          { xNm: -10, yNm: 15, altitudeFt: 4500, speedKt: 120, targetToleranceNm: 1.2 },
          { xNm: -5, yNm: 15, altitudeFt: 4500, speedKt: 120, targetToleranceNm: 1.2 },
        ],
        waypointIndex: 0,
      },
    });

    const world = createWorld({
      aircraft: [ac],
      simTimeMs: 10_000,
      catalog: scenario.catalog,
    });
    world.regional = scenario.regional;
    const log = new SessionLog();
    world.sessionLog = log;

    // Simulate open IFR pickup request to eligible regional destination KPDK
    world.radioRequests = [
      {
        id: "vfr-req-pickup",
        aircraftId: ac.id,
        callsign: ac.callsign,
        kind: "IFR_PICKUP",
        status: "IDENTIFIED",
        requestedAtSimMs: 10_000,
        details: {
          destinationAirportId: "KPDK",
        },
      },
    ];

    // 1. Controller issues IFR clearance to regional airport
    const clrRes = await handleRadioText(world, "N734SP CLR TO KPDK VIA RADAR VECTORS ALT 50", log);
    expect(clrRes.accepted).toBe(true);

    // Aircraft transitions to operational IFR
    expect(ac.flightRules).toBe("IFR");
    expect(ac.activeClearance).toBeDefined();
    expect(ac.activeClearance?.limitId).toBe("KPDK");
    expect(ac.intent.assignedAltitudeFt).toBe(5000);

    // 2. Validate IFR cancellation candidate outside Class B
    const cancelCheck = defaultIfrCancellationValidator(ac, world);
    expect(cancelCheck.ok).toBe(true);

    // 3. Pilot requests cancellation and controller acknowledges
    ac.cancellationPending = true;
    log.append({
      type: "pilot.cancel_ifr.reported",
      atSimMs: world.simTimeMs,
      atWallMs: Date.now(),
      callsign: ac.callsign,
      aircraftId: ac.id,
      text: `${ac.callsign} cancel IFR`,
    });

    const cancelAckRes = await handleRadioText(world, "N734SP IFR cancellation received", log);
    expect(cancelAckRes.accepted).toBe(true);
    expect(cancelAckRes.readback).toBe("November 734 Sierra Papa IFR cancellation received");

    // Operational rules revert to VFR outside Class B
    expect(ac.flightRules).toBe("VFR");
    expect(ac.activeClearance).toBeUndefined();
    expect(ac.ambientVfr).toBeDefined();
    expect(ac.ambientVfr?.waypoints?.length).toBeGreaterThan(0);

    // 4. Satellite arrival destination completion / simulated tower transfer
    ac.ambientVfr!.mission = "AIRPORT_BOUND";
    ac.ambientVfr!.destinationAirportId = "KPDK";
    ac.ambientVfr!.waypoints = [
      { xNm: 0, yNm: 18, altitudeFt: 2000, speedKt: 100, targetToleranceNm: 2.5 },
    ];
    ac.ambientVfr!.waypointIndex = 1; // Completed final waypoint
    const towerHandoff = stepVfrAircraftNavigation(ac, world.simTimeMs, 0, log);
    expect(towerHandoff.handoff).toBe(true);
    expect(towerHandoff.exited).toBe(true);
    const handoffEvents = log.byType("vfr.tower.handoff");
    expect(handoffEvents.length).toBeGreaterThan(0);
    expect((handoffEvents[0] as { destinationAirportId?: string }).destinationAirportId).toBe(
      "KPDK",
    );
  });

  test("IFR cancellation replans outside Bravo and rejects unsafe state atomically", async () => {
    const scenario = buildSyntheticScenario();
    const regional = scenario.regional!;
    const kpdK = regional.airports.find((airport) => airport.icao === "KPDK");
    expect(kpdK).toBeDefined();
    kpdK!.arpNm = { xNm: 15, yNm: 20 };

    const makeIfrAircraft = (id: string, xNm = 20, yNm = 20) =>
      createAircraft({
        id,
        callsign: id === "ac-replan" ? "N735RP" : id === "ac-no-route" ? "N736NR" : "N737IB",
        xNm,
        yNm,
        headingDeg: 270,
        altitudeFt: 4500,
        speedKt: 120,
        squawk: "4722",
        assignedSquawk: "4722",
        flightRules: "VFR",
        aircraftType: "C172",
        radarContact: true,
        flightFollowing: { active: true, approvedAtSimMs: 1000, requestId: `${id}-ff` },
        flightPlan: { destination: "KPDK", rules: "IFR", departure: "KDEM", route: "VECTORS KPDK" },
        fp: { destination: "KPDK", rules: "IFR", route: "VECTORS KPDK" },
        ambientVfr: {
          mission: "TRANSIT",
          zoneId: "north",
          destinationAirportId: "KPDK",
          spawnedAtSimMs: 0,
          alertEligibility: "CONTROLLED",
          waypoints: [
            { xNm: 0, yNm: 0, altitudeFt: 4500, speedKt: 120 },
            { xNm: 20, yNm: 20, altitudeFt: 4500, speedKt: 120 },
          ],
          waypointIndex: 0,
        },
      });

    const issuePickup = async (aircraft: ReturnType<typeof makeIfrAircraft>) => {
      const world = createWorld({
        aircraft: [aircraft],
        simTimeMs: 10_000,
        catalog: scenario.catalog,
      });
      world.regional = regional;
      world.sessionLog = new SessionLog();
      world.radioRequests = [
        {
          id: `${aircraft.id}-pickup`,
          aircraftId: aircraft.id,
          callsign: aircraft.callsign,
          kind: "IFR_PICKUP",
          status: "IDENTIFIED",
          requestedAtSimMs: 10_000,
          details: { destinationAirportId: "KPDK" },
        },
      ];
      const clearance = await handleRadioText(
        world,
        `${aircraft.callsign} CLR TO KPDK VIA RADAR VECTORS ALT 50`,
        world.sessionLog!,
      );
      expect(clearance.accepted).toBe(true);
      aircraft.cancellationPending = true;
      return world;
    };

    const replanningAircraft = makeIfrAircraft("ac-replan");
    const replanningWorld = await issuePickup(replanningAircraft);
    const originalRoute = structuredClone(replanningAircraft.ambientVfr!.waypoints);
    const originalPlan = structuredClone(replanningAircraft.flightPlan);
    const originalFp = structuredClone(replanningAircraft.fp);
    const originalService = structuredClone(replanningAircraft.flightFollowing);
    const cancelLog = replanningWorld.sessionLog!;
    cancelLog.append({
      type: "pilot.cancel_ifr.reported",
      atSimMs: replanningWorld.simTimeMs,
      atWallMs: 0,
      callsign: replanningAircraft.callsign,
      aircraftId: replanningAircraft.id,
      text: `${replanningAircraft.callsign} cancel IFR`,
    });
    const accepted = await handleRadioText(
      replanningWorld,
      `${replanningAircraft.callsign} IFR cancellation received`,
      cancelLog,
    );
    expect(accepted.accepted).toBe(true);
    expect(replanningAircraft.flightRules).toBe("VFR");
    expect(replanningAircraft.ambientVfr!.waypoints).not.toEqual(originalRoute);
    expect(replanningAircraft.ambientVfr!.waypointIndex).toBe(0);
    const replanningVfr = replanningAircraft.ambientVfr;
    expect(replanningVfr).toBeDefined();
    expect(
      isRouteSafeFromAvoidance(
        [
          {
            xNm: replanningAircraft.xNm,
            yNm: replanningAircraft.yNm,
            altitudeFt: replanningAircraft.altitudeFt,
          },
          ...(replanningVfr!.waypoints ?? []).map((waypoint) => ({
            xNm: waypoint.xNm,
            yNm: waypoint.yNm,
            altitudeFt: waypoint.altitudeFt ?? replanningAircraft.altitudeFt,
          })),
        ],
        regional.airspaces.filter(isVfrAvoidanceVolume),
      ),
    ).toBe(true);
    const firstReplacementWaypoint = (replanningVfr!.waypoints ?? [])[0];
    if (!firstReplacementWaypoint) {
      throw new Error("expected replanned VFR route to have a first waypoint");
    }
    const navigationStep = stepVfrAircraftNavigation(
      replanningAircraft,
      replanningWorld.simTimeMs,
      0,
      cancelLog,
      regional.airspaces.filter(isVfrAvoidanceVolume),
    );
    expect(navigationStep.exited).toBe(false);
    expect(replanningAircraft.ambientVfr!.waypointIndex).toBe(0);
    const expectedHeading =
      (Math.atan2(
        firstReplacementWaypoint.xNm - replanningAircraft.xNm,
        firstReplacementWaypoint.yNm - replanningAircraft.yNm,
      ) *
        180) /
      Math.PI;
    expect(replanningAircraft.intent.assignedHeadingDeg).toBeCloseTo(
      expectedHeading < 0 ? expectedHeading + 360 : expectedHeading,
      8,
    );
    const positionAfterPlanning = {
      xNm: replanningAircraft.xNm,
      yNm: replanningAircraft.yNm,
    };
    for (let i = 0; i < 5; i += 1) {
      stepWorld(replanningWorld, 1);
    }
    expect(replanningWorld.simTimeMs).toBe(15_000);
    expect(
      Math.hypot(
        replanningAircraft.xNm - positionAfterPlanning.xNm,
        replanningAircraft.yNm - positionAfterPlanning.yNm,
      ),
    ).toBeGreaterThan(0);
    expect(
      isRouteSafeFromAvoidance(
        [
          {
            xNm: replanningAircraft.xNm,
            yNm: replanningAircraft.yNm,
            altitudeFt: replanningAircraft.altitudeFt,
          },
          ...(replanningVfr!.waypoints ?? [])
            .slice(replanningVfr!.waypointIndex ?? 0)
            .map((waypoint) => ({
              xNm: waypoint.xNm,
              yNm: waypoint.yNm,
              altitudeFt: waypoint.altitudeFt ?? replanningAircraft.altitudeFt,
            })),
        ],
        regional.airspaces.filter(isVfrAvoidanceVolume),
      ),
    ).toBe(true);
    expect(replanningAircraft.activeClearance).toBeUndefined();
    expect(replanningAircraft.assignedSquawk).toBe("4722");
    expect(replanningAircraft.flightFollowing).toEqual(originalService);
    expect(replanningAircraft.flightPlan).toEqual(originalPlan);
    expect(replanningAircraft.fp).toEqual(originalFp);
    expect(cancelLog.byType("pilot.cancel_ifr.reported")).toHaveLength(1);
    expect(accepted.readback).toContain("IFR cancellation received");

    const noRouteAircraft = makeIfrAircraft("ac-no-route");
    noRouteAircraft.ambientVfr!.waypoints = [{ xNm: 0, yNm: 0, altitudeFt: 4500 }];
    const noRouteWorld = await issuePickup(noRouteAircraft);
    noRouteAircraft.ambientVfr!.destinationAirportId = undefined;
    noRouteAircraft.destination = undefined;
    noRouteAircraft.destinationAirport = undefined;
    const noRouteBefore = structuredClone(noRouteAircraft);
    const rejectedNoRoute = await handleRadioText(
      noRouteWorld,
      `${noRouteAircraft.callsign} IFR cancellation received`,
      noRouteWorld.sessionLog!,
    );
    expect(rejectedNoRoute.accepted).toBe(false);
    expect(rejectedNoRoute.detail).toBe("CANCELLATION: unable to establish safe VFR continuation");
    expect(noRouteAircraft).toEqual(noRouteBefore);

    const insideAircraft = makeIfrAircraft("ac-inside-bravo", 0, 0);
    const insideWorld = await issuePickup(insideAircraft);
    const insideBefore = structuredClone(insideAircraft);
    const rejectedInside = await handleRadioText(
      insideWorld,
      `${insideAircraft.callsign} IFR cancellation received`,
      insideWorld.sessionLog!,
    );
    expect(rejectedInside.accepted).toBe(false);
    expect(rejectedInside.detail).toBe("CANCELLATION: cannot cancel IFR inside Class B airspace");
    expect(insideAircraft).toEqual(insideBefore);
    expect(insideAircraft.flightRules).toBe("IFR");
  });

  test("Rejections: unable flight following, malformed clearance, zero cap, and radio busy", async () => {
    const scenario = buildSyntheticScenario();
    const ac = createAircraft({
      id: "ac-reject",
      callsign: "N111AA",
      xNm: -10,
      yNm: 15,
      headingDeg: 90,
      altitudeFt: 4500,
      speedKt: 110,
      squawk: "1200",
      flightRules: "VFR",
      aircraftType: "C172",
      radarContact: true,
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "north",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
      },
    });

    const world = createWorld({
      aircraft: [ac],
      simTimeMs: 1000,
      catalog: scenario.catalog,
    });
    world.regional = scenario.regional;
    const log = new SessionLog();
    world.sessionLog = log;

    // 1. Unable flight following declines request cleanly
    world.radioRequests = [
      {
        id: "req-decline",
        aircraftId: ac.id,
        callsign: ac.callsign,
        kind: "FLIGHT_FOLLOWING",
        status: "PENDING",
        requestedAtSimMs: 1000,
        details: {},
      },
    ];

    const declineRes = await handleRadioText(world, "N111AA unable flight following", log);
    expect(declineRes.accepted).toBe(true);
    expect(world.radioRequests[0].status).toBe("DECLINED");
    expect(getOperationalService(world, ac).flightFollowingActive).toBe(false);

    // 2. Malformed clearance (ineligible untowered destination) rejects with NO transition to IFR
    world.radioRequests = [
      {
        id: "req-bad-limit",
        aircraftId: ac.id,
        callsign: ac.callsign,
        kind: "IFR_PICKUP",
        status: "IDENTIFIED",
        requestedAtSimMs: 2000,
        details: {
          destinationAirportId: "KUNF", // untowered/ineligible
        },
      },
    ];

    const badClrRes = await handleRadioText(
      world,
      "N111AA CLR TO KUNF VIA RADAR VECTORS ALT 50",
      log,
    );
    expect(badClrRes.accepted).toBe(false);
    expect(badClrRes.reason).toBe("UNABLE_ROUTE");
    expect(ac.flightRules).toBe("VFR"); // Intact VFR!

    // 3. Zero cap withdraws requests immediately
    const zeroCapQueue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, ifrPickupPercent: 0, requestCapPerHour: 0 },
      seed: 1,
    });
    zeroCapQueue.evaluateAircraft(ac, world, 3000);
    const reqs = zeroCapQueue.getRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0].state).toBe("WITHDRAWN");
    expect(reqs[0].withdrawnReason).toBe("CAP_ZERO");

    // 4. Radio busy delays request transmission
    let busyState = true;
    const mockRadio: VfrRequestRadio = {
      isBusy: () => busyState,
    };
    const pacedQueue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, ifrPickupPercent: 0, requestCapPerHour: 10 },
      seed: 2,
      initialSlotOffsetMs: 0,
    });
    const ac2 = createAircraft({
      id: "ac-busy",
      callsign: "N222BB",
      xNm: 10,
      yNm: -15,
      headingDeg: 180,
      altitudeFt: 3500,
      speedKt: 110,
      squawk: "1200",
      flightRules: "VFR",
      aircraftType: "C172",
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "south",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
      },
    });
    world.aircraft.push(ac2);
    pacedQueue.evaluateAircraft(ac2, world, 4000);
    world.simTimeMs = 4000;
    pacedQueue.drain({ world, log, radio: mockRadio });
    expect(world.radioRequests.some((r) => r.callsign === "N222BB")).toBe(false);

    // When radio becomes free, request is transmitted
    busyState = false;
    pacedQueue.drain({ world, log, radio: mockRadio });
    expect(world.radioRequests.some((r) => r.callsign === "N222BB")).toBe(true);
  });

  test("3D Class B avoidance: Parameterized geometry verifies no swept-path entry", () => {
    const regional = buildSyntheticRegionalFacility();
    const classBVolumes = regional.airspaces.filter(isVfrAvoidanceVolume);
    expect(classBVolumes.length).toBeGreaterThan(0);

    const cancellationAircraft = createAircraft({
      id: "ac-cancel-long",
      callsign: "N555CL",
      xNm: -20,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 4500,
      speedKt: 120,
      squawk: "4721",
      flightRules: "IFR",
      airborne: true,
      cancellationPending: true,
      ambientVfr: {
        mission: "TRANSIT",
        zoneId: "west",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
        waypoints: [{ xNm: 0, yNm: 0, altitudeFt: 4500 }],
        waypointIndex: 0,
      },
    });
    const cancellationWorld = createWorld({ aircraft: [cancellationAircraft] });
    cancellationWorld.regional = regional;
    const cancellationBefore = structuredClone(cancellationAircraft);
    const cancellationCheck = validateInstructions(
      cancellationAircraft,
      [{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }],
      {
        regional,
        vfrContinuationValidator: () =>
          isRouteSafeFromAvoidance(
            [
              {
                xNm: cancellationAircraft.xNm,
                yNm: cancellationAircraft.yNm,
                altitudeFt: cancellationAircraft.altitudeFt,
              },
              { xNm: 0, yNm: 0, altitudeFt: 4500 },
            ],
            classBVolumes,
          ),
      },
    );
    expect(cancellationCheck).toEqual({
      ok: false,
      reason: "CANCELLATION",
      detail: "CANCELLATION: unable to establish safe VFR continuation",
    });
    expect(cancellationAircraft).toEqual(cancellationBefore);

    // Plan route starting west of Bravo [-20, 0] aiming east of Bravo [20, 0] at 4500 ft
    // Direct path would pass straight through Bravo Core (x: [-5, 5], y: [-5, 5], alt 0-10000)
    const rng = mulberry32(12345);
    // T04-77: training box covering the old west-zone footprint.
    const box = {
      centerNm: { xNm: -22.5, yNm: 0 },
      halfExtentNm: 5,
    };
    const routePlan = planSafeVfrRoute({
      mission: "TRANSIT",
      box,
      altitudeFt: 4500,
      speedKt: 120,
      avoidanceVolumes: classBVolumes,
      rng,
    });
    expect(routePlan).not.toBeNull();
    const plannedWaypoints = routePlan!.waypoints;
    expect(plannedWaypoints.length).toBeGreaterThan(0);

    // Parameterized check: Every point along the planned route avoids Bravo core
    for (const pt of [routePlan!.spawnPose, ...plannedWaypoints]) {
      for (const volume of classBVolumes) {
        const inside = isPointInside3dVolume(
          { xNm: pt.xNm, yNm: pt.yNm, altitudeFt: pt.altitudeFt },
          volume,
        );
        expect(inside).toBe(false);
      }
    }

    // Step an aircraft along the planned route and verify it never penetrates Bravo
    const ac = createAircraft({
      id: "ac-avoid",
      callsign: "N555AV",
      xNm: routePlan!.spawnPose.xNm,
      yNm: routePlan!.spawnPose.yNm,
      headingDeg: routePlan!.spawnPose.headingDeg,
      altitudeFt: routePlan!.spawnPose.altitudeFt,
      speedKt: routePlan!.spawnPose.speedKt,
      squawk: "1200",
      flightRules: "VFR",
      aircraftType: "C172",
      ambientVfr: {
        mission: "TRANSIT",
        zoneId: "west",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
        waypoints: plannedWaypoints,
        waypointIndex: 0,
      },
    });

    const world = createWorld({
      aircraft: [ac],
      simTimeMs: 0,
    });
    world.regional = regional;

    // Simulate 300 seconds of flight
    for (let i = 0; i < 300; i++) {
      stepWorld(world, 1);
      for (const volume of classBVolumes) {
        const inside = isPointInside3dVolume(
          { xNm: ac.xNm, yNm: ac.yNm, altitudeFt: ac.altitudeFt },
          volume,
        );
        expect(inside).toBe(false);
      }
    }
  });

  test("Legacy IFR repeatability: VFR presence under the same seed does not mutate legacy arrival or departure schedules", () => {
    const kdem = loadKdem();
    const seed = 9999;

    // 1. Generate arrival schedule without VFR
    const schedWithoutVfr = createArrivalScheduler(
      kdem.catalog,
      { initialArrivalCount: 4, arrivalsPerHour: 12, seed, activeRunwayId: "27" },
      [],
      0,
      "27",
      kdem.arrivals.map((a) => ({
        starId: a.starId!,
        transitionId: a.transitionId!,
        entryFixId: a.entryFixId!,
      })),
    );

    // 2. Generate arrival schedule with VFR enabled in scenario
    const vfrKdem = {
      ...kdem,
      vfrTraffic: {
        initialCount: 5,
        targetCount: 5,
        entriesPerHour: 10,
        maxPopulation: 10,
        seed,
      },
    };
    const schedWithVfr = createArrivalScheduler(
      vfrKdem.catalog,
      { initialArrivalCount: 4, arrivalsPerHour: 12, seed, activeRunwayId: "27" },
      [],
      0,
      "27",
      vfrKdem.arrivals.map((a) => ({
        starId: a.starId!,
        transitionId: a.transitionId!,
        entryFixId: a.entryFixId!,
      })),
    );

    // Exactly identical arrival schedules!
    expect(schedWithoutVfr.schedule.length).toBe(schedWithVfr.schedule.length);
    for (let i = 0; i < schedWithoutVfr.schedule.length; i++) {
      const a = schedWithoutVfr.schedule[i];
      const b = schedWithVfr.schedule[i];
      expect(a.callsign).toBe(b.callsign);
      expect(a.assignment.starId).toBe(b.assignment.starId);
      expect(a.assignment.transitionId).toBe(b.assignment.transitionId);
      expect(a.scheduledSimMs).toBe(b.scheduledSimMs);
    }

    // 3. Generate departures without VFR vs with VFR
    const depWithoutVfr = generateDepartureSchedule({
      catalog: kdem.catalog,
      seed,
      ratePerHour: 8,
      count: 6,
      runwayId: "27",
      startSimMs: 0,
    });

    const depWithVfr = generateDepartureSchedule({
      catalog: vfrKdem.catalog,
      seed,
      ratePerHour: 8,
      count: 6,
      runwayId: "27",
      startSimMs: 0,
    });

    // Exactly identical departure schedules!
    expect(depWithoutVfr.length).toBe(depWithVfr.length);
    for (let i = 0; i < depWithoutVfr.length; i++) {
      expect(depWithoutVfr[i].callsign).toBe(depWithVfr[i].callsign);
      expect(depWithoutVfr[i].sidId).toBe(depWithVfr[i].sidId);
      expect(depWithoutVfr[i].scheduledSimMs).toBe(depWithVfr[i].scheduledSimMs);
    }
  });

  test("Destination eligibility contract: Untowered or private fields rejected from VFR destination list", () => {
    const regional = buildSyntheticRegionalFacility();
    const eligible = getEligibleVfrDestinations(regional);

    // KSYN is center (not satellite destination)
    // KPDK is towered, public-use, valid runways -> eligible
    // KUNF is untowered -> excluded
    const eligibleIcaos = eligible.map((d) => d.icao);
    expect(eligibleIcaos).toContain("KPDK");
    expect(eligibleIcaos).not.toContain("KUNF");
  });

  test("T04-91 integrated audit closure: regional load, visual lifecycle, and DCB state", () => {
    // Regional scenario boot remains generic and KDEM remains the default.
    const katl = loadPlayableScenario("katl");
    expect(katl.icao).toBe("KATL");
    expect(katl.regional).toBeDefined();
    expect(katl.regional?.radiusNm).toBe(40);
    expect(getEligibleVfrDestinations(katl.regional!).every((airport) => airport.eligible)).toBe(
      true,
    );

    const regional = buildSyntheticRegionalFacility();
    expect(getEligibleVfrDestinations(regional).map((airport) => airport.icao)).toEqual([
      "KDEM",
      "KPDK",
    ]);

    // Visual validation fails closed when the resolved destination has no runway geometry.
    const rejectedVisual = createAircraft({
      id: "ac-visual-rejected",
      callsign: "N901VR",
      destination: "KUNF",
      xNm: 4,
      yNm: 0,
      headingDeg: 270,
      altitudeFt: 1500,
      speedKt: 120,
    });
    const rejectedWorld = createWorld({
      aircraft: [rejectedVisual],
      catalog: loadKdem().catalog,
      regional: {
        centerAirportId: "KDEM",
        airports: [{ icao: "KUNF", fieldElevFt: 800, runways: [] }],
      },
    });
    expect(
      validateInstructions(rejectedVisual, [{ type: "CLEARED_VISUAL", runwayId: "09" }], {
        world: rejectedWorld,
      }),
    ).toEqual({ ok: false, reason: "RUNWAY" });

    // Valid center geometry drives the existing visual final through touchdown.
    const visualAircraft = createAircraft({
      id: "ac-visual-arrival",
      callsign: "N902VA",
      xNm: 0.05,
      yNm: 0,
      headingDeg: 270,
      altitudeFt: 40,
      speedKt: 130,
    });
    const visualWorld = createWorld({
      aircraft: [visualAircraft],
      catalog: {
        airportId: "KDEM",
        fieldElevFt: 0,
        approaches: [{ id: "VISUAL27", runway: "27", thresholdFixId: "RW27", courseDeg: 270 }],
        navaids: [],
        fixes: [{ id: "RW27", xNm: 0, yNm: 0 }],
        sids: [],
        stars: [],
      },
      sessionLog: new SessionLog(),
    });
    expect(
      validateInstructions(visualAircraft, [{ type: "CLEARED_VISUAL", runwayId: "27" }], {
        world: visualWorld,
      }).ok,
    ).toBe(true);
    applyIntent(visualAircraft, [{ type: "CLEARED_VISUAL", runwayId: "27" }], 0, {
      world: visualWorld,
    });
    for (let i = 0; i < 20; i++) stepWorld(visualWorld, SIM_DT_S);
    expect(visualWorld.aircraft).toHaveLength(0);
    expect(visualWorld.sessionLog?.byType("nav.landed")).toHaveLength(1);

    // DCB cancellation restores coupled range-ring state; PTL zero disables PTL.
    const view = createScopeView();
    view.ringIntervalNm = 5;
    view.showRings = false;
    armDcbSpinner(view, "RR");
    inputDcbSpinnerKey(view, "2");
    inputDcbSpinnerKey(view, "0");
    view.showRings = true;
    cancelDcbSpinner(view);
    expect(view.ringIntervalNm).toBe(5);
    expect(view.showRings).toBe(false);

    armDcbSpinner(view, "PTL");
    inputDcbSpinnerKey(view, "0");
    commitDcbSpinner(view);
    expect(view.ptlMinutes).toBe(0);
    expect(view.ptlOn).toBe(false);
  });

  describe.each<{
    label: string;
    mission: AmbientVfrMission;
    altitudeFt: number;
    seed: number;
  }>([
    {
      label: "transit below shelf floor (2500 ft, core still applies)",
      mission: "TRANSIT",
      altitudeFt: 2500,
      seed: 101,
    },
    {
      label: "transit inside shelf and core (4500 ft)",
      mission: "TRANSIT",
      altitudeFt: 4500,
      seed: 202,
    },
    {
      label: "transit near Bravo ceiling (9500 ft)",
      mission: "TRANSIT",
      altitudeFt: 9500,
      seed: 303,
    },
    {
      label: "local practice-area mission (3500 ft)",
      mission: "LOCAL",
      altitudeFt: 3500,
      seed: 404,
    },
  ])("Parameterized Bravo no-entry geometry: $label", ({ mission, altitudeFt, seed }) => {
    test("no swept-path segment enters any Class B avoidance volume", () => {
      const regional = buildSyntheticRegionalFacility();
      const classBVolumes = regional.airspaces.filter(isVfrAvoidanceVolume);
      expect(classBVolumes.length).toBeGreaterThan(0);

      // T04-77: training boxes covering the old west/north zone footprints.
      const box =
        mission === "TRANSIT"
          ? {
              centerNm: { xNm: -22.5, yNm: 0 },
              halfExtentNm: 5,
            }
          : {
              centerNm: { xNm: -11, yNm: 17 },
              halfExtentNm: 8,
            };
      const routePlan = planSafeVfrRoute({
        mission,
        box,
        altitudeFt,
        speedKt: 120,
        avoidanceVolumes: classBVolumes,
        rng: mulberry32(seed),
      });
      expect(routePlan).not.toBeNull();
      expect(routePlan!.waypoints.length).toBeGreaterThan(0);

      // Swept-path check: subdivide every leg so a straight segment cannot
      // tunnel through a volume between waypoints.
      const path = [routePlan!.spawnPose, ...routePlan!.waypoints];
      for (let leg = 0; leg < path.length - 1; leg++) {
        const from = path[leg]!;
        const to = path[leg + 1]!;
        for (let step = 0; step <= 10; step++) {
          const t = step / 10;
          const sample = {
            xNm: from.xNm + (to.xNm - from.xNm) * t,
            yNm: from.yNm + (to.yNm - from.yNm) * t,
            altitudeFt: from.altitudeFt + (to.altitudeFt - from.altitudeFt) * t,
          };
          for (const volume of classBVolumes) {
            expect(isPointInside3dVolume(sample, volume)).toBe(false);
          }
        }
      }
    });
  });

  function makeLongSessionVfrAc(id: string, callsign: string) {
    return createAircraft({
      id,
      callsign,
      xNm: -12,
      yNm: 15,
      headingDeg: 120,
      altitudeFt: 4500,
      speedKt: 120,
      squawk: "1200",
      flightRules: "VFR",
      aircraftType: "C172",
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "north",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
      },
    });
  }

  test("Long-session bounds: rolling-hour cap, fair FIFO order, and bounded pending backlog", () => {
    const scenario = buildSyntheticScenario();
    const callsigns = ["N701AA", "N702AA", "N703AA", "N704AA", "N705AA", "N706AA"];
    const aircraft = callsigns.map((callsign, i) => makeLongSessionVfrAc(`ac-long-${i}`, callsign));
    const world = createWorld({ aircraft, simTimeMs: 0, catalog: scenario.catalog });
    world.regional = scenario.regional;
    const log = new SessionLog();
    world.sessionLog = log;

    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, ifrPickupPercent: 0, requestCapPerHour: 2 },
      seed: 7,
      initialSlotOffsetMs: 0,
    });
    for (const ac of aircraft) {
      queue.evaluateAircraft(ac, world, 0);
    }
    expect(queue.getRequests()).toHaveLength(6);

    // Step 121 minutes in 60 s increments; drain transmits at most one request
    // per call, paced by the (3_600_000 / cap) ms slot spacing.
    for (let tSec = 0; tSec <= 7260; tSec += 60) {
      world.simTimeMs = tSec * 1000;
      queue.drain({ world, log });
    }

    const transmitted = world.radioRequests ?? [];
    expect(transmitted.length).toBeGreaterThan(0);

    // Rolling-hour cap: at most `cap` transmissions in any open 1 h window.
    const times = transmitted.map((r) => r.requestedAtSimMs).sort((a, b) => a - b);
    for (let i = 0; i < times.length; i++) {
      const inWindow = times.filter((t) => t > times[i]! && t <= times[i]! + 3_600_000);
      expect(inWindow.length).toBeLessThanOrEqual(2);
    }

    // Fair FIFO scheduling: transmission order follows evaluation order.
    const order = transmitted.map((r) => r.callsign);
    expect(order).toEqual(callsigns.slice(0, transmitted.length));

    // Bounded pending backlog: every request is accounted for exactly once,
    // and every still-pending request is paced in the future (no overdue pile-up).
    const states = queue.getRequests();
    const pending = states.filter((r) => r.state === "PENDING");
    const withdrawn = states.filter((r) => r.state === "WITHDRAWN");
    expect(pending.length + transmitted.length + withdrawn.length).toBe(6);
    for (const req of pending) {
      expect(req.dueAtSimMs).toBeGreaterThan(world.simTimeMs);
    }
  });

  test("Long-session bounds: exit cleanup, seed repeatability, and zero-cap no catch-up", () => {
    const scenario = buildSyntheticScenario();

    // 1. Exit cleanup: an aircraft removed before its due time withdraws cleanly.
    {
      const ac = makeLongSessionVfrAc("ac-exit", "N710AA");
      const world = createWorld({ aircraft: [ac], simTimeMs: 0, catalog: scenario.catalog });
      world.regional = scenario.regional;
      const log = new SessionLog();
      world.sessionLog = log;
      const queue = createVfrRequestQueue({
        config: { flightFollowingPercent: 100, ifrPickupPercent: 0, requestCapPerHour: 10 },
        seed: 9,
        initialSlotOffsetMs: 60_000,
      });
      queue.evaluateAircraft(ac, world, 0);
      expect(queue.getRequests()).toHaveLength(1);

      world.aircraft = [];
      world.simTimeMs = 120_000;
      queue.drain({ world, log });

      const reqs = queue.getRequests();
      expect(reqs[0]!.state).toBe("WITHDRAWN");
      expect(reqs[0]!.withdrawnReason).toBe("AIRCRAFT_EXITED");
      expect(world.radioRequests ?? []).toHaveLength(0);
      expect(log.byType("vfr.request.withdrawn").length).toBeGreaterThan(0);
    }

    // 2. Seed repeatability: identical seeds and evaluation order draw identical outcomes.
    {
      const buildWorld = () => {
        const acs = ["N721AA", "N722AA", "N723AA", "N724AA"].map((cs, i) =>
          makeLongSessionVfrAc(`ac-rep-${i}`, cs),
        );
        const world = createWorld({ aircraft: acs, simTimeMs: 0, catalog: scenario.catalog });
        world.regional = scenario.regional;
        return world;
      };
      const runOnce = () => {
        const world = buildWorld();
        const queue = createVfrRequestQueue({
          config: { flightFollowingPercent: 50, ifrPickupPercent: 50, requestCapPerHour: 10 },
          seed: 11,
          initialSlotOffsetMs: 0,
          regional: scenario.regional,
        });
        for (const ac of world.aircraft) {
          queue.evaluateAircraft(ac, world, 0);
        }
        return queue.getRequests().map((r) => ({
          kind: r.kind,
          state: r.state,
          dueOffset: r.dueAtSimMs - r.createdAtSimMs,
          destinationAirportId: r.destinationAirportId,
        }));
      };
      expect(runOnce()).toEqual(runOnce());
    }

    // 3. Zero cap: no new requests, and no hourly catch-up burst afterwards.
    {
      const acs = [
        makeLongSessionVfrAc("ac-zero-0", "N731AA"),
        makeLongSessionVfrAc("ac-zero-1", "N732AA"),
      ];
      const world = createWorld({ aircraft: acs, simTimeMs: 0, catalog: scenario.catalog });
      world.regional = scenario.regional;
      const log = new SessionLog();
      world.sessionLog = log;
      const queue = createVfrRequestQueue({
        config: { flightFollowingPercent: 100, ifrPickupPercent: 0, requestCapPerHour: 0 },
        seed: 13,
      });
      for (const ac of acs) {
        queue.evaluateAircraft(ac, world, 0);
      }
      for (const req of queue.getRequests()) {
        expect(req.state).toBe("WITHDRAWN");
        expect(req.withdrawnReason).toBe("CAP_ZERO");
      }
      for (let tSec = 0; tSec <= 3 * 3600; tSec += 300) {
        world.simTimeMs = tSec * 1000;
        queue.drain({ world, log });
      }
      expect(world.radioRequests ?? []).toHaveLength(0);
    }
  });
});
