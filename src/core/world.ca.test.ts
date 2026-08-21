import { expect, test } from "vitest";
import { makeTestAircraft } from "./aircraft";
import { SIM_DT_S } from "./clock";
import { SessionLog } from "./events/session-log";
import { createWorld, stepWorld } from "./world";

function redPair() {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 0,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: 2,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 8200,
    speedKt: 0,
  });
  return { dal, aal };
}

test("AC4 — red pair that diverges to 5 NM / 2000 ft logs alert.ca.clear once", () => {
  const { dal, aal } = redPair();
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal, aal], sessionLog: log });

  stepWorld(world, 0);
  expect(world.alerts.ca).toHaveLength(1);
  expect(world.alerts.ca[0]?.severity).toBe("alert");
  expect(log.byType("alert.ca.alert")).toHaveLength(1);
  expect(log.byType("alert.ca.clear")).toHaveLength(0);

  stepWorld(world, SIM_DT_S);
  expect(log.byType("alert.ca.alert")).toHaveLength(1);

  dal.xNm = 0;
  dal.yNm = 0;
  dal.altitudeFt = 8000;
  aal.xNm = 5;
  aal.yNm = 0;
  aal.altitudeFt = 10000;
  stepWorld(world, 0);
  expect(world.alerts.ca).toEqual([]);
  const cleared = log.byType("alert.ca.clear");
  expect(cleared).toHaveLength(1);
  expect(cleared[0]?.callsignA).toBe("AAL45");
  expect(cleared[0]?.callsignB).toBe("DAL123");
  expect(cleared[0]?.distNm).toBeCloseTo(5, 5);
  expect(cleared[0]?.deltaAltFt).toBeCloseTo(2000, 5);
});

test("stepWorld emits caution then alert once each as a pair closes", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: 8,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal, aal], sessionLog: log });

  stepWorld(world, 0);
  expect(world.alerts.ca[0]?.severity).toBe("caution");
  expect(log.byType("alert.ca.caution")).toHaveLength(1);
  expect(log.byType("alert.ca.alert")).toHaveLength(0);

  stepWorld(world, 0);
  expect(log.byType("alert.ca.caution")).toHaveLength(1);

  const stepsToMerge = Math.ceil(8 / ((500 / 3600) * SIM_DT_S));
  for (let i = 0; i < stepsToMerge; i += 1) {
    stepWorld(world, SIM_DT_S);
    if (world.alerts.ca[0]?.severity === "alert") {
      break;
    }
  }
  expect(world.alerts.ca[0]?.severity).toBe("alert");
  expect(log.byType("alert.ca.caution")).toHaveLength(1);
  expect(log.byType("alert.ca.alert")).toHaveLength(1);
});
