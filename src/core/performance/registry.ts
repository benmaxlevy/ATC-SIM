import { ACCEL_KT_PER_S, CLIMB_RATE_FT_PER_MIN, TURN_RATE_DEG_PER_S } from "../kinematics";
import profilesJson from "./aircraft-profiles.json";
import type {
  AircraftPerformanceProfile,
  AircraftProfileDataset,
  AircraftProfileDefaults,
  AircraftProfileOverride,
  PerformanceRegime,
  PerformanceRegimeLimits,
} from "./types";

const REGIMES: readonly PerformanceRegime[] = [
  "initialClimb",
  "climb",
  "enroute",
  "arrival",
  "approach",
  "missedApproach",
  "landing",
];

const DEFAULT_LIMITS: PerformanceRegimeLimits = Object.freeze({
  minSpeedKt: 0,
  maxSpeedKt: Number.POSITIVE_INFINITY,
  nominalClimbFpm: CLIMB_RATE_FT_PER_MIN,
  nominalDescentFpm: CLIMB_RATE_FT_PER_MIN,
  accelKtPerS: ACCEL_KT_PER_S,
  decelKtPerS: ACCEL_KT_PER_S,
  maxBankDeg: 25,
  turnRateDegPerS: TURN_RATE_DEG_PER_S,
});

const DEFAULT_REGIMES = Object.freeze(
  Object.fromEntries(REGIMES.map((regime) => [regime, DEFAULT_LIMITS])) as Record<
    PerformanceRegime,
    PerformanceRegimeLimits
  >,
);

