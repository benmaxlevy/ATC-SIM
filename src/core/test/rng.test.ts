import { expect, test } from "vitest";
import { mulberry32 } from "../rng";

test("mulberry32 is deterministic and stays in [0, 1)", () => {
  const a = mulberry32(1);
  const b = mulberry32(1);
  const sampleA = [a(), a(), a(), a()];
  const sampleB = [b(), b(), b(), b()];
  expect(sampleA).toEqual(sampleB);
  for (const x of sampleA) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
  }
});

test("seed 0 is legal and differs from seed 1", () => {
  expect(mulberry32(0)()).not.toBe(mulberry32(1)());
});

test("rng source has no unseeded PRNG call", () => {
  const sources = import.meta.glob("../rng.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  expect(String(Object.values(sources)[0])).not.toMatch(/\bMath\.random\b/);
});
