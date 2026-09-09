import { expect, test } from "vitest";
import generated from "./aircraft-profiles.generated.json";
import type { AircraftProfileDataset, PerformanceRegime } from "./types";

const dataset = generated as AircraftProfileDataset;
const regimes: PerformanceRegime[] = [
  "initialClimb",
  "climb",
  "enroute",
  "arrival",
  "approach",
  "missedApproach",
  "landing",
];

test("committed aircraft profile artifact has one valid record per requested type", () => {
  expect(dataset.schemaVersion).toBe(1);
  const profiles = dataset.profiles;
  expect(new Set(profiles.map((profile) => profile.icaoType)).size).toBe(profiles.length);
  expect(profiles.length).toBe(33);

  for (const profile of profiles) {
    expect(profile.icaoType).toMatch(/^[A-Z0-9]+$/);
    expect(profile.representativeVariant.length).toBeGreaterThan(0);
    expect(profile.representativeEngine.length).toBeGreaterThan(0);
    expect(["SUPPORTED", "UNRESOLVED"]).toContain(profile.status);
    expect(profile.provenance).toBeDefined();
    expect(Object.keys(profile.provenance ?? {}).length).toBeGreaterThan(0);

    if (profile.status === "SUPPORTED") {
      expect(profile.limits).not.toBeNull();
      expect(profile.regimes).not.toBeNull();
      expect(profile.limits!.minControlledSpeedKt).toBeLessThanOrEqual(
        profile.limits!.maxControlledSpeedKt,
      );
      for (const regime of regimes) {
        const limits = profile.regimes![regime];
        expect(limits.minSpeedKt).toBeLessThanOrEqual(limits.maxSpeedKt);
        expect(limits.maxBankDeg).toBeGreaterThan(0);
      }
    } else {
      expect(profile.limits).toBeNull();
      expect(profile.regimes).toBeNull();
    }
  }
});
