import { expect, test } from "vitest";
import { loadKdem } from "./load";
import {
  createPlayableScenarioInventory,
  listConfigurationsForAirport,
  listPlayableAirports,
  listPlayableScenarios,
  loadPlayableScenario,
} from "./playableScenarios";
import { parseScenarioChoice } from "./trafficQuery";

test("T04-24/T04-28/T05-14 AC1/AC2 — shipped inventory lists and loads KDEM scenarios with config metadata", () => {
  expect(listPlayableScenarios()).toEqual([
    {
      id: "kdem",
      airportIcao: "KDEM",
      airportName: "Demo Field",
      label: "Demo Field",
      configLabel: "West Flow (RWY 27)",
      activeRunwayId: "27",
      default: true,
      sessionSetupVisible: true,
      source: "scenarios/kdem",
    },
    {
      id: "kdem-09",
      airportIcao: "KDEM",
      airportName: "Demo Field",
      label: "Demo Field — East Flow (RWY 09)",
      configLabel: "East Flow (RWY 09)",
      activeRunwayId: "09",
      default: false,
      sessionSetupVisible: true,
      source: "scenarios/kdem-09",
    },
    {
      id: "kdem-ils27",
      airportIcao: "KDEM",
      airportName: "Demo Field",
      label: "Demo Field — ILS 27",
      default: false,
      sessionSetupVisible: false,
      source: "scenarios/kdem-ils27",
    },
    {
      id: "kdem-ils09",
      airportIcao: "KDEM",
      airportName: "Demo Field",
      label: "Demo Field — ILS 09",
      default: false,
      sessionSetupVisible: false,
      source: "scenarios/kdem-ils09",
    },
    {
      id: "kdem-atpa",
      airportIcao: "KDEM",
      airportName: "Demo Field",
      label: "Demo Field — ATPA in-trail bench",
      default: false,
      sessionSetupVisible: false,
      source: "scenarios/kdem-atpa",
    },
  ]);
  expect(loadPlayableScenario("kdem-09").activeRunwayId).toBe("09");
  expect(loadPlayableScenario("kdem-ils09").activeRunwayId).toBe("09");
  expect(loadPlayableScenario("kdem-ils27").id).toBe("kdem-ils27");
  expect(loadPlayableScenario("not-playable").icao).toBe("KDEM");
  expect(loadPlayableScenario().icao).toBe("KDEM");
});

test("T05-14 AC2/AC3 — listPlayableAirports and listConfigurationsForAirport return data-driven lists", () => {
  const airports = listPlayableAirports();
  expect(airports).toEqual([
    {
      airportIcao: "KDEM",
      airportLabel: "KDEM — Demo Field",
      defaultScenarioId: "kdem",
    },
  ]);

  const configs = listConfigurationsForAirport("KDEM");
  expect(configs).toHaveLength(2);
  expect(
    configs.map((c) => ({ id: c.id, configLabel: c.configLabel, rwy: c.activeRunwayId })),
  ).toEqual([
    { id: "kdem", configLabel: "West Flow (RWY 27)", rwy: "27" },
    { id: "kdem-09", configLabel: "East Flow (RWY 09)", rwy: "09" },
  ]);

  // Case insensitive ICAO lookup
  expect(listConfigurationsForAirport("kdem")).toEqual(configs);
  expect(listConfigurationsForAirport("UNKNOWN")).toEqual([]);
});

test("T04-24 AC3 / T05-14 AC2 — multiple airports derive airports and configs dynamically", () => {
  const demo = loadKdem();
  const inventory = createPlayableScenarioInventory(
    {
      version: 1,
      scenarios: [
        {
          id: "kdem",
          airportIcao: "KDEM",
          airportName: "Demo Field",
          label: "Demo Field",
          configLabel: "West Flow (RWY 27)",
          activeRunwayId: "27",
          default: true,
          source: "scenarios/kdem",
        },
        {
          id: "tst1-training",
          airportIcao: "TST1",
          airportName: "Test Field",
          label: "Test Field",
          configLabel: "North Flow (RWY 36)",
          activeRunwayId: "36",
          default: false,
          source: "test/tst1",
        },
        {
          id: "tst1-south",
          airportIcao: "TST1",
          airportName: "Test Field",
          label: "Test Field — South Flow",
          configLabel: "South Flow (RWY 18)",
          activeRunwayId: "18",
          default: false,
          source: "test/tst1",
        },
      ],
    },
    {
      "scenarios/kdem": () => demo,
      "test/tst1": () => ({ ...demo, id: "tst1-training", icao: "TST1" }),
    },
  );

  expect(inventory.listAirports()).toEqual([
    {
      airportIcao: "KDEM",
      airportLabel: "KDEM — Demo Field",
      defaultScenarioId: "kdem",
    },
    {
      airportIcao: "TST1",
      airportLabel: "TST1 — Test Field",
      defaultScenarioId: "tst1-training",
    },
  ]);

  expect(inventory.listConfigurations("TST1")).toHaveLength(2);
  expect(inventory.listConfigurations("TST1")[0].configLabel).toBe("North Flow (RWY 36)");
  expect(inventory.listConfigurations("TST1")[1].configLabel).toBe("South Flow (RWY 18)");
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
