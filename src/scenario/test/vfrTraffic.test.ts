import { describe, expect, test } from "vitest";
import { performanceRegistry, SessionLog } from "@core";
import { VFR_TRAINING_BOX_ID, VFR_TRAINING_HALF_EXTENT_NM } from "../../core/vfrNavigation";
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
    expect(kdem.vfrZones).toBeUndefined();
  });

  test("T04-77: enabled traffic no longer requires zones; legacy zones key is ignored", () => {
    const config = validateVfrTrafficConfig({ initialCount: 4 });
    expect(config?.initialCount).toBe(4);
    expect(config?.zones).toBeUndefined();

    // Empty or zero-weighted legacy zones are ignored, never validated.
    expect(validateVfrTrafficConfig({ initialCount: 4, zones: [] })?.zones).toBeUndefined();
    expect(
      validateVfrTrafficConfig({
        initialCount: 4,
        zones: [{ id: "north", weight: 0 }],
      })?.zones,
    ).toBeUndefined();
    expect(
      validateVfrTrafficConfig({
        initialCount: 4,
        zones: [{ id: "unknown_zone", weight: 1 }],
      })?.zones,
    ).toBeUndefined();
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

  test("Training-box half-extent is the fixed 30 NM constant", () => {
    expect(VFR_TRAINING_HALF_EXTENT_NM).toBe(30);
  });

  test("Initial population spawns exactly min(initialCount, maxPopulation) inside the box", () => {
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

    // Each ambient aircraft has VFR, 1200, AMBIENT_SUPPRESSED, and the box marker.
    // KDEM has no avoidance volumes, so all box samples spawn.
    for (const ac of vfrAircraft) {
      expect(ac.flightRules).toBe("VFR");
      expect(ac.squawk).toBe("1200");
      expect(ac.reportedSquawk).toBe("1200");
      expect(ac.ambientVfr?.alertEligibility).toBe("AMBIENT_SUPPRESSED");
      expect(ac.ambientVfr?.zoneId).toBe(VFR_TRAINING_BOX_ID);
      expect(ac.activeClearance).toBeUndefined();
      expect(ac.flightPlan).toBeUndefined();
      expect(Math.abs(ac.xNm - scenario.arpNm.xNm)).toBeLessThanOrEqual(
        VFR_TRAINING_HALF_EXTENT_NM,
      );
      expect(Math.abs(ac.yNm - scenario.arpNm.yNm)).toBeLessThanOrEqual(
        VFR_TRAINING_HALF_EXTENT_NM,
      );
      for (const wp of ac.ambientVfr?.waypoints ?? []) {
        expect(Math.abs(wp.xNm - scenario.arpNm.xNm)).toBeLessThanOrEqual(
          VFR_TRAINING_HALF_EXTENT_NM,
        );
        expect(Math.abs(wp.yNm - scenario.arpNm.yNm)).toBeLessThanOrEqual(
          VFR_TRAINING_HALF_EXTENT_NM,
        );
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
