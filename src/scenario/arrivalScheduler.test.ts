import { advanceWorld, createAccumulator, stepWorld } from "@core";
import { describe, expect, test } from "vitest";
import {
  createArrivalScheduler,
  createWorldForSession,
  loadKdem,
  loadKdemIls27,
  validateArrivalTrafficConfig,
} from "@scenario";

describe("T04-25 configurable arrival traffic", () => {
  test("normal count uses unique catalog STAR inbound traffic", () => {
    const world = createWorldForSession(loadKdem(), null, 1, null, {
      initialArrivalCount: 4,
      arrivalsPerHour: 0,
      seed: 1,
    });

    expect(world.aircraft).toHaveLength(4);
    expect(new Set(world.aircraft.map((aircraft) => aircraft.callsign)).size).toBe(4);
    expect(world.aircraft.every((aircraft) => aircraft.intent.lateral?.type === "PROCEDURE")).toBe(
      true,
    );
    expect(world.aircraft.every((aircraft) => aircraft.headingDeg !== 90)).toBe(true);
  });

  test("drains one arrival at 12 arrivals/hour, then does not repeat it", () => {
    const world = createWorldForSession(
      loadKdem(),
      null,
      1,
      { enabled: false },
      {
        initialArrivalCount: 4,
        arrivalsPerHour: 12,
        seed: 1,
      },
    );

    stepWorld(world, 299);
    expect(world.aircraft).toHaveLength(4);
    stepWorld(world, 1);
    expect(world.aircraft).toHaveLength(5);
    stepWorld(world, 0.01);
    expect(world.aircraft).toHaveLength(5);
  });

  test("large tick drains every due entry once", () => {
    const world = createWorldForSession(
      loadKdem(),
      null,
      1,
      { enabled: false },
      {
        initialArrivalCount: 4,
        arrivalsPerHour: 12,
        seed: 1,
      },
    );
    const scheduler = world.arrivalScheduler;
    expect(scheduler).toBeDefined();
    stepWorld(world, 900);
    expect(world.aircraft).toHaveLength(7);
    const callsigns = world.aircraft.map((aircraft) => aircraft.callsign);
    expect(new Set(callsigns).size).toBe(callsigns.length);
    scheduler?.drain(world);
    expect(world.aircraft).toHaveLength(7);
  });

  test("same inputs produce same schedule", () => {
    const a = createArrivalScheduler(loadKdem().catalog, { initialArrivalCount: 4, seed: 42 });
    const b = createArrivalScheduler(loadKdem().catalog, { initialArrivalCount: 4, seed: 42 });
    expect(a.schedule).toEqual(b.schedule);
  });

  test("paused and authored sessions do not schedule arrivals", () => {
    const paused = createWorldForSession(loadKdem(), null, 1, null, {
      initialArrivalCount: 4,
      arrivalsPerHour: 12,
    });
    paused.paused = true;
    advanceWorld(paused, 600, createAccumulator());
    expect(paused.aircraft).toHaveLength(4);

    const authored = createWorldForSession(loadKdemIls27(), null);
    expect(authored.arrivalScheduler).toBeUndefined();
    advanceWorld(authored, 600, createAccumulator());
    expect(authored.aircraft).toHaveLength(2);
  });

  test("validates documented bounds and allows zero rate", () => {
    expect(
      validateArrivalTrafficConfig({ initialArrivalCount: 4, arrivalsPerHour: 0, seed: 0 }),
    ).toEqual({
      initialArrivalCount: 4,
      arrivalsPerHour: 0,
      seed: 0,
    });
    expect(() => validateArrivalTrafficConfig({ initialArrivalCount: 31 })).toThrow();
    expect(() => validateArrivalTrafficConfig({ arrivalsPerHour: 61 })).toThrow();
  });

  test("T04-29 — East Flow arrival scheduler assigns only East Flow transitions (WN, WS)", () => {
    const scheduler = createArrivalScheduler(
      loadKdem().catalog,
      { initialArrivalCount: 4, arrivalsPerHour: 12, seed: 1, activeRunwayId: "09" },
    );
    expect(scheduler.schedule.length).toBeGreaterThanOrEqual(4);
    for (const item of scheduler.schedule) {
      expect(["WN", "WS"]).toContain(item.assignment.transitionId);
      expect(item.assignment.pose.routeFixIds).toContain("WMERG");
    }
  });

  test("T04-29 — West Flow arrival scheduler assigns only West Flow transitions (N, S)", () => {
    const scheduler = createArrivalScheduler(
      loadKdem().catalog,
      { initialArrivalCount: 4, arrivalsPerHour: 12, seed: 1, activeRunwayId: "27" },
    );
    expect(scheduler.schedule.length).toBeGreaterThanOrEqual(4);
    for (const item of scheduler.schedule) {
      expect(["N", "S"]).toContain(item.assignment.transitionId);
      expect(item.assignment.pose.routeFixIds).toContain("MERGE");
    }
  });
});
