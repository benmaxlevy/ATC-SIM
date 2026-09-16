import { describe, expect, test } from "vitest";
import {
  defaultSessionSetup,
  defaultVfrRequestConfigForScenario,
  defaultVfrTrafficConfigForScenario,
  loadSessionSetup,
  parseSessionSetupStorage,
  resolveSessionSetup,
  saveSessionSetup,
  serializeSessionSetup,
  validateSessionSetup,
  vfrEnabledForScenario,
  type SessionSetup,
} from "../sessionSetup";
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
    vfrZones: [
      {
        id: "north",
        name: "North Zone",
        bounds: { minXNm: -15, maxXNm: -5, minYNm: 10, maxYNm: 20 },
      },
      {
        id: "south",
        name: "South Zone",
        bounds: { minXNm: 5, maxXNm: 15, minYNm: -20, maxYNm: -10 },
      },
    ],
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
    const context = { vfrZones: synthetic.vfrZones, regional: synthetic.regional };
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
        zones: [
          { id: "north", weight: 2 },
          { id: "south", weight: 1 },
        ],
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
    const context = { vfrZones: synthetic.vfrZones, regional: synthetic.regional };

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
            zones: [{ id: "north", weight: 1 }],
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
            zones: [{ id: "north", weight: 1 }],
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
    expect(defaultTraffic?.zones?.length).toBe(2);

    const defaultRequests = defaultVfrRequestConfigForScenario(synthetic);
    expect(defaultRequests).toBeDefined();
    expect(defaultRequests?.flightFollowingPercent).toBe(30);
    expect(defaultRequests?.ifrPickupPercent).toBe(20);
    expect(defaultRequests?.requestCapPerHour).toBe(6);
    expect(defaultRequests?.ifrCancellationPercent).toBe(25);
  });
});
