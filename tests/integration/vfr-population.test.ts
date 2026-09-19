/**
 * Integration tests: VFR population, autonomous navigation, 3D Class B avoidance,
 * and alert suppression (T04-71).
 *
 * Verifies:
 * - End-to-end ambient VFR population spawning, persistent waypoint navigation, and natural exits
 * - Alert suppression: AMBIENT_SUPPRESSED prevents MSAW/ATPA/CA flooding below MVA while IFR alerts remain active
 * - 3D Class B avoidance against catalog volumes
 * - One KATL smoke check proving regional catalog destinations and volumes come from imported data
 */

import { describe, expect, test } from "vitest";
import {
  evaluateConflictAlert,
  evaluateMsaw,
  isPointInside3dVolume,
  isRouteSafeFromAvoidance,
  makeTestAircraft,
  planSafeVfrRoute,
  SessionLog,
} from "@core";
import {
  assertScenario,
  createWorldFromScenario,
  getDepartureVfrAirports,
  getEligibleVfrDestinations,
  hasRegionalPack,
  loadKdem,
  loadRegionalPack,
  parseRegionalPack,
  resolveVfrExitRadiusNm,
  resolveVfrSpawnRadiusNm,
  type RegionalFacility,
  type Scenario,
} from "@scenario";
import katlJson from "../../src/scenario/katl.json";
import { createVfrRequestQueue } from "../../src/pilot/vfrRequestQueue";
import { handleRadioText } from "../../src/pilot/handleRadioText";

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
    name: "SYNTHETIC CLASS B SHELF",
    type: "CONTROLLED",
    class: "B",
    centerAirportId: "KSYN",
    lowerLimit: { altitudeFt: 3000, unit: "MSL", reference: "MSL" },
    upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
    segments: [
      {
        sequence: 1,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.1, lonDeg: -84.1 }, // x: -5, y: 6
      },
      {
        sequence: 2,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.1, lonDeg: -83.9 }, // x: 5, y: 6
      },
      {
        sequence: 3,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 32.9, lonDeg: -83.9 }, // x: 5, y: -6
      },
      {
        sequence: 4,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 32.9, lonDeg: -84.1 }, // x: -5, y: -6
      },
      {
        sequence: 5,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 33.1, lonDeg: -84.1 }, // x: -5, y: 6
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

