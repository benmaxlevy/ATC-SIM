import { expect, test } from "vitest";
import {
  SIM_DT_S,
  SessionLog,
  acceptInboundHandoff,
  createAircraft,
  evaluateConflictAlert,
  evaluateAtpa,
  locAxisForApproach,
  locDeviation,
  magneticToTrueDeg,
  resolveAtpaGeometry,
  stepWorld,
} from "@core";
import { handleRadioText } from "@pilot";
import {
  assertScenario,
  createWorldForSession,
  createWorldFromScenario,
  loadKdem,
} from "@scenario";
import { ptlEndpoint } from "@scope";
import katlJson from "../katl.json";

function stepUntil(
  world: ReturnType<typeof createWorldFromScenario>,
  predicate: () => boolean,
): void {
  for (let i = 0; i < 1800 && !predicate(); i += 1) stepWorld(world, SIM_DT_S);
  expect(predicate()).toBe(true);
}

test("T04-50 KATL I26R keeps magnetic controller headings on true localizer geometry", async () => {
  const scenario = assertScenario(katlJson);
  const world = createWorldFromScenario(scenario, 50);
  const catalog = world.catalog!;
  const log = world.sessionLog ?? new SessionLog();
  world.sessionLog = log;
  const aircraft = world.aircraft[0]!;
  expect(world.navigation.magVarDeg).toBe(-5);
  const approach = catalog.approaches.find((item) => item.id === "I26R")!;
  expect(approach.courseDeg).toBe(275);
  const axis = locAxisForApproach("I26R", catalog, world.fixRegistry, world.navigation.magVarDeg)!;
  expect(axis.publishedCourseMagneticDeg).toBe(275);
  expect(axis.geometricCourseTrueDeg).toBe(270);
  expect(acceptInboundHandoff(world, aircraft.id)).toBe(true);

  // Put the real KATL arrival on a small, bounded right-of-course intercept.
  aircraft.xNm = axis.thresholdXNm + 8;
  aircraft.yNm = axis.thresholdYNm + 0.05;
  aircraft.headingDeg = 275;
  aircraft.altitudeFt = 2200;
  aircraft.speedKt = 180;
  const clear = await handleRadioText(world, `${aircraft.callsign} H275 D20 APP I26R`, log);
  expect(clear.accepted).toBe(true);
  expect(clear.readback).toContain("heading 275");
  expect(aircraft.intent.assignedHeadingDeg).toBe(275);
  expect(magneticToTrueDeg(aircraft.headingDeg, world.navigation.magVarDeg)).toBe(270);

  const signs: number[] = [];
  while (world.simTimeMs < 180 * 1000 && log.byType("nav.loc.captured").length === 0) {
    signs.push(Math.sign(locDeviation(aircraft, axis).crossTrackNm));
    stepWorld(world, SIM_DT_S);
  }
  expect(log.byType("nav.loc.captured")).toHaveLength(1);
  expect(signs.filter((sign, i) => i > 0 && sign !== 0 && sign !== signs[i - 1]).length).toBe(0);
  expect(Math.abs(locDeviation(aircraft, axis).crossTrackNm)).toBeLessThan(0.5);
  expect(aircraft.intent.lateral).toEqual({ type: "LOC", approachId: "I26R" });

  stepUntil(world, () => log.byType("nav.gs.captured").length === 1);
  expect(aircraft.intent.vertical).toEqual({ type: "GS", approachId: "I26R" });
  expect(log.byType("nav.loc.captured")).toHaveLength(1);

  const ptl = ptlEndpoint(aircraft.xNm, aircraft.yNm, aircraft.headingDeg, aircraft.speedKt, 1, -5);
  const truePtl = ptlEndpoint(aircraft.xNm, aircraft.yNm, 270, aircraft.speedKt, 1);
  expect(ptl).toEqual(truePtl);
  const geometry = resolveAtpaGeometry(catalog, catalog.atpaVolumes ?? [], -5);
  expect(geometry.ATPA26R?.courseDeg).toBe(270);
  const leader = createAircraft({
    id: "katl-leader",
    callsign: "AAL45",
    xNm: axis.thresholdXNm + 10,
    yNm: axis.thresholdYNm,
    headingDeg: 275,
    altitudeFt: 1800,
    speedKt: 160,
  });
  const trailer = createAircraft({
    id: "katl-trailer",
    callsign: "DAL123",
    xNm: axis.thresholdXNm + 12,
    yNm: axis.thresholdYNm,
    headingDeg: 275,
    altitudeFt: 1800,
    speedKt: 220,
  });
  const atpa = evaluateAtpa([leader, trailer], catalog.atpaVolumes ?? [], geometry, -5);
  expect(atpa.find((pair) => pair.volumeId === "ATPA26R")?.closureKt).toBeGreaterThan(0);
  const caIntruder = createAircraft({
    id: "katl-ca",
    callsign: "UAL100",
    xNm: aircraft.xNm + 2,
    yNm: aircraft.yNm,
    headingDeg: 275,
    altitudeFt: aircraft.altitudeFt,
    speedKt: 220,
  });
  expect(
    evaluateConflictAlert([aircraft, caIntruder], undefined, world.navigation.magVarDeg).length,
  ).toBeGreaterThan(0);

  // Exactly one synthetic reciprocal guard catches a variation sign/reversal regression.
  expect(magneticToTrueDeg(95, -5)).toBe(90);
});

test("T04-50 KDEM ILS 27 retains zero-variation controller and true track", async () => {
  const world = createWorldForSession(loadKdem(), null, 1);
  const log = world.sessionLog ?? new SessionLog();
  world.sessionLog = log;
  const aircraft = world.aircraft[0]!;
  const axis = locAxisForApproach("ILS27", world.catalog, world.fixRegistry, 0)!;
  expect(world.navigation.magVarDeg).toBe(0);
  expect(axis.publishedCourseMagneticDeg).toBe(270);
  expect(axis.geometricCourseTrueDeg).toBe(270);
  expect(acceptInboundHandoff(world, aircraft.id)).toBe(true);
  aircraft.xNm = axis.thresholdXNm + 8;
  aircraft.yNm = axis.thresholdYNm;
  aircraft.headingDeg = 270;
  aircraft.altitudeFt = 2200;
  aircraft.speedKt = 180;
  const clear = await handleRadioText(world, `${aircraft.callsign} H270 D20 APP ILS27`, log);
  expect(clear.accepted).toBe(true);
  expect(clear.readback).toContain("heading 270");
  stepUntil(world, () => log.byType("nav.gs.captured").length === 1);
  expect(log.byType("nav.loc.captured")).toHaveLength(1);
  expect(aircraft.intent.vertical).toEqual({ type: "GS", approachId: "ILS27" });
});
