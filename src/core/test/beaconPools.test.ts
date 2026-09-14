import { expect, test } from "vitest";
import {
  allocateBeaconCode,
  allocateBeaconPoolCode,
  beaconPoolFor,
  createBeaconPoolConfig,
  createFlightPlan,
  createWorld,
  deleteFlightPlan,
  occupiedBeaconCodes,
  withAllocatedBeacon,
} from "@core";

function plan(overrides: Partial<Parameters<typeof createFlightPlan>[0]> = {}) {
  return {
    id: "fp-1",
    acid: "DAL123",
    fixes: [],
    scratchpads: [],
    ...overrides,
  };
}

test("missing config is an explicit no-pool policy", () => {
  const result = createBeaconPoolConfig();
  expect(result).toEqual({
    ok: true,
    value: {
      pools: { ifr: [], vfr: [], general1: [], general2: [], general3: [], general4: [] },
      defaultPool: "none",
    },
  });
  if (result.ok) expect(beaconPoolFor(result.value, result.value.defaultPool)).toEqual([]);
  expect(createWorld().beaconPools.defaultPool).toBe("none");
});

test("config normalizes codes and validates pool membership", () => {
  const result = createBeaconPoolConfig({
    defaultPool: "ifr",
    pools: { ifr: [" 4215 ", "0701"], vfr: ["1200"] },
  });
  expect(result).toEqual({
    ok: true,
    value: {
      defaultPool: "ifr",
      pools: {
        ifr: ["4215", "0701"],
        vfr: ["1200"],
        general1: [],
        general2: [],
        general3: [],
        general4: [],
      },
    },
  });
  expect(createBeaconPoolConfig({ pools: { ifr: ["1289"] } })).toMatchObject({
    ok: false,
    error: { code: "INVALID_CODE", field: "ifr" },
  });
  expect(createBeaconPoolConfig({ pools: { ifr: ["0421", "0421"] } })).toMatchObject({
    ok: false,
    error: { code: "DUPLICATE_CODE" },
  });
  expect(createBeaconPoolConfig({ pools: { ifr: ["0421"], vfr: ["0421"] } })).toMatchObject({
    ok: false,
    error: { code: "DUPLICATE_CODE" },
  });
  expect(createBeaconPoolConfig({ defaultPool: "unknown" })).toMatchObject({
    ok: false,
    error: { code: "INVALID_DEFAULT_POOL" },
  });
});

test("allocation is ordered, normalized, and reports exhaustion without randomness", () => {
  expect(allocateBeaconCode(["0701", "0702"], [" 0701 "])).toEqual({
    ok: true,
    value: "0702",
  });
  expect(allocateBeaconCode(["0702", "0701"], [])).toEqual({ ok: true, value: "0702" });
  expect(allocateBeaconCode(["0701"], ["0701"])).toEqual({ ok: true, value: undefined });
  expect(allocateBeaconPoolCode(["4215", "1289"])).toMatchObject({
    ok: false,
    error: { code: "INVALID_CODE" },
  });
});

test("occupancy includes live plan/assigned aircraft values, not reported values", () => {
  const live = createFlightPlan(plan({ assignedBeacon: "0701" }));
  const deleted = createFlightPlan(plan({ id: "fp-2", acid: "UAL456", assignedBeacon: "0702" }));
  expect(live.ok && deleted.ok).toBe(true);
  if (!live.ok || !deleted.ok) return;
  const occupancy = occupiedBeaconCodes(
    [live.value, deleteFlightPlan(deleted.value)],
    [{ assignedSquawk: " 0703 " }, { assignedSquawk: undefined }],
  );
  expect([...occupancy]).toEqual(["0701", "0703"]);
});

test("allocated plan skips assigned aircraft and reuses a released plan code", () => {
  const candidate = createFlightPlan(plan());
  const held = createFlightPlan(plan({ id: "fp-2", acid: "UAL456", assignedBeacon: "0701" }));
  expect(candidate.ok && held.ok).toBe(true);
  if (!candidate.ok || !held.ok) return;

  const skipped = withAllocatedBeacon(
    candidate.value,
    ["0701", "0702"],
    [deleteFlightPlan(held.value)],
    [{ assignedSquawk: "0701" }],
  );
  expect(skipped).toMatchObject({ ok: true, value: { assignedBeacon: "0702" } });

  const reused = withAllocatedBeacon(
    candidate.value,
    ["0701", "0702"],
    [deleteFlightPlan(held.value)],
  );
  expect(reused).toMatchObject({ ok: true, value: { assignedBeacon: "0701" } });
});
