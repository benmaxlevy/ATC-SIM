import { expect, test } from "vitest";
import { makeTestAircraft } from "./aircraft";
import { SIM_DT_S } from "./clock";
import { SessionLog } from "./events/session-log";
import { DEG2RAD, normalizeHeadingDeg } from "./nav/geometry";
import atpaVolumesJson from "../scenario/data/kdem/atpa-volumes.json";
import type { AtpaVolumeParams } from "./alerts/atpa";
import { createWorld, stepWorld, type World } from "./world";

function volumeById(id: string): AtpaVolumeParams {
  const volume = atpaVolumesJson.atpaVolumes.find((item) => item.id === id);
  if (volume === undefined) {
    throw new Error(`missing ATPA volume fixture ${id}`);
  }
  return volume;
}

const volume27 = volumeById("ATPA27");

function atpaCatalog(): NonNullable<World["catalog"]> {
  return {
    airportId: "KDEM",
    navaids: [],
    fixes: [{ id: "RW27", xNm: 0, yNm: 0, kind: "threshold" }],
    stars: [],
    approaches: [{ id: "ILS27", courseDeg: 270, thresholdFixId: "RW27" }],
    sids: [],
    atpaVolumes: [volume27],
  };
}

function inboundOn27(alongNm: number, headingDeg = 270, altitudeFt = 3000) {
  const rad = normalizeHeadingDeg(270 + 180) * DEG2RAD;
  return {
    xNm: alongNm * Math.sin(rad),
    yNm: alongNm * Math.cos(rad),
    headingDeg,
    altitudeFt,
  };
}

function arrival(callsign: string, alongNm: number, speedKt = 0) {
  const pose = inboundOn27(alongNm);
  return makeTestAircraft({
    id: `ac-${callsign.toLowerCase()}`,
    callsign,
    xNm: pose.xNm,
    yNm: pose.yNm,
    headingDeg: pose.headingDeg,
    altitudeFt: pose.altitudeFt,
    speedKt,
  });
}

test("T02-44 AC6 — stepWorld attaches an in-trail pair and logs status enter once", () => {
  const leader = arrival("AAL45", 11);
  const trailer = arrival("DAL123", 15);
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [leader, trailer],
    catalog: atpaCatalog(),
    sessionLog: log,
  });

  stepWorld(world, 0);
  expect(world.alerts.atpa).toHaveLength(1);
  expect(world.alerts.atpa[0]).toMatchObject({
    trailingCallsign: "DAL123",
    leadingCallsign: "AAL45",
    volumeId: "ATPA27",
    requiredNm: volume27.basicSeparationNm,
    status: "monitor",
  });
  expect(log.byType("alert.atpa.monitor")).toHaveLength(1);
  expect(log.byType("alert.atpa.clear")).toHaveLength(0);

  stepWorld(world, SIM_DT_S);
  expect(log.byType("alert.atpa.monitor")).toHaveLength(1);
  expect(world.alerts.ca).toEqual([]);
});

test("T02-44 AC6 — a track leaving the volume clears its pair on the next stepWorld", () => {
  const leader = arrival("AAL45", 11);
  const trailer = arrival("DAL123", 15);
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [leader, trailer],
    catalog: atpaCatalog(),
    sessionLog: log,
  });

  stepWorld(world, 0);
  expect(world.alerts.atpa).toHaveLength(1);

  const outside = inboundOn27(16);
  trailer.xNm = outside.xNm;
  trailer.yNm = outside.yNm;
  stepWorld(world, 0);
  expect(world.alerts.atpa).toEqual([]);
  const cleared = log.byType("alert.atpa.clear");
  expect(cleared).toHaveLength(1);
  expect(cleared[0]?.trailingCallsign).toBe("DAL123");
  expect(cleared[0]?.leadingCallsign).toBe("AAL45");
  expect(cleared[0]?.volumeId).toBe("ATPA27");
  expect(cleared[0]?.distanceNm).toBeCloseTo(5, 5);
});

test("stepWorld without ATPA volumes leaves atpa empty", () => {
  const leader = arrival("AAL45", 11);
  const trailer = arrival("DAL123", 15);
  const world = createWorld({ aircraft: [leader, trailer] });
  stepWorld(world, 0);
  expect(world.alerts.atpa).toEqual([]);
});

test("status upgrade logs the new status without a clear", () => {
  const leader = arrival("AAL45", 11, 70);
  const trailer = arrival("DAL123", 15, 250);
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [leader, trailer],
    catalog: atpaCatalog(),
    sessionLog: log,
  });

  trailer.speedKt = 70;
  stepWorld(world, 0);
  expect(world.alerts.atpa[0]?.status).toBe("monitor");
  expect(log.byType("alert.atpa.monitor")).toHaveLength(1);

  trailer.speedKt = 250;
  stepWorld(world, 0);
  expect(world.alerts.atpa[0]?.status).toBe("alert");
  expect(log.byType("alert.atpa.alert")).toHaveLength(1);
  expect(log.byType("alert.atpa.clear")).toHaveLength(0);
});
