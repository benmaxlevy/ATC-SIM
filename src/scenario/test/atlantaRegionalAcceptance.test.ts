/**
 * Atlanta data and contract acceptance suite (T04-76).
 *
 * Verifies:
 * - Source-backed destinations and regional pack declaration for KATL
 * - Preservation of existing scenario routes and configurations (West Flow, East Flow)
 * - Regional destination eligibility contract: public-use, towered, published approaches, and valid runways
 * - Generic assertions without hardcoding fragile live coordinate/map numbers into generic unit suites
 */

import { describe, expect, test } from "vitest";
import katlJson from "../katl.json";
import katl08Json from "../katl-08.json";
import katlRegionalManifest from "../data/katl/regional.json";
import katlRegionalAirports from "../data/katl/regional-airports.json";
import { assertScenario } from "../load";
import { loadPlayableScenario } from "../playableScenarios";
import { getEligibleVfrDestinations, type RegionalFacility } from "@scenario";

describe("T04-76 Atlanta data and contract acceptance", () => {
  test("T04-87 KATL regional manifest uses portable 40 NM declaration", () => {
    expect(katlRegionalManifest.radiusNm).toBe(40);
    expect(katlRegionalManifest.source.command).toContain("--radius 40");
    for (const airport of katlRegionalAirports.airports) {
      expect(airport.serviceMetadata?.sourceFile ?? "").not.toMatch(/^(?:[A-Za-z]:[\\/]|[\\/])/);
    }
  });

  test("KATL scenarios declare regionalPack 'katl' and preserve existing arrival/departure routes", () => {
    // Both configurations declare regionalPack: "katl"
    expect(katlJson.regionalPack).toBe("katl");
    expect(katl08Json.regionalPack).toBe("katl");

    // Boot both configurations through generic assertScenario
    const katlWest = assertScenario(katlJson, { arrivalCountMin: 1, arrivalCountMax: 10 });
    const katlEast = assertScenario(katl08Json, { arrivalCountMin: 1, arrivalCountMax: 10 });

    expect(katlWest.icao).toBe("KATL");
    expect(katlWest.activeRunwayId).toBe("26R");
    expect(katlWest.arrivals.length).toBeGreaterThanOrEqual(4);
    expect(katlWest.departureConfig?.routePool?.length).toBeGreaterThan(0);

    expect(katlEast.icao).toBe("KATL");
    expect(katlEast.activeRunwayId).toBe("08L");
    expect(katlEast.arrivals.length).toBeGreaterThanOrEqual(4);
    expect(katlEast.departureConfig?.routePool?.length).toBeGreaterThan(0);

    // Existing STARs are intact
    const starIdsWest = new Set(katlWest.arrivals.map((a) => a.starId));
    expect(starIdsWest.has("BOKRT3") || starIdsWest.has("CHPPR1")).toBe(true);

    // Existing SIDs are intact
    const sidIdsWest = new Set(katlWest.departureConfig?.routePool?.map((r) => r.sidId));
    expect(sidIdsWest.has("BANNG3") || sidIdsWest.has("CUTTN2")).toBe(true);
  });

  test("Playable scenario inventory loads both configurations cleanly", () => {
    const west = loadPlayableScenario("katl");
    expect(west.id).toBe("katl");
    expect(west.icao).toBe("KATL");
    expect(west.activeRunwayId).toBe("26R");

    const east = loadPlayableScenario("katl-08");
    expect(east.id).toBe("katl-08");
    expect(east.icao).toBe("KATL");
    expect(east.activeRunwayId).toBe("08L");
  });

  test("When regional pack is present, destinations satisfy the destination contract", () => {
    const katlWest = assertScenario(katlJson, { arrivalCountMin: 1, arrivalCountMax: 10 });
    const regional = katlWest.regional as RegionalFacility | undefined;

    if (regional) {
      // Source provenance is recorded
      expect(regional.source).toBeDefined();
      expect(regional.source.families).toContain("CIFP");
      expect(regional.source.families).toContain("NASR_APT");

      // Eligible destinations have publicUse, towered, and valid runways
      const destinations = getEligibleVfrDestinations(regional);
      expect(destinations.length).toBeGreaterThan(0);
      const kpdK = destinations.find((destination) => destination.icao === "KPDK");
      expect(kpdK).toBeDefined();
      expect(kpdK?.runways.map((runway) => runway.id)).toEqual(
        expect.arrayContaining(["03L", "03R", "16", "21L", "21R", "34"]),
      );
      for (const dest of destinations) {
        expect(dest.publicUse).toBe(true);
        expect(dest.towered).toBe(true);
        expect(dest.eligible).toBe(true);
        expect(dest.runways.length).toBeGreaterThan(0);
        for (const rwy of dest.runways) {
          expect(rwy.id).toBeDefined();
          expect(rwy.lengthFt).toBeGreaterThan(0);
        }
      }

      // Airspaces have controlled Class B volumes
      const airspaces = regional.getAirspaces();
      expect(airspaces.length).toBeGreaterThan(0);
      const bravoVolumes = airspaces.filter((v) => v.class === "B");
      expect(bravoVolumes.length).toBeGreaterThan(0);
      for (const b of bravoVolumes) {
        expect(b.lowerLimitFt).toBeDefined();
        expect(b.upperLimitFt).toBeDefined();
        expect(b.lowerLimitFt).toBeLessThan(b.upperLimitFt);
        expect(b.segments.length).toBeGreaterThan(0);
      }
    }
  });
});
