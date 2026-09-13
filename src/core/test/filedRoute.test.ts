import { expect, test } from "vitest";
import {
  createWorld,
  createFlightPlan,
  makeTestAircraft,
  parseFiledRoute,
  resolveFiledRoute,
  saveFlightPlanDraft,
  type FiledRouteCatalog,
} from "@core";

const catalog: FiledRouteCatalog = {
  fixes: [{ id: "FIXA" }, { id: "FIXB" }],
  navaids: [{ id: "VOR1" }, { id: "NDB1" }],
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
      common: [{ fixId: "FIXA" }],
      transitions: [{ id: "S", legs: [{ fixId: "FIXB" }] }],
    },
  ],
};

test.each([
  ["sid: sid1 / n   dct fixa", "SID:SID1/N DCT FIXA"],
  ["DCT vor1", "DCT VOR1"],
  ["STAR:STAR1/S DCT NDB1", "STAR:STAR1/S DCT NDB1"],
])("normalizes filed route %s", (text, normalized) => {
  const result = resolveFiledRoute(text, catalog);
  expect(result).toMatchObject({ ok: true, value: { text: normalized } });
});

test.each([
  ["DCT", "INCOMPLETE_ROUTE"],
  ["FIXA", "UNSUPPORTED_ROUTE_TOKEN"],
  ["J60", "UNSUPPORTED_ROUTE_TOKEN"],
  ["SID1", "UNSUPPORTED_ROUTE_TOKEN"],
  ["SID:SID1/NOPE", "UNKNOWN_TRANSITION"],
  ["STAR:SID1", "WRONG_PROCEDURE_KIND"],
] as const)("rejects filed route %s", (text, code) => {
  const result = resolveFiledRoute(text, catalog);
  expect(result).toMatchObject({ ok: false, error: { code } });
});

test("DCT rejects a same-name fix and navaid as ambiguous", () => {
  const result = resolveFiledRoute("DCT SAME", {
    ...catalog,
    fixes: [...catalog.fixes, { id: "SAME" }],
    navaids: [...catalog.navaids, { id: "SAME" }],
  });
  expect(result).toMatchObject({ ok: false, error: { code: "AMBIGUOUS_ROUTE_TOKEN" } });
});

test("saveFlightPlanDraft commits resolved metadata atomically", () => {
  const world = createWorld({
    catalog: { ...catalog, airportId: "TEST", approaches: [] },
    aircraft: [makeTestAircraft({ id: "ac-1", callsign: "AAL123" })],
  });
  const aircraftBefore = structuredClone(world.aircraft[0]);
  const result = saveFlightPlanDraft(world, {
    acid: "aal123",
    filedRoute: "SID:SID1/N DCT FIXA",
    requestedAltitudeFt: 12000,
    equipment: "S",
  });
  expect(result).toMatchObject({
    ok: true,
    created: true,
    plan: { acid: "AAL123", route: "SID:SID1/N DCT FIXA" },
  });
  if (!result.ok) return;
  expect(result.plan.filedRoute?.segments.map((segment) => segment.fixIds)).toEqual([
    ["FIXA", "FIXB"],
    ["FIXA"],
  ]);
  expect(world.aircraft[0]).toEqual(aircraftBefore);
});

test("failed amendment leaves the existing plan byte-for-byte unchanged", () => {
  const world = createWorld({ catalog: { ...catalog, airportId: "TEST", approaches: [] } });
  const created = saveFlightPlanDraft(world, { acid: "AAL123", filedRoute: "DCT FIXA" });
  expect(created.ok).toBe(true);
  const before = structuredClone(world.flightPlans[0]);
  const failed = saveFlightPlanDraft(world, {
    acid: "AAL123",
    filedRoute: "SID:SID1/NOPE",
    remarks: "MUTATE",
  });
  expect(failed).toMatchObject({ ok: false, error: { code: "UNKNOWN_TRANSITION" } });
  expect(world.flightPlans[0]).toEqual(before);
});

test("parseFiledRoute is catalog-free and accepts an empty route", () => {
  expect(parseFiledRoute(" ")).toEqual({ ok: true, value: { text: "", segments: [] } });
  expect(parseFiledRoute("DCT FIXA")).toMatchObject({
    ok: true,
    value: { segments: [{ kind: "DCT", fixId: "FIXA" }] },
  });
});

