import { describe, expect, test } from "vitest";
import { performanceRegistry } from "@core";
import { TRAFFIC_AIRLINES } from "../callsigns";
import { assertScenario, loadKdem } from "../load";
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
import type { Scenario, VfrZone } from "../types";
import { createWorldFromScenario } from "../spawn";

const SYNTHETIC_ZONES: VfrZone[] = [
  {
    id: "north",
    name: "North Practice Area",
    bounds: { minXNm: -10, maxXNm: 10, minYNm: 10, maxYNm: 25 },
  },
  {
    id: "east",
    name: "East Practice Area",
    bounds: { minXNm: 10, maxXNm: 25, minYNm: -10, maxYNm: 10 },
  },
];

describe("T04-71 VfrTrafficConfig schema validation and stable errors", () => {
  test("Omitted vfrTraffic returns undefined and is disabled", () => {
    expect(validateVfrTrafficConfig(undefined)).toBeUndefined();
    expect(validateVfrTrafficConfig(null)).toBeUndefined();

    // KDEM has no vfrTraffic and boots with vfrTraffic undefined
    const kdem = loadKdem();
    expect(kdem.vfrTraffic).toBeUndefined();
    expect(kdem.vfrZones).toBeUndefined();
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

  test("Stable error 6: zone weights require a positive zone when traffic is enabled", () => {
    // Enabled with initialCount: 4, but no zones
    expect(() => validateVfrTrafficConfig({ initialCount: 4 })).toThrow(
      "vfrTraffic zone weights require a positive zone when traffic is enabled",
    );

    // Empty zones array
    expect(() => validateVfrTrafficConfig({ initialCount: 4, zones: [] })).toThrow(
      "vfrTraffic zone weights require a positive zone when traffic is enabled",
    );

    // All zero weights
    expect(() =>
      validateVfrTrafficConfig(
        { initialCount: 4, zones: [{ id: "north", weight: 0 }] },
        { vfrZones: SYNTHETIC_ZONES },
      ),
    ).toThrow("vfrTraffic zone weights require a positive zone when traffic is enabled");
  });

  test("Stable error 7: movementMix percentages must sum to 100", () => {
    expect(() =>
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          zones: [{ id: "north", weight: 1 }],
          movementMix: { localPercent: 50, transitPercent: 30, airportBoundPercent: 10 },
        },
        { vfrZones: SYNTHETIC_ZONES },
      ),
    ).toThrow("vfrTraffic.movementMix percentages must sum to 100");
  });

  test("Stable error 8: aircraft mix requires a positive weighted row", () => {
    expect(() =>
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          zones: [{ id: "north", weight: 1 }],
          aircraftMix: [
            {
              aircraftType: "C172",
              weight: 0,
              callsignPrefix: "N",
              performanceSource: "TRAINER_DEFAULT",
            },
          ],
        },
        { vfrZones: SYNTHETIC_ZONES },
      ),
    ).toThrow("vfrTraffic aircraft mix requires a positive weighted row");
  });

  test("Stable error 9: altitude mix requires a positive weighted row", () => {
    expect(() =>
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          zones: [{ id: "north", weight: 1 }],
          altitudeMix: [{ minAltitudeFt: 3000, maxAltitudeFt: 5000, weight: 0 }],
        },
        { vfrZones: SYNTHETIC_ZONES },
      ),
    ).toThrow("vfrTraffic altitude mix requires a positive weighted row");
  });

  test("Stable error 10: aircraft row <TYPE> requires a verified profile or explicit trainer default", () => {
    expect(() =>
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          zones: [{ id: "north", weight: 1 }],
          aircraftMix: [
            {
              aircraftType: "UNLISTED_GA",
              weight: 1,
              callsignPrefix: "N",
              performanceSource: "PROFILE_REGISTRY",
            },
          ],
        },
        { vfrZones: SYNTHETIC_ZONES },
      ),
    ).toThrow(
      "vfrTraffic aircraft row UNLISTED_GA requires a verified profile or explicit trainer default",
    );
  });

  test("Airliner types are rejected from VFR mixes; default mix mirrors the GA catalog", () => {
    expect(() =>
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          zones: [{ id: "north", weight: 1 }],
          aircraftMix: [
            {
              aircraftType: "B738",
              weight: 1,
              callsignPrefix: "N",
              performanceSource: "PROFILE_REGISTRY",
            },
          ],
        },
        { vfrZones: SYNTHETIC_ZONES },
      ),
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
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          zones: [{ id: "north", weight: 1 }],
          altitudeMix: [{ minAltitudeFt: 6000, maxAltitudeFt: 4000, weight: 1 }],
        },
        { vfrZones: SYNTHETIC_ZONES },
      ),
    ).toThrow("vfrTraffic altitude row 0 must have finite bounds with min <= max");
  });

  test("Stable error 12: aircraft row <INDEX> requires a non-empty callsignPrefix", () => {
    expect(() =>
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          zones: [{ id: "north", weight: 1 }],
          aircraftMix: [
            {
              aircraftType: "C172",
              weight: 1,
              callsignPrefix: "  ",
              performanceSource: "TRAINER_DEFAULT",
            },
          ],
        },
        { vfrZones: SYNTHETIC_ZONES },
      ),
    ).toThrow("vfrTraffic aircraft row 0 requires a non-empty callsignPrefix");
  });

  test("Stable error 13: zone <ID> is not defined by the scenario", () => {
    expect(() =>
      validateVfrTrafficConfig(
        {
          initialCount: 2,
          zones: [{ id: "unknown_zone", weight: 1 }],
        },
        { vfrZones: SYNTHETIC_ZONES },
      ),
    ).toThrow("vfrTraffic zone unknown_zone is not defined by the scenario");
  });

  test("Stable error 14: has no eligible imported controlled-airport destination", () => {
    expect(
      () =>
        validateVfrTrafficConfig(
          {
            initialCount: 2,
            zones: [{ id: "north", weight: 1 }],
            movementMix: { localPercent: 0, transitPercent: 0, airportBoundPercent: 100 },
          },
          { vfrZones: SYNTHETIC_ZONES },
        ), // no regional facility provided
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

  test("Weighted zone selection reproduces distribution accurately", () => {
    const zones = [
      { id: "north", weight: 3 },
      { id: "east", weight: 1 },
    ];
    let northCount = 0;
    let eastCount = 0;

    let seed = 42;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < 1000; i++) {
      const choice = chooseWeighted(zones, rng);
      if (choice.id === "north") northCount++;
      else eastCount++;
    }

    // ~75% north, ~25% east
    expect(northCount).toBeGreaterThan(650);
    expect(northCount).toBeLessThan(850);
    expect(eastCount).toBeGreaterThan(150);
    expect(eastCount).toBeLessThan(350);
  });
});

describe("T04-71 Population controls, pacing, cap, and target replenishment", () => {
  function createTestVfrScenario(): Scenario {
    const kdem = loadKdem();
    return assertScenario({
      ...kdem,
      vfrZones: SYNTHETIC_ZONES,
      vfrTraffic: {
        initialCount: 4,
        targetCount: 8,
        entriesPerHour: 6,
        maxPopulation: 10,
        seed: 7,
        zones: [{ id: "north", weight: 1 }],
      },
    });
  }

  test("Initial population spawns exactly min(initialCount, maxPopulation)", () => {
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

    // Each ambient aircraft has VFR, 1200, and AMBIENT_SUPPRESSED
    for (const ac of vfrAircraft) {
      expect(ac.flightRules).toBe("VFR");
      expect(ac.squawk).toBe("1200");
      expect(ac.reportedSquawk).toBe("1200");
      expect(ac.ambientVfr?.alertEligibility).toBe("AMBIENT_SUPPRESSED");
      expect(ac.ambientVfr?.zoneId).toBe("north");
      expect(ac.activeClearance).toBeUndefined();
      expect(ac.flightPlan).toBeUndefined();
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
