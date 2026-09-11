import { describe, expect, it } from "vitest";
import { createAircraft } from "../aircraft";
import {
  associateFlightPlan,
  correlateFlightPlanForAircraft,
  updateAircraftSquawk,
  createActiveFlightPlanFromTarget,
  createFlightPlan,
  transitionFlightPlan,
} from "../flightPlan";
import { createWorld } from "../world";

function plan(id: string, acid: string, beacon: string) {
  const result = createFlightPlan({ id, acid, assignedBeacon: beacon, fixes: [], scratchpads: [] });
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

describe("T02-145 flight-plan activation and correlation", () => {
  it("activates exactly one pending plan for a unique discrete report", () => {
    const ac = target("ac-1", "1234", "7022");
    const world = createWorld({ flightPlans: [plan("fp-1", "AAL123", "7022")], aircraft: [ac] });
    const result = correlateFlightPlanForAircraft(world, "ac-1");
    expect(result).toMatchObject({ ok: true, aircraftId: "ac-1" });
    expect(world.flightPlans[0]).toMatchObject({
      status: "active",
      acid: "AAL123",
      associatedAircraftId: "ac-1",
    });
    expect(ac.callsign).toBe("1234");
    expect(ac.squawk).toBe("7022");
  });

  it("does not correlate 1200 or ambiguous duplicate reports", () => {
    const vfr = target("ac-vfr", "N12345", "1200");
    const world = createWorld({ flightPlans: [plan("fp-vfr", "N12345", "1200")], aircraft: [vfr] });
    expect(correlateFlightPlanForAircraft(world, vfr.id)).toMatchObject({
      ok: false,
      error: { code: "NO_MATCH" },
    });
    expect(world.flightPlans[0]!.status).toBe("pending");

    const a = target("ac-a", "1234", "7023");
    const b = target("ac-b", "5678", "7023");
    const duplicate = createWorld({
      flightPlans: [plan("fp-dup", "AAL124", "7023")],
      aircraft: [a, b],
    });
    expect(correlateFlightPlanForAircraft(duplicate, a.id)).toMatchObject({ ok: true });
    expect(correlateFlightPlanForAircraft(duplicate, b.id)).toMatchObject({ ok: false });
    expect(duplicate.flightPlans[0]!.status).toBe("active");
  });

  it("explicitly associates by plan identity without changing kinematics or ownership", () => {
    const ac = target("ac-2", "1234", "1200");
    const pose = {
      x: ac.xNm,
      y: ac.yNm,
      heading: ac.headingDeg,
      altitude: ac.altitudeFt,
      speed: ac.speedKt,
    };
    const world = createWorld({ flightPlans: [plan("fp-2", "DAL456", "7024")], aircraft: [ac] });
    const result = associateFlightPlan(world, "fp-2", "ac-2");
    expect(result).toMatchObject({ ok: true });
    expect(ac).toMatchObject({
      xNm: pose.x,
      yNm: pose.y,
      headingDeg: pose.heading,
      altitudeFt: pose.altitude,
      speedKt: pose.speed,
      callsign: "1234",
    });
    expect(ac.squawk).toBe("1200");
    expect(ac.assignedSquawk).toBeUndefined();
  });

  it("preserves a suspended plan when an inactive, non-mismatch target is associated", () => {
    const pending = plan("fp-suspended", "DAL457", "7025");
    const active = transitionFlightPlan(pending, "active");
    if (!active.ok) throw new Error(active.error.message);
    const suspended = transitionFlightPlan(active.value, "suspended");
    if (!suspended.ok) throw new Error(suspended.error.message);
    const ac = target("ac-suspended", "1234", "1200");
    const world = createWorld({ flightPlans: [suspended.value], aircraft: [ac] });

    const result = associateFlightPlan(world, "fp-suspended", "ac-suspended");

    expect(result).toMatchObject({ ok: true, plan: { status: "suspended" } });
    expect(world.flightPlans[0]!.status).toBe("suspended");
    expect(world.flightPlans[0]!.associatedAircraftId).toBe("ac-suspended");
  });

  it("unsuspends a plan suspended for beacon mismatch when associated", () => {
    const pending = plan("fp-mismatch", "DAL458", "7026");
    const active = transitionFlightPlan(pending, "active");
    if (!active.ok) throw new Error(active.error.message);
    const suspended = transitionFlightPlan(active.value, "suspended", "beacon-mismatch");
    if (!suspended.ok) throw new Error(suspended.error.message);
    const ac = target("ac-mismatch", "1234", "7027");
    const world = createWorld({ flightPlans: [suspended.value], aircraft: [ac] });

    const result = associateFlightPlan(world, "fp-mismatch", "ac-mismatch");

    expect(result).toMatchObject({ ok: true, plan: { status: "active" } });
    expect(world.flightPlans[0]).toMatchObject({
      status: "active",
      associatedAircraftId: "ac-mismatch",
    });
    expect(world.flightPlans[0]!.suspensionReason).toBeUndefined();
  });

  it("creates an active plan from an explicit target selection", () => {
    const ac = target("ac-3", "UAL789", "4312");
    const world = createWorld({ aircraft: [ac] });
    const result = createActiveFlightPlanFromTarget(world, "ac-3");
    expect(result).toMatchObject({
      ok: true,
      plan: { status: "active", acid: "UAL789", associatedAircraftId: "ac-3" },
    });
    expect(world.flightPlans).toHaveLength(1);
  });

  it("correlates only when the aircraft squawk update is applied", () => {
    const ac = target("ac-update", "1234", "1200");
    const world = createWorld({
      flightPlans: [plan("fp-update", "AAL123", "7022")],
      aircraft: [ac],
    });
    expect(world.flightPlans[0]!.status).toBe("pending");
    const update = updateAircraftSquawk(world, ac.id, "7022");
    expect(update?.correlation).toMatchObject({ ok: true, aircraftId: ac.id });
    expect(world.flightPlans[0]).toMatchObject({ status: "active", associatedAircraftId: ac.id });
  });

  it("leaves invalid reports and duplicate pending candidates unassociated", () => {
    const invalid = target("ac-invalid", "1234", "78A1");
    const invalidWorld = createWorld({ aircraft: [invalid] });
    expect(correlateFlightPlanForAircraft(invalidWorld, invalid.id)).toMatchObject({
      ok: false,
      error: { code: "INVALID_SQUAWK" },
    });

    const a = plan("fp-a", "AAL100", "7022");
    const b = plan("fp-b", "AAL101", "7022");
    const ambiguous = createWorld({
      flightPlans: [a, b],
      aircraft: [target("ac-ambiguous", "1234", "7022")],
    });
    expect(correlateFlightPlanForAircraft(ambiguous, "ac-ambiguous")).toMatchObject({
      ok: false,
      error: { code: "AMBIGUOUS_MATCH", aircraftIds: ["fp-a", "fp-b"] },
    });
    expect(ambiguous.flightPlans.every((item) => item.status === "pending")).toBe(true);
  });
});
