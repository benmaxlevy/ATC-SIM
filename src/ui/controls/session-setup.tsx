import { useEffect, useRef, useState } from "react";
import {
  ARRIVALS_PER_HOUR_MAX,
  ARRIVALS_PER_HOUR_MIN,
  SESSION_DEPARTURES_PER_HOUR_MAX,
  SESSION_DEPARTURES_PER_HOUR_MIN,
  SESSION_INITIAL_COUNT_MAX,
  SESSION_INITIAL_COUNT_MIN,
  defaultSessionSetup,
  defaultVfrRequestConfigForScenario,
  defaultVfrTrafficConfigForScenario,
  listConfigurationsForAirport,
  listPlayableAirports,
  listPlayableScenarios,
  loadPlayableScenario,
  loadSessionSetup,
  saveSessionSetup,
  validateSessionSetup,
  type PlayableAirport,
  type PlayableScenario,
  type SessionSetup,
  type VfrRequestConfig,
  type VfrTrafficConfig,
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
  const vfrAvailable = Boolean(selectedScenario?.regional);

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
      handleScenarioChange(defaultScenarioId);
    }
  }

  function handleScenarioChange(newScenarioId: string): void {
    let sc = null;
    try {
      sc = loadPlayableScenario(newScenarioId);
    } catch {
      sc = null;
    }
    setDraft((current) => ({
      ...current,
      scenarioId: newScenarioId,
      vfrTraffic: sc?.vfrTraffic,
      vfrRequests: sc?.vfrRequests,
    }));
  }

  function getBaseVfrTraffic(): VfrTrafficConfig {
    return (
      draft.vfrTraffic ??
      selectedScenario?.vfrTraffic ??
      defaultVfrTrafficConfigForScenario(selectedScenario ?? undefined) ?? {
        initialCount: 0,
        targetCount: 0,
        entriesPerHour: 0,
        maxPopulation: 0,
      }
    );
  }

  function updateVfrTrafficField<K extends keyof VfrTrafficConfig>(
    field: K,
    val: VfrTrafficConfig[K],
  ): void {
    setDraft((current) => {
      const base = getBaseVfrTraffic();
      return {
        ...current,
        vfrTraffic: {
          ...base,
          [field]: val,
        },
      };
    });
  }

  function updateZoneWeight(zoneId: string, weight: number): void {
    setDraft((current) => {
      const base = getBaseVfrTraffic();
      const zones = [
        ...(base.zones ?? (selectedScenario?.vfrZones ?? []).map((z) => ({ id: z.id, weight: 1 }))),
      ];
      const idx = zones.findIndex((z) => z.id === zoneId);
      if (idx >= 0) {
        zones[idx] = { id: zoneId, weight };
      } else {
        zones.push({ id: zoneId, weight });
      }
      return {
        ...current,
        vfrTraffic: {
          ...base,
          zones,
        },
      };
    });
  }

  function updateMovementMix(
    field: "localPercent" | "transitPercent" | "airportBoundPercent",
    val: number,
  ): void {
    setDraft((current) => {
      const base = getBaseVfrTraffic();
      const movementMix = {
        localPercent: base.movementMix?.localPercent ?? 100,
        transitPercent: base.movementMix?.transitPercent ?? 0,
        airportBoundPercent: base.movementMix?.airportBoundPercent ?? 0,
        [field]: val,
      };
      return {
        ...current,
        vfrTraffic: {
          ...base,
          movementMix,
        },
      };
    });
  }

  function getBaseVfrRequests(): VfrRequestConfig {
    return (
      draft.vfrRequests ??
      selectedScenario?.vfrRequests ??
      defaultVfrRequestConfigForScenario(selectedScenario ?? undefined) ?? {
        flightFollowingPercent: 0,
        ifrPickupPercent: 0,
        requestCapPerHour: 0,
        ifrCancellationPercent: 0,
      }
    );
  }

  function updateVfrRequestsField<K extends keyof VfrRequestConfig>(
    field: K,
    val: VfrRequestConfig[K],
  ): void {
    setDraft((current) => {
      const base = getBaseVfrRequests();
      return {
        ...current,
        vfrRequests: {
          ...base,
          [field]: val,
        },
      };
    });
  }

  let validationError: string | null = null;
  try {
    validateSessionSetup(
      draft,
      selectedScenario
        ? { vfrZones: selectedScenario.vfrZones, regional: selectedScenario.regional }
        : undefined,
    );
  } catch (err) {
    validationError = err instanceof Error ? err.message : String(err);
  }

  function apply(): void {
    if (validationError) {
      return;
    }
    if (
      selectedEntry &&
      window.confirm("Apply session setup and restart? Current session will be discarded.")
    ) {
      const next = validateSessionSetup(
        {
          ...draft,
          departuresPerHour: departureAvailable ? draft.departuresPerHour : 0,
          vfrTraffic: vfrAvailable ? draft.vfrTraffic : undefined,
          vfrRequests: vfrAvailable ? draft.vfrRequests : undefined,
        },
        selectedScenario
          ? { vfrZones: selectedScenario.vfrZones, regional: selectedScenario.regional }
          : undefined,
      );
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

        {validationError && (
          <p role="alert" className="session-setup-error" style={{ color: "#ff4d4f" }}>
            {validationError}
          </p>
        )}

        <fieldset className="session-setup-group">
          <legend>Facility &amp; Configuration</legend>
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
              onChange={(event) => handleScenarioChange(event.target.value)}
            >
              {availableConfigs.map((entry: PlayableScenario) => (
                <option key={entry.id} value={entry.id}>
                  {entry.configLabel ?? entry.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="session-setup-group">
          <legend>IFR Traffic</legend>
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
        </fieldset>

        <fieldset className="session-setup-group">
          <legend>VFR Traffic &amp; Regional Operations</legend>
          {!vfrAvailable ? (
            <p role="status">
              VFR traffic unavailable: selected scenario has no regional airport or airspace data.
            </p>
          ) : (
            <>
              <p className="session-setup-help">
                Target replenishment maintains background population via exits, while entries/hour
                injects scheduled arrivals. Both are bounded by maximum population.
              </p>
              <label>
                Initial VFR count
                <input
                  type="number"
                  min={0}
                  value={draft.vfrTraffic?.initialCount ?? 0}
                  onChange={(event) =>
                    updateVfrTrafficField("initialCount", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Target VFR population
                <input
                  type="number"
                  min={0}
                  value={draft.vfrTraffic?.targetCount ?? 0}
                  onChange={(event) =>
                    updateVfrTrafficField("targetCount", Number(event.target.value))
                  }
                />
              </label>
              <label>
                VFR entries/hour
                <input
                  type="number"
                  min={0}
                  value={draft.vfrTraffic?.entriesPerHour ?? 0}
                  onChange={(event) =>
                    updateVfrTrafficField("entriesPerHour", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Maximum VFR population
                <input
                  type="number"
                  min={0}
                  value={draft.vfrTraffic?.maxPopulation ?? 0}
                  onChange={(event) =>
                    updateVfrTrafficField("maxPopulation", Number(event.target.value))
                  }
                />
              </label>

              {selectedScenario?.vfrZones && selectedScenario.vfrZones.length > 0 && (
                <fieldset className="session-setup-subgroup">
                  <legend>Named zone weights</legend>
                  <p className="session-setup-help">
                    Relative positive weights for scenario practice/geographic zones.
                  </p>
                  {selectedScenario.vfrZones.map((zone) => {
                    const currentWeight =
                      draft.vfrTraffic?.zones?.find((z) => z.id === zone.id)?.weight ?? 1;
                    return (
                      <label key={zone.id}>
                        {zone.name ?? zone.id} weight
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={currentWeight}
                          onChange={(event) =>
                            updateZoneWeight(zone.id, Number(event.target.value))
                          }
                        />
                      </label>
                    );
                  })}
                </fieldset>
              )}

              <fieldset className="session-setup-subgroup">
                <legend>Movement mix (%)</legend>
                <p className="session-setup-help">
                  Local, transit, and airport-bound percentages must sum to 100%.
                </p>
                <label>
                  Local movement %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.vfrTraffic?.movementMix?.localPercent ?? 100}
                    onChange={(event) =>
                      updateMovementMix("localPercent", Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  Transit movement %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.vfrTraffic?.movementMix?.transitPercent ?? 0}
                    onChange={(event) =>
                      updateMovementMix("transitPercent", Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  Airport-bound %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.vfrTraffic?.movementMix?.airportBoundPercent ?? 0}
                    onChange={(event) =>
                      updateMovementMix("airportBoundPercent", Number(event.target.value))
                    }
                  />
                </label>
              </fieldset>

              <fieldset className="session-setup-subgroup">
                <legend>VFR pilot requests &amp; service</legend>
                <p className="session-setup-help">
                  Combined new service requests per hour (pacing 3,600,000 / cap ms). Flight
                  following % + IFR pickup % must be &le; 100%.
                </p>
                <label>
                  Flight following %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.vfrRequests?.flightFollowingPercent ?? 0}
                    onChange={(event) =>
                      updateVfrRequestsField("flightFollowingPercent", Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  IFR pickup %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.vfrRequests?.ifrPickupPercent ?? 0}
                    onChange={(event) =>
                      updateVfrRequestsField("ifrPickupPercent", Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  Request cap/hour
                  <input
                    type="number"
                    min={0}
                    value={draft.vfrRequests?.requestCapPerHour ?? 0}
                    onChange={(event) =>
                      updateVfrRequestsField("requestCapPerHour", Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  IFR cancellation %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.vfrRequests?.ifrCancellationPercent ?? 0}
                    onChange={(event) =>
                      updateVfrRequestsField("ifrCancellationPercent", Number(event.target.value))
                    }
                  />
                </label>
              </fieldset>
            </>
          )}
        </fieldset>

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
          <button
            type="button"
            onClick={apply}
            disabled={!selectedEntry || Boolean(validationError)}
          >
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
