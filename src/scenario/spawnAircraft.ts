import { createAircraft, type Aircraft, type AircraftInit, type World } from "@core";
import { allocateSquawkCode } from "./callsigns";

export interface SpawnAircraftParams extends AircraftInit {
  /** Optional seeded source for generated beacon allocation. */
  rng?: () => number;
}

export function usedSquawks(world: World): string[] {
  return world.aircraft.flatMap((aircraft) =>
    [aircraft.squawk, aircraft.assignedSquawk, aircraft.reportedSquawk].filter(
      (code): code is string => code !== undefined,
    ),
  );
}

export function defaultSquawkRng(callsign: string): () => number {
  let hash = 2166136261;
  for (const character of callsign.toUpperCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return () => (hash >>> 0) / 0x100000000;
}

/** Construct and register any spawned aircraft with a unique beacon. */
export function spawnAircraft(world: World, params: SpawnAircraftParams): Aircraft {
  const { rng, ...init } = params;
  const beaconRng = rng ?? defaultSquawkRng(init.callsign);
  const assignedSquawk = init.assignedSquawk ?? allocateSquawkCode(usedSquawks(world), beaconRng);
  const squawk = init.squawk ?? assignedSquawk;
  const aircraft = createAircraft({
    ...init,
    assignedSquawk,
    squawk,
    reportedSquawk: init.reportedSquawk ?? squawk,
  });
  world.aircraft.push(aircraft);
  return aircraft;
}
