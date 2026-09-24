import { describe, expect, test } from "vitest";
import { createAircraft } from "../aircraft";
import { createWorld, stepWorld } from "../world";
import profilesJson from "./aircraft-profiles.json";
import {
  isAircraftProfileDataset,
  normalizeSpokenAliases,
  performanceRegistry,
  DEFAULT_PROFILE,
} from "./registry";
import type { AircraftProfileDataset, PerformanceRegime } from "./types";

const dataset = profilesJson as unknown as AircraftProfileDataset;
const ALL_REGIMES: readonly PerformanceRegime[] = [
  "initialClimb",
  "climb",
  "enroute",
  "arrival",
  "approach",
  "missedApproach",
  "landing",
];

const EXPECTED_GA_ALIASES = {
  BE36: ["Bonanza"],
  C172: ["Skyhawk"],
  C182: ["Skylane"],
  C208: ["Caravan"],
  DA40: ["Diamond"],
  PA28: ["Archer"],
  SR22: ["Cirrus"],
} as const;

describe("unified aircraft profiles dataset contract", () => {
  test("dataset satisfies isAircraftProfileDataset schema guard", () => {
    expect(isAircraftProfileDataset(dataset)).toBe(true);
  });

  test("defaults specify valid limits and all seven performance regimes", () => {
    const limits = dataset.defaults.limits;
    expect(limits.minControlledSpeedKt).toBeGreaterThan(0);
    expect(limits.maxControlledSpeedKt).toBeGreaterThan(limits.minControlledSpeedKt);
    expect(limits.serviceCeilingFt).toBeGreaterThan(0);

    for (const regime of ALL_REGIMES) {
      const regimeLimits = dataset.defaults.regimes[regime];
      expect(regimeLimits).toBeDefined();
      expect(regimeLimits.nominalClimbFpm).toBeGreaterThanOrEqual(0);
      expect(regimeLimits.nominalDescentFpm).toBeGreaterThanOrEqual(0);
      expect(regimeLimits.maxBankDeg).toBeGreaterThan(0);
      expect(regimeLimits.accelKtPerS).toBeGreaterThan(0);
      expect(regimeLimits.decelKtPerS).toBeGreaterThan(0);
    }
  });

  test("contains valid aircraft keys with valid override shapes", () => {
    const aircraftKeys = Object.keys(dataset.aircraft);
    expect(aircraftKeys.length).toBeGreaterThanOrEqual(33);

    for (const icao of aircraftKeys) {
      expect(icao).toMatch(/^[A-Z0-9]+$/);
      const override = dataset.aircraft[icao];
      expect(typeof override).toBe("object");

      if (override.source) {
        expect(["openap", "manufacturer-specs"]).toContain(override.source);
      }

      if (override.limits) {
        if (
          override.limits.minControlledSpeedKt !== undefined &&
          override.limits.maxControlledSpeedKt !== undefined
        ) {
          expect(override.limits.minControlledSpeedKt).toBeLessThanOrEqual(
            override.limits.maxControlledSpeedKt,
          );
        }
        if (override.limits.serviceCeilingFt !== undefined) {
          expect(override.limits.serviceCeilingFt).toBeGreaterThan(0);
        }
      }

      if (override.regimes) {
        for (const [regimeName, regimeData] of Object.entries(override.regimes)) {
          expect(ALL_REGIMES).toContain(regimeName as PerformanceRegime);
          if (regimeData.nominalClimbFpm !== undefined) {
            expect(regimeData.nominalClimbFpm).toBeGreaterThanOrEqual(0);
          }
          if (regimeData.nominalDescentFpm !== undefined) {
            expect(regimeData.nominalDescentFpm).toBeGreaterThanOrEqual(0);
          }
          if (regimeData.minSpeedKt !== undefined && regimeData.maxSpeedKt !== undefined) {
            expect(regimeData.minSpeedKt).toBeLessThanOrEqual(regimeData.maxSpeedKt);
          }
        }
      }
    }
  });

  test("generalAviation object holds only GA types with manufacturer specs", () => {
    const gaKeys = Object.keys(dataset.generalAviation ?? {});
    expect(gaKeys).toEqual(["BE36", "C172", "C182", "C208", "DA40", "PA28", "SR22"]);
    expect(gaKeys.every((k) => !(k in dataset.aircraft))).toBe(true);

    for (const icao of gaKeys) {
      const override = dataset.generalAviation![icao]!;
      expect(override.source).toBe("manufacturer-specs");
      expect(override.limits?.serviceCeilingFt).toBeGreaterThan(0);
      expect(override.limits!.serviceCeilingFt).toBeLessThanOrEqual(25000);
    }
    // GA ceilings come from the GA object, never the 41000 ft jet default.
    expect(performanceRegistry.getProfile("C172").limits?.serviceCeilingFt).toBe(14000);
    expect(performanceRegistry.getProfile("C208").limits?.serviceCeilingFt).toBe(25000);
    expect(performanceRegistry.listGeneralAviationTypes()).toEqual(gaKeys);
  });

  test("every current VFR profile has explicit preferred spoken alias data", () => {
    for (const [aircraftType, aliases] of Object.entries(EXPECTED_GA_ALIASES)) {
      expect(dataset.generalAviation?.[aircraftType]?.spokenAliases).toEqual(aliases);
      expect(performanceRegistry.getSpokenAliases(aircraftType)).toEqual(aliases);
      expect(performanceRegistry.getProfile(aircraftType).spokenAliases).toEqual(aliases);
      expect(Object.isFrozen(performanceRegistry.getProfile(aircraftType).spokenAliases)).toBe(
        true,
      );
    }
  });

  test("alias validation allows omission and multiple authored aliases", () => {
    expect(normalizeSpokenAliases(undefined)).toEqual([]);
    expect(normalizeSpokenAliases(["  Skyhawk  ", "172S"])).toEqual(["Skyhawk", "172S"]);
    expect(
      isAircraftProfileDataset({
        defaults: dataset.defaults,
        aircraft: { SYNTH: {} },
        generalAviation: { SYNTH: { spokenAliases: ["Trainer", "Four Twenty"] } },
      }),
    ).toBe(true);
  });

  test.each([
    ["empty", { spokenAliases: [] }],
    ["blank", { spokenAliases: ["   "] }],
    ["duplicate", { spokenAliases: ["Skyhawk", "skyhawk"] }],
    ["malformed", { spokenAliases: ["Skyhawk!"] }],
  ])("alias validation rejects %s values", (_label, override) => {
    expect(
      isAircraftProfileDataset({
        defaults: dataset.defaults,
        aircraft: { SYNTH: override },
      }),
    ).toBe(false);
    expect(() => normalizeSpokenAliases(override.spokenAliases)).toThrow();
  });
});

