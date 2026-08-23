import { expect, test } from "vitest";
import { DEFAULT_SPAWN_SEED, parseSpawnSeed } from "./trafficQuery";

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
  const sources = import.meta.glob("./trafficQuery.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  expect(String(Object.values(sources)[0])).not.toMatch(/\bMath\.random\b/);
});
