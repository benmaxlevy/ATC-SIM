import {
  ARRIVALS_PER_HOUR_MAX,
  ARRIVALS_PER_HOUR_MIN,
  DEFAULT_ARRIVALS_PER_HOUR,
  DEFAULT_INITIAL_ARRIVAL_COUNT,
  validateArrivalTrafficConfig,
  type ArrivalTrafficConfig,
} from "./arrivalScheduler";
import {
  listConfigurationsForAirport,
  listPlayableAirports,
  listPlayableScenarios,
} from "./playableScenarios";
import { loadPlayableScenario } from "./playableScenarios";
import type { Scenario, VfrRequestConfig, VfrTrafficConfig, VfrZone } from "./types";
import {
  DEFAULT_VFR_AIRCRAFT_MIX,
  DEFAULT_VFR_ALTITUDE_MIX,
  getEligibleVfrDestinations,
  validateVfrRequestConfig,
  validateVfrTrafficConfig,
} from "./vfrTraffic";
import type { RegionalFacility } from "./regional";

export { listPlayableAirports, listConfigurationsForAirport };

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
  vfrTraffic?: VfrTrafficConfig;
  vfrRequests?: VfrRequestConfig;
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
  vfrTraffic?: VfrTrafficConfig;
  vfrRequests?: VfrRequestConfig;
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

export function validateSessionSetup(
  value: unknown,
  context?: { vfrZones?: VfrZone[]; regional?: RegionalFacility },
): SessionSetup {
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

  let vfrTraffic: VfrTrafficConfig | undefined;
  if (raw.vfrTraffic !== undefined && raw.vfrTraffic !== null) {
    let resolvedContext = context;
    if (!resolvedContext) {
      try {
        const sc = loadPlayableScenario(scenarioId.trim().toLowerCase());
        resolvedContext = { vfrZones: sc.vfrZones, regional: sc.regional };
      } catch {
        resolvedContext = undefined;
      }
    }
    vfrTraffic = validateVfrTrafficConfig(raw.vfrTraffic, resolvedContext);
  }

  let vfrRequests: VfrRequestConfig | undefined;
  if (raw.vfrRequests !== undefined && raw.vfrRequests !== null) {
    vfrRequests = validateVfrRequestConfig(raw.vfrRequests);
  }

  return {
    scenarioId: scenarioId.trim().toLowerCase(),
    arrivalCount,
    arrivalsPerHour,
    departuresPerHour,
    seed,
    ...(vfrTraffic !== undefined ? { vfrTraffic } : {}),
    ...(vfrRequests !== undefined ? { vfrRequests } : {}),
  };
}

export function defaultSessionSetup(
  scenarioId = listPlayableScenarios().find((entry) => entry.default)?.id ?? "",
  departureCapability = true,
): SessionSetup {
  const selectedId = listPlayableScenarios().some((entry) => entry.id === scenarioId)
    ? scenarioId
    : (listPlayableScenarios().find((entry) => entry.default)?.id ?? scenarioId);
  const scenario = selectedId ? loadPlayableScenario(selectedId) : undefined;
  return {
    scenarioId: selectedId,
    arrivalCount: scenario?.arrivals.length ?? DEFAULT_INITIAL_ARRIVAL_COUNT,
    arrivalsPerHour: DEFAULT_ARRIVALS_PER_HOUR,
    departuresPerHour:
      departureCapability && scenario?.departureConfig?.policy !== "none"
        ? (scenario?.departureConfig?.ratePerHour ?? 0)
        : 0,
    seed: 1,
    ...(scenario?.vfrTraffic ? { vfrTraffic: scenario.vfrTraffic } : {}),
    ...(scenario?.vfrRequests ? { vfrRequests: scenario.vfrRequests } : {}),
  };
}

