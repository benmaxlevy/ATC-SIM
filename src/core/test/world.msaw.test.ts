import { expect, test } from "vitest";
import { makeTestAircraft } from "../aircraft";
import { CLIMB_RATE_FT_PER_MIN } from "../kinematics";
import { SIM_DT_S } from "../clock";
import { SessionLog } from "../events/session-log";
import kdemMvaJson from "../../scenario/data/kdem-mva.json";
import { createWorld, stepWorld } from "../world";
import type { MvaChart } from "../alerts/msaw";

const chart: MvaChart = {
  airportId: kdemMvaJson.airportId,
  defaultMinAltitudeFt: kdemMvaJson.defaultMinAltitudeFt,
  polygons: kdemMvaJson.polygons.map((poly) => ({
    id: poly.id,
    minAltitudeFt: poly.minAltitudeFt,
    verticesNm: poly.verticesNm.map((v) => ({ xNm: v.xNm, yNm: v.yNm })),
  })),
};
const innerFloor = chart.polygons.find((poly) => poly.id === "inner")!.minAltitudeFt;

test("AC5 — leaving the low-altitude region emits alert.msaw.clear once", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 2,
    yNm: 2,
    headingDeg: 90,
    altitudeFt: 1000,
    speedKt: 0,
  });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal], sessionLog: log, mvaChart: chart });

  stepWorld(world, 0);
  expect(world.alerts.msaw).toHaveLength(1);
  expect(world.alerts.msaw[0]?.severity).toBe("alert");
  expect(log.byType("alert.msaw.alert")).toHaveLength(1);
  expect(log.byType("alert.msaw.clear")).toHaveLength(0);

  stepWorld(world, SIM_DT_S);
  expect(log.byType("alert.msaw.alert")).toHaveLength(1);

  dal.altitudeFt = innerFloor + 100;
  stepWorld(world, 0);
  expect(world.alerts.msaw).toEqual([]);
  const cleared = log.byType("alert.msaw.clear");
  expect(cleared).toHaveLength(1);
  expect(cleared[0]?.callsign).toBe("DAL123");
  expect(cleared[0]?.altFt).toBe(innerFloor + 100);
  expect(cleared[0]?.floorFt).toBe(innerFloor);

  stepWorld(world, 0);
  expect(log.byType("alert.msaw.clear")).toHaveLength(1);
});

test("stepWorld integration: heading descent in the inner box alerts below the floor", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 1,
    yNm: 1,
    headingDeg: 270,
    altitudeFt: innerFloor + 50,
    speedKt: 0,
  });
  dal.intent.assignedAltitudeFt = 1000;
  dal.intent.lateral = { type: "HEADING", headingDeg: 270 };
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal], sessionLog: log, mvaChart: chart });

  stepWorld(world, 0);
  expect(world.alerts.msaw).toEqual([]);

  const steps = Math.ceil((innerFloor + 50 - 1000) / (CLIMB_RATE_FT_PER_MIN / 60) / SIM_DT_S) + 5;
  let sawAlert = false;
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, SIM_DT_S);
    if (world.alerts.msaw[0]?.severity === "alert") {
      sawAlert = true;
      expect(dal.altitudeFt).toBeLessThan(innerFloor);
      break;
    }
  }
  expect(sawAlert).toBe(true);
  expect(log.byType("alert.msaw.caution")).toHaveLength(0);
  expect(log.byType("alert.msaw.alert")).toHaveLength(1);
});

test("stepWorld without an MVA chart leaves msaw empty", () => {
  const dal = makeTestAircraft({ xNm: 0, yNm: 0, altitudeFt: 1000, speedKt: 0 });
  const world = createWorld({ aircraft: [dal] });
  stepWorld(world, 0);
  expect(world.alerts.msaw).toEqual([]);
});
