import { expect, test } from "vitest";
import {
  SIM_DT_S,
  SessionLog,
  createAircraft,
  createWorld,
  distanceNm,
  gsAltitudeFt,
  kdemIls27GsParams,
  kdemIls27LocAxis,
  locDeviation,
  stepWorld,
} from "@core";
import type { Aircraft, World } from "@core";
import { beginMissedApproach, missedSpecFor } from "./missed";
import fixesJson from "../../scenario/data/kdem/fixes.json";
import ilsJson from "../../scenario/data/kdem/ils.json";
import ndbsJson from "../../scenario/data/kdem/ndbs.json";
import vorsJson from "../../scenario/data/kdem/vors.json";

const ILS27_APPROACH = {
  id: "ILS27",
  courseDeg: 270,
  lengthNm: 18,
  beamHalfWidthDeg: 2.5,
  thresholdFixId: "RW27",
  gsAngleDeg: 3,
  tchFt: 50,
  daFt: 200,
  missed: { headingDeg: 270, climbToFt: 3000, directFixId: "MISSD" },
} as const;

const gsParams = kdemIls27GsParams();
const locAxis = kdemIls27LocAxis();
const MISSD = { xNm: -8, yNm: 6 };

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

function worldOnApproach(
  ac: Aircraft,
  lateral: "LOC" | "INTERCEPT_LOC" = "LOC",
): { dal: Aircraft; world: World; log: SessionLog } {
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

function captureGs(dal: Aircraft, world: World, log: SessionLog): void {
  const capMs = 3 * 60 * 1000;
  while (world.simTimeMs < capMs && log.byType("nav.gs.captured").length === 0) {
    stepWorld(world, SIM_DT_S);
  }
  expect(dal.intent.vertical?.type).toBe("GS");
}

test("AC1 — GS at DA without landing fires nav.missed.started once and heading 270", () => {
  const { dal, world, log } = worldOnApproach(onLoc({ xNm: 0.8, altitudeFt: 200 }));
  dal.intent.vertical = { type: "GS", approachId: "ILS27" };
  expect(dal.intent.landingCleared).toBeFalsy();

  stepWorld(world, SIM_DT_S);
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(log.byType("nav.missed.started")[0]?.approachId).toBe("ILS27");
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.lateral).toEqual({ type: "MISSED", approachId: "ILS27" });
  expect(dal.intent.vertical).toEqual({ type: "MISSED_CLIMB", altitudeFt: 3000 });

  stepSeconds(world, 5);
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(dal.headingDeg).toBeCloseTo(270, 0);
});

test("AC2 — after DA missed, aircraft climbs to 3000 and leaves the GS path", () => {
  const { dal, world, log } = worldOnApproach(onLoc({ xNm: 0.8, altitudeFt: 200 }));
  dal.intent.vertical = { type: "GS", approachId: "ILS27" };
  stepWorld(world, SIM_DT_S);
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  const gsWhenMissed = gsAt(dal);

  const climbMs = 3 * 60 * 1000;
  while (world.simTimeMs < climbMs && dal.altitudeFt < 2850) {
    stepWorld(world, SIM_DT_S);
  }
  expect(dal.altitudeFt).toBeGreaterThanOrEqual(2850);
  expect(dal.altitudeFt).toBeLessThanOrEqual(3150);
  expect(dal.intent.vertical?.type).not.toBe("GS");
  expect(dal.altitudeFt).toBeGreaterThan(gsWhenMissed + 200);
});

test("AC3 — at 3000, lateral becomes DIRECT MISSD and distance decreases", () => {
  const { dal, world, log } = worldOnApproach(onLoc({ xNm: 0.8, altitudeFt: 200 }));
  dal.intent.vertical = { type: "GS", approachId: "ILS27" };
  const climbMs = 3 * 60 * 1000;
  while (world.simTimeMs < climbMs && dal.intent.lateral?.type !== "DIRECT") {
    stepWorld(world, SIM_DT_S);
  }
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(dal.intent.lateral).toEqual({ type: "DIRECT", fixId: "MISSD" });
  expect(dal.altitudeFt).toBeGreaterThanOrEqual(2850);

  const dist0 = distanceNm(dal, MISSD);
  stepSeconds(world, 40);
  expect(dal.intent.lateral).toEqual({ type: "DIRECT", fixId: "MISSD" });
  expect(distanceNm(dal, MISSD)).toBeLessThan(dist0 - 0.5);
});

