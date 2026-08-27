import {
  createAircraft,
  createWorld,
  MSAW_FAF_DISTANCE_NM,
  normalizeHeadingDeg,
  SessionLog,
  offerInboundHandoff,
  setHandoffNone,
  type Aircraft,
  type MsawInhibitGeom,
  type ScheduledDeparture,
  type World,
} from "@core";
import type { ArrivalSpawn, Scenario } from "./types";
import { assignStarRoutes, starRouteFixIds } from "./starSpawn";
import { DEFAULT_SPAWN_SEED, type DepartureOptions } from "./trafficQuery";
import { generateDepartureSchedule, spawnDueDepartures } from "./departureGenerator";
import {
  createArrivalScheduler,
  type ArrivalScheduler,
  type ArrivalTrafficConfig,
} from "./arrivalScheduler";
import { resolveRunwayHeading, resolveRunwayThreshold } from "./departureSpawn";

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
 * Centers and orients downwind relative to the active runway.
 */
function downwindArcArrival(index: number, count: number, scenario?: Scenario): ArrivalSpawn {
  const t = count <= 1 ? 0.5 : index / (count - 1);
  const bearingDeg = ARC_START_DEG + t * (ARC_END_DEG - ARC_START_DEG);
  const rad = (bearingDeg * Math.PI) / 180;
  const radiusNm = ARC_RADIUS_NM + (index % 3) * 0.4;
  const airline = AIRLINES[index % AIRLINES.length]!;

  const activeRunwayId = scenario?.activeRunwayId ?? "27";
  const catalog = scenario?.catalog;
  const threshold = catalog ? resolveRunwayThreshold(catalog, activeRunwayId) : { xNm: 0, yNm: 0 };
  const rwyHeading = catalog
    ? resolveRunwayHeading(catalog, undefined, activeRunwayId)
    : 270;
  const downwindHeading = normalizeHeadingDeg(rwyHeading + 180);

  return {
    callsign: `${airline}${200 + index}`,
    xNm: threshold.xNm + radiusNm * Math.sin(rad),
    yNm: threshold.yNm + radiusNm * Math.cos(rad),
    headingDeg: downwindHeading,
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
  setHandoffNone(world, ac.id);
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

/**
 * Analog: JO 7110.65 descend via / AIM Descend Via — default pack is already
 * on the published STAR (pre-armed VIA, same as T04-12 spawn-on-VIA).
 * Trainer delta: pose from catalog + seeded slot mix; JSON xy is a placeholder.
 */
function spawnStarInbound(world: World, scenario: Scenario, seed: number): void {
  const assignments = assignStarRoutes({
    catalog: scenario.catalog,
    count: scenario.arrivals.length,
    seed,
    activeRunwayId: scenario.activeRunwayId,
  });
  for (let i = 0; i < scenario.arrivals.length; i += 1) {
    const arrival = scenario.arrivals[i]!;
    const assigned = assignments[i]!;
    const ac = createAircraft({
      callsign: arrival.callsign,
      xNm: assigned.pose.xNm,
      yNm: assigned.pose.yNm,
      headingDeg: assigned.pose.headingDeg,
      altitudeFt: assigned.pose.altitudeFt,
      speedKt: assigned.pose.speedKt,
      aircraftType: arrival.aircraftType,
    });
    ac.intent.lateral = {
      type: "PROCEDURE",
      starId: assigned.starId,
      toFixIndex: 0,
      routeFixIds: assigned.pose.routeFixIds,
    };
    ac.intent.vertical = { type: "VIA_STAR", starId: assigned.starId, sense: "DESCEND" };
    world.aircraft.push(ac);
    offerInboundHandoff(world, ac);
  }
}

function spawnDownwindArc(world: World, n: number, scenario?: Scenario): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`spawnArrivals count must be a positive integer (got ${String(n)})`);
  }
  for (let i = 0; i < n; i += 1) {
    spawnArrival(world, downwindArcArrival(i, n, scenario));
  }
}

/**
 * Create each arrival with `createAircraft` and push onto `world.aircraft`.
 * Intent defaults to hold-present so they fly straight until a command.
 *
 * `spawnArrivals(world, scenario)` — authored JSON poses (ils27 / downwind fixture).
 * `spawnArrivals(world, n, scenario?)` — bench helper: `n` jets on a wide downwind arc
 * (`?traffic=30`). Does not change Command IR.
 */
