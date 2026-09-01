import { expect, test } from "vitest";
import { DEFAULT_INBOUND_SECTOR_ID, createWorld, handoffFor } from "@core";
import {
  STAR_SPAWN_STAGGER_NM,
  assertScenario,
  createWorldForSession,
  createWorldFromScenario,
  loadKdem,
  loadKdemIls27,
  parseSpawnSeed,
  parseTrafficCount,
  spawnArrivals,
} from "@scenario";
import { PALETTE, syncTrackDisplays } from "@scope";
import kdemJson from "../kdem.json";
import kdemDownwindJson from "../../../testdata/scenarios/kdem-downwind.json";

const SPAWN_X_NM = { min: 10, max: 22 };
const SPAWN_Y_NM = { min: 3, max: 12 };
const SPAWN_HEADING_DEG = { min: 80, max: 100 };
const SPAWN_ALT_FT = { min: 6000, max: 10000 };
const SPAWN_SPEED_KT = { min: 210, max: 250 };

function spawnAssignSources(): string {
  const sources = import.meta.glob("../{spawn,starSpawn,trafficQuery}.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  return Object.values(sources).map(String).join("\n");
}

test("default KDEM JSON lists 6 arrivals (AC1)", () => {
  expect(kdemJson.arrivals).toHaveLength(6);
  expect(kdemJson.spawnPolicy).toBe("star-inbound");
});

test("T04-14 AC1 — loadKdem seed 1 arms VIA on catalog STAR slots", () => {
  const scenario = loadKdem();
  expect(scenario.spawnPolicy).toBe("star-inbound");
  const world = createWorldFromScenario(scenario, 1);
  expect(world.aircraft).toHaveLength(6);

  const callsigns = world.aircraft.map((ac) => ac.callsign);
  expect(new Set(callsigns).size).toBe(6);
  for (const callsign of callsigns) {
    expect(callsign).toBe(callsign.toUpperCase());
    expect(callsign).toMatch(/^[A-Z]{3}\d+$/);
  }

  for (const ac of world.aircraft) {
    expect(ac.intent.lateral?.type).toBe("PROCEDURE");
    if (ac.intent.lateral?.type === "PROCEDURE") {
      expect(ac.intent.lateral.toFixIndex).toBe(0);
    }
    expect(ac.intent.vertical?.type).toBe("VIA_STAR");
    if (ac.intent.vertical?.type === "VIA_STAR") {
      expect(ac.intent.vertical.sense).toBe("DESCEND");
    }
    expect(ac.altitudeFt).toBeGreaterThanOrEqual(10000);
    expect(ac.speedKt).toBeLessThanOrEqual(250);
    expect(ac.aircraftType).toMatch(/^[A-Z0-9]{2,4}$/);
  }

  const src = spawnAssignSources();
  expect(src).not.toMatch(/"NEMAX"/);
  expect(src).not.toMatch(/"DEM1"/);
  expect(src).not.toMatch(/\bMath\.random\b/);
});

test("T04-14 AC2 — pairwise spacing and stacked STAR entries", () => {
  const scenario = loadKdem();
  const world = createWorldFromScenario(scenario, 1);
  expect(
    world.aircraft.filter((ac) => ac.intent.lateral?.type === "PROCEDURE").length,
  ).toBeGreaterThan(0);
  for (let i = 0; i < world.aircraft.length; i += 1) {
    for (let j = i + 1; j < world.aircraft.length; j += 1) {
      const dx = world.aircraft[i]!.xNm - world.aircraft[j]!.xNm;
      const dy = world.aircraft[i]!.yNm - world.aircraft[j]!.yNm;
      expect(Math.hypot(dx, dy)).toBeGreaterThan(0.3);
    }
  }

  const byGate = new Map<string, typeof world.aircraft>();
  for (const ac of world.aircraft) {
    if (ac.intent.lateral?.type !== "PROCEDURE") {
      continue;
    }
    const gateId = ac.intent.lateral.routeFixIds[0] ?? "";
    const key = `${ac.intent.lateral.starId}/${gateId}`;
    const list = byGate.get(key) ?? [];
    list.push(ac);
    byGate.set(key, list);
  }
  for (const [key, group] of byGate) {
    const gateId = key.split("/")[1]!;
    const gate = scenario.catalog.fixes.find((fix) => fix.id === gateId);
    expect(gate).toBeDefined();
    const dist = (ac: (typeof group)[number]) => Math.hypot(ac.xNm - gate!.xNm, ac.yNm - gate!.yNm);
    group.sort((a, b) => dist(a) - dist(b));
    for (let i = 1; i < group.length; i += 1) {
      expect(dist(group[i]!) - dist(group[i - 1]!)).toBeGreaterThanOrEqual(
        STAR_SPAWN_STAGGER_NM / 2,
      );
      expect(dist(group[i]!) - dist(group[i - 1]!)).toBeLessThanOrEqual(
        STAR_SPAWN_STAGGER_NM + STAR_SPAWN_STAGGER_NM / 2,
      );
      const heading = group[0]!.headingDeg;
      expect(Math.abs(group[i]!.headingDeg - heading)).toBeLessThan(1e-9);
    }
  }
});

test("T04-14 AC3 — same seed is bit-stable; seed 2 reshuffles remainder", () => {
  const a = createWorldFromScenario(loadKdem(), 1);
  const b = createWorldFromScenario(loadKdem(), 1);
  const snap = (world: typeof a) =>
    world.aircraft.map((ac) => ({
      callsign: ac.callsign,
      xNm: ac.xNm,
      yNm: ac.yNm,
      headingDeg: ac.headingDeg,
      starId:
        ac.intent.lateral && ac.intent.lateral.type === "PROCEDURE"
          ? ac.intent.lateral.starId
          : null,
      route0:
        ac.intent.lateral && ac.intent.lateral.type === "PROCEDURE"
          ? ac.intent.lateral.routeFixIds[0]
          : null,
    }));
  const sa = snap(a);
  const sb = snap(b);
  expect(sa).toHaveLength(6);
  for (let i = 0; i < sa.length; i += 1) {
    expect(sa[i]!.callsign).toBe(sb[i]!.callsign);
    expect(Math.abs(sa[i]!.xNm - sb[i]!.xNm)).toBeLessThan(1e-9);
    expect(Math.abs(sa[i]!.yNm - sb[i]!.yNm)).toBeLessThan(1e-9);
    expect(sa[i]!.starId).toBe(sb[i]!.starId);
    expect(sa[i]!.route0).toBe(sb[i]!.route0);
  }

  const seed2 = snap(createWorldFromScenario(loadKdem(), 2));
  expect(
    seed2
      .slice(2)
      .map((row) => row.route0)
      .join("|"),
  ).not.toBe(
    sa
      .slice(2)
      .map((row) => row.route0)
      .join("|"),
  );
});

test("T04-14 AC4 — createWorldForSession(kdem, 30) stays on the downwind arc", () => {
  const world = createWorldForSession(loadKdem(), 30, 1);
  expect(world.aircraft).toHaveLength(30);
  const callsigns = world.aircraft.map((ac) => ac.callsign);
  expect(new Set(callsigns).size).toBe(30);
  for (const ac of world.aircraft) {
    expect(ac.headingDeg).toBe(90);
    expect(ac.intent.lateral?.type === "PROCEDURE").toBe(false);
  }
});

test("T04-14 AC5 — ils27 authored pack ignores trafficCount and seed", () => {
  const world = createWorldForSession(loadKdemIls27(), 30, 99);
  expect(world.aircraft).toHaveLength(2);
  const first = world.aircraft[0]!;
  const second = world.aircraft[1]!;
  expect(first.intent.lateral).toMatchObject({ type: "PROCEDURE", starId: "DEM1", toFixIndex: 0 });
  expect(first.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
  expect(first.yNm).toBeGreaterThan(12);
  expect(second.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
  expect(second.yNm).toBe(-12);
  expect(second.xNm).toBe(17);
});

test("T04-14 AC6 — testdata downwind fixture keeps the T01-04 box", () => {
  const scenario = assertScenario(kdemDownwindJson);
  expect(scenario.spawnPolicy).toBe("authored");
  const world = createWorldFromScenario(scenario);

  expect(world.aircraft).toHaveLength(6);

  const callsigns = world.aircraft.map((ac) => ac.callsign);
  expect(new Set(callsigns).size).toBe(callsigns.length);
  for (const callsign of callsigns) {
    expect(callsign).toBe(callsign.toUpperCase());
    expect(callsign).toMatch(/^[A-Z]{3}\d+$/);
  }

  for (const ac of world.aircraft) {
    expect(ac.xNm).toBeGreaterThan(0);
    expect(ac.xNm).toBeGreaterThanOrEqual(SPAWN_X_NM.min);
    expect(ac.xNm).toBeLessThanOrEqual(SPAWN_X_NM.max);
    expect(ac.yNm).toBeGreaterThanOrEqual(SPAWN_Y_NM.min);
    expect(ac.yNm).toBeLessThanOrEqual(SPAWN_Y_NM.max);
    expect(ac.headingDeg).toBeGreaterThanOrEqual(SPAWN_HEADING_DEG.min);
    expect(ac.headingDeg).toBeLessThanOrEqual(SPAWN_HEADING_DEG.max);
    expect(ac.altitudeFt).toBeGreaterThanOrEqual(SPAWN_ALT_FT.min);
    expect(ac.altitudeFt).toBeLessThanOrEqual(SPAWN_ALT_FT.max);
    expect(ac.altitudeFt % 100).toBe(0);
    expect(ac.speedKt).toBeGreaterThanOrEqual(SPAWN_SPEED_KT.min);
    expect(ac.speedKt).toBeLessThanOrEqual(SPAWN_SPEED_KT.max);

    expect(ac.intent.assignedHeadingDeg).toBe(ac.headingDeg);
    expect(ac.intent.assignedAltitudeFt).toBe(ac.altitudeFt);
    expect(ac.intent.assignedSpeedKt).toBe(ac.speedKt);
    expect(ac.intent.turn).toBe("SHORTEST");
    expect(ac.aircraftType).toMatch(/^[A-Z0-9]{2,4}$/);
  }
});

test("loader rejects a fixture with 3 aircraft (AC7)", () => {
  const three = { ...kdemJson, arrivals: kdemJson.arrivals.slice(0, 3) };
  expect(() => assertScenario(three)).toThrow(/arrivals must have 4-8/);
});

test("loader rejects a fixture with callsign key on arrival (AC7)", () => {
  const withCallsign = {
    ...kdemJson,
    arrivals: kdemJson.arrivals.map((arrival, index) =>
      index === 0 ? { ...arrival, callsign: "DAL123" } : arrival,
    ),
  };
  expect(() => assertScenario(withCallsign)).toThrow(/must not include callsign/);
});

test("loader rejects a fixture with callsign key on departure", () => {
  const withDepCallsign = {
    ...kdemJson,
    departureConfig: {
      policy: "authored",
      departures: [
        {
          callsign: "DAL123",
          sidId: "BAY1",
          transitionId: "NORMA",
          assignedAltitudeFt: 10000,
        },
      ],
    },
  };
  expect(() => assertScenario(withDepCallsign)).toThrow(/must not include callsign/);
});

test("omitted spawnPolicy is authored so ils27 stays bit-stable", () => {
  expect(loadKdemIls27().spawnPolicy).toBe("authored");
  expect(assertScenario({ ...kdemJson, spawnPolicy: undefined }).spawnPolicy).toBe("authored");
});

test("T02-12 AC1/AC5 — spawnArrivals(world, 30) spreads unique tracks on a downwind arc", () => {
  const world = createWorld();
  spawnArrivals(world, 30);
  expect(world.aircraft).toHaveLength(30);
  const callsigns = world.aircraft.map((ac) => ac.callsign);
  expect(new Set(callsigns).size).toBe(30);
  for (const callsign of callsigns) {
    expect(callsign).toBe(callsign.toUpperCase());
  }

  const xs = world.aircraft.map((ac) => ac.xNm);
  const ys = world.aircraft.map((ac) => ac.yNm);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(8);
  expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(4);
  for (let i = 0; i < world.aircraft.length; i += 1) {
    for (let j = i + 1; j < world.aircraft.length; j += 1) {
      const dx = world.aircraft[i]!.xNm - world.aircraft[j]!.xNm;
      const dy = world.aircraft[i]!.yNm - world.aircraft[j]!.yNm;
      expect(Math.hypot(dx, dy), `${callsigns[i]} vs ${callsigns[j]}`).toBeGreaterThan(0.3);
    }
  }
  for (const ac of world.aircraft) {
    expect(ac.headingDeg).toBe(90);
    expect(ac.altitudeFt % 100).toBe(0);
    expect(ac.intent.assignedHeadingDeg).toBe(ac.headingDeg);
  }
});

test("T02-12 AC5 — createWorldForSession keeps 6 from JSON unless ?traffic= is set", () => {
  const scenario = loadKdem();
  expect(createWorldForSession(scenario, null).aircraft).toHaveLength(6);
  expect(createWorldForSession(scenario, parseTrafficCount("?traffic=30")).aircraft).toHaveLength(
    30,
  );
  expect(kdemJson.arrivals).toHaveLength(6);
  expect(parseTrafficCount("")).toBeNull();
  expect(parseTrafficCount("?debug=fps")).toBeNull();
  expect(parseTrafficCount("?traffic=30")).toBe(30);
  expect(parseTrafficCount("?debug=fps&traffic=30")).toBe(30);
  expect(parseTrafficCount("?traffic=0")).toBeNull();
  expect(parseTrafficCount("?traffic=abc")).toBeNull();
  expect(parseSpawnSeed("")).toBe(1);
  expect(parseSpawnSeed("?traffic=30")).toBe(1);
});

test("T04-16 AC1 — default STAR pack spawns inbound HO from C, unowned green FDB", () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  expect(world.aircraft).toHaveLength(6);
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  for (const ac of world.aircraft) {
    expect(handoffFor(world, ac.id)).toEqual({
      kind: "inbound",
      fromSectorId: DEFAULT_INBOUND_SECTOR_ID,
    });
    expect(tracks.get(ac.id)!.ownership).toBe("unowned");
  }
  expect(PALETTE.owned).toBe("#FFFFFF");
});

test("T04-16 AC5 — ?traffic=30 downwind replacement has handoff none", () => {
  const world = createWorldForSession(loadKdem(), 30, 1);
  expect(world.aircraft).toHaveLength(30);
  for (const ac of world.aircraft) {
    expect(handoffFor(world, ac.id)).toEqual({ kind: "none" });
  }
  expect(world.sessionLog?.byType("handoff.inbound.offered") ?? []).toHaveLength(0);
});

test("T04-16 AC4/AC6 — authored ils27 is none; STAR inbound emits one offered each", () => {
  const authored = createWorldFromScenario(loadKdemIls27());
  expect(authored.aircraft).toHaveLength(2);
  for (const ac of authored.aircraft) {
    expect(handoffFor(authored, ac.id)).toEqual({ kind: "none" });
  }
  expect(authored.sessionLog?.byType("handoff.inbound.offered") ?? []).toHaveLength(0);

  const inbound = createWorldFromScenario(loadKdem(), 1);
  const offered = inbound.sessionLog?.byType("handoff.inbound.offered") ?? [];
  expect(offered).toHaveLength(6);
  expect(new Set(offered.map((event) => event.callsign))).toEqual(
    new Set(inbound.aircraft.map((ac) => ac.callsign)),
  );
  expect(offered.every((event) => event.fromSectorId === "C")).toBe(true);
});

test("src/core does not import scenario JSON", () => {
  const coreSources = import.meta.glob("../../core/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  for (const [path, src] of Object.entries(coreSources)) {
    expect(String(src), path).not.toMatch(/kdem\.json/);
    expect(String(src), path).not.toMatch(/from\s+["']@scenario["']/);
  }
});

test("T04-29 downwind spawn offsets relative to active runway", () => {
  const kdemEast = {
    ...loadKdem(),
    activeRunwayId: "09",
  };
  const worldEast = createWorldForSession(kdemEast, 10, 1);
  const kdemWest = loadKdem(); // activeRunwayId: "27"
  const worldWest = createWorldForSession(kdemWest, 10, 1);

  expect(worldEast.aircraft).toHaveLength(10);
  expect(worldWest.aircraft).toHaveLength(10);

  for (let i = 0; i < 10; i += 1) {
    const acEast = worldEast.aircraft[i]!;
    const acWest = worldWest.aircraft[i]!;

    // RW09 downwind heading is 270 deg (reciprocal of 090)
    expect(acEast.headingDeg).toBe(270);
    // RW27 downwind heading is 090 deg (reciprocal of 270)
    expect(acWest.headingDeg).toBe(90);

    // RW09 threshold x is -1.645 vs RW27 threshold x at 0
    expect(acEast.xNm - acWest.xNm).toBeCloseTo(-1.645, 4);
    expect(acEast.yNm).toBeCloseTo(acWest.yNm, 4);
  }
});
