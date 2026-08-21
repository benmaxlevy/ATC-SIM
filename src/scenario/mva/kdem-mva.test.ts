import { expect, test } from "vitest";
import { evaluateMsaw, makeTestAircraft } from "@core";
import { createWorldFromScenario, loadKdem, loadMva, parseMvaChart } from "@scenario";
import kdemMvaJson from "../data/kdem-mva.json";

test("KDEM MVA JSON is committed and parses (rectangles v1, not certified)", () => {
  const chart = parseMvaChart(kdemMvaJson);
  expect(chart.airportId).toBe("KDEM");
  expect(chart.polygons.length).toBeGreaterThanOrEqual(2);
  const floors = new Set(chart.polygons.map((poly) => poly.minAltitudeFt));
  expect(floors.has(1500)).toBe(true);
  expect(floors.has(2500)).toBe(true);
  expect(chart.note?.toLowerCase()).toMatch(/not certified/);
  expect(chart.note?.toLowerCase()).toMatch(/rectangles v1/);
});

test("loadMva(KDEM) matches parse of kdem-mva.json", () => {
  const loaded = loadMva("KDEM");
  expect(loaded).toEqual(parseMvaChart(kdemMvaJson));
  expect(loadMva("XXXX")).toBeNull();
});

test("loadKdem attaches the MVA chart and RW27 / 6 NM inhibit", () => {
  const scenario = loadKdem();
  expect(scenario.mva?.airportId).toBe("KDEM");
  const inner = scenario.mva?.polygons.find((poly) => poly.id === "inner");
  expect(inner?.minAltitudeFt).toBe(1500);
  const world = createWorldFromScenario(scenario);
  expect(world.mvaChart).toEqual(scenario.mva);
  expect(world.msawInhibit).toEqual({
    thresholdXNm: 0,
    thresholdYNm: 0,
    fafDistanceNm: 6,
  });
});

test("AC1/AC2 — loaded KDEM MVA floors drive caution then alert", () => {
  const chart = loadMva("KDEM")!;
  const innerF = chart.polygons.find((poly) => poly.id === "inner")!.minAltitudeFt;
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 2,
    yNm: 2,
    headingDeg: 270,
    altitudeFt: innerF - 100,
    speedKt: 0,
  });
  expect(evaluateMsaw([dal], chart)[0]?.severity).toBe("caution");
  dal.altitudeFt = innerF - 400;
  expect(evaluateMsaw([dal], chart)[0]?.severity).toBe("alert");
  dal.altitudeFt = 1400;
  expect(innerF).toBe(1500);
  expect(evaluateMsaw([dal], chart)[0]?.severity).toBe("caution");
  dal.altitudeFt = 1000;
  expect(evaluateMsaw([dal], chart)[0]?.severity).toBe("alert");
});
