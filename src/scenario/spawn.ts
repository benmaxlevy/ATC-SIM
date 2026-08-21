import { createAircraft, createWorld, type World } from "@core";
import type { Scenario } from "./types";

/**
 * Create each arrival with `createAircraft` and push onto `world.aircraft`.
 * Intent defaults to hold-present so they fly straight until a command.
 */
export function spawnArrivals(world: World, scenario: Scenario): void {
  for (const arrival of scenario.arrivals) {
    world.aircraft.push(
      createAircraft({
        callsign: arrival.callsign,
        xNm: arrival.xNm,
        yNm: arrival.yNm,
        headingDeg: arrival.headingDeg,
        altitudeFt: arrival.altitudeFt,
        speedKt: arrival.speedKt,
      }),
    );
  }
}

/** Build a World whose aircraft list comes from scenario JSON, not PPI hardcoding. */
export function createWorldFromScenario(scenario: Scenario): World {
  const world = createWorld();
  spawnArrivals(world, scenario);
  return world;
}
