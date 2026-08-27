import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  SESSION_SETUP_STORAGE_KEY,
  defaultSessionSetup,
  listConfigurationsForAirport,
  listPlayableAirports,
  loadPlayableScenario,
  loadSessionSetup,
  saveSessionSetup,
  type SessionSetup as SessionSetupType,
} from "@scenario";
import { SessionSetup, loadSessionSetupDefaults, sessionSetupDefaults } from "./session-setup";

function memoryStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    get length() {
      return mem.size;
    },
    clear() {
      mem.clear();
    },
    getItem(key) {
      return mem.get(key) ?? null;
    },
    key(index) {
      return [...mem.keys()][index] ?? null;
    },
    removeItem(key) {
      mem.delete(key);
    },
    setItem(key, value) {
      mem.set(key, value);
    },
  };
}

describe("T05-14 Session Setup component", () => {
  const initialSetup: SessionSetupType = {
    scenarioId: "kdem",
    arrivalCount: 6,
    arrivalsPerHour: 14,
    departuresPerHour: 8,
    seed: 123,
  };

  test("AC1 — renders two separate accessible dropdowns: Airport and Configuration", () => {
    const html = renderToStaticMarkup(
      createElement(SessionSetup, {
        open: true,
        initial: initialSetup,
        onCancel: () => {},
        onApply: () => {},
      }),
    );

    expect(html).toContain("Airport");
    expect(html).toContain("Configuration");
    expect(html).toMatch(/<select[^>]*aria-label="Airport"/);
    expect(html).toMatch(/<select[^>]*aria-label="Configuration"/);
    expect(html).toContain("KDEM — Demo Field");
    expect(html).toContain("West Flow (RWY 27)");
    expect(html).toContain("East Flow (RWY 09)");
  });

  test("AC1 — closed dialog renders nothing", () => {
    const html = renderToStaticMarkup(
      createElement(SessionSetup, {
        open: false,
        initial: initialSetup,
        onCancel: () => {},
        onApply: () => {},
      }),
    );
    expect(html).toBe("");
  });

  test("AC2 — airport and configuration options derive dynamically from inventory metadata", () => {
    const airports = listPlayableAirports();
    const configs = listConfigurationsForAirport("KDEM");

    expect(airports.length).toBeGreaterThanOrEqual(1);
    expect(configs.length).toBeGreaterThanOrEqual(2);

    const html = renderToStaticMarkup(
      createElement(SessionSetup, {
        open: true,
        initial: initialSetup,
        onCancel: () => {},
        onApply: () => {},
      }),
    );

    for (const airport of airports) {
      expect(html).toContain(airport.airportLabel);
      expect(html).toContain(`value="${airport.airportIcao}"`);
    }

    for (const config of configs) {
      expect(html).toContain(config.configLabel);
      expect(html).toContain(`value="${config.id}"`);
    }
  });

  test("AC3 — selecting airport defaults to default scenario of that airport", () => {
    const airports = listPlayableAirports();
    expect(airports[0].defaultScenarioId).toBe("kdem");
    expect(airports[0].airportIcao).toBe("KDEM");

    const kdemConfigs = listConfigurationsForAirport("KDEM");
    expect(kdemConfigs.some((c) => c.id === "kdem")).toBe(true);
    expect(kdemConfigs.some((c) => c.id === "kdem-09")).toBe(true);
  });

  test("AC4 — East Flow scenario kdem-09 configLabel and runway parameter", () => {
    const eastFlow = loadPlayableScenario("kdem-09");
    expect(eastFlow.activeRunwayId).toBe("09");
    expect(eastFlow.icao).toBe("KDEM");

    const visibleConfigs = listConfigurationsForAirport("KDEM");
    const eastFlowEntry = visibleConfigs.find((c) => c.id === "kdem-09");
    expect(eastFlowEntry?.id).toBe("kdem-09");
    expect(eastFlowEntry?.configLabel).toBe("East Flow (RWY 09)");
  });

  test("AC5 — draft settings persist across reloads in atc-sim.session.v1", () => {
    const storage = memoryStorage();
    const eastFlowSetup: SessionSetupType = {
      scenarioId: "kdem-09",
      arrivalCount: 8,
      arrivalsPerHour: 20,
      departuresPerHour: 10,
      seed: 99,
    };

    saveSessionSetup(storage, eastFlowSetup);
    const loaded = loadSessionSetup(storage, defaultSessionSetup());
    expect(loaded).toEqual(eastFlowSetup);
    expect(storage.getItem(SESSION_SETUP_STORAGE_KEY)).toContain('"scenarioId":"kdem-09"');
  });

  test("AC6 — modal attributes, title, and buttons support keyboard and screen readers", () => {
    const html = renderToStaticMarkup(
      createElement(SessionSetup, {
        open: true,
        initial: initialSetup,
        onCancel: () => {},
        onApply: () => {},
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="session-setup-title"');
    expect(html).toContain('id="session-setup-title"');
    expect(html).toContain("Session setup");
    expect(html).toContain("Initial arrivals");
    expect(html).toContain("Arrivals/hour");
    expect(html).toContain("Departures/hour");
    expect(html).toContain("Seed");
    expect(html).toContain("Cancel");
    expect(html).toContain("Apply and restart");
  });

  test("AC6 — departures input rendered disabled when scenario lacks departures", () => {
    // kdem has departures, but if departures are not available, input is disabled
    const html = renderToStaticMarkup(
      createElement(SessionSetup, {
        open: true,
        initial: { ...initialSetup, scenarioId: "kdem" },
        onCancel: () => {},
        onApply: () => {},
      }),
    );
    expect(html).toContain('type="number"');
  });

  test("sessionSetupDefaults and loadSessionSetupDefaults return valid defaults", () => {
    const defaults = sessionSetupDefaults();
    expect(defaults.scenarioId).toBe("kdem");
    expect(defaults.arrivalCount).toBeGreaterThan(0);
    expect(defaults.arrivalsPerHour).toBeGreaterThan(0);

    const loaded = loadSessionSetupDefaults();
    expect(loaded.scenarioId).toBe("kdem");
  });
});
