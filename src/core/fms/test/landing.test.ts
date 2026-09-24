import { expect, test } from "vitest";
import {
  SIM_DT_S,
  SessionLog,
  acceptTowerHandoff,
  createAircraft,
  createWorld,
  gsAltitudeFt,
  isTowerHandoffEligible,
  kdemIls27GsParams,
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
  daFt: 200,
  missed: { headingDeg: 270, climbToFt: 3000, directFixId: "MISSD" },
} as const;

const gsParams = kdemIls27GsParams();

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
    speedKt: 160,
  });
}

function worldOnApproach(
  ac: Aircraft,
  lateral: "LOC" | "LANDING" = "LOC",
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

test("AC2 — LANDING + GS through threshold emits nav.landed and removes the aircraft", () => {
  const { dal, world, log } = worldOnApproach(
    onLoc({ xNm: 0.8, altitudeFt: gsAltitudeFt(0.8, gsParams) }),
    "LANDING",
  );
  dal.intent.landingCleared = true;
  dal.intent.vertical = { type: "GS", approachId: "ILS27" };

  const rideMs = 2 * 60 * 1000;
  while (world.simTimeMs < rideMs && world.aircraft.some((ac) => ac.id === dal.id)) {
    stepWorld(world, SIM_DT_S);
  }

  expect(world.aircraft.find((ac) => ac.id === dal.id)).toBeUndefined();
  expect(world.aircraft).toHaveLength(0);
  expect(log.byType("nav.landed")).toHaveLength(1);
  expect(log.byType("nav.landed")[0]?.callsign).toBe("DAL123");
  expect(log.byType("nav.landed")[0]?.approachId).toBe("ILS27");
  expect(log.byType("nav.missed.started")).toHaveLength(0);
  expect(world.selectedAircraftId).toBeNull();
});

test("AC3 — GS to DA without LANDING fires nav.missed.started and keeps the aircraft", () => {
  const { dal, world, log } = worldOnApproach(onLoc({ xNm: 0.8, altitudeFt: 200 }));
  dal.intent.vertical = { type: "GS", approachId: "ILS27" };

  stepWorld(world, SIM_DT_S);
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(log.byType("nav.landed")).toHaveLength(0);
  expect(world.aircraft).toHaveLength(1);
  expect(dal.intent.lateral?.type).toBe("MISSED");
});

test("LANDING holds GS through DA instead of missed", () => {
  const startAlong = 0.9;
  const { dal, world, log } = worldOnApproach(
    onLoc({ xNm: startAlong, altitudeFt: gsAltitudeFt(startAlong, gsParams) }),
    "LANDING",
  );
  dal.intent.landingCleared = true;
  dal.intent.vertical = { type: "GS", approachId: "ILS27" };

  const throughDaMs = 30 * 1000;
  while (world.simTimeMs < throughDaMs && dal.altitudeFt > 180) {
    stepWorld(world, SIM_DT_S);
  }
  expect(log.byType("nav.missed.started")).toHaveLength(0);
  expect(dal.intent.vertical?.type).toBe("GS");
  expect(dal.intent.lateral?.type).toBe("LANDING");
  expect(dal.altitudeFt).toBeLessThanOrEqual(200);
});

test("tower HO gate is loc/GS inside 10 NM and still above DA", () => {
  const inside = onLoc({ xNm: 8, altitudeFt: 2500 });
  inside.intent.lateral = { type: "LOC", approachId: "ILS27" };
  inside.intent.clearedApproachId = "ILS27";
  inside.intent.vertical = { type: "GS", approachId: "ILS27" };
  const world = createWorld({
    aircraft: [inside],
    catalog: kdemCatalog(),
  });
  expect(isTowerHandoffEligible(inside, world)).toBe(true);

  const far = onLoc({ xNm: 12, altitudeFt: 3500 });
  far.id = "ac-far";
  far.intent.lateral = { type: "LOC", approachId: "ILS27" };
  far.intent.clearedApproachId = "ILS27";
  world.aircraft.push(far);
  expect(isTowerHandoffEligible(far, world)).toBe(false);

  expect(acceptTowerHandoff(inside, { log: world.sessionLog, simTimeMs: world.simTimeMs })).toBe(
    true,
  );
  expect(inside.intent.landingCleared).toBe(true);
  expect(inside.intent.lateral).toEqual({ type: "LANDING", approachId: "ILS27" });
  expect(isTowerHandoffEligible(inside, world)).toBe(false);
});

test("INTERCEPT_LOC with 45° intercept angle inside 10 NM is eligible", () => {
  const aircraft = onLoc({ xNm: 5, altitudeFt: 1500, headingDeg: 315 });
  aircraft.intent.lateral = { type: "INTERCEPT_LOC", approachId: "ILS27" };
  aircraft.intent.clearedApproachId = "ILS27";
  const world = createWorld({
    aircraft: [aircraft],
    catalog: kdemCatalog(),
  });
  expect(isTowerHandoffEligible(aircraft, world)).toBe(true);

  // If heading deviation > 45 deg, should not be eligible
  aircraft.headingDeg = 320;
  expect(isTowerHandoffEligible(aircraft, world)).toBe(false);
});

test("visual approach tower handoff eligibility and acceptTowerHandoff preserves VISUAL_FINAL", () => {
  const aircraft = onLoc({ xNm: 6, altitudeFt: 2000, headingDeg: 270 });
  aircraft.intent.lateral = {
    type: "VISUAL_FINAL",
    runwayId: "27",
    threshold: { xNm: 0, yNm: 0 },
    headingDeg: 270,
    fieldElevFt: 2,
  };
  aircraft.intent.clearedApproachId = "VISUAL_27";
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [aircraft],
    catalog: kdemCatalog(),
    sessionLog: log,
  });

  expect(isTowerHandoffEligible(aircraft, world)).toBe(true);

  // Heading deviation > 45 deg ineligible
  aircraft.headingDeg = 320;
  expect(isTowerHandoffEligible(aircraft, world)).toBe(false);
  aircraft.headingDeg = 270;

  // Outside 10 NM ineligible
  aircraft.xNm = 11;
  expect(isTowerHandoffEligible(aircraft, world)).toBe(false);
  aircraft.xNm = 6;

  // Below field elev ineligible
  aircraft.altitudeFt = 2;
  expect(isTowerHandoffEligible(aircraft, world)).toBe(false);
  aircraft.altitudeFt = 2000;

  // Accept handoff: keeps VISUAL_FINAL
  expect(acceptTowerHandoff(aircraft, { log, simTimeMs: 9000 })).toBe(true);
  expect(aircraft.intent.landingCleared).toBe(true);
  expect(aircraft.intent.lateral?.type).toBe("VISUAL_FINAL");
  expect(log.byType("handoff.tower")).toHaveLength(1);
  expect(isTowerHandoffEligible(aircraft, world)).toBe(false);
});

test("acceptTowerHandoff does not emit command.accepted", () => {
  const log = new SessionLog();
  const dal = onLoc({ xNm: 3, altitudeFt: 1000 });
  dal.intent.lateral = { type: "LOC", approachId: "ILS27" };
  dal.intent.clearedApproachId = "ILS27";
  expect(acceptTowerHandoff(dal, { log, simTimeMs: 12_000 })).toBe(true);
  expect(log.byType("handoff.tower")).toHaveLength(1);
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(log.byType("command.rejected")).toHaveLength(0);
});
