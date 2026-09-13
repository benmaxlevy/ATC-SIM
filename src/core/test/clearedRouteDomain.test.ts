import { expect, test } from "vitest";
import {
  applyFlightPlanRouteTransaction,
  cancelFlightPlanRoute,
  createWorld,
  makeTestAircraft,
  saveFlightPlanDraft,
  transitionFlightPlanRoute,
  validateFlightPlanRouteTransaction,
  type FiledRouteCatalog,
} from "@core";

const catalog: FiledRouteCatalog = {
  fixes: [{ id: "FIXA" }, { id: "FIXB" }, { id: "FIXC" }],
  navaids: [{ id: "VOR1" }],
  sids: [
    {
      id: "SID1",
      common: [{ fixId: "FIXA" }],
      enrouteTransitions: [{ id: "N", legs: [{ fixId: "FIXB" }] }],
    },
  ],
  stars: [],
};

function routeWorld() {
  const world = createWorld({
    catalog: { ...catalog, airportId: "TEST", approaches: [] },
    aircraft: [makeTestAircraft({ id: "ac-1", callsign: "AAL123" })],
  });
  const created = saveFlightPlanDraft(world, { acid: "AAL123", filedRoute: "SID1/N FIXC" });
  if (!created.ok) throw new Error(created.error.message);
  return world;
}

test("filed route is one inactive route proposal with an execution cursor", () => {
  const world = routeWorld();
  const plan = world.flightPlans[0]!;
  expect(plan.routeRecord).toMatchObject({
    route: plan.filedRoute,
    nextIndex: 0,
    revision: 0,
    lifecycle: "none",
  });
});

test("AS FILED atomically activates the proposal and advances revision", () => {
  const world = routeWorld();
  const beforeAircraft = structuredClone(world.aircraft);
  const result = applyFlightPlanRouteTransaction(world, "fp-AAL123", {
    source: "AS_FILED",
    lifecycle: "active",
  });
  expect(result).toMatchObject({
    ok: true,
    route: { nextIndex: 0, revision: 1, lifecycle: "active" },
  });
  if (!result.ok) return;
  expect(result.route.route).toEqual(world.flightPlans[0]?.filedRoute);
  expect(world.aircraft).toEqual(beforeAircraft);
});

test("unknown route is unable route and leaves plan and aircraft unchanged", () => {
  const world = routeWorld();
  const beforePlan = structuredClone(world.flightPlans[0]);
  const beforeAircraft = structuredClone(world.aircraft);
  const result = applyFlightPlanRouteTransaction(world, "fp-AAL123", {
    routeText: "NOT_A_FIX",
    lifecycle: "active",
  });
  expect(result).toMatchObject({
    ok: false,
    error: { code: "UNABLE_ROUTE", message: expect.stringContaining("unable route") },
  });
  expect(world.flightPlans[0]).toEqual(beforePlan);
  expect(world.aircraft).toEqual(beforeAircraft);
});

test("replacement is atomic and increments revision without a parallel route", () => {
  const world = routeWorld();
  const first = applyFlightPlanRouteTransaction(world, "fp-AAL123", {
    source: "AS_FILED",
    lifecycle: "active",
  });
  expect(first.ok).toBe(true);
  const replacement = applyFlightPlanRouteTransaction(world, "fp-AAL123", {
    routeText: "FIXA VOR1",
    lifecycle: "active",
    nextIndex: 1,
  });
  expect(replacement).toMatchObject({
    ok: true,
    route: { nextIndex: 1, revision: 2, lifecycle: "active", route: { text: "FIXA VOR1" } },
  });
  expect(world.flightPlans[0]?.routeRecord?.route).toBe(world.flightPlans[0]?.filedRoute);
  expect(world.flightPlans[0]?.route).toBe("FIXA VOR1");
});

test("blank AS FILED and invalid cursor reject without mutation", () => {
  const world = createWorld({ catalog: { ...catalog, airportId: "TEST", approaches: [] } });
  const created = saveFlightPlanDraft(world, { acid: "AAL123" });
  if (!created.ok) throw new Error(created.error.message);
  expect(
    applyFlightPlanRouteTransaction(world, created.plan.id, {
      source: "AS_FILED",
      lifecycle: "active",
    }),
  ).toMatchObject({
    ok: false,
    error: { code: "UNABLE_ROUTE", message: expect.stringContaining("unable route") },
  });

  const proposal = routeWorld();
  const before = structuredClone(proposal.flightPlans[0]);
  expect(
    applyFlightPlanRouteTransaction(proposal, "fp-AAL123", {
      source: "AS_FILED",
      lifecycle: "active",
      nextIndex: 99,
    }),
  ).toMatchObject({ ok: false, error: { code: "INVALID_ROUTE_INDEX" } });
  expect(proposal.flightPlans[0]).toEqual(before);
});

test("route lifecycle is explicit and cancellation is terminal", () => {
  const world = routeWorld();
  const proposal = world.flightPlans[0]!.routeRecord!;
  expect(transitionFlightPlanRoute(proposal, "issued")).toMatchObject({
    ok: true,
    value: { lifecycle: "issued" },
  });
  expect(transitionFlightPlanRoute(proposal, "active")).toMatchObject({
    ok: false,
    error: { code: "INVALID_STATUS_TRANSITION" },
  });
  const cancelled = cancelFlightPlanRoute(world, "fp-AAL123");
  expect(cancelled).toMatchObject({ ok: true, route: { lifecycle: "cancelled", revision: 1 } });
});

test("route transaction validation is pure", () => {
  const world = routeWorld();
  const before = structuredClone(world.flightPlans[0]);
  const result = validateFlightPlanRouteTransaction(
    world.flightPlans[0]!,
    { source: "AS_FILED", lifecycle: "acknowledged" },
    catalog,
  );
  expect(result).toMatchObject({ ok: true, route: { lifecycle: "acknowledged", revision: 1 } });
  expect(world.flightPlans[0]).toEqual(before);
});
