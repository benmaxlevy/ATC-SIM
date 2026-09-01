/**
 * Closed-loop integration: typed radio → pilot intent → kinematics.
 * DOM-free (`@core` + `@parse` via `@pilot` + `@scenario` only). Physics is
 * explicit `stepWorld` at SIM_DT_S — no fake timers.
 *
 * Analog: vice-inspired typed tokens (R08) compile to IR; 7110.65 heading
 * readback (R01). Trainer delta: SHORTEST from DAL123 heading 100 to 270 is
 * right (T01-04 downwind fixture); 090 would be a 180° LEFT tie. Not NAS STARS.
 */

import { expect, test } from "vitest";
import {
  SIM_DT_S,
  SessionLog,
  TURN_RATE_DEG_PER_S,
  acceptInboundHandoff,
  shortestDeltaDeg,
  stepWorld,
  type Aircraft,
  type World,
} from "@core";
import { handleRadioText } from "@pilot";
import { assertScenario, createWorldFromScenario, loadKdem } from "@scenario";
import kdemDownwindJson from "../../testdata/scenarios/kdem-downwind.json";

/** Ticket: `for (i in 0..39) stepWorld` = 2.0 sim seconds at 20 Hz. */
const STEPS_FOR_2S = 40;

function spawnDownwindWorld(): World {
  return createWorldFromScenario(assertScenario(kdemDownwindJson));
}

function requireTarget(world: World): Aircraft {
  const ac = world.aircraft[0];
  if (!ac) {
    throw new Error("KDEM spawn must include at least one aircraft");
  }
  return ac;
}

async function issueHeading270(world: World, callsign: string) {
  const log = new SessionLog();
  const result = await handleRadioText(world, `${callsign} H270`, log);
  return { result, log };
}

test("DAL123 H270 is accepted with assigned 270 SHORTEST and heading readback (AC2)", async () => {
  const world = spawnDownwindWorld();
  const dal = requireTarget(world);
  expect(Math.abs(dal.headingDeg - 100)).toBeLessThanOrEqual(1);

  const { result, log } = await issueHeading270(world, dal.callsign);

  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.turn).toBe("SHORTEST");
  expect(result.command?.instructions[0]).toEqual({
    type: "FLY_HEADING",
    headingDeg: 270,
    turn: "SHORTEST",
  });
  expect(result.readback).toContain("heading 270");

  const accepted = log.byType("command.accepted");
  expect(accepted.length).toBeGreaterThanOrEqual(1);
  expect(accepted.some((event) => event.command.instructions[0]?.type === "FLY_HEADING")).toBe(
    true,
  );
});

test("after 2.0 sim seconds heading is ~106 and closer to 270 by ~6 deg (AC3)", async () => {
  const world = spawnDownwindWorld();
  const dal = requireTarget(world);
  expect(Math.abs(dal.headingDeg - 100)).toBeLessThanOrEqual(1);

  const startHeading = dal.headingDeg;
  const startAltitudeFt = dal.altitudeFt;
  const startSpeedKt = dal.speedKt;
  const distBefore = Math.abs(shortestDeltaDeg(startHeading, 270));

  const { result } = await issueHeading270(world, dal.callsign);
  expect(result.accepted).toBe(true);

  for (let i = 0; i < STEPS_FOR_2S; i += 1) {
    stepWorld(world, SIM_DT_S);
  }

  expect(dal.headingDeg).toBeCloseTo(106, 0);
  const distAfter = Math.abs(shortestDeltaDeg(dal.headingDeg, 270));
  expect(distBefore - distAfter).toBeCloseTo(6, 0);

  expect(Number.isFinite(dal.xNm)).toBe(true);
  expect(Number.isFinite(dal.yNm)).toBe(true);
  expect(dal.altitudeFt).toBeCloseTo(startAltitudeFt, 1);
  expect(dal.speedKt).toBeCloseTo(startSpeedKt, 1);
});

test("one SIM_DT_S step after accept starts the turn by ~0.15 deg (AC4)", async () => {
  const world = spawnDownwindWorld();
  const dal = requireTarget(world);
  expect(Math.abs(dal.headingDeg - 100)).toBeLessThanOrEqual(1);

  const startHeading = dal.headingDeg;
  const { result } = await issueHeading270(world, dal.callsign);
  expect(result.accepted).toBe(true);
  expect(dal.headingDeg).toBe(startHeading);

  stepWorld(world, SIM_DT_S);

  const expectedDelta = TURN_RATE_DEG_PER_S * SIM_DT_S;
  expect(dal.headingDeg).not.toBe(startHeading);
  expect(dal.headingDeg).toBeCloseTo(startHeading + expectedDelta, 2);
});

test("T04-14 — DAL123 H270 on the default STAR pack cancels FMS after HO accept", async () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = requireTarget(world);
  expect(dal.intent.lateral?.type).toBe("PROCEDURE");
  expect(dal.intent.vertical?.type).toBe("VIA_STAR");

  expect(acceptInboundHandoff(world, dal.id)).toBe(true);
  const { result } = await issueHeading270(world, dal.callsign);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
});
