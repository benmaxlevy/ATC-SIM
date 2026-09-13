/**
 * Scenario IFR plans are filed metadata created before surveillance targets.
 *
 * The plan and target intentionally have no durable association.  A target
 * reports the plan's assigned beacon, and T02-173 derives correlation from
 * that surveillance value later.  This module owns only scenario setup; it
 * does not activate an FMS route or mutate pilot intent.
 */

import {
  saveFlightPlanDraft,
  isValidBeaconCode,
  type Aircraft,
  type AircraftInit,
  type FlightPlan,
  type World,
} from "@core";
import type { Scenario } from "./types";
import { allocateSquawkCode as allocateScenarioSquawkCode } from "./callsigns";
import { defaultSquawkRng, spawnAircraft, usedSquawks } from "./spawnAircraft";

export type ScenarioIfrRoute =
  | { kind: "arrival"; starId: string; transitionId?: string }
  | { kind: "departure"; sidId: string; transitionId?: string }
  | undefined;

export interface ScenarioIfrFlightPlanInput {
  acid: string;
  scenario: Pick<Scenario, "icao">;
  route?: ScenarioIfrRoute;
  requestedAltitudeFt?: number;
  aircraftType?: string;
  assignedBeacon?: string;
  /** Same seeded stream used by the target's normal beacon allocation. */
  rng?: () => number;
  departure?: boolean;
}

function routeText(route: ScenarioIfrRoute): string {
  if (!route) return "";
  const procedure = route.kind === "arrival" ? `STAR:${route.starId}` : `SID:${route.sidId}`;
  return route.transitionId ? `${procedure}/${route.transitionId}` : procedure;
}

function planAltitude(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.max(0, Math.round(value / 100) * 100);
}

/**
 * Create exactly one pending, catalog-validated IFR plan.  No world target is
 * added by this function, so callers can enforce plan-before-target ordering.
 */
export function createScenarioIfrFlightPlan(
  world: World,
  input: ScenarioIfrFlightPlanInput,
): FlightPlan {
  const requestedBeacon = input.assignedBeacon?.trim().toUpperCase();
  if (requestedBeacon === "1200") {
    throw new Error(
      `Cannot create IFR scenario plan for ${input.acid}: assigned beacon 1200 is non-correlatable`,
    );
  }
  const existing = world.flightPlans.find(
    (plan) => plan.status !== "deleted" && plan.acid === input.acid.trim().toUpperCase(),
  );
  if (existing) {
    const beacon = existing.assignedBeacon?.trim().toUpperCase();
    if (
      existing.status !== "pending" ||
      (existing.flightType !== undefined && existing.flightType !== "IFR") ||
      !beacon ||
      !isValidBeaconCode(beacon) ||
      beacon === "1200"
    ) {
      throw new Error(
        `Cannot create IFR scenario plan for ${input.acid}: existing plan ${existing.id} is not a valid pending IFR plan`,
      );
    }
    return existing;
  }
  const assignedBeacon =
    input.assignedBeacon ??
    allocateScenarioSquawkCode(
      [
        ...usedSquawks(world),
        ...world.flightPlans.flatMap((plan) =>
          plan.status !== "deleted" && plan.assignedBeacon ? [plan.assignedBeacon] : [],
        ),
      ],
      input.rng ?? defaultSquawkRng(input.acid),
    );
  const result = saveFlightPlanDraft(world, {
    acid: input.acid,
    assignedBeacon,
    flightType: "IFR",
    flightRules: "I",
    requestedAltitudeFt: planAltitude(input.requestedAltitudeFt),
    aircraftType: input.aircraftType,
    airportId: input.scenario.icao,
    ...(input.departure ? { departureAirport: input.scenario.icao } : {}),
    source: "SCENARIO",
    filedRoute: routeText(input.route),
  });
  if (!result.ok) {
    throw new Error(
      `Unable to create IFR scenario plan for ${input.acid}: ${result.error.message}`,
    );
  }
  if (result.plan.status !== "pending") {
    throw new Error(`IFR scenario plan ${result.plan.id} was not created as pending`);
  }
  return result.plan;
}

/**
 * File an IFR plan, then construct the target with the same beacon in both
 * assigned and reported surveillance fields.  The target is appended only
 * after the plan has passed catalog and identity validation.
 */
export function spawnScenarioIfrAircraft(
  world: World,
  params: AircraftInit,
  input: Omit<ScenarioIfrFlightPlanInput, "acid" | "aircraftType"> & {
    route?: ScenarioIfrRoute;
    /** Optional catalog override for callers that spawn from an external catalog. */
    catalog?: NonNullable<World["catalog"]>;
  },
): { aircraft: Aircraft; plan: FlightPlan } {
  const { catalog, ...planInput } = input;
  const planWorld = catalog === undefined ? world : { ...world, catalog };
  const plan = createScenarioIfrFlightPlan(planWorld, {
    ...planInput,
    acid: params.callsign,
    aircraftType: params.aircraftType,
  });
  const aircraft = spawnAircraft(world, {
    ...params,
    assignedSquawk: plan.assignedBeacon,
    squawk: plan.assignedBeacon,
    reportedSquawk: plan.assignedBeacon,
  });
  return { aircraft, plan };
}

export { routeText as scenarioIfrRouteText };
