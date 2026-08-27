import { expect, test } from "vitest";
import { makeTestAircraft } from "../aircraft";
import { DEG2RAD, normalizeHeadingDeg } from "../nav/geometry";
import atpaVolumesJson from "../../scenario/data/kdem/atpa-volumes.json";
import {
  ATPA_ALERT_S,
  ATPA_WARNING_S,
  alongCourseDistanceNm,
  atpaStatus,
  evaluateAtpa,
  pairClosureKt,
  requiredSeparationNm,
  type AtpaVolumeGeometry,
  type AtpaVolumeParams,
} from "./atpa";

function volumeById(id: string): AtpaVolumeParams {
  const volume = atpaVolumesJson.atpaVolumes.find((item) => item.id === id);
  if (volume === undefined) {
    throw new Error(`missing ATPA volume fixture ${id}`);
  }
  return volume;
}

const volume27 = volumeById("ATPA27");
const volume09 = volumeById("ATPA09");

const geom27: AtpaVolumeGeometry = { xNm: 0, yNm: 0, courseDeg: 270 };
const geom09: AtpaVolumeGeometry = { xNm: 0, yNm: 0, courseDeg: 90 };
const geometry = { ATPA27: geom27, ATPA09: geom09 };

function inboundPose(
  geometry: AtpaVolumeGeometry,
  alongNm: number,
  lateralNm: number,
  headingDeg: number,
  altitudeFt: number,
) {
  const rad = normalizeHeadingDeg(geometry.courseDeg + 180) * DEG2RAD;
  return {
    xNm: geometry.xNm + alongNm * Math.sin(rad) + lateralNm * Math.cos(rad),
    yNm: geometry.yNm + alongNm * Math.cos(rad) - lateralNm * Math.sin(rad),
    headingDeg,
    altitudeFt,
  };
}

function arrival(
  callsign: string,
  geom: AtpaVolumeGeometry,
  alongNm: number,
  extras: {
    speedKt?: number;
    headingDeg?: number;
    altitudeFt?: number;
    wakeCategory?: string;
    primaryOnly?: boolean;
    isPrimary?: boolean;
    transponder?: "primary" | "mode_c" | "mode_a" | "mode_s" | "none";
  } = {},
) {
  const pose = inboundPose(
    geom,
    alongNm,
    0,
    extras.headingDeg ?? geom.courseDeg,
    extras.altitudeFt ?? 3000,
  );
  return makeTestAircraft({
    id: `ac-${callsign.toLowerCase()}`,
    callsign,
    xNm: pose.xNm,
    yNm: pose.yNm,
    headingDeg: pose.headingDeg,
    altitudeFt: pose.altitudeFt,
    speedKt: extras.speedKt ?? 180,
    ...(extras.wakeCategory !== undefined ? { wakeCategory: extras.wakeCategory } : {}),
    ...(extras.primaryOnly !== undefined ? { primaryOnly: extras.primaryOnly } : {}),
    ...(extras.isPrimary !== undefined ? { isPrimary: extras.isPrimary } : {}),
    ...(extras.transponder !== undefined ? { transponder: extras.transponder } : {}),
  });
}

test("R07 horizons are 45 s warning and 24 s alert", () => {
  expect(ATPA_WARNING_S).toBe(45);
  expect(ATPA_ALERT_S).toBe(24);
});

