import { describe, expect, test } from "vitest";
import { performanceRegistry, SessionLog } from "@core";
import {
  SATELLITE_LIFTOFF_RADIUS_NM,
  VFR_TRAINING_BOX_ID,
  VFR_TRAINING_HALF_EXTENT_NM,
} from "../../core/vfrNavigation";
import { trueToMagneticDeg } from "../../core/nav/headingFrames";
import { TRAFFIC_AIRLINES } from "../callsigns";
import { assertScenario, loadKdem } from "../load";
import { parseRegionalPack, type RegionalFacility } from "../regional";
import {
  VFR_FUTURE_ENTRY_XOR,
  VFR_INITIAL_PLACEMENT_XOR,
  VFR_MISSION_ZONE_XOR,
  VFR_ROUTE_XOR,
  VFR_PILOT_REQUEST_XOR,
  DEFAULT_VFR_AIRCRAFT_MIX,
  VfrTrafficManager,
  chooseWeighted,
  getDepartureVfrAirports,
  resolveVfrExitRadiusNm,
  resolveVfrSpawnRadiusNm,
  validateVfrTrafficConfig,
} from "../vfrTraffic";
import type { Scenario } from "../types";
import { createWorldFromScenario } from "../spawn";

describe("T04-71 VfrTrafficConfig schema validation and stable errors", () => {
  test("Omitted vfrTraffic returns undefined and is disabled", () => {
    expect(validateVfrTrafficConfig(undefined)).toBeUndefined();
    expect(validateVfrTrafficConfig(null)).toBeUndefined();

    // KDEM has no vfrTraffic and boots with vfrTraffic undefined
    const kdem = loadKdem();
    expect(kdem.vfrTraffic).toBeUndefined();
    expect("vfrZones" in kdem).toBe(false);
  });

  test("T04-78: named zones are deleted; legacy zones keys are ignored at runtime", () => {
    const config = validateVfrTrafficConfig({ initialCount: 4 });
    expect(config?.initialCount).toBe(4);
    expect("zones" in (config ?? {})).toBe(false);

    // Legacy zone authoring passes through validation ignored, never stored.
    const legacyKeys = { initialCount: 4, zones: [{ id: "north", weight: 1 }] };
    const validated = validateVfrTrafficConfig(legacyKeys as unknown as Record<string, unknown>);
    expect("zones" in (validated ?? {})).toBe(false);
  });

  test("Stable error 1: initialCount must be a non-negative integer", () => {
    expect(() => validateVfrTrafficConfig({ initialCount: -1 })).toThrow(
      "vfrTraffic.initialCount must be a non-negative integer",
    );
    expect(() => validateVfrTrafficConfig({ initialCount: 1.5 })).toThrow(
      "vfrTraffic.initialCount must be a non-negative integer",
    );
    expect(() => validateVfrTrafficConfig({ initialCount: "two" as unknown as number })).toThrow(
      "vfrTraffic.initialCount must be a non-negative integer",
    );
  });

  test("Stable error 2: targetCount must be a non-negative integer", () => {
    expect(() => validateVfrTrafficConfig({ targetCount: -2 })).toThrow(
      "vfrTraffic.targetCount must be a non-negative integer",
    );
    expect(() => validateVfrTrafficConfig({ targetCount: 3.14 })).toThrow(
      "vfrTraffic.targetCount must be a non-negative integer",
    );
  });

  test("Stable error 3: entriesPerHour must be a finite number >= 0", () => {
    expect(() => validateVfrTrafficConfig({ entriesPerHour: -0.5 })).toThrow(
      "vfrTraffic.entriesPerHour must be a finite number >= 0",
    );
    expect(() => validateVfrTrafficConfig({ entriesPerHour: Number.NaN })).toThrow(
      "vfrTraffic.entriesPerHour must be a finite number >= 0",
    );
    expect(() => validateVfrTrafficConfig({ entriesPerHour: Number.POSITIVE_INFINITY })).toThrow(
      "vfrTraffic.entriesPerHour must be a finite number >= 0",
    );
  });

  test("Stable error 4: maxPopulation must be a non-negative integer", () => {
    expect(() => validateVfrTrafficConfig({ maxPopulation: -5 })).toThrow(
      "vfrTraffic.maxPopulation must be a non-negative integer",
    );
    expect(() => validateVfrTrafficConfig({ maxPopulation: 4.2 })).toThrow(
      "vfrTraffic.maxPopulation must be a non-negative integer",
    );
  });

  test("Stable error 5: maxPopulation must be >= initialCount and targetCount", () => {
    expect(() =>
      validateVfrTrafficConfig({ initialCount: 5, targetCount: 2, maxPopulation: 4 }),
    ).toThrow("vfrTraffic.maxPopulation must be >= initialCount and targetCount");

    expect(() =>
      validateVfrTrafficConfig({ initialCount: 2, targetCount: 8, maxPopulation: 6 }),
    ).toThrow("vfrTraffic.maxPopulation must be >= initialCount and targetCount");
  });

  test("Stable error 7: movementMix percentages must sum to 100", () => {
    expect(() =>
      validateVfrTrafficConfig({
        initialCount: 2,
        movementMix: { localPercent: 50, transitPercent: 30, airportBoundPercent: 10 },
      }),
    ).toThrow("vfrTraffic.movementMix percentages must sum to 100");
  });

  test("Stable error 8: aircraft mix requires a positive weighted row", () => {
    expect(() =>
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          aircraftMix: [
            {
              aircraftType: "C172",
              weight: 0,
              callsignPrefix: "N",
              performanceSource: "TRAINER_DEFAULT",
            },
          ],
        },
        {},
      ),
    ).toThrow("vfrTraffic aircraft mix requires a positive weighted row");
  });

  test("Stable error 9: altitude mix requires a positive weighted row", () => {
    expect(() =>
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          altitudeMix: [{ minAltitudeFt: 3000, maxAltitudeFt: 5000, weight: 0 }],
        },
        {},
      ),
    ).toThrow("vfrTraffic altitude mix requires a positive weighted row");
  });

  test("Stable error 10: aircraft row <TYPE> requires a verified profile or explicit trainer default", () => {
    expect(() =>
      validateVfrTrafficConfig({
        initialCount: 2,
        aircraftMix: [
          {
            aircraftType: "UNLISTED_GA",
            weight: 1,
            callsignPrefix: "N",
            performanceSource: "PROFILE_REGISTRY",
          },
        ],
      }),
    ).toThrow(
      "vfrTraffic aircraft row UNLISTED_GA requires a verified profile or explicit trainer default",
    );
  });

  test("Airliner types are rejected from VFR mixes; default mix mirrors the GA catalog", () => {
    expect(() =>
      validateVfrTrafficConfig({
        initialCount: 2,
        aircraftMix: [
          {
            aircraftType: "B738",
            weight: 1,
            callsignPrefix: "N",
            performanceSource: "PROFILE_REGISTRY",
          },
        ],
      }),
    ).toThrow(
      "vfrTraffic aircraft row B738 requires a verified profile or explicit trainer default",
    );

    // Default fleet is derived from the JSON GA object, never hand-listed.
    const gaTypes = performanceRegistry.listGeneralAviationTypes();
    expect(gaTypes.length).toBeGreaterThan(0);
    expect(DEFAULT_VFR_AIRCRAFT_MIX.map((r) => r.aircraftType).sort()).toEqual(gaTypes);
    for (const row of DEFAULT_VFR_AIRCRAFT_MIX) {
      expect(row.performanceSource).toBe("PROFILE_REGISTRY");
      expect(row.callsignPrefix).toBe("N");
      expect(row.weight).toBe(1);
    }

    // IFR arrival airline fleets never intersect the GA catalog.
    const airlineTypes = new Set(
      TRAFFIC_AIRLINES.flatMap((a) => a.aircraftTypes.map((t) => t.toUpperCase())),
    );
    for (const ga of gaTypes) {
      expect(airlineTypes.has(ga)).toBe(false);
    }
  });

  test("Stable error 11: altitude row <INDEX> must have finite bounds with min <= max", () => {
    expect(() =>
      validateVfrTrafficConfig({
        initialCount: 2,
        altitudeMix: [{ minAltitudeFt: 6000, maxAltitudeFt: 4000, weight: 1 }],
      }),
    ).toThrow("vfrTraffic altitude row 0 must have finite bounds with min <= max");
  });

  test("Stable error 12: aircraft row <INDEX> requires a non-empty callsignPrefix", () => {
    expect(() =>
      validateVfrTrafficConfig({
        initialCount: 2,
        aircraftMix: [
          {
            aircraftType: "C172",
            weight: 1,
            callsignPrefix: "  ",
            performanceSource: "TRAINER_DEFAULT",
          },
        ],
      }),
    ).toThrow("vfrTraffic aircraft row 0 requires a non-empty callsignPrefix");
  });

  test("Stable error 14: has no eligible imported controlled-airport destination", () => {
    expect(() =>
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          movementMix: { localPercent: 0, transitPercent: 0, airportBoundPercent: 100 },
        },
        {}, // no regional facility provided
      ),
    ).toThrow("vfrTraffic has no eligible imported controlled-airport destination");
  });
});

