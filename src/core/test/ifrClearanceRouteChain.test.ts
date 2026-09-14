import { expect, test } from "vitest";
import {
  applyFlightPlanRouteTransaction,
  applyIfrClearance,
  createWorld,
  makeTestAircraft,
  saveFlightPlanDraft,
  type FiledRouteCatalog,
  type Instruction,
} from "@core";

const catalog: FiledRouteCatalog = {
  airportId: "TEST",
  fixes: [{ id: "FIXA" }, { id: "FIXB" }, { id: "FIXC" }, { id: "LIMIT" }],
  navaids: [{ id: "VOR1" }],
  sids: [
    {
      id: "SID1",
      common: [{ fixId: "FIXA" }],
      enrouteTransitions: [{ id: "N", legs: [{ fixId: "FIXB" }] }],
    },
  ],
  stars: [
    {
      id: "STAR1",
      common: [{ fixId: "FIXC" }],
      transitions: [{ id: "ARR", legs: [{ fixId: "VOR1" }] }],
    },
  ],
};

function setup() {
  const aircraft = makeTestAircraft({ id: "ac-1", callsign: "AAL123" });
  const world = createWorld({
    catalog: { ...catalog, airportId: "TEST", approaches: [] },
    aircraft: [aircraft],
  });
  const created = saveFlightPlanDraft(world, { acid: "AAL123", filedRoute: "FIXA" });
  if (!created.ok) throw new Error(created.error.message);
  return { world, aircraft, plan: created.plan };
}

function clearance(
  access: Extract<Instruction, { type: "IFR_CLEARANCE" }>["access"],
  extra: Partial<Extract<Instruction, { type: "IFR_CLEARANCE" }>> = {},
): Extract<Instruction, { type: "IFR_CLEARANCE" }> {
  return { type: "IFR_CLEARANCE", limitId: "LIMIT", access, ...extra };
}

test("applies an ordered direct chain to an owned active snapshot", () => {
  const { world, aircraft, plan } = setup();
  const beforePlan = structuredClone(plan);
  const result = applyIfrClearance(
    world,
    aircraft,
    clearance({
      type: "EXPLICIT_ROUTE",
      segments: [
        { type: "DIRECT", fixId: "FIXA" },
        { type: "DIRECT", fixId: "VOR1" },
        { type: "DIRECT", fixId: "FIXB" },
      ],
    }),
  );

  expect(result).toMatchObject({ ok: true, route: { lifecycle: "active", revision: 1 } });
  expect(plan).toEqual(beforePlan);
  expect(aircraft.activeClearance).toMatchObject({
    access: {
      type: "EXPLICIT_ROUTE",
      segments: [
        { type: "DIRECT", fixId: "FIXA" },
        { type: "DIRECT", fixId: "VOR1" },
        { type: "DIRECT", fixId: "FIXB" },
      ],
    },
    route: { route: { text: "FIXA VOR1 FIXB LIMIT" } },
  });
  expect(aircraft.intent.lateral).toMatchObject({
    type: "PROCEDURE",
    routeFixIds: ["FIXA", "VOR1", "FIXB", "LIMIT"],
  });
});

test("empty explicit route is direct to the clearance limit", () => {
  const { world, aircraft } = setup();
  const result = applyIfrClearance(
    world,
    aircraft,
    clearance({ type: "EXPLICIT_ROUTE", segments: [] }),
  );

  expect(result.ok).toBe(true);
  expect(aircraft.activeClearance).toMatchObject({
    access: { type: "EXPLICIT_ROUTE", segments: [] },
    route: { route: { text: "LIMIT" } },
  });
});