export function defaultVfrTrafficConfigForScenario(
  scenario?: Scenario,
): VfrTrafficConfig | undefined {
  if (!scenario || !scenario.regional) {
    return undefined;
  }
  // T04-77: spawns sample the fixed ARP-centered training box; no zone authoring.
  const eligibleDests = getEligibleVfrDestinations(scenario.regional);
  const airportBound = eligibleDests.length > 0 ? 20 : 0;
  const local = 100 - airportBound - 20;
  return {
    initialCount: 4,
    targetCount: 4,
    entriesPerHour: 6,
    maxPopulation: 8,
    seed: 1,
    movementMix: {
      localPercent: local,
      transitPercent: 20,
      airportBoundPercent: airportBound,
    },
    aircraftMix: DEFAULT_VFR_AIRCRAFT_MIX,
    altitudeMix: DEFAULT_VFR_ALTITUDE_MIX,
  };
}

export function defaultVfrRequestConfigForScenario(
  scenario?: Scenario,
): VfrRequestConfig | undefined {
  if (!scenario || !scenario.regional) {
    return undefined;
  }
  return {
    flightFollowingPercent: 30,
    ifrPickupPercent: 20,
    requestCapPerHour: 6,
    ifrCancellationPercent: 25,
  };
}

export function serializeSessionSetup(
  setup: SessionSetup,
  context?: { vfrZones?: VfrZone[]; regional?: RegionalFacility },
): string {
  const validated = validateSessionSetup(setup, context);
  return JSON.stringify({ version: SESSION_SETUP_VERSION, ...validated });
}

export function parseSessionSetupStorage(
  raw: string | null,
  context?: { vfrZones?: VfrZone[]; regional?: RegionalFacility },
): SessionSetup | null {
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
    return validateSessionSetup(parsed, context);
  } catch {
    return null;
  }
}

export function loadSessionSetup(
  storage: Storage | null,
  fallback: SessionSetup,
  context?: { vfrZones?: VfrZone[]; regional?: RegionalFacility },
): SessionSetup {
  return (
    parseSessionSetupStorage(storage?.getItem(SESSION_SETUP_STORAGE_KEY) ?? null, context) ??
    fallback
  );
}

export function saveSessionSetup(
  storage: Storage | null,
  setup: SessionSetup,
  context?: { vfrZones?: VfrZone[]; regional?: RegionalFacility },
): void {
  storage?.setItem(SESSION_SETUP_STORAGE_KEY, serializeSessionSetup(setup, context));
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
  context?: { vfrZones?: VfrZone[]; regional?: RegionalFacility },
): SessionSetupResolution {
  let fallback: SessionSetup;
  try {
    fallback = validateSessionSetup(stored ?? defaults, context);
  } catch {
    fallback = validateSessionSetup(defaults, context);
  }
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

  const scenarioChanged = scenarioId !== fallback.scenarioId;
  let targetScenario: Scenario | null = null;
  if (scenarioChanged) {
    try {
      targetScenario = loadPlayableScenario(scenarioId);
    } catch {
      targetScenario = null;
    }
  }
  const vfrTraffic = scenarioChanged ? targetScenario?.vfrTraffic : fallback.vfrTraffic;
  const vfrRequests = scenarioChanged ? targetScenario?.vfrRequests : fallback.vfrRequests;

  let setup: SessionSetup;
  try {
    setup = validateSessionSetup(
      {
        ...fallback,
        scenarioId,
        seed,
        ...(vfrTraffic ? { vfrTraffic } : {}),
        ...(vfrRequests ? { vfrRequests } : {}),
      },
      context,
    );
  } catch {
    setup = validateSessionSetup(
      {
        ...fallback,
        scenarioId,
        seed,
        vfrTraffic: undefined,
        vfrRequests: undefined,
      },
      context,
    );
  }

  return {
    setup,
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

export function vfrTrafficFromSetup(setup: SessionSetup): VfrTrafficConfig | undefined {
  return setup.vfrTraffic;
}

export function vfrRequestsFromSetup(setup: SessionSetup): VfrRequestConfig | undefined {
  return setup.vfrRequests;
}

export function departuresEnabledForScenario(departuresPerHour: number): boolean {
  return departuresPerHour > 0;
}

export function vfrEnabledForScenario(scenario?: Scenario): boolean {
  return Boolean(scenario?.regional);
}
