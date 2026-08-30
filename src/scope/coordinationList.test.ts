import { describe, expect, it } from "vitest";
import { loadVideoMapGroups, loadVideoMapSet } from "@scenario";
import { createScopeView } from "./scopeView";
import {
  buildCoordinationListLines,
  buildVideoMapsListLines,
  createCoordinationList,
  releaseDepartureByCallsign,
  releaseSingleDeparture,
  setCoordinationAutoRelease,
  type ReleaseDeparture,
} from "./coordinationList";

function makeTestDeparture(partial: Partial<ReleaseDeparture>): ReleaseDeparture {
  return {
    id: "dep-1",
    callsign: "AAL123",
    aircraftType: "B738",
    squawk: "1234",
    exitFix: "GAYEL",
    requestedAltitudeFt: 18000,
    released: false,
    ...partial,
  };
}

describe("coordinationList", () => {
  it("formats unreleased and released departures with * and + prefixes", () => {
    const list = createCoordinationList("A", "REPUBLIC", [
      makeTestDeparture({
        id: "1",
        callsign: "DPJ7156",
        aircraftType: "E55P",
        squawk: "1234",
        exitFix: "GAY",
        requestedAltitudeFt: 18000,
        released: false,
      }),
      makeTestDeparture({
        id: "2",
        callsign: "EJA5253",
        aircraftType: "C56X",
        squawk: "5678",
        exitFix: "WHITE",
        requestedAltitudeFt: 24000,
        released: true,
      }),
    ]);

    const lines = buildCoordinationListLines(list);
    expect(lines[0]).toBe("REPUBLIC");
    expect(lines[1]).toContain("*01 DPJ7156 E55P 1234 GAY 180");
    expect(lines[2]).toContain("+02 EJA5253 C56X 5678 WHI 240");
  });

  it("releases single pending departure on releaseSingleDeparture", () => {
    const list = createCoordinationList("A", "KDEM", [
      makeTestDeparture({ id: "1", callsign: "AAL123", released: false }),
    ]);

    const res = releaseSingleDeparture(list);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.releasedCallsign).toBe("AAL123");
    }
    expect(list.departures[0]?.released).toBe(true);
  });

  it("fails releaseSingleDeparture when multiple unreleased departures exist", () => {
    const list = createCoordinationList("A", "KDEM", [
      makeTestDeparture({ id: "1", callsign: "AAL123", released: false }),
      makeTestDeparture({ id: "2", callsign: "DAL456", released: false }),
    ]);

    const res = releaseSingleDeparture(list);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toBe("MULTIPLE_FLIGHTS");
    }
  });

  it("releases specific flight by callsign and removes on second call", () => {
    const list = createCoordinationList("A", "KDEM", [
      makeTestDeparture({ id: "1", callsign: "AAL123", released: false }),
    ]);

    const res1 = releaseDepartureByCallsign(list, "AAL123");
    expect(res1.success).toBe(true);
    expect(list.departures[0]?.released).toBe(true);

    const res2 = releaseDepartureByCallsign(list, "AAL123");
    expect(res2.success).toBe(true);
    expect(list.departures.length).toBe(0);
  });

  it("enables AUTO release and adds AUTO to title header", () => {
    const list = createCoordinationList("A", "REPUBLIC", [
      makeTestDeparture({ id: "1", callsign: "AAL123", released: false }),
    ]);

    setCoordinationAutoRelease(list, true);
    expect(list.autoRelease).toBe(true);
    expect(list.departures[0]?.released).toBe(true);

    const lines = buildCoordinationListLines(list);
    expect(lines[0]).toContain("AUTO");
  });

  it("formats Video Maps list with active > indicators", () => {
    const view = createScopeView();
    const lines = buildVideoMapsListLines(view, "ALL");
    expect(lines[0]).toContain("GEOGRAPHIC MAPS");
  });

  it("T04-40 — GEOGRAPHIC MAPS lists complete KATL inventory by starsId", () => {
    const view = createScopeView(0, 0, {
      digitalMap: {
        rangeRings: { intervalNm: 5, maxNm: 60 },
        loadedVideoMaps: loadVideoMapSet("KATL"),
        videoMapGroups: loadVideoMapGroups("KATL"),
      },
    });
    const lines = buildVideoMapsListLines(view, "GEO", 100);
    expect(
      lines.filter((line) => /^\s*[> ]\s+\d+/.test(line) || /136/.test(line)).length,
    ).toBeGreaterThanOrEqual(1);
    expect(lines.some((line) => line.includes("136") && line.includes("40DME F"))).toBe(true);
    expect(lines.some((line) => line.includes("01GP6Y38GCS0BQSWSVRDK7JH5C"))).toBe(false);
    const full = buildVideoMapsListLines(view, "GEO", 200);
    const mapRows = full.filter(
      (line) => /40DME F|MVA|CLASS B/.test(line) || /^\s*[> ]\s+\d+\s/.test(line),
    );
    expect(full.length).toBeGreaterThanOrEqual(91);
    expect(mapRows.length).toBeGreaterThanOrEqual(90);
  });
});
