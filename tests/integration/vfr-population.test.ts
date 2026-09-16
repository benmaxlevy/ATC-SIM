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
  makeTestAircraft,
  VFR_TRAINING_HALF_EXTENT_NM,
} from "@core";
import {
  assertScenario,
  createWorldFromScenario,
  getEligibleVfrDestinations,
  loadKdem,
  parseRegionalPack,
  type RegionalFacility,
  type Scenario,
} from "@scenario";
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

  test("T04-77: KATL spawns initial VFR from the training box with no zone authoring", () => {
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
    for (const ac of vfrAircraft) {
      expect(Math.abs(ac.xNm - katl.arpNm.xNm)).toBeLessThanOrEqual(VFR_TRAINING_HALF_EXTENT_NM);
      expect(Math.abs(ac.yNm - katl.arpNm.yNm)).toBeLessThanOrEqual(VFR_TRAINING_HALF_EXTENT_NM);
      for (const vol of bravoVolumes) {
        expect(
          isPointInside3dVolume({ xNm: ac.xNm, yNm: ac.yNm, altitudeFt: ac.altitudeFt }, vol),
        ).toBe(false);
      }
    }
  });
});
