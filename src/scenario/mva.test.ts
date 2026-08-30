import { expect, test } from "vitest";
import { evaluateMsaw, makeTestAircraft, msawFloorFt } from "@core";
import { createWorldFromScenario, loadKdem, loadMva, parseMvaChart } from "@scenario";
import kdemMvaJson from "./data/kdem-mva.json";

test("parseMvaChart rejects empty polygons and short rings", () => {
  expect(() => parseMvaChart(null)).toThrow(/must be an object/);
  expect(() =>
    parseMvaChart({
      airportId: "KDEM",
      defaultMinAltitudeFt: 4000,
      polygons: [],
    }),
  ).toThrow(/non-empty/);
  expect(() =>
    parseMvaChart({
      airportId: "KDEM",
      defaultMinAltitudeFt: 4000,
      polygons: [
        {
          id: "thin",
          minAltitudeFt: 1500,
          verticesNm: [
            { xNm: 0, yNm: 0 },
            { xNm: 1, yNm: 0 },
          ],
        },
      ],
    }),
  ).toThrow(/at least 3 vertices/);
});

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

test("loadMva returns a uniform-floor chart when facility MVA JSON exists", () => {
  expect(loadMva("XXXX")).toBeNull();
  const chart = loadMva("KATL");
  expect(chart).not.toBeNull();
  expect(chart!.airportId.length).toBe(4);
  expect(chart!.defaultMinAltitudeFt).toBe(3000);
  expect(chart!.polygons.length).toBeGreaterThan(0);
  expect(chart!.polygons.every((poly) => poly.minAltitudeFt === 3000)).toBe(true);
  expect(chart!.note?.toLowerCase()).toMatch(/not faa/);
  expect(chart!.note?.toLowerCase()).toMatch(/not operational/);
  expect(msawFloorFt(0, 0, chart!)).toBe(3000);
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
