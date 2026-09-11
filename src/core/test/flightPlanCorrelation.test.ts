import { describe, expect, it } from "vitest";
import { createAircraft } from "../aircraft";
import {
  associateFlightPlan,
  correlateFlightPlans,
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
    const result = correlateFlightPlans(world);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ ok: true, aircraftId: "ac-1" });
    expect(world.flightPlans[0]).toMatchObject({
      status: "active",
      acid: "AAL123",
      associatedAircraftId: "ac-1",
    });
    expect(ac.callsign).toBe("AAL123");
    expect(ac.squawk).toBe("7022");
    expect(ac.flightPlanId).toBe("fp-1");
  });

  it("does not correlate 1200 or ambiguous duplicate reports", () => {
    const vfr = target("ac-vfr", "N12345", "1200");
    const world = createWorld({ flightPlans: [plan("fp-vfr", "N12345", "1200")], aircraft: [vfr] });
    expect(correlateFlightPlans(world)[0]).toMatchObject({
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
    expect(correlateFlightPlans(duplicate)[0]).toMatchObject({
      ok: false,
      error: { code: "AMBIGUOUS_MATCH", aircraftIds: ["ac-a", "ac-b"] },
    });
    expect(duplicate.flightPlans[0]!.status).toBe("pending");
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
      callsign: "DAL456",
    });
    expect(ac.squawk).toBe("1200");
    expect(ac.assignedSquawk).toBe("7024");
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
});
