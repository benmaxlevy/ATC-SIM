/**
 * End-to-end integration tests: Departures, SIDs, Radio Check-ins, Radar Vectors,
 * Smart Shift+H Handoffs (Tower vs Center), and Boundary Despawn.
 *
 * Analog: FAA JO 7110.65 departure separation & climb-via-SID (R01);
 * CRC STARS INIT CNTL / handoffs (R07); vice typed tokens (R08).
 * Trainer delta: Fixed 20 Hz physics (SIM_DT_S); contextual Shift+H auto-detects
 * Tower vs Center; video map slot 7 overlays DEM1 corridors; DOM-free test suite.
 */

import { describe, expect, test } from "vitest";
import {
  SIM_DT_S,
  SessionLog,
  acceptInboundHandoff,
  createAircraft,
  createWorld,
  handoffFor,
  stepWorld,
} from "@core";
import { handleRadioText, CheckInQueue, type CheckInRadio } from "@pilot";
import {
  createWorldForSession,
  createWorldFromScenario,
  loadKdem,
  parseDepartureOptions,
  spawnDeparture,
} from "@scenario";
import {
  applyHandoffToSelection,
  formatFullDatablock,
  ownershipStubChar,
  syncTrackDisplays,
  trackPaintColor,
  PALETTE,
} from "@scope";
import { selectTrackFromStrip, stripsFromWorld } from "../../src/ui/FlightStrips";

function silentRadio(plays: string[] = []): CheckInRadio {
  return {
    isBusy: () => false,
    play(text) {
      plays.push(text);
    },
  };
}

