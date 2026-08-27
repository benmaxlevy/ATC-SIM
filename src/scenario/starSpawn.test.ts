import { expect, test } from "vitest";
import { courseDeg, distanceNm } from "@core";
import {
  STAR_SPAWN_GATE_OFFSET_NM,
  STAR_SPAWN_STAGGER_NM,
  assignStarRoutes,
  listStarSlots,
  loadCatalog,
  outermostStarFix,
  starInboundPose,
  starRouteFixIds,
} from "@scenario";
import type { NavFix, ProcedureCatalog, StarProcedure } from "./procedures/types";

const kdem = loadCatalog("kdem");

/** Mirrors testdata/catalogs/two-star-spawn.json (inline so tsc need not resolve testdata). */
const extraStar: StarProcedure = {
  id: "TST1",
  name: "TEST ONE",
  transitions: [
    {
      id: "E",
      name: "EAST",
      legs: [
        {
          fixId: "OUTER",
          altConstraint: { type: "AT_OR_ABOVE", altitudeFt: 10000 },
          speedConstraint: { type: "AT_OR_BELOW", speedKt: 250 },
        },
        {
          fixId: "INNER",
          altConstraint: { type: "AT_OR_ABOVE", altitudeFt: 8000 },
          speedConstraint: { type: "AT_OR_BELOW", speedKt: 230 },
        },
      ],
    },
  ],
  common: [],
  termination: "VECTORS",
};

const extraFixes: NavFix[] = [
  { id: "OUTER", kind: "WAYPOINT", xNm: 30, yNm: 0 },
  { id: "INNER", kind: "WAYPOINT", xNm: 20, yNm: 0 },
];

function twoStarCatalog(): ProcedureCatalog {
  return {
    ...kdem,
    stars: [...kdem.stars, extraStar],
    fixes: [...kdem.fixes, ...extraFixes],
  };
}

