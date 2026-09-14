import { describe, expect, test } from "vitest";
import { makeTestAircraft } from "../aircraft";
import {
  AircraftPerformanceRegistry,
  DEFAULT_PROFILE,
  isAircraftProfileDataset,
  performanceRegistry,
} from "./registry";
import type { AircraftProfileDataset } from "./types";

const syntheticDefaults = {
  limits: { minControlledSpeedKt: 100, maxControlledSpeedKt: 340, serviceCeilingFt: 41000 },
  regimes: {
    initialClimb: {
      nominalClimbFpm: 2600,
      nominalDescentFpm: 0,
      maxBankDeg: 20,
      accelKtPerS: 1.5,
      decelKtPerS: 1.0,
    },
    climb: {
      nominalClimbFpm: 2000,
      nominalDescentFpm: 0,
      maxBankDeg: 25,
      accelKtPerS: 1.0,
      decelKtPerS: 0.8,
    },
    enroute: {
      nominalClimbFpm: 1000,
      nominalDescentFpm: 1800,
      maxBankDeg: 25,
      accelKtPerS: 0.8,
      decelKtPerS: 0.8,
    },
    arrival: {
      nominalClimbFpm: 0,
      nominalDescentFpm: 2200,
      maxBankDeg: 25,
      accelKtPerS: 0.8,
      decelKtPerS: 1.0,
    },
    approach: {
      nominalClimbFpm: 0,
      nominalDescentFpm: 1200,
      maxBankDeg: 25,
      accelKtPerS: 0.8,
      decelKtPerS: 1.2,
    },
    landing: {
      nominalClimbFpm: 0,
      nominalDescentFpm: 750,
      maxBankDeg: 15,
      accelKtPerS: 0.8,
      decelKtPerS: 3.8,
    },
    missedApproach: {
      nominalClimbFpm: 2200,
      nominalDescentFpm: 0,
      maxBankDeg: 20,
      accelKtPerS: 1.2,
      decelKtPerS: 1.0,
    },
  },
};

describe("AircraftPerformanceRegistry with unified dataset", () => {
  test("empty aircraft entry inherits 100% of defaults", () => {
    const registry = new AircraftPerformanceRegistry({
      defaults: syntheticDefaults,
      aircraft: { B738: {} },
    });

    const profile = registry.getProfile("B738");
    expect(profile.icaoType).toBe("B738");
    expect(profile.status).toBe("SUPPORTED");
    expect(profile.limits).toEqual({
      minControlledSpeedKt: 100,
      maxControlledSpeedKt: 340,
      serviceCeilingFt: 41000,
    });

    expect(profile.regimes?.initialClimb).toMatchObject({
      nominalClimbFpm: 2600,
      nominalDescentFpm: 0,
      maxBankDeg: 20,
      accelKtPerS: 1.5,
      decelKtPerS: 1.0,
    });
    expect(profile.regimes?.climb).toMatchObject({
      nominalClimbFpm: 2000,
      nominalDescentFpm: 0,
      maxBankDeg: 25,
      accelKtPerS: 1.0,
      decelKtPerS: 0.8,
    });
    expect(profile.regimes?.enroute).toMatchObject({
      nominalClimbFpm: 1000,
      nominalDescentFpm: 1800,
      maxBankDeg: 25,
      accelKtPerS: 0.8,
      decelKtPerS: 0.8,
    });
    expect(profile.regimes?.arrival).toMatchObject({
      nominalClimbFpm: 0,
      nominalDescentFpm: 2200,
      maxBankDeg: 25,
      accelKtPerS: 0.8,
      decelKtPerS: 1.0,
    });
    expect(profile.regimes?.approach).toMatchObject({
      nominalClimbFpm: 0,
      nominalDescentFpm: 1200,
      maxBankDeg: 25,
      accelKtPerS: 0.8,
      decelKtPerS: 1.2,
    });
    expect(profile.regimes?.landing).toMatchObject({
      nominalClimbFpm: 0,
      nominalDescentFpm: 750,
      maxBankDeg: 15,
      accelKtPerS: 0.8,
      decelKtPerS: 3.8,
    });
    expect(profile.regimes?.missedApproach).toMatchObject({
      nominalClimbFpm: 2200,
      nominalDescentFpm: 0,
      maxBankDeg: 20,
      accelKtPerS: 1.2,
      decelKtPerS: 1.0,
    });
  });

  test("partial aircraft entry overrides only specified fields", () => {
    const registry = new AircraftPerformanceRegistry({
      defaults: syntheticDefaults,
      aircraft: {
        B744: {
          limits: { maxControlledSpeedKt: 365 },
          regimes: {
            climb: { nominalClimbFpm: 1650 },
          },
        },
      },
    });

    const profile = registry.getProfile("B744");
    expect(profile.limits?.maxControlledSpeedKt).toBe(365);
    expect(profile.limits?.minControlledSpeedKt).toBe(100);
    expect(profile.limits?.serviceCeilingFt).toBe(41000);

    expect(profile.regimes?.climb.nominalClimbFpm).toBe(1650);
    expect(profile.regimes?.climb.maxBankDeg).toBe(25);
    expect(profile.regimes?.climb.accelKtPerS).toBe(1.0);

    expect(profile.regimes?.enroute).toMatchObject({
      nominalClimbFpm: 1000,
      nominalDescentFpm: 1800,
      maxBankDeg: 25,
    });
  });

  test("non-finite overrides are ignored and fall back to default", () => {
    const registry = new AircraftPerformanceRegistry({
      defaults: syntheticDefaults,
      aircraft: {
        B744: {
          limits: { maxControlledSpeedKt: Number.NaN },
          regimes: {
            climb: {
              nominalClimbFpm: Number.POSITIVE_INFINITY,
              maxBankDeg: "invalid" as unknown as number,
            },
          },
        },
      },
    });

    const profile = registry.getProfile("B744");
    expect(profile.limits?.maxControlledSpeedKt).toBe(340);
    expect(profile.regimes?.climb.nominalClimbFpm).toBe(2000);
    expect(profile.regimes?.climb.maxBankDeg).toBe(25);
  });

  test("unknown aircraft falls back to DEFAULT_PROFILE", () => {
    const registry = new AircraftPerformanceRegistry({
      defaults: syntheticDefaults,
      aircraft: { B738: {} },
    });

    expect(registry.getProfile("UNKNOWN")).toBe(DEFAULT_PROFILE);
    expect(registry.getProfile("")).toBe(DEFAULT_PROFILE);
    expect(registry.getProfile(null)).toBe(DEFAULT_PROFILE);
    expect(registry.getProfile(undefined)).toBe(DEFAULT_PROFILE);
  });

  test("registry normalizes ICAO identity and trims whitespace", () => {
    const registry = new AircraftPerformanceRegistry({
      defaults: syntheticDefaults,
      aircraft: { B738: {} },
    });

    expect(registry.getProfile("  b738 ").icaoType).toBe("B738");
    expect(registry.has("  b738 ")).toBe(true);
    expect(registry.has("B738")).toBe(true);
    expect(registry.has("b738")).toBe(true);
    expect(registry.has("B737")).toBe(false);
  });

  test("caches constructed profiles in-memory", () => {
    const registry = new AircraftPerformanceRegistry({
      defaults: syntheticDefaults,
      aircraft: { B738: {} },
    });

    const first = registry.getProfile("B738");
    const second = registry.getProfile("B738");
    expect(first).toBe(second);
  });

  test("committed dataset provides all 33 aircraft keys with defaults cascade", () => {
    expect(performanceRegistry.has("B738")).toBe(true);
    expect(performanceRegistry.has("A20N")).toBe(true);
    expect(performanceRegistry.has("E295")).toBe(true);

    const b738 = performanceRegistry.getProfile("B738");
    expect(b738.status).toBe("SUPPORTED");
    expect(b738.limits?.minControlledSpeedKt).toBe(100);
    expect(b738.limits?.maxControlledSpeedKt).toBe(340);
    expect(b738.limits?.serviceCeilingFt).toBe(41000);
    expect(b738.regimes?.approach.nominalDescentFpm).toBe(1200);
  });
});

