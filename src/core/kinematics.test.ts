import { expect, test } from "vitest";
import {
  ACCEL_KT_PER_S,
  CLIMB_RATE_FT_PER_MIN,
  SIM_DT_S,
  TURN_RATE_DEG_PER_S,
  createWorld,
  makeTestAircraft,
  normalizeHeading,
  shortestDeltaDeg,
  stepAircraft,
  stepWorld,
  type Aircraft,
  type TurnDir,
  type World,
} from "@core";

function stepSimSeconds(world: World, seconds: number): void {
  const n = Math.round(seconds / SIM_DT_S);
  for (let i = 0; i < n; i += 1) {
    stepWorld(world, SIM_DT_S);
  }
}

function worldWith(ac: Aircraft): World {
  return createWorld({ aircraft: [ac] });
}

function assignHeading(ac: Aircraft, headingDeg: number, turn: TurnDir): void {
  ac.intent.assignedHeadingDeg = headingDeg;
  ac.intent.turn = turn;
}

test("frozen rates are rate-one turn, 1800 fpm, and 1 kt/s", () => {
  expect(TURN_RATE_DEG_PER_S).toBe(3);
  expect(CLIMB_RATE_FT_PER_MIN).toBe(1800);
  expect(ACCEL_KT_PER_S).toBe(1);
});

test("normalizeHeading wraps into [0, 360)", () => {
  expect(normalizeHeading(360)).toBe(0);
  expect(normalizeHeading(540)).toBe(180);
  expect(normalizeHeading(-90)).toBe(270);
  expect(normalizeHeading(0)).toBe(0);
});

test("shortestDeltaDeg is signed in (-180, 180] with + = right", () => {
  expect(shortestDeltaDeg(0, 90)).toBe(90);
  expect(shortestDeltaDeg(0, 270)).toBe(-90);
  expect(shortestDeltaDeg(0, 180)).toBe(180);
  expect(shortestDeltaDeg(180, 0)).toBe(180);
  expect(shortestDeltaDeg(10, 350)).toBe(-20);
  expect(shortestDeltaDeg(0, 0)).toBe(0);
});

test("AC1 level flight: eastbound 220 kt holds heading/alt/speed; x grows 220*10/3600 NM", () => {
  const ac = makeTestAircraft({
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
    xNm: 0,
    yNm: 0,
  });
  const world = worldWith(ac);
  stepSimSeconds(world, 10);
  expect(ac.headingDeg).toBe(90);
  expect(ac.altitudeFt).toBe(8000);
  expect(ac.speedKt).toBe(220);
  expect(ac.xNm).toBeCloseTo((220 * 10) / 3600, 3);
  expect(ac.yNm).toBeCloseTo(0, 3);
  expect(world.simTimeMs).toBeCloseTo(10_000, 0);
});

test("AC2 SHORTEST 000 to 090: 6° after 2 s, captured at 90 after 30 s", () => {
  const ac = makeTestAircraft({ headingDeg: 0 });
  assignHeading(ac, 90, "SHORTEST");
  const world = worldWith(ac);
  stepSimSeconds(world, 2);
  expect(ac.headingDeg).toBeCloseTo(6, 1);
  stepSimSeconds(world, 28);
  expect(ac.headingDeg).toBe(90);
  stepSimSeconds(world, 2);
  expect(ac.headingDeg).toBe(90);
});

test("AC3 LEFT vs RIGHT vs SHORTEST from 000 to 270", () => {
  const left = makeTestAircraft({ headingDeg: 0 });
  assignHeading(left, 270, "LEFT");
  stepSimSeconds(worldWith(left), 2);
  expect(left.headingDeg).toBeCloseTo(354, 1);

  const right = makeTestAircraft({ headingDeg: 0 });
  assignHeading(right, 270, "RIGHT");
  stepSimSeconds(worldWith(right), 2);
  expect(right.headingDeg).toBeCloseTo(6, 1);

  const shortest = makeTestAircraft({ headingDeg: 0 });
  assignHeading(shortest, 270, "SHORTEST");
  stepSimSeconds(worldWith(shortest), 2);
  expect(shortest.headingDeg).toBeCloseTo(354, 1);
});

