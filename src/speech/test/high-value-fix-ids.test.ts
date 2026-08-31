import { expect, test } from "vitest";
import { MAX_STT_FIX_PRIOR, highValueFixIds } from "../high-value-fix-ids";

function fileOrderIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `ZZ${String(i).padStart(2, "0")}`);
}

test("empty catalog yields no STT fix prior", () => {
  expect(highValueFixIds(undefined)).toEqual([]);
  expect(highValueFixIds(null)).toEqual([]);
  expect(highValueFixIds({})).toEqual([]);
});

test("collects STAR/SID/approach refs, unique, sorted by id, not file order", () => {
  const ids = highValueFixIds({
    stars: [
      {
        transitions: [{ legs: [{ fixId: "zeta" }, { fixId: "alpha" }] }],
        common: [{ fixId: "midfx" }],
      },
    ],
    sids: [
      {
        common: [{ fixId: "alpha" }],
        runwayTransitions: [{ legs: [{ fixId: "sidfx" }] }],
        enrouteTransitions: [
          {
            legs: [{ fixId: "enrtx" }],
            runwayTransitions: [{ legs: [{ fixId: "sidrw" }] }],
          },
        ],
      },
    ],
    approaches: [
      {
        locNavaidId: "locaa",
        gsNavaidId: "gsid",
        fafFixId: "fafxx",
        thresholdFixId: "rwxx",
        missed: { directFixId: "missx" },
      },
    ],
  });
  expect(ids).toEqual([
    "ALPHA",
    "ENRTX",
    "FAFXX",
    "GSID",
    "LOCAA",
    "MIDFX",
    "MISSX",
    "RWXX",
    "SIDFX",
    "SIDRW",
    "ZETA",
  ]);
});

test("unreferenced navaids/fixes file-order ids do not appear", () => {
  const dump = fileOrderIds(80);
  const catalog = {
    stars: [{ common: [{ fixId: "bravo" }, { fixId: "alpha" }] }],
    sids: [],
    approaches: [],
    navaids: dump.map((id) => ({ id })),
    fixes: dump.map((id) => ({ id })),
  };
  const ids = highValueFixIds(catalog);
  expect(ids).toEqual(["ALPHA", "BRAVO"]);
  expect(ids).not.toContain("ZZ00");
  expect(ids.join(",")).not.toBe(dump.slice(0, 64).join(","));
});

test("caps at 16 after sort, extra referenced ids dropped", () => {
  const legs = Array.from({ length: 20 }, (_, i) => ({
    fixId: `M${String.fromCharCode(90 - i)}${String(i).padStart(2, "0")}`,
  }));
  const ids = highValueFixIds({
    stars: [{ common: legs }],
  });
  expect(ids).toHaveLength(MAX_STT_FIX_PRIOR);
  expect(ids).toEqual([...ids].sort());
  const allSorted = legs.map((leg) => leg.fixId.toUpperCase()).sort();
  expect(ids).toEqual(allSorted.slice(0, 16));
  expect(ids).not.toEqual(allSorted);
});
