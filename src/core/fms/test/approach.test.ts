import { expect, test } from "vitest";
import {
  SIM_DT_S,
  SessionLog,
  createAircraft,
  createWorld,
  gsAltitudeFt,
  kdemIls27GsParams,
  kdemIls27LocAxis,
  locDeviation,
  stepWorld,
} from "@core";
import type { Aircraft, World } from "@core";
import fixesJson from "../../../scenario/data/kdem/fixes.json";
import ilsJson from "../../../scenario/data/kdem/ils.json";
import ndbsJson from "../../../scenario/data/kdem/ndbs.json";
import vorsJson from "../../../scenario/data/kdem/vors.json";

const ILS27_APPROACH = {
  id: "ILS27",
  courseDeg: 270,
  lengthNm: 18,
  beamHalfWidthDeg: 2.5,
  thresholdFixId: "RW27",
  gsAngleDeg: 3,
  tchFt: 50,
} as const;

const gsParams = kdemIls27GsParams();
const locAxis = kdemIls27LocAxis();

function kdemCatalog() {
  return {
    airportId: "KDEM",
    fieldElevFt: 0,
    navaids: [...vorsJson.vors, ...ndbsJson.ndbs, ...ilsJson.components],
    fixes: fixesJson.fixes,
    stars: [],
    approaches: [ILS27_APPROACH],
    sids: [],
  };
}

function onLoc(args: { xNm: number; altitudeFt: number; headingDeg?: number }): Aircraft {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: args.xNm,
    yNm: 0,
    headingDeg: args.headingDeg ?? 270,
    altitudeFt: args.altitudeFt,
    speedKt: 220,
  });
}

function worldOnLoc(
  ac: Aircraft,
  lateral: "LOC" | "INTERCEPT_LOC" = "LOC",
): {
  dal: Aircraft;
  world: World;
  log: SessionLog;
} {
  ac.intent.lateral = { type: lateral, approachId: "ILS27" };
  ac.intent.clearedApproachId = "ILS27";
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [ac],
    catalog: kdemCatalog(),
    sessionLog: log,
  });
  return { dal: ac, world, log };
}

function alongTrack(ac: Aircraft): number {
  return locDeviation({ xNm: ac.xNm, yNm: ac.yNm }, locAxis).alongTrackNm;
}

function gsAt(ac: Aircraft): number {
  return gsAltitudeFt(alongTrack(ac), gsParams);
}

function stepSeconds(world: World, seconds: number): void {
  const n = Math.round(seconds / SIM_DT_S);
  for (let i = 0; i < n; i += 1) {
    stepWorld(world, SIM_DT_S);
  }
}

test("AC2 — loc captured at 8 NM / 2000 captures GS near 6 NM and tracks within 150 ft to 1000", () => {
  const { dal, world, log } = worldOnLoc(onLoc({ xNm: 8, altitudeFt: 2000 }));
  const assignedSpeed = dal.intent.assignedSpeedKt;

  const capMs = 3 * 60 * 1000;
  while (world.simTimeMs < capMs && log.byType("nav.gs.captured").length === 0) {
    expect(dal.intent.vertical?.type === "GS").toBeFalsy();
    stepWorld(world, SIM_DT_S);
  }
  expect(log.byType("nav.gs.captured")).toHaveLength(1);
  expect(log.byType("nav.gs.captured")[0]?.approachId).toBe("ILS27");
  expect(dal.intent.vertical).toEqual({ type: "GS", approachId: "ILS27" });
  const capturedAlong = alongTrack(dal);
  expect(capturedAlong).toBeGreaterThanOrEqual(5);
  expect(capturedAlong).toBeLessThanOrEqual(7);

  while (world.simTimeMs < 8 * 60 * 1000 && dal.altitudeFt > 1000) {
    expect(Math.abs(dal.altitudeFt - gsAt(dal))).toBeLessThan(150);
    expect(dal.intent.vertical?.type).toBe("GS");
    stepWorld(world, SIM_DT_S);
  }
  expect(dal.altitudeFt).toBeLessThanOrEqual(1000);
  expect(dal.altitudeFt).toBeGreaterThan(200);
  expect(Math.abs(dal.altitudeFt - gsAt(dal))).toBeLessThan(150);
  expect(dal.intent.assignedSpeedKt).toBe(assignedSpeed);
  expect(world.aircraft).toHaveLength(1);
});

test("AC2c — INTERCEPT_LOC at ~8 NM does not capture GS in 20 s", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 8,
    yNm: 3,
    headingDeg: 90,
    altitudeFt: 2000,
    speedKt: 220,
  });
  const { world, log } = worldOnLoc(dal, "INTERCEPT_LOC");
  stepSeconds(world, 20);
  expect(dal.intent.lateral?.type).toBe("INTERCEPT_LOC");
  expect(log.byType("nav.gs.captured")).toHaveLength(0);
  expect(dal.intent.vertical?.type === "GS").toBeFalsy();
  expect(dal.altitudeFt).toBeCloseTo(2000, 0);
});

