import { describe, expect, it } from "vitest";
import {
  createAircraft,
  createFlightPlan,
  createWorld,
  deleteFlightPlanFromWorld,
  flightPlanForAircraft,
  modifyFlightPlan,
  saveFlightPlanDraft,
  SessionLog,
  stepWorld,
  updateAircraftSquawk,
} from "@core";
import {
  createScenarioIfrFlightPlan,
  createWorldForSession,
  spawnDueDepartures,
  type ProcedureCatalog,
} from "../../scenario";
import { loadKdem } from "../../scenario/load";
import { parseDepartureOptions } from "../../scenario/trafficQuery";
import { datablockSourceFromWorld, formatFullDatablock } from "../datablock";
import { buildTabFlightPlanList, getFlightPlanEntries } from "../systemLists";
import { createScopeView } from "../scopeView";
import { syncTrackDisplays } from "../trackDisplay";
import { terminalStripsFromWorld } from "../../ui/strips/terminalStripsFromWorld";
import {
  flightPlanModalDraftFromPlan,
  submitFlightPlanModalDraft,
} from "../../ui/controls/FlightPlanModal";

const syntheticCatalog: ProcedureCatalog = {
  schemaVersion: 1,
  airportId: "KZZZ",
  name: "Synthetic modal acceptance",
  magVarDeg: 0,
  fieldElevFt: 100,
  arp: { latDeg: 0, lonDeg: 0 },
  navaids: [],
  fixes: [
    { id: "RW09", kind: "THRESHOLD", xNm: 0, yNm: 0 },
    { id: "FIX1", kind: "WAYPOINT", xNm: 4, yNm: 4 },
  ],
  stars: [],
  approaches: [],
  sids: [
    {
      id: "SYN1",
      name: "SYNTHETIC ONE",
      common: [{ fixId: "FIX1" }],
      runwayTransitions: [{ runwayId: "09", initialHeadingDeg: 90, legs: [] }],
    },
  ],
  atpaVolumes: [],
};

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
      squawk: "7022",
      altitudeFt: 6000,
      speedKt: 210,
      aircraftType: "C172",
    });
    const world = createWorld({ flightPlans: [made.value], aircraft: [aircraft] });
    const source = datablockSourceFromWorld(world, aircraft);
    expect(source.callsign).toBe("AAL123");
    expect(source.assignedSquawk).toBe("7022");
    expect(source.reportedSquawk).toBe("7022");
    expect(source.aircraftType).toBe("B738");
    expect(source.requestedAltitudeFt).toBe(12000);
    expect(formatFullDatablock(source).line1).toBe("AAL123");
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
      squawk: "7031",
      altitudeFt: 4000,
      speedKt: 180,
    });
    const world = createWorld({ flightPlans: [made.value], aircraft: [aircraft] });
    const view = createScopeView();
    expect(getFlightPlanEntries(world, view)).toHaveLength(0);
    expect(modifyFlightPlan(world, "fp-list", "requestedAltitudeFt", 11000).ok).toBe(true);
    expect(terminalStripsFromWorld(world).arrivals[0]).toMatchObject({
      acid: "DAL456",
      beaconCode: "7031",
    });
    expect(getFlightPlanEntries(world, view)).toHaveLength(0);
    expect(terminalStripsFromWorld(world).arrivals[0]).toMatchObject({
      acid: "DAL456",
      beaconCode: "7031",
      destinationAirport: "KDEM",
      remarks: "",
      box9C: "FIXB FIXC",
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
    const pose = [
      aircraft.xNm,
      aircraft.yNm,
      aircraft.headingDeg,
      aircraft.altitudeFt,
      aircraft.speedKt,
    ];
    expect(deleteFlightPlanFromWorld(world, made.value.id).ok).toBe(true);
    expect(world.flightPlans[0]?.status).toBe("deleted");
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
    expect(aircraft.callsign).toBe("1234");

    const update = updateAircraftSquawk(world, aircraft.id, "7052");
    expect(update?.correlation).toMatchObject({ ok: true, aircraftId: aircraft.id });
    expect(world.flightPlans[0]).toMatchObject({ status: "pending" });
    expect(aircraft.squawk).toBe("7052");
    expect(aircraft.callsign).toBe("1234");
    syncTrackDisplays(view.tracks, world);
    expect(getFlightPlanEntries(world, view)).toHaveLength(0);
    expect(datablockSourceFromWorld(world, aircraft)).toMatchObject({
      callsign: "UAL123",
      assignedSquawk: "7052",
      reportedSquawk: "7052",
    });
    updateAircraftSquawk(world, aircraft.id, "7053");
    syncTrackDisplays(view.tracks, world);
    expect(view.tracks.get(aircraft.id)).toMatchObject({
      unassociated: true,
      datablockMode: "partial",
    });
  });

  it("presents one spawned IFR plan, amends metadata, then removes it on beacon mismatch", () => {
    const scenario = loadKdem();
    const world = createWorldForSession(
      scenario,
      null,
      1,
      parseDepartureOptions("?departures=random&dep_count=1&seed=7"),
    );
    const pending = world.scheduledDepartures?.[0];
    expect(pending).toBeDefined();
    expect(world.flightPlans.some((plan) => plan.acid === pending?.callsign)).toBe(true);
    expect(world.aircraft.some((aircraft) => aircraft.callsign === pending?.callsign)).toBe(false);

    // The normal simulation spawn consumes the pending departure, after its
    // catalog-validated filed plan already exists.
    stepWorld(world, Math.ceil((pending!.scheduledSimMs + 1) / 1000));
    const aircraft = world.aircraft.find((item) => item.callsign === pending!.callsign);
    expect(aircraft).toBeDefined();
    const plan = world.flightPlans.find((item) => item.acid === pending!.callsign);
    expect(plan).toBeDefined();
    expect(aircraft!.reportedSquawk).toBe(plan!.assignedBeacon);

    const view = createScopeView();
    syncTrackDisplays(view.tracks, world);
    expect(getFlightPlanEntries(world, view)).not.toContainEqual(
      expect.objectContaining({ planId: plan!.id }),
    );
    expect(datablockSourceFromWorld(world, aircraft!)).toMatchObject({
      callsign: plan!.acid,
      assignedSquawk: plan!.assignedBeacon,
    });
    expect(terminalStripsFromWorld(world).departures).toContainEqual(
      expect.objectContaining({ acid: plan!.acid, beaconCode: plan!.assignedBeacon }),
    );

    const beforeIntent = structuredClone(aircraft!.intent);
    const beforePose = [
      aircraft!.xNm,
      aircraft!.yNm,
      aircraft!.headingDeg,
      aircraft!.altitudeFt,
      aircraft!.speedKt,
    ];
    const beforeEvents = world.sessionLog?.all();
    const amended = saveFlightPlanDraft(world, {
      id: plan!.id,
      acid: plan!.acid,
      assignedBeacon: plan!.assignedBeacon,
      filedRoute: plan!.filedRoute?.text ?? plan!.route ?? "",
      remarks: "TRAINER AMEND",
    });
    expect(amended).toMatchObject({ ok: true, plan: { remarks: "TRAINER AMEND" } });
    expect(aircraft!.intent).toEqual(beforeIntent);
    expect([
      aircraft!.xNm,
      aircraft!.yNm,
      aircraft!.headingDeg,
      aircraft!.altitudeFt,
      aircraft!.speedKt,
    ]).toEqual(beforePose);
    expect(world.sessionLog?.all()).toEqual(beforeEvents);

    updateAircraftSquawk(world, aircraft!.id, "7023");
    syncTrackDisplays(view.tracks, world);
    expect(datablockSourceFromWorld(world, aircraft!)).toMatchObject({
      callsign: aircraft!.callsign,
      reportedSquawk: "7023",
    });
    expect(getFlightPlanEntries(world, view)).toContainEqual(
      expect.objectContaining({ planId: plan!.id, callsign: plan!.acid }),
    );
    expect(terminalStripsFromWorld(world).departures).toContainEqual(
      expect.objectContaining({ acid: aircraft!.callsign, reportedSquawk: "7023" }),
    );
    expect(aircraft!.intent).toEqual(beforeIntent);
    expect([
      aircraft!.xNm,
      aircraft!.yNm,
      aircraft!.headingDeg,
      aircraft!.altitudeFt,
      aircraft!.speedKt,
    ]).toEqual(beforePose);
    expect(world.sessionLog?.all()).toEqual(beforeEvents);
  });

  it("runs a synthetic pending-departure plan through the modal submit path", () => {
    const sessionLog = new SessionLog();
    const world = createWorld({ catalog: syntheticCatalog, sessionLog });
    const departure = {
      callsign: "SYN123",
      runwayId: "09",
      sidId: "SYN1",
      assignedAltitudeFt: 5000,
      aircraftType: "B738",
      scheduledSimMs: 1000,
      spawned: false,
      assignedSquawk: "4312",
      squawk: "4312",
    };
    const plan = createScenarioIfrFlightPlan(world, {
      acid: departure.callsign,
      scenario: { icao: syntheticCatalog.airportId },
      route: { kind: "departure", sidId: departure.sidId },
      requestedAltitudeFt: departure.assignedAltitudeFt,
      aircraftType: departure.aircraftType,
      assignedBeacon: departure.assignedSquawk,
      departure: true,
    });
    world.scheduledDepartures = [departure];

    expect(world.aircraft).toHaveLength(0);
    expect(flightPlanForAircraft(world, "not-spawned")).toBeUndefined();

    world.simTimeMs = departure.scheduledSimMs;
    const spawned = spawnDueDepartures(world);
    const aircraft = spawned[0];
    expect(aircraft).toBeDefined();
    expect(flightPlanForAircraft(world, aircraft!.id)?.id).toBe(plan.id);

    const beforeIntent = structuredClone(aircraft!.intent);
    const beforePose = [
      aircraft!.xNm,
      aircraft!.yNm,
      aircraft!.headingDeg,
      aircraft!.altitudeFt,
      aircraft!.speedKt,
    ];
    // command.accepted is the persisted Command IR boundary; this UI submit
    // must not create or rewrite a radio command.
    const beforeCommandIr = structuredClone(sessionLog.byType("command.accepted"));
    const beforeSessionEvents = structuredClone(sessionLog.all());
    const draft = flightPlanModalDraftFromPlan(plan.acid, plan);
    draft.remarks = "SYNTHETIC MODAL AMEND";
    const amended = submitFlightPlanModalDraft(world, plan, draft);

    expect(amended).toMatchObject({ ok: true, plan: { remarks: "SYNTHETIC MODAL AMEND" } });
    expect(world.flightPlans.find((item) => item.id === plan.id)?.remarks).toBe(
      "SYNTHETIC MODAL AMEND",
    );
    expect(aircraft!.intent).toEqual(beforeIntent);
    expect([
      aircraft!.xNm,
      aircraft!.yNm,
      aircraft!.headingDeg,
      aircraft!.altitudeFt,
      aircraft!.speedKt,
    ]).toEqual(beforePose);
    expect(sessionLog.byType("command.accepted")).toEqual(beforeCommandIr);
    expect(sessionLog.all()).toEqual(beforeSessionEvents);

    updateAircraftSquawk(world, aircraft!.id, "4313");
    expect(flightPlanForAircraft(world, aircraft!.id)).toBeUndefined();
    expect(aircraft!.intent).toEqual(beforeIntent);
    expect([
      aircraft!.xNm,
      aircraft!.yNm,
      aircraft!.headingDeg,
      aircraft!.altitudeFt,
      aircraft!.speedKt,
    ]).toEqual(beforePose);
    expect(sessionLog.byType("command.accepted")).toEqual(beforeCommandIr);
    expect(sessionLog.all()).toEqual(beforeSessionEvents);
  });
});
