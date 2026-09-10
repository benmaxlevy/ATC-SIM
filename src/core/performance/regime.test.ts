import { expect, test } from "vitest";
import { makeTestAircraft } from "../aircraft";
import { resolvePerformanceRegime } from "./regime";

test.each([
  ["landing", { lateral: { type: "LANDING", approachId: "ILS" } }],
  ["missedApproach", { lateral: { type: "MISSED", approachId: "ILS" } }],
  ["missedApproach", { vertical: { type: "MISSED_CLIMB", altitudeFt: 3000 } }],
  ["approach", { lateral: { type: "INTERCEPT_LOC", approachId: "ILS" } }],
  ["approach", { lateral: { type: "LOC", approachId: "ILS" } }],
  ["approach", { vertical: { type: "GS", approachId: "ILS" } }],
  ["arrival", { lateral: { type: "PROCEDURE", starId: "STAR", toFixIndex: 0, routeFixIds: [] } }],
  ["arrival", { vertical: { type: "VIA_STAR", starId: "STAR" } }],
] as const)("resolves %s from generic intent", (expected, intent) => {
  const aircraft = makeTestAircraft({ altitudeFt: 5000 });
  Object.assign(aircraft.intent, intent);
  expect(resolvePerformanceRegime(aircraft)).toBe(expected);
});

test("resolves SID initial climb then climb using configurable threshold", () => {
  const aircraft = makeTestAircraft({ altitudeFt: 4000 });
  aircraft.intent.vertical = { type: "VIA_SID", sidId: "SID" };
  expect(resolvePerformanceRegime(aircraft, { sidInitialClimbTransitionFt: 5000 })).toBe(
    "initialClimb",
  );
  aircraft.altitudeFt = 5000;
  expect(resolvePerformanceRegime(aircraft, { sidInitialClimbTransitionFt: 5000 })).toBe("climb");
});

test("falls back to enroute for unclassified intent", () => {
  expect(resolvePerformanceRegime(makeTestAircraft())).toBe("enroute");
});
