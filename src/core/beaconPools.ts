/**
 * Configurable trainer beacon pools. Contents are adaptation data, not
 * official NAS/STARS banks. Allocation is deterministic for reproducible
 * trainer scenarios.
 */

export const BEACON_POOL_KEYS = [
  "ifr",
  "vfr",
  "general1",
  "general2",
  "general3",
  "general4",
] as const;

export type BeaconPoolKey = (typeof BEACON_POOL_KEYS)[number];
export type BeaconPoolDefault = BeaconPoolKey | "none";

export interface BeaconPoolConfig {
  readonly pools: Readonly<Record<BeaconPoolKey, readonly string[]>>;
  readonly defaultPool: BeaconPoolDefault;
}

export type BeaconPoolConfigErrorCode =
  "INVALID_CONFIG" | "INVALID_POOL" | "INVALID_CODE" | "DUPLICATE_CODE" | "INVALID_DEFAULT_POOL";

export interface BeaconPoolConfigError {
  readonly code: BeaconPoolConfigErrorCode;
  readonly field: "config" | "pools" | BeaconPoolKey | "defaultPool";
  readonly value?: string;
  readonly message: string;
}

export type BeaconPoolConfigResult =
  | { readonly ok: true; readonly value: BeaconPoolConfig }
  | { readonly ok: false; readonly error: BeaconPoolConfigError };

export type BeaconPoolAllocationResult =
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false; readonly error: BeaconPoolConfigError };

const BEACON_PATTERN = /^[0-7]{4}$/;

export const DEFAULT_BEACON_POOL_CONFIG: BeaconPoolConfig = {
  pools: { ifr: [], vfr: [], general1: [], general2: [], general3: [], general4: [] },
  defaultPool: "none",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPoolKey(value: string): value is BeaconPoolKey {
  return (BEACON_POOL_KEYS as readonly string[]).includes(value);
}

function configError(
  code: BeaconPoolConfigErrorCode,
  field: BeaconPoolConfigError["field"],
  message: string,
  value?: string,
): BeaconPoolConfigError {
  return { code, field, ...(value === undefined ? {} : { value }), message };
}

function normalizedCode(value: string): string {
  return value.trim().toUpperCase();
}

/** Validate and normalize a scenario/world beacon-pool configuration. */
export function createBeaconPoolConfig(input?: unknown): BeaconPoolConfigResult {
  if (input === undefined) return { ok: true, value: DEFAULT_BEACON_POOL_CONFIG };
  if (!isRecord(input)) {
    return {
      ok: false,
      error: configError("INVALID_CONFIG", "config", "beaconPools must be an object"),
    };
  }
  const rawPools = input.pools;
  if (rawPools !== undefined && !isRecord(rawPools)) {
    return {
      ok: false,
      error: configError("INVALID_POOL", "pools", "beaconPools.pools must be an object"),
    };
  }
  for (const key of Object.keys(rawPools ?? {})) {
    if (!isPoolKey(key)) {
      return {
        ok: false,
        error: configError("INVALID_POOL", "pools", `unknown beacon pool key ${key}`, key),
      };
    }
  }

  const pools = {} as Record<BeaconPoolKey, string[]>;
  const seen = new Set<string>();
  for (const key of BEACON_POOL_KEYS) {
    const rawPool = rawPools?.[key];
    if (rawPool === undefined) {
      pools[key] = [];
      continue;
    }
    if (!Array.isArray(rawPool)) {
      return {
        ok: false,
        error: configError("INVALID_POOL", key, `beaconPools.pools.${key} must be an array`),
      };
    }
    const normalizedPool: string[] = [];
    for (const rawCode of rawPool) {
      if (typeof rawCode !== "string" || !BEACON_PATTERN.test(normalizedCode(rawCode))) {
        return {
          ok: false,
          error: configError(
            "INVALID_CODE",
            key,
            `beacon pool ${key} contains a code that is not four octal digits`,
            typeof rawCode === "string" ? rawCode : String(rawCode),
          ),
        };
      }
      const code = normalizedCode(rawCode);
      if (seen.has(code)) {
        return {
          ok: false,
          error: configError(
            "DUPLICATE_CODE",
            key,
            `beacon code ${code} occurs in more than one pool entry`,
            code,
          ),
        };
      }
      seen.add(code);
      normalizedPool.push(code);
    }
    pools[key] = normalizedPool;
  }

  const defaultPool = input.defaultPool === undefined ? "none" : input.defaultPool;
  if (typeof defaultPool !== "string" || (defaultPool !== "none" && !isPoolKey(defaultPool))) {
    return {
      ok: false,
      error: configError(
        "INVALID_DEFAULT_POOL",
        "defaultPool",
        "beaconPools.defaultPool must be none or a known beacon pool key",
        String(defaultPool),
      ),
    };
  }
  return { ok: true, value: { pools, defaultPool } };
}

/** Return one validated pool by key; `none` has no allocation candidates. */
export function beaconPoolFor(
  config: BeaconPoolConfig,
  pool: BeaconPoolDefault,
): readonly string[] {
  return pool === "none" ? [] : config.pools[pool];
}

/** Normalize assigned plan and aircraft values into one occupancy set. */
export function occupiedBeaconCodes(
  flightPlans: ReadonlyArray<{ status: string; assignedBeacon?: string }>,
  aircraft: ReadonlyArray<{ assignedSquawk?: string }> = [],
): Set<string> {
  const occupied = new Set<string>();
  for (const plan of flightPlans) {
    if (plan.status !== "deleted" && plan.assignedBeacon) {
      occupied.add(normalizedCode(plan.assignedBeacon));
    }
  }
  for (const target of aircraft) {
    if (target.assignedSquawk) occupied.add(normalizedCode(target.assignedSquawk));
  }
  return occupied;
}

/** Allocate the first free code in a validated-order trainer pool. */
export function allocateBeaconPoolCode(
  pool: readonly string[],
  occupied: ReadonlySet<string> | readonly string[] = [],
): BeaconPoolAllocationResult {
  const occupiedSet = new Set(Array.from(occupied, normalizedCode));
  const poolCodes = new Set<string>();
  for (const rawCode of pool) {
    if (typeof rawCode !== "string" || !BEACON_PATTERN.test(normalizedCode(rawCode))) {
      return {
        ok: false,
        error: configError(
          "INVALID_CODE",
          "pools",
          "beacon pool contains a non-octal code",
          typeof rawCode === "string" ? rawCode : String(rawCode),
        ),
      };
    }
    const code = normalizedCode(rawCode);
    if (poolCodes.has(code)) {
      return {
        ok: false,
        error: configError("DUPLICATE_CODE", "pools", `beacon pool repeats code ${code}`, code),
      };
    }
    poolCodes.add(code);
  }
  for (const code of poolCodes) {
    if (!occupiedSet.has(code)) return { ok: true, value: code };
  }
  return { ok: true, value: undefined };
}
