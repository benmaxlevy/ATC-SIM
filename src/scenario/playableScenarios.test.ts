import { expect, test } from "vitest";
import { loadKdem } from "./load";
import {
  createPlayableScenarioInventory,
  listPlayableScenarios,
  loadPlayableScenario,
} from "./playableScenarios";
import { parseScenarioChoice } from "./trafficQuery";

test("T04-24 AC1/AC2 — shipped inventory lists and loads KDEM scenarios", () => {
  expect(listPlayableScenarios()).toEqual([
    {
      id: "kdem",
      airportIcao: "KDEM",
      label: "Demo Field",
      default: true,
      sessionSetupVisible: true,
      source: "scenarios/kdem",
    },
    {
      id: "kdem-ils27",
      airportIcao: "KDEM",
      label: "Demo Field — ILS 27",
      default: false,
      sessionSetupVisible: false,
      source: "scenarios/kdem-ils27",
    },
  ]);
  expect(loadPlayableScenario("kdem-ils27").id).toBe("kdem-ils27");
  expect(loadPlayableScenario("not-playable").icao).toBe("KDEM");
  expect(loadPlayableScenario().icao).toBe("KDEM");
});

test("T04-24 AC3 — another test-only airport entry needs inventory data, not selection code", () => {
  const demo = loadKdem();
  const inventory = createPlayableScenarioInventory(
    {
      version: 1,
      scenarios: [
        {
          id: "tst1-training",
          airportIcao: "TST1",
          label: "Test Field",
          default: true,
          source: "test/tst1",
        },
      ],
    },
    {
      "test/tst1": () => ({ ...demo, id: "tst1-training", icao: "TST1" }),
    },
  );

  expect(inventory.list()[0]).toMatchObject({ id: "tst1-training", airportIcao: "TST1" });
  expect(inventory.load("tst1-training").icao).toBe("TST1");
});

test("T04-24 AC4 — invalid metadata or missing asset rejects before listing", () => {
  expect(() =>
    createPlayableScenarioInventory(
      {
        version: 1,
        scenarios: [
          {
            id: "broken",
            airportIcao: "KDEM",
            label: "Broken",
            default: true,
            source: "missing",
          },
        ],
      },
      {},
    ),
  ).toThrow(/source missing/);

  expect(() =>
    createPlayableScenarioInventory(
      {
        version: 1,
        scenarios: [
          {
            id: "broken-asset",
            airportIcao: "KDEM",
            label: "Broken asset",
            default: true,
            source: "test/broken",
          },
        ],
      },
      { "test/broken": () => ({ ...loadKdem(), icao: "TST1" }) },
    ),
  ).toThrow(/airport ICAO must match source/);
});

test("T04-24 AC5 — query resolves inventory id and preserves ILS scenario", () => {
  expect(parseScenarioChoice("?scenario=kdem-ils27")).toBe("kdem-ils27");
  expect(loadPlayableScenario(parseScenarioChoice("?scenario=kdem-ils27")).id).toBe("kdem-ils27");
  expect(loadPlayableScenario(parseScenarioChoice("?scenario=unknown")).icao).toBe("KDEM");
});
