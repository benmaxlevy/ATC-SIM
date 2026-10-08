import { expect, test } from "vitest";
import { SIM_DT_S, SessionLog, createAircraft, createWorld, stepWorld } from "@core";
import { beginMissedApproach, missedSpecFor } from "../missed";

function visualFinalAircraft(overrides?: Partial<Parameters<typeof createAircraft>[0]>) {
  const ac = createAircraft({
    id: "ac-vis",
    callsign: "SWA456",
    xNm: 5,
    yNm: 0.1,
    headingDeg: 260,
    altitudeFt: 1800,
    speedKt: 140,
    ...overrides,
  });
  ac.intent.clearedApproachId = "VISUAL 27";
  ac.intent.assignedAltitudeFt = 0;
  ac.intent.lateral = {
    type: "VISUAL_FINAL",
    runwayId: "27",
    threshold: { xNm: 0, yNm: 0 },
    headingDeg: 270,
    fieldElevFt: 0,
  };
  ac.intent.vertical = {
    type: "GLIDEPATH",
    approachId: "VISUAL 27",
  };
  return ac;
}

test("T04-82: straight-in lateral tracking guides aircraft toward runway heading and centerline", () => {
  const ac = visualFinalAircraft({ xNm: 5, yNm: 0.2, headingDeg: 250 });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [ac], sessionLog: log });

  for (let i = 0; i < 60; i++) {
    stepWorld(world, SIM_DT_S);
  }

  // Cross-track offset should decrease and heading should converge toward runway heading 270
  expect(Math.abs(ac.yNm)).toBeLessThan(0.2);
  expect(ac.headingDeg).toBeGreaterThan(250);
});

test("T04-82: 3-degree descent profile descends toward runway field elevation", () => {
  const ac = visualFinalAircraft({ xNm: 4, yNm: 0, headingDeg: 270, altitudeFt: 2500 });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [ac], sessionLog: log });

  const initialAlt = ac.altitudeFt;
  for (let i = 0; i < 100; i++) {
    stepWorld(world, SIM_DT_S);
  }

  expect(ac.altitudeFt).toBeLessThan(initialAlt);
});

test("T04-82: touchdown at threshold emits nav.landed and despawns aircraft", () => {
  const ac = visualFinalAircraft({
    xNm: 0.05,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 40,
    speedKt: 130,
  });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [ac], sessionLog: log });

  for (let i = 0; i < 20; i++) {
    stepWorld(world, SIM_DT_S);
  }

  expect(world.aircraft.find((a) => a.id === ac.id)).toBeUndefined();
  expect(log.byType("nav.landed")).toHaveLength(1);
  expect(log.byType("nav.landed")[0]?.callsign).toBe("SWA456");
  expect(log.byType("nav.landed")[0]?.approachId).toBe("VISUAL 27");
});

test("T04-82: missed approach on VISUAL_FINAL climbs runway heading", () => {
  const ac = visualFinalAircraft({
    xNm: 1,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 500,
  });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [ac], sessionLog: log });

  const spec = missedSpecFor("VISUAL 27", world.catalog);
  beginMissedApproach(ac, spec, { log, simTimeMs: world.simTimeMs }, "VISUAL 27");

  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(log.byType("nav.missed.started")[0]?.approachId).toBe("VISUAL 27");
  expect(ac.intent.lateral).toEqual({ type: "MISSED", approachId: "VISUAL 27" });
  expect(ac.intent.vertical).toEqual({ type: "MISSED_CLIMB", altitudeFt: 3000 });
  expect(ac.intent.assignedHeadingDeg).toBe(270);
});
