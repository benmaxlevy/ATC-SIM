import { beforeEach, describe, expect, it } from "vitest";
import {
  createAircraft,
  createFlightPlan,
  createWorld,
  locAxisForApproach,
  type Aircraft,
  type AircraftInit,
} from "@core";
import { loadRegionalPack, type RegionalFacility } from "../../../scenario/regional";
import {
  clearApproachContextCache,
  regionalSatelliteIlsApproaches,
  resolveApproachContext,
  resolveDestinationAirportIcao,
} from "../approachContext";

function makeTestAircraft(init: Partial<AircraftInit> & { callsign: string }): Aircraft {
  return createAircraft({
    xNm: 0,
    yNm: 0,
    headingDeg: 360,
    altitudeFt: 5000,
    speedKt: 150,
    ...init,
  });
}

describe("T04-81 approachContext resolver", () => {
  let regional: RegionalFacility;

  beforeEach(() => {
    const pack = loadRegionalPack("katl");
    if (!pack) {
      throw new Error("Failed to load katl regional pack");
    }
    regional = pack;
    clearApproachContextCache();
  });

  describe("precedence chain", () => {
    it("step a: resolves activeClearance.limitId when it matches center airport", () => {
      const world = createWorld({
        catalog: {
          airportId: "KATL",
          approaches: [{ id: "I26R", lengthNm: 18, publishedCourseMagneticDeg: 270 }],
          navaids: [],
          fixes: [],
          sids: [],
          stars: [],
        },
      });
      const ac = makeTestAircraft({
        id: "ac-1",
        callsign: "DAL123",
        activeClearance: {
          limitId: "KATL",
          route: {
            route: { text: "KATL", segments: [] },
            nextIndex: 0,
            revision: 1,
            lifecycle: "active",
          },
          access: { type: "RADAR_VECTORS" },
          issuedAtSimMs: 0,
        },
        destination: "KPDK",
      });
      expect(resolveDestinationAirportIcao(ac, world)).toBe("KATL");
    });

    it("step a: resolves activeClearance.limitId when it matches satellite regional airport", () => {
      const world = createWorld({
        catalog: {
          airportId: "KATL",
          approaches: [],
          navaids: [],
          fixes: [],
          sids: [],
          stars: [],
        },
      });
      world.regional = regional;
      const ac = makeTestAircraft({
        id: "ac-1",
        callsign: "N123AB",
        activeClearance: {
          limitId: "KPDK",
          route: {
            route: { text: "KPDK", segments: [] },
            nextIndex: 0,
            revision: 1,
            lifecycle: "active",
          },
          access: { type: "RADAR_VECTORS" },
          issuedAtSimMs: 0,
        },
        destination: "KFTY",
      });
      expect(resolveDestinationAirportIcao(ac, world)).toBe("KPDK");
    });

    it("step a -> b: falls through when activeClearance.limitId is a fix (e.g. SIITH)", () => {
      const world = createWorld({
        catalog: {
          airportId: "KATL",
          approaches: [],
          navaids: [],
          fixes: [],
          sids: [],
          stars: [],
        },
      });
      world.regional = regional;

      const planResult = createFlightPlan({
        id: "fp-1",
        acid: "N123AB",
        airportId: "KPDK",
        fixes: ["SIITH"],
        assignedBeacon: "4201",
        scratchpads: [],
      });
      expect(planResult.ok).toBe(true);
      if (!planResult.ok) return;
      world.flightPlans = [planResult.value];

      const ac = makeTestAircraft({
        id: "ac-1",
        callsign: "N123AB",
        squawk: "4201",
        reportedSquawk: "4201",
        activeClearance: {
          limitId: "SIITH", // fix, not an airport!
          route: {
            route: { text: "SIITH", segments: [] },
            nextIndex: 0,
            revision: 1,
            lifecycle: "active",
          },
          access: { type: "RADAR_VECTORS" },
          issuedAtSimMs: 0,
        },
      });
      world.aircraft = [ac];

      expect(resolveDestinationAirportIcao(ac, world)).toBe("KPDK");
    });

    it("step b: resolves correlated flight plan destination", () => {
      const world = createWorld({
        catalog: { airportId: "KATL", approaches: [], navaids: [], fixes: [], sids: [], stars: [] },
      });
      world.regional = regional;

      const planResult = createFlightPlan({
        id: "fp-2",
        acid: "N456CD",
        airportId: "KFTY",
        fixes: [],
        assignedBeacon: "4202",
        scratchpads: [],
      });
      expect(planResult.ok).toBe(true);
      if (!planResult.ok) return;
      world.flightPlans = [planResult.value];

      const ac = makeTestAircraft({
        id: "ac-2",
        callsign: "N456CD",
        squawk: "4202",
        reportedSquawk: "4202",
        destination: "KRYY", // authored destination should yield to correlated plan!
      });
      world.aircraft = [ac];

      expect(resolveDestinationAirportIcao(ac, world)).toBe("KFTY");
    });

    it("step c: resolves ambient VFR destination", () => {
      const world = createWorld({
        catalog: { airportId: "KATL", approaches: [], navaids: [], fixes: [], sids: [], stars: [] },
      });
      const ac = makeTestAircraft({
        id: "ac-3",
        callsign: "N789EF",
        ambientVfr: {
          mission: "AIRPORT_BOUND",
          zoneId: "zone-1",
          spawnedAtSimMs: 0,
          alertEligibility: "CONTROLLED",
          destinationAirportId: "KRYY",
        },
        destination: "KFTY", // authored destination should yield to ambientVfr!
      });

      expect(resolveDestinationAirportIcao(ac, world)).toBe("KRYY");
    });

    it("step d: resolves authored destination fields", () => {
      const world = createWorld({
        catalog: { airportId: "KATL", approaches: [], navaids: [], fixes: [], sids: [], stars: [] },
      });
      const ac1 = makeTestAircraft({
        id: "ac-4",
        callsign: "N111",
        destination: "KPDK",
      });
      expect(resolveDestinationAirportIcao(ac1, world)).toBe("KPDK");

      const ac2 = makeTestAircraft({
        id: "ac-5",
        callsign: "N222",
        destinationAirport: "KFTY",
      });
      expect(resolveDestinationAirportIcao(ac2, world)).toBe("KFTY");
    });

    it("step e: defaults to center airport catalog", () => {
      const world = createWorld({
        catalog: { airportId: "KDEM", approaches: [], navaids: [], fixes: [], sids: [], stars: [] },
      });
      const ac = makeTestAircraft({
        id: "ac-6",
        callsign: "N333",
      });
      expect(resolveDestinationAirportIcao(ac, world)).toBe("KDEM");
    });
  });

  describe("center vs satellite context resolution", () => {
    it("returns byte-identical world.catalog and world.fixRegistry for center airport", () => {
      const catalog = {
        airportId: "KATL",
        approaches: [{ id: "I26R", lengthNm: 18, publishedCourseMagneticDeg: 270 }],
        navaids: [{ id: "ATL", xNm: 0, yNm: 0, kind: "VOR" }],
        fixes: [{ id: "SIITH", xNm: 10, yNm: 2, kind: "INTERSECTION" }],
        sids: [],
        stars: [],
      };
      const world = createWorld({ catalog });
      const ac = makeTestAircraft({ id: "ac-atl", callsign: "DAL100", destination: "KATL" });

      const ctx = resolveApproachContext(ac, world);
      expect(ctx.airportIcao).toBe("KATL");
      expect(ctx.catalog).toBe(world.catalog);
      expect(ctx.fixRegistry).toBe(world.fixRegistry);
    });

    it("loads, caches, and projects satellite airport catalog and fix registry", () => {
      const world = createWorld({
        catalog: { airportId: "KATL", approaches: [], navaids: [], fixes: [], sids: [], stars: [] },
      });
      world.regional = regional;

      const ac = makeTestAircraft({ id: "ac-pdk", callsign: "N123AB", destination: "KPDK" });
      const ctx1 = resolveApproachContext(ac, world);

      expect(ctx1.airportIcao).toBe("KPDK");
      expect(ctx1.catalog).toBeDefined();
      expect(ctx1.catalog?.airportId).toBe("KPDK");
      expect(ctx1.fixRegistry).toBeDefined();

      // Satellite ILS 21L exists in KPDK catalog
      const ils21L = ctx1.catalog?.approaches.find((a) => a.id === "I21L");
      expect(ils21L).toBeDefined();
      expect(ils21L?.thresholdFixId).toBe("RW21L");

      // Verify projection: RW21L in fixes.json is at xNm ~ 0.19, yNm ~ 0.33 tangent to PDK ARP.
      // But PDK ARP is ~8 NM east, ~14 NM north of KATL center ARP.
      // The resolved FixRegistry must return projected center-relative coordinates!
      const rw21LFix = ctx1.fixRegistry?.get("RW21L");
      expect(rw21LFix).toBeDefined();
      expect(rw21LFix?.xNm).toBeGreaterThan(5); // ~6 to 8 NM east of KATL
      expect(rw21LFix?.yNm).toBeGreaterThan(12); // ~13 to 15 NM north of KATL

      // Test localizer axis for satellite approach:
      const axis = locAxisForApproach("I21L", ctx1.catalog, ctx1.fixRegistry, -5);
      expect(axis).toBeDefined();
      expect(axis?.thresholdXNm).toBeCloseTo(rw21LFix!.xNm, 2);
      expect(axis?.thresholdYNm).toBeCloseTo(rw21LFix!.yNm, 2);

      // Caching: second resolution must return the exact same cached object reference
      const ctx2 = resolveApproachContext(ac, world);
      expect(ctx2).toBe(ctx1);
    });

    it("returns null catalog and fixRegistry for non-existent satellite airport", () => {
      const world = createWorld({
        catalog: { airportId: "KATL", approaches: [], navaids: [], fixes: [], sids: [], stars: [] },
      });
      world.regional = regional;

      const ac = makeTestAircraft({ id: "ac-fake", callsign: "N999", destination: "KZZZ" });
      const ctx = resolveApproachContext(ac, world);
      expect(ctx.airportIcao).toBe("KZZZ");
      expect(ctx.catalog).toBeNull();
      expect(ctx.fixRegistry).toBeNull();
    });
  });

  describe("regionalSatelliteIlsApproaches", () => {
    it("collects satellite ILS approaches across regional pack", () => {
      const apps = regionalSatelliteIlsApproaches(regional);
      expect(apps.length).toBeGreaterThan(0);

      // Must include KPDK I21L
      const pdkIls = apps.find((a) => a.id === "I21L");
      expect(pdkIls).toBeDefined();
      expect(pdkIls?.runway).toBe("21L");

      // Must NOT include RNAV approaches like H21LZ or H03R
      expect(apps.some((a) => a.id === "H21LZ")).toBe(false);
      expect(apps.some((a) => a.id === "H03R")).toBe(false);

      // Cached on repeated calls
      const apps2 = regionalSatelliteIlsApproaches(regional);
      expect(apps2).toBe(apps);
    });

    it("returns empty array when regional facility is undefined", () => {
      expect(regionalSatelliteIlsApproaches(undefined)).toEqual([]);
    });
  });
});