/** Safe trainer fallback. It retains the pre-profile 3 deg/s, 1800 fpm, 1 kt/s model. */
export const DEFAULT_PROFILE: AircraftPerformanceProfile = Object.freeze({
  icaoType: "DEFAULT",
  representativeVariant: "legacy-default",
  representativeEngine: "legacy-default",
  status: "SUPPORTED",
  limits: Object.freeze({
    minControlledSpeedKt: 0,
    maxControlledSpeedKt: Number.POSITIVE_INFINITY,
  }),
  regimes: DEFAULT_REGIMES,
  provenance: Object.freeze({
    status: Object.freeze({ kind: "simulator-policy", note: "Legacy kinematics fallback" }),
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function freezeDeep<T>(value: T): T {
  if (isRecord(value) || Array.isArray(value)) {
    Object.values(value).forEach((child) => freezeDeep(child));
    Object.freeze(value);
  }
  return value;
}

const FALLBACK_DEFAULTS: AircraftProfileDefaults = Object.freeze({
  limits: Object.freeze({
    minControlledSpeedKt: 100,
    maxControlledSpeedKt: 340,
    serviceCeilingFt: 41000,
  }),
  regimes: Object.freeze({
    initialClimb: Object.freeze({
      nominalClimbFpm: 2600,
      nominalDescentFpm: 0,
      maxBankDeg: 20,
      accelKtPerS: 1.5,
      decelKtPerS: 1.0,
    }),
    climb: Object.freeze({
      nominalClimbFpm: 2000,
      nominalDescentFpm: 0,
      maxBankDeg: 25,
      accelKtPerS: 1.0,
      decelKtPerS: 0.8,
    }),
    enroute: Object.freeze({
      nominalClimbFpm: 1000,
      nominalDescentFpm: 1800,
      maxBankDeg: 25,
      accelKtPerS: 0.8,
      decelKtPerS: 0.8,
    }),
    arrival: Object.freeze({
      nominalClimbFpm: 0,
      nominalDescentFpm: 2200,
      maxBankDeg: 25,
      accelKtPerS: 0.8,
      decelKtPerS: 1.0,
    }),
    approach: Object.freeze({
      nominalClimbFpm: 0,
      nominalDescentFpm: 1200,
      maxBankDeg: 25,
      accelKtPerS: 0.8,
      decelKtPerS: 1.2,
    }),
    landing: Object.freeze({
      nominalClimbFpm: 0,
      nominalDescentFpm: 750,
      maxBankDeg: 15,
      accelKtPerS: 0.8,
      decelKtPerS: 3.8,
    }),
    missedApproach: Object.freeze({
      nominalClimbFpm: 2200,
      nominalDescentFpm: 0,
      maxBankDeg: 20,
      accelKtPerS: 1.2,
      decelKtPerS: 1.0,
    }),
  }),
});

function normalizeDefaults(raw: unknown): AircraftProfileDefaults {
  if (!isRecord(raw)) return FALLBACK_DEFAULTS;

  const rawLimits = isRecord(raw.limits) ? raw.limits : {};
  const limits = {
    minControlledSpeedKt: isFiniteNumber(rawLimits.minControlledSpeedKt)
      ? rawLimits.minControlledSpeedKt
      : FALLBACK_DEFAULTS.limits.minControlledSpeedKt,
    maxControlledSpeedKt: isFiniteNumber(rawLimits.maxControlledSpeedKt)
      ? rawLimits.maxControlledSpeedKt
      : FALLBACK_DEFAULTS.limits.maxControlledSpeedKt,
    serviceCeilingFt: isFiniteNumber(rawLimits.serviceCeilingFt)
      ? rawLimits.serviceCeilingFt
      : FALLBACK_DEFAULTS.limits.serviceCeilingFt,
  };

  const rawRegimes = isRecord(raw.regimes) ? raw.regimes : {};
  const regimesObj: Record<string, unknown> = {};

  for (const regime of REGIMES) {
    const defaultRegime = FALLBACK_DEFAULTS.regimes[regime];
    const rawRegime = isRecord(rawRegimes[regime])
      ? (rawRegimes[regime] as Record<string, unknown>)
      : {};
    regimesObj[regime] = {
      nominalClimbFpm: isFiniteNumber(rawRegime.nominalClimbFpm)
        ? rawRegime.nominalClimbFpm
        : defaultRegime.nominalClimbFpm,
      nominalDescentFpm: isFiniteNumber(rawRegime.nominalDescentFpm)
        ? rawRegime.nominalDescentFpm
        : defaultRegime.nominalDescentFpm,
      maxBankDeg: isFiniteNumber(rawRegime.maxBankDeg)
        ? rawRegime.maxBankDeg
        : defaultRegime.maxBankDeg,
      accelKtPerS: isFiniteNumber(rawRegime.accelKtPerS)
        ? rawRegime.accelKtPerS
        : defaultRegime.accelKtPerS,
      decelKtPerS: isFiniteNumber(rawRegime.decelKtPerS)
        ? rawRegime.decelKtPerS
        : defaultRegime.decelKtPerS,
      minSpeedKt: isFiniteNumber(rawRegime.minSpeedKt) ? rawRegime.minSpeedKt : undefined,
      maxSpeedKt: isFiniteNumber(rawRegime.maxSpeedKt) ? rawRegime.maxSpeedKt : undefined,
      turnRateDegPerS: isFiniteNumber(rawRegime.turnRateDegPerS)
        ? rawRegime.turnRateDegPerS
        : undefined,
    };
  }

  return freezeDeep({ limits, regimes: regimesObj } as unknown as AircraftProfileDefaults);
}

function isUsableLegacyProfile(value: unknown): value is AircraftPerformanceProfile {
  if (!isRecord(value) || typeof value.icaoType !== "string" || value.status !== "SUPPORTED") {
    return false;
  }
  if (!isRecord(value.limits) || !isRecord(value.regimes)) return false;
  if (!isFiniteNumber(value.limits.minControlledSpeedKt)) return false;
  if (!isFiniteNumber(value.limits.maxControlledSpeedKt)) return false;
  const regimes = value.regimes as Record<string, unknown>;
  return REGIMES.every((regime) => {
    const limits = regimes[regime];
    return (
      isRecord(limits) &&
      [
        "minSpeedKt",
        "maxSpeedKt",
        "nominalClimbFpm",
        "nominalDescentFpm",
        "accelKtPerS",
        "decelKtPerS",
        "maxBankDeg",
      ].every((key) => isFiniteNumber(limits[key]))
    );
  });
}

export class AircraftPerformanceRegistry {
  private readonly defaults: AircraftProfileDefaults;
  private readonly aircraft: ReadonlyMap<string, AircraftProfileOverride>;
  private readonly cachedProfiles: Map<string, AircraftPerformanceProfile>;

  public constructor(dataset: unknown = profilesJson as unknown) {
    this.cachedProfiles = new Map();

    if (isRecord(dataset) && Array.isArray(dataset.profiles)) {
      // Legacy dataset handling: clone before freezing to protect source input
      this.defaults = FALLBACK_DEFAULTS;
      this.aircraft = new Map();
      for (const profile of dataset.profiles) {
        if (isUsableLegacyProfile(profile)) {
          const key = profile.icaoType.trim().toUpperCase();
          if (key && key !== "DEFAULT" && !this.cachedProfiles.has(key)) {
            this.cachedProfiles.set(key, freezeDeep(structuredClone(profile)));
          }
        }
      }
    } else if (isRecord(dataset) && isRecord(dataset.aircraft)) {
      this.defaults = normalizeDefaults(dataset.defaults);
      const acMap = new Map<string, AircraftProfileOverride>();
      for (const [k, v] of Object.entries(dataset.aircraft as Record<string, unknown>)) {
        if (isRecord(v)) {
          const key = k.trim().toUpperCase();
          if (key && key !== "DEFAULT") {
            // Clone override record to preserve original input without mutating/freezing it
            acMap.set(key, structuredClone(v) as AircraftProfileOverride);
          }
        }
      }
      this.aircraft = acMap;
    } else {
      this.defaults = FALLBACK_DEFAULTS;
      this.aircraft = new Map();
    }
  }

  public getProfile(aircraftType?: string | null): AircraftPerformanceProfile {
    const key = aircraftType?.trim().toUpperCase();
    if (!key || key === "DEFAULT") {
      return DEFAULT_PROFILE;
    }
    const cached = this.cachedProfiles.get(key);
    if (cached) {
      return cached;
    }
    const override = this.aircraft.get(key);
    if (!override) {
      return DEFAULT_PROFILE;
    }
    const profile = this.buildProfile(key, override);
    this.cachedProfiles.set(key, profile);
    return profile;
  }

  public has(aircraftType: string): boolean {
    const key = aircraftType.trim().toUpperCase();
    return this.aircraft.has(key) || this.cachedProfiles.has(key);
  }

  private buildProfile(
    icao: string,
    override: AircraftProfileOverride,
  ): AircraftPerformanceProfile {
    const defaults = this.defaults;
    const rawLimits = override.limits;

    const minControlledSpeedKt = isFiniteNumber(rawLimits?.minControlledSpeedKt)
      ? rawLimits.minControlledSpeedKt
      : defaults.limits.minControlledSpeedKt;
    const maxControlledSpeedKt = isFiniteNumber(rawLimits?.maxControlledSpeedKt)
      ? rawLimits.maxControlledSpeedKt
      : defaults.limits.maxControlledSpeedKt;
    const serviceCeilingFt = isFiniteNumber(rawLimits?.serviceCeilingFt)
      ? rawLimits.serviceCeilingFt
      : defaults.limits.serviceCeilingFt;

    const limits = Object.freeze({
      minControlledSpeedKt,
      maxControlledSpeedKt,
      serviceCeilingFt,
    });

    const rawRegimes = override.regimes;
    const regimesObj: Record<string, PerformanceRegimeLimits> = {};

    for (const regime of REGIMES) {
      const defaultRegime = defaults.regimes[regime];
      const overrideRegime = rawRegimes?.[regime];

      const nominalClimbFpm = isFiniteNumber(overrideRegime?.nominalClimbFpm)
        ? overrideRegime.nominalClimbFpm
        : defaultRegime.nominalClimbFpm;
      const nominalDescentFpm = isFiniteNumber(overrideRegime?.nominalDescentFpm)
        ? overrideRegime.nominalDescentFpm
        : defaultRegime.nominalDescentFpm;
      const maxBankDeg = isFiniteNumber(overrideRegime?.maxBankDeg)
        ? overrideRegime.maxBankDeg
        : defaultRegime.maxBankDeg;
      const accelKtPerS = isFiniteNumber(overrideRegime?.accelKtPerS)
        ? overrideRegime.accelKtPerS
        : defaultRegime.accelKtPerS;
      const decelKtPerS = isFiniteNumber(overrideRegime?.decelKtPerS)
        ? overrideRegime.decelKtPerS
        : defaultRegime.decelKtPerS;

      const minSpeedKt = isFiniteNumber(overrideRegime?.minSpeedKt)
        ? overrideRegime.minSpeedKt
        : isFiniteNumber(defaultRegime.minSpeedKt)
          ? defaultRegime.minSpeedKt
          : minControlledSpeedKt;
      const maxSpeedKt = isFiniteNumber(overrideRegime?.maxSpeedKt)
        ? overrideRegime.maxSpeedKt
        : isFiniteNumber(defaultRegime.maxSpeedKt)
          ? defaultRegime.maxSpeedKt
          : maxControlledSpeedKt;

      const regimeLimits: PerformanceRegimeLimits = {
        minSpeedKt,
        maxSpeedKt,
        nominalClimbFpm,
        nominalDescentFpm,
        accelKtPerS,
        decelKtPerS,
        maxBankDeg,
      };

      if (isFiniteNumber(overrideRegime?.turnRateDegPerS)) {
        (regimeLimits as { turnRateDegPerS?: number }).turnRateDegPerS =
          overrideRegime.turnRateDegPerS;
      } else if (isFiniteNumber(defaultRegime.turnRateDegPerS)) {
        (regimeLimits as { turnRateDegPerS?: number }).turnRateDegPerS =
          defaultRegime.turnRateDegPerS;
      }

      regimesObj[regime] = Object.freeze(regimeLimits);
    }

    const profile: AircraftPerformanceProfile = Object.freeze({
      icaoType: icao,
      representativeVariant: override.representativeVariant ?? icao,
      representativeEngine: override.representativeEngine ?? "generic",
      status: "SUPPORTED",
      limits,
      regimes: Object.freeze(regimesObj) as Record<PerformanceRegime, PerformanceRegimeLimits>,
    });

    return profile;
  }
}

export const performanceRegistry = new AircraftPerformanceRegistry();

/** Exported for production-data shape tests without exposing mutable internals. */
export function isAircraftProfileDataset(value: unknown): value is AircraftProfileDataset {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.defaults) &&
    isRecord(value.aircraft) &&
    isRecord(value.defaults.limits) &&
    isRecord(value.defaults.regimes)
  );
}
