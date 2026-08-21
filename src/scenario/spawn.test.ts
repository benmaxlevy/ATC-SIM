import { expect, test } from "vitest";
import { assertScenario, createWorldFromScenario, loadKdem } from "@scenario";
import kdemJson from "./kdem.json";

const SPAWN_X_NM = { min: 10, max: 22 };
const SPAWN_Y_NM = { min: 3, max: 12 };
const SPAWN_HEADING_DEG = { min: 80, max: 100 };
const SPAWN_ALT_FT = { min: 6000, max: 10000 };
const SPAWN_SPEED_KT = { min: 210, max: 250 };

test("default KDEM JSON lists 6 arrivals including DAL123 (AC1)", () => {
  expect(kdemJson.arrivals).toHaveLength(6);
  const callsigns = kdemJson.arrivals.map((a) => a.callsign.toUpperCase());
  expect(callsigns).toContain("DAL123");
  expect(callsigns.filter((c) => c.endsWith("123"))).toEqual(["DAL123"]);
});

test("createWorldFromScenario loads real KDEM JSON and meets AC2–AC5 (AC6)", () => {
  const scenario = loadKdem();
  const world = createWorldFromScenario(scenario);

  expect(world.aircraft).toHaveLength(6);

  const dal123 = world.aircraft.find((ac) => ac.callsign === "DAL123");
  expect(dal123).toBeDefined();
  expect(dal123!.xNm).toBeGreaterThanOrEqual(10);
  expect(dal123!.headingDeg).toBe(100);
  expect(dal123!.altitudeFt).toBeGreaterThanOrEqual(SPAWN_ALT_FT.min);
  expect(dal123!.altitudeFt).toBeLessThanOrEqual(SPAWN_ALT_FT.max);
  expect(dal123!.speedKt).toBeGreaterThanOrEqual(SPAWN_SPEED_KT.min);
  expect(dal123!.speedKt).toBeLessThanOrEqual(SPAWN_SPEED_KT.max);

  const callsigns = world.aircraft.map((ac) => ac.callsign);
  expect(new Set(callsigns).size).toBe(callsigns.length);
  for (const callsign of callsigns) {
    expect(callsign).toBe(callsign.toUpperCase());
  }

  for (const ac of world.aircraft) {
    expect(ac.xNm).toBeGreaterThan(0);
    expect(ac.xNm).toBeGreaterThanOrEqual(SPAWN_X_NM.min);
    expect(ac.xNm).toBeLessThanOrEqual(SPAWN_X_NM.max);
    expect(ac.yNm).toBeGreaterThanOrEqual(SPAWN_Y_NM.min);
    expect(ac.yNm).toBeLessThanOrEqual(SPAWN_Y_NM.max);
    expect(ac.headingDeg).toBeGreaterThanOrEqual(SPAWN_HEADING_DEG.min);
    expect(ac.headingDeg).toBeLessThanOrEqual(SPAWN_HEADING_DEG.max);
    expect(ac.altitudeFt).toBeGreaterThanOrEqual(SPAWN_ALT_FT.min);
    expect(ac.altitudeFt).toBeLessThanOrEqual(SPAWN_ALT_FT.max);
    expect(ac.altitudeFt % 100).toBe(0);
    expect(ac.speedKt).toBeGreaterThanOrEqual(SPAWN_SPEED_KT.min);
    expect(ac.speedKt).toBeLessThanOrEqual(SPAWN_SPEED_KT.max);

    expect(ac.intent.assignedHeadingDeg).toBe(ac.headingDeg);
    expect(ac.intent.assignedAltitudeFt).toBe(ac.altitudeFt);
    expect(ac.intent.assignedSpeedKt).toBe(ac.speedKt);
    expect(ac.intent.turn).toBe("SHORTEST");
  }
});

test("loader rejects a fixture with 3 aircraft (AC7)", () => {
  const three = { ...kdemJson, arrivals: kdemJson.arrivals.slice(0, 3) };
  expect(() => assertScenario(three)).toThrow(/arrivals must have 4-8/);
});

test("loader rejects a fixture with duplicate callsigns (AC7)", () => {
  const dup = {
    ...kdemJson,
    arrivals: kdemJson.arrivals.map((arrival, index) =>
      index === 1 ? { ...arrival, callsign: kdemJson.arrivals[0]!.callsign } : arrival,
    ),
  };
  expect(() => assertScenario(dup)).toThrow(/duplicate callsign/);
});

test("src/core does not import scenario JSON", () => {
  const coreSources = import.meta.glob("../core/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  for (const [path, src] of Object.entries(coreSources)) {
    expect(String(src), path).not.toMatch(/kdem\.json/);
    expect(String(src), path).not.toMatch(/from\s+["']@scenario["']/);
  }
});
