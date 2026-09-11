import { describe, expect, it } from "vitest";
import {
  associateFlightPlan,
  createAircraft,
  createFlightPlan,
  createWorld,
  deleteFlightPlanFromWorld,
  modifyFlightPlan,
  updateAircraftSquawk,
} from "@core";
import { datablockSourceFromWorld, formatFullDatablock } from "../datablock";
import { buildTabFlightPlanList, getFlightPlanEntries } from "../systemLists";
import { createScopeView } from "../scopeView";
import { terminalStripsFromWorld } from "../../ui/strips/terminalStripsFromWorld";

describe("T02-147 authoritative flight-plan display lifecycle", () => {
  it("projects plan fields into the FDB and keeps reported mismatch separate", () => {
    const made = createFlightPlan({
      id: "fp-lifecycle",
      acid: "AAL123",
      assignedBeacon: "7022",
      reportedBeacon: "7023",
      assignedAltitudeFt: 8000,
      requestedAltitudeFt: 12000,
      aircraftType: "B738",
      flightRules: "IFR",
      fixes: ["FIXA"],
      scratchpads: [],
    });
    if (!made.ok) throw new Error(made.error.message);
    const aircraft = createAircraft({
      id: "ac-lifecycle",
      callsign: "1234",
      xNm: 1,
      yNm: 2,
      headingDeg: 90,
      squawk: "7023",
      altitudeFt: 6000,
      speedKt: 210,
      aircraftType: "C172",
    });
    const world = createWorld({ flightPlans: [made.value], aircraft: [aircraft] });
    expect(associateFlightPlan(world, made.value.id, aircraft.id).ok).toBe(true);

    const source = datablockSourceFromWorld(world, aircraft);
    expect(source.callsign).toBe("AAL123");
    expect(source.assignedSquawk).toBe("7022");
    expect(source.reportedSquawk).toBe("7023");
    expect(source.aircraftType).toBe("B738");
    expect(source.requestedAltitudeFt).toBe(12000);
    expect(formatFullDatablock(source).line1).toBe("AAL123");
    expect(formatFullDatablock(source, { timeSharePhase: 1 }).line3).toContain("7023");
  });

  it("keeps FL/TAB and strips aligned through edit and association", () => {
    const made = createFlightPlan({
      id: "fp-list",
      acid: "DAL456",
      assignedBeacon: "7031",
      requestedAltitudeFt: 9000,
      airportId: "KDEM",
      route: "FIXB FIXC",
      fixes: ["FIXB"],
      scratchpads: [],
    });
    if (!made.ok) throw new Error(made.error.message);
    const aircraft = createAircraft({
      id: "ac-list",
      callsign: "5678",
      xNm: 1,
      yNm: 2,
      headingDeg: 90,
      squawk: "1200",
      altitudeFt: 4000,
      speedKt: 180,
    });
    const world = createWorld({ flightPlans: [made.value], aircraft: [aircraft] });
    const view = createScopeView();
    expect(getFlightPlanEntries(world, view)).toMatchObject([
      { callsign: "DAL456", squawk: "7031", planId: "fp-list", index: 1 },
    ]);
    expect(modifyFlightPlan(world, "fp-list", "requestedAltitudeFt", 11000).ok).toBe(true);
    expect(terminalStripsFromWorld(world).arrivals[0]).toMatchObject({
      acid: "5678",
      beaconCode: "1200",
    });
    expect(associateFlightPlan(world, "fp-list", "ac-list").ok).toBe(true);
    expect(getFlightPlanEntries(world, view)).toHaveLength(0);
    expect(terminalStripsFromWorld(world).arrivals[0]).toMatchObject({
      acid: "DAL456",
      beaconCode: "7031",
      destinationAirport: "KDEM",
      remarks: "FIXB FIXC",
    });
  });

  it("deletes the authoritative plan without changing aircraft kinematics", () => {
    const made = createFlightPlan({
      id: "fp-delete",
      acid: "UAL789",
      assignedBeacon: "7042",
      fixes: [],
      scratchpads: [],
    });
    if (!made.ok) throw new Error(made.error.message);
    const aircraft = createAircraft({
      id: "ac-delete",
      callsign: "7890",
      xNm: 9,
      yNm: -3,
      headingDeg: 123,
      altitudeFt: 5000,
      speedKt: 190,
      squawk: "7042",
    });
    const world = createWorld({ flightPlans: [made.value], aircraft: [aircraft] });
    expect(associateFlightPlan(world, made.value.id, aircraft.id).ok).toBe(true);
    const pose = [
      aircraft.xNm,
      aircraft.yNm,
      aircraft.headingDeg,
      aircraft.altitudeFt,
      aircraft.speedKt,
    ];
    expect(deleteFlightPlanFromWorld(world, made.value.id).ok).toBe(true);
    expect(world.flightPlans[0]?.status).toBe("deleted");
    expect(world.flightPlans[0]?.associatedAircraftId).toBeUndefined();
    expect([
      aircraft.xNm,
      aircraft.yNm,
      aircraft.headingDeg,
      aircraft.altitudeFt,
      aircraft.speedKt,
    ]).toEqual(pose);
  });

  it("correlates only on the target squawk event, never on list reads", () => {
    const made = createFlightPlan({
      id: "fp-event",
      acid: "UAL123",
      assignedBeacon: "7052",
      fixes: [],
      scratchpads: [],
    });
    if (!made.ok) throw new Error(made.error.message);
    const aircraft = createAircraft({
      id: "ac-event",
      callsign: "1234",
      xNm: 1,
      yNm: 1,
      headingDeg: 90,
      altitudeFt: 4000,
      speedKt: 180,
      squawk: "1200",
    });
    const world = createWorld({ flightPlans: [made.value], aircraft: [aircraft] });
    const view = createScopeView();

    buildTabFlightPlanList(world, 10, view);
    buildTabFlightPlanList(world, 10, view);
    expect(world.flightPlans[0]).toMatchObject({
      status: "pending",
    });
    expect(world.flightPlans[0].associatedAircraftId).toBeUndefined();
    expect(aircraft.callsign).toBe("1234");

    const update = updateAircraftSquawk(world, aircraft.id, "7052");
    expect(update?.correlation).toMatchObject({ ok: true, aircraftId: aircraft.id });
    expect(world.flightPlans[0]).toMatchObject({
      status: "active",
      associatedAircraftId: aircraft.id,
    });
    expect(aircraft.squawk).toBe("7052");
    expect(aircraft.callsign).toBe("1234");
  });
});
