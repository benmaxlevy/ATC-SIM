import { expect, test } from "vitest";
import {
  createWorldFromScenario,
  loadKdem09,
  loadKdemIls09,
  parseScenarioChoice,
  starRouteFixIds,
} from "@scenario";
import kdem09Json from "./kdem-09.json";
import kdemIls09Json from "./kdem-ils09.json";

test("T04-28 AC2 — kdem-09.json and kdem-ils09.json validate against schema with activeRunwayId 09", () => {
  expect(kdem09Json.activeRunwayId).toBe("09");
  expect(kdem09Json.runways[0]?.id).toBe("09");
  expect(kdem09Json.runways[0]?.headingTrueDeg).toBe(90);
  expect(kdem09Json.approaches[0]?.id).toBe("ILS09");
  expect(kdem09Json.approaches[0]?.runwayId).toBe("09");
  expect(kdem09Json.giTextLines).toContain("RWY 09");

  const scenario09 = loadKdem09();
  expect(scenario09.activeRunwayId).toBe("09");
  expect(scenario09.approaches.some((a) => a.id === "ILS09")).toBe(true);

  expect(kdemIls09Json.activeRunwayId).toBe("09");
  const scenarioIls09 = loadKdemIls09();
  expect(scenarioIls09.activeRunwayId).toBe("09");
  expect(scenarioIls09.id).toBe("kdem-ils09");
});

test("T04-28 AC4 — loadKdemIls09 spawns DAL123 on DEM1 WN and AAL45 on DEM1 WS with VIA", () => {
  const scenario = loadKdemIls09();
  expect(scenario.arrivals).toHaveLength(2);

  const world = createWorldFromScenario(scenario);
  expect(world.aircraft).toHaveLength(2);

  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123");
  expect(dal).toBeDefined();
  expect(dal!.altitudeFt).toBeGreaterThanOrEqual(10000);
  expect(dal!.speedKt).toBe(250);
  expect(dal!.xNm).toBe(-18.5);
  expect(dal!.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["WEMAX", "WELBO", "WENJO", "WEMER"],
  });
  expect(dal!.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });

  const aal = world.aircraft.find((ac) => ac.callsign === "AAL45");
  expect(aal).toBeDefined();
  expect(aal!.xNm).toBe(-17);
  expect(aal!.yNm).toBe(-12);
  expect(aal!.intent.lateral?.type).toBe("PROCEDURE");
  expect(
    aal!.intent.lateral && aal!.intent.lateral.type === "PROCEDURE" && aal!.intent.lateral.starId,
  ).toBe("DEM1");
  expect(aal!.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
  expect(starRouteFixIds(scenario.catalog, "DEM1", "WS")).toEqual([
    "SAMAX",
    "SALBO",
    "SANJO",
    "WEMER",
  ]);
});

test("T04-28 — parseScenarioChoice resolves kdem-09 and kdem-ils09", () => {
  expect(parseScenarioChoice("?scenario=kdem-09")).toBe("kdem-09");
  expect(parseScenarioChoice("?scenario=kdem-ils09")).toBe("kdem-ils09");
});
