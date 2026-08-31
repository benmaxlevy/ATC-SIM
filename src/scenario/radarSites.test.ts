import { expect, test } from "vitest";
import { latLonToNm } from "@core";
import { assertScenario, loadKdem } from "@scenario";
import kdemDownwindJson from "../../testdata/scenarios/kdem-downwind.json";
import radarSitesFixture from "../../testdata/scenarios/radar-sites.json";
import { isImplicitFusedSurveillance, parseRadarSites } from "./radarSites";
import { RADAR_SITE_DEFAULT_PERIOD_MS, RADAR_SITE_DEFAULT_RANGE_NM, type RadarSite } from "./types";
import katl08Json from "./katl-08.json";
import katlJson from "./katl.json";
import kdemJson from "./kdem.json";

const ARP = { latDeg: 12, lonDeg: -40 };

function coverageDiffers(a: RadarSite, b: RadarSite): boolean {
  const dx = b.xNm - a.xNm;
  const dy = b.yNm - a.yNm;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) {
    return a.rangeNm !== b.rangeNm;
  }
  const ux = dx / dist;
  const uy = dy / dist;
  const probeX = a.xNm - ux * a.rangeNm * 0.8;
  const probeY = a.yNm - uy * a.rangeNm * 0.8;
  const dA = Math.hypot(probeX - a.xNm, probeY - a.yNm);
  const dB = Math.hypot(probeX - b.xNm, probeY - b.yNm);
  return dA <= a.rangeNm && dB > b.rangeNm;
}

test("omitted and empty radarSites normalize to [] and imply FUSED", () => {
  expect(parseRadarSites(undefined, ARP)).toEqual([]);
  expect(parseRadarSites(null, ARP)).toEqual([]);
  expect(parseRadarSites([], ARP)).toEqual([]);
  expect(isImplicitFusedSurveillance([])).toBe(true);
  expect(RADAR_SITE_DEFAULT_RANGE_NM).toBe(60);
  expect(RADAR_SITE_DEFAULT_PERIOD_MS).toBe(4800);
});

test("generic testdata applies defaults and converts lat/lon through latLonToNm", () => {
  const sites = parseRadarSites(radarSitesFixture.radarSites, radarSitesFixture.arp);
  expect(sites).toHaveLength(2);
  expect(isImplicitFusedSurveillance(sites)).toBe(false);

  const airport = sites.find((row) => row.id === "GEN-APT");
  expect(airport).toMatchObject({
    name: "Generic airport",
    kind: "airport",
    xNm: 0,
    yNm: 0,
    rangeNm: RADAR_SITE_DEFAULT_RANGE_NM,
    periodMs: RADAR_SITE_DEFAULT_PERIOD_MS,
  });

  const remote = sites.find((row) => row.id === "GEN-REMOTE");
  const expected = latLonToNm({ latDeg: 12.5, lonDeg: -40 }, radarSitesFixture.arp);
  expect(remote).toMatchObject({
    name: "Generic remote ASR",
    kind: "asr",
    rangeNm: RADAR_SITE_DEFAULT_RANGE_NM,
    periodMs: RADAR_SITE_DEFAULT_PERIOD_MS,
  });
  expect(remote?.xNm).toBeCloseTo(expected.xNm, 9);
  expect(remote?.yNm).toBeCloseTo(expected.yNm, 9);
  expect(coverageDiffers(airport!, remote!)).toBe(true);
});

test("ENU rows load unchanged and lat/lon uses the given ARP", () => {
  const enu = parseRadarSites(
    [{ id: "E1", name: "East", kind: "asr", xNm: 12.5, yNm: -3.25, rangeNm: 40, periodMs: 2400 }],
    ARP,
  );
  expect(enu).toEqual([
    { id: "E1", name: "East", kind: "asr", xNm: 12.5, yNm: -3.25, rangeNm: 40, periodMs: 2400 },
  ]);

  const point = { latDeg: 12.25, lonDeg: -39.5 };
  const converted = parseRadarSites(
    [{ id: "L1", name: "Lat", kind: "airport", latDeg: point.latDeg, lonDeg: point.lonDeg }],
    ARP,
  );
  const expected = latLonToNm(point, ARP);
  expect(converted[0]?.xNm).toBeCloseTo(expected.xNm, 9);
  expect(converted[0]?.yNm).toBeCloseTo(expected.yNm, 9);
});