test("mixed SID, direct, and STAR segments compile in input order", () => {
  const { world, aircraft } = setup();
  const result = applyIfrClearance(
    world,
    aircraft,
    clearance({
      type: "EXPLICIT_ROUTE",
      segments: [
        { type: "PROCEDURE", procedureId: "SID1", transitionId: "N" },
        { type: "DIRECT", fixId: "VOR1" },
        { type: "PROCEDURE", procedureId: "STAR1", transitionId: "ARR" },
      ],
    }),
  );

  expect(result.ok).toBe(true);
  expect(aircraft.activeClearance?.route.route.segments).toMatchObject([
    { kind: "SID", procedureId: "SID1", transitionId: "N", fixIds: ["FIXA", "FIXB"] },
    { kind: "DCT", fixId: "VOR1", fixIds: ["VOR1"] },
    { kind: "STAR", procedureId: "STAR1", transitionId: "ARR", fixIds: ["VOR1", "FIXC"] },
    { kind: "DCT", fixId: "LIMIT", fixIds: ["LIMIT"] },
  ]);
});

test("CVIA requires a resolved SID but permits a SID chain", () => {
  const { world, aircraft } = setup();
  const result = applyIfrClearance(
    world,
    aircraft,
    clearance(
      {
        type: "EXPLICIT_ROUTE",
        segments: [
          { type: "DIRECT", fixId: "FIXA" },
          { type: "PROCEDURE", procedureId: "SID1", transitionId: "N" },
        ],
      },
      { climbVia: true },
    ),
  );

  expect(result.ok).toBe(true);
  expect(aircraft.intent.vertical).toEqual({ type: "VIA_SID", sidId: "SID1" });
});

test("CVIA rejects a STAR-only chain atomically", () => {
  const { world, aircraft } = setup();
  const first = applyIfrClearance(
    world,
    aircraft,
    clearance({ type: "EXPLICIT_ROUTE", segments: [] }),
  );
  expect(first.ok).toBe(true);
  const before = structuredClone(aircraft.activeClearance);
  const result = applyIfrClearance(
    world,
    aircraft,
    clearance(
      {
        type: "EXPLICIT_ROUTE",
        segments: [{ type: "PROCEDURE", procedureId: "STAR1", transitionId: "ARR" }],
      },
      { climbVia: true },
    ),
  );

  expect(result).toMatchObject({
    ok: false,
    error: { code: "INVALID_CLIMB_VIA", message: "unable clearance: CVIA requires a SID route" },
  });
  expect(aircraft.activeClearance).toEqual(before);
});

test("invalid or airport route segments reject without replacing the active snapshot", () => {
  const { world, aircraft, plan } = setup();
  const first = applyIfrClearance(
    world,
    aircraft,
    clearance({ type: "EXPLICIT_ROUTE", segments: [] }),
  );
  expect(first.ok).toBe(true);
  const beforePlan = structuredClone(plan);
  const beforeClearance = structuredClone(aircraft.activeClearance);

  const unknown = applyIfrClearance(
    world,
    aircraft,
    clearance({ type: "EXPLICIT_ROUTE", segments: [{ type: "DIRECT", fixId: "NOPE" }] }),
  );
  expect(unknown).toMatchObject({ ok: false, error: { code: "UNABLE_ROUTE" } });
  expect(plan).toEqual(beforePlan);
  expect(aircraft.activeClearance).toEqual(beforeClearance);

  const airport = applyIfrClearance(
    world,
    aircraft,
    clearance({ type: "EXPLICIT_ROUTE", segments: [{ type: "DIRECT", fixId: "TEST" }] }),
  );
  expect(airport).toMatchObject({
    ok: false,
    error: {
      code: "UNABLE_ROUTE",
      message: "unable route: airport cannot be a tactical route segment",
    },
  });
  expect(plan).toEqual(beforePlan);
  expect(aircraft.activeClearance).toEqual(beforeClearance);

  world.catalog!.fixes = [...world.catalog!.fixes, { id: "AMBIG" }];
  world.catalog!.navaids = [...world.catalog!.navaids, { id: "AMBIG" }];
  const ambiguous = applyIfrClearance(
    world,
    aircraft,
    clearance({ type: "EXPLICIT_ROUTE", segments: [{ type: "DIRECT", fixId: "AMBIG" }] }),
  );
  expect(ambiguous).toMatchObject({ ok: false, error: { code: "UNABLE_ROUTE" } });
  expect(plan).toEqual(beforePlan);
  expect(aircraft.activeClearance).toEqual(beforeClearance);

  const malformed = applyIfrClearance(
    world,
    aircraft,
    clearance({ type: "EXPLICIT_ROUTE", segments: [{ type: "DIRECT", fixId: "" }] }),
  );
  expect(malformed).toMatchObject({
    ok: false,
    error: { code: "UNABLE_ROUTE", message: "unable route: invalid route segment" },
  });
  expect(plan).toEqual(beforePlan);
  expect(aircraft.activeClearance).toEqual(beforeClearance);
});

