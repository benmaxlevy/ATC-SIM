import { expect, test } from "vitest";
import {
  DEMO_ONE_NORTH_FIX_IDS,
  SIM_DT_S,
  SessionLog,
  advanceStarLeg,
  buildFixRegistry,
  createAircraft,
  createWorld,
  distanceNm,
  locDeviation,
  stepWorld,
} from "@core";
import type { FixRegistrySource } from "@core";
import fixesJson from "../../../scenario/data/kdem/fixes.json";
import ilsJson from "../../../scenario/data/kdem/ils.json";
import ndbsJson from "../../../scenario/data/kdem/ndbs.json";
import vorsJson from "../../../scenario/data/kdem/vors.json";

function kdemSource(): FixRegistrySource {
  return {
    navaids: [...vorsJson.vors, ...ndbsJson.ndbs, ...ilsJson.components],
    fixes: fixesJson.fixes,
  };
}

function lateralType(ac: ReturnType<typeof createAircraft>): string | undefined {
  return ac.intent.lateral?.type;
}

function stepSimSeconds(world: ReturnType<typeof createWorld>, seconds: number): void {
  const n = Math.round(seconds / SIM_DT_S);
  for (let i = 0; i < n; i += 1) {
    stepWorld(world, SIM_DT_S);
  }
}

test("AC2 — DIRECT NEMAX closes distance until sequenced once", () => {
  const registry = buildFixRegistry(kdemSource());
  const nemax = registry.require("NEMAX");
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: nemax.xNm + 10,
    yNm: nemax.yNm,
    headingDeg: 270,
    altitudeFt: 10000,
    speedKt: 220,
  });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal], fixRegistry: registry, sessionLog: log });
  dal.intent.lateral = { type: "DIRECT", fixId: "NEMAX" };

  let prev = distanceNm(dal, nemax);
  let sequencedAt = -1;
  const steps = Math.round(300 / SIM_DT_S);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, SIM_DT_S);
    const dist = distanceNm(dal, nemax);
    const sequenced = log.byType("nav.direct.sequenced");
    if (sequenced.length > 0 && sequencedAt < 0) {
      sequencedAt = i;
      expect(sequenced).toHaveLength(1);
      expect(sequenced[0]?.fixId).toBe("NEMAX");
      expect(dal.intent.lateral?.type).toBe("HEADING");
      break;
    }
    expect(dist).toBeLessThanOrEqual(prev + 1e-9);
    prev = dist;
  }
  expect(sequencedAt).toBeGreaterThanOrEqual(0);
  stepSimSeconds(world, 30);
  expect(log.byType("nav.direct.sequenced")).toHaveLength(1);
});

test("AC4 fly-through — H090 after DIRECT does not keep closing NEMAX", () => {
  const registry = buildFixRegistry(kdemSource());
  const nemax = registry.require("NEMAX");
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: nemax.xNm + 10,
    yNm: nemax.yNm,
    headingDeg: 270,
    altitudeFt: 10000,
    speedKt: 220,
  });
  const world = createWorld({ aircraft: [dal], fixRegistry: registry });
  dal.intent.lateral = { type: "DIRECT", fixId: "NEMAX" };
  dal.intent.assignedHeadingDeg = 90;
  dal.intent.turn = "SHORTEST";
  dal.intent.lateral = { type: "HEADING", headingDeg: 90 };
  const startX = dal.xNm;
  const before = distanceNm(dal, nemax);
  stepSimSeconds(world, 2);
  expect(dal.headingDeg).toBeCloseTo(264, 0);
  stepSimSeconds(world, 88);
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
  expect(dal.headingDeg).toBeCloseTo(90, 0);
  expect(dal.xNm).toBeGreaterThan(startX);
  expect(distanceNm(dal, nemax)).toBeGreaterThan(before);
});

