import { beforeEach, describe, expect, it, vi } from "vitest";
import katlFixture from "../../../../testdata/wx/metar-katl.json";
import {
  DEFAULT_ALTIMETER_STUB,
  clearMetarCache,
  decodeMetarObservation,
  fetchMetar,
  getCachedMetar,
  hPaToAltimeterInHg,
  parseAltimeterFromRawOb,
  setCachedMetar,
} from "../metarClient";

describe("metarClient", () => {
  beforeEach(() => {
    clearMetarCache();
  });

  describe("altimeter conversions", () => {
    it("converts hPa to inHg with 2 decimal places", () => {
      // 1022.1 hPa * 0.029529983 = 30.18259... -> "30.18"
      expect(hPaToAltimeterInHg(1022.1)).toBe("30.18");
      // Standard sea-level 1013.25 * 0.029529983 = 29.9213... -> "29.92"
      expect(hPaToAltimeterInHg(1013.25)).toBe("29.92");
      // Fallback on invalid
      expect(hPaToAltimeterInHg(0)).toBe(DEFAULT_ALTIMETER_STUB);
      expect(hPaToAltimeterInHg(-5)).toBe(DEFAULT_ALTIMETER_STUB);
      expect(hPaToAltimeterInHg(NaN)).toBe(DEFAULT_ALTIMETER_STUB);
    });

    it("parses FAA altimeter string from rawOb", () => {
      expect(
        parseAltimeterFromRawOb(
          "METAR KATL 311452Z 00000KT 10SM SCT024 SCT055 30/22 A3018 RMK AO2",
        ),
      ).toBe("30.18");
      expect(parseAltimeterFromRawOb("METAR KDEM 010000Z 27010KT 10SM CLR 20/10 A2992")).toBe(
        "29.92",
      );
      expect(parseAltimeterFromRawOb("METAR NOALTIMETER 10SM CLR")).toBeNull();
      expect(parseAltimeterFromRawOb("")).toBeNull();
    });
  });

  describe("decodeMetarObservation", () => {
    it("decodes KATL fixture observation accurately", () => {
      const katlRaw = katlFixture[0];
      const obs = decodeMetarObservation(katlRaw);
      expect(obs).not.toBeNull();
      expect(obs?.icaoId).toBe("KATL");
      expect(obs?.altimeterInHg).toBe("30.18");
      expect(obs?.temp).toBe(30);
      expect(obs?.dewp).toBe(22.2);
      expect(obs?.wdir).toBe(0);
      expect(obs?.wspd).toBe(0);
      expect(obs?.visib).toBe("10+");
      expect(obs?.fltCat).toBe("VFR");
      expect(obs?.rawOb).toContain("METAR KATL");
    });

    it("falls back to rawOb when altim field is missing", () => {
      const obs = decodeMetarObservation({
        icaoId: "KFTY",
        reportTime: "2026-08-31T15:00:00.000Z",
        rawOb: "METAR KFTY 311453Z 35004KT 10SM CLR 29/22 A3019 RMK AO2",
      });
      expect(obs).not.toBeNull();
      expect(obs?.icaoId).toBe("KFTY");
      expect(obs?.altimeterInHg).toBe("30.19");
    });

    it("returns null on invalid payload or missing icaoId", () => {
      expect(decodeMetarObservation(null)).toBeNull();
      expect(decodeMetarObservation([])).toBeNull();
      expect(decodeMetarObservation({})).toBeNull();
      expect(decodeMetarObservation({ icaoId: "" })).toBeNull();
    });
  });

  describe("fetchMetar with caching and batching", () => {
    it("fetches multi-airport observations via mock fetch", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => katlFixture,
      });

      const res = await fetchMetar(["KATL", "KFTY", "KPDK"], {
        fetchFn: mockFetch as unknown as typeof fetch,
        baseUrl: "https://mock.aviationweather.gov/metar",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain("ids=KATL%2CKFTY%2CKPDK");
      expect(res.size).toBe(5); // fixture has 5 airports
      expect(res.get("KATL")?.altimeterInHg).toBe("30.18");
      expect(res.get("KFTY")?.altimeterInHg).toBe("30.18");
    });

    it("uses in-memory cache within TTL and avoids duplicate fetch", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => katlFixture,
      });

      let fakeTime = 1000000;
      const options = {
        fetchFn: mockFetch as unknown as typeof fetch,
        nowMs: () => fakeTime,
        ttlMs: 300000,
      };

      // Initial fetch populates cache
      const res1 = await fetchMetar(["KATL"], options);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res1.get("KATL")?.icaoId).toBe("KATL");

      // Second call 1 minute later hits cache
      fakeTime += 60000;
      const res2 = await fetchMetar(["KATL"], options);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res2.get("KATL")?.icaoId).toBe("KATL");

      // Third call after TTL expired (6 minutes later) triggers refetch
      fakeTime += 360000;
      const res3 = await fetchMetar(["KATL"], options);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res3.get("KATL")?.icaoId).toBe("KATL");
    });

    it("handles HTTP errors and network failures gracefully without throwing", async () => {
      const failingFetch = vi.fn().mockRejectedValue(new Error("Network connection error"));

      const res = await fetchMetar(["KATL"], {
        fetchFn: failingFetch as unknown as typeof fetch,
      });

      expect(res.size).toBe(0);
    });

    it("manual setCachedMetar and getCachedMetar helpers work", () => {
      const katlObs = decodeMetarObservation(katlFixture[0])!;
      setCachedMetar(katlObs, 1000);
      expect(getCachedMetar("katl", 5000, 2000)?.icaoId).toBe("KATL");
      expect(getCachedMetar("KATL", 5000, 7000)).toBeNull(); // expired
    });
  });
});
