import { describe, expect, test } from "vitest";
import {
  defaultSessionSetup,
  listConfigurationsForAirport,
  listPlayableAirports,
  parseSessionSetupStorage,
  resolveSessionSetup,
  serializeSessionSetup,
  validateSessionSetup,
} from "@scenario";

const setup = {
  scenarioId: "kdem",
  arrivalCount: 4,
  arrivalsPerHour: 12,
  departuresPerHour: 6,
  seed: 42,
};

describe("T05-13 / T05-14 session setup", () => {
  test("round trips versioned drafts and rejects corrupt JSON", () => {
    expect(parseSessionSetupStorage(serializeSessionSetup(setup))).toEqual(setup);
    expect(parseSessionSetupStorage("{not json")).toBeNull();
    expect(parseSessionSetupStorage(JSON.stringify({ version: 2, ...setup }))).toBeNull();
  });

  test("round trips East Flow (kdem-09) draft", () => {
    const eastFlowSetup = { ...setup, scenarioId: "kdem-09" };
    expect(parseSessionSetupStorage(serializeSessionSetup(eastFlowSetup))).toEqual(eastFlowSetup);
  });

  test("query overrides stored draft, stored overrides defaults", () => {
    const resolved = resolveSessionSetup(
      "?scenario=kdem-ils27&seed=0&traffic=30",
      defaultSessionSetup(),
      setup,
    );
    expect(resolved.setup).toEqual({ ...setup, scenarioId: "kdem-ils27", seed: 0 });
    expect(resolved.trafficBenchmarkCount).toBe(30);
  });

  test("query selecting kdem-09 resolves East Flow scenarioId", () => {
    const resolved = resolveSessionSetup("?scenario=kdem-09", defaultSessionSetup(), setup);
    expect(resolved.setup.scenarioId).toBe("kdem-09");
  });

  test("invalid query values do not replace draft", () => {
    expect(resolveSessionSetup("?seed=-1&traffic=no", defaultSessionSetup(), setup)).toEqual({
      setup,
      trafficBenchmarkCount: null,
    });
  });

  test("validates trainer traffic bounds", () => {
    expect(() => validateSessionSetup({ ...setup, arrivalCount: 31 })).toThrow();
    expect(() => validateSessionSetup({ ...setup, departuresPerHour: 61 })).toThrow();
  });

  test("re-exports listPlayableAirports and listConfigurationsForAirport", () => {
    expect(typeof listPlayableAirports).toBe("function");
    expect(typeof listConfigurationsForAirport).toBe("function");
    expect(listPlayableAirports()).toHaveLength(1);
    expect(listPlayableAirports()[0].airportIcao).toBe("KDEM");
    expect(listConfigurationsForAirport("KDEM")).toHaveLength(2);
  });
});