test("T02-44 AC1 — two tracks 4 NM apart outside 10 NM: one pair, required from JSON, monitor", () => {
  const leader = arrival("AAL45", geom27, 11);
  const trailer = arrival("DAL123", geom27, 15);
  expect(alongCourseDistanceNm(geom27, leader.xNm, leader.yNm)).toBeGreaterThan(
    volume27.reducedWithinNm,
  );
  expect(alongCourseDistanceNm(geom27, trailer.xNm, trailer.yNm)).toBeGreaterThan(
    volume27.reducedWithinNm,
  );

  const pairs = evaluateAtpa([leader, trailer], [volume27], geometry);
  expect(pairs).toHaveLength(1);
  expect(pairs[0]).toMatchObject({
    trailingCallsign: "DAL123",
    leadingCallsign: "AAL45",
    volumeId: "ATPA27",
    requiredNm: volume27.basicSeparationNm,
    status: "monitor",
  });
  expect(pairs[0]!.distanceNm).toBeCloseTo(4, 5);
  expect(pairs[0]!.requiredNm).toBe(volume27.basicSeparationNm);
  expect(pairs[0]!.requiredNm).not.toBe(volume27.reducedSeparationNm);
});

test("T02-44 AC2 — same pair inside 10 NM uses volume.reducedSeparationNm, not a code literal", () => {
  const leader = arrival("AAL45", geom27, 5);
  const trailer = arrival("DAL123", geom27, 9);
  const pairs = evaluateAtpa([leader, trailer], [volume27], geometry);
  expect(pairs).toHaveLength(1);
  expect(pairs[0]!.requiredNm).toBe(volume27.reducedSeparationNm);
  expect(pairs[0]!.requiredNm).toBe(atpaVolumesJson.atpaVolumes[0]!.reducedSeparationNm);
  expect(requiredSeparationNm(9, 5, volume27)).toBe(volume27.reducedSeparationNm);
  expect(requiredSeparationNm(11, 5, volume27)).toBe(volume27.basicSeparationNm);
});

test("requiredSeparationNm follows whatever the volume row says", () => {
  const custom: AtpaVolumeParams = {
    ...volume27,
    basicSeparationNm: 4,
    reducedSeparationNm: 1.8,
    reducedWithinNm: 7,
  };
  expect(requiredSeparationNm(8, 8, custom)).toBe(custom.basicSeparationNm);
  expect(requiredSeparationNm(6, 5, custom)).toBe(custom.reducedSeparationNm);
});

test("T02-44 AC3 — closing in 40 s warns, 20 s alerts, already inside alerts, opening stays monitor", () => {
  const gapNm = 4 - volume27.basicSeparationNm;
  const warnKt = (gapNm / 40) * 3600;
  const alertKt = (gapNm / 20) * 3600;

  const warnLeader = arrival("AAL45", geom27, 11, { speedKt: 160 });
  const warnTrailer = arrival("DAL123", geom27, 15, { speedKt: 160 + warnKt });
  expect(pairClosureKt(warnTrailer, warnLeader)).toBeCloseTo(warnKt, 6);
  expect(evaluateAtpa([warnLeader, warnTrailer], [volume27], geometry)[0]?.status).toBe("warning");

  const alertLeader = arrival("AAL45", geom27, 11, { speedKt: 70 });
  const alertTrailer = arrival("DAL123", geom27, 15, { speedKt: 70 + alertKt });
  expect(pairClosureKt(alertTrailer, alertLeader)).toBeCloseTo(alertKt, 6);
  expect(evaluateAtpa([alertLeader, alertTrailer], [volume27], geometry)[0]?.status).toBe("alert");

  const insideLeader = arrival("AAL45", geom27, 11, { speedKt: 180 });
  const insideTrailer = arrival("DAL123", geom27, 13, { speedKt: 180 });
  expect(evaluateAtpa([insideLeader, insideTrailer], [volume27], geometry)[0]?.status).toBe(
    "alert",
  );

  const openLeader = arrival("AAL45", geom27, 11, { speedKt: 250 });
  const openTrailer = arrival("DAL123", geom27, 15, { speedKt: 180 });
  expect(pairClosureKt(openTrailer, openLeader)).toBeLessThan(0);
  expect(evaluateAtpa([openLeader, openTrailer], [volume27], geometry)[0]?.status).toBe("monitor");
});

