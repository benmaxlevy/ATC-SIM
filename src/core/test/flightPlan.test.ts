import { expect, test } from "vitest";
import {
  allocateBeaconCode,
  createFlightPlan,
  createWorld,
  deleteFlightPlan,
  deleteFlightPlanFromWorld,
  makeTestAircraft,
  modifyFlightPlan,
  transitionFlightPlan,
  validateFlightPlan,
  withAllocatedBeacon,
} from "@core";

function plan(overrides: Partial<Parameters<typeof createFlightPlan>[0]> = {}) {
  return {
    id: "fp-1",
    acid: "DAL123",
    fixes: ["FIXA"],
    scratchpads: [],
    ...overrides,
  };
}

function errorCode(result: ReturnType<typeof createFlightPlan>) {
  if (result.ok) throw new Error("expected a validation error");
  return result.error.code;
}

test("AC1 — plans support pending, active, suspended, and deleted states", () => {
  const made = createFlightPlan(plan());
  expect(made.ok).toBe(true);
  if (!made.ok) return;
  const active = transitionFlightPlan(made.value, "active");
  expect(active.ok).toBe(true);
  if (!active.ok) return;
  const suspended = transitionFlightPlan(active.value, "suspended");
  expect(suspended).toEqual({ ok: true, value: { ...active.value, status: "suspended" } });
  if (!suspended.ok) return;
  expect(transitionFlightPlan(suspended.value, "active")).toEqual({
    ok: true,
    value: { ...suspended.value, status: "active" },
  });
  expect(transitionFlightPlan(suspended.value, "pending")).toEqual({
    ok: true,
    value: { ...suspended.value, status: "pending" },
  });
  expect(deleteFlightPlan(suspended.value).status).toBe("deleted");
});

test("lifecycle rejects unsupported status transitions", () => {
  const made = createFlightPlan(plan());
  expect(made.ok).toBe(true);
  if (!made.ok) return;

  const active = transitionFlightPlan(made.value, "active");
  expect(active.ok).toBe(true);
  if (!active.ok) return;
  const suspended = transitionFlightPlan(active.value, "suspended");
  expect(suspended.ok).toBe(true);
  if (!suspended.ok) return;

  for (const [current, next] of [
    [made.value, "pending"],
    [made.value, "suspended"],
    [active.value, "active"],
    [active.value, "pending"],
    [suspended.value, "suspended"],
  ] as const) {
    expect(transitionFlightPlan(current, next)).toMatchObject({
      ok: false,
      error: { code: "INVALID_STATUS_TRANSITION", field: "status" },
    });
  }
});

test("AC2 — invalid identities and duplicate active identities return typed errors", () => {
  expect(errorCode(createFlightPlan(plan({ acid: "bad acid" })))).toBe("INVALID_ACID");
  expect(errorCode(createFlightPlan(plan({ assignedBeacon: "1288" })))).toBe("INVALID_BEACON");
  const existing = createFlightPlan(plan({ assignedBeacon: "0420" }));
  if (!existing.ok) throw new Error("fixture failed");
  expect(errorCode(createFlightPlan(plan({ id: "fp-2" }), [existing.value]))).toBe(
    "DUPLICATE_ACID",
  );
  expect(
    errorCode(
      createFlightPlan(plan({ id: "fp-2", acid: "UAL1", assignedBeacon: "0420" }), [
        existing.value,
      ]),
    ),
  ).toBe("DUPLICATE_BEACON");
});

test("ACID validation follows TI 6191.409 Rev 30 Table 5-9 boundaries", () => {
  for (const acid of ["A1", "AB12345", "dal123", " Z9 "]) {
    expect(createFlightPlan(plan({ acid })).ok).toBe(true);
  }
  for (const acid of ["A", "AA", "A1234567", "1A", "ALL", "AB-123"]) {
    expect(createFlightPlan(plan({ acid })).ok).toBe(false);
  }
});

test("AC3 — allocation is deterministic and supports an exhausted pool", () => {
  expect(allocateBeaconCode(["0701", "0702"], ["0701"])).toEqual({ ok: true, value: "0702" });
  expect(allocateBeaconCode(["0701", "0702"], ["0701", "0702"])).toEqual({
    ok: true,
    value: undefined,
  });
  expect(allocateBeaconCode(["0702", "0701"], [])).toEqual({ ok: true, value: "0702" });
});

test("AC4 — reported squawk is surveillance evidence, never ACID", () => {
  const made = createFlightPlan(plan({ assignedBeacon: "0420", reportedBeacon: "0421" }));
  expect(made.ok).toBe(true);
  if (!made.ok) return;
  expect(made.value.acid).toBe("DAL123");
  expect(made.value.assignedBeacon).toBe("0420");
  expect(made.value.reportedBeacon).toBe("0421");
});

