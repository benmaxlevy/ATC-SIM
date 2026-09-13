import { describe, expect, it } from "vitest";
import { createAircraft } from "../aircraft";
import {
  correlateFlightPlanForAircraft,
  createActiveFlightPlanFromTarget,
  createFlightPlan,
  flightPlanForAircraft,
  resolveFlightPlanCorrelation,
  updateAircraftSquawk,
} from "../flightPlan";
import { createWorld } from "../world";

function plan(id: string, acid: string, beacon: string, status = "pending" as const) {
  const result = createFlightPlan({
    id,
    acid,
    assignedBeacon: beacon,
    status,
    fixes: [],
    scratchpads: [],
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function target(id: string, callsign: string, squawk: string) {
  return createAircraft({
    id,
    callsign,
    xNm: 4,
    yNm: 5,
    headingDeg: 123,
    altitudeFt: 4500,
    speedKt: 180,
    squawk,
  });
}

describe("T02-173 derived flight-plan correlation", () => {
  it("resolves exactly one non-deleted plan by reported squawk only", () => {
    const ac = target("ac-1", "1234", "7022");
    const matching = plan("fp-1", "AAL123", "7022");
    const world = createWorld({ flightPlans: [matching], aircraft: [ac] });
    const before = structuredClone(world.flightPlans);

    expect(resolveFlightPlanCorrelation(world, ac.id)).toMatchObject({
      reason: "unique",
      reportedSquawk: "7022",
      plan: { id: "fp-1", acid: "AAL123" },
    });
    expect(flightPlanForAircraft(world, ac.id)?.id).toBe("fp-1");
    expect(correlateFlightPlanForAircraft(world, ac.id)).toMatchObject({
      ok: true,
      aircraftId: ac.id,
    });
    expect(world.flightPlans).toEqual(before);
    expect(ac.callsign).toBe("1234");
  });

  it("does not use ACID or CID as a fallback", () => {
    const ac = target("ac-acid", "AAL123", "7011");
    const world = createWorld({ flightPlans: [plan("fp-acid", "AAL123", "7022")], aircraft: [ac] });
    expect(resolveFlightPlanCorrelation(world, ac.id)).toMatchObject({ reason: "no-match" });
    expect(flightPlanForAircraft(world, ac.id)).toBeUndefined();
  });

  it.each(["1200", "", "78A1"])("rejects non-correlating reported code %s", (squawk) => {
    const ac = target(`ac-${squawk || "none"}`, "AAL123", squawk);
    const world = createWorld({ flightPlans: [plan("fp", "AAL123", "1200")], aircraft: [ac] });
    expect(resolveFlightPlanCorrelation(world, ac.id).plan).toBeUndefined();
    expect(correlateFlightPlanForAircraft(world, ac.id)).toMatchObject({
      ok: false,
      error: { code: "NO_MATCH" },
    });
  });

  it("rejects zero and multiple candidates without guessing", () => {
    const ac = target("ac-zero", "AAL123", "7022");
    const zero = createWorld({ flightPlans: [plan("fp-other", "DAL456", "7023")], aircraft: [ac] });
    expect(resolveFlightPlanCorrelation(zero, ac.id)).toMatchObject({
      reason: "no-match",
      candidates: [],
    });

    const ambiguous = createWorld({
      flightPlans: [plan("fp-a", "AAL100", "7022"), plan("fp-b", "AAL101", "7022")],
      aircraft: [ac],
    });
    expect(resolveFlightPlanCorrelation(ambiguous, ac.id)).toMatchObject({
      reason: "ambiguous",
      candidates: [{ id: "fp-a" }, { id: "fp-b" }],
    });
    expect(correlateFlightPlanForAircraft(ambiguous, ac.id)).toMatchObject({
      ok: false,
      error: { code: "AMBIGUOUS_MATCH", aircraftIds: ["fp-a", "fp-b"] },
    });
  });

  it("ignores deleted plans and keeps status/provenance unchanged", () => {
    const ac = target("ac-deleted", "AAL123", "7022");
    const deleted = plan("fp-deleted", "AAL123", "7022");
    deleted.status = "deleted";
    const pending = plan("fp-pending", "AAL124", "7022");
    const world = createWorld({ flightPlans: [deleted, pending], aircraft: [ac] });
    const before = structuredClone(world.flightPlans);
    expect(correlateFlightPlanForAircraft(world, ac.id)).toMatchObject({
      ok: true,
      plan: { id: "fp-pending" },
    });
    expect(world.flightPlans).toEqual(before);
  });

  it("reflects a later target-only code edit without plan mutation", () => {
    const ac = target("ac-edit", "1234", "7022");
    const fp = plan("fp-edit", "AAL123", "7022");
    const world = createWorld({ flightPlans: [fp], aircraft: [ac] });
    expect(flightPlanForAircraft(world, ac.id)?.id).toBe(fp.id);
    const before = structuredClone(fp);
    expect(updateAircraftSquawk(world, ac.id, "7023")?.correlation).toMatchObject({
      ok: false,
      error: { code: "NO_MATCH" },
    });
    expect(flightPlanForAircraft(world, ac.id)).toBeUndefined();
    expect(fp).toEqual(before);
  });

  it("creates an active plan without persisting a target association", () => {
    const ac = target("ac-create", "UAL789", "4312");
    const world = createWorld({ aircraft: [ac] });
    const result = createActiveFlightPlanFromTarget(world, ac.id);
    expect(result).toMatchObject({
      ok: true,
      aircraftId: ac.id,
      plan: { status: "active", acid: "UAL789" },
    });
    expect(result.ok && result.plan).not.toHaveProperty("associatedAircraftId");
  });
});
