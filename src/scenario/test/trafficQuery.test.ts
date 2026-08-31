import { expect, test } from "vitest";
import { DEFAULT_SPAWN_SEED, parseDepartureOptions, parseSpawnSeed } from "../trafficQuery";

test("T04-14 AC7 — parseSpawnSeed defaults to 1 and accepts integer 0", () => {
  expect(DEFAULT_SPAWN_SEED).toBe(1);
  expect(parseSpawnSeed("")).toBe(1);
  expect(parseSpawnSeed("?traffic=30")).toBe(1);
  expect(parseSpawnSeed("?seed=42")).toBe(42);
  expect(parseSpawnSeed("?seed=abc")).toBe(1);
  expect(parseSpawnSeed("?seed=0")).toBe(0);
  expect(parseSpawnSeed("seed=7")).toBe(7);
});

test("T04-14 AC7 — spawn seed parser source has no unseeded PRNG", () => {
  const sources = import.meta.glob("../trafficQuery.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  expect(String(Object.values(sources)[0])).not.toMatch(/\bMath\.random\b/);
});

test("T04-21 AC1 — parseDepartureOptions handles params and defaults", () => {
  // AC1: parseDepartureOptions("?departures=auto&dep_rate=12&seed=5") returns { enabled: true, ratePerHour: 12, seed: 5 }
  expect(parseDepartureOptions("?departures=auto&dep_rate=12&seed=5")).toEqual({
    enabled: true,
    ratePerHour: 12,
    seed: 5,
  });

  // Default without params enables departures by default
  expect(parseDepartureOptions("")).toEqual({ enabled: true });
  expect(parseDepartureOptions("?traffic=30")).toEqual({ enabled: true });

  // Explicit off / false
  expect(parseDepartureOptions("?departures=off")).toEqual({ enabled: false });
  expect(parseDepartureOptions("?departures=false")).toEqual({ enabled: false });
  expect(parseDepartureOptions("?departures=0")).toEqual({ enabled: false });

  // Explicit on / true / auto / 1
  expect(parseDepartureOptions("?departures=true")).toEqual({ enabled: true });
  expect(parseDepartureOptions("?departures=1")).toEqual({ enabled: true });
  expect(parseDepartureOptions("?departures=auto")).toEqual({ enabled: true });
  expect(parseDepartureOptions("?departures")).toEqual({ enabled: true });

  // Custom rate and count
  expect(parseDepartureOptions("?departures=auto&dep_rate=15&dep_count=8&seed=42")).toEqual({
    enabled: true,
    ratePerHour: 15,
    count: 8,
    seed: 42,
  });
});
