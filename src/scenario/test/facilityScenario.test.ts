import { expect, test } from "vitest";
import { buildFixRegistry, createWorld } from "@core";
import {
  assertScenario,
  createWorldForSession,
  createWorldFromScenario,
  listConfigurationsForAirport,
  listDepartureSlots,
  listPlayableScenarios,
  loadCatalog,
  loadKdem,
  loadPlayableScenario,
  starRouteFixIds,
} from "@scenario";
import katl08Json from "../katl-08.json";
import katlJson from "../katl.json";

test("world navigation context carries generic magnetic variation", () => {
  const kdem = loadKdem();
  expect(createWorldFromScenario(kdem).navigation.magVarDeg).toBe(0);

  const katl = assertScenario(katlJson);
  expect(createWorldFromScenario(katl).navigation.magVarDeg).toBe(-5);

  const syntheticPlusFive = createWorld({
    catalog: { ...katl.catalog, airportId: "SYNTH", magVarDeg: 5 },
  });
  expect(syntheticPlusFive.navigation.magVarDeg).toBe(5);
});

test("committed catalog directory loads through loadCatalog without a facility-id branch", () => {
  const catalog = loadCatalog("katl");
  expect(catalog.airportId).toBe("KATL");
  expect(catalog.stars.length).toBeGreaterThan(0);
  expect(catalog.sids.length).toBeGreaterThan(0);
  expect(catalog.approaches.length).toBeGreaterThan(0);
  expect(catalog.atpaVolumes.length).toBeGreaterThan(0);
  const approachIds = new Set(catalog.approaches.map((row) => row.id));
  for (const volume of catalog.atpaVolumes) {
    expect(approachIds.has(volume.approachId)).toBe(true);
  }
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

test("assertScenario loads a catalog facility with the generic KATL video map set", () => {
  for (const raw of [katlJson, katl08Json]) {
    const scenario = assertScenario(raw);
    expect(scenario.icao).toBe(scenario.catalog.airportId);
    expect(scenario.maps.videoMapSet).toBe("KATL");
    expect(scenario.maps.loadedVideoMaps.length).toBeGreaterThan(0);
    expect(scenario.maps.videoMaps.map((row) => row.id)).toEqual(
      scenario.maps.loadedVideoMaps.map((row) => row.id),
    );
    expect(scenario.maps.loadedVideoMaps.every((row) => row.id !== "1")).toBe(true);
    expect(scenario.mva?.airportId).toBe(scenario.icao);
    expect(scenario.mva?.defaultMinAltitudeFt).toBe(3000);
    expect(scenario.mva?.polygons.every((poly) => poly.minAltitudeFt === 3000)).toBe(true);
    expect(scenario.spawnPolicy).toBe("random");
    expect(scenario.departureConfig?.policy).toBe("random");
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

test("catalog-facility arrival definitions stay inside 50 NM of ARP with procedure refs", () => {
  const authoredMinNm = 45;
  const authoredMaxNm = 50;
  const minPairNm = 3;
  for (const raw of [katlJson, katl08Json]) {
    const scenario = assertScenario(raw);
    expect(scenario.spawnPolicy).toBe("random");
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
    for (let i = 0; i < world.aircraft.length; i += 1) {
      const ac = world.aircraft[i]!;
      const arrival = arrivals[i]!;
      if (scenario.spawnPolicy === "authored") {
        expect(Math.hypot(ac.xNm, ac.yNm)).toBeLessThanOrEqual(authoredMaxNm);
      }
      expect(ac.intent.lateral?.type).toBe("PROCEDURE");
      if (ac.intent.lateral?.type !== "PROCEDURE") {
        continue;
      }
      if (scenario.spawnPolicy === "authored") {
        expect(ac.intent.lateral.starId).toBe(arrival.starId);
      }
      const targetId = ac.intent.lateral.routeFixIds[ac.intent.lateral.toFixIndex];
      expect(targetId).toBeDefined();
      const target = registry.require(targetId!);
      if (scenario.spawnPolicy === "authored") {
        expect(Math.hypot(target.xNm, target.yNm)).toBeLessThanOrEqual(rangeMaxNm);
      }
    }
  }
});

test("playable inventory lists a catalog facility with the generic KATL video map set", () => {
  const listed = listPlayableScenarios().filter((entry) => entry.airportIcao === katlJson.icao);
  expect(listed.length).toBeGreaterThanOrEqual(2);
  expect(listed.every((entry) => entry.sessionSetupVisible && !entry.default)).toBe(true);
  expect(listConfigurationsForAirport(katlJson.icao)).toHaveLength(listed.length);
  for (const entry of listed) {
    const scenario = loadPlayableScenario(entry.id);
    expect(scenario.maps.videoMapSet).toBe("KATL");
    expect(scenario.maps.loadedVideoMaps.length).toBeGreaterThan(0);
    expect(scenario.mva?.defaultMinAltitudeFt).toBe(3000);
  }
});

test("createWorldForSession with KATL schedules arrivals without altitude constraint error", () => {
  const scenario = assertScenario(katlJson);
  const world = createWorldFromScenario(scenario, 1);
  expect(world.aircraft).toHaveLength(scenario.arrivals.length);

  // Session with 12 arrivals/hr
  const sessionWorld = createWorldForSession(
    scenario,
    null,
    1,
    { enabled: true, ratePerHour: 10 },
    {
      initialArrivalCount: 6,
      arrivalsPerHour: 12,
      seed: 1,
    },
  );
  expect(sessionWorld.aircraft).toHaveLength(6);
  expect(sessionWorld.arrivalScheduler).toBeDefined();

  // Draining new arrivals from KATL STAR catalog after sim advances
  const initialCount = sessionWorld.aircraft.length;
  sessionWorld.simTimeMs += 300_000;
  const spawned = sessionWorld.arrivalScheduler!.drain(sessionWorld);
  expect(spawned.length).toBeGreaterThanOrEqual(1);
  expect(sessionWorld.aircraft.length).toBeGreaterThan(initialCount);
  for (const ac of spawned) {
    expect(ac.altitudeFt).toBeGreaterThanOrEqual(10000);
    expect(ac.speedKt).toBeGreaterThan(0);
    expect(Number.isFinite(ac.xNm)).toBe(true);
    expect(Number.isFinite(ac.yNm)).toBe(true);
  }
});

test("T04-59 — KATL six-track initial pack spreads across declared arrival routes", () => {
  const scenario = assertScenario(katlJson);
  const world = createWorldForSession(scenario, null, 1, null, {
    initialArrivalCount: 6,
    arrivalsPerHour: 0,
    seed: 1,
  });
  const routeKeys = world.aircraft.map((ac) => {
    if (ac.intent.lateral?.type !== "PROCEDURE") throw new Error("arrival is not on a STAR");
    return `${ac.intent.lateral.starId}/${ac.intent.lateral.routeFixIds[0]}`;
  });
  const declared = new Set(
    scenario.arrivals.map((arrival) => `${arrival.starId}/${arrival.entryFixId}`),
  );
  expect(routeKeys.every((key) => declared.has(key))).toBe(true);
  expect(new Set(routeKeys).size).toBeGreaterThan(1);
});
