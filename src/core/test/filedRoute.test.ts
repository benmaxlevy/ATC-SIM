import { expect, test } from "vitest";
import {
  createWorld,
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