test("invalid kind, identity, coordinates, range, and period reject with field paths", () => {
  expect(() =>
    parseRadarSites([{ id: "A", name: "Alpha", kind: "adsb", xNm: 0, yNm: 0 }], ARP),
  ).toThrow(/radarSites\[0\]\.kind/);

  expect(() =>
    parseRadarSites([{ id: "", name: "Alpha", kind: "asr", xNm: 0, yNm: 0 }], ARP),
  ).toThrow(/radarSites\[0\]\.id/);

  expect(() => parseRadarSites([{ id: "A", name: "", kind: "asr", xNm: 0, yNm: 0 }], ARP)).toThrow(
    /radarSites\[0\]\.name/,
  );

  expect(() =>
    parseRadarSites(
      [
        { id: "A", name: "Alpha", kind: "asr", xNm: 0, yNm: 0 },
        { id: "A", name: "Bravo", kind: "airport", xNm: 1, yNm: 1 },
      ],
      ARP,
    ),
  ).toThrow(/radarSites\[1\]\.id/);

  expect(() =>
    parseRadarSites(
      [
        { id: "A", name: "Alpha", kind: "asr", xNm: 0, yNm: 0 },
        { id: "B", name: "Alpha", kind: "airport", xNm: 1, yNm: 1 },
      ],
      ARP,
    ),
  ).toThrow(/radarSites\[1\]\.name/);

  expect(() => parseRadarSites([{ id: "A", name: "Alpha", kind: "asr", xNm: 1 }], ARP)).toThrow(
    /xNm and yNm/,
  );

  expect(() => parseRadarSites([{ id: "A", name: "Alpha", kind: "asr", latDeg: 12 }], ARP)).toThrow(
    /latDeg and lonDeg/,
  );

  expect(() =>
    parseRadarSites(
      [{ id: "A", name: "Alpha", kind: "asr", xNm: 0, yNm: 0, latDeg: 12, lonDeg: -40 }],
      ARP,
    ),
  ).toThrow(/exactly one/);

  expect(() => parseRadarSites([{ id: "A", name: "Alpha", kind: "asr" }], ARP)).toThrow(
    /xNm\/yNm or latDeg\/lonDeg/,
  );

  expect(() =>
    parseRadarSites([{ id: "A", name: "Alpha", kind: "asr", xNm: Number.NaN, yNm: 0 }], ARP),
  ).toThrow(/radarSites\[0\]\.xNm/);

  expect(() =>
    parseRadarSites([{ id: "A", name: "Alpha", kind: "asr", xNm: 0, yNm: 0, rangeNm: 0 }], ARP),
  ).toThrow(/radarSites\[0\]\.rangeNm/);

  expect(() =>
    parseRadarSites([{ id: "A", name: "Alpha", kind: "asr", xNm: 0, yNm: 0, periodMs: -1 }], ARP),
  ).toThrow(/radarSites\[0\]\.periodMs/);
});

test("assertScenario omitted radarSites loads [] without SITE or sampler fields", () => {
  const withoutSites = { ...kdemJson } as Record<string, unknown>;
  delete withoutSites.radarSites;
  const scenario = assertScenario(withoutSites);
  expect(scenario.radarSites).toEqual([]);
  expect(isImplicitFusedSurveillance(scenario.radarSites)).toBe(true);
  expect(scenario).not.toHaveProperty("surveillanceMode");
  expect(scenario).not.toHaveProperty("siteButtons");
});

test("legacy testdata without radarSites still loads as implicit FUSED", () => {
  expect("radarSites" in kdemDownwindJson).toBe(false);
  const scenario = assertScenario(kdemDownwindJson);
  expect(scenario.radarSites).toEqual([]);
  expect(isImplicitFusedSurveillance(scenario.radarSites)).toBe(true);
});

test("KDEM fixture has airport-at-ARP and a remote ASR with distinct coverage", () => {
  const scenario = loadKdem();
  const airport = scenario.radarSites.find((row) => row.id === "KDEM-APT");
  const remote = scenario.radarSites.find((row) => row.id === "KDEM-REMOTE");
  expect(airport).toMatchObject({
    name: "Demo Field airport",
    kind: "airport",
    xNm: 0,
    yNm: 0,
    rangeNm: 60,
    periodMs: 4800,
  });
  expect(remote).toMatchObject({
    name: "Demo Field remote ASR",
    kind: "asr",
    xNm: 40,
    yNm: 10,
    rangeNm: 60,
    periodMs: 4800,
  });
  expect(coverageDiffers(airport!, remote!)).toBe(true);
  expect(isImplicitFusedSurveillance(scenario.radarSites)).toBe(false);
});

test("KATL fixtures use trainer ids and convert airport lat/lon through scenario ARP", () => {
  for (const raw of [katlJson, katl08Json]) {
    const scenario = assertScenario(raw);
    const airport = scenario.radarSites.find((row) => row.id === "KATL-APT");
    const remote = scenario.radarSites.find((row) => row.id === "KATL-REMOTE");
    expect(airport?.kind).toBe("airport");
    expect(remote?.kind).toBe("asr");
    expect(airport?.name).toMatch(/trainer/i);
    expect(remote?.name).toMatch(/trainer/i);
    expect(airport?.id).not.toMatch(/FAA|NAS|ASR-9|ATL-ASR/i);
    expect(remote?.id).not.toMatch(/FAA|NAS|ASR-9|ATL-ASR/i);
    expect(airport).toMatchObject({ rangeNm: 60, periodMs: 4800 });
    expect(remote).toMatchObject({ rangeNm: 60, periodMs: 4800 });
    const arpNm = latLonToNm(scenario.arp, scenario.arp);
    expect(airport?.xNm).toBeCloseTo(arpNm.xNm, 9);
    expect(airport?.yNm).toBeCloseTo(arpNm.yNm, 9);
    const expectedRemote = latLonToNm({ latDeg: 33.6367, lonDeg: -83.6278638888889 }, scenario.arp);
    expect(remote?.xNm).toBeCloseTo(expectedRemote.xNm, 9);
    expect(remote?.yNm).toBeCloseTo(expectedRemote.yNm, 9);
    expect(coverageDiffers(airport!, remote!)).toBe(true);
  }
});
