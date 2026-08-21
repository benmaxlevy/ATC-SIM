import { expect, test } from "vitest";
import { UnknownFixError, buildFixRegistry } from "@core";
import type { FixRegistrySource, RegisteredFix } from "@core";
import fixesJson from "../../scenario/data/kdem/fixes.json";
import ilsJson from "../../scenario/data/kdem/ils.json";
import ndbsJson from "../../scenario/data/kdem/ndbs.json";
import vorsJson from "../../scenario/data/kdem/vors.json";

function kdemSource(): FixRegistrySource {
  return {
    navaids: [...vorsJson.vors, ...ndbsJson.ndbs, ...ilsJson.components],
    fixes: fixesJson.fixes,
  };
}

function fakeCatalog(partial?: Partial<FixRegistrySource>): FixRegistrySource {
  return {
    navaids: partial?.navaids ?? [{ id: "AAA", kind: "VOR", xNm: 1, yNm: 2 }],
    fixes: partial?.fixes ?? [{ id: "BBB", kind: "WAYPOINT", xNm: 3, yNm: 4 }],
  };
}

test("AC1 — KDEM get NEMAX / nemax is (17, 12)", () => {
  const registry = buildFixRegistry(kdemSource());
  const expected = { xNm: 17, yNm: 12 };
  expect(registry.get("NEMAX")).toMatchObject(expected);
  expect(registry.get("nemax")).toMatchObject(expected);
  expect(registry.get("  NeMax  ")).toMatchObject(expected);
});

test("AC1b — get DEM matches vors.json (0.4, 0.8)", () => {
  const registry = buildFixRegistry(kdemSource());
  const dem = registry.get("DEM");
  expect(dem).toMatchObject({ id: "DEM", xNm: 0.4, yNm: 0.8, kind: "VORDME" });
  expect(registry.get("dem")).toEqual(dem);
});

test("KDEM STAR / FAF / threshold / missed / navaid ids resolve", () => {
  const registry = buildFixRegistry(kdemSource());
  const expected: Record<string, Pick<RegisteredFix, "xNm" | "yNm">> = {
    MERGE: { xNm: 10, yNm: 0 },
    FI27: { xNm: 6, yNm: 0 },
    RW27: { xNm: 0, yNm: 0 },
    MISSD: { xNm: -8, yNm: 6 },
    DMO: { xNm: 6.0, yNm: 0.15 },
    IDEM: { xNm: -1.85, yNm: 0 },
  };
  for (const [id, pos] of Object.entries(expected)) {
    expect(registry.get(id), id).toMatchObject(pos);
    expect(registry.has(id.toLowerCase()), id).toBe(true);
  }
});

test("AC2 — unknown id is undefined and has() is false", () => {
  const registry = buildFixRegistry(kdemSource());
  expect(registry.get("NOPE")).toBeUndefined();
  expect(registry.has("NOPE")).toBe(false);
  expect(registry.get("ZZZZZ")).toBeUndefined();
  expect(registry.has("zzzzz")).toBe(false);
});

test("AC3 — require(unknown) throws unknown-fix and does not return origin", () => {
  const registry = buildFixRegistry(kdemSource());
  try {
    registry.require("NOPE");
    expect.fail("require should throw");
  } catch (err) {
    expect(err).toBeInstanceOf(UnknownFixError);
    const failure = err as UnknownFixError;
    expect(failure.code).toBe("unknown-fix");
    expect(failure.fixId).toBe("NOPE");
    expect(failure.message).toMatch(/NOPE/);
  }
  expect(() => registry.require("nope")).toThrow(UnknownFixError);
});

test("require(known) returns the same frozen fix as get", () => {
  const registry = buildFixRegistry(kdemSource());
  const got = registry.require("fi27");
  expect(got).toBe(registry.get("FI27"));
  expect(Object.isFrozen(got)).toBe(true);
});

test("does not register ARP / airport ICAO or navaid name phrase", () => {
  const registry = buildFixRegistry(kdemSource());
  expect(registry.has("KDEM")).toBe(false);
  expect(registry.get("KDEM")).toBeUndefined();
  expect(registry.has("DEMO")).toBe(false);
  expect(registry.get("")).toBeUndefined();
  expect(registry.has("   ")).toBe(false);
});

test("ids() is the navaid+fix namespace, uppercase, readonly", () => {
  const registry = buildFixRegistry(kdemSource());
  const ids = registry.ids();
  expect(ids).toContain("DEM");
  expect(ids).toContain("DMO");
  expect(ids).toContain("IDEM");
  expect(ids).toContain("NEMAX");
  expect(ids).toContain("MERGE");
  expect(ids).not.toContain("KDEM");
  expect(ids.every((id) => id === id.toUpperCase())).toBe(true);
  expect(Object.isFrozen(ids)).toBe(true);
  expect(ids).toBe(registry.ids());
});

test("duplicate id in a fake catalog fails closed", () => {
  expect(() =>
    buildFixRegistry(
      fakeCatalog({
        navaids: [{ id: "DEM", kind: "VOR", xNm: 0, yNm: 0 }],
        fixes: [{ id: "dem", kind: "WAYPOINT", xNm: 1, yNm: 1 }],
      }),
    ),
  ).toThrow(/duplicate id DEM/);
});

test("empty id in a fake catalog fails closed", () => {
  expect(() =>
    buildFixRegistry(
      fakeCatalog({
        navaids: [{ id: "  ", kind: "VOR", xNm: 0, yNm: 0 }],
        fixes: [],
      }),
    ),
  ).toThrow(/empty id/);
});
