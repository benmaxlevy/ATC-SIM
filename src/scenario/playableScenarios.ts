import kdem09Json from "./kdem-09.json";
import kdemIls09Json from "./kdem-ils09.json";
import kdemIls27Json from "./kdem-ils27.json";
import kdemJson from "./kdem.json";
import playableScenariosJson from "./playable-scenarios.json";
import { assertScenario, assertString, isRecord } from "./load";
import type { Scenario } from "./types";
import { ARRIVAL_COUNT_MAX } from "./types";

export interface PlayableScenario {
  id: string;
  airportIcao: string;
  airportName?: string;
  airportLabel?: string;
  label: string;
  configLabel?: string;
  activeRunwayId?: string;
  default: boolean;
  /** False keeps an internal scenario available to URL/tests but off Session setup. */
  sessionSetupVisible: boolean;
  source: string;
}

export interface PlayableAirport {
  airportIcao: string;
  airportLabel: string;
  defaultScenarioId: string;
}

interface PlayableScenarioManifest {
  version: number;
  scenarios: PlayableScenario[];
}

export interface PlayableScenarioInventory {
  list: () => readonly PlayableScenario[];
  load: (id?: string | null) => Scenario;
  listAirports: () => readonly PlayableAirport[];
  listConfigurations: (airportIcao: string) => readonly PlayableScenario[];
}

export type PlayableScenarioSource = unknown | (() => Scenario);
type ScenarioSources = Readonly<Record<string, PlayableScenarioSource>>;

const scenarioSources: ScenarioSources = {
  "scenarios/kdem": kdemJson,
  "scenarios/kdem-09": kdem09Json,
  "scenarios/kdem-ils27": kdemIls27Json,
  "scenarios/kdem-ils09": kdemIls09Json,
};

/**
 * Validated playable-session boundary. New airports add scenario assets plus
 * this inventory registration; boot code never selects a loader by ICAO/id.
 */
export function createPlayableScenarioInventory(
  rawManifest: unknown,
  sources: ScenarioSources,
): PlayableScenarioInventory {
  const manifest = parseManifest(rawManifest);
  const validated = manifest.scenarios.map((entry) => {
    const source = sources[entry.source];
    if (source === undefined) {
      throw new Error(`Playable scenario ${entry.id} source ${entry.source} is missing`);
    }
    const scenario = validateSource(source);
    if (scenario.icao.toUpperCase() !== entry.airportIcao) {
      throw new Error(`Playable scenario ${entry.id} airport ICAO must match source`);
    }
    return { entry, source };
  });
  const defaultEntry = validated.find(({ entry }) => entry.default);
  if (!defaultEntry) {
    throw new Error("Playable scenario inventory requires one default");
  }

  return {
    list: () => validated.map(({ entry }) => ({ ...entry })),
    load: (id) => {
      const chosen = validated.find(({ entry }) => entry.id === id) ?? defaultEntry;
      return validateSource(chosen.source);
    },
    listAirports: () => listPlayableAirports(validated.map(({ entry }) => entry)),
    listConfigurations: (airportIcao) =>
      listConfigurationsForAirport(
        airportIcao,
        validated.map(({ entry }) => entry),
      ),
  };
}

function validateSource(source: PlayableScenarioSource): Scenario {
  return typeof source === "function"
    ? source()
    : assertScenario(source, { arrivalCountMin: 1, arrivalCountMax: ARRIVAL_COUNT_MAX });
}

const inventory = createPlayableScenarioInventory(playableScenariosJson, scenarioSources);

/** Entries are validated with their playable assets before this list is exposed. */
export function listPlayableScenarios(): readonly PlayableScenario[] {
  return inventory.list();
}

/**
 * List unique playable airports derived from validated inventory scenarios.
 */
export function listPlayableAirports(
  scenarios: readonly PlayableScenario[] = inventory.list(),
): readonly PlayableAirport[] {
  const visible = scenarios.filter((entry) => entry.sessionSetupVisible);
  const airports = new Map<string, PlayableAirport>();
  for (const entry of visible) {
    if (!airports.has(entry.airportIcao)) {
      const airportScenarios = visible.filter((s) => s.airportIcao === entry.airportIcao);
      const defaultEntry = airportScenarios.find((s) => s.default) ?? airportScenarios[0];
      const airportName = entry.airportName ?? entry.label.split(" — ")[0];
      const airportLabel = entry.airportLabel ?? `${entry.airportIcao} — ${airportName}`;
      airports.set(entry.airportIcao, {
        airportIcao: entry.airportIcao,
        airportLabel,
        defaultScenarioId: defaultEntry.id,
      });
    }
  }
  return Array.from(airports.values());
}

