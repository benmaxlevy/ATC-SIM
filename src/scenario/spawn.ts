import {
  createAircraft,
  createWorld,
  MSAW_FAF_DISTANCE_NM,
  type Aircraft,
  type MsawInhibitGeom,
  type World,
} from "@core";
import type { ArrivalSpawn, Scenario } from "./types";
import { starRouteFixIds } from "./starSpawn";

export { starRouteFixIds };

/** Left downwind for KDEM RWY 27 (true heading 090, north of the field). */
const DOWNWIND_HEADING_DEG = 90;
const ARC_RADIUS_NM = 12;
const ARC_START_DEG = 20;
const ARC_END_DEG = 160;
const AIRLINES = ["DAL", "AAL", "UAL", "SWA", "JBU", "NKS", "ASA", "FFT", "SKW", "RPA"] as const;

/**
 * Place `n` jets on a wide downwind arc so they do not sit in one pixel.
 * Bench / `?traffic=30` only — does not replace the default 4–8 KDEM JSON.
 */
function downwindArcArrival(index: number, count: number): ArrivalSpawn {
  const t = count <= 1 ? 0.5 : index / (count - 1);
  const bearingDeg = ARC_START_DEG + t * (ARC_END_DEG - ARC_START_DEG);
  const rad = (bearingDeg * Math.PI) / 180;
  const radiusNm = ARC_RADIUS_NM + (index % 3) * 0.4;
  const airline = AIRLINES[index % AIRLINES.length]!;
  return {
    callsign: `${airline}${200 + index}`,
    xNm: radiusNm * Math.sin(rad),
    yNm: radiusNm * Math.cos(rad),
    headingDeg: DOWNWIND_HEADING_DEG,
    altitudeFt: 6000 + (index % 9) * 400,
    speedKt: 210 + (index % 5) * 8,
    aircraftType: "B738",
  };
}

function spawnArrival(world: World, arrival: ArrivalSpawn, scenario?: Scenario): void {
  const ac = createAircraft({
    callsign: arrival.callsign,
    xNm: arrival.xNm,
    yNm: arrival.yNm,
    headingDeg: arrival.headingDeg,
    altitudeFt: arrival.altitudeFt,
    speedKt: arrival.speedKt,
    aircraftType: arrival.aircraftType,
  });
  if (scenario) {
    armStarVia(ac, scenario, arrival);
  }
  world.aircraft.push(ac);
}

function armStarVia(ac: Aircraft, scenario: Scenario, arrival: ArrivalSpawn): void {
  if (!arrival.starId || !arrival.transitionId) {
    return;
  }
  const routeFixIds = starRouteFixIds(scenario.catalog, arrival.starId, arrival.transitionId);
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: arrival.starId,
    toFixIndex: 0,
    routeFixIds,
  };
  ac.intent.vertical = { type: "VIA_STAR", starId: arrival.starId, sense: "DESCEND" };
}

function spawnDownwindArc(world: World, n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`spawnArrivals count must be a positive integer (got ${String(n)})`);
  }
  for (let i = 0; i < n; i += 1) {
    spawnArrival(world, downwindArcArrival(i, n));
  }
}

/**
 * Create each arrival with `createAircraft` and push onto `world.aircraft`.
 * Intent defaults to hold-present so they fly straight until a command.
 *
 * `spawnArrivals(world, scenario)` — student JSON (4–8).
 * `spawnArrivals(world, n)` — bench helper: `n` jets on a wide downwind arc
 * (`?traffic=30`). Does not change Command IR.
 */
export function spawnArrivals(world: World, n: number): void;
export function spawnArrivals(world: World, scenario: Scenario): void;
export function spawnArrivals(world: World, source: number | Scenario): void {
  if (typeof source === "number") {
    spawnDownwindArc(world, source);
    return;
  }
  for (const arrival of source.arrivals) {
    spawnArrival(world, arrival, source);
  }
}

function msawInhibitFromScenario(scenario: Scenario): MsawInhibitGeom | null {
  if (!scenario.mva) {
    return null;
  }
  const threshold = scenario.catalog.fixes.find((fix) => fix.id === "RW27");
  const ils = scenario.catalog.approaches.find((approach) => approach.id === "ILS27");
  return {
    thresholdXNm: threshold?.xNm ?? 0,
    thresholdYNm: threshold?.yNm ?? 0,
    fafDistanceNm: ils?.fafDistanceNm ?? MSAW_FAF_DISTANCE_NM,
  };
}

function worldFromScenario(scenario: Scenario): World {
  return createWorld({
    catalog: scenario.catalog,
    mvaChart: scenario.mva,
    msawInhibit: msawInhibitFromScenario(scenario),
  });
}

/** Build a World whose aircraft list comes from scenario JSON, not PPI hardcoding. */
export function createWorldFromScenario(scenario: Scenario): World {
  const world = worldFromScenario(scenario);
  spawnArrivals(world, scenario);
  return world;
}

/**
 * Default student world is 4–8 from JSON. `trafficCount` (from `?traffic=30`)
 * replaces that list with a downwind-arc pack of that size.
 */
export function createWorldForSession(scenario: Scenario, trafficCount: number | null): World {
  if (trafficCount === null) {
    return createWorldFromScenario(scenario);
  }
  const world = worldFromScenario(scenario);
  spawnArrivals(world, trafficCount);
  return world;
}
