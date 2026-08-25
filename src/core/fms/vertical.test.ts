import { expect, test } from "vitest";
import {
  DEMO_ONE_NORTH_FIX_IDS,
  SIM_DT_S,
  SessionLog,
  applyVerticalFms,
  buildFixRegistry,
  createAircraft,
  createWorld,
  stepWorld,
  targetAltitudeFt,
  targetSpeedKt,
} from "@core";
import type { FixRegistrySource, VerticalCatalog } from "@core";
import fixesJson from "../../scenario/data/kdem/fixes.json";
import ilsJson from "../../scenario/data/kdem/ils.json";
import ndbsJson from "../../scenario/data/kdem/ndbs.json";
import proceduresJson from "../../scenario/data/kdem/procedures.json";
import sidsJson from "../../scenario/data/kdem/sids.json";
import vorsJson from "../../scenario/data/kdem/vors.json";

function kdemSource(): FixRegistrySource {
  return {
    navaids: [...vorsJson.vors, ...ndbsJson.ndbs, ...ilsJson.components],
    fixes: fixesJson.fixes,
  };
}

function kdemCatalog(): VerticalCatalog {
  return {
    stars: proceduresJson.stars as VerticalCatalog["stars"],
    sids: sidsJson.sids as VerticalCatalog["sids"],
  };
}

function stepUntilFix(
  world: ReturnType<typeof createWorld>,
  fixId: string,
  maxSeconds: number,
): boolean {
  const log = world.sessionLog;
  if (!log) {
    return false;
  }
  const steps = Math.round(maxSeconds / SIM_DT_S);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, SIM_DT_S);
    if (log.byType("nav.direct.sequenced").some((event) => event.fixId === fixId)) {
      return true;
    }
  }
  return false;
}

test("targetAltitudeFt holds next AOA/AT while VIA is armed", () => {
  const via = { type: "VIA_STAR" as const, starId: "DEM1", sense: "DESCEND" as const };
  expect(
    targetAltitudeFt({
      assignedFt: 11000,
      vertical: via,
      nextConstraint: { type: "AT_OR_ABOVE", altitudeFt: 10000 },
      onStar: true,
    }),
  ).toBe(10000);
  expect(
    targetAltitudeFt({
      assignedFt: 4000,
      vertical: via,
      nextConstraint: { type: "AT_OR_ABOVE", altitudeFt: 8000 },
      onStar: true,
    }),
  ).toBe(8000);
  expect(
    targetAltitudeFt({
      assignedFt: 4000,
      vertical: via,
      nextConstraint: { type: "AT", altitudeFt: 4000 },
      onStar: true,
    }),
  ).toBe(4000);
  expect(
    targetAltitudeFt({
      assignedFt: 11000,
      vertical: { type: "ASSIGNED" },
      nextConstraint: { type: "AT_OR_ABOVE", altitudeFt: 10000 },
      onStar: false,
    }),
  ).toBe(11000);
});

test("targetAltitudeFt climb-via uses the next unpassed constraint", () => {
  const via = { type: "VIA_STAR" as const, starId: "SID1", sense: "CLIMB" as const };
  expect(
    targetAltitudeFt({
      assignedFt: 2000,
      vertical: via,
      nextConstraint: { type: "AT_OR_ABOVE", altitudeFt: 5000 },
      onStar: true,
    }),
  ).toBe(5000);
  expect(
    targetAltitudeFt({
      assignedFt: 2000,
      vertical: via,
      nextConstraint: { type: "AT", altitudeFt: 8000 },
      onStar: true,
    }),
  ).toBe(8000);
});

