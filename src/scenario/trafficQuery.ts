/**
 * Opt-in bench traffic. Default student scenario stays 4–8 from KDEM JSON.
 * Enable with `?traffic=30` (any positive integer). Does not change Command IR.
 *
 * Phase 4 ILS demo: `?scenario=kdem-ils27` (aliases `phase4`, `ils27`).
 * STAR inbound mix: `?seed=` (T04-14). Missing / invalid → 1. Integer 0 is legal.
 */

/** Default `?seed=` when missing or invalid. Integer 0 is a legal override. */
export const DEFAULT_SPAWN_SEED = 1;

/** Parse `?traffic=30`. Invalid / missing → null (use the default 4–8 scenario). */
export function parseTrafficCount(search: string): number | null {
  const raw = new URLSearchParams(search).get("traffic");
  if (raw === null || raw === "") {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) {
    return null;
  }
  return n;
}

/**
 * Parse `?seed=42`. Missing / invalid → `DEFAULT_SPAWN_SEED` (1).
 * Integer `0` is legal. Does not use wall-clock or an unseeded PRNG.
 */
export function parseSpawnSeed(search: string): number {
  const raw = new URLSearchParams(search).get("seed");
  if (raw === null || raw === "") {
    return DEFAULT_SPAWN_SEED;
  }
  if (!/^\d+$/.test(raw)) {
    return DEFAULT_SPAWN_SEED;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0) {
    return DEFAULT_SPAWN_SEED;
  }
  return n;
}

export type ScenarioChoice = "kdem" | "kdem-ils27";

/**
 * `?scenario=kdem-ils27` (or `phase4` / `ils27`) loads the STAR/ILS demo.
 * Missing / unknown → default KDEM student pack.
 */
export function parseScenarioChoice(search: string): ScenarioChoice {
  const raw = new URLSearchParams(search).get("scenario")?.trim().toLowerCase();
  if (raw === "kdem-ils27" || raw === "phase4" || raw === "ils27") {
    return "kdem-ils27";
  }
  return "kdem";
}

export interface DepartureOptions {
  enabled: boolean;
  ratePerHour?: number;
  count?: number;
  seed?: number;
}

/**
 * Parse departure options from URL query string.
 * Supports:
 * - `?departures=auto|off|true|false|1|0`
 * - `?dep_rate=<per_hour>` (positive number)
 * - `?dep_count=<n>` (positive integer)
 * - `?seed=<n>` (non-negative integer)
 */
export function parseDepartureOptions(search: string): DepartureOptions {
  const params = new URLSearchParams(search);
  const rawDep = params.get("departures")?.trim().toLowerCase();
  let enabled = true;

  if (rawDep !== undefined) {
    if (rawDep === "off" || rawDep === "false" || rawDep === "0" || rawDep === "no") {
      enabled = false;
    } else {
      enabled = true;
    }
  }

  const result: DepartureOptions = { enabled };

  const rawRate = params.get("dep_rate");
  if (rawRate !== null && rawRate !== "") {
    const rate = Number(rawRate);
    if (Number.isFinite(rate) && rate > 0) {
      result.ratePerHour = rate;
    }
  }

  const rawCount = params.get("dep_count");
  if (rawCount !== null && rawCount !== "") {
    if (/^\d+$/.test(rawCount)) {
      const count = Number.parseInt(rawCount, 10);
      if (Number.isInteger(count) && count > 0) {
        result.count = count;
      }
    }
  }

  const rawSeed = params.get("seed");
  if (rawSeed !== null && rawSeed !== "") {
    if (/^\d+$/.test(rawSeed)) {
      const seed = Number.parseInt(rawSeed, 10);
      if (Number.isInteger(seed) && seed >= 0) {
        result.seed = seed;
      }
    }
  }

  return result;
}