describe("Departures and SIDs integration test suite (T04-23)", () => {
  const scenario = loadKdem();
  const catalog = scenario.catalog;

  test("AC1 — Mixed traffic lifecycle: departures spawn off RW27, check in, fly SID legs, and cleanly despawn at boundary", async () => {
    const world = createWorldFromScenario(scenario, 1);
    const log = world.sessionLog!;

    // Find a spawned STAR arrival (e.g. DAL123 on DEM1) and accept its inbound handoff
    const arrival = world.aircraft.find((a) => a.callsign === "DAL123");
    expect(arrival).toBeDefined();
    expect(acceptInboundHandoff(world, arrival!.id)).toBe(true);

    // Spawn a RW27 departure (AAL100 on BAY1 via NORMA)
    const departure = spawnDeparture(
      world,
      {
        callsign: "AAL100",
        runwayId: "27",
        sidId: "BAY1",
        transitionId: "NORMA",
        assignedAltitudeFt: 10000,
        aircraftType: "A321",
      },
      catalog,
    );

    // Verify initial departure pose and state
    expect(world.aircraft).toContain(departure);
    expect(departure.xNm).toBeCloseTo(-0.8, 2);
    expect(departure.yNm).toBeCloseTo(0, 2);
    expect(departure.headingDeg).toBe(270);
    expect(departure.altitudeFt).toBe(700);
    expect(departure.speedKt).toBe(180);
    expect(departure.intent.lateral).toEqual({
      type: "PROCEDURE",
      sidId: "BAY1",
      starId: "BAY1",
      toFixIndex: 0,
      routeFixIds: ["BAYEE", "BAYNW", "NORMA"],
    });
    expect(departure.intent.vertical).toEqual({
      type: "VIA_SID",
      sidId: "BAY1",
    });
    expect(handoffFor(world, departure.id)).toEqual({
      kind: "departure",
      fromSectorId: "TWR",
    });

    // Verify radio check-in queue for both arrival and departure
    const checkinQueue = new CheckInQueue({ seed: 1 });
    checkinQueue.scheduleFromWorld(world, 0);

    const depEntry = checkinQueue.scheduled().find((s) => s.callsign === "AAL100");
    const arrEntry = checkinQueue.scheduled().find((s) => s.callsign === "DAL123");
    expect(depEntry?.kind).toBe("departure");
    expect(arrEntry?.kind).toBe("arrival");

    // Advance world to trigger radio check-ins
    const radioPlays: string[] = [];
    while (world.simTimeMs < 12000) {
      stepWorld(world, SIM_DT_S);
      checkinQueue.drain({
        world,
        log,
        radio: silentRadio(radioPlays),
        setStatus: () => {},
        nowWallMs: () => 1,
      });
    }

    const checkinEvents = log.byType("radio.checkin");
    expect(checkinEvents.length).toBeGreaterThanOrEqual(2);

    const depCheckin = checkinEvents.find((e) => e.callsign === "AAL100");
    expect(depCheckin).toBeDefined();
    expect(depCheckin?.sidId).toBe("BAY1");
    expect(depCheckin?.text).toContain("Departure, American 100, passing");
    expect(depCheckin?.text).toContain("climbing via the BAY ONE departure");

    const arrCheckin = checkinEvents.find((e) => e.callsign === "DAL123");
    expect(arrCheckin).toBeDefined();
    expect(arrCheckin?.starId).toBe("DEM1");
    expect(arrCheckin?.text).toContain(
      "Approach, Delta 123, descending via DEMO ONE arrival through",
    );

    // Step world through SID navigation and verify climb-via progress
    while (departure.altitudeFt < 5500 && world.simTimeMs < 300000) {
      stepWorld(world, SIM_DT_S);
    }
    expect(departure.altitudeFt).toBeGreaterThanOrEqual(5500);
    expect(departure.intent.lateral?.type).toBe("PROCEDURE");

    // Select departure and perform Smart Shift+H Center handoff
    const tracks = new Map();
    syncTrackDisplays(tracks, world);
    world.selectedAircraftId = departure.id;

    const handoffResult = applyHandoffToSelection(tracks, world);
    expect(handoffResult).toEqual({ applied: true, target: "center", hint: null });
    expect(handoffFor(world, departure.id)).toEqual({ kind: "outbound", toSectorId: "C" });
    expect(tracks.get(departure.id)?.ownership).toBe("center");
    expect(ownershipStubChar("center")).toBe("C");

    const centerHandoffEvents = log.byType("handoff.center");
    expect(centerHandoffEvents).toHaveLength(1);
    expect(centerHandoffEvents[0]?.callsign).toBe("AAL100");
    expect(centerHandoffEvents[0]?.toSectorId).toBe("C");

    // Fly departure past 28 NM boundary and verify clean despawn
    while (world.aircraft.some((a) => a.callsign === "AAL100") && world.simTimeMs < 2000000) {
      stepWorld(world, 1);
    }

    expect(world.aircraft.some((a) => a.callsign === "AAL100")).toBe(false);
    expect(world.selectedAircraftId).not.toBe(departure.id);

    const completedEvents = log.byType("handoff.outbound.completed");
    expect(completedEvents.some((e) => e.callsign === "AAL100")).toBe(true);

    const departedEvents = log.byType("nav.departed");
    expect(departedEvents.some((e) => e.callsign === "AAL100")).toBe(true);
  });

  test("AC2 — BAY1 SID climb profile produces zero false MSAW alerts and no false CA against separated traffic", () => {
    const log = new SessionLog();
    const world = createWorld({
      catalog,
      sessionLog: log,
      mvaChart: scenario.mva,
    });

    // Spawn departure on RW27
    const dep = spawnDeparture(
      world,
      {
        callsign: "SWA200",
        runwayId: "27",
        sidId: "BAY1",
        transitionId: "OCTTA",
        assignedAltitudeFt: 10000,
        aircraftType: "B737",
      },
      catalog,
    );

    // Spawn arrival on standard downwind away from RW27 climb corridor
    const arr = createAircraft({
      id: "ac-arr",
      callsign: "DAL500",
      aircraftType: "A320",
      xNm: 15,
      yNm: 10,
      headingDeg: 270,
      altitudeFt: 8000,
      speedKt: 220,
    });
    world.aircraft.push(arr);

    // Step world across entire SID climb up to boundary
    let maxSteps = Math.round(500 / SIM_DT_S);
    while (world.aircraft.includes(dep) && maxSteps > 0) {
      stepWorld(world, SIM_DT_S);
      maxSteps -= 1;

      // At each step, verify no MSAW alert for the departure
      const depMsaw = world.alerts.msaw.filter((a) => a.callsign === "SWA200");
      expect(depMsaw).toHaveLength(0);

      // Verify no conflict alert between departure and arrival
      const activeCa = world.alerts.ca.filter(
        (a) =>
          (a.callsignA === "SWA200" && a.callsignB === "DAL500") ||
          (a.callsignA === "DAL500" && a.callsignB === "SWA200"),
      );
      expect(activeCa).toHaveLength(0);
    }

    expect(log.byType("alert.msaw.alert").filter((e) => e.callsign === "SWA200")).toHaveLength(0);
    expect(log.byType("alert.msaw.caution").filter((e) => e.callsign === "SWA200")).toHaveLength(0);
    expect(log.byType("alert.ca.alert")).toHaveLength(0);
  });

  test("AC3 — Smart Shift+H handoff: Tower for arrival on final vs Center for climbing departure", () => {
    const log = new SessionLog();
    const world = createWorld({
      catalog,
      sessionLog: log,
    });

    // 1. Arrival established on ILS 27 inside 5 NM gate
    const arr = createAircraft({
      id: "ac-arr",
      callsign: "DAL123",
      xNm: 3.5,
      yNm: 0,
      headingDeg: 270,
      altitudeFt: 1100,
      speedKt: 150,
    });
    arr.intent.lateral = { type: "LOC", approachId: "ILS27" };
    arr.intent.vertical = { type: "GS", approachId: "ILS27" };
    arr.intent.clearedApproachId = "ILS27";

    // 2. Departure climbing outbound on BAY1 SID (altitude >= 5000 ft)
    const dep = createAircraft({
      id: "ac-dep",
      callsign: "UAL777",
      xNm: 10,
      yNm: 4,
      headingDeg: 80,
      altitudeFt: 6500,
      speedKt: 250,
    });
    dep.intent.lateral = {
      type: "PROCEDURE",
      sidId: "BAY1",
      starId: "BAY1",
      toFixIndex: 1,
      routeFixIds: ["BAYEE", "BAYNW", "NORMA"],
    };
    dep.intent.vertical = { type: "VIA_SID", sidId: "BAY1" };
    dep.intent.assignedAltitudeFt = 10000;

    world.aircraft.push(arr, dep);

    const tracks = new Map();
    syncTrackDisplays(tracks, world);

    // Test Arrival Shift+H -> Tower
    world.selectedAircraftId = arr.id;
    const arrHandoff = applyHandoffToSelection(tracks, world);
    expect(arrHandoff).toEqual({ applied: true, target: "tower", hint: null });
    expect(arr.intent.lateral).toEqual({ type: "LANDING", approachId: "ILS27" });
    expect(tracks.get(arr.id)?.ownership).toBe("tower");
    expect(ownershipStubChar("tower")).toBe("T");
    expect(trackPaintColor("tower")).toBe(PALETTE.tower);
    expect(log.byType("handoff.tower")).toHaveLength(1);
    expect(log.byType("handoff.tower")[0]?.callsign).toBe("DAL123");

    // Test Departure Shift+H -> Center
    world.selectedAircraftId = dep.id;
    const depHandoff = applyHandoffToSelection(tracks, world);
    expect(depHandoff).toEqual({ applied: true, target: "center", hint: null });
    expect(handoffFor(world, dep.id)).toEqual({ kind: "outbound", toSectorId: "C" });
    expect(tracks.get(dep.id)?.ownership).toBe("center");
    expect(ownershipStubChar("center")).toBe("C");
    expect(trackPaintColor("center")).toBe(PALETTE.center);
    expect(log.byType("handoff.center")).toHaveLength(1);
    expect(log.byType("handoff.center")[0]?.callsign).toBe("UAL777");
    expect(log.byType("handoff.outbound.initiated")).toHaveLength(1);
  });

  test("AC4 — Radar vector (H090 / H360) immediately transitions lateral mode to HEADING and cancels VIA_SID to ASSIGNED while maintaining climb", async () => {
    const log = new SessionLog();
    const world = createWorld({
      catalog,
      sessionLog: log,
    });

    const dep = spawnDeparture(
      world,
      {
        callsign: "AAL300",
        runwayId: "27",
        sidId: "BAY1",
        transitionId: "NORMA",
        assignedAltitudeFt: 10000,
        aircraftType: "A321",
      },
      catalog,
    );

    // Initially on PROCEDURE and VIA_SID
    expect(dep.intent.lateral?.type).toBe("PROCEDURE");
    expect(dep.intent.vertical?.type).toBe("VIA_SID");
    expect(dep.intent.assignedAltitudeFt).toBe(10000);

    // Issue heading command H090
    const vectorResult = await handleRadioText(world, "AAL300 H090", log);
    expect(vectorResult.accepted).toBe(true);
    expect(vectorResult.readback).toContain("American 300");
    expect(vectorResult.readback).toContain("heading 090");

    // Lateral mode transitions to HEADING and vertical mode cancels to ASSIGNED
    expect(dep.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
    expect(dep.intent.vertical).toEqual({ type: "ASSIGNED" });
    expect(dep.intent.assignedHeadingDeg).toBe(90);
    expect(dep.intent.assignedAltitudeFt).toBe(10000);

    // Issue altitude climb amendment C120
    const climbResult = await handleRadioText(world, "AAL300 C120", log);
    expect(climbResult.accepted).toBe(true);
    expect(climbResult.readback).toContain("climb and maintain one-two thousand");
    expect(dep.intent.assignedAltitudeFt).toBe(12000);

    // Advance world: aircraft turns towards 090 and climbs towards 12000 ft
    const initialAlt = dep.altitudeFt;
    for (let i = 0; i < 40; i += 1) {
      stepWorld(world, SIM_DT_S);
    }

    expect(dep.headingDeg).not.toBe(270);
    expect(dep.altitudeFt).toBeGreaterThan(initialAlt);
    expect(dep.intent.assignedAltitudeFt).toBe(12000);
  });

  test("AC5 — Dynamic departure generator session spawns multiple departures with active SIDs alongside arrivals", () => {
    const options = parseDepartureOptions("?departures=auto&dep_rate=15&seed=99");
    const world = createWorldForSession(scenario, null, 99, options);

    expect(world.scheduledDepartures).toBeDefined();
    expect(world.scheduledDepartures!.length).toBeGreaterThanOrEqual(2);

    // Simulate 300 seconds of session time
    for (let t = 0; t < 300; t += 1) {
      stepWorld(world, 1);
    }

    const spawnedCount = world.scheduledDepartures!.filter((d) => d.spawned).length;
    expect(spawnedCount).toBeGreaterThanOrEqual(1);

    const spawnedLogs = world.sessionLog?.byType("departure.spawned") ?? [];
    expect(spawnedLogs.length).toBe(spawnedCount);

    // All active aircraft have valid finite coordinates and altitudes
    for (const ac of world.aircraft) {
      expect(Number.isFinite(ac.xNm)).toBe(true);
      expect(Number.isFinite(ac.yNm)).toBe(true);
      expect(Number.isFinite(ac.altitudeFt)).toBe(true);
      expect(Number.isFinite(ac.speedKt)).toBe(true);
      expect(ac.altitudeFt).toBeGreaterThan(0);
    }
  });

  test("Datablocks and Flight Strips render departure fields and synchronize selection", () => {
    const world = createWorld({ catalog });
    const dep = spawnDeparture(
      world,
      {
        callsign: "JBU500",
        runwayId: "27",
        sidId: "BAY1",
        transitionId: "NORMA",
        assignedAltitudeFt: 10000,
        aircraftType: "A320",
      },
      catalog,
    );

    // Datablock format (STARS CRC: Line 2 Phase A Mode C + GS; Line 3 assigned altitude A100)
    const fdb = formatFullDatablock(dep);
    expect(fdb.line1).toBe("JBU500");
    // Line 2: Mode C altitude 700 ft -> 007, speed 180 kt -> 180
    expect(fdb.line2).toBe("007  180");
    // Line 3: assigned altitude A100 (10000 ft)
    expect(fdb.line3).toBe("A100");

    // Flight Strips
    const strips = stripsFromWorld(world);
    expect(strips).toHaveLength(1);
    const strip = strips[0]!;
    expect(strip.callsign).toBe("JBU500");
    expect(strip.headingField).toBe("H270");
    expect(strip.altitudeField).toBe("A100");
    expect(strip.speedField).toBe("S180");
    expect(strip.selected).toBe(false);

    // Strip selection updates world
    selectTrackFromStrip(world, dep.id);
    expect(world.selectedAircraftId).toBe(dep.id);
    expect(stripsFromWorld(world)[0]?.selected).toBe(true);
  });
});
