import { expect, test } from "vitest";
import {
  createWorldFromScenario,
  loadKdemIls27,
  parseScenarioChoice,
  starRouteFixIds,
} from "@scenario";
import kdemIls27Json from "../kdem-ils27.json";

test("AC1 — phase 4 scenario spawns DAL123 on DEM1 north with VIA, and ILS27 exists", () => {
  expect(kdemIls27Json.arrivals).toHaveLength(2);
  const scenario = loadKdemIls27();
  expect(scenario.id).toBe("kdem-ils27");
  expect(scenario.catalog.approaches.some((item) => item.id === "ILS27")).toBe(true);

  const world = createWorldFromScenario(scenario);
  expect(world.aircraft).toHaveLength(2);

  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123");
  expect(dal).toBeDefined();
  expect(dal!.altitudeFt).toBeGreaterThanOrEqual(10000);
  expect(dal!.speedKt).toBe(250);
  expect(dal!.yNm).toBeGreaterThan(12);
  expect(dal!.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  });
  expect(dal!.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });

  const aal = world.aircraft.find((ac) => ac.callsign === "AAL45");
  expect(aal).toBeDefined();
  expect(aal!.xNm).toBe(17);
  expect(aal!.yNm).toBe(-12);
  expect(aal!.intent.lateral?.type).toBe("PROCEDURE");
  expect(
    aal!.intent.lateral && aal!.intent.lateral.type === "PROCEDURE" && aal!.intent.lateral.starId,
  ).toBe("DEM1");
  expect(aal!.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
  expect(starRouteFixIds(scenario.catalog, "DEM1", "S")).toEqual([
    "SEMAX",
    "SELBO",
    "SJOIN",
    "MERGE",
  ]);
});

test("?scenario=kdem-ils27 selects the phase 4 pack; default stays KDEM", () => {
  expect(parseScenarioChoice("")).toBeNull();
  expect(parseScenarioChoice("?traffic=30")).toBeNull();
  expect(parseScenarioChoice("?scenario=kdem")).toBe("kdem");
  expect(parseScenarioChoice("?scenario=kdem-ils27")).toBe("kdem-ils27");
  expect(parseScenarioChoice("?scenario=unknown")).toBe("unknown");
});
