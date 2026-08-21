import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readdirSync, readFileSync, statSync } from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import { dirname, join } from "node:path";
// @ts-expect-error tsconfig has no @types/node
import { fileURLToPath } from "node:url";
import expectedCatalog from "../../testdata/cifp/frozen-subset.expected.json";
import { parseCifpSubset } from "./parse.ts";
import { catalogDctIds, type ProcedureCatalog } from "../../src/scenario/procedures/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
const fixturePath = join(repoRoot, "testdata/cifp/frozen-subset.cifp");
const badFixturePath = join(repoRoot, "testdata/cifp/frozen-subset.bad.cifp");

function readFixture(path: string): string {
  return readFileSync(path, "utf8");
}

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkTs(path, acc);
      continue;
    }
    if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      acc.push(path);
    }
  }
  return acc;
}

test("AC1 — frozen fixture parses offline and matches expected.json", () => {
  const fetchWas = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("CIFP import must not fetch");
  };
  try {
    const result = parseCifpSubset(readFixture(fixturePath));
    expect(result.catalog).toEqual(expectedCatalog);
  } finally {
    globalThis.fetch = fetchWas;
  }
});

test("AC2 — STAR constraints, ILS loc course, sids array, every fixId resolved", () => {
  const catalog = parseCifpSubset(readFixture(fixturePath)).catalog;
  expectTypeAirportId(catalog);

  const constrainedLegs = catalog.stars.flatMap((star) => [
    ...star.transitions.flatMap((transition) => transition.legs),
    ...star.common,
  ]);
  const altOk = constrainedLegs.filter(
    (leg) => leg.altConstraint?.type === "AT_OR_ABOVE" || leg.altConstraint?.type === "AT",
  );
  expect(altOk.length).toBeGreaterThanOrEqual(2);

  const ils = catalog.approaches.find((approach) => approach.type === "ILS");
  expect(ils).toBeDefined();
  expect(ils?.courseDeg).toBe(270);

  expect(Array.isArray(catalog.sids)).toBe(true);
  expect(catalog.sids).toEqual([]);

  const ids = catalogDctIds(catalog);
  for (const star of catalog.stars) {
    for (const transition of star.transitions) {
      for (const leg of transition.legs) {
        expect(ids.has(leg.fixId), leg.fixId).toBe(true);
      }
    }
    for (const leg of star.common) {
      expect(ids.has(leg.fixId), leg.fixId).toBe(true);
    }
  }
});

test("AC3 — unknown/garbage records are skipped and do not throw", () => {
  const result = parseCifpSubset(readFixture(fixturePath));
  expect(result.skipped.count).toBeGreaterThanOrEqual(1);
  expect(result.skipped.byType.ER).toBe(1);
  expect(result.skipped.byType.PD).toBe(1);
  expect(result.skipped.byType.GARBAGE).toBe(1);
  expect(result.catalog.airportId).toBe("KSYN");
});

test("dangling STAR fixId in a bad fixture fails convert", () => {
  expect(() => parseCifpSubset(readFixture(badFixturePath))).toThrow(/unknown id MERGE/);
});

test("AC5 — src does not import tools/cifp-import", () => {
  const srcRoot = join(repoRoot, "src");
  for (const file of walkTs(srcRoot)) {
    const text = readFileSync(file, "utf8");
    expect(text.includes("cifp-import") || text.includes("tools/cifp"), file).toBe(false);
  }
});

test("NEMAX projects within 0.05 NM of KDEM (17, 12)", () => {
  const catalog = parseCifpSubset(readFixture(fixturePath)).catalog;
  const nemax = catalog.fixes.find((fix) => fix.id === "NEMAX");
  expect(nemax).toBeDefined();
  expect(Math.abs((nemax?.xNm ?? NaN) - 17)).toBeLessThan(0.05);
  expect(Math.abs((nemax?.yNm ?? NaN) - 12)).toBeLessThan(0.05);
});

function expectTypeAirportId(catalog: ProcedureCatalog): void {
  expect(typeof catalog.airportId).toBe("string");
}
