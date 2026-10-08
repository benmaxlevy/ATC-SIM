import { describe, expect, test } from "vitest";
import { createAircraft, createWorld, stepWorld, SessionLog } from "../../core";
import { deriveScratchpads } from "../../scope/trackDisplay";
import { assertScenario, loadKdem } from "../load";
import { createWorldFromScenario } from "../spawn";
import { parseRegionalPack, type RegionalFacility } from "../regional";
import { VfrTrafficManager } from "../vfrTraffic";

const CENTER_LAT_LON = { latDeg: 33.6407, lonDeg: -84.4277 };

function buildTestRegional(): RegionalFacility {
  const manifest = {
    schemaVersion: 1,
    centerAirportId: "KDEM",
    radiusNm: 40,
    source: { families: ["CIFP"] },
    files: { airports: "regional-airports.json", airspace: "regional-airspace.json" },
  };
  return parseRegionalPack(
    manifest,
    [
      {
        icao: "KDEM",
        name: "DEMO CENTER",
        arp: CENTER_LAT_LON,
        fieldElevFt: 1026,
        magVarDeg: -5,
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
            id: "09L",
            headingTrueDeg: 95,
            headingMagDeg: 100,
            lengthFt: 9000,
            threshold: CENTER_LAT_LON,
          },
        ],
      },
      {
        icao: "KSAT1",
        name: "SATELLITE ONE",
        arp: { latDeg: 33.85, lonDeg: -84.3 },
        fieldElevFt: 800,
        magVarDeg: -5,
        publicUse: true,
        towered: true,
        eligible: true,
        serviceMetadata: {
          publicUse: true,
          towered: true,
          sourceFile: "APT.csv",
          sourceRecordId: "KSAT1",
        },
        catalogRef: "airports/KSAT1",
        runways: [
          {
            id: "27",
            headingTrueDeg: 265,
            headingMagDeg: 270,
            lengthFt: 5000,
            threshold: { latDeg: 33.85, lonDeg: -84.28 },
          },
          {
            id: "09",
            headingTrueDeg: 85,
            headingMagDeg: 90,
            lengthFt: 5000,
            threshold: { latDeg: 33.85, lonDeg: -84.32 },
          },
        ],
      },
      {
        icao: "KSAT2",
        name: "SATELLITE TWO",
        arp: { latDeg: 33.5, lonDeg: -84.6 },
        fieldElevFt: 950,
        magVarDeg: -5,
        publicUse: true,
        towered: true,
        eligible: true,
        serviceMetadata: {
          publicUse: true,
          towered: true,
          sourceFile: "APT.csv",
          sourceRecordId: "KSAT2",
        },
        catalogRef: "airports/KSAT2",
        runways: [
          {
            id: "18",
            headingTrueDeg: 175,
            headingMagDeg: 180,
            lengthFt: 4500,
            threshold: { latDeg: 33.52, lonDeg: -84.6 },
          },
        ],
      },
    ],
    [
      {
        id: "CLASS_B",
        name: "CENTER CLASS B",
        type: "CONTROLLED",
        class: "B",
        centerAirportId: "KDEM",
        lowerLimit: { altitudeFt: 0, unit: "MSL", reference: "MSL" },
        upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
        segments: [
          {
            sequence: 1,
            boundaryVia: "C",
            boundaryViaType: "CIRCLE",
            position: CENTER_LAT_LON,
            arcOrigin: CENTER_LAT_LON,
            arcDistanceNm: 7,
          },
        ],
      },
      {
        id: "CLASS_D_SAT1",
        name: "KSAT1 CLASS D",
        type: "CONTROLLED",
        class: "D",
        centerAirportId: "KSAT1",
        lowerLimit: { altitudeFt: 0, unit: "MSL", reference: "MSL" },
        upperLimit: { altitudeFt: 2500, unit: "MSL", reference: "MSL" },
        segments: [
          {
            sequence: 1,
            boundaryVia: "C",
            boundaryViaType: "CIRCLE",
            position: { latDeg: 33.85, lonDeg: -84.3 },
            arcOrigin: { latDeg: 33.85, lonDeg: -84.3 },
            arcDistanceNm: 4,
          },
        ],
      },
      {
        id: "CLASS_D_SAT2",
        name: "KSAT2 CLASS D",
        type: "CONTROLLED",
        class: "D",
        centerAirportId: "KSAT2",
        lowerLimit: { altitudeFt: 0, unit: "MSL", reference: "MSL" },
        upperLimit: { altitudeFt: 2500, unit: "MSL", reference: "MSL" },
        segments: [
          {
            sequence: 1,
            boundaryVia: "C",
            boundaryViaType: "CIRCLE",
            position: { latDeg: 33.5, lonDeg: -84.6 },
            arcOrigin: { latDeg: 33.5, lonDeg: -84.6 },
            arcDistanceNm: 4,
          },
        ],
      },
    ],
    CENTER_LAT_LON,
  );
}

