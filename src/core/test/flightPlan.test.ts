import { expect, test } from "vitest";
import {
  allocateBeaconCode,
  createFlightPlan,
  deleteFlightPlan,
  transitionFlightPlan,
  validateFlightPlan,
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
  const suspended = transitionFlightPlan(active, "suspended");
  expect(suspended.status).toBe("suspended");
  expect(deleteFlightPlan(suspended).status).toBe("deleted");
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
