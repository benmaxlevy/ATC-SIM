import { expect, test } from "vitest";
import { stepWorld } from "@core";
import {
  assertScenario,
  createWorldFromScenario,
  createWorldForSession,
  loadKdem,
  spawnDueDepartures,
} from "@scenario";
import katlJson from "../katl.json";

function expectCorrelatableIfrPlans(world: ReturnType<typeof createWorldFromScenario>): void {
  const targetCallsigns = new Set(world.aircraft.map((aircraft) => aircraft.callsign));
  const targetPlans = world.flightPlans.filter((plan) => targetCallsigns.has(plan.acid));
  expect(targetPlans).toHaveLength(world.aircraft.length);
  const beacons = new Set<string>();
  for (const plan of targetPlans) {
    expect(plan.status).toBe("pending");
    expect(plan.flightType).toBe("IFR");
    expect(plan.assignedBeacon).toMatch(/^[0-7]{4}$/);
    expect(plan.filedRoute).toBeDefined();
    expect(plan.filedRoute?.segments.length).toBeGreaterThan(0);
    expect(beacons.has(plan.assignedBeacon!)).toBe(false);
    beacons.add(plan.assignedBeacon!);
    expect((plan as unknown as { aircraftId?: string }).aircraftId).toBeUndefined();
  }
  for (const aircraft of world.aircraft) {
    expect(aircraft.reportedSquawk).toBeDefined();
    expect(beacons.has(aircraft.reportedSquawk!)).toBe(true);
    expect(aircraft.flightPlan).toBeUndefined();
    expect(aircraft.fp).toBeUndefined();
  }
}

test("KDEM random arrivals are filed before targets through the generic scenario factory", () => {
  const world = createWorldFromScenario(loadKdem(), 7);
  expectCorrelatableIfrPlans(world);
  const targetCallsigns = new Set(world.aircraft.map((aircraft) => aircraft.callsign));
  expect(
    world.flightPlans
      .filter((plan) => targetCallsigns.has(plan.acid))
      .every((plan) => plan.filedRoute?.segments[0]?.kind === "STAR"),
  ).toBe(true);
});

test("KATL random arrivals use the same catalog walker and route factory", () => {
  const scenario = assertScenario(katlJson);
  const world = createWorldFromScenario(scenario, 7);
  expectCorrelatableIfrPlans(world);
  expect(world.flightPlans.every((plan) => plan.airportId === "KATL")).toBe(true);
});

test("scheduled departure plans are pending and visible before their targets are due", () => {
  const scenario = assertScenario(katlJson);
  const world = createWorldForSession(scenario, null, 11, {
    enabled: true,
    ratePerHour: 0,
    count: 1,
  });
  const departures = world.scheduledDepartures ?? [];
  expect(departures).toHaveLength(1);
  expect(world.aircraft).toHaveLength(scenario.arrivals.length);
  expect(world.flightPlans).toHaveLength(scenario.arrivals.length + 1);
  const departure = departures[0]!;
  const plan = world.flightPlans.find((item) => item.acid === departure.callsign);
  expect(plan).toMatchObject({
    status: "pending",
    flightType: "IFR",
    assignedBeacon: departure.assignedSquawk,
  });
  expect(plan?.filedRoute?.segments[0]?.kind).toBe("SID");

  world.simTimeMs = departure.scheduledSimMs;
  const spawned = spawnDueDepartures(world);
  expect(spawned).toHaveLength(1);
  expect(world.flightPlans.filter((item) => item.acid === departure.callsign)).toHaveLength(1);
  expect(spawned[0]?.reportedSquawk).toBe(plan?.assignedBeacon);
});

test("bench targets still get metadata-only IFR plans without a facility branch", () => {
  const world = createWorldForSession(loadKdem(), 3, 4);
  const targetCallsigns = new Set(world.aircraft.map((aircraft) => aircraft.callsign));
  const targetPlans = world.flightPlans.filter((plan) => targetCallsigns.has(plan.acid));
  expect(targetPlans).toHaveLength(3);
  expect(targetPlans.every((plan) => plan.flightType === "IFR")).toBe(true);
  expect(targetPlans.every((plan) => plan.filedRoute === undefined)).toBe(true);
  expect(world.aircraft.every((aircraft) => aircraft.intent.lateral === undefined)).toBe(true);
});

test("scenario plans do not alter route-inactive aircraft intent or motion", () => {
  const world = createWorldFromScenario(loadKdem(), 3);
  const before = world.aircraft.map((aircraft) => ({
    xNm: aircraft.xNm,
    yNm: aircraft.yNm,
    headingDeg: aircraft.headingDeg,
    intent: structuredClone(aircraft.intent),
  }));
  stepWorld(world, 1);
  expect(world.aircraft).toHaveLength(before.length);
  for (let index = 0; index < before.length; index += 1) {
    expect(world.aircraft[index]?.intent).toEqual(before[index]?.intent);
  }
});