test("typed route segment kinds never fall through to another catalog namespace", () => {
  const { world, aircraft, plan } = setup();
  const first = applyIfrClearance(
    world,
    aircraft,
    clearance({ type: "EXPLICIT_ROUTE", segments: [] }),
  );
  expect(first.ok).toBe(true);
  const beforePlan = structuredClone(plan);
  const beforeClearance = structuredClone(aircraft.activeClearance);

  const cases: Array<{
    name: string;
    access: Extract<Instruction, { type: "IFR_CLEARANCE" }>["access"];
  }> = [
    {
      name: "procedure-as-airport",
      access: {
        type: "EXPLICIT_ROUTE",
        segments: [{ type: "PROCEDURE", procedureId: "TEST" }],
      },
    },
    {
      name: "direct-as-procedure",
      access: {
        type: "EXPLICIT_ROUTE",
        segments: [{ type: "DIRECT", fixId: "SID1" }],
      },
    },
    {
      name: "procedure-as-fix",
      access: {
        type: "EXPLICIT_ROUTE",
        segments: [{ type: "PROCEDURE", procedureId: "FIXA" }],
      },
    },
  ];

  for (const item of cases) {
    const result = applyIfrClearance(world, aircraft, clearance(item.access));
    expect(result, item.name).toMatchObject({ ok: false, error: { code: "UNABLE_ROUTE" } });
    expect(plan, item.name).toEqual(beforePlan);
    expect(aircraft.activeClearance, item.name).toEqual(beforeClearance);
  }
});

test("legacy direct input normalizes to canonical active-clearance access", () => {
  const { world, aircraft } = setup();
  const result = applyIfrClearance(world, aircraft, clearance({ type: "DIRECT" }));
  expect(result.ok).toBe(true);
  expect(aircraft.activeClearance?.access).toEqual({ type: "EXPLICIT_ROUTE", segments: [] });
});

test("tactical DIRECT remains a separate instruction path", () => {
  const { aircraft, plan } = setup();
  const beforeRoute = structuredClone(plan.routeRecord);
  const direct: Instruction = { type: "DIRECT", fixId: "FIXA" };
  expect(direct).toEqual({ type: "DIRECT", fixId: "FIXA" });
  expect(aircraft.activeClearance).toBeUndefined();
  expect(plan.routeRecord).toEqual(beforeRoute);
});

test("active route snapshot survives later plan route edits", () => {
  const { world, aircraft, plan } = setup();
  const issued = applyIfrClearance(
    world,
    aircraft,
    clearance({
      type: "EXPLICIT_ROUTE",
      segments: [
        { type: "DIRECT", fixId: "FIXA" },
        { type: "DIRECT", fixId: "VOR1" },
      ],
    }),
  );
  expect(issued.ok).toBe(true);
  const before = structuredClone(aircraft.activeClearance);
  const edited = applyFlightPlanRouteTransaction(world, plan.id, {
    routeText: "FIXC",
    lifecycle: "active",
  });
  expect(edited.ok).toBe(true);
  expect(plan.routeRecord?.route.text).toBe("FIXC");
  expect(aircraft.activeClearance).toEqual(before);
});