test("AC4 SHORTEST 180° tie turns LEFT: 000 assigned 180 is 357 after 1 s", () => {
  const ac = makeTestAircraft({ headingDeg: 0 });
  assignHeading(ac, 180, "SHORTEST");
  stepSimSeconds(worldWith(ac), 1);
  expect(ac.headingDeg).toBeCloseTo(357, 1);
  expect(ac.headingDeg).not.toBeCloseTo(3, 1);
});

test("AC5 descend 8000 to 6000: 6200 after 60 s, then snaps and holds 6000", () => {
  const ac = makeTestAircraft({ altitudeFt: 8000, headingDeg: 90, speedKt: 220 });
  ac.intent.assignedAltitudeFt = 6000;
  const world = worldWith(ac);
  stepSimSeconds(world, 60);
  expect(ac.altitudeFt).toBeCloseTo(6200, 0);
  stepSimSeconds(world, 10);
  expect(ac.altitudeFt).toBe(6000);
  stepSimSeconds(world, 5);
  expect(ac.altitudeFt).toBe(6000);
});

test("AC6 speed 220 to 210: 215 after 5 s, 210 after 10 s and stays", () => {
  const ac = makeTestAircraft({ speedKt: 220, headingDeg: 90, altitudeFt: 8000 });
  ac.intent.assignedSpeedKt = 210;
  const world = worldWith(ac);
  stepSimSeconds(world, 5);
  expect(ac.speedKt).toBeCloseTo(215, 2);
  stepSimSeconds(world, 5);
  expect(ac.speedKt).toBe(210);
  stepSimSeconds(world, 2);
  expect(ac.speedKt).toBe(210);
});

test("northbound 180 kt gains 0.05 NM north in 1 sim second (post-heading, post-speed)", () => {
  const ac = makeTestAircraft({
    headingDeg: 0,
    speedKt: 180,
    xNm: 0,
    yNm: 0,
  });
  stepSimSeconds(worldWith(ac), 1);
  expect(ac.xNm).toBeCloseTo(0, 5);
  expect(ac.yNm).toBeCloseTo(0.05, 5);
});

test("LEFT from 000 to 090 takes the long way, not shortest", () => {
  const ac = makeTestAircraft({ headingDeg: 0 });
  assignHeading(ac, 90, "LEFT");
  stepAircraft(ac, 2);
  expect(ac.headingDeg).toBeCloseTo(354, 1);
});

test("speed clamps at 0 and does not go negative", () => {
  const ac = makeTestAircraft({ speedKt: 2 });
  ac.intent.assignedSpeedKt = -10;
  stepAircraft(ac, 5);
  expect(ac.speedKt).toBe(0);
});

test("IDENT flash expires after simTimeMs crosses identUntilSimMs (time bumped first)", () => {
  const ac = makeTestAircraft();
  ac.identUntilSimMs = 50;
  const world = worldWith(ac);
  stepWorld(world, SIM_DT_S);
  expect(world.simTimeMs).toBeCloseTo(50, 5);
  expect(ac.identUntilSimMs).toBe(0);
});

test("IDENT stays armed until sim time reaches the deadline", () => {
  const ac = makeTestAircraft();
  ac.identUntilSimMs = 100;
  const world = worldWith(ac);
  stepWorld(world, SIM_DT_S);
  expect(ac.identUntilSimMs).toBe(100);
  stepWorld(world, SIM_DT_S);
  expect(ac.identUntilSimMs).toBe(0);
});

test("kinematics tests run without window, document, or rAF (AC7)", () => {
  expect(typeof globalThis.window).toBe("undefined");
  expect(typeof globalThis.document).toBe("undefined");
  expect(typeof globalThis.requestAnimationFrame).toBe("undefined");
});