test("AC5 — validation accepts four-digit octal codes and ignores deleted identities", () => {
  const deleted = { ...plan({ assignedBeacon: "0000" }), status: "deleted" as const };
  expect(validateFlightPlan(plan({ acid: "UAL1", assignedBeacon: "7777" }), [deleted])).toEqual([]);
});

test("deletion releases assigned and reported beacons for reuse", () => {
  const made = createFlightPlan(plan({ assignedBeacon: "0701", reportedBeacon: "0702" }));
  expect(made.ok).toBe(true);
  if (!made.ok) return;
  const deleted = deleteFlightPlan(made.value);
  expect(deleted).toMatchObject({
    status: "deleted",
    assignedBeacon: undefined,
    reportedBeacon: undefined,
  });
  const candidate = createFlightPlan(plan({ acid: "UAL1" }));
  expect(candidate.ok).toBe(true);
  if (!candidate.ok) return;
  const allocated = withAllocatedBeacon(candidate.value, ["0701"], [deleted]);
  expect(allocated.ok).toBe(true);
  if (!allocated.ok) return;
  expect(allocated.value.assignedBeacon).toBe("0701");
});

test("deleted plans cannot transition to another state", () => {
  const made = createFlightPlan(plan());
  expect(made.ok).toBe(true);
  if (!made.ok) return;
  const deleted = deleteFlightPlan(made.value);
  expect(transitionFlightPlan(deleted, "active")).toMatchObject({
    ok: false,
    error: { code: "INVALID_STATUS_TRANSITION", field: "status" },
  });
});

test("modification updates the authoritative plan and associated datablock fields", () => {
  const made = createFlightPlan(plan({ assignedBeacon: "0701", route: "FIXA" }));
  expect(made.ok).toBe(true);
  if (!made.ok) return;
  const aircraft = makeTestAircraft({ id: "ac-1", callsign: "DAL123", assignedSquawk: "0701" });
  const world = createWorld({ flightPlans: [made.value], aircraft: [aircraft] });
  made.value.associatedAircraftId = aircraft.id;
  aircraft.flightPlanId = made.value.id;
  const result = modifyFlightPlan(world, made.value.id, "acid", "UAL456");
  expect(result).toMatchObject({ ok: true, plan: { acid: "UAL456" } });
  expect(aircraft.callsign).toBe("UAL456");
  expect(aircraft.flightPlanId).toBe(made.value.id);
});

test("modification rejects duplicate beacon and active-only ETA", () => {
  const first = createFlightPlan(plan({ assignedBeacon: "0701" }));
  const second = createFlightPlan(plan({ id: "fp-2", acid: "UAL456", assignedBeacon: "0702" }));
  expect(first.ok && second.ok).toBe(true);
  if (!first.ok || !second.ok) return;
  const active = transitionFlightPlan(second.value, "active");
  expect(active.ok).toBe(true);
  if (!active.ok) return;
  const world = createWorld({ flightPlans: [first.value, active.value] });
  expect(modifyFlightPlan(world, active.value.id, "assignedBeacon", "0701")).toMatchObject({
    ok: false,
    error: { code: "DUPLICATE_BEACON" },
  });
  expect(modifyFlightPlan(world, active.value.id, "eta", "1200")).toMatchObject({
    ok: false,
    error: { code: "INVALID_FIELD" },
  });
});

test("deleting an associated plan releases identity and leaves target unassociated", () => {
  const made = createFlightPlan(plan({ assignedBeacon: "0701" }));
  expect(made.ok).toBe(true);
  if (!made.ok) return;
  const aircraft = makeTestAircraft({ id: "ac-1", callsign: "DAL123", xNm: 4, yNm: 3 });
  const world = createWorld({ flightPlans: [made.value], aircraft: [aircraft] });
  made.value.associatedAircraftId = aircraft.id;
  aircraft.flightPlanId = made.value.id;
  aircraft.flightPlan = { route: "FIXA" };
  const pose = { x: aircraft.xNm, y: aircraft.yNm };
  const result = deleteFlightPlanFromWorld(world, made.value.id);
  expect(result).toMatchObject({ ok: true, plan: { status: "deleted" } });
  expect(aircraft.flightPlanId).toBeUndefined();
  expect(aircraft.flightPlan).toBeUndefined();
  expect({ x: aircraft.xNm, y: aircraft.yNm }).toEqual(pose);
});
