import { ACCEL_KT_PER_S, CLIMB_RATE_FT_PER_MIN, TURN_RATE_DEG_PER_S } from "../kinematics";
import generated from "./aircraft-profiles.generated.json";
import type {
  AircraftPerformanceProfile,
  AircraftProfileDataset,
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

function isUsableProfile(value: unknown): value is AircraftPerformanceProfile {
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

function normalizeDataset(value: unknown): readonly AircraftPerformanceProfile[] {
  if (!isRecord(value) || !Array.isArray(value.profiles)) return [];
  return value.profiles.filter(isUsableProfile);
}

function freezeDeep<T>(value: T): T {
  if (isRecord(value) || Array.isArray(value)) {
    Object.values(value).forEach((child) => freezeDeep(child));
    Object.freeze(value);
  }
  return value;
}

export class AircraftPerformanceRegistry {
  private readonly profiles: ReadonlyMap<string, AircraftPerformanceProfile>;

  public constructor(dataset: unknown = generated as unknown) {
    const map = new Map<string, AircraftPerformanceProfile>();
    for (const profile of normalizeDataset(dataset)) {
      const key = profile.icaoType.trim().toUpperCase();
      if (key && key !== "DEFAULT" && !map.has(key)) {
        // Clone before freezing: imported JSON is shared module state and must
        // remain untouched even when a caller supplied a synthetic dataset.
        map.set(key, freezeDeep(structuredClone(profile)));
      }
    }
    this.profiles = map;
  }

  public getProfile(aircraftType?: string | null): AircraftPerformanceProfile {
    const key = aircraftType?.trim().toUpperCase();
    return (key ? this.profiles.get(key) : undefined) ?? DEFAULT_PROFILE;
  }

  public has(aircraftType: string): boolean {
    return this.profiles.has(aircraftType.trim().toUpperCase());
  }
}

export const performanceRegistry = new AircraftPerformanceRegistry();

/** Exported for production-data shape tests without exposing mutable internals. */
export function isAircraftProfileDataset(value: unknown): value is AircraftProfileDataset {
  return isRecord(value) && value.schemaVersion === 1 && Array.isArray(value.profiles);
}