test("AC4 — landingCleared at DA does not fire nav.missed.started", () => {
  const { dal, world, log } = worldOnApproach(onLoc({ xNm: 0.8, altitudeFt: 200 }));
  dal.intent.vertical = { type: "GS", approachId: "ILS27" };
  dal.intent.landingCleared = true;
  stepSeconds(world, 2);
  expect(log.byType("nav.missed.started")).toHaveLength(0);
  expect(dal.intent.lateral?.type).not.toBe("MISSED");
  expect(dal.intent.vertical?.type).not.toBe("MISSED_CLIMB");
});

test("AC4 — LANDING at DA does not fire nav.missed.started", () => {
  const { dal, world, log } = worldOnApproach(onLoc({ xNm: 0.8, altitudeFt: 200 }));
  dal.intent.vertical = { type: "GS", approachId: "ILS27" };
  dal.intent.lateral = { type: "LANDING", approachId: "ILS27" };
  stepSeconds(world, 2);
  expect(log.byType("nav.missed.started")).toHaveLength(0);
  expect(dal.intent.lateral?.type).toBe("LANDING");
});

test("GA path helper starts missed on loc at 3000 without waiting for DA", () => {
  const { dal, world, log } = worldOnApproach(onLoc({ xNm: 6, altitudeFt: 3000 }));
  const started = beginMissedApproach(
    dal,
    missedSpecFor("ILS27", world.catalog),
    { log, simTimeMs: world.simTimeMs },
    "ILS27",
  );
  expect(started).toBe(true);
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(dal.intent.lateral).toEqual({ type: "MISSED", approachId: "ILS27" });
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.altitudeFt).toBe(3000);
  stepSeconds(world, 5);
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(dal.intent.lateral?.type).not.toBe("LOC");
  expect(dal.intent.vertical?.type).not.toBe("GS");
});

test("GS ride through 200 without landing starts missed once (T04-06 fixture continued)", () => {
  const { dal, world, log } = worldOnApproach(onLoc({ xNm: 8, altitudeFt: 2000 }));
  captureGs(dal, world, log);
  const rideMs = 8 * 60 * 1000;
  while (world.simTimeMs < rideMs && log.byType("nav.missed.started").length === 0) {
    stepWorld(world, SIM_DT_S);
  }
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(dal.altitudeFt).toBeLessThan(400);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.vertical?.type).toBe("MISSED_CLIMB");
  const altAtMissed = dal.altitudeFt;
  stepSeconds(world, 20);
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(dal.altitudeFt).toBeGreaterThan(altAtMissed);
});

test("heading after missed cancels MISSED lateral", () => {
  const { dal, world, log } = worldOnApproach(onLoc({ xNm: 0.8, altitudeFt: 200 }));
  dal.intent.vertical = { type: "GS", approachId: "ILS27" };
  stepWorld(world, SIM_DT_S);
  expect(dal.intent.lateral?.type).toBe("MISSED");
  dal.intent.assignedHeadingDeg = 0;
  dal.intent.turn = "SHORTEST";
  dal.intent.lateral = { type: "HEADING", headingDeg: 0 };
  dal.intent.clearedApproachId = null;
  dal.intent.vertical = { type: "ASSIGNED" };
  dal.intent.assignedAltitudeFt = 3000;
  stepSeconds(world, 10);
  expect(dal.intent.lateral?.type).toBe("HEADING");
  expect(log.byType("nav.missed.started")).toHaveLength(1);
});

test("AC6 — missed approach tests are DOM-free", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});
