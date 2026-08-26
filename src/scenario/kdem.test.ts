import { expect, test } from "vitest";
import { latLonToNm } from "@core";
import { assertScenario, loadKdem } from "@scenario";
import kdemJson from "./kdem.json";

test("kdem.json has frozen Demo Field keys (AC1)", () => {
  expect(kdemJson.icao).toBe("KDEM");
  expect(kdemJson.magVarDeg).toBe(0);
  expect(kdemJson.fieldElevFt).toBe(0);
  expect(kdemJson.activeRunwayId).toBe("27");
});

test("loaded KDEM has runway 27 heading 270 true and mag (AC2)", () => {
  const runway = loadKdem().runways.find((item) => item.id === "27");
  expect(runway).toBeDefined();
  expect(runway).toMatchObject({
    id: "27",
    headingTrueDeg: 270,
    headingMagDeg: 270,
  });
});

test("loaded KDEM has ILS27 on runway 27 (AC3)", () => {
  const approach = loadKdem().approaches.find((item) => item.id === "ILS27");
  expect(approach).toEqual({ id: "ILS27", runwayId: "27", type: "ILS" });
});

test("loaded KDEM has a downwind spawn (AC4)", () => {
  const spawn = loadKdem().spawns.find((item) => item.id === "downwind");
  expect(spawn).toBeDefined();
  expect(spawn?.id).toBe("downwind");
});

test("AC1 — loaded KDEM video maps come from video-maps/KDEM", () => {
  const maps = loadKdem().maps;
  expect(maps.videoMapSet).toBe("KDEM");
  expect(maps.videoMaps.map((item) => item.id)).toEqual([
    "RWY27",
    "LOC27",
    "COAST",
    "DWNWND",
    "CLASS_B",
    "DEM1",
  ]);
  expect(maps.loadedVideoMaps).toHaveLength(6);
});

test("loaded KDEM includes trainer-authored digital map geometry", () => {
  const maps = loadKdem().maps;
  expect(maps.runway).toMatchObject({
    id: "27",
    thresholdEastNm: 0,
    thresholdNorthNm: 0,
    lengthNm: 1.5,
    headingTrueDeg: 270,
    widthNm: 0.025,
  });
  expect(maps.localizer).toMatchObject({
    runwayId: "27",
    courseTrueDeg: 270,
    featherLengthNm: 10,
    halfWidthDeg: 2.5,
  });
  expect(maps.rangeRings).toEqual({ intervalNm: 5, maxNm: 60 });
  expect(maps.coastline?.enabled).toBe(true);
  expect(maps.coastline?.polyline.length).toBeGreaterThanOrEqual(2);
  expect(maps.coastline?.note?.toLowerCase()).toMatch(/fictional/);
});

test("assertScenario keeps spawning when maps.runway is missing", () => {
  const restMaps = {
    videoMaps: [],
    localizer: undefined,
    rangeRings: { intervalNm: 5, maxNm: 60 },
    coastline: undefined,
  };
  const scenario = assertScenario({ ...kdemJson, maps: restMaps });
  expect(scenario.maps.runway).toBeUndefined();
  expect(scenario.maps.videoMaps).toEqual([]);
  expect(scenario.arrivals).toHaveLength(6);
});

test("loadKdem arpNm is origin via T00-04 helpers (AC6)", () => {
  const scenario = loadKdem();
  const expected = latLonToNm(scenario.arp, scenario.arp);
  expect(Math.abs(scenario.arpNm.xNm - 0)).toBeLessThan(1e-9);
  expect(Math.abs(scenario.arpNm.yNm - 0)).toBeLessThan(1e-9);
  expect(Math.abs(scenario.arpNm.xNm - expected.xNm)).toBeLessThan(1e-9);
  expect(Math.abs(scenario.arpNm.yNm - expected.yNm)).toBeLessThan(1e-9);
});

test("T02-27 AC3 — KDEM JSON has 10 GI TEXT slots and at least two non-empty trainer lines", () => {
  expect(kdemJson.giTextLines).toHaveLength(10);
  const filled = kdemJson.giTextLines.filter((line) => line.length > 0);
  expect(filled.length).toBeGreaterThanOrEqual(2);
  expect(filled).toContain("ATIS A");
  expect(filled).toContain("RWY 27");
  const scenario = loadKdem();
  expect(scenario.giTextLines).toHaveLength(10);
  expect(scenario.giTextLines.filter((line) => line.length > 0).length).toBeGreaterThanOrEqual(2);
});

test("assertScenario throws on missing icao or empty runways (AC7)", () => {
  const missingIcao = { ...kdemJson };
  delete (missingIcao as { icao?: string }).icao;
  expect(() => assertScenario(missingIcao)).toThrow(/icao/);

  const emptyRunways = { ...kdemJson, runways: [] };
  expect(() => assertScenario(emptyRunways)).toThrow(/runways/);
});