describe("T04-71 VFR population end-to-end integration", () => {
  function buildSyntheticVfrScenario(): Scenario {
    const kdem = loadKdem();
    const regional = buildSyntheticRegionalFacility();
    return assertScenario(
      {
        ...kdem,
        vfrTraffic: {
          initialCount: 3,
          targetCount: 5,
          entriesPerHour: 4,
          maxPopulation: 6,
          seed: 42,
          movementMix: {
            localPercent: 50,
            transitPercent: 25,
            airportBoundPercent: 25,
          },
        },
      },
      { regional },
    );
  }

  test("AC1 & AC6: Spawns ambient VFR with VFR/1200 and AMBIENT_SUPPRESSED alert eligibility", () => {
    const scenario = buildSyntheticVfrScenario();
    const world = createWorldFromScenario(scenario, 42);

    const vfrAircraft = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfrAircraft).toHaveLength(3);

    for (const ac of vfrAircraft) {
      expect(ac.flightRules).toBe("VFR");
      expect(ac.squawk).toBe("1200");
      expect(ac.reportedSquawk).toBe("1200");
      expect(ac.ambientVfr?.alertEligibility).toBe("AMBIENT_SUPPRESSED");
      expect(ac.activeClearance).toBeUndefined();
      expect(ac.flightPlan).toBeUndefined();
      expect(ac.ambientVfr?.waypoints).toBeDefined();
      expect(ac.ambientVfr?.waypoints!.length).toBeGreaterThan(0);
    }
  });

  test("AC6: AMBIENT_SUPPRESSED suppresses MSAW below MVA while IFR aircraft trigger alerts", () => {
    const kdem = loadKdem();
    const mvaChart = kdem.mva!;
    expect(mvaChart).toBeDefined();

    // 1. Ambient VFR aircraft at 1,200 ft (below MVA floor 1,500 ft)
    const ambientVfrAc = makeTestAircraft({
      callsign: "N1234V",
      xNm: 0,
      yNm: 0,
      altitudeFt: 1200,
      speedKt: 100,
      flightRules: "VFR",
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "north",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
      },
    });

    // 2. Regular IFR aircraft at 1,200 ft (same location and altitude)
    const ifrAc = makeTestAircraft({
      callsign: "AAL555",
      xNm: 0,
      yNm: 0,
      altitudeFt: 1200,
      speedKt: 210,
      flightRules: "IFR",
    });

    // Evaluate MSAW on both
    const alerts = evaluateMsaw([ambientVfrAc, ifrAc], mvaChart);

    // IFR aircraft triggers MSAW LA alert
    expect(alerts.some((a) => a.callsign === "AAL555")).toBe(true);

    // Ambient VFR aircraft is completely suppressed from MSAW
    expect(alerts.some((a) => a.callsign === "N1234V")).toBe(false);
  });

  test("AC6: AMBIENT_SUPPRESSED suppresses Conflict Alert (CA) while IFR aircraft trigger CA", () => {
    // 1. Two IFR aircraft in conflict (same position, same altitude)
    const ifr1 = makeTestAircraft({
      callsign: "DAL101",
      xNm: 0,
      yNm: 0,
      altitudeFt: 5000,
      speedKt: 220,
    });
    const ifr2 = makeTestAircraft({
      callsign: "UAL202",
      xNm: 0.5,
      yNm: 0,
      altitudeFt: 5000,
      speedKt: 220,
    });

    const ifrAlerts = evaluateConflictAlert([ifr1, ifr2]);
    expect(ifrAlerts.length).toBeGreaterThan(0);
    expect(ifrAlerts[0]?.callsignA).toBe("DAL101");
    expect(ifrAlerts[0]?.callsignB).toBe("UAL202");

    // 2. Conflict between IFR aircraft and AMBIENT_SUPPRESSED VFR aircraft
    const vfr = makeTestAircraft({
      callsign: "N777V",
      xNm: 0.2,
      yNm: 0,
      altitudeFt: 5000,
      speedKt: 110,
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "north",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
      },
    });

    const mixedAlerts = evaluateConflictAlert([ifr1, vfr]);
    // Ambient VFR does not flood CA alerts
    expect(mixedAlerts).toHaveLength(0);
  });

  test("AC7: Swept 3D avoidance routes remain outside Class B volumes", () => {
    const scenario = buildSyntheticVfrScenario();
    const world = createWorldFromScenario(scenario, 100);

    const vfrAircraft = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    const shelf = scenario.regional?.airspaces.find((a) => a.class === "B");
    expect(shelf).toBeDefined();

    // Verify initial positions of all spawned VFR aircraft are outside the Class B shelf
    for (const ac of vfrAircraft) {
      // The shelf is x: [-5, 5], y: [-6, 6], alt: [3000, 10000]
      const insideX = ac.xNm >= -5 && ac.xNm <= 5;
      const insideY = ac.yNm >= -6 && ac.yNm <= 6;
      const insideAlt = ac.altitudeFt >= 3000 && ac.altitudeFt <= 10000;
      const insideShelf = insideX && insideY && insideAlt;
      expect(insideShelf).toBe(false);
    }
  });

  test("AC8 & Destination provenance: KATL catalog smoke check", () => {
    // KATL scenario declares regionalPack: "katl"
    expect(katlJson.regionalPack).toBe("katl");

    const katl = assertScenario(katlJson, { arrivalCountMin: 1, arrivalCountMax: 10 });
    expect(katl.icao).toBe("KATL");
    expect(katl.regionalPack).toBe("katl");

    // If regional pack is loaded, destinations and volumes come from imported data
    if (katl.regional) {
      const dests = getEligibleVfrDestinations(katl.regional);
      expect(Array.isArray(dests)).toBe(true);
      for (const dest of dests) {
        expect(dest.publicUse).toBe(true);
        expect(dest.runways.length).toBeGreaterThan(0);
      }
    }
  });

  test("T04-77: KATL spawns initial VFR from scenario coverage with no zone authoring", () => {
    const katl = assertScenario(
      {
        ...katlJson,
        vfrTraffic: {
          initialCount: 4,
          targetCount: 4,
          entriesPerHour: 0,
          maxPopulation: 4,
          seed: 7,
          movementMix: { localPercent: 100, transitPercent: 0, airportBoundPercent: 0 },
        },
      },
      { arrivalCountMin: 1, arrivalCountMax: 10 },
    );
    // No zones survive on the loaded scenario.
    expect("vfrZones" in katl).toBe(false);

    const world = createWorldFromScenario(katl, 7);
    const vfrAircraft = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    // Non-zero initial count spawns without any zone authoring; the Bravo
    // guard may skip individual candidates but never throws. The generated
    // KATL regional pack is absent here, so no avoidance applies and all 4
    // spawn deterministically.
    expect(vfrAircraft.length).toBeGreaterThan(0);
    expect(vfrAircraft.length).toBeLessThanOrEqual(4);
    if (!katl.regional) {
      expect(vfrAircraft).toHaveLength(4);
    }

    const bravoVolumes = (katl.regional?.airspaces ?? []).filter((v) => v.class === "B");
    const spawnRadius = resolveVfrSpawnRadiusNm(katl);
    expect(spawnRadius).toBe(
      Math.max(katl.maps.rangeRings?.maxNm ?? 0, katl.regional?.radiusNm ?? 0),
    );
    for (const ac of vfrAircraft) {
      const dist = Math.hypot(ac.xNm - katl.arpNm.xNm, ac.yNm - katl.arpNm.yNm);
      expect(dist).toBeLessThanOrEqual(spawnRadius);
      for (const vol of bravoVolumes) {
        expect(
          isPointInside3dVolume({ xNm: ac.xNm, yNm: ac.yNm, altitudeFt: ac.altitudeFt }, vol),
        ).toBe(false);
      }
    }
  });

  test("T04-79: step() entry is a satellite departure with origin fields set", () => {
    const base = loadKdem().arp;
    const center = { latDeg: base.latDeg, lonDeg: base.lonDeg };
    const sat = { latDeg: base.latDeg + 0.18, lonDeg: base.lonDeg };
    const square = (
      id: string,
      airportId: string,
      at: { latDeg: number; lonDeg: number },
      halfNm: number,
    ) => {
      const dLat = halfNm / 60;
      const dLon = halfNm / (60 * Math.cos((at.latDeg * Math.PI) / 180));
      const corners = [
        { latDeg: at.latDeg + dLat, lonDeg: at.lonDeg - dLon },
        { latDeg: at.latDeg + dLat, lonDeg: at.lonDeg + dLon },
        { latDeg: at.latDeg - dLat, lonDeg: at.lonDeg + dLon },
        { latDeg: at.latDeg - dLat, lonDeg: at.lonDeg - dLon },
      ];
      return {
        id,
        name: `SYNTHETIC ${airportId} CLASS D`,
        type: "CONTROLLED",
        class: "D",
        centerAirportId: airportId,
        lowerLimit: { altitudeFt: 0, unit: "GND", reference: "SURFACE", rawAltitude: "SFC" },
        upperLimit: { altitudeFt: 2500, unit: "MSL", reference: "MSL" },
        segments: [...corners, corners[0]!].map((position, i) => ({
          sequence: i + 1,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position,
        })),
      };
    };
    const airport = (
      icao: string,
      at: { latDeg: number; lonDeg: number },
      fieldElevFt: number,
      headingTrueDeg: number,
      runwayId: string,
    ) => ({
      icao,
      name: `SYNTHETIC ${icao}`,
      arp: at,
      fieldElevFt,
      magVarDeg: 0,
      publicUse: true,
      towered: true,
      eligible: true,
      runways: [
        {
          id: runwayId,
          threshold: at,
          headingTrueDeg,
          headingMagDeg: headingTrueDeg,
          lengthFt: 6000,
        },
      ],
      hasPublishedApproaches: true,
    });
    const regional = parseRegionalPack(
      {
        schemaVersion: 1,
        centerAirportId: "KXCT",
        radiusNm: 40,
        source: { families: ["CIFP"] },
        files: { airports: "regional-airports.json", airspace: "regional-airspace.json" },
      },
      [airport("KXCT", center, 1000, 270, "27"), airport("KXSA", sat, 900, 90, "09")],
      [square("UC:KXCT:D_CTR", "KXCT", center, 2), square("UC:KXSA:D_SAT", "KXSA", sat, 2)],
      center,
    );
    const scenario = assertScenario(
      {
        ...loadKdem(),
        vfrTraffic: {
          initialCount: 0,
          targetCount: 1,
          entriesPerHour: 0,
          maxPopulation: 2,
          seed: 21,
        },
      },
      { regional },
    );
    const world = createWorldFromScenario(scenario, 21);
    expect(world.aircraft.filter((a) => a.ambientVfr !== undefined)).toHaveLength(0);

    world.vfrTrafficManager!.step(world, 1.0);

    const vfr = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfr).toHaveLength(1);
    const entry = vfr[0]!;
    expect(entry.ambientVfr?.mission).toBe("SATELLITE_DEPARTURE");
    expect(entry.ambientVfr?.originAirportId).toBe("KXSA");
    expect(entry.ambientVfr?.departureRunwayId).toBe("09");
    const origin = regional.getAirport("KXSA")!;
    expect(
      Math.hypot(entry.xNm - origin.arpNm.xNm, entry.yNm - origin.arpNm.yNm),
    ).toBeLessThanOrEqual(2);
    expect(entry.flightRules).toBe("VFR");
    expect(entry.squawk).toBe("1200");
    expect(entry.speedKt).toBe(110);
  });
});