export function spawnArrivals(world: World, n: number, scenario?: Scenario): void;
export function spawnArrivals(world: World, scenario: Scenario): void;
export function spawnArrivals(
  world: World,
  source: number | Scenario,
  scenarioOpt?: Scenario,
): void {
  if (typeof source === "number") {
    spawnDownwindArc(world, source, scenarioOpt);
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
    sessionLog: new SessionLog(),
  });
}

function initDepartures(
  world: World,
  scenario: Scenario,
  seed: number,
  departureOptions?: DepartureOptions | null,
): void {
  const isQuerySpecified = departureOptions !== undefined && departureOptions !== null;
  const isEnabled = isQuerySpecified
    ? departureOptions.enabled
    : scenario.departureConfig?.policy !== "none" && (scenario.catalog?.sids?.length ?? 0) > 0;

  if (!isEnabled) {
    return;
  }

  let schedule: ScheduledDeparture[];
  if (
    !isQuerySpecified &&
    scenario.departureConfig?.policy === "authored" &&
    scenario.departureConfig.departures &&
    scenario.departureConfig.departures.length > 0
  ) {
    schedule = scenario.departureConfig.departures.map((d) => ({
      callsign: d.callsign,
      sidId: d.sidId,
      transitionId: d.transitionId,
      runwayId: scenario.activeRunwayId,
      assignedAltitudeFt: d.assignedAltitudeFt,
      aircraftType: d.aircraftType ?? "B738",
      scheduledSimMs: d.scheduledSimMs ?? 60_000,
      spawned: false,
    }));
  } else {
    const depSeed = departureOptions?.seed ?? seed;
    schedule = generateDepartureSchedule({
      catalog: scenario.catalog,
      seed: depSeed,
      ratePerHour: departureOptions?.ratePerHour ?? scenario.departureConfig?.ratePerHour,
      count: departureOptions?.count,
      runwayId: scenario.activeRunwayId,
      activeCallsigns: world.aircraft.map((a) => a.callsign),
      startSimMs: world.simTimeMs,
    });
  }

  world.scheduledDepartures = schedule;
  world.departureSpawner = spawnDueDepartures;

  if (world.sessionLog) {
    for (const dep of schedule) {
      world.sessionLog.append({
        type: "departure.scheduled",
        atSimMs: world.simTimeMs,
        atWallMs: 0,
        callsign: dep.callsign,
        sidId: dep.sidId,
        transitionId: dep.transitionId || undefined,
        runwayId: dep.runwayId,
        scheduledSimMs: dep.scheduledSimMs,
      });
    }
  }
}

/**
 * Build a World from the scenario. `star-inbound` uses `assignStarRoutes`
 * (seeded catalog pose). `authored` copies JSON xy (ils27 / T01-04 fixture).
 */
export function createWorldFromScenario(
  scenario: Scenario,
  seed: number = DEFAULT_SPAWN_SEED,
): World {
  const world = worldFromScenario(scenario);
  if (scenario.spawnPolicy === "star-inbound") {
    spawnStarInbound(world, scenario, seed);
  } else {
    spawnArrivals(world, scenario);
  }
  initDepartures(world, scenario, seed, null);
  return world;
}

/**
 * Default student world follows `spawnPolicy`. `trafficCount` (`?traffic=30`)
 * replaces a **star-inbound** list with the downwind-arc FPS bench.
 * `authored` (ils27) ignores trafficCount and seed for pose.
 */
export function createWorldForSession(
  scenario: Scenario,
  trafficCount: number | null,
  seed: number = DEFAULT_SPAWN_SEED,
  departureOptions?: DepartureOptions | null,
  arrivalTraffic?: ArrivalTrafficConfig,
): World {
  let world: World;
  if (scenario.spawnPolicy === "star-inbound" && trafficCount !== null) {
    world = worldFromScenario(scenario);
    spawnArrivals(world, trafficCount, scenario);
  } else {
    world = worldFromScenario(scenario);
    if (scenario.spawnPolicy === "star-inbound") {
      const scheduler: ArrivalScheduler = createArrivalScheduler(
        scenario.catalog,
        { ...arrivalTraffic, seed: arrivalTraffic?.seed ?? seed, activeRunwayId: scenario.activeRunwayId },
        scenario.arrivals.map((arrival) => arrival.callsign),
        world.simTimeMs,
        scenario.activeRunwayId,
      );
      world.arrivalScheduler = scheduler;
      scheduler.drain(world);
    } else {
      spawnArrivals(world, scenario);
    }
  }
  initDepartures(world, scenario, seed, departureOptions);
  return world;
}
