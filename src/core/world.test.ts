import { expect, test } from "vitest";
import {
  createWorld,
  stepWorld,
  createAccumulator,
  advanceWorld,
  PHYSICS_HZ,
  SIM_DT_S,
  MAX_PHYSICS_STEPS_PER_FRAME,
} from "@core";

test("createWorld defaults simTimeMs, paused, and simRate (AC1)", () => {
  const world = createWorld();
  expect(world.simTimeMs).toBe(0);
  expect(world.paused).toBe(false);
  expect(world.simRate).toBe(1);
  expect(world.aircraft).toEqual([]);
  expect(world.selectedAircraftId).toBeNull();
});

test("createWorld merges partial overrides without sharing aircraft arrays", () => {
  const a = createWorld({ paused: true, simRate: 2, simTimeMs: 50 });
  const b = createWorld();
  expect(a.paused).toBe(true);
  expect(a.simRate).toBe(2);
  expect(a.simTimeMs).toBe(50);
  expect(b.paused).toBe(false);
  expect(a.aircraft).not.toBe(b.aircraft);
});

test("clock constants are the frozen 20 Hz step and 8-step cap", () => {
  expect(PHYSICS_HZ).toBe(20);
  expect(SIM_DT_S).toBe(1 / 20);
  expect(MAX_PHYSICS_STEPS_PER_FRAME).toBe(8);
});

test("twenty stepWorld calls at SIM_DT_S add 1000 ms of sim time (AC2)", () => {
  const world = createWorld();
  for (let i = 0; i < 20; i += 1) {
    stepWorld(world, SIM_DT_S);
  }
  expect(world.simTimeMs).toBeCloseTo(1000, 0);
});

test("stepWorld mutates in place and returns the same World", () => {
  const world = createWorld();
  const returned = stepWorld(world, SIM_DT_S);
  expect(returned).toBe(world);
  expect(world.simTimeMs).toBeCloseTo(50, 5);
});

test("stepWorld ignores non-finite dt instead of throwing", () => {
  const world = createWorld();
  expect(stepWorld(world, Number.NaN)).toBe(world);
  expect(stepWorld(world, Infinity)).toBe(world);
  expect(world.simTimeMs).toBe(0);
});

test("paused advanceWorld does not change simTimeMs and holds remainder (AC3)", () => {
  const world = createWorld({ paused: true });
  const acc = createAccumulator();
  acc.remainderS = 0.03;
  advanceWorld(world, 1, acc);
  expect(world.simTimeMs).toBe(0);
  expect(acc.remainderS).toBe(0.03);
});

test("sixty 1/60 s frames at 1x yield about 1000 ms of sim time (AC4)", () => {
  const world = createWorld();
  const acc = createAccumulator();
  for (let i = 0; i < 60; i += 1) {
    advanceWorld(world, 1 / 60, acc);
  }
  expect(world.simTimeMs).toBeCloseTo(1000, 0);
});

test("sixty 1/60 s frames at 2x yield about 2000 ms of sim time", () => {
  const world = createWorld({ simRate: 2 });
  const acc = createAccumulator();
  for (let i = 0; i < 60; i += 1) {
    advanceWorld(world, 1 / 60, acc);
  }
  expect(world.simTimeMs).toBeCloseTo(2000, 0);
});

test("a 1 s wall dump caps at 8 steps and holds remainder", () => {
  const world = createWorld();
  const acc = createAccumulator();
  advanceWorld(world, 1, acc);
  expect(world.simTimeMs).toBeCloseTo(MAX_PHYSICS_STEPS_PER_FRAME * 50, 0);
  expect(acc.remainderS).toBeCloseTo(1 - MAX_PHYSICS_STEPS_PER_FRAME * SIM_DT_S, 5);
});

test("core clock tests run without window, document, or rAF (AC5)", () => {
  expect(typeof globalThis.window).toBe("undefined");
  expect(typeof globalThis.document).toBe("undefined");
  expect(typeof globalThis.requestAnimationFrame).toBe("undefined");
});
