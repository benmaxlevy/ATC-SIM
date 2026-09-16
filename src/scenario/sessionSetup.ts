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
import type { Scenario, VfrRequestConfig, VfrTrafficConfig } from "./types";
import {
  DEFAULT_VFR_AIRCRAFT_MIX,
  DEFAULT_VFR_ALTITUDE_MIX,
  fixedVfrMovementMix,
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

/** VFR density preset ids. `custom` is display-only, never persisted. */
export type VfrDensityPresetId = "off" | "light" | "moderate" | "busy";
export type VfrDensitySelection = VfrDensityPresetId | "custom";

export interface VfrDensityNumbers {
  initialCount: number;
  targetCount: number;
  entriesPerHour: number;
  maxPopulation: number;
  requestCapPerHour: number;
  flightFollowingPercent: number;
  ifrPickupPercent: number;
  ifrCancellationPercent: number;
}

/**
 * VFR density presets (T04-78). UI mapping only; persisted storage keeps full
 * numbers. Moderate equals the T04-76 defaults.
 */
export const VFR_DENSITY_PRESETS: Record<Exclude<VfrDensityPresetId, "off">, VfrDensityNumbers> = {
  light: {
    initialCount: 2,
    targetCount: 2,
    entriesPerHour: 3,
    maxPopulation: 4,
    requestCapPerHour: 3,
    flightFollowingPercent: 20,
    ifrPickupPercent: 10,
    ifrCancellationPercent: 10,
  },
  moderate: {
    initialCount: 4,
    targetCount: 4,
    entriesPerHour: 6,
    maxPopulation: 8,
    requestCapPerHour: 6,
    flightFollowingPercent: 30,
    ifrPickupPercent: 20,
    ifrCancellationPercent: 25,
  },
  busy: {
    initialCount: 6,
    targetCount: 8,
    entriesPerHour: 12,
    maxPopulation: 12,
    requestCapPerHour: 10,
    flightFollowingPercent: 40,
    ifrPickupPercent: 30,
    ifrCancellationPercent: 25,
  },
};

function densityNumbersEqual(a: VfrDensityNumbers, b: VfrDensityNumbers): boolean {
  return (
    a.initialCount === b.initialCount &&
    a.targetCount === b.targetCount &&
    a.entriesPerHour === b.entriesPerHour &&
    a.maxPopulation === b.maxPopulation &&
    a.requestCapPerHour === b.requestCapPerHour &&
    a.flightFollowingPercent === b.flightFollowingPercent &&
    a.ifrPickupPercent === b.ifrPickupPercent &&
    a.ifrCancellationPercent === b.ifrCancellationPercent
  );
}

/** Extract the 8 tuned numbers; null when VFR is off (no VFR keys). */
export function vfrDensityNumbersFromSetup(setup: SessionSetup): VfrDensityNumbers | null {
  if (!setup.vfrTraffic && !setup.vfrRequests) {
    return null;
  }
  return {
    initialCount: setup.vfrTraffic?.initialCount ?? 0,
    targetCount: setup.vfrTraffic?.targetCount ?? 0,
    entriesPerHour: setup.vfrTraffic?.entriesPerHour ?? 0,
    maxPopulation: setup.vfrTraffic?.maxPopulation ?? 0,
    requestCapPerHour: setup.vfrRequests?.requestCapPerHour ?? 0,
    flightFollowingPercent: setup.vfrRequests?.flightFollowingPercent ?? 0,
    ifrPickupPercent: setup.vfrRequests?.ifrPickupPercent ?? 0,
    ifrCancellationPercent: setup.vfrRequests?.ifrCancellationPercent ?? 0,
  };
}

/** Derive the density selection: `off` when no VFR keys, preset on exact match, else `custom`. */
export function matchVfrDensityPreset(numbers: VfrDensityNumbers | null): VfrDensitySelection {
  if (!numbers) {
    return "off";
  }
  for (const id of Object.keys(VFR_DENSITY_PRESETS) as Array<Exclude<VfrDensityPresetId, "off">>) {
    if (densityNumbersEqual(numbers, VFR_DENSITY_PRESETS[id])) {
      return id;
    }
  }
  return "custom";
}

/**
 * Build VFR configs for a density preset. Off returns no keys (matches
 * legacy-disabled load). Other presets carry the fixed 60/20/20 movement mix
 * with airport-bound folded to local when the scenario has no eligible
 * destinations. Results still pass through upstream validation on apply.
 */
export function applyVfrDensityPreset(
  preset: VfrDensityPresetId,
  scenario?: Scenario,
): Pick<SessionSetup, "vfrTraffic" | "vfrRequests"> {
  if (preset === "off") {
    return {};
  }
  const numbers = VFR_DENSITY_PRESETS[preset];
  return {
    vfrTraffic: {
      initialCount: numbers.initialCount,
      targetCount: numbers.targetCount,
      entriesPerHour: numbers.entriesPerHour,
      maxPopulation: numbers.maxPopulation,
      seed: 1,
      movementMix: fixedVfrMovementMix(scenario?.regional),
      aircraftMix: DEFAULT_VFR_AIRCRAFT_MIX,
      altitudeMix: DEFAULT_VFR_ALTITUDE_MIX,
    },
    vfrRequests: {
      flightFollowingPercent: numbers.flightFollowingPercent,
      ifrPickupPercent: numbers.ifrPickupPercent,
      requestCapPerHour: numbers.requestCapPerHour,
      ifrCancellationPercent: numbers.ifrCancellationPercent,
    },
  };
}

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
  context?: { regional?: RegionalFacility },
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
        resolvedContext = { regional: sc.regional };
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
  // T04-78: fixed trainer mix (60/20/20, airport-bound folds to local with no
  // eligible destinations); spawns sample the fixed ARP-centered training box.
  return {
    initialCount: 4,
    targetCount: 4,
    entriesPerHour: 6,
    maxPopulation: 8,
    seed: 1,
    movementMix: fixedVfrMovementMix(scenario.regional),
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
  context?: { regional?: RegionalFacility },
): string {
  const validated = validateSessionSetup(setup, context);
  return JSON.stringify({ version: SESSION_SETUP_VERSION, ...validated });
}

export function parseSessionSetupStorage(
  raw: string | null,
  context?: { regional?: RegionalFacility },
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
  context?: { regional?: RegionalFacility },
): SessionSetup {
  return (
    parseSessionSetupStorage(storage?.getItem(SESSION_SETUP_STORAGE_KEY) ?? null, context) ??
    fallback
  );
}

export function saveSessionSetup(
  storage: Storage | null,
  setup: SessionSetup,
  context?: { regional?: RegionalFacility },
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
  context?: { regional?: RegionalFacility },
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