test("AC5 — DEMO ONE north PROCEDURE fly-bys then vectors", () => {
  const registry = buildFixRegistry(kdemSource());
  const nemax = registry.require("NEMAX");
  const dal = createAircraft({
    id: "ac-fake",
    callsign: "DAL123",
    xNm: nemax.xNm + 1.2,
    yNm: nemax.yNm,
    headingDeg: 270,
    altitudeFt: 10000,
    speedKt: 220,
  });
  const log = new SessionLog();
  dal.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: [...DEMO_ONE_NORTH_FIX_IDS],
  };
  const steps = Math.round(480 / SIM_DT_S);
  for (let i = 0; i < steps; i += 1) {
    advanceStarLeg(dal, SIM_DT_S, {
      registry,
      routeFixIds: DEMO_ONE_NORTH_FIX_IDS,
      starId: "DEM1",
      log,
      simTimeMs: i * SIM_DT_S * 1000,
    });
    if (lateralType(dal) === "HEADING") {
      break;
    }
  }
  expect(log.byType("nav.direct.sequenced").map((e) => e.fixId)).toEqual([
    "NEMAX",
    "NELBO",
    "NJOIN",
    "MERGE",
  ]);
  expect(log.byType("nav.star.vectors")).toHaveLength(1);
  expect(log.byType("nav.star.vectors")[0]?.starId).toBe("DEM1");
  expect(lateralType(dal)).toBe("HEADING");
});

test("AC6 — FMS tests are DOM-free", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});

function axisPosition(courseDeg: number, alongNm: number, crossNm: number) {
  const rad = (courseDeg * Math.PI) / 180;
  return {
    xNm: -alongNm * Math.sin(rad) + crossNm * Math.cos(rad),
    yNm: -alongNm * Math.cos(rad) - crossNm * Math.sin(rad),
  };
}

test("AC1/2/3/5 — rate-one lead turn captures reciprocal localizers without crossing", () => {
  for (const courseDeg of [0, 180]) {
    for (const speedKt of [180, 250, 300]) {
      for (const interceptDeg of [20, 30]) {
        for (const side of [-1, 1]) {
          const crossNm = side * 6 * Math.tan((interceptDeg * Math.PI) / 180);
          const position = axisPosition(courseDeg, 12, crossNm);
          const dal = createAircraft({
            id: `ac-${courseDeg}-${speedKt}-${interceptDeg}-${side}`,
            callsign: "DAL123",
            ...position,
            headingDeg: courseDeg - side * interceptDeg,
            altitudeFt: 4000,
            speedKt,
          });
          dal.intent.lateral = { type: "INTERCEPT_LOC", approachId: "TEST" };
          const log = new SessionLog();
          const world = createWorld({
            aircraft: [dal],
            sessionLog: log,
            catalog: {
              airportId: "TEST",
              navaids: [],
              fixes: [{ id: "RWY", xNm: 0, yNm: 0 }],
              stars: [],
              sids: [],
              approaches: [{ id: "TEST", courseDeg, lengthNm: 18, thresholdFixId: "RWY" }],
            },
          });
          let previousHeading = dal.headingDeg;
          let crossed = false;
          for (let i = 0; i < Math.round(360 / SIM_DT_S); i += 1) {
            stepWorld(world, SIM_DT_S);
            const deviation = locDeviation(
              { xNm: dal.xNm, yNm: dal.yNm },
              {
                approachId: "TEST",
                thresholdXNm: 0,
                thresholdYNm: 0,
                courseDeg,
                lengthNm: 18,
                beamHalfWidthDeg: 2.5,
                locFullScaleHalfWidthFtAtThreshold: 350,
              },
            );
            crossed ||= deviation.crossTrackNm * side < -1e-5;
            const headingStep = Math.abs(((dal.headingDeg - previousHeading + 540) % 360) - 180);
            expect(headingStep).toBeLessThanOrEqual(3 * SIM_DT_S + 1e-6);
            previousHeading = dal.headingDeg;
            if (deviation.alongTrackNm <= 3) break;
          }
          const finalDeviation = locDeviation(
            { xNm: dal.xNm, yNm: dal.yNm },
            {
              approachId: "TEST",
              thresholdXNm: 0,
              thresholdYNm: 0,
              courseDeg,
              lengthNm: 18,
              beamHalfWidthDeg: 2.5,
              locFullScaleHalfWidthFtAtThreshold: 350,
            },
          );
          expect(log.byType("nav.loc.captured")).toHaveLength(1);
          expect(dal.intent.lateral?.type).toBe("LOC");
          expect(crossed, `${courseDeg}/${speedKt}/${interceptDeg}/${side}`).toBe(false);
          expect(Math.abs(finalDeviation.crossTrackNm)).toBeLessThanOrEqual(0.05);
        }
      }
    }
  }
});