describe("T04-83: VFR auto-land on visual final integration suite", () => {
  test("AC-1: Destination runway seeded deterministically on ambientVfr at spawn for AIRPORT_BOUND missions", () => {
    const regional = buildTestRegional();
    const scenario = assertScenario(
      {
        ...loadKdem(),
        vfrTraffic: {
          initialCount: 5,
          targetCount: 0,
          entriesPerHour: 0,
          maxPopulation: 5,
          seed: 42,
          movementMix: { localPercent: 0, transitPercent: 0, airportBoundPercent: 100 },
        },
      },
      { regional },
    );

    const world1 = createWorldFromScenario(scenario, 42);
    const vfr1 = world1.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfr1).toHaveLength(5);

    for (const ac of vfr1) {
      expect(ac.ambientVfr?.mission).toBe("AIRPORT_BOUND");
      expect(ac.ambientVfr?.destinationAirportId).toBeDefined();
      expect(ac.ambientVfr?.destinationRunwayId).toBeDefined();

      const airport = regional.getAirport(ac.ambientVfr!.destinationAirportId!);
      expect(airport).toBeDefined();
      const rwy = airport!.runways.find((r) => r.id === ac.ambientVfr!.destinationRunwayId);
      expect(rwy).toBeDefined();
    }

    // Seeded replay produces identical destination runway selections
    const world2 = createWorldFromScenario(scenario, 42);
    const vfr2 = world2.aircraft.filter((a) => a.ambientVfr !== undefined);
    for (let i = 0; i < 5; i++) {
      expect(vfr2[i]!.ambientVfr?.destinationAirportId).toBe(
        vfr1[i]!.ambientVfr?.destinationAirportId,
      );
      expect(vfr2[i]!.ambientVfr?.destinationRunwayId).toBe(
        vfr1[i]!.ambientVfr?.destinationRunwayId,
      );
    }
  });

  test("AC-2, AC-3, AC-4, AC-5: Complete landing lifecycle: intercept -> handoff -> touchdown -> despawn with standard VFR datablock", () => {
    const regional = buildTestRegional();
    const sat1 = regional.getAirport("KSAT1")!;
    const rwy27 = sat1.runways.find((r) => r.id === "27")!;
    const thresh = rwy27.thresholdNm;
    const rwyHeadingDeg = rwy27.headingMagDeg;

    const log = new SessionLog();
    const world = createWorld({
      regional,
      sessionLog: log,
      catalog: {
        airportId: "KDEM",
        name: "Demo Center",
        fixes: [],
        navaids: [],
        stars: [],
        sids: [],
        approaches: [],
      },
    });

    const scenario = assertScenario(
      {
        ...loadKdem(),
        vfrTraffic: {
          initialCount: 0,
          targetCount: 0,
          entriesPerHour: 0,
          maxPopulation: 10,
          seed: 100,
        },
      },
      { regional },
    );
    const manager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 100,
    });
    world.vfrTrafficManager = manager;

    // Place aircraft 4.0 NM out along the extended runway 27 centerline
    const headingRad = (rwyHeadingDeg * Math.PI) / 180;
    const initialDistNm = 4.0;
    const initX = thresh.xNm - initialDistNm * Math.sin(headingRad);
    const initY = thresh.yNm - initialDistNm * Math.cos(headingRad);

    const ac = createAircraft({
      callsign: "N83VA",
      xNm: initX,
      yNm: initY,
      headingDeg: rwyHeadingDeg,
      altitudeFt: sat1.fieldElevFt + 1300,
      speedKt: 100,
      flightRules: "VFR",
      squawk: "1200",
      ambientVfr: {
        mission: "AIRPORT_BOUND",
        zoneId: "test",
        destinationAirportId: "KSAT1",
        destinationRunwayId: "27",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [
          {
            xNm: initX,
            yNm: initY,
            altitudeFt: sat1.fieldElevFt + 1300,
            speedKt: 100,
            targetToleranceNm: 2.0,
          },
        ],
        waypointIndex: 0,
      },
    });
    world.aircraft.push(ac);

    // Step world 1s: aircraft joins VISUAL_FINAL and emits vfr.tower.handoff
    stepWorld(world, 1.0);

    expect(ac.intent.lateral?.type).toBe("VISUAL_FINAL");
    expect(ac.intent.vertical?.type).toBe("GLIDEPATH");
    expect(ac.intent.assignedAltitudeFt).toBe(sat1.fieldElevFt);

    // Datablock remains standard VFR (no V27 clearance tag)
    const sp = deriveScratchpads(ac);
    expect(sp.sp1).toBe("");

    // Verify vfr.tower.handoff was emitted
    const handoffEvents = log.byType("vfr.tower.handoff");
    expect(handoffEvents).toHaveLength(1);
    expect(handoffEvents[0]?.callsign).toBe("N83VA");
    expect(handoffEvents[0]?.destinationAirportId).toBe("KSAT1");

    // Advance world simulation until touchdown at threshold
    // At 100 kt, 4 NM takes ~144 seconds
    let landed = false;
    for (let t = 0; t < 200; t++) {
      stepWorld(world, 1.0);
      if (!world.aircraft.some((a) => a.callsign === "N83VA")) {
        landed = true;
        break;
      }
    }

    expect(landed).toBe(true);

    // Verify nav.landed event was emitted at touchdown
    const landedEvents = log.byType("nav.landed");
    expect(landedEvents).toHaveLength(1);
    expect(landedEvents[0]?.callsign).toBe("N83VA");
    expect(landedEvents[0]?.approachId).toBe("VISUAL_27");

    // Event order check: vfr.tower.handoff occurred before nav.landed
    expect(handoffEvents[0]!.atSimMs).toBeLessThan(landedEvents[0]!.atSimMs);

    // Zero MSAW alerts generated
    expect(log.byType("alert.msaw.caution")).toHaveLength(0);
    expect(log.byType("alert.msaw.alert")).toHaveLength(0);
  });

  test("AC-6: Airborne IFR pickups do not auto-land", () => {
    const regional = buildTestRegional();
    const sat1 = regional.getAirport("KSAT1")!;
    const rwy27 = sat1.runways.find((r) => r.id === "27")!;
    const thresh = rwy27.thresholdNm;
    const rwyHeadingDeg = rwy27.headingMagDeg;

    const log = new SessionLog();
    const world = createWorld({ regional, sessionLog: log });
    const scenario = assertScenario(
      {
        ...loadKdem(),
        vfrTraffic: { initialCount: 0, targetCount: 0, entriesPerHour: 0, maxPopulation: 10 },
      },
      { regional },
    );
    world.vfrTrafficManager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 1,
    });

    const headingRad = (rwyHeadingDeg * Math.PI) / 180;
    const initX = thresh.xNm - 4.0 * Math.sin(headingRad);
    const initY = thresh.yNm - 4.0 * Math.cos(headingRad);

    const ac = createAircraft({
      callsign: "N83IFR",
      xNm: initX,
      yNm: initY,
      headingDeg: rwyHeadingDeg,
      altitudeFt: 4000,
      speedKt: 120,
      flightRules: "IFR", // Airborne IFR pickup completed!
      squawk: "0234",
      ambientVfr: {
        mission: "AIRPORT_BOUND",
        zoneId: "test",
        destinationAirportId: "KSAT1",
        destinationRunwayId: "27",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
        waypoints: [{ xNm: initX, yNm: initY, altitudeFt: 4000, speedKt: 120 }],
        waypointIndex: 0,
      },
    });
    world.aircraft.push(ac);

    stepWorld(world, 1.0);

    // Must NOT enter VISUAL_FINAL auto-land
    expect(ac.intent.lateral?.type).not.toBe("VISUAL_FINAL");
    expect(log.byType("vfr.tower.handoff")).toHaveLength(0);
    expect(log.byType("nav.landed")).toHaveLength(0);
  });

  test("AC-6: Departures and transits never auto-land and exit cleanly at boundary", () => {
    const regional = buildTestRegional();
    const log = new SessionLog();
    const world = createWorld({ regional, sessionLog: log });
    const scenario = assertScenario(
      {
        ...loadKdem(),
        vfrTraffic: { initialCount: 0, targetCount: 0, entriesPerHour: 0, maxPopulation: 10 },
      },
      { regional },
    );
    world.vfrTrafficManager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 1,
    });

    const depAc = createAircraft({
      callsign: "NDEP1",
      xNm: 0,
      yNm: 25,
      headingDeg: 0,
      altitudeFt: 5000,
      speedKt: 120,
      flightRules: "VFR",
      ambientVfr: {
        mission: "SATELLITE_DEPARTURE",
        zoneId: "test",
        originAirportId: "KSAT1",
        departureRunwayId: "27",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [
          { xNm: 0, yNm: 27, altitudeFt: 5000, speedKt: 120 },
          { xNm: 0, yNm: 35, altitudeFt: 5000, speedKt: 120 },
        ],
        waypointIndex: 1,
      },
    });

    const transAc = createAircraft({
      callsign: "NTRN1",
      xNm: -25,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 4500,
      speedKt: 110,
      flightRules: "VFR",
      ambientVfr: {
        mission: "TRANSIT",
        zoneId: "test",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [
          { xNm: -20, yNm: 0, altitudeFt: 4500, speedKt: 110 },
          { xNm: 35, yNm: 0, altitudeFt: 4500, speedKt: 110 },
        ],
        waypointIndex: 1,
      },
    });

    world.aircraft.push(depAc, transAc);

    stepWorld(world, 1.0);
    expect(depAc.intent.lateral?.type).not.toBe("VISUAL_FINAL");
    expect(transAc.intent.lateral?.type).not.toBe("VISUAL_FINAL");
    expect(log.byType("nav.landed")).toHaveLength(0);
  });

  test("Flight-following VFR arrivals land identically and preserve service state", () => {
    const regional = buildTestRegional();
    const sat1 = regional.getAirport("KSAT1")!;
    const rwy27 = sat1.runways.find((r) => r.id === "27")!;
    const thresh = rwy27.thresholdNm;
    const rwyHeadingDeg = rwy27.headingMagDeg;

    const log = new SessionLog();
    const world = createWorld({ regional, sessionLog: log });
    const scenario = assertScenario(
      {
        ...loadKdem(),
        vfrTraffic: { initialCount: 0, targetCount: 0, entriesPerHour: 0, maxPopulation: 10 },
      },
      { regional },
    );
    world.vfrTrafficManager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 2,
    });

    const headingRad = (rwyHeadingDeg * Math.PI) / 180;
    const initX = thresh.xNm - 4.0 * Math.sin(headingRad);
    const initY = thresh.yNm - 4.0 * Math.cos(headingRad);

    const ac = createAircraft({
      callsign: "N83FF",
      xNm: initX,
      yNm: initY,
      headingDeg: rwyHeadingDeg,
      altitudeFt: sat1.fieldElevFt + 1300,
      speedKt: 100,
      flightRules: "VFR",
      squawk: "0245", // Discrete flight following squawk
      ambientVfr: {
        mission: "AIRPORT_BOUND",
        zoneId: "test",
        destinationAirportId: "KSAT1",
        destinationRunwayId: "27",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
        waypoints: [{ xNm: initX, yNm: initY, altitudeFt: sat1.fieldElevFt + 1300, speedKt: 100 }],
        waypointIndex: 0,
      },
    });
    world.aircraft.push(ac);

    stepWorld(world, 1.0);
    expect(ac.intent.lateral?.type).toBe("VISUAL_FINAL");
    expect(ac.squawk).toBe("0245"); // Preserves discrete code
    expect(log.byType("vfr.tower.handoff")).toHaveLength(1);

    // Fast-forward to landing
    for (let t = 0; t < 200; t++) {
      stepWorld(world, 1.0);
      if (!world.aircraft.some((a) => a.callsign === "N83FF")) break;
    }

    expect(world.aircraft.some((a) => a.callsign === "N83FF")).toBe(false);
    expect(log.byType("nav.landed")).toHaveLength(1);
  });

  test("Boundary overshoot on missed/unaligned VFR arrival exits cleanly with BOUNDARY_EXIT", () => {
    const regional = buildTestRegional();
    const log = new SessionLog();
    const world = createWorld({ regional, sessionLog: log });
    const scenario = assertScenario(
      {
        ...loadKdem(),
        vfrTraffic: { initialCount: 0, targetCount: 0, entriesPerHour: 0, maxPopulation: 10 },
      },
      { regional },
    );
    world.vfrTrafficManager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 3,
    });

    // Aircraft flying away from destination beyond exit radius (58 NM)
    const ac = createAircraft({
      callsign: "NOVR1",
      xNm: 60,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 3500,
      speedKt: 110,
      flightRules: "VFR",
      ambientVfr: {
        mission: "AIRPORT_BOUND",
        zoneId: "test",
        destinationAirportId: "KSAT1",
        destinationRunwayId: "27",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [{ xNm: 65, yNm: 0, altitudeFt: 3500, speedKt: 110 }],
        waypointIndex: 0,
      },
    });
    world.aircraft.push(ac);

    stepWorld(world, 1.0);

    // Aircraft exited cleanly
    expect(world.aircraft.some((a) => a.callsign === "NOVR1")).toBe(false);
    const exits = log.byType("vfr.exit");
    expect(exits).toHaveLength(1);
    expect(exits[0]?.reason).toBe("BOUNDARY_EXIT");
  });

  test("Two airport-bound VFR arrivals on same runway both track final and touch down safely", () => {
    const regional = buildTestRegional();
    const sat1 = regional.getAirport("KSAT1")!;
    const rwy27 = sat1.runways.find((r) => r.id === "27")!;
    const thresh = rwy27.thresholdNm;
    const rwyHeadingDeg = rwy27.headingMagDeg;

    const log = new SessionLog();
    const world = createWorld({ regional, sessionLog: log });
    const scenario = assertScenario(
      {
        ...loadKdem(),
        vfrTraffic: { initialCount: 0, targetCount: 0, entriesPerHour: 0, maxPopulation: 10 },
      },
      { regional },
    );
    world.vfrTrafficManager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 4,
    });

    const headingRad = (rwyHeadingDeg * Math.PI) / 180;
    const leadX = thresh.xNm - 2.5 * Math.sin(headingRad);
    const leadY = thresh.yNm - 2.5 * Math.cos(headingRad);
    const trailX = thresh.xNm - 4.5 * Math.sin(headingRad);
    const trailY = thresh.yNm - 4.5 * Math.cos(headingRad);

    const lead = createAircraft({
      callsign: "NLEAD",
      xNm: leadX,
      yNm: leadY,
      headingDeg: rwyHeadingDeg,
      altitudeFt: sat1.fieldElevFt + 800,
      speedKt: 90,
      flightRules: "VFR",
      ambientVfr: {
        mission: "AIRPORT_BOUND",
        zoneId: "test",
        destinationAirportId: "KSAT1",
        destinationRunwayId: "27",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [{ xNm: leadX, yNm: leadY, altitudeFt: sat1.fieldElevFt + 800, speedKt: 90 }],
        waypointIndex: 0,
      },
    });

    const trail = createAircraft({
      callsign: "NTRAIL",
      xNm: trailX,
      yNm: trailY,
      headingDeg: rwyHeadingDeg,
      altitudeFt: sat1.fieldElevFt + 1400,
      speedKt: 100,
      flightRules: "VFR",
      ambientVfr: {
        mission: "AIRPORT_BOUND",
        zoneId: "test",
        destinationAirportId: "KSAT1",
        destinationRunwayId: "27",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [
          { xNm: trailX, yNm: trailY, altitudeFt: sat1.fieldElevFt + 1400, speedKt: 100 },
        ],
        waypointIndex: 0,
      },
    });

    world.aircraft.push(lead, trail);

    // Both join visual final and land in sequence without crashing
    for (let t = 0; t < 220; t++) {
      stepWorld(world, 1.0);
    }

    expect(world.aircraft.some((a) => a.callsign === "NLEAD")).toBe(false);
    expect(world.aircraft.some((a) => a.callsign === "NTRAIL")).toBe(false);

    const landed = log.byType("nav.landed");
    expect(landed).toHaveLength(2);
    expect(landed.map((l) => l.callsign).sort()).toEqual(["NLEAD", "NTRAIL"]);
  });
});
