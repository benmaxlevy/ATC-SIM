import { expect, test } from "vitest";
import { createWorldFromScenario } from "../spawn";
import { FAA_CWT_WAKE_MATRIX, loadPlayableScenario, lookupAtpaWakeMinimum } from "..";

test("KDEM ATPA bench carries explicit CWT categories and scenario-local wake adaptation", () => {
  const scenario = loadPlayableScenario("kdem-atpa");
  const volume27 = scenario.catalog.atpaVolumes.find((volume) => volume.id === "ATPA27");
  const volume09 = scenario.catalog.atpaVolumes.find((volume) => volume.id === "ATPA09");
  expect(volume27?.wakeAdaptation).toEqual(scenario.atpaWakeAdaptation);
  expect(volume09?.wakeAdaptation).toBeUndefined();

  const world = createWorldFromScenario(scenario);
  expect(world.aircraft.map((aircraft) => aircraft.cwtWakeCategory)).toEqual([
    "A",
    "B",
    "C",
    "D",
    "E",
    "I",
  ]);
});

test("KDEM ATPA bench validates every FAA matrix relationship plus NOWGT fallback", () => {
  const scenario = loadPlayableScenario("kdem-atpa");
  const adaptation = scenario.atpaWakeAdaptation;
  expect(adaptation).toBeDefined();

  for (const [leader, row] of Object.entries(FAA_CWT_WAKE_MATRIX)) {
    for (const [follower, expectedNm] of Object.entries(row)) {
      expect(lookupAtpaWakeMinimum(adaptation!, leader, follower)).toMatchObject({
        kind: "wake",
        requiredNm: expectedNm,
      });
    }
  }

  expect(lookupAtpaWakeMinimum(adaptation!, "A", "A")).toMatchObject({
    kind: "nowgt",
    requiredNm: 10,
  });
  expect(lookupAtpaWakeMinimum(adaptation!, undefined, "I")).toMatchObject({
    kind: "nowgt",
    requiredNm: 10,
  });
});
