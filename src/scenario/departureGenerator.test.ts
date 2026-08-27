import { describe, expect, test } from "vitest";
import { stepWorld } from "@core";
import { loadKdem } from "./load";
import {
  generateDepartureSchedule,
  listDepartureSlots,
  MIN_DEPARTURE_INTERVAL_S,
} from "./departureGenerator";
import { createWorldForSession } from "./spawn";
import { parseDepartureOptions } from "./trafficQuery";

describe("departureGenerator", () => {
  const scenario = loadKdem();

  test("listDepartureSlots resolves all available SID and enroute transition pairs", () => {
    const slots = listDepartureSlots(scenario.catalog, "27");
    expect(slots.length).toBeGreaterThanOrEqual(2);
    expect(slots).toEqual(
      expect.arrayContaining([
        { sidId: "BAY1", transitionId: "NORMA" },
        { sidId: "BAY1", transitionId: "OCTTA" },
      ]),
    );
  });

  test("AC2 — Given seed 1 and rate 10, generator produces identical schedules; seed 2 produces different mix", () => {
    const schedule1A = generateDepartureSchedule({
      catalog: scenario.catalog,
      seed: 1,
      ratePerHour: 10,
      count: 6,
      runwayId: "27",
    });

    const schedule1B = generateDepartureSchedule({
      catalog: scenario.catalog,
      seed: 1,
      ratePerHour: 10,
      count: 6,
      runwayId: "27",
    });

    const schedule2 = generateDepartureSchedule({
      catalog: scenario.catalog,
      seed: 2,
      ratePerHour: 10,
      count: 6,
      runwayId: "27",
    });

    expect(schedule1A).toEqual(schedule1B);
    expect(schedule1A).not.toEqual(schedule2);

    // Verify callsigns, timestamps, SIDs match across runs for same seed
    for (let i = 0; i < schedule1A.length; i += 1) {
      expect(schedule1A[i]!.callsign).toBe(schedule1B[i]!.callsign);
      expect(schedule1A[i]!.scheduledSimMs).toBe(schedule1B[i]!.scheduledSimMs);
      expect(schedule1A[i]!.transitionId).toBe(schedule1B[i]!.transitionId);
    }
  });

  test("AC3 — Generated departures never duplicate callsigns of active arrivals or other departures", () => {
    const arrivalCallsigns = scenario.arrivals.map((a) => a.callsign);
    const schedule = generateDepartureSchedule({
      catalog: scenario.catalog,
      seed: 1,
      ratePerHour: 12,
      count: 30,
      runwayId: "27",
      activeCallsigns: arrivalCallsigns,
    });

    const seen = new Set<string>(arrivalCallsigns.map((cs) => cs.toUpperCase()));
    for (const dep of schedule) {
      expect(seen.has(dep.callsign.toUpperCase())).toBe(false);
      seen.add(dep.callsign.toUpperCase());
    }
  });

  test("AC4 — Successive departures on the same runway have at least 60s simulated time between them", () => {
    const schedule = generateDepartureSchedule({
      catalog: scenario.catalog,
      seed: 42,
      ratePerHour: 20,
      count: 15,
      runwayId: "27",
    });

    expect(schedule.length).toBe(15);
    for (let i = 1; i < schedule.length; i += 1) {
      const prev = schedule[i - 1]!;
      const curr = schedule[i]!;
      const deltaMs = curr.scheduledSimMs - prev.scheduledSimMs;
      expect(deltaMs).toBeGreaterThanOrEqual(60_000);
      expect(deltaMs).toBeGreaterThanOrEqual(MIN_DEPARTURE_INTERVAL_S * 1000);
    }
  });

  test("AC5 — Dynamic departure spawning during live session with active SID navigation", () => {
    const options = parseDepartureOptions("?departures=auto&dep_rate=12&seed=1");
    const world = createWorldForSession(scenario, null, 1, options);

    expect(world.scheduledDepartures).toBeDefined();
    expect(world.scheduledDepartures!.length).toBeGreaterThan(0);

    const initialCount = world.aircraft.length;
    const firstDeparture = world.scheduledDepartures![0]!;
    const firstSpawnSimMs = firstDeparture.scheduledSimMs;

    // Step world up to right before first departure
    const step1S = Math.floor((firstSpawnSimMs - 1000) / 1000);
    stepWorld(world, step1S);

    expect(world.aircraft.length).toBe(initialCount);
    expect(firstDeparture.spawned).toBe(false);

    // Step world past first spawn time
    stepWorld(world, 2);

    expect(world.aircraft.length).toBe(initialCount + 1);
    expect(firstDeparture.spawned).toBe(true);

    const spawnedAc = world.aircraft.find((ac) => ac.callsign === firstDeparture.callsign);
    expect(spawnedAc).toBeDefined();
    expect(spawnedAc!.intent.lateral?.type).toBe("PROCEDURE");
    if (spawnedAc!.intent.lateral?.type === "PROCEDURE") {
      expect(spawnedAc!.intent.lateral.sidId).toBe(firstDeparture.sidId);
    }
    expect(spawnedAc!.intent.vertical?.type).toBe("VIA_SID");
    if (spawnedAc!.intent.vertical?.type === "VIA_SID") {
      expect(spawnedAc!.intent.vertical.sidId).toBe(firstDeparture.sidId);
    }
    expect(spawnedAc!.intent.assignedAltitudeFt).toBe(firstDeparture.assignedAltitudeFt);

    // Verify session log recorded departure.scheduled and departure.spawned
    const scheduledEvents = world.sessionLog?.byType("departure.scheduled") ?? [];
    expect(scheduledEvents.length).toBe(world.scheduledDepartures!.length);

    const spawnedEvents = world.sessionLog?.byType("departure.spawned") ?? [];
    expect(spawnedEvents.length).toBe(1);
    expect(spawnedEvents[0]!.callsign).toBe(firstDeparture.callsign);
    expect(spawnedEvents[0]!.sidId).toBe(firstDeparture.sidId);
  });

  test("Empty count returns empty schedule", () => {
    const schedule = generateDepartureSchedule({
      catalog: scenario.catalog,
      seed: 1,
      count: 0,
    });
    expect(schedule).toEqual([]);
  });

  test("Full 600s session simulation with multiple departures spawning and flying SIDs", () => {
    const options = parseDepartureOptions("?departures=auto&dep_rate=15&seed=7");
    const world = createWorldForSession(scenario, null, 7, options);

    // Step world for 600 seconds in 1s increments
    for (let t = 0; t < 600; t += 1) {
      stepWorld(world, 1);
    }

    const spawnedCount = world.scheduledDepartures!.filter((d) => d.spawned).length;
    expect(spawnedCount).toBeGreaterThanOrEqual(2);

    const spawnedEvents = world.sessionLog?.byType("departure.spawned") ?? [];
    expect(spawnedEvents.length).toBe(spawnedCount);

    // All active spawned departures should still have valid positions and altitudes
    for (const dep of world.scheduledDepartures!) {
      if (dep.spawned) {
        const ac = world.aircraft.find((a) => a.callsign === dep.callsign);
        if (ac) {
          expect(Number.isFinite(ac.xNm)).toBe(true);
          expect(Number.isFinite(ac.yNm)).toBe(true);
          expect(ac.altitudeFt).toBeGreaterThan(700);
        }
      }
    }
  });

  test("T04-29 AC5 — Successive departures on RW09 maintain >= 60s simulated spacing", () => {
    const schedule = generateDepartureSchedule({
      catalog: scenario.catalog,
      seed: 42,
      ratePerHour: 20,
      count: 15,
      runwayId: "09",
    });

    expect(schedule.length).toBe(15);
    expect(schedule.every((dep) => dep.runwayId === "09")).toBe(true);
    for (let i = 1; i < schedule.length; i += 1) {
      const prev = schedule[i - 1]!;
      const curr = schedule[i]!;
      const deltaMs = curr.scheduledSimMs - prev.scheduledSimMs;
      expect(deltaMs).toBeGreaterThanOrEqual(60_000);
      expect(deltaMs).toBeGreaterThanOrEqual(MIN_DEPARTURE_INTERVAL_S * 1000);
    }
  });

  test("T04-29 — listDepartureSlots resolves slots for RW09", () => {
    const slots = listDepartureSlots(scenario.catalog, "09");
    expect(slots.length).toBeGreaterThanOrEqual(2);
    expect(slots).toEqual(
      expect.arrayContaining([
        { sidId: "BAY1", transitionId: "NORMA" },
        { sidId: "BAY1", transitionId: "OCTTA" },
      ]),
    );
  });
});