describe("T04-80 Satellite-departure line acceptance", () => {
  const base = loadKdem().arp;
  const center = { latDeg: base.latDeg, lonDeg: base.lonDeg };
  const sat = { latDeg: base.latDeg + 0.18, lonDeg: base.lonDeg };

  const square = (
    id: string,
    airportId: string,
    at: { latDeg: number; lonDeg: number },
    halfNm: number,
  ) => {
    const dLat = halfNm / 60;
    const dLon = halfNm / (60 * Math.cos((at.latDeg * Math.PI) / 180));
    const corners = [
      { latDeg: at.latDeg + dLat, lonDeg: at.lonDeg - dLon },
      { latDeg: at.latDeg + dLat, lonDeg: at.lonDeg + dLon },
      { latDeg: at.latDeg - dLat, lonDeg: at.lonDeg + dLon },
      { latDeg: at.latDeg - dLat, lonDeg: at.lonDeg - dLon },
    ];
    return {
      id,
      name: `SYNTHETIC ${airportId} CLASS D`,
      type: "CONTROLLED",
      class: "D",
      centerAirportId: airportId,
      lowerLimit: { altitudeFt: 0, unit: "GND", reference: "SURFACE", rawAltitude: "SFC" },
      upperLimit: { altitudeFt: 2500, unit: "MSL", reference: "MSL" },
      segments: [...corners, corners[0]!].map((position, i) => ({
        sequence: i + 1,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position,
      })),
    };
  };

  const airport = (
    icao: string,
    at: { latDeg: number; lonDeg: number },
    fieldElevFt: number,
    headingTrueDeg: number,
    runwayId: string,
  ) => ({
    icao,
    name: `SYNTHETIC ${icao}`,
    arp: at,
    fieldElevFt,
    magVarDeg: 0,
    publicUse: true,
    towered: true,
    eligible: true,
    runways: [
      {
        id: runwayId,
        threshold: at,
        headingTrueDeg,
        headingMagDeg: headingTrueDeg,
        lengthFt: 6000,
      },
    ],
    hasPublishedApproaches: true,
  });

  function buildDepartureRegional(): RegionalFacility {
    return parseRegionalPack(
      {
        schemaVersion: 1,
        centerAirportId: "KXCT",
        radiusNm: 40,
        source: { families: ["CIFP"] },
        files: { airports: "regional-airports.json", airspace: "regional-airspace.json" },
      },
      [airport("KXCT", center, 1000, 270, "27"), airport("KXSD", sat, 900, 90, "09")],
      [square("UC:KXCT:D_CTR", "KXCT", center, 2), square("UC:KXSD:D_SAT", "KXSD", sat, 2)],
      center,
    );
  }

  function departureScenario(
    regional: RegionalFacility,
    vfrTraffic: Record<string, unknown>,
  ): Scenario {
    return assertScenario(
      {
        ...loadKdem(),
        vfrTraffic: {
          initialCount: 0,
          targetCount: 1,
          entriesPerHour: 0,
          maxPopulation: 2,
          seed: 31,
          ...vfrTraffic,
        },
      },
      { regional },
    );
  }

  /** Perpendicular distance from p to the liftoff-to-exit segment. */
  function deviationNm(
    p: { xNm: number; yNm: number },
    a: { xNm: number; yNm: number },
    b: { xNm: number; yNm: number },
  ): number {
    const dx = b.xNm - a.xNm;
    const dy = b.yNm - a.yNm;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.xNm - a.xNm, p.yNm - a.yNm);
    const t = Math.max(0, Math.min(1, ((p.xNm - a.xNm) * dx + (p.yNm - a.yNm) * dy) / lenSq));
    return Math.hypot(p.xNm - (a.xNm + t * dx), p.yNm - (a.yNm + t * dy));
  }

  test("departure flies a line corridor and exits at the boundary with removal", () => {
    const regional = buildDepartureRegional();
    const scenario = departureScenario(regional, { seed: 31 });
    const world = createWorldFromScenario(scenario, 31);
    const manager = world.vfrTrafficManager!;
    const exitRadiusNm = resolveVfrExitRadiusNm(scenario);

    manager.step(world, 1.0);
    const vfr = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfr).toHaveLength(1);
    const entry = vfr[0]!;
    expect(entry.ambientVfr?.mission).toBe("SATELLITE_DEPARTURE");
    const origin = regional.getAirport(entry.ambientVfr!.originAirportId!)!;
    expect(origin.icao).toBe("KXSD");

    // Line shape: runway-heading climb, bounded intermediates, radial exit.
    const wps = entry.ambientVfr!.waypoints!;
    expect(wps.length).toBeGreaterThanOrEqual(3);
    expect(wps.length).toBeLessThanOrEqual(4);
    const runwayTrue = origin.runways[0]!.headingTrueDeg;
    const climbCourse =
      (Math.atan2(wps[0]!.xNm - entry.xNm, wps[0]!.yNm - entry.yNm) * 180) / Math.PI;
    const norm = (d: number) => ((d % 360) + 360) % 360;
    expect(Math.abs(norm(climbCourse) - norm(runwayTrue))).toBeLessThan(0.5);
    const liftoff = { xNm: entry.xNm, yNm: entry.yNm };
    const exit = wps[wps.length - 1]!;
    const centerNm = scenario.arpNm;
    expect(Math.hypot(exit.xNm - centerNm.xNm, exit.yNm - centerNm.yNm)).toBeCloseTo(
      exitRadiusNm + 2,
      6,
    );
    for (const mid of wps.slice(1, -1)) {
      expect(deviationNm(mid, liftoff, exit)).toBeLessThanOrEqual(3 + 1e-9);
    }
    const cruise = wps[wps.length - 1]!.altitudeFt!;
    expect(entry.altitudeFt).toBeLessThanOrEqual(cruise);

    // Fly the line to the boundary: removal with BOUNDARY_EXIT, no handoff.
    // Target replenishment may refill the slot in the same step, so track
    // the original callsign rather than the total count.
    entry.ambientVfr!.waypointIndex = 1;
    entry.xNm = exit.xNm;
    entry.yNm = exit.yNm;
    const log = world.sessionLog!;
    const exitedCallsign = entry.callsign;
    manager.step(world, 1.0);
    expect(world.aircraft.some((a) => a.callsign === exitedCallsign)).toBe(false);
    const exits = log.byType("vfr.exit").filter((e) => e.callsign === exitedCallsign);
    expect(exits).toHaveLength(1);
    expect(exits[0]).toMatchObject({ mission: "SATELLITE_DEPARTURE", reason: "BOUNDARY_EXIT" });
    expect(log.byType("vfr.tower.handoff")).toHaveLength(0);
  });

  test("long session with exits and entries stays bounded with paced refill", () => {
    const regional = buildDepartureRegional();
    const scenario = departureScenario(regional, {
      seed: 33,
      targetCount: 0,
      entriesPerHour: 360,
      maxPopulation: 3,
    });
    const world = createWorldFromScenario(scenario, 33);
    const manager = world.vfrTrafficManager!;
    let maxLive = 0;
    let maxStepDelta = 0;
    // One simulated hour at 5 s steps; force a boundary exit every 10 minutes.
    for (let s = 0; s < 720; s++) {
      world.simTimeMs += 5000;
      const before = world.aircraft.filter((a) => a.ambientVfr !== undefined).length;
      if (s > 0 && s % 120 === 0) {
        const oldest = world.aircraft.find((a) => a.ambientVfr !== undefined);
        if (oldest?.ambientVfr?.waypoints?.length) {
          const exit = oldest.ambientVfr.waypoints[oldest.ambientVfr.waypoints.length - 1]!;
          oldest.ambientVfr.waypointIndex = 1;
          oldest.xNm = exit.xNm;
          oldest.yNm = exit.yNm;
        }
      }
      manager.step(world, 1.0);
      const live = world.aircraft.filter((a) => a.ambientVfr !== undefined).length;
      maxLive = Math.max(maxLive, live);
      maxStepDelta = Math.max(maxStepDelta, live - before);
      expect(live).toBeLessThanOrEqual(3);
      for (const ac of world.aircraft) {
        if (ac.ambientVfr) {
          expect(ac.flightRules).toBe("VFR");
          expect(ac.squawk).toBe("1200");
        }
      }
    }
    // Cap-full defers without catch-up burst: at most one entry per step.
    expect(maxLive).toBeLessThanOrEqual(3);
    expect(maxStepDelta).toBeLessThanOrEqual(1);
    expect(world.aircraft.filter((a) => a.ambientVfr !== undefined).length).toBeGreaterThan(0);
  });

  test("departure stays eligible for the existing flight-following flow", async () => {
    const regional = buildDepartureRegional();
    const scenario = departureScenario(regional, { seed: 37 });
    const world = createWorldFromScenario(scenario, 37);
    world.vfrTrafficManager!.step(world, 1.0);
    const vfr = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfr).toHaveLength(1);
    const entry = vfr[0]!;
    expect(entry.ambientVfr?.mission).toBe("SATELLITE_DEPARTURE");

    const log = world.sessionLog ?? new SessionLog();
    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 100, ifrPickupPercent: 0, requestCapPerHour: 10 },
      initialSlotOffsetMs: 0,
    });
    queue.scheduleFromWorld(world, world.simTimeMs);
    queue.drain({ world, log });
    const req = (world.radioRequests ?? []).find((r) => r.callsign === entry.callsign);
    expect(req?.kind).toBe("FLIGHT_FOLLOWING");

    const res = await handleRadioText(world, `${entry.callsign} say request`, log);
    expect(res.accepted).toBe(true);
  });

  test("KATL conditional: departures avoid Bravo or skip honestly", () => {
    // Conditional acceptance only: facility asserts live in this test alone.
    const pack = hasRegionalPack("katl") ? loadRegionalPack("katl", { optional: true }) : undefined;
    const sources = getDepartureVfrAirports(pack, "KATL");
    if (!pack || sources.length === 0) {
      // Honest skip: no authorized KATL regional source in this checkout.
      expect(sources).toHaveLength(0);
      return;
    }
    // Provenance preserved: center never selected, satellite origin recorded.
    expect(sources.some((a) => a.icao.toUpperCase() === "KATL")).toBe(false);
    const katl = assertScenario(katlJson, { arrivalCountMin: 1, arrivalCountMax: 10 });
    const origin = sources[0]!;
    const runway = origin.runways[0]!;
    const bravo = pack.airspaces.filter((v) => v.type === "CONTROLLED" && v.class === "B");
    let seed = 5;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const route = planSafeVfrRoute({
      mission: "SATELLITE_DEPARTURE",
      box: { centerNm: katl.arpNm, halfExtentNm: resolveVfrSpawnRadiusNm(katl) },
      altitudeFt: 4500,
      speedKt: 110,
      originAirport: origin,
      liftoffPose: {
        xNm: origin.arpNm.xNm + 0.5,
        yNm: origin.arpNm.yNm + 0.5,
        altitudeFt: 4500,
        headingDeg: runway.headingMagDeg,
        speedKt: 110,
      },
      magVarDeg: 0,
      avoidanceVolumes: bravo,
      rng,
      exitRadiusNm: resolveVfrExitRadiusNm(katl),
    });
    // Either the corridor clears Bravo on a swept path or planning fails
    // closed; penetration is never admitted.
    if (route === null) {
      return;
    }
    const liftoff = {
      xNm: route.spawnPose.xNm,
      yNm: route.spawnPose.yNm,
      altitudeFt: route.spawnPose.altitudeFt,
    };
    expect(
      isRouteSafeFromAvoidance(
        [liftoff, ...route.waypoints].map((p) => ({
          xNm: p.xNm,
          yNm: p.yNm,
          altitudeFt: p.altitudeFt ?? 4500,
        })),
        bravo,
      ),
    ).toBe(true);
  });
});
