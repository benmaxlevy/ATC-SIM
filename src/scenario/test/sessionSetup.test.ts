import { describe, expect, test } from "vitest";
import {
  VFR_DENSITY_PRESETS,
  applyVfrDensityPreset,
  defaultSessionSetup,
  defaultVfrRequestConfigForScenario,
  defaultVfrTrafficConfigForScenario,
  loadSessionSetup,
  matchVfrDensityPreset,
  parseSessionSetupStorage,
  resolveSessionSetup,
  saveSessionSetup,
  serializeSessionSetup,
  validateSessionSetup,
  vfrDensityNumbersFromSetup,
  vfrEnabledForScenario,
  type SessionSetup,
  type VfrDensityNumbers,
} from "../sessionSetup";
import { fixedVfrMovementMix } from "../vfrTraffic";
import { assertScenario, loadKdem } from "../load";
import { parseRegionalPack, type RegionalFacility } from "../regional";
import type { Scenario } from "../types";

function memoryStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    get length() {
      return mem.size;
    },
    clear() {
      mem.clear();
    },
    getItem(key) {
      return mem.get(key) ?? null;
    },
    key(index) {
      return [...mem.keys()][index] ?? null;
    },
    removeItem(key) {
      mem.delete(key);
    },
    setItem(key, value) {
      mem.set(key, value);
    },
  };
}

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
    icao: "KPDK",
    name: "PEACHTREE DEKALB",
    arp: { latDeg: 33.87, lonDeg: -84.3 },
    fieldElevFt: 1000,
    magVarDeg: 0,
    publicUse: true,
    towered: true,
    eligible: true,
    runways: [
      {
        id: "21L",
        threshold: { latDeg: 33.87, lonDeg: -84.3 },
        headingTrueDeg: 210,
        headingMagDeg: 210,
        lengthFt: 6000,
      },
    ],
    hasPublishedApproaches: true,
  },
];

const SYNTHETIC_REGIONAL_AIRSPACE = [
  {
    id: "SYNTH_BRAVO",
    name: "SYNTHETIC BRAVO",
    type: "CONTROLLED",
    class: "B",
    centerAirportId: "KSYN",
    lowerLimit: { altitudeFt: 0, unit: "GND", reference: "SURFACE", rawAltitude: "SFC" },
    upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
    segments: [
      {
        sequence: 1,
        boundaryVia: "C",
        boundaryViaType: "CIRCLE",
        position: { latDeg: 33.0, lonDeg: -84.0 },
        arcOrigin: { latDeg: 33.0, lonDeg: -84.0 },
        arcDistanceNm: 5,
      },
    ],
  },
];

function buildSyntheticRegional(): RegionalFacility {
  return parseRegionalPack(
    SYNTHETIC_REGIONAL_MANIFEST,
    SYNTHETIC_REGIONAL_AIRPORTS,
    SYNTHETIC_REGIONAL_AIRSPACE,
    { latDeg: 33.0, lonDeg: -84.0 },
  );
}

function buildSyntheticScenario(): Scenario {
  const kdem = loadKdem();
  const regional = buildSyntheticRegional();
  return assertScenario({
    ...kdem,
    regional,
  });
}

