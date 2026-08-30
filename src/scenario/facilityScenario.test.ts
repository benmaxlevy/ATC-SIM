import { expect, test } from "vitest";
import { buildFixRegistry } from "@core";
import {
  assertScenario,
  createWorldFromScenario,
  listConfigurationsForAirport,
  listDepartureSlots,
  listPlayableScenarios,
  loadCatalog,
  loadPlayableScenario,
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
    expect(scenario.mva?.airportId).toBe(scenario.icao);
    expect(scenario.mva?.defaultMinAltitudeFt).toBe(3000);
    expect(scenario.mva?.polygons.every((poly) => poly.minAltitudeFt === 3000)).toBe(true);
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

test("authored catalog-facility arrivals spawn inside 50 NM of ARP with procedure refs", () => {
  const authoredMinNm = 45;
  const authoredMaxNm = 50;
  const minPairNm = 3;
  for (const raw of [katlJson, katl08Json]) {
    const scenario = assertScenario(raw);
    expect(scenario.spawnPolicy).toBe("authored");
    const rangeRings = scenario.maps.rangeRings;
    expect(rangeRings).toBeDefined();
    const rangeMaxNm = rangeRings!.maxNm;
    expect(rangeMaxNm).toBeGreaterThanOrEqual(authoredMaxNm);

    const arrivals = scenario.arrivals;
    expect(arrivals.length).toBeGreaterThanOrEqual(2);
    for (const arrival of arrivals) {
      const distNm = Math.hypot(arrival.xNm, arrival.yNm);
      expect(distNm).toBeGreaterThanOrEqual(authoredMinNm);
      expect(distNm).toBeLessThanOrEqual(authoredMaxNm);
      expect(distNm).toBeLessThanOrEqual(rangeMaxNm);
      expect(arrival.starId).toBeDefined();
      expect(arrival.transitionId).toBeDefined();
      const route = starRouteFixIds(scenario.catalog, arrival.starId!, arrival.transitionId!);
      expect(route.length).toBeGreaterThan(1);
    }

    for (let i = 0; i < arrivals.length; i += 1) {
      for (let j = i + 1; j < arrivals.length; j += 1) {
        const pairNm = Math.hypot(
          arrivals[i]!.xNm - arrivals[j]!.xNm,
          arrivals[i]!.yNm - arrivals[j]!.yNm,
        );
        expect(pairNm).toBeGreaterThanOrEqual(minPairNm);
      }
    }

    const world = createWorldFromScenario(scenario, 1);
    const registry = buildFixRegistry(scenario.catalog);
    expect(world.aircraft).toHaveLength(arrivals.length);
    for (const arrival of arrivals) {
      const ac = world.aircraft.find((row) => row.callsign === arrival.callsign);
      expect(ac).toBeDefined();
      expect(Math.hypot(ac!.xNm, ac!.yNm)).toBeLessThanOrEqual(authoredMaxNm);
      expect(ac!.intent.lateral?.type).toBe("PROCEDURE");
      if (ac!.intent.lateral?.type !== "PROCEDURE") {
        continue;
      }
      expect(ac!.intent.lateral.starId).toBe(arrival.starId);
      const targetId = ac!.intent.lateral.routeFixIds[ac!.intent.lateral.toFixIndex];
      expect(targetId).toBeDefined();
      const target = registry.require(targetId!);
      expect(Math.hypot(target.xNm, target.yNm)).toBeLessThanOrEqual(rangeMaxNm);
    }
  }
});

test("playable inventory lists a catalog facility even without video maps", () => {
  const listed = listPlayableScenarios().filter((entry) => entry.airportIcao === katlJson.icao);
  expect(listed.length).toBeGreaterThanOrEqual(2);
  expect(listed.every((entry) => entry.sessionSetupVisible && !entry.default)).toBe(true);
  expect(listConfigurationsForAirport(katlJson.icao)).toHaveLength(listed.length);
  for (const entry of listed) {
    const scenario = loadPlayableScenario(entry.id);
    expect(scenario.maps.videoMapSet).toBeUndefined();
    expect(scenario.maps.videoMaps).toEqual([]);
    expect(scenario.mva?.defaultMinAltitudeFt).toBe(3000);
  }
});