test("AC3 — above GS at 6 NM / 4000 does not capture in 30 s but descends toward the beam", () => {
  const { dal, world, log } = worldOnLoc(onLoc({ xNm: 6, altitudeFt: 4000 }));
  expect(dal.altitudeFt).toBeGreaterThan(gsAt(dal) + 50);
  stepSeconds(world, 30);
  expect(log.byType("nav.gs.captured")).toHaveLength(0);
  expect(dal.intent.vertical?.type === "GS").toBeFalsy();
  expect(dal.altitudeFt).toBeLessThan(4000 - 200);
  expect(dal.altitudeFt).toBeGreaterThan(gsAt(dal) + 50);
});

test("APP + loc above GS captures and tracks down toward field elev 0", () => {
  const { dal, world, log } = worldOnLoc(onLoc({ xNm: 12, altitudeFt: 4000 }));
  expect(gsParams.fieldElevFt).toBe(0);
  const found = (() => {
    const capMs = 5 * 60 * 1000;
    while (world.simTimeMs < capMs && log.byType("nav.gs.captured").length === 0) {
      stepWorld(world, SIM_DT_S);
    }
    return log.byType("nav.gs.captured").length > 0;
  })();
  expect(found).toBe(true);
  expect(dal.intent.vertical?.type).toBe("GS");
  while (world.simTimeMs < 10 * 60 * 1000 && dal.altitudeFt > 800) {
    expect(dal.intent.vertical?.type).toBe("GS");
    expect(dal.altitudeFt).toBeGreaterThanOrEqual(gsParams.fieldElevFt);
    stepWorld(world, SIM_DT_S);
  }
  expect(dal.altitudeFt).toBeLessThanOrEqual(800);
  expect(dal.altitudeFt).toBeGreaterThan(200);
});

test("LOC without APP (no clearedApproachId) holds altitude — no GS", () => {
  const ac = onLoc({ xNm: 6, altitudeFt: 2000 });
  ac.intent.lateral = { type: "LOC", approachId: "ILS27" };
  ac.intent.clearedApproachId = null;
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [ac],
    catalog: kdemCatalog(),
    sessionLog: log,
  });
  stepSeconds(world, 30);
  expect(log.byType("nav.gs.captured")).toHaveLength(0);
  expect(ac.intent.vertical?.type === "GS").toBeFalsy();
  expect(ac.altitudeFt).toBeCloseTo(2000, 0);
  expect(ac.intent.lateral?.type).toBe("LOC");
});

test("AC4 — H360 after GS capture clears GS; aircraft does not keep the 3° descent", () => {
  const { dal, world, log } = worldOnLoc(onLoc({ xNm: 8, altitudeFt: 2000 }));
  while (world.simTimeMs < 3 * 60 * 1000 && log.byType("nav.gs.captured").length === 0) {
    stepWorld(world, SIM_DT_S);
  }
  expect(dal.intent.vertical?.type).toBe("GS");
  const altAtCapture = dal.altitudeFt;

  dal.intent.assignedHeadingDeg = 0;
  dal.intent.turn = "SHORTEST";
  dal.intent.lateral = { type: "HEADING", headingDeg: 0 };
  dal.intent.clearedApproachId = null;
  // Heading cancel also clears GS (applyIntent); FMS must drop it even if vertical lingered.
  expect(dal.intent.vertical?.type).toBe("GS");
  stepSeconds(world, 20);
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(log.byType("nav.gs.captured")).toHaveLength(1);
  expect(dal.altitudeFt).toBeGreaterThan(altAtCapture - 80);
  expect(dal.altitudeFt).toBeCloseTo(dal.intent.assignedAltitudeFt, 0);
});

test("H270 after GS still cancels FMS including GS", () => {
  const { dal, world, log } = worldOnLoc(onLoc({ xNm: 8, altitudeFt: 2000 }));
  while (world.simTimeMs < 3 * 60 * 1000 && log.byType("nav.gs.captured").length === 0) {
    stepWorld(world, SIM_DT_S);
  }
  expect(dal.intent.vertical?.type).toBe("GS");
  dal.intent.assignedHeadingDeg = 270;
  dal.intent.turn = "SHORTEST";
  dal.intent.lateral = { type: "HEADING", headingDeg: 270 };
  dal.intent.clearedApproachId = null;
  dal.intent.vertical = { type: "ASSIGNED" };
  const altAtCancel = dal.altitudeFt;
  stepSeconds(world, 25);
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(dal.intent.lateral?.type).toBe("HEADING");
  expect(dal.altitudeFt).toBeGreaterThan(altAtCancel - 50);
  expect(dal.altitudeFt).toBeCloseTo(2000, 0);
  expect(alongTrack(dal)).toBeLessThan(6);
});

test("more than 150 ft above GS after capture drops to ASSIGNED", () => {
  const { dal, world, log } = worldOnLoc(onLoc({ xNm: 8, altitudeFt: 2000 }));
  while (world.simTimeMs < 3 * 60 * 1000 && log.byType("nav.gs.captured").length === 0) {
    stepWorld(world, SIM_DT_S);
  }
  expect(dal.intent.vertical?.type).toBe("GS");
  dal.altitudeFt = gsAt(dal) + 200;
  stepWorld(world, SIM_DT_S);
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(dal.altitudeFt).toBeGreaterThan(gsAt(dal) + 150);
});

test("AC5 — approach GS tests are DOM-free", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});