test("atpaStatus: parallel or opening never warn; already inside still alerts", () => {
  expect(atpaStatus(4, volume27.basicSeparationNm, 0)).toBe("monitor");
  expect(atpaStatus(4, volume27.basicSeparationNm, -50)).toBe("monitor");
  expect(atpaStatus(2, volume27.basicSeparationNm, -50)).toBe("alert");
});

test("T02-44 AC4 — three tracks yield two pairs to the aircraft immediately ahead", () => {
  const front = arrival("AAL45", geom27, 5);
  const middle = arrival("DAL123", geom27, 9);
  const back = arrival("SWA88", geom27, 13);
  const pairs = evaluateAtpa([back, front, middle], [volume27], geometry);
  expect(pairs).toHaveLength(2);
  expect(pairs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        trailingCallsign: "DAL123",
        leadingCallsign: "AAL45",
        volumeId: "ATPA27",
      }),
      expect.objectContaining({
        trailingCallsign: "SWA88",
        leadingCallsign: "DAL123",
        volumeId: "ATPA27",
      }),
    ]),
  );
  expect(pairs.some((pair) => pair.trailingCallsign === "AAL45")).toBe(false);
  expect(pairs.some((pair) => pair.leadingCallsign === "SWA88")).toBe(false);
});

test("T02-44 AC4 — tracks in different volumes never pair", () => {
  const on27 = arrival("DAL123", geom27, 12);
  const on09 = arrival("AAL45", geom09, 12);
  const pairs = evaluateAtpa([on27, on09], [volume27, volume09], geometry);
  expect(pairs).toEqual([]);
});

test("T02-44 AC5 — requiredNm is identical for a heavy leader and a light leader", () => {
  const lightLeader = arrival("AAL45", geom27, 11, { wakeCategory: "L", speedKt: 180 });
  const heavyLeader = arrival("AAL45", geom27, 11, { wakeCategory: "H", speedKt: 180 });
  const trailer = arrival("DAL123", geom27, 15, { wakeCategory: "B", speedKt: 180 });
  const lightPairs = evaluateAtpa([lightLeader, trailer], [volume27], geometry);
  const heavyPairs = evaluateAtpa([heavyLeader, trailer], [volume27], geometry);
  expect(lightPairs[0]?.requiredNm).toBe(heavyPairs[0]?.requiredNm);
  expect(lightPairs[0]?.requiredNm).toBe(volume27.basicSeparationNm);
  expect(lightPairs[0]?.distanceNm).toBeCloseTo(heavyPairs[0]!.distanceNm, 9);
});

test("T02-44 AC5 — wakeCategory does not appear in the evaluator source", () => {
  const sources = import.meta.glob("./atpa.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./atpa.ts"] ?? "";
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/45/);
  expect(src).toMatch(/24/);
  expect(src).toMatch(/basic radar/);
  expect(src).not.toMatch(/wakeCategory/);
  expect(src).not.toMatch(/2\.5/);
});

test("disabled volumes and primary-only tracks produce no pairs", () => {
  const leader = arrival("AAL45", geom27, 11);
  const trailer = arrival("DAL123", geom27, 15);
  expect(evaluateAtpa([leader, trailer], [{ ...volume27, enabled: false }], geometry)).toEqual([]);

  const primary = arrival("SWA88", geom27, 15, { primaryOnly: true });
  expect(evaluateAtpa([leader, primary], [volume27], geometry)).toEqual([]);
  const transponderNone = arrival("JBU12", geom27, 15, { transponder: "none" });
  expect(evaluateAtpa([leader, transponderNone], [volume27], geometry)).toEqual([]);
});

test("a track outside the volume is not eligible", () => {
  const leader = arrival("AAL45", geom27, 11);
  const outside = arrival("DAL123", geom27, 16);
  expect(evaluateAtpa([leader, outside], [volume27], geometry)).toEqual([]);
});

test("frontmost of a single eligible track produces no pair", () => {
  const only = arrival("DAL123", geom27, 11);
  expect(evaluateAtpa([only], [volume27], geometry)).toEqual([]);
});
