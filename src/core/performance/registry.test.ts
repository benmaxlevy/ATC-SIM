import { describe, expect, test } from "vitest";
import { makeTestAircraft } from "../aircraft";
import { AircraftPerformanceRegistry, DEFAULT_PROFILE, isAircraftProfileDataset } from "./registry";
import type { AircraftProfileDataset } from "./types";

const limits = {
  minSpeedKt: 100,
  maxSpeedKt: 300,
  nominalClimbFpm: 2000,
  nominalDescentFpm: 1800,
  accelKtPerS: 1,
  decelKtPerS: 1,
  maxBankDeg: 25,
};
const profile = (icaoType: string) => ({
  icaoType,
  representativeVariant: "synthetic",
  representativeEngine: "synthetic",
  status: "SUPPORTED" as const,
  limits: { minControlledSpeedKt: 100, maxControlledSpeedKt: 320 },
  regimes: {
    initialClimb: limits,
    climb: limits,
    enroute: limits,
    arrival: limits,
    approach: limits,
    missedApproach: limits,
    landing: limits,
  },
});

test("registry normalizes ICAO identity and rejects family leakage", () => {
  const registry = new AircraftPerformanceRegistry({ profiles: [profile("B738")] });
  expect(registry.getProfile("  b738 ").icaoType).toBe("B738");
  expect(registry.getProfile("B737")).toBe(DEFAULT_PROFILE);
  expect(registry.getProfile()).toBe(DEFAULT_PROFILE);
});

test("registry ignores unresolved and malformed generated records", () => {
  const registry = new AircraftPerformanceRegistry({
    profiles: [
      { ...profile("UNRES"), status: "UNRESOLVED", limits: null, regimes: null },
      { ...profile("BROKEN"), regimes: null },
    ],
  });
  expect(registry.getProfile("UNRES")).toBe(DEFAULT_PROFILE);
  expect(registry.getProfile("BROKEN")).toBe(DEFAULT_PROFILE);
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

describe("generated data guard", () => {
  test("recognizes the committed dataset envelope", () => {
    const dataset: AircraftProfileDataset = { schemaVersion: 1, generator: {}, profiles: [] };
    expect(isAircraftProfileDataset(dataset)).toBe(true);
    expect(isAircraftProfileDataset({ profiles: [] })).toBe(false);
  });

  test("does not mutate source data", () => {
    const input = { profiles: [profile("A320")] };
    const registry = new AircraftPerformanceRegistry(input);
    registry.getProfile("A320");
    expect(Object.isFrozen(input.profiles[0])).toBe(false);
  });
});

test("registry accepts a profile without mutating aircraft state", () => {
  const aircraft = makeTestAircraft({ aircraftType: "B738" });
  const registry = new AircraftPerformanceRegistry({ profiles: [profile("B738")] });
  const before = JSON.stringify(aircraft);
  registry.getProfile(aircraft.aircraftType);
  expect(JSON.stringify(aircraft)).toBe(before);
});