describe("generated data guard and legacy compatibility", () => {
  test("recognizes the unified dataset envelope", () => {
    const dataset: AircraftProfileDataset = {
      defaults: syntheticDefaults,
      aircraft: {},
    };
    expect(isAircraftProfileDataset(dataset)).toBe(true);
    expect(isAircraftProfileDataset({ aircraft: {} })).toBe(false);
    expect(isAircraftProfileDataset(null)).toBe(false);
  });

  test("does not mutate source data", () => {
    const input: AircraftProfileDataset = {
      defaults: syntheticDefaults,
      aircraft: { A320: {} },
    };
    const registry = new AircraftPerformanceRegistry(input);
    registry.getProfile("A320");
    expect(Object.isFrozen(input.aircraft)).toBe(false);
    expect(Object.isFrozen(input.aircraft.A320)).toBe(false);
  });

  test("preserves legacy profile dataset support", () => {
    const legacyLimits = {
      minSpeedKt: 100,
      maxSpeedKt: 300,
      nominalClimbFpm: 2000,
      nominalDescentFpm: 1800,
      accelKtPerS: 1,
      decelKtPerS: 1,
      maxBankDeg: 25,
    };
    const legacyProfile = {
      icaoType: "B738",
      representativeVariant: "synthetic",
      representativeEngine: "synthetic",
      status: "SUPPORTED" as const,
      limits: { minControlledSpeedKt: 100, maxControlledSpeedKt: 320 },
      regimes: {
        initialClimb: legacyLimits,
        climb: legacyLimits,
        enroute: legacyLimits,
        arrival: legacyLimits,
        approach: legacyLimits,
        missedApproach: legacyLimits,
        landing: legacyLimits,
      },
    };

    const registry = new AircraftPerformanceRegistry({
      schemaVersion: 1,
      generator: {},
      profiles: [legacyProfile],
    });

    expect(registry.getProfile("B738").icaoType).toBe("B738");
    expect(registry.getProfile("B737")).toBe(DEFAULT_PROFILE);
  });
});

test("default profile preserves legacy kinematic constants", () => {
  expect(DEFAULT_PROFILE.regimes?.enroute).toMatchObject({
    nominalClimbFpm: 1800,
    nominalDescentFpm: 1800,
    accelKtPerS: 1,
    decelKtPerS: 1,
    turnRateDegPerS: 3,
  });
});

test("registry accepts a profile without mutating aircraft state", () => {
  const aircraft = makeTestAircraft({ aircraftType: "B738" });
  const registry = new AircraftPerformanceRegistry({
    defaults: syntheticDefaults,
    aircraft: { B738: {} },
  });
  const before = JSON.stringify(aircraft);
  registry.getProfile(aircraft.aircraftType);
  expect(JSON.stringify(aircraft)).toBe(before);
});
