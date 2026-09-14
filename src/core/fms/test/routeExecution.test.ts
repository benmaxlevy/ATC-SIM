import { expect, test } from "vitest";
import {
  applyFlightPlanRouteTransaction,
  buildFixRegistry,
  createAircraft,
  createWorld,
  saveFlightPlanDraft,
  startFlightPlanRoute,
  stepWorld,
  type FiledRouteCatalog,
  type FixRegistrySource,
} from "@core";
import { applyIntent } from "@pilot";

const catalog: FiledRouteCatalog = {
  fixes: [{ id: "SIITH" }, { id: "KAHN" }, { id: "OFFROUTE" }],
  navaids: [],
  sids: [],
  stars: [],
};

const registry = buildFixRegistry({
  fixes: [
    { id: "SIITH", xNm: 0, yNm: 0, kind: "fix" },
    { id: "KAHN", xNm: 10, yNm: 0, kind: "fix" },
    { id: "OFFROUTE", xNm: 0, yNm: 10, kind: "fix" },
  ],
  navaids: [],
} satisfies FixRegistrySource);

function routeWorld(xNm = -1, yNm = 0) {
  const aircraft = createAircraft({
    id: "ac-route",
    callsign: "AAL123",
    xNm,
    yNm,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({
    aircraft: [aircraft],
    catalog: { ...catalog, airportId: "TEST", approaches: [] },
    fixRegistry: registry,
  });
  const draft = saveFlightPlanDraft(world, { acid: "AAL123", filedRoute: "SIITH KAHN" });
  if (!draft.ok) throw new Error(draft.error.message);
  const active = applyFlightPlanRouteTransaction(world, draft.plan.id, {
    source: "AS_FILED",
    lifecycle: "active",
  });
  if (!active.ok) throw new Error(active.error.message);
  return { world, aircraft, plan: draft.plan };
}

test("active executable route starts at its cursor and advances one fix at a time", () => {
  const { world, aircraft, plan } = routeWorld();
  const started = startFlightPlanRoute(world, plan.id);
  expect(started.ok).toBe(true);
  expect(aircraft.intent.lateral).toMatchObject({
    type: "PROCEDURE",
    toFixIndex: 0,
    routeFixIds: ["SIITH", "KAHN"],
  });

  for (let i = 0; i < 40 && aircraft.intent.lateral?.type === "PROCEDURE"; i += 1) {
    stepWorld(world, 1);
  }
  expect(aircraft.intent.lateral).toMatchObject({ type: "PROCEDURE", toFixIndex: 1 });
  expect(world.flightPlans[0]?.routeRecord).toMatchObject({ nextIndex: 1, revision: 1 });
});

test("active clearance routes turn at fixes instead of leading every route turn", () => {
  const registry = buildFixRegistry({
    fixes: [
      { id: "TURN", xNm: 0, yNm: 0, kind: "fix" },
      { id: "OUTBOUND", xNm: 10, yNm: 10, kind: "fix" },
    ],
    navaids: [],
  });
  const aircraft = createAircraft({
    id: "ac-turn",
    callsign: "AAL123",
    xNm: -3,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({
    aircraft: [aircraft],
    catalog: {
      ...catalog,
      airportId: "TEST",
      approaches: [],
      fixes: [...catalog.fixes, { id: "TURN" }, { id: "OUTBOUND" }],
    },
    fixRegistry: registry,
  });
  const draft = saveFlightPlanDraft(world, { acid: "AAL123", filedRoute: "TURN OUTBOUND" });
  if (!draft.ok) throw new Error(draft.error.message);
  const active = applyFlightPlanRouteTransaction(world, draft.plan.id, {
    source: "AS_FILED",
    lifecycle: "active",
  });
  if (!active.ok) throw new Error(active.error.message);

  expect(startFlightPlanRoute(world, draft.plan.id).ok).toBe(true);
  expect(aircraft.intent.lateral).toMatchObject({ type: "PROCEDURE" });

  let sequenceDistanceNm = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 600; i += 1) {
    const before = Math.hypot(aircraft.xNm, aircraft.yNm);
    stepWorld(world, 0.1);
    if (aircraft.intent.lateral?.type === "PROCEDURE" && aircraft.intent.lateral.toFixIndex === 1) {
      sequenceDistanceNm = before;
      break;
    }
  }
  expect(aircraft.intent.lateral).toMatchObject({ type: "PROCEDURE", toFixIndex: 1 });
  expect(sequenceDistanceNm).toBeLessThan(0.02);
  expect(aircraft.headingDeg).toBeCloseTo(89.7, 5);
});

test("DIRECT to a remaining route fix resumes the stored route without a revision", () => {
  const { world, aircraft, plan } = routeWorld(0, 0);
  expect(startFlightPlanRoute(world, plan.id).ok).toBe(true);
  const recordBefore = structuredClone(plan.routeRecord);

  applyIntent(aircraft, [{ type: "DIRECT", fixId: "SIITH" }], 0, { flightPlan: plan });
  expect(aircraft.intent.lateral).toMatchObject({
    type: "DIRECT",
    fixId: "SIITH",
    continuation: {
      type: "RESUME_ROUTE",
      index: 1,
      routeRevision: 1,
    },
  });
  stepWorld(world, 1);
  expect(aircraft.intent.lateral).toMatchObject({ type: "PROCEDURE", toFixIndex: 1 });
  expect(plan.routeRecord?.revision).toBe(recordBefore?.revision);
  expect(plan.routeRecord?.route).toEqual(recordBefore?.route);
});

test("DIRECT off-route holds the present heading and keeps the route cursor intact", () => {
  const { world, aircraft, plan } = routeWorld(0, 9);
  expect(startFlightPlanRoute(world, plan.id).ok).toBe(true);
  const before = structuredClone(plan.routeRecord);
  applyIntent(aircraft, [{ type: "DIRECT", fixId: "OFFROUTE" }], 0, { flightPlan: plan });
  expect(aircraft.intent.lateral).toMatchObject({
    type: "DIRECT",
    continuation: { type: "PRESENT_HEADING", headingDeg: 90 },
  });
  for (let i = 0; i < 30 && aircraft.intent.lateral?.type === "DIRECT"; i += 1) {
    stepWorld(world, 1);
  }
  expect(aircraft.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
  expect(plan.routeRecord).toEqual(before);
});

test("radar-vector route access is pending until a later heading", () => {
  const { world, aircraft, plan } = routeWorld();
  aircraft.intent.assignedHeadingDeg = 270;
  expect(startFlightPlanRoute(world, plan.id, "RADAR_VECTORS").ok).toBe(true);
  expect(aircraft.intent.lateral).toMatchObject({
    type: "VECTOR_PENDING",
    holdHeadingDeg: 90,
  });
  const headingBefore = aircraft.headingDeg;
  stepWorld(world, 5);
  expect(aircraft.headingDeg).toBe(headingBefore);
  expect(aircraft.intent.lateral).toMatchObject({ type: "VECTOR_PENDING" });
  applyIntent(aircraft, [{ type: "FLY_HEADING", headingDeg: 180, turn: "SHORTEST" }], 0);
  expect(aircraft.intent.lateral).toEqual({ type: "HEADING", headingDeg: 180 });
});

test("radar-vector pending holds present heading without a fix registry", () => {
  const { world, aircraft, plan } = routeWorld();
  world.fixRegistry = null;
  aircraft.intent.assignedHeadingDeg = 270;
  expect(startFlightPlanRoute(world, plan.id, "RADAR_VECTORS").ok).toBe(true);
  expect(aircraft.intent.lateral).toMatchObject({
    type: "VECTOR_PENDING",
    holdHeadingDeg: 90,
  });

  const xBefore = aircraft.xNm;
  const yBefore = aircraft.yNm;
  stepWorld(world, 5);
  expect(aircraft.headingDeg).toBe(90);
  expect(aircraft.xNm).toBeGreaterThan(xBefore);
  expect(aircraft.yNm).toBeCloseTo(yBefore, 10);
  expect(aircraft.intent.lateral).toMatchObject({ type: "VECTOR_PENDING" });
});
