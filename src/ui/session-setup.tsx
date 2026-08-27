import { useEffect, useRef, useState } from "react";
import {
  ARRIVALS_PER_HOUR_MAX,
  ARRIVALS_PER_HOUR_MIN,
  SESSION_DEPARTURES_PER_HOUR_MAX,
  SESSION_DEPARTURES_PER_HOUR_MIN,
  SESSION_INITIAL_COUNT_MAX,
  SESSION_INITIAL_COUNT_MIN,
  defaultSessionSetup,
  listConfigurationsForAirport,
  listPlayableAirports,
  listPlayableScenarios,
  loadPlayableScenario,
  loadSessionSetup,
  saveSessionSetup,
  type PlayableAirport,
  type PlayableScenario,
  type SessionSetup,
} from "@scenario";

export interface SessionSetupProps {
  open: boolean;
  initial: SessionSetup;
  onCancel: () => void;
  onApply: (setup: SessionSetup) => void;
}

export function SessionSetup({ open, initial, onCancel, onApply }: SessionSetupProps) {
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(initial);
  const airports = listPlayableAirports();
  const allScenarios = listPlayableScenarios();
  const currentScenario = allScenarios.find((entry) => entry.id === draft.scenarioId);
  const selectedAirportIcao = currentScenario?.airportIcao ?? airports[0]?.airportIcao ?? "KDEM";
  const availableConfigs = listConfigurationsForAirport(selectedAirportIcao);
  const selectedEntry =
    availableConfigs.find((entry) => entry.id === draft.scenarioId) ??
    availableConfigs.find((entry) => entry.default) ??
    availableConfigs[0];
  const selectedScenario = selectedEntry ? loadPlayableScenario(selectedEntry.id) : null;
  const departureAvailable =
    selectedScenario?.departureConfig?.policy !== "none" &&
    (selectedScenario?.catalog.sids.length ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    setDraft(initial);
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openerRef.current?.focus();
    };
  }, [initial, onCancel, open]);

  if (!open) return null;

  function update(field: keyof SessionSetup, value: string): void {
    const numberFields: Array<keyof SessionSetup> = [
      "arrivalCount",
      "arrivalsPerHour",
      "departuresPerHour",
      "seed",
    ];
    setDraft((current) => ({
      ...current,
      [field]: numberFields.includes(field) ? Number(value) : value,
    }));
  }

  function handleAirportChange(newIcao: string): void {
    const targetAirport = airports.find((a) => a.airportIcao === newIcao);
    const configs = listConfigurationsForAirport(newIcao);
    const defaultScenarioId = targetAirport?.defaultScenarioId ?? configs[0]?.id;
    if (defaultScenarioId) {
      update("scenarioId", defaultScenarioId);
    }
  }

  function apply(): void {
    if (
      selectedEntry &&
      window.confirm("Apply session setup and restart? Current session will be discarded.")
    ) {
      const next = departureAvailable ? draft : { ...draft, departuresPerHour: 0 };
      saveSessionSetup(window.localStorage, next);
      onApply(next);
    }
  }

  return (
    <div className="session-setup-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="session-setup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-setup-title"
        tabIndex={-1}
      >
        <h2 id="session-setup-title">Session setup</h2>
        <p>Trainer controls apply when starting or restarting a session.</p>
        <label>
          Airport
          <select
            aria-label="Airport"
            value={selectedAirportIcao}
            onChange={(event) => handleAirportChange(event.target.value)}
          >
            {airports.map((airport: PlayableAirport) => (
              <option key={airport.airportIcao} value={airport.airportIcao}>
                {airport.airportLabel}
              </option>
            ))}
          </select>
        </label>
        <label>
          Configuration
          <select
            aria-label="Configuration"
            value={selectedEntry?.id ?? ""}
            onChange={(event) => update("scenarioId", event.target.value)}
          >
            {availableConfigs.map((entry: PlayableScenario) => (
              <option key={entry.id} value={entry.id}>
                {entry.configLabel ?? entry.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Initial arrivals
          <input
            type="number"
            min={SESSION_INITIAL_COUNT_MIN}
            max={SESSION_INITIAL_COUNT_MAX}
            value={draft.arrivalCount}
            onChange={(event) => update("arrivalCount", event.target.value)}
          />
        </label>
        <label>
          Arrivals/hour
          <input
            type="number"
            min={ARRIVALS_PER_HOUR_MIN}
            max={ARRIVALS_PER_HOUR_MAX}
            value={draft.arrivalsPerHour}
            onChange={(event) => update("arrivalsPerHour", event.target.value)}
          />
        </label>
        <label>
          Departures/hour
          <input
            type="number"
            min={SESSION_DEPARTURES_PER_HOUR_MIN}
            max={SESSION_DEPARTURES_PER_HOUR_MAX}
            value={draft.departuresPerHour}
            disabled={!departureAvailable}
            onChange={(event) => update("departuresPerHour", event.target.value)}
          />
        </label>
        {!departureAvailable && (
          <p role="status">
            Departures/hour unavailable: selected scenario has no departure capability.
          </p>
        )}
        <label>
          Seed
          <input
            type="number"
            min={0}
            max={0xffffffff}
            value={draft.seed}
            onChange={(event) => update("seed", event.target.value)}
          />
        </label>
        <div className="session-setup-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={apply} disabled={!selectedEntry}>
            Apply and restart
          </button>
        </div>
      </div>
    </div>
  );
}

export function sessionSetupDefaults(): SessionSetup {
  const entry = listPlayableScenarios().find((item) => item.default && item.sessionSetupVisible);
  return defaultSessionSetup(entry?.id);
}

export function loadSessionSetupDefaults(): SessionSetup {
  const fallback = sessionSetupDefaults();
  return loadSessionSetup(typeof window === "undefined" ? null : window.localStorage, fallback);
}
