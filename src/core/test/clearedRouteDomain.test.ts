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

  const repeated = cancelFlightPlanRoute(world, "fp-AAL123");
  expect(repeated).toMatchObject({
    ok: false,
    error: { code: "INVALID_ROUTE_LIFECYCLE", field: "lifecycle" },
  });
  const replacement = applyFlightPlanRouteTransaction(world, "fp-AAL123", {
    routeText: "FIXA",
    lifecycle: "active",
  });
  expect(replacement).toMatchObject({
    ok: false,
    error: { code: "INVALID_ROUTE_LIFECYCLE", field: "lifecycle" },
  });
  expect(
    transitionFlightPlanRoute(cancelled.ok ? cancelled.route : proposal, "cancelled"),
  ).toMatchObject({
    ok: false,
    error: { code: "INVALID_STATUS_TRANSITION" },
  });
});

test("createWorld migrates legacy route projections without input aliasing", () => {
  const legacyRoute = {
    text: "FIXA FIXB",
    segments: [
      { kind: "DCT" as const, fixId: "FIXA", fixIds: ["FIXA"] },
      { kind: "DCT" as const, fixId: "FIXB", fixIds: ["FIXB"] },
    ],
  };
  const legacyPlan = {
    id: "fp-legacy",
    status: "pending" as const,
    acid: "AAL123",
    route: legacyRoute.text,
    filedRoute: legacyRoute,
    fixes: [],
    scratchpads: [],
  };
  const routeOnlyPlan = {
    id: "fp-route-only",
    status: "pending" as const,
    acid: "DAL456",
    route: "FIXC FIXD",
    fixes: [],
    scratchpads: [],
  };
  const world = createWorld({ flightPlans: [legacyPlan, routeOnlyPlan] });
  const migrated = world.flightPlans[0]!;
  expect(migrated.routeRecord).toMatchObject({
    route: legacyRoute,
    nextIndex: 0,
    revision: 0,
    lifecycle: "none",
  });
  expect(migrated.filedRoute).toBe(migrated.routeRecord?.route);
  expect(migrated.route).toBe("FIXA FIXB");
  expect(migrated.routeRecord?.route).not.toBe(legacyRoute);
  expect(migrated.routeRecord?.route.segments).not.toBe(legacyRoute.segments);

  legacyRoute.segments[0]!.fixIds.push("MUTATED");
  expect(migrated.routeRecord?.route.segments[0]?.fixIds).toEqual(["FIXA"]);

  expect(world.flightPlans[1]?.routeRecord).toMatchObject({
    route: {
      text: "FIXC FIXD",
      segments: [
        { kind: "DCT", fixId: "FIXC", fixIds: ["FIXC"] },
        { kind: "DCT", fixId: "FIXD", fixIds: ["FIXD"] },
      ],
    },
    lifecycle: "none",
  });
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

test("draft amendments preserve cancelled routes and reject route replacement", () => {
  const world = routeWorld();
  expect(cancelFlightPlanRoute(world, "fp-AAL123")).toMatchObject({
    ok: true,
    route: { lifecycle: "cancelled" },
  });

  const metadata = saveFlightPlanDraft(world, { acid: "AAL123", remarks: "KEEP CANCELLED" });
  expect(metadata).toMatchObject({ ok: true, plan: { remarks: "KEEP CANCELLED" } });
  expect(world.flightPlans[0]?.routeRecord).toMatchObject({ lifecycle: "cancelled", revision: 1 });

  const replacement = saveFlightPlanDraft(world, { acid: "AAL123", filedRoute: "FIXA" });
  expect(replacement).toMatchObject({
    ok: false,
    error: { code: "INVALID_ROUTE_LIFECYCLE", field: "route" },
  });
  expect(world.flightPlans[0]?.routeRecord).toMatchObject({ lifecycle: "cancelled", revision: 1 });
});
