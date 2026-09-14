import { describe, expect, test } from "vitest";
import {
  createFlightPlan,
  createWorld,
  flightPlanForAircraft,
  makeTestAircraft,
  modifyFlightPlan,
  type FlightPlan,
  updateAircraftSquawk,
} from "@core";
import { applyIntent } from "@pilot";
import {
  buildDatablockRuntimeState,
  formatDatablockFields,
  linesForDatablock,
  type DatablockMode,
} from "../datablock";

function syntheticPlan(overrides: Partial<FlightPlan> = {}): FlightPlan {
  const result = createFlightPlan({
    id: "t02-187-plan",
    status: "active",
    acid: "SYN187",
    assignedBeacon: "4321",
    fixes: [],
    scratchpads: [],
    ...overrides,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function runtimeProjection(
  world: ReturnType<typeof createWorld>,
  aircraft: ReturnType<typeof makeTestAircraft>,
  mode: DatablockMode,
) {
  const state = buildDatablockRuntimeState(world, aircraft, {
    mode,
    track: {
      ownership: mode === "full" ? "owned" : "unowned",
      unassociated: mode === "limited",
      datablockMode: mode,
      squawk: aircraft.squawk,
    },
  });
  return {
    state,
    lines: linesForDatablock(state.source, mode, {
      ...state.options,
      timeSharePhase: 1,
    }),
  };
}

describe("T02-187 datablock semantics acceptance", () => {
  test.each([
    ["IFR", "11"],
    ["VFR", "11V"],
  ] as const)("maps %s flight rules to the Field 5 display contract", (flightRules, expected) => {
    const aircraft = makeTestAircraft({
      id: `t02-187-${flightRules.toLowerCase()}`,
      callsign: "RAW187",
      squawk: "4321",
      altitudeFt: 8000,
      speedKt: 110,
    });
    const world = createWorld({
      aircraft: [aircraft],
      flightPlans: [
        syntheticPlan({
          id: `t02-187-${flightRules.toLowerCase()}-plan`,
          flightRules,
          requestedAltitudeFt: undefined,
          assignedAltitudeFt: undefined,
        }),
      ],
    });

    const source = buildDatablockRuntimeState(world, aircraft, {
      mode: "full",
      track: { ownership: "owned", datablockMode: "full", squawk: aircraft.squawk },
    }).source;
    const fields = formatDatablockFields(source, { timeSharePhase: 0 });

    expect(fields.field5).toBe(expected);
    expect(Object.values(fields).join(" ")).not.toContain("IFR");
    expect(Object.values(fields).join(" ")).not.toContain("VFR");
  });

  test("FDB, PDB, and LDB use one source while preserving plan and Mode C provenance", () => {
    const aircraft = makeTestAircraft({
      id: "t02-187-matrix",
      callsign: "RAW187",
      squawk: "4321",
      altitudeFt: 8000,
      speedKt: 210,
    });
    const world = createWorld({
      aircraft: [aircraft],
      flightPlans: [
        syntheticPlan({
          id: "t02-187-matrix-plan",
          flightRules: "IFR",
          requestedAltitudeFt: 12000,
          assignedAltitudeFt: 10000,
        }),
      ],
    });
    const state = buildDatablockRuntimeState(world, aircraft, {
      mode: "full",
      track: { ownership: "owned", datablockMode: "full", squawk: aircraft.squawk },
    });
    const timeShared = { ...state.options, timeSharePhase: 1 };

    expect(state.source).toMatchObject({
      altitudeFt: 8000,
      requestedAltitudeFt: 12000,
      intent: { controllerAssignedAltitudeFt: 10000 },
      flightRules: "IFR",
    });
    expect(linesForDatablock(state.source, "full", timeShared)).toMatchObject({
      line1: "SYN187",
      line2: "080  R120",
      line3: "A100",
    });
    expect(linesForDatablock(state.source, "partial", timeShared)).toMatchObject({
      line1: "080  21",
    });
    expect(linesForDatablock(state.source, "limited", timeShared)).toEqual({
      line1: "4321",
      line2: "080",
    });
  });

  test("association and disassociation add and remove plan-backed R/A without stale projection", () => {
    const aircraft = makeTestAircraft({
      id: "t02-187-association",
      callsign: "RAW187",
      squawk: "1200",
      altitudeFt: 8000,
      requestedAltitudeFt: 33000,
    });
    aircraft.intent.requestedAltitudeFt = 33000;
    const plan = syntheticPlan({
      id: "t02-187-association-plan",
      requestedAltitudeFt: 12000,
      assignedAltitudeFt: 10000,
    });
    const world = createWorld({ aircraft: [aircraft], flightPlans: [plan] });

    expect(flightPlanForAircraft(world, aircraft.id)).toBeUndefined();
    const unassociated = runtimeProjection(world, aircraft, "limited");
    expect(unassociated.state.source).toMatchObject({ callsign: "RAW187" });
    expect(unassociated.state.source.requestedAltitudeFt).toBeUndefined();
    expect(unassociated.state.source.intent.controllerAssignedAltitudeFt).toBeUndefined();
    expect(unassociated.lines).toEqual({ line1: "1200", line2: "080" });

    expect(updateAircraftSquawk(world, aircraft.id, "4321")?.correlation).toMatchObject({
      ok: true,
      plan: { id: plan.id },
    });
    expect(flightPlanForAircraft(world, aircraft.id)?.id).toBe(plan.id);
    const associated = runtimeProjection(world, aircraft, "full");
    expect(associated.lines).toMatchObject({ line2: "080  R120", line3: "A100" });

    expect(updateAircraftSquawk(world, aircraft.id, "4322")?.correlation).toMatchObject({
      ok: false,
    });
    expect(flightPlanForAircraft(world, aircraft.id)).toBeUndefined();
    const disassociated = runtimeProjection(world, aircraft, "limited");
    expect(disassociated.state.source.requestedAltitudeFt).toBeUndefined();
    expect(disassociated.state.source.intent.controllerAssignedAltitudeFt).toBeUndefined();
    expect(disassociated.lines).toEqual({ line1: "4322", line2: "080" });
    expect(world.flightPlans[0]).toMatchObject({
      requestedAltitudeFt: 12000,
      assignedAltitudeFt: 10000,
    });
  });

  test("climb/descend changes intent only; flight-plan altitude adjustments change A/R", () => {
    const aircraft = makeTestAircraft({
      id: "t02-187-intent",
      callsign: "RAW187",
      squawk: "4321",
      altitudeFt: 8000,
    });
    const plan = syntheticPlan({
      id: "t02-187-intent-plan",
      requestedAltitudeFt: 12000,
      assignedAltitudeFt: 10000,
    });
    const world = createWorld({ aircraft: [aircraft], flightPlans: [plan] });
    const beforePlan = structuredClone(plan);

    applyIntent(
      aircraft,
      [{ type: "ALTITUDE", altitudeFt: 14000, verb: "CLIMB" }],
      world.simTimeMs,
    );
    expect(aircraft.intent.assignedAltitudeFt).toBe(14000);
    expect(world.flightPlans[0]).toEqual(beforePlan);
    const afterIntent = runtimeProjection(world, aircraft, "full");
    expect(afterIntent.lines).toMatchObject({ line2: "080  R120", line3: "A100" });
    expect(afterIntent.state.source.intent.controllerAssignedAltitudeFt).toBe(10000);

    expect(modifyFlightPlan(world, plan.id, "assignedAltitudeFt", 11000)).toMatchObject({
      ok: true,
    });
    expect(modifyFlightPlan(world, plan.id, "requestedAltitudeFt", 13000)).toMatchObject({
      ok: true,
    });
    const afterPlanAdjustment = runtimeProjection(world, aircraft, "full");
    expect(afterPlanAdjustment.lines).toMatchObject({ line2: "080  R130", line3: "A110" });
    expect(aircraft.intent.assignedAltitudeFt).toBe(14000);
  });
});