function helperSource(): string {
  const sources = import.meta.glob("./starSpawn.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  return String(Object.values(sources)[0]);
}

test("AC1 — outermostStarFix(DEM1, N) is transition N legs[0] with matching xy", () => {
  const star = kdem.stars.find((item) => item.id === "DEM1");
  expect(star).toBeDefined();
  const north = star!.transitions.find((item) => item.id === "N");
  expect(north?.legs[0]).toBeDefined();
  const expectedId = north!.legs[0]!.fixId;
  const gate = outermostStarFix(kdem, "DEM1", "N");
  expect(gate.fixId).toBe(expectedId);
  const fix = kdem.fixes.find((item) => item.id === expectedId);
  expect(fix).toBeDefined();
  expect(Math.abs(gate.xNm - fix!.xNm)).toBeLessThan(1e-9);
  expect(Math.abs(gate.yNm - fix!.yNm)).toBeLessThan(1e-9);
});

test("AC1 — production helper source has no NEMAX/SEMAX", () => {
  const src = helperSource();
  expect(src).not.toMatch(/NEMAX/);
  expect(src).not.toMatch(/SEMAX/);
});

test("AC2 — DEM1 S gate is transition S legs[0], not MERGE and not FI27", () => {
  const star = kdem.stars.find((item) => item.id === "DEM1");
  const south = star!.transitions.find((item) => item.id === "S");
  const expectedId = south!.legs[0]!.fixId;
  const gate = outermostStarFix(kdem, "DEM1", "S");
  expect(gate.fixId).toBe(expectedId);
  expect(gate.fixId).not.toBe("MERGE");
  expect(gate.fixId).not.toBe("FI27");
  const ils = kdem.approaches.find((item) => item.fafFixId);
  if (ils?.fafFixId) {
    expect(gate.fixId).not.toBe(ils.fafFixId);
  }
});

test("AC3 — starInboundPose(DEM1, N, 0.25) sits on the inbound extension", () => {
  const gate = outermostStarFix(kdem, "DEM1", "N");
  const route = starRouteFixIds(kdem, "DEM1", "N");
  expect(route[1]).toBeDefined();
  const next = kdem.fixes.find((item) => item.id === route[1]);
  expect(next).toBeDefined();
  const pose = starInboundPose(kdem, "DEM1", "N", STAR_SPAWN_GATE_OFFSET_NM);
  expect(Math.abs(distanceNm(pose, gate) - 0.25)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(pose.headingDeg - courseDeg(gate, next!))).toBeLessThanOrEqual(0.1);
  expect(pose.altitudeFt).toBe(11000);
  expect(pose.speedKt).toBe(250);
  expect(pose.toFixIndex).toBe(0);
  expect(pose.routeFixIds[0]).toBe(gate.fixId);
  expect(pose.gateFixId).toBe(gate.fixId);
});

test("AC4 — testdata TST1/E gate is OUTER and heading is 270", () => {
  const catalog = twoStarCatalog();
  const gate = outermostStarFix(catalog, "TST1", "E");
  expect(gate.fixId).toBe("OUTER");
  expect(gate.xNm).toBe(30);
  expect(gate.yNm).toBe(0);
  const pose = starInboundPose(catalog, "TST1", "E", STAR_SPAWN_GATE_OFFSET_NM);
  const inner = catalog.fixes.find((item) => item.id === "INNER")!;
  expect(pose.headingDeg).toBeCloseTo(courseDeg(gate, inner), 5);
  expect(pose.headingDeg).toBeCloseTo(270, 5);
  expect(Math.abs(distanceNm(pose, gate) - 0.25)).toBeLessThanOrEqual(0.01);
});

test("AC4 — starRouteFixIds resolves all DEM1 transitions (N, S, WN, WS)", () => {
  expect(starRouteFixIds(kdem, "DEM1", "N")).toEqual(["NEMAX", "NELBO", "NJOIN", "MERGE"]);
  expect(starRouteFixIds(kdem, "DEM1", "S")).toEqual(["SEMAX", "SELBO", "SJOIN", "MERGE"]);
  expect(starRouteFixIds(kdem, "DEM1", "WN")).toEqual(["WNMAX", "WNLBO", "WNJOIN", "WMERG"]);
  expect(starRouteFixIds(kdem, "DEM1", "WS")).toEqual(["WSMAX", "WSLBO", "WSJOIN", "WMERG"]);
});

test("AC5 — listStarSlots walks catalog array order", () => {
  expect(listStarSlots(kdem)).toEqual([
    { starId: "DEM1", transitionId: "N" },
    { starId: "DEM1", transitionId: "S" },
    { starId: "DEM1", transitionId: "WN" },
    { starId: "DEM1", transitionId: "WS" },
  ]);
  expect(listStarSlots(twoStarCatalog())).toEqual([
    { starId: "DEM1", transitionId: "N" },
    { starId: "DEM1", transitionId: "S" },
    { starId: "DEM1", transitionId: "WN" },
    { starId: "DEM1", transitionId: "WS" },
    { starId: "TST1", transitionId: "E" },
  ]);
});

test("AC6 — unknown STAR/transition/empty legs/missing next throw without World", () => {
  expect(() => outermostStarFix(kdem, "NOPE", "N")).toThrow(/Unknown STAR/);
  expect(() => outermostStarFix(kdem, "DEM1", "Z")).toThrow(/Unknown transition/);

  const emptyLegs = structuredClone(kdem);
  emptyLegs.stars[0]!.transitions[0]!.legs = [];
  expect(() => outermostStarFix(emptyLegs, "DEM1", "N")).toThrow(/Empty transition legs/);

  const noNext = structuredClone(kdem);
  noNext.stars[0]!.transitions[0]!.legs = [noNext.stars[0]!.transitions[0]!.legs[0]!];
  noNext.stars[0]!.common = [];
  expect(() => starInboundPose(noNext, "DEM1", "N", 0.25)).toThrow(/no next fix/);
});

test("AC7/AC8 — helper is catalog-only and cites 7110.65/AIM analog", () => {
  const src = helperSource();
  expect(src).not.toMatch(/createWorld/);
  expect(src).not.toMatch(/from ["']@parse["']/);
  expect(src).not.toMatch(/from ["']@pilot["']/);
  expect(src).not.toMatch(/from ["']@scope["']/);
  expect(src).toMatch(/7110\.65/);
  expect(src).toMatch(/AIM/);
  expect(src).not.toMatch(/\bMath\.random\b/);
  expect(src).not.toMatch(/NEMAX/);
  expect(src).not.toMatch(/SEMAX/);
  expect(src).toMatch(/Trainer delta/);
});

test("T04-14 AC8 — three-slot catalog count=3 is seeded and catalog-backed", () => {
  const catalog = twoStarCatalog();
  const assigned = assignStarRoutes({ catalog, count: 3, seed: 1 });
  expect(assigned).toHaveLength(3);
  expect(
    assigned.every((row) =>
      listStarSlots(catalog).some(
        (slot) => slot.starId === row.starId && slot.transitionId === row.transitionId,
      ),
    ),
  ).toBe(true);
  expect(assignStarRoutes({ catalog, count: 3, seed: 1 })).toEqual(assigned);
});

test("T04-14 seed=1 n=6 snapshot: seeded slots and stagger avoid mirrored pairs", () => {
  const assigned = assignStarRoutes({ catalog: kdem, count: 6, seed: 1 });
  expect(assigned).toHaveLength(6);
  expect(assigned[0]!.pose.toFixIndex).toBe(0);
  expect(assigned[0]!.pose.altitudeFt).toBe(11000);
  expect(assigned[0]!.pose.speedKt).toBe(250);
  expect(new Set(assigned.slice(0, 3).map((row) => `${row.starId}/${row.transitionId}`)).size).toBe(
    1,
  );

  const two = assignStarRoutes({ catalog: kdem, count: 2, seed: 1 });
  expect(two[0]!.starId).toBe(two[1]!.starId);
  expect(two[0]!.transitionId).toBe(two[1]!.transitionId);
  expect(two[1]!.stackIndex).toBe(1);

  const again = assignStarRoutes({ catalog: kdem, count: 6, seed: 1 });
  expect(
    assigned.map((row) => ({
      starId: row.starId,
      transitionId: row.transitionId,
      stackIndex: row.stackIndex,
      xNm: row.pose.xNm,
      yNm: row.pose.yNm,
    })),
  ).toEqual(
    again.map((row) => ({
      starId: row.starId,
      transitionId: row.transitionId,
      stackIndex: row.stackIndex,
      xNm: row.pose.xNm,
      yNm: row.pose.yNm,
    })),
  );

  const seed2 = assignStarRoutes({ catalog: kdem, count: 6, seed: 2 });
  const key = (row: (typeof assigned)[number]) =>
    `${row.starId}/${row.transitionId}/${row.stackIndex}/${row.pose.xNm}/${row.pose.yNm}`;
  expect(assigned.map(key).join("|")).not.toBe(seed2.map(key).join("|"));

  const offsets = assigned.map((row) =>
    distanceNm(row.pose, outermostStarFix(kdem, row.starId, row.transitionId)),
  );
  expect(new Set(offsets).size).toBe(offsets.length);

  const bySlot = new Map<string, typeof assigned>();
  for (const row of assigned) {
    const id = `${row.starId}/${row.transitionId}`;
    const list = bySlot.get(id) ?? [];
    list.push(row);
    bySlot.set(id, list);
  }
  for (const group of bySlot.values()) {
    group.sort((a, b) => a.stackIndex - b.stackIndex);
    for (let i = 1; i < group.length; i += 1) {
      const prev = group[i - 1]!;
      const next = group[i]!;
      expect(next.stackIndex - prev.stackIndex).toBe(1);
      const dx = next.pose.xNm - prev.pose.xNm;
      const dy = next.pose.yNm - prev.pose.yNm;
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(STAR_SPAWN_STAGGER_NM / 2);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(
        STAR_SPAWN_STAGGER_NM + STAR_SPAWN_STAGGER_NM / 2,
      );
      expect(Math.abs(next.pose.headingDeg - prev.pose.headingDeg)).toBeLessThan(1e-9);
    }
  }

  for (let i = 0; i < assigned.length; i += 1) {
    for (let j = i + 1; j < assigned.length; j += 1) {
      const dx = assigned[i]!.pose.xNm - assigned[j]!.pose.xNm;
      const dy = assigned[i]!.pose.yNm - assigned[j]!.pose.yNm;
      expect(Math.hypot(dx, dy)).toBeGreaterThan(0.3);
    }
  }
});

test("T04-29 AC1 — In East Flow (activeRunwayId: '09'), listStarSlots and assignStarRoutes select only East Flow transitions (WN, WS)", () => {
  const eastSlots = listStarSlots(kdem, "09");
  expect(eastSlots).toEqual([
    { starId: "DEM1", transitionId: "WN" },
    { starId: "DEM1", transitionId: "WS" },
  ]);

  const assigned = assignStarRoutes({ catalog: kdem, count: 6, seed: 1, activeRunwayId: "09" });
  expect(assigned).toHaveLength(6);
  for (const row of assigned) {
    expect(["WN", "WS"]).toContain(row.transitionId);
    expect(row.starId).toBe("DEM1");
    // Verify feeding WMERG (all WN/WS routeFixIds terminate at WMERG)
    expect(row.pose.routeFixIds).toContain("WMERG");
    expect(row.pose.routeFixIds).not.toContain("MERGE");
  }
});

test("T04-29 AC2 — In West Flow (activeRunwayId: '27'), listStarSlots and assignStarRoutes select only West Flow transitions (N, S)", () => {
  const westSlots = listStarSlots(kdem, "27");
  expect(westSlots).toEqual([
    { starId: "DEM1", transitionId: "N" },
    { starId: "DEM1", transitionId: "S" },
  ]);

  const assigned = assignStarRoutes({ catalog: kdem, count: 6, seed: 1, activeRunwayId: "27" });
  expect(assigned).toHaveLength(6);
  for (const row of assigned) {
    expect(["N", "S"]).toContain(row.transitionId);
    expect(row.starId).toBe("DEM1");
    // Verify feeding MERGE (all N/S routeFixIds terminate at MERGE)
    expect(row.pose.routeFixIds).toContain("MERGE");
    expect(row.pose.routeFixIds).not.toContain("WMERG");
  }
});

test("T04-29 fallback — unconfigured/unknown runway falls back to all catalog slots", () => {
  const fallbackSlots = listStarSlots(kdem, "99");
  expect(fallbackSlots).toEqual(listStarSlots(kdem));
});

test("T04-29 geometric flow fallback — untagged transitions filter by heading alignment", () => {
  // Catalog with runwayId stripped from transitions
  const untaggedCatalog: ProcedureCatalog = structuredClone(kdem);
  for (const star of untaggedCatalog.stars) {
    for (const transition of star.transitions) {
      delete transition.runwayId;
      delete transition.runways;
    }
  }

  const westSlots = listStarSlots(untaggedCatalog, "27");
  expect(westSlots).toEqual([
    { starId: "DEM1", transitionId: "N" },
    { starId: "DEM1", transitionId: "S" },
  ]);

  const eastSlots = listStarSlots(untaggedCatalog, "09");
  expect(eastSlots).toEqual([
    { starId: "DEM1", transitionId: "WN" },
    { starId: "DEM1", transitionId: "WS" },
  ]);
});
