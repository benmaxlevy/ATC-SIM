import { describe, expect, test } from "vitest";
import { createWorld, SessionLog } from "@core";
import { loadCatalog } from "./procedures/loadCatalog";
import {
  DEPARTURE_SPAWN_ALTITUDE_FT,
  DEPARTURE_SPAWN_SPEED_KT,
  departureSpawnPose,
  spawnDeparture,
} from "./departureSpawn";

const catalog = loadCatalog("kdem");

describe("departureSpawnPose (AC1)", () => {
  test("AC1 — departureSpawnPose(catalog, '27', 'BAY1', 'NORMA', 10000) produces valid pose on RW27 centerline", () => {
    const pose = departureSpawnPose(catalog, "27", "BAY1", "NORMA", 10000);

    // RW27 threshold is at (0, 0), heading 270 deg
    // 0.8 NM along 270 deg (sin 270 = -1, cos 270 = 0) -> x = -0.8, y = 0
    expect(pose.xNm).toBeCloseTo(-0.8, 4);
    expect(pose.yNm).toBeCloseTo(0, 4);
    expect(pose.headingDeg).toBe(270);
    expect(pose.altitudeFt).toBe(DEPARTURE_SPAWN_ALTITUDE_FT); // 700 ft
    expect(pose.speedKt).toBe(DEPARTURE_SPAWN_SPEED_KT); // 180 kt
    expect(pose.assignedAltitudeFt).toBe(10000);
    expect(pose.toFixIndex).toBe(0);
    expect(pose.sidId).toBe("BAY1");
    expect(pose.runwayId).toBe("27");
    expect(pose.transitionId).toBe("NORMA");

    // Route for BAY1 via RW27 to NORMA: RW27 leg (BAYEE) -> enroute (BAYNW, NORMA)
    expect(pose.routeFixIds).toEqual(["BAYEE", "BAYNW", "NORMA"]);

    // Armed Intent
    expect(pose.intent.lateral).toEqual({
      type: "PROCEDURE",
      sidId: "BAY1",
      starId: "BAY1",
      toFixIndex: 0,
      routeFixIds: ["BAYEE", "BAYNW", "NORMA"],
    });
    expect(pose.intent.vertical).toEqual({
      type: "VIA_SID",
      sidId: "BAY1",
    });
    expect(pose.intent.assignedAltitudeFt).toBe(10000);
    expect(pose.intent.assignedSpeedKt).toBe(180);
    expect(pose.intent.assignedHeadingDeg).toBe(270);
  });

  test("departureSpawnPose uses SID initialClimbFt when assignedAltFt is omitted", () => {
    const pose = departureSpawnPose(catalog, "27", "BAY1", "OCTTA");
    // BAY1 initialClimbFt is 5000 in KDEM sids.json
    expect(pose.assignedAltitudeFt).toBe(5000);
    expect(pose.intent.assignedAltitudeFt).toBe(5000);
    expect(pose.routeFixIds).toEqual(["BAYEE", "BAYSO", "OCTTA"]);
  });

  test("spawnDeparture creates aircraft in world and offers departure handoff from TWR", () => {
    const log = new SessionLog();
    const world = createWorld({ catalog, sessionLog: log });
    const ac = spawnDeparture(
      world,
      {
        callsign: "AAL100",
        runwayId: "27",
        sidId: "BAY1",
        transitionId: "NORMA",
        assignedAltitudeFt: 12000,
        aircraftType: "A321",
      },
      catalog,
    );

    expect(world.aircraft).toContain(ac);
    expect(ac.callsign).toBe("AAL100");
    expect(ac.aircraftType).toBe("A321");
    expect(ac.xNm).toBeCloseTo(-0.8, 4);
    expect(ac.yNm).toBeCloseTo(0, 4);
    expect(ac.headingDeg).toBe(270);
    expect(ac.altitudeFt).toBe(700);

    const spawnedEvents = log.byType("handoff.departure.spawned");
    expect(spawnedEvents).toHaveLength(1);
    expect(spawnedEvents[0]?.callsign).toBe("AAL100");
    expect(spawnedEvents[0]?.fromSectorId).toBe("TWR");
    expect(spawnedEvents[0]?.runwayId).toBe("27");
    expect(spawnedEvents[0]?.sidId).toBe("BAY1");

    expect(world.handoffs.get(ac.id)).toEqual({
      kind: "departure",
      fromSectorId: "TWR",
    });
  });

  test("T04-29 AC3 — In East Flow, departures spawn at RW09 threshold (-1.645, 0) with heading 090 and armed BAY1 RW09 transition toward BAYES", () => {
    const pose = departureSpawnPose(catalog, "09", "BAY1", "NORMA", 10000);

    // RW09 threshold is at (-1.645, 0), heading 090 deg
    // 0.8 NM along 090 deg (sin 90 = 1, cos 90 = 0) -> x = -1.645 + 0.8 = -0.845, y = 0
    expect(pose.xNm).toBeCloseTo(-0.845, 4);
    expect(pose.yNm).toBeCloseTo(0, 4);
    expect(pose.headingDeg).toBe(90);
    expect(pose.altitudeFt).toBe(DEPARTURE_SPAWN_ALTITUDE_FT);
    expect(pose.speedKt).toBe(DEPARTURE_SPAWN_SPEED_KT);
    expect(pose.assignedAltitudeFt).toBe(10000);
    expect(pose.sidId).toBe("BAY1");
    expect(pose.runwayId).toBe("09");
    expect(pose.transitionId).toBe("NORMA");

    // Route for BAY1 via RW09 to NORMA: RW09 leg (BAYES) -> enroute RW09 transition (BAYNE, NORMA)
    expect(pose.routeFixIds).toEqual(["BAYES", "BAYNE", "NORMA"]);

    // Armed Intent
    expect(pose.intent.lateral).toEqual({
      type: "PROCEDURE",
      sidId: "BAY1",
      starId: "BAY1",
      toFixIndex: 0,
      routeFixIds: ["BAYES", "BAYNE", "NORMA"],
    });
    expect(pose.intent.vertical).toEqual({
      type: "VIA_SID",
      sidId: "BAY1",
    });
    expect(pose.intent.assignedHeadingDeg).toBe(90);
  });

  test("T04-29 AC4 — In West Flow, departures continue to spawn at RW27 threshold (0, 0) with heading 270 and armed BAY1 RW27 transition toward BAYEE", () => {
    const pose = departureSpawnPose(catalog, "27", "BAY1", "OCTTA", 8000);

    // RW27 threshold is at (0, 0), heading 270 deg -> x = -0.8, y = 0
    expect(pose.xNm).toBeCloseTo(-0.8, 4);
    expect(pose.yNm).toBeCloseTo(0, 4);
    expect(pose.headingDeg).toBe(270);
    expect(pose.routeFixIds).toEqual(["BAYEE", "BAYSO", "OCTTA"]);
    expect(
      pose.intent.lateral?.type === "PROCEDURE" ? pose.intent.lateral.routeFixIds : undefined,
    ).toEqual(["BAYEE", "BAYSO", "OCTTA"]);
    expect(pose.intent.assignedHeadingDeg).toBe(270);
  });

  test("T04-29 — spawnDeparture for RW09 creates aircraft in world and offers departure handoff from TWR", () => {
    const log = new SessionLog();
    const world = createWorld({ catalog, sessionLog: log });
    const ac = spawnDeparture(
      world,
      {
        callsign: "DAL900",
        runwayId: "09",
        sidId: "BAY1",
        transitionId: "OCTTA",
        assignedAltitudeFt: 14000,
        aircraftType: "B738",
      },
      catalog,
    );

    expect(world.aircraft).toContain(ac);
    expect(ac.callsign).toBe("DAL900");
    expect(ac.xNm).toBeCloseTo(-0.845, 4);
    expect(ac.yNm).toBeCloseTo(0, 4);
    expect(ac.headingDeg).toBe(90);

    const spawnedEvents = log.byType("handoff.departure.spawned");
    expect(spawnedEvents).toHaveLength(1);
    expect(spawnedEvents[0]?.callsign).toBe("DAL900");
    expect(spawnedEvents[0]?.fromSectorId).toBe("TWR");
    expect(spawnedEvents[0]?.runwayId).toBe("09");
    expect(spawnedEvents[0]?.sidId).toBe("BAY1");
  });
});
