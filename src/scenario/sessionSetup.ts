import {
  ARRIVALS_PER_HOUR_MAX,
  ARRIVALS_PER_HOUR_MIN,
  DEFAULT_ARRIVALS_PER_HOUR,
  DEFAULT_INITIAL_ARRIVAL_COUNT,
  validateArrivalTrafficConfig,
  type ArrivalTrafficConfig,
} from "./arrivalScheduler";
import { listPlayableScenarios } from "./playableScenarios";

export const SESSION_SETUP_STORAGE_KEY = "atc-sim.session.v1";
export const SESSION_SETUP_VERSION = 1;
export const SESSION_INITIAL_COUNT_MIN = 0;
export const SESSION_INITIAL_COUNT_MAX = 30;
export const SESSION_DEPARTURES_PER_HOUR_MIN = 0;
export const SESSION_DEPARTURES_PER_HOUR_MAX = 60;

export interface SessionSetup {
  scenarioId: string;
  arrivalCount: number;
  arrivalsPerHour: number;
  departuresPerHour: number;
  seed: number;
}

export interface SessionSetupDraft extends SessionSetup {
  version: typeof SESSION_SETUP_VERSION;
}

export interface SessionSetupDefaults {
  scenarioId: string;
  arrivalCount: number;
  arrivalsPerHour: number;
  departuresPerHour: number;
  seed: number;
}

export interface SessionSetupResolution {
  setup: SessionSetup;
  trafficBenchmarkCount: number | null;
}

function integerInRange(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

export function validateSessionSetup(value: unknown): SessionSetup {
  if (!value || typeof value !== "object") {
    throw new Error("Session setup must be an object");
  }
  const raw = value as Record<string, unknown>;
  const scenarioId = raw.scenarioId;
  if (typeof scenarioId !== "string" || scenarioId.trim() === "") {
    throw new Error("Session setup scenarioId is required");
  }
  const arrivalCount = integerInRange(
    raw.arrivalCount,
    SESSION_INITIAL_COUNT_MIN,
    SESSION_INITIAL_COUNT_MAX,
    "arrivalCount",
  );
  const arrivalsPerHour = raw.arrivalsPerHour;
  if (
    typeof arrivalsPerHour !== "number" ||
    !Number.isFinite(arrivalsPerHour) ||
    arrivalsPerHour < ARRIVALS_PER_HOUR_MIN ||
    arrivalsPerHour > ARRIVALS_PER_HOUR_MAX
  ) {
    throw new Error(
      `arrivalsPerHour must be in [${ARRIVALS_PER_HOUR_MIN}, ${ARRIVALS_PER_HOUR_MAX}]`,
    );
  }
  const departuresPerHour = integerInRange(
    raw.departuresPerHour,
    SESSION_DEPARTURES_PER_HOUR_MIN,
    SESSION_DEPARTURES_PER_HOUR_MAX,
    "departuresPerHour",
  );
  const seed = integerInRange(raw.seed, 0, 0xffffffff, "seed");
  validateArrivalTrafficConfig({ initialArrivalCount: arrivalCount, arrivalsPerHour, seed });
  return {
    scenarioId: scenarioId.trim().toLowerCase(),
    arrivalCount,
    arrivalsPerHour,
    departuresPerHour,
    seed,
  };
}

export function defaultSessionSetup(
  scenarioId = listPlayableScenarios().find((entry) => entry.default)?.id ?? "",
  departureCapability = true,
): SessionSetup {
  return {
    scenarioId,
    arrivalCount: DEFAULT_INITIAL_ARRIVAL_COUNT,
    arrivalsPerHour: DEFAULT_ARRIVALS_PER_HOUR,
    departuresPerHour: departureCapability ? 0 : 0,
    seed: 1,
  };
}

export function serializeSessionSetup(setup: SessionSetup): string {
  const validated = validateSessionSetup(setup);
  return JSON.stringify({ version: SESSION_SETUP_VERSION, ...validated });
}

export function parseSessionSetupStorage(raw: string | null): SessionSetup | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as Record<string, unknown>).version !== 1
    ) {
      return null;
    }
    return validateSessionSetup(parsed);
  } catch {
    return null;
  }
}

export function loadSessionSetup(storage: Storage | null, fallback: SessionSetup): SessionSetup {
  return parseSessionSetupStorage(storage?.getItem(SESSION_SETUP_STORAGE_KEY) ?? null) ?? fallback;
}

export function saveSessionSetup(storage: Storage | null, setup: SessionSetup): void {
  storage?.setItem(SESSION_SETUP_STORAGE_KEY, serializeSessionSetup(setup));
}

function queryInteger(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number,
): number | null {
  const raw = params.get(key);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/**
 * Query values win over the stored draft, which wins over defaults. `traffic=N`
 * remains an explicit downwind FPS benchmark and does not become normal arrivals.
 */
export function resolveSessionSetup(
  search: string,
  defaults: SessionSetup,
  stored: SessionSetup | null = null,
): SessionSetupResolution {
  const fallback = validateSessionSetup(stored ?? defaults);
  const params = new URLSearchParams(search);
  const requestedScenario = params.get("scenario")?.trim().toLowerCase();
  const inventoryIds = new Set(listPlayableScenarios().map((entry) => entry.id));
  const scenarioId =
    requestedScenario && inventoryIds.has(requestedScenario)
      ? requestedScenario
      : inventoryIds.has(fallback.scenarioId)
        ? fallback.scenarioId
        : (listPlayableScenarios().find((entry) => entry.default)?.id ?? fallback.scenarioId);
  const seed = queryInteger(params, "seed", 0, 0xffffffff) ?? fallback.seed;
  const trafficBenchmarkCount = queryInteger(params, "traffic", 1, Number.MAX_SAFE_INTEGER);
  return {
    setup: validateSessionSetup({
      ...fallback,
      scenarioId,
      seed,
    }),
    trafficBenchmarkCount,
  };
}

export function arrivalTrafficFromSetup(setup: SessionSetup): ArrivalTrafficConfig {
  return {
    initialArrivalCount: setup.arrivalCount,
    arrivalsPerHour: setup.arrivalsPerHour,
    seed: setup.seed,
  };
}

export function departuresEnabledForScenario(departuresPerHour: number): boolean {
  return departuresPerHour > 0;
}
