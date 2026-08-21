import { expect, test } from "vitest";
import { createAircraft, createWorld, makeTestAircraft, stepWorld } from "@core";
import {
  HISTORY_MAX_DOTS,
  HISTORY_SAMPLE_MS,
  createHistoryBuf,
  maybeSampleHistory,
} from "./history";

test("AC3 — after samples at 0, 5, 10, 15, 20, 25 s, length is 5 and oldest is t=5 s", () => {
  const buf = createHistoryBuf();
  const timesS = [0, 5, 10, 15, 20, 25];
  for (const tS of timesS) {
    maybeSampleHistory(buf, tS * 1000, tS, 0);
  }
  expect(HISTORY_SAMPLE_MS).toBe(5000);
  expect(HISTORY_MAX_DOTS).toBe(5);
  expect(buf.timesSimMs).toHaveLength(5);
  expect(buf.eastNm).toHaveLength(5);
  expect(buf.northNm).toHaveLength(5);
  expect(buf.timesSimMs[0]).toBe(5000);
  expect(buf.eastNm[0]).toBe(5);
  expect(buf.timesSimMs[4]).toBe(25_000);
  expect(buf.eastNm[4]).toBe(25);
  expect(buf.timesSimMs.includes(0)).toBe(false);
});

test("5 s gate does not sample every 50 ms physics step", () => {
  const buf = createHistoryBuf();
  let pushes = 0;
  for (let t = 0; t <= 25_000; t += 50) {
    if (maybeSampleHistory(buf, t, t / 1000, 0)) {
      pushes += 1;
    }
  }
  expect(pushes).toBe(6);
  expect(buf.timesSimMs).toEqual([5000, 10_000, 15_000, 20_000, 25_000]);
  expect(buf.eastNm[0]).toBe(5);
});

test("first call samples even when sim time is already past 0", () => {
  const buf = createHistoryBuf();
  expect(maybeSampleHistory(buf, 1200, 3, 4)).toBe(true);
  expect(maybeSampleHistory(buf, 6199, 5, 6)).toBe(false);
  expect(maybeSampleHistory(buf, 6200, 7, 8)).toBe(true);
  expect(buf.eastNm).toEqual([3, 7]);
  expect(buf.northNm).toEqual([4, 8]);
});

test("AC5 — stepWorld does not attach a history buffer to Aircraft", () => {
  const ac = makeTestAircraft({ id: "ac-hist" });
  const world = createWorld({ aircraft: [ac] });
  stepWorld(world, 1 / 20);
  expect(ac).not.toHaveProperty("history");
  expect(ac).not.toHaveProperty("timesSimMs");
  expect(ac).not.toHaveProperty("eastNm");
  const kinematics = createAircraft({
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
  });
  expect(Object.keys(kinematics).sort()).toEqual(
    [
      "altitudeFt",
      "callsign",
      "headingDeg",
      "id",
      "identUntilSimMs",
      "intent",
      "speedKt",
      "xNm",
      "yNm",
    ].sort(),
  );
});

test("history module comments say target-adjacent CRC history, not a trail name", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./history.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/CRC STARS HISTORY/);
  expect(src).toMatch(/5 s sim \/ 5 dots/);
  expect(src).toMatch(/\*\*history\*\*/);
  expect(src).toMatch(/history-blue/);
  expect(src).not.toMatch(/phosphor bloom/);
  expect(src.toLowerCase()).not.toMatch(/\bsprite\b/);
  expect(src.toLowerCase()).not.toMatch(/\bairplane\b/);
});
