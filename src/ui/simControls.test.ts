import { expect, expectTypeOf, test } from "vitest";
import { SessionLog, advanceWorld, createAccumulator, createAircraft, createWorld } from "@core";
import {
  PLAY_HINT,
  applySimControlKey,
  formatSimHud,
  formatSimTimeMmSs,
  setPaused,
  setSimRate,
} from "./simControls";

function sample() {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
}

test("setPaused and setSimRate match 1 | 2 and boolean signatures", () => {
  expectTypeOf(setPaused).parameter(1).toEqualTypeOf<boolean>();
  expectTypeOf(setSimRate).parameter(1).toEqualTypeOf<1 | 2>();
});

test("setPaused / setSimRate mutate only paused and simRate (AC1, AC3, AC6)", () => {
  const ac = sample();
  const intentBefore = { ...ac.intent };
  const world = createWorld({ aircraft: [ac] });
  const log = new SessionLog();

  setPaused(world, true);
  setSimRate(world, 2);

  expect(world.paused).toBe(true);
  expect(world.simRate).toBe(2);
  expect(ac.intent).toEqual(intentBefore);
  expect(ac.headingDeg).toBe(100);
  expect(ac.xNm).toBe(10);
  expect(ac.yNm).toBe(5);
  expect(log.all()).toHaveLength(0);

  setPaused(world, false);
  setSimRate(world, 1);
  expect(world.paused).toBe(false);
  expect(world.simRate).toBe(1);
  expect(ac.intent).toEqual(intentBefore);
  expect(log.all()).toHaveLength(0);
});

test("PLAY_HINT is the playable-slice one-liner (T01-14)", () => {
  expect(PLAY_HINT).toBe("type DAL123 H270 or click then H270");
});

test("formatSimHud shows PAUSE or 1x / 2x plus mm:ss", () => {
  const world = createWorld({ simTimeMs: 125_000, simRate: 2 });
  expect(formatSimTimeMmSs(125_000)).toBe("02:05");
  expect(formatSimHud(world)).toBe("2x 02:05");
  setSimRate(world, 1);
  expect(formatSimHud(world)).toBe("1x 02:05");
  setPaused(world, true);
  expect(formatSimHud(world)).toBe("PAUSE 02:05");
});

test("Space and 1/2 are ignored while the command line is focused (AC5)", () => {
  const world = createWorld();
  expect(applySimControlKey(world, { key: " ", commandLineFocused: true })).toBe(false);
  expect(applySimControlKey(world, { key: "1", commandLineFocused: true })).toBe(false);
  expect(applySimControlKey(world, { key: "2", commandLineFocused: true })).toBe(false);
  expect(applySimControlKey(world, { key: "p", commandLineFocused: true })).toBe(false);
  expect(applySimControlKey(world, { key: "D", commandLineFocused: true })).toBe(false);
  expect(world.paused).toBe(false);
  expect(world.simRate).toBe(1);
});

test("Space pauses only when the command line is not focused", () => {
  const world = createWorld();
  expect(applySimControlKey(world, { key: " ", commandLineFocused: false })).toBe(true);
  expect(world.paused).toBe(true);
  expect(applySimControlKey(world, { key: " ", commandLineFocused: false })).toBe(true);
  expect(world.paused).toBe(false);
});

test("Pause key toggles even if the command line is focused", () => {
  const world = createWorld();
  expect(applySimControlKey(world, { key: "Pause", commandLineFocused: true })).toBe(true);
  expect(world.paused).toBe(true);
  expect(applySimControlKey(world, { key: "Pause", commandLineFocused: true })).toBe(true);
  expect(world.paused).toBe(false);
});

test("1 and 2 set simRate only when the command line is not focused", () => {
  const world = createWorld();
  expect(applySimControlKey(world, { key: "2", commandLineFocused: false })).toBe(true);
  expect(world.simRate).toBe(2);
  expect(world.paused).toBe(false);
  expect(applySimControlKey(world, { key: "1", commandLineFocused: false })).toBe(true);
  expect(world.simRate).toBe(1);
});

test("P does not pause so it cannot steal a command-line letter", () => {
  const world = createWorld();
  expect(applySimControlKey(world, { key: "p", commandLineFocused: false })).toBe(false);
  expect(applySimControlKey(world, { key: "P", commandLineFocused: false })).toBe(false);
  expect(world.paused).toBe(false);
});

test("unpause keeps accumulator remainder so motion does not teleport (AC2)", () => {
  const ac = sample();
  const world = createWorld({ aircraft: [ac] });
  const acc = createAccumulator();
  acc.remainderS = 0.04;
  setPaused(world, true);
  advanceWorld(world, 1, acc);
  expect(acc.remainderS).toBe(0.04);
  expect(ac.xNm).toBe(10);
  expect(ac.yNm).toBe(5);
  setPaused(world, false);
  advanceWorld(world, 0.01, acc);
  expect(world.simTimeMs).toBeCloseTo(50, 0);
  expect(Math.abs(ac.xNm - 10)).toBeLessThan(0.02);
  expect(Math.abs(ac.yNm - 5)).toBeLessThan(0.02);
});

test("simControls source does not touch intent or the radio path", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./simControls.ts"];
  expect(src).toBeDefined();
  expect(src).not.toMatch(/handleRadioText/);
  expect(src).not.toMatch(/submitCommand/);
  expect(src).not.toMatch(/from\s+["']@pilot["']/);
  expect(src).not.toMatch(/from\s+["']@speech["']/);
  expect(src).not.toMatch(/\.intent\b/);
  expect(src).not.toMatch(/\bstepWorld\b/);
  expect(src).not.toMatch(/simRate:\s*4/);
  expect(src).not.toMatch(/simRate:\s*8/);
});

test("shell mounts Pause, 1×, and 2× buttons that call session helpers", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = sources["./shell.tsx"]!;
  const controls = sources["./sim-controls.tsx"]!;
  expect(shell).toMatch(/<SimControls/);
  expect(controls).toMatch(/>\s*Pause\s*</);
  expect(controls).toMatch(/>\s*1×\s*</);
  expect(controls).toMatch(/>\s*2×\s*</);
  expect(controls).toMatch(/setPaused\(world,\s*!world\.paused\)/);
  expect(controls).toMatch(/setSimRate\(world,\s*1\)/);
  expect(controls).toMatch(/setSimRate\(world,\s*2\)/);
  expect(controls).not.toMatch(/PLAY_HINT/);
  expect(controls).not.toMatch(/submitCommand/);
  expect(controls).not.toMatch(/handleRadioText/);
  expect(controls).not.toMatch(/from\s+["']@scope["']/);
  expect(controls).not.toMatch(/4×/);
  expect(controls).not.toMatch(/8×/);
});