describe("T04-76 SessionSetup VFR schema and persistence contract", () => {
  test("Legacy stored session without VFR fields continues loading with VFR disabled", () => {
    const legacyJson = JSON.stringify({
      version: 1,
      scenarioId: "kdem",
      arrivalCount: 6,
      arrivalsPerHour: 12,
      departuresPerHour: 0,
      seed: 1,
    });

    const parsed = parseSessionSetupStorage(legacyJson);
    expect(parsed).not.toBeNull();
    expect(parsed?.scenarioId).toBe("kdem");
    expect(parsed?.arrivalCount).toBe(6);
    expect(parsed?.arrivalsPerHour).toBe(12);
    expect(parsed?.departuresPerHour).toBe(0);
    expect(parsed?.seed).toBe(1);
    expect(parsed?.vfrTraffic).toBeUndefined();
    expect(parsed?.vfrRequests).toBeUndefined();
  });

  test("VFR settings round-trip through serialize and parse without mutating IFR settings", () => {
    const synthetic = buildSyntheticScenario();
    const context = { regional: synthetic.regional };
    const setup: SessionSetup = {
      scenarioId: "kdem",
      arrivalCount: 5,
      arrivalsPerHour: 15,
      departuresPerHour: 6,
      seed: 42,
      vfrTraffic: {
        initialCount: 3,
        targetCount: 4,
        entriesPerHour: 5,
        maxPopulation: 6,
        seed: 42,
        movementMix: { localPercent: 50, transitPercent: 30, airportBoundPercent: 20 },
      },
      vfrRequests: {
        flightFollowingPercent: 30,
        ifrPickupPercent: 20,
        requestCapPerHour: 4,
        ifrCancellationPercent: 25,
      },
    };

    const serialized = serializeSessionSetup(setup, context);
    const parsed = parseSessionSetupStorage(serialized, context);
    expect(parsed).not.toBeNull();
    expect(parsed?.scenarioId).toBe("kdem");
    expect(parsed?.arrivalCount).toBe(5);
    expect(parsed?.arrivalsPerHour).toBe(15);
    expect(parsed?.departuresPerHour).toBe(6);
    expect(parsed?.seed).toBe(42);

    expect(parsed?.vfrTraffic?.initialCount).toBe(3);
    expect(parsed?.vfrTraffic?.targetCount).toBe(4);
    expect(parsed?.vfrTraffic?.entriesPerHour).toBe(5);
    expect(parsed?.vfrTraffic?.maxPopulation).toBe(6);
    expect(parsed?.vfrTraffic?.movementMix?.localPercent).toBe(50);
    expect(parsed?.vfrTraffic?.movementMix?.transitPercent).toBe(30);
    expect(parsed?.vfrTraffic?.movementMix?.airportBoundPercent).toBe(20);

    expect(parsed?.vfrRequests?.flightFollowingPercent).toBe(30);
    expect(parsed?.vfrRequests?.ifrPickupPercent).toBe(20);
    expect(parsed?.vfrRequests?.requestCapPerHour).toBe(4);
    expect(parsed?.vfrRequests?.ifrCancellationPercent).toBe(25);

    const storage = memoryStorage();
    saveSessionSetup(storage, setup, context);
    const loaded = loadSessionSetup(storage, defaultSessionSetup(), context);
    expect(loaded.vfrTraffic?.initialCount).toBe(3);
    expect(loaded.vfrRequests?.flightFollowingPercent).toBe(30);
  });

  test("Reuses upstream validation and throws exact error strings", () => {
    const synthetic = buildSyntheticScenario();
    const context = { regional: synthetic.regional };

    // Request percentage sum > 100
    expect(() =>
      validateSessionSetup(
        {
          scenarioId: "kdem",
          arrivalCount: 4,
          arrivalsPerHour: 10,
          departuresPerHour: 0,
          seed: 1,
          vfrRequests: {
            flightFollowingPercent: 70,
            ifrPickupPercent: 40,
          },
        },
        context,
      ),
    ).toThrow("vfrRequests.flightFollowingPercent + vfrRequests.ifrPickupPercent must be <= 100");

    // Movement mix sum != 100
    expect(() =>
      validateSessionSetup(
        {
          scenarioId: "kdem",
          arrivalCount: 4,
          arrivalsPerHour: 10,
          departuresPerHour: 0,
          seed: 1,
          vfrTraffic: {
            initialCount: 2,
            targetCount: 2,
            entriesPerHour: 4,
            maxPopulation: 4,
            movementMix: { localPercent: 60, transitPercent: 20, airportBoundPercent: 10 },
          },
        },
        context,
      ),
    ).toThrow("vfrTraffic.movementMix percentages must sum to 100");

    // maxPopulation < targetCount
    expect(() =>
      validateSessionSetup(
        {
          scenarioId: "kdem",
          arrivalCount: 4,
          arrivalsPerHour: 10,
          departuresPerHour: 0,
          seed: 1,
          vfrTraffic: {
            initialCount: 2,
            targetCount: 5,
            entriesPerHour: 4,
            maxPopulation: 3,
          },
        },
        context,
      ),
    ).toThrow("vfrTraffic.maxPopulation must be >= initialCount and targetCount");
  });

  test("resolveSessionSetup respects query params while preserving VFR settings", () => {
    const base = defaultSessionSetup();
    const stored: SessionSetup = {
      ...base,
      vfrRequests: {
        flightFollowingPercent: 25,
        ifrPickupPercent: 25,
        requestCapPerHour: 2,
        ifrCancellationPercent: 50,
      },
    };

    // Setting seed via query preserves VFR settings
    const res = resolveSessionSetup("?seed=77", base, stored);
    expect(res.setup.seed).toBe(77);
    expect(res.setup.vfrRequests?.flightFollowingPercent).toBe(25);
    expect(res.trafficBenchmarkCount).toBeNull();

    // Benchmark query does not corrupt setup
    const bench = resolveSessionSetup("?traffic=30", base, stored);
    expect(bench.trafficBenchmarkCount).toBe(30);
    expect(bench.setup.vfrRequests?.flightFollowingPercent).toBe(25);
  });

  test("vfrEnabledForScenario identifies scenarios with regional capability", () => {
    const kdem = loadKdem();
    expect(vfrEnabledForScenario(kdem)).toBe(false);
    expect(defaultVfrTrafficConfigForScenario(kdem)).toBeUndefined();
    expect(defaultVfrRequestConfigForScenario(kdem)).toBeUndefined();

    const synthetic = buildSyntheticScenario();
    expect(vfrEnabledForScenario(synthetic)).toBe(true);
    const defaultTraffic = defaultVfrTrafficConfigForScenario(synthetic);
    expect(defaultTraffic).toBeDefined();
    expect(defaultTraffic?.initialCount).toBe(4);
    expect(defaultTraffic?.targetCount).toBe(4);
    expect(defaultTraffic?.entriesPerHour).toBe(6);
    expect(defaultTraffic?.maxPopulation).toBe(8);
    // T04-78: defaults carry no zone authoring; spawns use the training box.
    expect("zones" in (defaultTraffic ?? {})).toBe(false);

    const defaultRequests = defaultVfrRequestConfigForScenario(synthetic);
    expect(defaultRequests).toBeDefined();
    expect(defaultRequests?.flightFollowingPercent).toBe(30);
    expect(defaultRequests?.ifrPickupPercent).toBe(20);
    expect(defaultRequests?.requestCapPerHour).toBe(6);
    expect(defaultRequests?.ifrCancellationPercent).toBe(25);
  });
});

