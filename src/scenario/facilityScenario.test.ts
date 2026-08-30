import { expect, test } from "vitest";
import {
  assertScenario,
  createWorldFromScenario,
  listDepartureSlots,
  listPlayableScenarios,
  loadCatalog,
  starRouteFixIds,
} from "@scenario";
import katl08Json from "./katl-08.json";
import katlJson from "./katl.json";

test("committed catalog directory loads through loadCatalog without a facility-id branch", () => {
  const catalog = loadCatalog("katl");
  expect(catalog.airportId).toBe("KATL");
  expect(catalog.stars.length).toBeGreaterThan(0);
  expect(catalog.sids.length).toBeGreaterThan(0);
  expect(catalog.approaches.length).toBeGreaterThan(0);
  for (const sid of catalog.sids) {
    const namedLegs =
      sid.common.length +
      (sid.runwayTransitions?.reduce((sum, rt) => sum + rt.legs.length, 0) ?? 0) +
      (sid.enrouteTransitions?.reduce(
        (sum, et) =>
          sum +
          (et.legs?.length ?? 0) +
          (et.runwayTransitions?.reduce((rtSum, rt) => rtSum + rt.legs.length, 0) ?? 0),
        0,
      ) ?? 0);
    expect(namedLegs).toBeGreaterThan(0);
  }
});

test("assertScenario loads a catalog facility without a video map set", () => {
  for (const raw of [katlJson, katl08Json]) {
    const scenario = assertScenario(raw);
    expect(scenario.icao).toBe(scenario.catalog.airportId);
    expect(scenario.maps.videoMapSet).toBeUndefined();
    expect(scenario.maps.videoMaps).toEqual([]);
    expect(scenario.maps.loadedVideoMaps).toEqual([]);
    expect(scenario.mva).toBeNull();
    expect(scenario.spawnPolicy).toBe("authored");
    expect(scenario.departureConfig?.policy).toBe("auto");
    expect(scenario.runways.some((runway) => runway.id === scenario.activeRunwayId)).toBe(true);
    expect(listDepartureSlots(scenario.catalog, scenario.activeRunwayId).length).toBeGreaterThan(0);

    for (const arrival of scenario.arrivals) {
      expect(arrival.starId).toBeDefined();
      expect(arrival.transitionId).toBeDefined();
      const route = starRouteFixIds(scenario.catalog, arrival.starId!, arrival.transitionId!);
      expect(route.length).toBeGreaterThan(1);
    }

    const world = createWorldFromScenario(scenario, 1);
    expect(world.aircraft).toHaveLength(scenario.arrivals.length);
    expect(world.scheduledDepartures?.length ?? 0).toBeGreaterThan(0);
    for (const ac of world.aircraft) {
      expect(ac.intent.lateral?.type).toBe("PROCEDURE");
      expect(ac.intent.vertical?.type).toBe("VIA_STAR");
    }
  }
});

test("playable inventory stays map-backed and does not list a no-map facility", () => {
  expect(listPlayableScenarios().some((entry) => entry.airportIcao === katlJson.icao)).toBe(false);
  expect(listPlayableScenarios().every((entry) => entry.airportIcao === "KDEM")).toBe(true);
});