test.each([
  [{ aircraftCount: 1 }, "aircraftCount"],
  [{ aircraftType: "1A" }, "aircraftType"],
  [{ aircraftType: "A" }, "aircraftType"],
  [{ equipment: "L1" }, "equipment"],
  [{ flightRules: "B" }, "flightRules"],
  [{ flightRules: "IFR" }, "flightRules"],
] as const)("draft rejects manual-invalid scalar %j", (fields, field) => {
  const result = saveFlightPlanDraft(createWorld(), { acid: "AAL123", ...fields });
  expect(result).toMatchObject({ ok: false, error: { code: "INVALID_VALUE", field } });
});

test("draft accepts manual scalar bounds and adaptation flight rules", () => {
  const result = saveFlightPlanDraft(createWorld(), {
    acid: "AAL123",
    aircraftCount: 2,
    aircraftType: "A1",
    equipment: "L",
    flightRules: "I",
    fixes: ["FIXA*FIXB*P"],
  });
  expect(result).toMatchObject({
    ok: true,
    plan: {
      aircraftCount: 2,
      aircraftType: "A1",
      equipment: "L",
      flightRules: "I",
      fixes: ["FIXA*FIXB*P"],
    },
  });
});

test("draft rejects a new plan at flight-plan capacity before mutation", () => {
  const flightPlans = Array.from({ length: 100 }, (_, index) => ({
    id: `fp-${index}`,
    status: "pending" as const,
    acid: `A${String(index).padStart(2, "0")}`,
    fixes: [],
    scratchpads: [],
  }));
  const world = createWorld({ flightPlans });
  const before = structuredClone(world.flightPlans);
  const result = saveFlightPlanDraft(world, { acid: "AAL123" });
  expect(result).toMatchObject({
    ok: false,
    error: { code: "CAPACITY", message: "CAPACITY — FP" },
  });
  expect(world.flightPlans).toEqual(before);
});

test.each([
  ["+", "0000"],
  ["/", "1000"],
  ["/1", "2000"],
  ["/2", "3000"],
  ["/3", "4000"],
  ["/4", "5000"],
] as const)("draft resolves assigned beacon selector %s", (selector, assignedBeacon) => {
  const result = saveFlightPlanDraft(createWorld(), { acid: "AAL123", assignedBeacon: selector });
  expect(result).toMatchObject({ ok: true, plan: { assignedBeacon } });
});

test("draft accepts A beacon selector as no assigned beacon", () => {
  const result = saveFlightPlanDraft(createWorld(), { acid: "AAL123", assignedBeacon: "A" });
  expect(result).toMatchObject({ ok: true, plan: { assignedBeacon: undefined } });
});

test("draft rejects reported beacon and preserves existing surveillance value", () => {
  const created = createFlightPlan({
    id: "fp-1",
    status: "pending",
    acid: "AAL123",
    reportedBeacon: "4321",
    fixes: [],
    scratchpads: [],
  });
  if (!created.ok) throw new Error("test fixture should be valid");
  const world = createWorld({ flightPlans: [created.value] });
  const amended = saveFlightPlanDraft(world, { acid: "AAL123", remarks: "UPDATED" });
  expect(amended).toMatchObject({ ok: true, plan: { remarks: "UPDATED", reportedBeacon: "4321" } });
  const rejected = saveFlightPlanDraft(world, {
    acid: "AAL123",
    reportedBeacon: "7777",
  } as never);
  expect(rejected).toMatchObject({
    ok: false,
    error: { code: "INVALID_FIELD", field: "reportedBeacon" },
  });
  expect(world.flightPlans[0]?.reportedBeacon).toBe("4321");
});

test("draft validates entry/exit fixes before amendment mutation", () => {
  const world = createWorld();
  const created = saveFlightPlanDraft(world, { acid: "AAL123", fixes: ["FIXA*FIXB"] });
  expect(created.ok).toBe(true);
  const before = structuredClone(world.flightPlans[0]);
  const rejected = saveFlightPlanDraft(world, { acid: "AAL123", fixes: ["NOT-A-FIX"] });
  expect(rejected).toMatchObject({ ok: false, error: { code: "INVALID_VALUE", field: "fixes" } });
  expect(world.flightPlans[0]).toEqual(before);
});