describe("end-to-end simulation integration acceptance (AC4)", () => {
  test("OpenAP-populated aircraft climbs at overridden rate", () => {
    const profile = performanceRegistry.getProfile("B738");
    expect(profile.icaoType).toBe("B738");
    expect(profile.status).toBe("SUPPORTED");

    // OpenAP overridden climb rate (~2015.75 fpm) differs from default (2000 fpm)
    const openapClimbFpm = profile.regimes!.climb.nominalClimbFpm;
    expect(openapClimbFpm).toBeCloseTo(2015.75, 1);
    expect(openapClimbFpm).not.toBe(dataset.defaults.regimes.climb.nominalClimbFpm);
  });

  test("fallback unpopulated aircraft cascades to default policy rate", () => {
    const profile = performanceRegistry.getProfile("B753");
    expect(profile.icaoType).toBe("B753");
    expect(profile.status).toBe("SUPPORTED");

    // Fallback aircraft gets exactly the defaults
    expect(profile.regimes!.climb.nominalClimbFpm).toBe(
      dataset.defaults.regimes.climb.nominalClimbFpm,
    );
    expect(profile.regimes!.initialClimb.nominalClimbFpm).toBe(
      dataset.defaults.regimes.initialClimb.nominalClimbFpm,
    );
    expect(profile.limits!.serviceCeilingFt).toBe(dataset.defaults.limits.serviceCeilingFt);
  });

  test("unknown aircraft resolves to DEFAULT_PROFILE fallback", () => {
    const profile = performanceRegistry.getProfile("UNLISTED");
    expect(profile).toBe(DEFAULT_PROFILE);
    expect(profile.regimes!.enroute.nominalClimbFpm).toBe(1800);
  });

  test("simulation stepWorld applies OpenAP rate vs default rate in flight", () => {
    const b738 = createAircraft({
      id: "ac-b738",
      callsign: "AAL123",
      aircraftType: "B738",
      xNm: 0,
      yNm: 0,
      altitudeFt: 5000,
      speedKt: 250,
      headingDeg: 90,
    });
    b738.intent.assignedAltitudeFt = 15000;
    b738.intent.lateral = {
      type: "PROCEDURE",
      sidId: "SID1",
      routeFixIds: ["FIX1"],
      toFixIndex: 0,
    };

    const b753 = createAircraft({
      id: "ac-b753",
      callsign: "DAL456",
      aircraftType: "B753",
      xNm: 0,
      yNm: 0,
      altitudeFt: 5000,
      speedKt: 250,
      headingDeg: 90,
    });
    b753.intent.assignedAltitudeFt = 15000;
    b753.intent.lateral = {
      type: "PROCEDURE",
      sidId: "SID1",
      routeFixIds: ["FIX1"],
      toFixIndex: 0,
    };

    const unlisted = createAircraft({
      id: "ac-unlisted",
      callsign: "N12345",
      aircraftType: "UNKNOWN",
      xNm: 0,
      yNm: 0,
      altitudeFt: 5000,
      speedKt: 250,
      headingDeg: 90,
    });
    unlisted.intent.assignedAltitudeFt = 15000;
    unlisted.intent.lateral = {
      type: "PROCEDURE",
      sidId: "SID1",
      routeFixIds: ["FIX1"],
      toFixIndex: 0,
    };

    // Altitude 5000 < 10000 with VIA_SID puts all in "initialClimb" regime
    const b738Profile = performanceRegistry.getProfile("B738");
    const b753Profile = performanceRegistry.getProfile("B753");
    const unlistedProfile = performanceRegistry.getProfile("UNKNOWN");

    const expectedB738Rate = b738Profile.regimes!.initialClimb.nominalClimbFpm;
    const expectedB753Rate = b753Profile.regimes!.initialClimb.nominalClimbFpm;
    const expectedUnlistedRate = unlistedProfile.regimes!.initialClimb.nominalClimbFpm;

    // OpenAP rate (~2415.35 fpm) is different from default rate (2600 fpm) and unlisted rate (1800 fpm)
    expect(expectedB738Rate).toBeCloseTo(2415.35, 1);
    expect(expectedB753Rate).toBe(2600);
    expect(expectedUnlistedRate).toBe(1800);

    const world = createWorld({ aircraft: [b738, b753, unlisted] });

    const dtS = 6;
    stepWorld(world, dtS);

    // Each aircraft climbed according to its resolved profile rate: (rate / 60) * dtS
    const b738DeltaAlt = b738.altitudeFt - 5000;
    const b753DeltaAlt = b753.altitudeFt - 5000;
    const unlistedDeltaAlt = unlisted.altitudeFt - 5000;

    expect(b738DeltaAlt).toBeCloseTo((expectedB738Rate / 60) * dtS, 2);
    expect(b753DeltaAlt).toBeCloseTo((expectedB753Rate / 60) * dtS, 2);
    expect(unlistedDeltaAlt).toBeCloseTo((expectedUnlistedRate / 60) * dtS, 2);

    // B753 climbed faster than B738, which climbed faster than unlisted
    expect(b753DeltaAlt).toBeGreaterThan(b738DeltaAlt);
    expect(b738DeltaAlt).toBeGreaterThan(unlistedDeltaAlt);
  });

  test("stepWorld enforces profile service ceiling and speed limits in simulation", () => {
    const a320Profile = performanceRegistry.getProfile("A320");
    const ceilingFt = a320Profile.limits!.serviceCeilingFt!;
    const maxSpeedKt = a320Profile.limits!.maxControlledSpeedKt;

    const ac = createAircraft({
      id: "ac-envelope",
      callsign: "AAL500",
      aircraftType: "A320",
      xNm: 0,
      yNm: 0,
      altitudeFt: ceilingFt - 100,
      speedKt: 250,
      headingDeg: 90,
    });
    // Request altitude above ceiling and speed above maxControlledSpeedKt
    ac.intent.assignedAltitudeFt = ceilingFt + 10000;
    ac.intent.assignedSpeedKt = maxSpeedKt + 100;

    const world = createWorld({ aircraft: [ac] });
    // Step forward 60 seconds
    for (let i = 0; i < 10; i++) {
      stepWorld(world, 6);
    }

    // Altitude clamped at ceiling, speed cannot exceed profile max
    expect(ac.altitudeFt).toBeCloseTo(ceilingFt, 1);
    expect(ac.altitudeFt).toBeLessThanOrEqual(ceilingFt);
    expect(ac.speedKt).toBeLessThanOrEqual(maxSpeedKt);
  });
});