describe("T04-71 Independent seeded streams and weighted selection", () => {
  test("Independent stream XOR seeds are unique", () => {
    const xors = new Set([
      VFR_INITIAL_PLACEMENT_XOR,
      VFR_MISSION_ZONE_XOR,
      VFR_ROUTE_XOR,
      VFR_FUTURE_ENTRY_XOR,
      VFR_PILOT_REQUEST_XOR,
    ]);
    expect(xors.size).toBe(5);
  });

  test("Weighted selection reproduces distribution accurately", () => {
    const rows = [
      { id: "heavy", weight: 3 },
      { id: "light", weight: 1 },
    ];
    let heavyCount = 0;
    let lightCount = 0;

    let seed = 42;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < 1000; i++) {
      const choice = chooseWeighted(rows, rng);
      if (choice.id === "heavy") heavyCount++;
      else lightCount++;
    }

    // ~75% heavy, ~25% light
    expect(heavyCount).toBeGreaterThan(650);
    expect(heavyCount).toBeLessThan(850);
    expect(lightCount).toBeGreaterThan(150);
    expect(lightCount).toBeLessThan(350);
  });
});

describe("T04-77 Training-box spawning, repeatability, and legacy IFR-stream identity", () => {
  function createTestVfrScenario(): Scenario {
    const kdem = loadKdem();
    return assertScenario({
      ...kdem,
      vfrTraffic: {
        initialCount: 4,
        targetCount: 8,
        entriesPerHour: 6,
        maxPopulation: 10,
        seed: 7,
      },
    });
  }

  function snapshotAircraft(world: ReturnType<typeof createWorldFromScenario>) {
    return world.aircraft.map((a) => ({
      callsign: a.callsign,
      xNm: a.xNm,
      yNm: a.yNm,
      headingDeg: a.headingDeg,
      altitudeFt: a.altitudeFt,
      speedKt: a.speedKt,
      flightRules: a.flightRules,
      ambientVfr: a.ambientVfr
        ? {
            mission: a.ambientVfr.mission,
            zoneId: a.ambientVfr.zoneId,
            waypoints: a.ambientVfr.waypoints,
          }
        : undefined,
    }));
  }

  test("Spawn radius follows scenario coverage with 30 NM fallback", () => {
    expect(VFR_TRAINING_HALF_EXTENT_NM).toBe(30);
    // KDEM declares rangeRings.maxNm = 60, so the whole 60 NM region is on the table.
    const scenario = createTestVfrScenario();
    const manager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 7,
    });
    expect(manager.trainingBox.halfExtentNm).toBe(60);
    expect(manager.exitRadiusNm).toBe(58);
    expect(resolveVfrSpawnRadiusNm(loadKdem())).toBe(60);
  });

  test("Scenario without coverage falls back to the 30 NM constant", () => {
    const bare = {
      ...loadKdem(),
      maps: { ...loadKdem().maps, rangeRings: undefined },
    } as unknown as Scenario;
    delete (bare as { regional?: unknown }).regional;
    expect(resolveVfrSpawnRadiusNm(bare)).toBe(VFR_TRAINING_HALF_EXTENT_NM);
    expect(resolveVfrExitRadiusNm(bare)).toBe(28);
  });

  test("100 NM scenario coverage puts the whole region on the table", () => {
    const kdem = loadKdem();
    const wide = {
      ...kdem,
      maps: { ...kdem.maps, rangeRings: { intervalNm: 10, maxNm: 100 } },
    } as unknown as Scenario;
    expect(resolveVfrSpawnRadiusNm(wide)).toBe(100);
    expect(resolveVfrExitRadiusNm(wide)).toBe(98);
    const manager = new VfrTrafficManager({
      config: { initialCount: 20, targetCount: 20, entriesPerHour: 0, maxPopulation: 20, seed: 7 },
      scenario: wide,
      seed: 7,
    });
    const world = createWorldFromScenario(loadKdem());
    manager.spawnInitialPopulation(world);
    const vfrAircraft = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfrAircraft.length).toBeGreaterThan(0);
    for (const ac of vfrAircraft) {
      const dist = Math.hypot(ac.xNm - wide.arpNm.xNm, ac.yNm - wide.arpNm.yNm);
      expect(dist).toBeLessThanOrEqual(100);
    }
  });

  test("Initial population spawns exactly min(initialCount, maxPopulation) inside the disc", () => {
    const scenario = createTestVfrScenario();
    const manager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 7,
    });

    const world = createWorldFromScenario(loadKdem());
    const ifrCount = world.aircraft.length;

    manager.spawnInitialPopulation(world);

    const vfrAircraft = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfrAircraft).toHaveLength(4);
    expect(world.aircraft).toHaveLength(ifrCount + 4);
    const spawnRadius = manager.trainingBox.halfExtentNm;

    // Each ambient aircraft has VFR, 1200, AMBIENT_SUPPRESSED, and the box marker.
    // KDEM has no avoidance volumes, so all disc samples spawn.
    for (const ac of vfrAircraft) {
      expect(ac.flightRules).toBe("VFR");
      expect(ac.squawk).toBe("1200");
      expect(ac.reportedSquawk).toBe("1200");
      expect(ac.ambientVfr?.alertEligibility).toBe("AMBIENT_SUPPRESSED");
      expect(ac.ambientVfr?.zoneId).toBe(VFR_TRAINING_BOX_ID);
      expect(ac.activeClearance).toBeUndefined();
      expect(ac.flightPlan).toBeUndefined();
      const dist = Math.hypot(ac.xNm - scenario.arpNm.xNm, ac.yNm - scenario.arpNm.yNm);
      expect(dist).toBeLessThanOrEqual(spawnRadius);
      for (const wp of ac.ambientVfr?.waypoints ?? []) {
        const wpDist = Math.hypot(wp.xNm - scenario.arpNm.xNm, wp.yNm - scenario.arpNm.yNm);
        // LOCAL waypoints stay in the disc; TRANSIT exit legs leave it by design.
        if (ac.ambientVfr?.mission === "LOCAL") {
          expect(wpDist).toBeLessThanOrEqual(spawnRadius);
        }
      }
    }
  });

  test("Same seed twice yields identical spawn poses and callsigns", () => {
    const first = createWorldFromScenario(createTestVfrScenario(), 7);
    const second = createWorldFromScenario(createTestVfrScenario(), 7);
    expect(snapshotAircraft(second)).toEqual(snapshotAircraft(first));
  });

  test("Legacy IFR schedule is identical with VFR enabled or disabled for a fixed seed", () => {
    const withoutVfr = createWorldFromScenario(loadKdem(), 7);
    const withVfr = createWorldFromScenario(createTestVfrScenario(), 7);

    const ifrOnly = (world: ReturnType<typeof createWorldFromScenario>) =>
      snapshotAircraft(world).filter((a) => a.ambientVfr === undefined);
    expect(ifrOnly(withVfr)).toEqual(ifrOnly(withoutVfr));
  });

  test("Planner failures emit vfr.spawn.skipped with NO_SAFE_ROUTE and never throw", () => {
    // Regional Class B disc covering the whole training box at VFR altitudes.
    const center = { latDeg: 33.6367, lonDeg: -84.4278638888889 };
    const regional: RegionalFacility = parseRegionalPack(
      {
        schemaVersion: 1,
        centerAirportId: "KATL",
        radiusNm: 60,
        source: { families: ["CIFP"] },
        files: { airports: "regional-airports.json", airspace: "regional-airspace.json" },
      },
      [
        {
          icao: "KATL",
          name: "Hartsfield-Jackson Atlanta Intl",
          arp: center,
          fieldElevFt: 1026,
          magVarDeg: -5,
          publicUse: true,
          towered: true,
          eligible: true,
          runways: [
            {
              id: "26R",
              threshold: center,
              headingTrueDeg: 270,
              headingMagDeg: 275,
              lengthFt: 8976,
            },
          ],
          hasPublishedApproaches: true,
        },
      ],
      [
        {
          id: "UC:KATL:B_BLANKET",
          name: "BLANKET BRAVO",
          type: "CONTROLLED",
          class: "B",
          centerAirportId: "KATL",
          lowerLimit: { altitudeFt: 0, unit: "GND", reference: "SURFACE", rawAltitude: "SFC" },
          upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
          segments: [
            {
              sequence: 1,
              boundaryVia: "C",
              boundaryViaType: "CIRCLE",
              position: center,
              arcOrigin: center,
              arcDistanceNm: 45,
            },
          ],
        },
      ],
      center,
    );
    const scenario = assertScenario(
      {
        ...loadKdem(),
        vfrTraffic: {
          initialCount: 2,
          targetCount: 0,
          entriesPerHour: 0,
          maxPopulation: 2,
          seed: 7,
        },
      },
      { regional },
    );
    const manager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 7,
    });
    const world = createWorldFromScenario(loadKdem());
    const log = new SessionLog();
    world.sessionLog = log;

    expect(() => manager.spawnInitialPopulation(world)).not.toThrow();
    expect(world.aircraft.filter((a) => a.ambientVfr !== undefined)).toHaveLength(0);
    const skips = log.byType("vfr.spawn.skipped");
    expect(skips).toHaveLength(2);
    for (const skip of skips) {
      expect(skip.reason).toBe("NO_SAFE_ROUTE");
    }
  });

  test("Target count lowered below live population never deletes aircraft", () => {
    const scenario = createTestVfrScenario();
    const manager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 7,
    });

    const world = createWorldFromScenario(loadKdem());
    manager.spawnInitialPopulation(world);
    expect(world.aircraft.filter((a) => a.ambientVfr !== undefined)).toHaveLength(4);

    // Lower targetCount to 1 (below live count 4)
    (manager.config as { targetCount: number }).targetCount = 1;

    // Step world: no aircraft are deleted merely because targetCount was lowered
    manager.step(world, 1.0);
    expect(world.aircraft.filter((a) => a.ambientVfr !== undefined)).toHaveLength(4);
  });

  test("Entries are deferred when maxPopulation is reached, with no catch-up burst", () => {
    const scenario = createTestVfrScenario();
    const manager = new VfrTrafficManager({
      config: {
        ...scenario.vfrTraffic!,
        initialCount: 2,
        maxPopulation: 2, // hard cap reached immediately
        entriesPerHour: 120, // entry every ~30 seconds
      },
      scenario,
      seed: 7,
    });

    const world = createWorldFromScenario(loadKdem());
    manager.spawnInitialPopulation(world);
    expect(world.aircraft.filter((a) => a.ambientVfr !== undefined)).toHaveLength(2);

    // Advance world by 1 hour (3600 seconds) in 1-second steps
    // Population cap must never be exceeded, and entries must remain deferred without bursting
    for (let s = 0; s < 60; s++) {
      world.simTimeMs += 1000;
      manager.step(world, 1.0);
      expect(world.aircraft.filter((a) => a.ambientVfr !== undefined).length).toBeLessThanOrEqual(
        2,
      );
    }
  });
});

