import { expect, test } from "vitest";
import { loadKdem } from "../load";
import { loadVideoMapSet } from "../loadVideoMaps";
import {
  createPlayableScenarioInventory,
  listConfigurationsForAirport,
  listPlayableAirports,
  listPlayableScenarios,
  loadPlayableScenario,
} from "../playableScenarios";
import { parseScenarioChoice } from "../trafficQuery";

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
    {
      id: "katl",
      airportIcao: "KATL",
      airportName: "Hartsfield-Jackson Atlanta Intl",
      label: "Hartsfield-Jackson Atlanta Intl",
      configLabel: "West Flow (RWY 26R)",
      activeRunwayId: "26R",
      default: false,
      sessionSetupVisible: true,
      source: "scenarios/katl",
    },
    {
      id: "katl-08",
      airportIcao: "KATL",
      airportName: "Hartsfield-Jackson Atlanta Intl",
      label: "Hartsfield-Jackson Atlanta Intl — East Flow (RWY 08L)",
      configLabel: "East Flow (RWY 08L)",
      activeRunwayId: "08L",
      default: false,
      sessionSetupVisible: true,
      source: "scenarios/katl-08",
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
    {
      airportIcao: "KATL",
      airportLabel: "KATL — Hartsfield-Jackson Atlanta Intl",
      defaultScenarioId: "katl",
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

  const katlConfigs = listConfigurationsForAirport("KATL");
  expect(katlConfigs).toHaveLength(2);
  expect(
    katlConfigs.map((c) => ({ id: c.id, configLabel: c.configLabel, rwy: c.activeRunwayId })),
  ).toEqual([
    { id: "katl", configLabel: "West Flow (RWY 26R)", rwy: "26R" },
    { id: "katl-08", configLabel: "East Flow (RWY 08L)", rwy: "08L" },
  ]);

  // Case insensitive ICAO lookup
  expect(listConfigurationsForAirport("kdem")).toEqual(configs);
  expect(listConfigurationsForAirport("katl")).toEqual(katlConfigs);
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

test("T04-35 AC1 — every playable scenario loads catalog through generic loaders", () => {
  const listed = listPlayableScenarios();
  expect(listed.length).toBeGreaterThan(0);
  for (const entry of listed) {
    const scenario = loadPlayableScenario(entry.id);
    expect(scenario.catalog.airportId).toBe(entry.airportIcao);
    if (scenario.maps.videoMapSet) {
      const maps = loadVideoMapSet(scenario.maps.videoMapSet);
      expect(maps.length).toBeGreaterThan(0);
    } else {
      expect(scenario.maps.videoMaps).toEqual([]);
      expect(scenario.maps.loadedVideoMaps).toEqual([]);
    }
    expect(scenario.mva).not.toBeNull();
    expect(scenario.mva!.polygons.length).toBeGreaterThan(0);
    expect(scenario.spawns.length).toBeGreaterThan(0);
  }
});

test("T04-35 AC2 — KDEM remains default; KATL configurations are session-visible", () => {
  expect(loadPlayableScenario().icao).toBe("KDEM");
  expect(loadPlayableScenario(null).icao).toBe("KDEM");
  const defaults = listPlayableScenarios().filter((entry) => entry.default);
  expect(defaults).toEqual([
    expect.objectContaining({ id: "kdem", airportIcao: "KDEM", default: true }),
  ]);
  const katl = listPlayableScenarios().filter((entry) => entry.airportIcao === "KATL");
  expect(katl.length).toBeGreaterThanOrEqual(2);
  expect(katl.every((entry) => entry.sessionSetupVisible && !entry.default)).toBe(true);
  expect(listPlayableAirports().map((row) => row.airportIcao)).toEqual(["KDEM", "KATL"]);
});
