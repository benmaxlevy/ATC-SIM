import { useEffect, useRef, useState } from "react";
import {
  ARRIVALS_PER_HOUR_MAX,
  ARRIVALS_PER_HOUR_MIN,
  SESSION_DEPARTURES_PER_HOUR_MAX,
  SESSION_DEPARTURES_PER_HOUR_MIN,
  SESSION_INITIAL_COUNT_MAX,
  SESSION_INITIAL_COUNT_MIN,
  defaultSessionSetup,
  listPlayableScenarios,
  loadPlayableScenario,
  loadSessionSetup,
  saveSessionSetup,
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
  const entries = listPlayableScenarios();
  const selectedEntry = entries.find((entry) => entry.id === draft.scenarioId) ?? entries[0];
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
          Scenario
          <select
            value={selectedEntry?.id ?? ""}
            onChange={(event) => update("scenarioId", event.target.value)}
          >
            {entries.map((entry: PlayableScenario) => (
              <option key={entry.id} value={entry.id}>
                {entry.airportIcao} — {entry.label}
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
        {departureAvailable ? (
          <label>
            Departures/hour
            <input
              type="number"
              min={SESSION_DEPARTURES_PER_HOUR_MIN}
              max={SESSION_DEPARTURES_PER_HOUR_MAX}
              value={draft.departuresPerHour}
              onChange={(event) => update("departuresPerHour", event.target.value)}
            />
          </label>
        ) : (
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
  const entry = listPlayableScenarios().find((item) => item.default);
  return defaultSessionSetup(entry?.id);
}

export function loadSessionSetupDefaults(): SessionSetup {
  const fallback = sessionSetupDefaults();
  return loadSessionSetup(typeof window === "undefined" ? null : window.localStorage, fallback);
}
