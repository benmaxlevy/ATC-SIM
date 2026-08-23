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

test("AC5 — listStarSlots walks catalog array order", () => {
  expect(listStarSlots(kdem)).toEqual([
    { starId: "DEM1", transitionId: "N" },
    { starId: "DEM1", transitionId: "S" },
  ]);
  expect(listStarSlots(twoStarCatalog())).toEqual([
    { starId: "DEM1", transitionId: "N" },
    { starId: "DEM1", transitionId: "S" },
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

test("T04-14 AC8 — three-slot catalog count=3 uses each slot once", () => {
  const catalog = twoStarCatalog();
  const assigned = assignStarRoutes({ catalog, count: 3, seed: 1 });
  expect(assigned.map((row) => ({ starId: row.starId, transitionId: row.transitionId }))).toEqual(
    listStarSlots(catalog),
  );
  expect(assigned.every((row) => row.stackIndex === 0)).toBe(true);
});

test("T04-14 seed=1 n=6 snapshot: prefix cover then remainder mix", () => {
  const assigned = assignStarRoutes({ catalog: kdem, count: 6, seed: 1 });
  expect(assigned).toHaveLength(6);
  expect(assigned[0]).toMatchObject({ starId: "DEM1", transitionId: "N", stackIndex: 0 });
  expect(assigned[1]).toMatchObject({ starId: "DEM1", transitionId: "S", stackIndex: 0 });
  expect(assigned[0]!.pose.toFixIndex).toBe(0);
  expect(assigned[0]!.pose.altitudeFt).toBe(11000);
  expect(assigned[0]!.pose.speedKt).toBe(250);

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
    `${row.starId}/${row.transitionId}/${row.stackIndex}`;
  expect(assigned.slice(2).map(key).join("|")).not.toBe(seed2.slice(2).map(key).join("|"));

  const bySlot = new Map<string, typeof assigned>();
  for (const row of assigned) {
    const id = `${row.starId}/${row.transitionId}`;
    const list = bySlot.get(id) ?? [];
    list.push(row);
    bySlot.set(id, list);
  }
  expect([...bySlot.keys()].some((id) => id.endsWith("/S"))).toBe(true);
  for (const group of bySlot.values()) {
    group.sort((a, b) => a.stackIndex - b.stackIndex);
    for (let i = 1; i < group.length; i += 1) {
      const prev = group[i - 1]!;
      const next = group[i]!;
      expect(next.stackIndex - prev.stackIndex).toBe(1);
      const dx = next.pose.xNm - prev.pose.xNm;
      const dy = next.pose.yNm - prev.pose.yNm;
      expect(Math.hypot(dx, dy)).toBeCloseTo(STAR_SPAWN_STAGGER_NM, 2);
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
