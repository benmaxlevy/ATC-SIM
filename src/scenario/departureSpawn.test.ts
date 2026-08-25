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
  test("AC1 — departureSpawnPose(catalog, '27', 'DEM1', 'NORMA', 10000) produces valid pose on RW27 centerline", () => {
    const pose = departureSpawnPose(catalog, "27", "DEM1", "NORMA", 10000);

    // RW27 threshold is at (0, 0), heading 270 deg
    // 0.8 NM along 270 deg (sin 270 = -1, cos 270 = 0) -> x = -0.8, y = 0
    expect(pose.xNm).toBeCloseTo(-0.8, 4);
    expect(pose.yNm).toBeCloseTo(0, 4);
    expect(pose.headingDeg).toBe(270);
    expect(pose.altitudeFt).toBe(DEPARTURE_SPAWN_ALTITUDE_FT); // 700 ft
    expect(pose.speedKt).toBe(DEPARTURE_SPAWN_SPEED_KT); // 180 kt
    expect(pose.assignedAltitudeFt).toBe(10000);
    expect(pose.toFixIndex).toBe(0);
    expect(pose.sidId).toBe("DEM1");
    expect(pose.runwayId).toBe("27");
    expect(pose.transitionId).toBe("NORMA");

    // Route for DEM1 via RW27 to NORMA: RW27 leg (MISSD) -> common (SNARF) -> enroute (NORMA)
    expect(pose.routeFixIds).toEqual(["MISSD", "SNARF", "NORMA"]);

    // Armed Intent
    expect(pose.intent.lateral).toEqual({
      type: "PROCEDURE",
      sidId: "DEM1",
      starId: "DEM1",
      toFixIndex: 0,
      routeFixIds: ["MISSD", "SNARF", "NORMA"],
    });
    expect(pose.intent.vertical).toEqual({
      type: "VIA_SID",
      sidId: "DEM1",
    });
    expect(pose.intent.assignedAltitudeFt).toBe(10000);
    expect(pose.intent.assignedSpeedKt).toBe(180);
    expect(pose.intent.assignedHeadingDeg).toBe(270);
  });

  test("departureSpawnPose uses SID initialClimbFt when assignedAltFt is omitted", () => {
    const pose = departureSpawnPose(catalog, "27", "DEM1", "OCTTA");
    // DEM1 initialClimbFt is 5000 in KDEM sids.json
    expect(pose.assignedAltitudeFt).toBe(5000);
    expect(pose.intent.assignedAltitudeFt).toBe(5000);
    expect(pose.routeFixIds).toEqual(["MISSD", "SNARF", "OCTTA"]);
  });

  test("spawnDeparture creates aircraft in world and offers departure handoff from TWR", () => {
    const log = new SessionLog();
    const world = createWorld({ catalog, sessionLog: log });
    const ac = spawnDeparture(
      world,
      {
        callsign: "AAL100",
        runwayId: "27",
        sidId: "DEM1",
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
    expect(spawnedEvents[0]?.sidId).toBe("DEM1");

    expect(world.handoffs.get(ac.id)).toEqual({
      kind: "departure",
      fromSectorId: "TWR",
    });
  });
});
