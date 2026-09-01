import {
  createAircraft,
  createWorld,
  MSAW_FAF_DISTANCE_NM,
  mulberry32,
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
import { assignStarRoutes, authoredStarToFixIndex, starRouteFixIds } from "./starSpawn";
import { DEFAULT_SPAWN_SEED, type DepartureOptions } from "./trafficQuery";
import {
  DEPARTURE_STREAM_XOR,
  generateDepartureSchedule,
  spawnDueDepartures,
} from "./departureGenerator";
import {
  createArrivalScheduler,
  type ArrivalScheduler,
  type ArrivalTrafficConfig,
} from "./arrivalScheduler";
import { resolveRunwayHeading, resolveRunwayThreshold } from "./departureSpawn";
import { allocateCallsign, usedCallsignSet } from "./callsigns";

export { starRouteFixIds };

const ARC_RADIUS_NM = 12;
const ARC_START_DEG = 20;
const ARC_END_DEG = 160;

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

  const activeRunwayId = scenario?.activeRunwayId ?? "27";
  const catalog = scenario?.catalog;
  const threshold = catalog ? resolveRunwayThreshold(catalog, activeRunwayId) : { xNm: 0, yNm: 0 };
  const rwyHeading = catalog ? resolveRunwayHeading(catalog, undefined, activeRunwayId) : 270;
  const downwindHeading = normalizeHeadingDeg(rwyHeading + 180);

  return {
    xNm: threshold.xNm + radiusNm * Math.sin(rad),
    yNm: threshold.yNm + radiusNm * Math.cos(rad),
    headingDeg: downwindHeading,
    altitudeFt: 6000 + (index % 9) * 400,
    speedKt: 210 + (index % 5) * 8,
    aircraftType: "B738",
  };
}

