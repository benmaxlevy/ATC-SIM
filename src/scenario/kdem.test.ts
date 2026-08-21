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

test("loaded KDEM video maps are an empty array (AC5)", () => {
  expect(loadKdem().maps.videoMaps).toEqual([]);
});

test("loadKdem arpNm is origin via T00-04 helpers (AC6)", () => {
  const scenario = loadKdem();
  const expected = latLonToNm(scenario.arp, scenario.arp);
  expect(Math.abs(scenario.arpNm.xNm - 0)).toBeLessThan(1e-9);
  expect(Math.abs(scenario.arpNm.yNm - 0)).toBeLessThan(1e-9);
  expect(Math.abs(scenario.arpNm.xNm - expected.xNm)).toBeLessThan(1e-9);
  expect(Math.abs(scenario.arpNm.yNm - expected.yNm)).toBeLessThan(1e-9);
});

test("assertScenario throws on missing icao or empty runways (AC7)", () => {
  const missingIcao = { ...kdemJson };
  delete (missingIcao as { icao?: string }).icao;
  expect(() => assertScenario(missingIcao)).toThrow(/icao/);

  const emptyRunways = { ...kdemJson, runways: [] };
  expect(() => assertScenario(emptyRunways)).toThrow(/runways/);
});