/**
 * List playable configurations available for a given airport ICAO.
 */
export function listConfigurationsForAirport(
  airportIcao: string,
  scenarios: readonly PlayableScenario[] = inventory.list(),
): readonly PlayableScenario[] {
  const normalized = airportIcao.toUpperCase();
  return scenarios.filter((entry) => entry.sessionSetupVisible && entry.airportIcao === normalized);
}

/**
 * Resolve a stable inventory id. Missing or invalid ids fall back exactly once
 * to the inventory's documented default entry.
 */
export function loadPlayableScenario(id?: string | null): Scenario {
  return inventory.load(id);
}

function parseManifest(value: unknown): PlayableScenarioManifest {
  if (!isRecord(value)) {
    throw new Error("Playable scenario inventory must be an object");
  }
  if (value.version !== 1) {
    throw new Error("Playable scenario inventory version must be 1");
  }
  if (!Array.isArray(value.scenarios) || value.scenarios.length === 0) {
    throw new Error("Playable scenario inventory scenarios must be a non-empty array");
  }

  const ids = new Set<string>();
  let defaults = 0;
  const scenarios = value.scenarios.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new Error(`Playable scenario inventory scenarios[${index}] must be an object`);
    }
    const id = assertString(raw.id, `scenarios[${index}].id`, "Playable scenario inventory", true);
    const airportIcao = assertString(
      raw.airportIcao,
      `scenarios[${index}].airportIcao`,
      "Playable scenario inventory",
      true,
    ).toUpperCase();
    const label = assertString(
      raw.label,
      `scenarios[${index}].label`,
      "Playable scenario inventory",
      true,
    );
    const source = assertString(
      raw.source,
      `scenarios[${index}].source`,
      "Playable scenario inventory",
      true,
    );
    const airportName =
      raw.airportName != null
        ? assertString(
            raw.airportName,
            `scenarios[${index}].airportName`,
            "Playable scenario inventory",
            true,
          )
        : undefined;
    const airportLabel =
      raw.airportLabel != null
        ? assertString(
            raw.airportLabel,
            `scenarios[${index}].airportLabel`,
            "Playable scenario inventory",
            true,
          )
        : undefined;
    const configLabel =
      raw.configLabel != null
        ? assertString(
            raw.configLabel,
            `scenarios[${index}].configLabel`,
            "Playable scenario inventory",
            true,
          )
        : undefined;
    const activeRunwayId =
      raw.activeRunwayId != null
        ? assertString(
            raw.activeRunwayId,
            `scenarios[${index}].activeRunwayId`,
            "Playable scenario inventory",
            true,
          )
        : undefined;
    if (!/^[A-Z0-9]{4}$/.test(airportIcao)) {
      throw new Error(
        `Playable scenario inventory scenarios[${index}].airportIcao must be ICAO-like`,
      );
    }
    if (typeof raw.default !== "boolean") {
      throw new Error(`Playable scenario inventory scenarios[${index}].default must be boolean`);
    }
    if (raw.sessionSetupVisible != null && typeof raw.sessionSetupVisible !== "boolean") {
      throw new Error(
        `Playable scenario inventory scenarios[${index}].sessionSetupVisible must be boolean`,
      );
    }
    if (ids.has(id)) {
      throw new Error(`Playable scenario inventory has duplicate id ${id}`);
    }
    ids.add(id);
    if (raw.default) {
      defaults += 1;
    }
    return {
      id,
      airportIcao,
      airportName,
      airportLabel,
      label,
      configLabel,
      activeRunwayId,
      default: raw.default,
      sessionSetupVisible: raw.sessionSetupVisible !== false,
      source,
    };
  });
  if (defaults !== 1) {
    throw new Error("Playable scenario inventory requires exactly one default");
  }
  return { version: 1, scenarios };
}