function spawnArrival(
  world: World,
  arrival: ArrivalSpawn,
  callsign: string,
  scenario?: Scenario,
): void {
  const ac = createAircraft({
    callsign,
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
  const isAuthoredDemo = scenario?.id === "kdem-ils27" || scenario?.id === "kdem-ils09";
  if (arrival.starId && !isAuthoredDemo) {
    offerInboundHandoff(world, ac);
  } else {
    setHandoffNone(world, ac.id);
  }
  world.aircraft.push(ac);
}

function armStarVia(ac: Aircraft, scenario: Scenario, arrival: ArrivalSpawn): void {
  if (!arrival.starId || !arrival.transitionId) {
    return;
  }
  const routeFixIds = starRouteFixIds(
    scenario.catalog,
    arrival.starId,
    arrival.transitionId,
    scenario.activeRunwayId,
  );
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: arrival.starId,
    toFixIndex: authoredStarToFixIndex(
      scenario.catalog,
      arrival.starId,
      arrival.transitionId,
      ac,
      scenario.activeRunwayId,
    ),
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
  const rng = mulberry32((seed >>> 0) ^ 0xa24baed);
  const used = usedCallsignSet(world.aircraft.map((a) => a.callsign));
  for (let i = 0; i < scenario.arrivals.length; i += 1) {
    const arrival = scenario.arrivals[i]!;
    const assigned = assignments[i]!;
    const callsign = allocateCallsign(rng, used);
    const ac = createAircraft({
      callsign,
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

function spawnDownwindArc(
  world: World,
  n: number,
  scenario?: Scenario,
  seed: number = DEFAULT_SPAWN_SEED,
): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`spawnArrivals count must be a positive integer (got ${String(n)})`);
  }
  const rng = mulberry32((seed >>> 0) ^ 0xa24baed);
  const used = usedCallsignSet(world.aircraft.map((a) => a.callsign));
  for (let i = 0; i < n; i += 1) {
    const callsign = allocateCallsign(rng, used);
    spawnArrival(world, downwindArcArrival(i, n, scenario), callsign, scenario);
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
export function spawnArrivals(world: World, n: number, scenario?: Scenario, seed?: number): void;
export function spawnArrivals(world: World, scenario: Scenario, seed?: number): void;
export function spawnArrivals(
  world: World,
  source: number | Scenario,
  scenarioOrSeed?: Scenario | number,
  seedOpt?: number,
): void {
  if (typeof source === "number") {
    const scenario = typeof scenarioOrSeed === "object" ? scenarioOrSeed : undefined;
    const seed =
      typeof scenarioOrSeed === "number" ? scenarioOrSeed : (seedOpt ?? DEFAULT_SPAWN_SEED);
    spawnDownwindArc(world, source, scenario, seed);
    return;
  }
  const seed =
    typeof scenarioOrSeed === "number" ? scenarioOrSeed : (seedOpt ?? DEFAULT_SPAWN_SEED);
  const rng = mulberry32((seed >>> 0) ^ 0xa24baed);
  const used = usedCallsignSet(world.aircraft.map((a) => a.callsign));
  for (const arrival of source.arrivals) {
    const callsign = allocateCallsign(rng, used);
    spawnArrival(world, arrival, callsign, source);
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
    activeRunwayId: scenario.activeRunwayId,
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
  activeCallsigns?: Iterable<string>,
): void {
  const isQuerySpecified = departureOptions !== undefined && departureOptions !== null;
  const isEnabled = isQuerySpecified
    ? departureOptions.enabled
    : scenario.departureConfig?.policy !== "none" && (scenario.catalog?.sids?.length ?? 0) > 0;

  if (!isEnabled) {
    return;
  }

  const depSeed = departureOptions?.seed ?? seed;
  const usedCallsigns = usedCallsignSet(activeCallsigns ?? world.aircraft.map((a) => a.callsign));

  let schedule: ScheduledDeparture[];
  if (
    !isQuerySpecified &&
    scenario.departureConfig?.policy === "authored" &&
    scenario.departureConfig.departures &&
    scenario.departureConfig.departures.length > 0
  ) {
    const depRng = mulberry32((depSeed >>> 0) ^ DEPARTURE_STREAM_XOR);
    schedule = scenario.departureConfig.departures.map((d) => ({
      callsign: allocateCallsign(depRng, usedCallsigns),
      sidId: d.sidId,
      transitionId: d.transitionId,
      runwayId: scenario.activeRunwayId,
      assignedAltitudeFt: d.assignedAltitudeFt,
      aircraftType: d.aircraftType ?? "B738",
      scheduledSimMs: d.scheduledSimMs ?? 60_000,
      spawned: false,
    }));
  } else {
    schedule = generateDepartureSchedule({
      catalog: scenario.catalog,
      seed: depSeed,
      ratePerHour: departureOptions?.ratePerHour ?? scenario.departureConfig?.ratePerHour,
      count: departureOptions?.count,
      runwayId: scenario.activeRunwayId,
      activeCallsigns: usedCallsigns,
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
    spawnArrivals(world, scenario, seed);
  }
  initDepartures(
    world,
    scenario,
    seed,
    null,
    world.aircraft.map((a) => a.callsign),
  );
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
  let arrivalScheduler: ArrivalScheduler | undefined;
  if (scenario.spawnPolicy === "star-inbound" && trafficCount !== null) {
    world = worldFromScenario(scenario);
    spawnArrivals(world, trafficCount, scenario, seed);
  } else {
    world = worldFromScenario(scenario);
    if (scenario.spawnPolicy === "star-inbound") {
      arrivalScheduler = createArrivalScheduler(
        scenario.catalog,
        {
          ...arrivalTraffic,
          seed: arrivalTraffic?.seed ?? seed,
          activeRunwayId: scenario.activeRunwayId,
        },
        world.aircraft.map((arrival) => arrival.callsign),
        world.simTimeMs,
        scenario.activeRunwayId,
      );
      world.arrivalScheduler = arrivalScheduler;
      arrivalScheduler.drain(world);
    } else {
      spawnArrivals(world, scenario, seed);
      if (
        (scenario.catalog?.stars?.length ?? 0) > 0 &&
        arrivalTraffic?.arrivalsPerHour !== undefined &&
        arrivalTraffic.arrivalsPerHour > 0
      ) {
        arrivalScheduler = createArrivalScheduler(
          scenario.catalog,
          {
            ...arrivalTraffic,
            initialArrivalCount: 0,
            seed: arrivalTraffic.seed ?? seed,
            activeRunwayId: scenario.activeRunwayId,
          },
          world.aircraft.map((arrival) => arrival.callsign),
          world.simTimeMs,
          scenario.activeRunwayId,
        );
        world.arrivalScheduler = arrivalScheduler;
      }
    }
  }

  const activeCallsigns = new Set<string>();
  for (const ac of world.aircraft) {
    activeCallsigns.add(ac.callsign);
  }
  if (arrivalScheduler) {
    for (const arr of arrivalScheduler.schedule) {
      activeCallsigns.add(arr.callsign);
    }
  }

  initDepartures(world, scenario, seed, departureOptions, activeCallsigns);
  return world;
}