describe("T04-78 VFR density presets", () => {
  test("Preset map carries the exact trainer numbers", () => {
    expect(VFR_DENSITY_PRESETS.light).toEqual({
      initialCount: 2,
      targetCount: 2,
      entriesPerHour: 3,
      maxPopulation: 4,
      requestCapPerHour: 3,
      flightFollowingPercent: 20,
      ifrPickupPercent: 10,
      ifrCancellationPercent: 10,
    });
    expect(VFR_DENSITY_PRESETS.moderate).toEqual({
      initialCount: 4,
      targetCount: 4,
      entriesPerHour: 6,
      maxPopulation: 8,
      requestCapPerHour: 6,
      flightFollowingPercent: 30,
      ifrPickupPercent: 20,
      ifrCancellationPercent: 25,
    });
    expect(VFR_DENSITY_PRESETS.busy).toEqual({
      initialCount: 6,
      targetCount: 8,
      entriesPerHour: 12,
      maxPopulation: 12,
      requestCapPerHour: 10,
      flightFollowingPercent: 40,
      ifrPickupPercent: 30,
      ifrCancellationPercent: 25,
    });
  });

  test("Moderate preset equals the T04-76 scenario defaults", () => {
    const synthetic = buildSyntheticScenario();
    const traffic = defaultVfrTrafficConfigForScenario(synthetic);
    const requests = defaultVfrRequestConfigForScenario(synthetic);
    const moderate = VFR_DENSITY_PRESETS.moderate;
    expect(traffic?.initialCount).toBe(moderate.initialCount);
    expect(traffic?.targetCount).toBe(moderate.targetCount);
    expect(traffic?.entriesPerHour).toBe(moderate.entriesPerHour);
    expect(traffic?.maxPopulation).toBe(moderate.maxPopulation);
    expect(requests?.requestCapPerHour).toBe(moderate.requestCapPerHour);
    expect(requests?.flightFollowingPercent).toBe(moderate.flightFollowingPercent);
    expect(requests?.ifrPickupPercent).toBe(moderate.ifrPickupPercent);
    expect(requests?.ifrCancellationPercent).toBe(moderate.ifrCancellationPercent);
  });

  test("Preset application writes full numbers with the fixed mix; Off strips all VFR keys", () => {
    const synthetic = buildSyntheticScenario();
    for (const id of ["light", "moderate", "busy"] as const) {
      const applied = applyVfrDensityPreset(id, synthetic);
      const numbers = vfrDensityNumbersFromSetup({
        scenarioId: "kdem",
        arrivalCount: 4,
        arrivalsPerHour: 10,
        departuresPerHour: 0,
        seed: 1,
        ...applied,
      });
      expect(numbers).toEqual(VFR_DENSITY_PRESETS[id]);
      expect(applied.vfrTraffic?.movementMix).toEqual({
        localPercent: 60,
        transitPercent: 20,
        airportBoundPercent: 20,
      });
    }

    const off = applyVfrDensityPreset("off", synthetic);
    expect(off.vfrTraffic).toBeUndefined();
    expect(off.vfrRequests).toBeUndefined();
    expect(vfrDensityNumbersFromSetup({ ...defaultSessionSetup() })).toBeNull();
    expect(matchVfrDensityPreset(null)).toBe("off");
  });

  test("Custom derives only when numbers differ from every preset; never persisted", () => {
    expect(matchVfrDensityPreset(VFR_DENSITY_PRESETS.moderate)).toBe("moderate");
    const tuned: VfrDensityNumbers = { ...VFR_DENSITY_PRESETS.moderate, entriesPerHour: 7 };
    expect(matchVfrDensityPreset(tuned)).toBe("custom");
    expect(Object.keys(VFR_DENSITY_PRESETS)).toEqual(["light", "moderate", "busy"]);
  });

  test("Fixed mix folds airport-bound to local with no eligible destinations", () => {
    const synthetic = buildSyntheticScenario();
    expect(fixedVfrMovementMix(synthetic.regional)).toEqual({
      localPercent: 60,
      transitPercent: 20,
      airportBoundPercent: 20,
    });
    expect(fixedVfrMovementMix(undefined)).toEqual({
      localPercent: 80,
      transitPercent: 20,
      airportBoundPercent: 0,
    });
    const kdem = loadKdem();
    expect(defaultVfrTrafficConfigForScenario(kdem)).toBeUndefined();
    const folded = applyVfrDensityPreset("busy", kdem);
    expect(folded.vfrTraffic?.movementMix).toEqual({
      localPercent: 80,
      transitPercent: 20,
      airportBoundPercent: 0,
    });
  });

  test("Off persists no vfrTraffic/vfrRequests keys", () => {
    const setup: SessionSetup = {
      scenarioId: "kdem",
      arrivalCount: 6,
      arrivalsPerHour: 12,
      departuresPerHour: 0,
      seed: 1,
    };
    const serialized = serializeSessionSetup(setup);
    expect(serialized).not.toContain("vfrTraffic");
    expect(serialized).not.toContain("vfrRequests");
    const parsed = parseSessionSetupStorage(serialized);
    expect(parsed?.vfrTraffic).toBeUndefined();
    expect(parsed?.vfrRequests).toBeUndefined();
    expect(matchVfrDensityPreset(vfrDensityNumbersFromSetup(parsed!))).toBe("off");
  });

  test("Preset numbers round-trip and validate through the upstream schema", () => {
    const synthetic = buildSyntheticScenario();
    const context = { regional: synthetic.regional };
    const applied = applyVfrDensityPreset("busy", synthetic);
    const setup: SessionSetup = {
      scenarioId: "kdem",
      arrivalCount: 5,
      arrivalsPerHour: 15,
      departuresPerHour: 6,
      seed: 42,
      ...applied,
    };
    const validated = validateSessionSetup(setup, context);
    expect(matchVfrDensityPreset(vfrDensityNumbersFromSetup(validated))).toBe("busy");
    const parsed = parseSessionSetupStorage(serializeSessionSetup(setup, context), context);
    expect(matchVfrDensityPreset(vfrDensityNumbersFromSetup(parsed!))).toBe("busy");
    expect(parsed?.vfrTraffic?.movementMix).toEqual({
      localPercent: 60,
      transitPercent: 20,
      airportBoundPercent: 20,
    });
  });

  test("Legacy stored session loads VFR-disabled and derives Off", () => {
    const legacyJson = JSON.stringify({
      version: 1,
      scenarioId: "kdem",
      arrivalCount: 6,
      arrivalsPerHour: 12,
      departuresPerHour: 0,
      seed: 1,
    });
    const parsed = parseSessionSetupStorage(legacyJson);
    expect(parsed?.vfrTraffic).toBeUndefined();
    expect(parsed?.vfrRequests).toBeUndefined();
    expect(matchVfrDensityPreset(vfrDensityNumbersFromSetup(parsed!))).toBe("off");
  });
});