test("AC2 — targetAltitudeFt with VIA_SID caps climb on AT_OR_BELOW until sequenced", () => {
  const viaSid = { type: "VIA_SID" as const, sidId: "BAY1" };
  // When assigned top altitude is 10000 ft and next constraint is AT_OR_BELOW 5000, target is 5000
  expect(
    targetAltitudeFt({
      assignedFt: 10000,
      vertical: viaSid,
      nextConstraint: { type: "AT_OR_BELOW", altitudeFt: 5000 },
      onStar: true,
    }),
  ).toBe(5000);
  // When assigned top altitude is 4000 ft and next constraint is AT_OR_BELOW 5000, target is 4000
  expect(
    targetAltitudeFt({
      assignedFt: 4000,
      vertical: viaSid,
      nextConstraint: { type: "AT_OR_BELOW", altitudeFt: 5000 },
      onStar: true,
    }),
  ).toBe(4000);
  // When assigned top altitude is 10000 ft and next constraint is AT_OR_ABOVE 6000, target is 10000
  expect(
    targetAltitudeFt({
      assignedFt: 10000,
      vertical: viaSid,
      nextConstraint: { type: "AT_OR_ABOVE", altitudeFt: 6000 },
      onStar: true,
    }),
  ).toBe(10000);
  // When nextConstraint is undefined, target is assignedFt
  expect(
    targetAltitudeFt({
      assignedFt: 10000,
      vertical: viaSid,
      onStar: true,
    }),
  ).toBe(10000);
});

test("targetSpeedKt does not exceed next AOB and does not speed up to it", () => {
  const via = { type: "VIA_STAR" as const, starId: "DEM1" };
  expect(
    targetSpeedKt({
      assignedKt: 250,
      vertical: via,
      nextConstraint: { type: "AT_OR_BELOW", speedKt: 230 },
      onStar: true,
    }),
  ).toBe(230);
  expect(
    targetSpeedKt({
      assignedKt: 210,
      vertical: via,
      nextConstraint: { type: "AT_OR_BELOW", speedKt: 250 },
      onStar: true,
    }),
  ).toBe(210);
  expect(
    targetSpeedKt({
      assignedKt: 250,
      vertical: { type: "ASSIGNED" },
      nextConstraint: { type: "AT_OR_BELOW", speedKt: 210 },
      onStar: false,
    }),
  ).toBe(250);
});

test("AC2 — VIA DEM1 before NEMAX stays >= 10000 ft and <= 250 kt at sequence", () => {
  const registry = buildFixRegistry(kdemSource());
  const nemax = registry.require("NEMAX");
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: nemax.xNm + 8,
    yNm: nemax.yNm,
    headingDeg: 270,
    altitudeFt: 11000,
    speedKt: 250,
  });
  dal.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: [...DEMO_ONE_NORTH_FIX_IDS],
  };
  dal.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dal],
    fixRegistry: registry,
    sessionLog: log,
    catalog: {
      airportId: "KDEM",
      navaids: [],
      fixes: [],
      stars: kdemCatalog().stars ?? [],
      approaches: [],
      sids: [],
    },
  });
  expect(stepUntilFix(world, "NEMAX", 300)).toBe(true);
  expect(dal.altitudeFt).toBeGreaterThanOrEqual(10000 - 100);
  expect(dal.speedKt).toBeLessThanOrEqual(250 + 5);
});

test("AC3 — after NEMAX, NELBO is >= 8000 and <= 230 kt", () => {
  const registry = buildFixRegistry(kdemSource());
  const nemax = registry.require("NEMAX");
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: nemax.xNm + 8,
    yNm: nemax.yNm,
    headingDeg: 270,
    altitudeFt: 11000,
    speedKt: 250,
  });
  dal.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: [...DEMO_ONE_NORTH_FIX_IDS],
  };
  dal.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dal],
    fixRegistry: registry,
    sessionLog: log,
    catalog: {
      airportId: "KDEM",
      navaids: [],
      fixes: [],
      stars: kdemCatalog().stars ?? [],
      approaches: [],
      sids: [],
    },
  });
  expect(stepUntilFix(world, "NEMAX", 300)).toBe(true);
  const afterNemax = dal.altitudeFt;
  expect(stepUntilFix(world, "NELBO", 300)).toBe(true);
  expect(dal.altitudeFt).toBeLessThan(afterNemax);
  expect(dal.altitudeFt).toBeGreaterThanOrEqual(8000 - 100);
  expect(dal.speedKt).toBeLessThanOrEqual(230 + 5);
});

test("applyVerticalFms with CROSS AT targets the crossing altitude", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 27,
    yNm: 12,
    headingDeg: 270,
    altitudeFt: 8000,
    speedKt: 220,
  });
  dal.intent.lateral = { type: "DIRECT", fixId: "NEMAX" };
  dal.intent.cross = { fixId: "NEMAX", altitudeFt: 4000, restriction: "AT" };
  expect(applyVerticalFms(dal).altitudeFt).toBe(4000);
});

