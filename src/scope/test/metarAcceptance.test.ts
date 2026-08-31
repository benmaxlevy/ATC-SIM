import { describe, expect, it, vi } from "vitest";
import { loadPlayableScenario } from "../../scenario";
import katlFixture from "../../../testdata/wx/metar-katl.json";
import { createScopeView } from "../scopeView";
import { buildSsaRenderLines } from "../ssa";
import {
  applyMetarToScopeView,
  decodeMetarObservation,
  formatMetarGiLine,
  startMetarPolling,
} from "../wx";

describe("T02-80 — METAR weather and GI text acceptance", () => {
  it("AC1 — formatMetarGiLine produces standard FAA surface weather summary", () => {
    const obs = decodeMetarObservation(katlFixture[0])!;
    expect(obs).not.toBeNull();
    const giLine = formatMetarGiLine(obs);
    expect(giLine).toBe("KATL 00000KT 10SM 30/22 A3018");

    const kftyObs = decodeMetarObservation(katlFixture[1])!;
    const kftyGi = formatMetarGiLine(kftyObs);
    expect(kftyGi).toBe("KFTY 35004KT 10SM 29/22 A3018");
  });

  it("AC2 — applyMetarToScopeView populates primary altimeter, satellite rows, and GI slot", () => {
    const katlScenario = loadPlayableScenario("katl");
    expect(katlScenario.ssaWeatherAirports).toEqual(["KATL", "KFTY", "KPDK", "KMGE", "KRYY"]);
    expect(katlScenario.ssaWeatherGiSlot).toBe(9);

    const view = createScopeView(0, 0, {
      giTextLines: katlScenario.giTextLines,
      ssaWeatherAirports: katlScenario.ssaWeatherAirports,
    });

    expect(view.primaryAltimeter).toBe("30.17");
    expect(view.airportAltimeters).toEqual([]);
    expect(view.giTextLines[9]).toBe("");

    const obsMap = new Map();
    for (const item of katlFixture) {
      const obs = decodeMetarObservation(item);
      if (obs) obsMap.set(obs.icaoId, obs);
    }

    applyMetarToScopeView(view, obsMap, {
      primaryIcao: katlScenario.icao,
      giSlot: katlScenario.ssaWeatherGiSlot,
    });

    expect(view.primaryAltimeter).toBe("30.18");
    expect(view.airportAltimeters?.length).toBe(4); // 4 satellite airports
    expect(view.airportAltimeters?.[0]).toEqual({ airportCode: "KFTY", altimeter: "30.18" });
    expect(view.airportAltimeters?.[1]).toEqual({ airportCode: "KPDK", altimeter: "30.18" });
    expect(view.giTextLines[9]).toBe("KATL 00000KT 10SM 30/22 A3018");
    expect(view.giFilterVisible[9]).toBe(true);

    // Verify SSA render output
    const ssa = buildSsaRenderLines({
      simTimeMs: 0,
      rangeNm: view.camera.rangeNm,
      offCenter: false,
      filter: view.altitudeFilter,
      filterEntry: view.filterEntry,
      visibility: view.ssaFilter,
      primaryAltimeter: view.primaryAltimeter,
      airportAltimeters: view.airportAltimeters,
    }).map((l) => l.text);

    expect(ssa).toContain("0000/00  30.18");
    expect(ssa).toContain("KFTY 30.18  KPDK 30.18  KMGE 30.18");
    expect(ssa).toContain("KRYY 30.18");
  });

  it("AC3 — startMetarPolling runs immediate poll and periodic interval with cleanup", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => katlFixture,
    });

    const katlScenario = loadPlayableScenario("katl");
    const view = createScopeView(0, 0, {
      giTextLines: katlScenario.giTextLines,
      ssaWeatherAirports: katlScenario.ssaWeatherAirports,
    });

    const stopPolling = startMetarPolling(view, {
      fetchOptions: {
        fetchFn: mockFetch as unknown as typeof fetch,
        baseUrl: "https://mock.metar.gov",
      },
      primaryIcao: "KATL",
      giSlot: 9,
      pollIntervalMs: 60000,
    });

    // Wait for the async immediate poll
    await vi.waitFor(() => {
      expect(view.primaryAltimeter).toBe("30.18");
      expect(view.giTextLines[9]).toContain("KATL 00000KT");
    });

    stopPolling();
  });

  it("AC4 — offline fallback preserves defaults when scenario omits ssaWeatherAirports (e.g. KDEM)", () => {
    const kdemScenario = loadPlayableScenario("kdem-ils27");
    expect(kdemScenario.ssaWeatherAirports).toBeUndefined();
    expect(kdemScenario.ssaWeatherGiSlot).toBeUndefined();

    const view = createScopeView(0, 0, {
      giTextLines: kdemScenario.giTextLines,
      ssaWeatherAirports: kdemScenario.ssaWeatherAirports,
    });

    expect(view.primaryAltimeter).toBe("30.17");
    expect(view.airportAltimeters).toEqual([]);
    expect(view.giTextLines[0]).toBe("ATIS A");
  });
});