describe("T04-79 Satellite-origin continuous VFR entries", () => {
  const CENTER_ICAO = "KXCT";
  const SAT_A_ICAO = "KXSA";
  const SAT_B_ICAO = "KXSB";

  function airportRaw(
    icao: string,
    latLon: { latDeg: number; lonDeg: number },
    fieldElevFt: number,
    headingTrueDeg: number,
    runwayId: string,
  ) {
    return {
      icao,
      name: `SYNTHETIC ${icao}`,
      arp: latLon,
      fieldElevFt,
      magVarDeg: 0,
      publicUse: true,
      towered: true,
      eligible: true,
      runways: [
        {
          id: runwayId,
          threshold: latLon,
          headingTrueDeg,
          headingMagDeg: headingTrueDeg,
          lengthFt: 6000,
        },
      ],
      hasPublishedApproaches: true,
    };
  }

  function controlledSquareRaw(
    id: string,
    centerIcao: string,
    center: { latDeg: number; lonDeg: number },
    halfNm: number,
  ) {
    const dLat = halfNm / 60;
    const dLon = halfNm / (60 * Math.cos((center.latDeg * Math.PI) / 180));
    const corners = [
      { latDeg: center.latDeg + dLat, lonDeg: center.lonDeg - dLon },
      { latDeg: center.latDeg + dLat, lonDeg: center.lonDeg + dLon },
      { latDeg: center.latDeg - dLat, lonDeg: center.lonDeg + dLon },
      { latDeg: center.latDeg - dLat, lonDeg: center.lonDeg - dLon },
    ];
    return {
      id,
      name: `SYNTHETIC ${centerIcao} CLASS D`,
      type: "CONTROLLED",
      class: "D",
      centerAirportId: centerIcao,
      lowerLimit: { altitudeFt: 0, unit: "GND", reference: "SURFACE", rawAltitude: "SFC" },
      upperLimit: { altitudeFt: 2500, unit: "MSL", reference: "MSL" },
      segments: [...corners, corners[0]!].map((position, i) => ({
        sequence: i + 1,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position,
      })),
    };
  }

  function satelliteAirports() {
    const base = loadKdem().arp;
    const center = { latDeg: base.latDeg, lonDeg: base.lonDeg };
    const satA = { latDeg: base.latDeg + 0.18, lonDeg: base.lonDeg };
    const satB = { latDeg: base.latDeg - 0.15, lonDeg: base.lonDeg + 0.12 };
    return { center, satA, satB };
  }

  function regionalManifest() {
    return {
      schemaVersion: 1,
      centerAirportId: CENTER_ICAO,
      radiusNm: 40,
      source: { families: ["CIFP"] },
      files: { airports: "regional-airports.json", airspace: "regional-airspace.json" },
    };
  }

  function twoSatelliteAirports() {
    const { center, satA, satB } = satelliteAirports();
    return [
      airportRaw(CENTER_ICAO, center, 1000, 270, "27"),
      airportRaw(SAT_A_ICAO, satA, 900, 90, "09"),
      airportRaw(SAT_B_ICAO, satB, 750, 180, "18"),
    ];
  }

  function buildTwoSatelliteRegional(): RegionalFacility {
    const { center, satA, satB } = satelliteAirports();
    return parseRegionalPack(
      regionalManifest(),
      twoSatelliteAirports(),
      [
        controlledSquareRaw("UC:KXCT:D_CTR", CENTER_ICAO, center, 2),
        controlledSquareRaw("UC:KXSA:D_SATA", SAT_A_ICAO, satA, 2),
        controlledSquareRaw("UC:KXSB:D_SATB", SAT_B_ICAO, satB, 2),
      ],
      center,
    );
  }

  function buildNoAirspaceRegional(): RegionalFacility {
    const { center } = satelliteAirports();
    return parseRegionalPack(regionalManifest(), twoSatelliteAirports(), [], center);
  }

  function buildBlanketBravoRegional(): RegionalFacility {
    const { center, satA, satB } = satelliteAirports();
    return parseRegionalPack(
      regionalManifest(),
      twoSatelliteAirports(),
      [
        controlledSquareRaw("UC:KXCT:D_CTR", CENTER_ICAO, center, 2),
        controlledSquareRaw("UC:KXSA:D_SATA", SAT_A_ICAO, satA, 2),
        controlledSquareRaw("UC:KXSB:D_SATB", SAT_B_ICAO, satB, 2),
        {
          id: "UC:KXCT:B_BLANKET",
          name: "SYNTHETIC BLANKET BRAVO",
          type: "CONTROLLED",
          class: "B",
          centerAirportId: CENTER_ICAO,
          lowerLimit: { altitudeFt: 0, unit: "GND", reference: "SURFACE", rawAltitude: "SFC" },
          upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
          segments: [
            {
              sequence: 1,
              boundaryVia: "C",
              boundaryViaType: "CIRCLE",
              position: center,
              arcOrigin: center,
              arcDistanceNm: 45,
            },
          ],
        },
      ],
      center,
    );
  }

  function satelliteScenario(regional: RegionalFacility, vfrTraffic: unknown): Scenario {
    return assertScenario({ ...loadKdem(), vfrTraffic }, { regional });
  }

  function vfrSnapshot(world: ReturnType<typeof createWorldFromScenario>) {
    return world.aircraft
      .filter((a) => a.ambientVfr !== undefined)
      .map((a) => ({
        callsign: a.callsign,
        xNm: a.xNm,
        yNm: a.yNm,
        headingDeg: a.headingDeg,
        altitudeFt: a.altitudeFt,
        speedKt: a.speedKt,
        mission: a.ambientVfr?.mission,
        originAirportId: a.ambientVfr?.originAirportId,
        departureRunwayId: a.ambientVfr?.departureRunwayId,
        waypoints: a.ambientVfr?.waypoints,
      }));
  }

  test("Departure sources exclude the center airport case-insensitively", () => {
    const regional = buildTwoSatelliteRegional();
    expect(
      getDepartureVfrAirports(regional, CENTER_ICAO)
        .map((a) => a.icao)
        .sort(),
    ).toEqual([SAT_A_ICAO, SAT_B_ICAO]);
    expect(getDepartureVfrAirports(regional, CENTER_ICAO.toLowerCase()).map((a) => a.icao)).toEqual(
      getDepartureVfrAirports(regional, CENTER_ICAO).map((a) => a.icao),
    );
    // Falls back to regional.centerAirportId when centerIcao is omitted.
    expect(
      getDepartureVfrAirports(regional)
        .map((a) => a.icao)
        .sort(),
    ).toEqual([SAT_A_ICAO, SAT_B_ICAO]);
    // A non-center scenario ICAO still excludes the regional center.
    expect(
      getDepartureVfrAirports(regional, "KDEM")
        .map((a) => a.icao)
        .sort(),
    ).toEqual([SAT_A_ICAO, SAT_B_ICAO]);
    expect(getDepartureVfrAirports(undefined, CENTER_ICAO)).toEqual([]);
    expect(getDepartureVfrAirports(buildNoAirspaceRegional(), CENTER_ICAO)).toEqual([]);
  });

  test("Boot initial population stays disc-spawned with no origin fields", () => {
    const regional = buildTwoSatelliteRegional();
    const scenario = satelliteScenario(regional, {
      initialCount: 4,
      targetCount: 0,
      entriesPerHour: 0,
      maxPopulation: 4,
      seed: 7,
    });
    const world = createWorldFromScenario(scenario, 7);
    const vfr = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfr).toHaveLength(4);
    for (const ac of vfr) {
      expect(ac.ambientVfr?.mission).not.toBe("SATELLITE_DEPARTURE");
      expect(ac.ambientVfr?.originAirportId).toBeUndefined();
      expect(ac.ambientVfr?.departureRunwayId).toBeUndefined();
      expect(ac.flightRules).toBe("VFR");
      expect(ac.squawk).toBe("1200");
      expect(ac.ambientVfr?.alertEligibility).toBe("AMBIENT_SUPPRESSED");
    }
  });

  test("step() target replenishment spawns runway-aligned climbing satellite departures", () => {
    const regional = buildTwoSatelliteRegional();
    const scenario = satelliteScenario(regional, {
      initialCount: 0,
      targetCount: 3,
      entriesPerHour: 0,
      maxPopulation: 5,
      seed: 11,
      altitudeMix: [{ minAltitudeFt: 4000, maxAltitudeFt: 4000, weight: 1 }],
    });
    const manager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 11,
    });
    expect(manager.departureSources.map((a) => a.icao).sort()).toEqual([SAT_A_ICAO, SAT_B_ICAO]);

    const world = createWorldFromScenario(loadKdem());
    world.sessionLog = new SessionLog();
    manager.step(world, 1.0);
    manager.step(world, 1.0);
    manager.step(world, 1.0);

    const vfr = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfr).toHaveLength(3);
    for (const ac of vfr) {
      expect(ac.ambientVfr?.mission).toBe("SATELLITE_DEPARTURE");
      const originId = ac.ambientVfr?.originAirportId;
      expect([SAT_A_ICAO, SAT_B_ICAO]).toContain(originId);
      expect(originId).not.toBe(CENTER_ICAO);
      const origin = regional.getAirport(originId!);
      expect(origin).toBeDefined();
      expect(ac.ambientVfr?.departureRunwayId).toBe(origin!.runways[0]!.id);

      // Liftoff within 2 NM of the departure ARP.
      const distToArp = Math.hypot(ac.xNm - origin!.arpNm.xNm, ac.yNm - origin!.arpNm.yNm);
      expect(distToArp).toBeLessThanOrEqual(SATELLITE_LIFTOFF_RADIUS_NM + 1e-9);

      // Runway heading converted at the magnetic frame boundary; 110 kt baseline.
      const expectedHeading = Math.round(
        trueToMagneticDeg(origin!.runways[0]!.headingTrueDeg, world.navigation.magVarDeg),
      );
      expect(ac.headingDeg).toBe(expectedHeading);
      expect(ac.speedKt).toBe(110);

      // Airborne between field elevation + 500 ft and cruise, climbing via waypoint intent.
      expect(ac.altitudeFt).toBeGreaterThanOrEqual(origin!.fieldElevFt + 500);
      expect(ac.altitudeFt).toBeLessThanOrEqual(4000);
      expect(ac.ambientVfr?.waypoints?.length).toBeGreaterThan(0);
      const cruiseWp = ac.ambientVfr!.waypoints![ac.ambientVfr!.waypoints!.length - 1]!;
      expect(cruiseWp.altitudeFt).toBe(4000);
      expect(cruiseWp.altitudeFt).toBeGreaterThanOrEqual(ac.altitudeFt);

      expect(ac.flightRules).toBe("VFR");
      expect(ac.squawk).toBe("1200");
      expect(ac.reportedSquawk).toBe("1200");
      expect(ac.ambientVfr?.alertEligibility).toBe("AMBIENT_SUPPRESSED");
    }

    const spawned = world.sessionLog.byType("vfr.spawned");
    expect(spawned).toHaveLength(3);
    for (const event of spawned) {
      expect(event.mission).toBe("SATELLITE_DEPARTURE");
    }
  });

  test("step() scheduled entries use the satellite-departure path", () => {
    const regional = buildTwoSatelliteRegional();
    const scenario = satelliteScenario(regional, {
      initialCount: 0,
      targetCount: 0,
      entriesPerHour: 3600,
      maxPopulation: 3,
      seed: 13,
    });
    const manager = new VfrTrafficManager({
      config: scenario.vfrTraffic!,
      scenario,
      seed: 13,
    });
    const world = createWorldFromScenario(loadKdem());
    for (let s = 0; s < 5; s++) {
      world.simTimeMs += 1000;
      manager.step(world, 1.0);
    }
    const vfr = world.aircraft.filter((a) => a.ambientVfr !== undefined);
    expect(vfr.length).toBeGreaterThan(0);
    for (const ac of vfr) {
      expect(ac.ambientVfr?.mission).toBe("SATELLITE_DEPARTURE");
      expect(ac.ambientVfr?.originAirportId).toBeDefined();
      expect(ac.ambientVfr?.departureRunwayId).toBeDefined();
    }
  });

  test("Center airport is never selected; seeded replay is identical", () => {
    const regional = buildTwoSatelliteRegional();
    const origins = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      const scenario = satelliteScenario(regional, {
        initialCount: 0,
        targetCount: 1,
        entriesPerHour: 0,
        maxPopulation: 1,
        seed,
      });
      const manager = new VfrTrafficManager({ config: scenario.vfrTraffic!, scenario, seed });
      const world = createWorldFromScenario(loadKdem());
      manager.step(world, 1.0);
      const vfr = world.aircraft.filter((a) => a.ambientVfr !== undefined);
      expect(vfr).toHaveLength(1);
      origins.add(vfr[0]!.ambientVfr!.originAirportId!);
    }
    expect(origins.has(CENTER_ICAO)).toBe(false);
    expect([...origins].sort()).toEqual([SAT_A_ICAO, SAT_B_ICAO]);

    const runStepped = (seed: number) => {
      const scenario = satelliteScenario(regional, {
        initialCount: 0,
        targetCount: 2,
        entriesPerHour: 0,
        maxPopulation: 4,
        seed,
      });
      const manager = new VfrTrafficManager({ config: scenario.vfrTraffic!, scenario, seed });
      const world = createWorldFromScenario(loadKdem());
      for (let i = 0; i < 3; i++) {
        manager.step(world, 1.0);
      }
      return vfrSnapshot(world);
    };
    expect(runStepped(11)).toEqual(runStepped(11));
  });

  test("Legacy IFR schedule is identical with VFR enabled or disabled for a fixed seed", () => {
    const regional = buildTwoSatelliteRegional();
    const withoutVfr = createWorldFromScenario(loadKdem(), 7);
    const withVfrScenario = satelliteScenario(regional, {
      initialCount: 4,
      targetCount: 0,
      entriesPerHour: 0,
      maxPopulation: 4,
      seed: 7,
    });
    const withVfr = createWorldFromScenario(withVfrScenario, 7);
    const ifrOnly = (world: ReturnType<typeof createWorldFromScenario>) =>
      world.aircraft
        .filter((a) => a.ambientVfr === undefined)
        .map((a) => ({
          callsign: a.callsign,
          xNm: a.xNm,
          yNm: a.yNm,
          headingDeg: a.headingDeg,
          altitudeFt: a.altitudeFt,
          speedKt: a.speedKt,
        }));
    expect(ifrOnly(withVfr)).toEqual(ifrOnly(withoutVfr));
  });

  test("No regional data skips continuous entries with NO_DEPARTURE_AIRPORT", () => {
    const scenario = assertScenario({
      ...loadKdem(),
      vfrTraffic: {
        initialCount: 2,
        targetCount: 0,
        entriesPerHour: 60,
        maxPopulation: 5,
        seed: 11,
      },
    });
    const world = createWorldFromScenario(scenario, 11);
    // Boot initials are unchanged disc spawns.
    expect(world.aircraft.filter((a) => a.ambientVfr !== undefined)).toHaveLength(2);

    for (let s = 0; s < 600; s++) {
      world.simTimeMs += 1000;
      world.vfrTrafficManager!.step(world, 1.0);
    }

    // No continuous VFR appears; every scheduled attempt skips without throwing.
    expect(world.aircraft.filter((a) => a.ambientVfr !== undefined)).toHaveLength(2);
    const skips = world.sessionLog!.byType("vfr.spawn.skipped");
    expect(skips.length).toBeGreaterThan(0);
    for (const skip of skips) {
      expect(skip.reason).toBe("NO_DEPARTURE_AIRPORT");
    }
  });

  test("Empty source list skips with NO_DEPARTURE_AIRPORT and never mid-air spawns", () => {
    const regional = buildNoAirspaceRegional();
    const scenario = satelliteScenario(regional, {
      initialCount: 0,
      targetCount: 2,
      entriesPerHour: 0,
      maxPopulation: 4,
      seed: 5,
    });
    const manager = new VfrTrafficManager({ config: scenario.vfrTraffic!, scenario, seed: 5 });
    expect(manager.departureSources).toHaveLength(0);

    const world = createWorldFromScenario(loadKdem());
    const log = new SessionLog();
    world.sessionLog = log;
    manager.step(world, 1.0);
    manager.step(world, 1.0);

    expect(world.aircraft.filter((a) => a.ambientVfr !== undefined)).toHaveLength(0);
    const skips = log.byType("vfr.spawn.skipped");
    expect(skips).toHaveLength(2);
    for (const skip of skips) {
      expect(skip.reason).toBe("NO_DEPARTURE_AIRPORT");
    }
  });

  test("Liftoff inside Bravo exhausts to NO_SAFE_ROUTE without spawning or throwing", () => {
    const regional = buildBlanketBravoRegional();
    const scenario = satelliteScenario(regional, {
      initialCount: 0,
      targetCount: 1,
      entriesPerHour: 0,
      maxPopulation: 2,
      seed: 9,
    });
    const manager = new VfrTrafficManager({ config: scenario.vfrTraffic!, scenario, seed: 9 });
    expect(manager.departureSources.length).toBeGreaterThan(0);

    const world = createWorldFromScenario(loadKdem());
    const log = new SessionLog();
    world.sessionLog = log;
    expect(() => manager.step(world, 1.0)).not.toThrow();
    expect(world.aircraft.filter((a) => a.ambientVfr !== undefined)).toHaveLength(0);
    const skips = log.byType("vfr.spawn.skipped");
    expect(skips).toHaveLength(1);
    expect(skips[0]!.reason).toBe("NO_SAFE_ROUTE");
  });
});
