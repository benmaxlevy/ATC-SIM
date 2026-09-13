import { expect, test } from "vitest";
import { createWorld, saveFlightPlanDraft, stepWorld } from "@core";
import {
  assertScenario,
  createScenarioIfrFlightPlan,
  createWorldFromScenario,
  createWorldForSession,
  loadKdem,
  spawnDueDepartures,
  spawnArrivals,
  spawnScenarioIfrAircraft,
} from "@scenario";
import katlJson from "../katl.json";
import { loadCatalog } from "../procedures/loadCatalog";
import { spawnDeparture } from "../departureSpawn";

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

test("scenario IFR creation rejects an existing same-ACID non-IFR plan", () => {
  const scenario = loadKdem();
  const world = createWorld({ catalog: scenario.catalog });
  const existing = saveFlightPlanDraft(world, {
    acid: "AAL123",
    assignedBeacon: "4321",
    flightType: "VFR",
  });
  expect(existing.ok).toBe(true);

  expect(() =>
    createScenarioIfrFlightPlan(world, {
      acid: "AAL123",
      scenario,
    }),
  ).toThrow(/existing plan .*not a valid pending IFR plan/);
  expect(world.flightPlans).toHaveLength(1);
  expect(world.flightPlans[0]?.flightType).toBe("VFR");
});

test("scenario IFR creation requires an existing plan to declare IFR", () => {
  const scenario = loadKdem();
  const world = createWorld({ catalog: scenario.catalog });
  const existing = saveFlightPlanDraft(world, {
    acid: "AAL126",
    assignedBeacon: "4322",
  });
  expect(existing.ok).toBe(true);

  expect(() =>
    createScenarioIfrFlightPlan(world, {
      acid: "AAL126",
      scenario,
    }),
  ).toThrow(/existing plan .*not a valid pending IFR plan/);
});

test("scenario IFR creation validates a requested route before reusing a plan", () => {
  const scenario = loadKdem();
  const world = createWorld({ catalog: scenario.catalog });
  const existing = saveFlightPlanDraft(world, {
    acid: "AAL127",
    assignedBeacon: "4323",
    flightType: "IFR",
    flightRules: "I",
  });
  expect(existing.ok).toBe(true);

  expect(() =>
    createScenarioIfrFlightPlan(world, {
      acid: "AAL127",
      scenario,
      route: { kind: "arrival", starId: "NOT_A_REAL_STAR" },
    }),
  ).toThrow(/Unable to create IFR scenario plan .*invalid procedure token/);
});

test("scenario IFR spawning rejects explicit VFR 1200 before creating plan or target", () => {
  const scenario = loadKdem();
  const world = createWorld({ catalog: scenario.catalog });

  expect(() =>
    spawnScenarioIfrAircraft(
      world,
      {
        callsign: "AAL124",
        xNm: 1,
        yNm: 1,
        headingDeg: 90,
        altitudeFt: 6000,
        speedKt: 210,
      },
      { scenario, assignedBeacon: "1200" },
    ),
  ).toThrow(/assigned beacon 1200 is non-correlatable/);
  expect(world.aircraft).toHaveLength(0);
  expect(world.flightPlans).toHaveLength(0);
});

test("spawnDeparture validates its supplied catalog even when world has another catalog", () => {
  const suppliedCatalog = loadCatalog("kdem");
  const wrongCatalog = { ...suppliedCatalog, sids: [], stars: [] };
  const world = createWorld({ catalog: wrongCatalog });
  const aircraft = spawnDeparture(
    world,
    {
      callsign: "AAL125",
      runwayId: "27",
      sidId: "BAY1",
      transitionId: "NORMA",
    },
    suppliedCatalog,
  );

  expect(aircraft.callsign).toBe("AAL125");
  expect(world.flightPlans).toHaveLength(1);
  expect(world.flightPlans[0]?.filedRoute?.segments[0]?.kind).toBe("SID");
});

test("authored arrival batch is atomic when a later route is invalid", () => {
  const source = loadKdem();
  const invalidScenario = {
    ...source,
    arrivals: source.arrivals.map((arrival, index) =>
      index === 1 ? { ...arrival, starId: "NOT_A_REAL_STAR" } : arrival,
    ),
  };
  const world = createWorld({ catalog: source.catalog });

  expect(() => spawnArrivals(world, invalidScenario, 5)).toThrow();
  expect(world.aircraft).toHaveLength(0);
  expect(world.flightPlans).toHaveLength(0);
});
