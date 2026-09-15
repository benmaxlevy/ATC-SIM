import { describe, expect, test } from "vitest";
import {
  createAircraft,
  createFlightPlan,
  createWorld,
  releaseAssignedBeacon,
  saveFlightPlanDraft,
  type FlightPlan,
} from "@core";
import { createScenarioIfrFlightPlan, createWorldFromScenario, loadKdem } from "@scenario";
import { getFlightPlanEntries, buildTabFlightPlanList } from "../systemLists";
import { terminalStripsFromWorld } from "../../ui/strips/terminalStripsFromWorld";

const syntheticPools = {
  defaultPool: "ifr" as const,
  pools: {
    ifr: ["4215", "4216"],
    vfr: ["1201"],
    general1: ["2300"],
    general2: ["2301"],
    general3: ["2302"],
    general4: ["2303"],
  },
};

function makePlan(acid: string, assignedBeacon?: string): FlightPlan {
  const result = createFlightPlan({
    id: `fp-${acid}`,
    status: "pending",
    acid,
    ...(assignedBeacon === undefined ? {} : { assignedBeacon }),
    fixes: [],
    scratchpads: [],
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value as never;
}

describe("T02-199 configurable beacon-pool integration", () => {
  test("scenario loader copies generic adaptation into World and scenario IFR uses its default", () => {
    const scenario = loadKdem();
    expect(scenario.beaconPools?.defaultPool).toBe("ifr");

    const world = createWorldFromScenario(scenario, 7);
    expect(world.beaconPools).toBe(scenario.beaconPools);
    const targetCallsigns = new Set(world.aircraft.map((aircraft) => aircraft.callsign));
    const targetPlans = world.flightPlans.filter((plan) => targetCallsigns.has(plan.acid));
    expect(targetPlans).toHaveLength(world.aircraft.length);
    expect(new Set(targetPlans.map((plan) => plan.assignedBeacon)).size).toBe(targetPlans.length);

    const noAdaptationWorld = createWorld({ catalog: scenario.catalog });
    const noCode = createScenarioIfrFlightPlan(noAdaptationWorld, {
      acid: "NOCODE1",
      scenario,
      aircraftType: "B738",
    });
    expect(noCode.assignedBeacon).toBeUndefined();
  });

  test("modal/scenario allocation share deterministic order, aircraft occupancy, and release", () => {
    const aircraft = createAircraft({
      id: "occupied-aircraft",
      callsign: "OCC123",
      xNm: 0,
      yNm: 0,
      headingDeg: 0,
      altitudeFt: 4000,
      speedKt: 180,
      assignedSquawk: "4215",
      reportedSquawk: "7000",
    });
    const world = createWorld({ beaconPools: syntheticPools, aircraft: [aircraft] });
    const modal = saveFlightPlanDraft(world, { acid: "MOD123" });
    expect(modal).toMatchObject({ ok: true, plan: { assignedBeacon: "4216" } });

    const noCodeModal = saveFlightPlanDraft(world, { acid: "MOD124", assignedBeacon: "A" });
    expect(noCodeModal).toMatchObject({ ok: true, plan: { assignedBeacon: undefined } });

    const released = releaseAssignedBeacon(world, modal.ok ? modal.plan.id : "missing");
    expect(released.ok).toBe(true);
    const reused = saveFlightPlanDraft(world, { acid: "MOD125" });
    expect(reused).toMatchObject({ ok: true, plan: { assignedBeacon: "4216" } });

    const duplicateAircraft = saveFlightPlanDraft(world, {
      acid: "MOD126",
      assignedBeacon: "4215",
    });
    expect(duplicateAircraft).toMatchObject({ ok: false, error: { code: "DUPLICATE_BEACON" } });
  });

  test("FL/TAB and terminal strips leave a no-code plan beacon blank", () => {
    const plan = makePlan("BLANK1");
    const aircraft = createAircraft({
      id: "blank-aircraft",
      callsign: "BLANK1",
      xNm: 2,
      yNm: 3,
      headingDeg: 90,
      altitudeFt: 5000,
      speedKt: 190,
    });
    const world = createWorld({ flightPlans: [plan], aircraft: [aircraft] });

    expect(getFlightPlanEntries(world)[0]?.squawk).toBeUndefined();
    expect(buildTabFlightPlanList(world).some((line) => line.startsWith("01 BLANK1"))).toBe(true);
    expect(buildTabFlightPlanList(world)).not.toContain("1200");
    const strips = terminalStripsFromWorld(world);
    expect(strips.arrivals[0]?.beaconCode).toBe("");
    expect(strips.arrivals[0]?.reportedSquawk).toBeUndefined();
  });
});
