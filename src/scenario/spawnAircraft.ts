import {
  createAircraft,
  updateAircraftSquawk,
  type Aircraft,
  type AircraftInit,
  type World,
} from "@core";
import { allocateSquawkCode } from "./callsigns";

export interface SpawnAircraftParams extends AircraftInit {
  /** Optional seeded source for generated beacon allocation. */
  rng?: () => number;
}

function usedSquawks(world: World): string[] {
  return world.aircraft.flatMap((aircraft) =>
    [aircraft.squawk, aircraft.assignedSquawk, aircraft.reportedSquawk].filter(
      (code): code is string => code !== undefined,
    ),
  );
}

function defaultSquawkRng(callsign: string): () => number {
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
  // A spawned transponder report is the same runtime event as a later
  // squawk mutation. Correlate only the reported value; assignedSquawk stays
  // separate plan/aircraft provenance.
  const reportedSquawk = aircraft.reportedSquawk ?? aircraft.squawk;
  if (reportedSquawk !== undefined) {
    updateAircraftSquawk(world, aircraft.id, reportedSquawk);
  }
  return aircraft;
}