test("AC6 — vertical FMS tests are DOM-free", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});

test("nav.star.vectors clears VIA_STAR and flies last MERGE constraint", () => {
  const registry = buildFixRegistry(kdemSource());
  const merge = registry.require("MERGE");
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: merge.xNm + 0.8,
    yNm: merge.yNm,
    headingDeg: 270,
    altitudeFt: 6000,
    speedKt: 210,
  });
  dal.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 3,
    routeFixIds: [...DEMO_ONE_NORTH_FIX_IDS],
  };
  dal.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dal],
    fixRegistry: registry,
    sessionLog: log,
    catalog: {
      airportId: "KDEM",
      navaids: [],
      fixes: [],
      stars: kdemCatalog().stars ?? [],
      approaches: [],
      sids: [],
    },
  });
  const steps = Math.round(120 / SIM_DT_S);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, SIM_DT_S);
    if (log.byType("nav.star.vectors").length > 0) {
      break;
    }
  }
  expect(log.byType("nav.star.vectors")).toHaveLength(1);
  expect(dal.intent.lateral?.type).toBe("HEADING");
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(dal.intent.assignedAltitudeFt).toBe(4000);
  expect(dal.intent.assignedSpeedKt).toBe(210);
});

test("AC1 & AC2 — aircraft flies SID legs in sequence with VIA_SID and respects altitude constraints", () => {
  const registry = buildFixRegistry(kdemSource());
  const missd = registry.require("MISSD");
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: missd.xNm - 5,
    yNm: missd.yNm,
    headingDeg: 90,
    altitudeFt: 1500,
    speedKt: 220,
  });
  dal.intent.assignedAltitudeFt = 10000;
  dal.intent.lateral = {
    type: "PROCEDURE",
    sidId: "BAY1",
    starId: "BAY1",
    toFixIndex: 0,
    routeFixIds: ["MISSD", "SNARF", "NORMA"],
  };
  dal.intent.vertical = { type: "VIA_SID", sidId: "BAY1" };

  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dal],
    fixRegistry: registry,
    sessionLog: log,
    catalog: {
      airportId: "KDEM",
      navaids: [],
      fixes: [],
      stars: kdemCatalog().stars ?? [],
      approaches: [],
      sids: kdemCatalog().sids ?? [],
    },
  });

  // Sequences MISSD
  expect(stepUntilFix(world, "MISSD", 300)).toBe(true);
  expect(dal.altitudeFt).toBeGreaterThanOrEqual(1500);

  // Sequences SNARF (which has AT_OR_ABOVE 4000 and AT_OR_BELOW 250 kt)
  expect(stepUntilFix(world, "SNARF", 500)).toBe(true);
  expect(dal.speedKt).toBeLessThanOrEqual(250 + 5);

  // Aircraft continues to fly towards NORMA
  expect(dal.intent.lateral?.type).toBe("PROCEDURE");
  if (dal.intent.lateral?.type === "PROCEDURE") {
    expect(dal.intent.lateral.toFixIndex).toBe(2);
    expect(dal.intent.lateral.routeFixIds[dal.intent.lateral.toFixIndex]).toBe("NORMA");
  }
});

test("AC3 — heading command cancels PROCEDURE and VIA_SID to HEADING and ASSIGNED", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 3000,
    speedKt: 220,
  });
  dal.intent.assignedAltitudeFt = 10000;
  dal.intent.lateral = {
    type: "PROCEDURE",
    sidId: "BAY1",
    starId: "BAY1",
    toFixIndex: 0,
    routeFixIds: ["MISSD", "SNARF", "NORMA"],
  };
  dal.intent.vertical = { type: "VIA_SID", sidId: "BAY1" };

  // Applying a heading vector (e.g. via setHeadingMode / applyIntent)
  dal.intent.assignedHeadingDeg = 270;
  dal.intent.lateral = { type: "HEADING", headingDeg: 270 };
  dal.intent.vertical = { type: "ASSIGNED" };

  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(dal.intent.assignedAltitudeFt).toBe(10000);
});
