import { expect, test } from "vitest";
import { stepWorld } from "@core";
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
    "B",
    "C",
    "E",
    "I",
    "E",
    "I",
  ]);
  expect(world.aircraft.slice(0, 4).map((aircraft) => aircraft.xNm)).toEqual([2, 6.5, 11, 14.5]);
  expect(world.aircraft.slice(0, 4).every((aircraft) => aircraft.yNm === 0)).toBe(true);
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

test("KDEM ATPA bench starts with monitor, warning, and alert pairs", () => {
  const scenario = loadPlayableScenario("kdem-atpa");
  const world = createWorldFromScenario(scenario);

  stepWorld(world, 0);

  expect(world.alerts.atpa).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ status: "monitor", wakeSource: "wake", requiredNm: 3.5 }),
      expect.objectContaining({ status: "warning", wakeSource: "wake", requiredNm: 4 }),
      expect.objectContaining({ status: "alert", wakeSource: "wake", requiredNm: 4 }),
    ]),
  );
  expect(world.alerts.atpa.map((pair) => pair.status).sort()).toEqual([
    "alert",
    "monitor",
    "warning",
  ]);
  expect(world.alerts.atpa).toHaveLength(3);
});
