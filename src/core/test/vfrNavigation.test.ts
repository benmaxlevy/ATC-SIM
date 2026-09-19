import { describe, expect, test } from "vitest";
import { makeTestAircraft } from "../aircraft";
import type {
  RegionalAirport,
  RegionalAirspaceVolume,
  RegionalFacility,
} from "../../scenario/regional";
import {
  buildGroupedAvoidanceVolumes,
  checkSweptSegmentVolumeCollision,
  CLASS_B_HORIZONTAL_MARGIN_NM,
  CLASS_B_VERTICAL_MARGIN_FT,
  distPointToSegment,
  extractVolumePolygonNm,
  isDegenerateAvoidanceVolume,
  isPointInside3dVolume,
  isPointInsideAvoidanceVolumes,
  isRouteSafeFromAvoidance,
  planSafeVfrContinuation,
  planSafeVfrRoute,
  samplePointInBox,
  SATELLITE_DEPARTURE_WOBBLE_MAX_NM,
  stepVfrAircraftNavigation,
  VFR_TRAINING_HALF_EXTENT_NM,
  type Point3D,
  type VfrTrainingBox,
} from "../vfrNavigation";

// Synthetic Class B volume: 10x10 NM box at center, floor 3,000 ft, ceiling 10,000 ft
const SYNTHETIC_CLASS_B_VOLUME: RegionalAirspaceVolume = {
  id: "UC:KSYN:B_CORE",
  name: "SYNTHETIC BRAVO CORE",
  type: "CONTROLLED",
  class: "B",
  centerAirportId: "KSYN",
  lowerLimit: { altitudeFt: 3000, unit: "MSL", reference: "MSL" },
  upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
  lowerLimitFt: 3000,
  upperLimitFt: 10000,
  segments: [
    {
      sequence: 1,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 33.1, lonDeg: -84.1 },
      positionNm: { xNm: -5, yNm: -5 },
    },
    {
      sequence: 2,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 33.1, lonDeg: -83.9 },
      positionNm: { xNm: 5, yNm: -5 },
    },
    {
      sequence: 3,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 32.9, lonDeg: -83.9 },
      positionNm: { xNm: 5, yNm: 5 },
    },
    {
      sequence: 4,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 32.9, lonDeg: -84.1 },
      positionNm: { xNm: -5, yNm: 5 },
    },
  ],
};

describe("T04-71 VFR 3D Class B avoidance", () => {
  test("Point inside 3D volume with vertical and horizontal margins", () => {
    // Center point at 5,000 ft is inside
    expect(
      isPointInside3dVolume({ xNm: 0, yNm: 0, altitudeFt: 5000 }, SYNTHETIC_CLASS_B_VOLUME),
    ).toBe(true);

    // Center point below floor (2,000 ft < 3,000 - 500 = 2,500 ft) is outside
    expect(
      isPointInside3dVolume({ xNm: 0, yNm: 0, altitudeFt: 2000 }, SYNTHETIC_CLASS_B_VOLUME),
    ).toBe(false);

    // Center point within 500 ft vertical margin below floor (2,700 ft >= 2,500 ft) is inside margin
    expect(
      isPointInside3dVolume({ xNm: 0, yNm: 0, altitudeFt: 2700 }, SYNTHETIC_CLASS_B_VOLUME),
    ).toBe(true);

    // Above ceiling (11,000 ft > 10,000 + 500 = 10,500 ft) is outside
    expect(
      isPointInside3dVolume({ xNm: 0, yNm: 0, altitudeFt: 11000 }, SYNTHETIC_CLASS_B_VOLUME),
    ).toBe(false);

    // Outside horizontal bounds (> 5 NM + 1 NM margin = 6 NM)
    expect(
      isPointInside3dVolume({ xNm: 7, yNm: 0, altitudeFt: 5000 }, SYNTHETIC_CLASS_B_VOLUME),
    ).toBe(false);

    // Within horizontal margin (5.5 NM <= 5 + 1.0 NM margin)
    expect(
      isPointInside3dVolume({ xNm: 5.5, yNm: 0, altitudeFt: 5000 }, SYNTHETIC_CLASS_B_VOLUME),
    ).toBe(true);
  });

  test("Swept 3D segment collision detects direct penetration", () => {
    const p1: Point3D = { xNm: -10, yNm: 0, altitudeFt: 5000 };
    const p2: Point3D = { xNm: 10, yNm: 0, altitudeFt: 5000 };

    // Flies directly through the box at 5,000 ft
    expect(checkSweptSegmentVolumeCollision(p1, p2, SYNTHETIC_CLASS_B_VOLUME)).toBe(true);

    // Flies safely under the shelf at 2,000 ft (< 2,500 ft with margin)
    const pUnder1: Point3D = { xNm: -10, yNm: 0, altitudeFt: 2000 };
    const pUnder2: Point3D = { xNm: 10, yNm: 0, altitudeFt: 2000 };
    expect(checkSweptSegmentVolumeCollision(pUnder1, pUnder2, SYNTHETIC_CLASS_B_VOLUME)).toBe(
      false,
    );

    // Flies safely outside the horizontal box (y = 10 NM > 5 + 1 NM)
    const pClear1: Point3D = { xNm: -10, yNm: 10, altitudeFt: 5000 };
    const pClear2: Point3D = { xNm: 10, yNm: 10, altitudeFt: 5000 };
    expect(checkSweptSegmentVolumeCollision(pClear1, pClear2, SYNTHETIC_CLASS_B_VOLUME)).toBe(
      false,
    );
  });

  test("Swept 3D segment detects climbing and descending penetration", () => {
    // Climbs from 2,000 ft (under shelf) to 6,000 ft (inside shelf) while crossing the box
    const pClimb1: Point3D = { xNm: -8, yNm: 0, altitudeFt: 2000 };
    const pClimb2: Point3D = { xNm: 8, yNm: 0, altitudeFt: 6000 };
    expect(checkSweptSegmentVolumeCollision(pClimb1, pClimb2, SYNTHETIC_CLASS_B_VOLUME)).toBe(true);

    // Descends from 12,000 ft (above shelf) to 4,000 ft (inside shelf) while crossing
    const pDesc1: Point3D = { xNm: -8, yNm: 0, altitudeFt: 12000 };
    const pDesc2: Point3D = { xNm: 8, yNm: 0, altitudeFt: 4000 };
    expect(checkSweptSegmentVolumeCollision(pDesc1, pDesc2, SYNTHETIC_CLASS_B_VOLUME)).toBe(true);
  });

  test("Multi-leg route safety check evaluates intermediate turns", () => {
    // Route turns around the box: (-10, 0) -> (-10, 10) -> (10, 10) -> (10, 0)
    const safeRoute: Point3D[] = [
      { xNm: -10, yNm: 0, altitudeFt: 4500 },
      { xNm: -10, yNm: 10, altitudeFt: 4500 },
      { xNm: 10, yNm: 10, altitudeFt: 4500 },
      { xNm: 10, yNm: 0, altitudeFt: 4500 },
    ];
    expect(isRouteSafeFromAvoidance(safeRoute, [SYNTHETIC_CLASS_B_VOLUME])).toBe(true);

    // Route that cuts through corner of the box
    const cuttingRoute: Point3D[] = [
      { xNm: -10, yNm: 0, altitudeFt: 4500 },
      { xNm: 0, yNm: 0, altitudeFt: 4500 }, // in box!
      { xNm: 10, yNm: 0, altitudeFt: 4500 },
    ];
    expect(isRouteSafeFromAvoidance(cuttingRoute, [SYNTHETIC_CLASS_B_VOLUME])).toBe(false);
  });

  test("Bounded route planner skips with NO_SAFE_ROUTE when airspace completely blocks the box", () => {
    // Box entirely enclosed by the Class B volume
    const trappedBox: VfrTrainingBox = {
      centerNm: { xNm: 0, yNm: 0 },
      halfExtentNm: 3,
    };

    let callCount = 0;
    const deterministicRng = () => {
      callCount++;
      return (callCount * 0.17) % 1;
    };

    const planned = planSafeVfrRoute({
      mission: "LOCAL",
      box: trappedBox,
      altitudeFt: 5000,
      speedKt: 110,
      avoidanceVolumes: [SYNTHETIC_CLASS_B_VOLUME],
      rng: deterministicRng,
      maxAttempts: 5,
    });

    expect(planned).toBeNull();
  });

  test("Training-box sampler stays uniform inside [-half, +half] and repeats per seed", () => {
    expect(VFR_TRAINING_HALF_EXTENT_NM).toBe(30);
    const box: VfrTrainingBox = {
      centerNm: { xNm: 0, yNm: 0 },
      halfExtentNm: VFR_TRAINING_HALF_EXTENT_NM,
    };

    let seed = 7;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    let sumX = 0;
    let sumY = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const pt = samplePointInBox(box, rng);
      expect(pt.xNm).toBeGreaterThanOrEqual(-VFR_TRAINING_HALF_EXTENT_NM);
      expect(pt.xNm).toBeLessThanOrEqual(VFR_TRAINING_HALF_EXTENT_NM);
      expect(pt.yNm).toBeGreaterThanOrEqual(-VFR_TRAINING_HALF_EXTENT_NM);
      expect(pt.yNm).toBeLessThanOrEqual(VFR_TRAINING_HALF_EXTENT_NM);
      sumX += pt.xNm;
      sumY += pt.yNm;
    }
    // Uniform over a symmetric box: means near the center.
    expect(Math.abs(sumX / n)).toBeLessThan(1.5);
    expect(Math.abs(sumY / n)).toBeLessThan(1.5);

    const replay = (seedValue: number) => {
      let s = seedValue;
      const r = () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
      return [samplePointInBox(box, r), samplePointInBox(box, r)];
    };
    expect(replay(99)).toEqual(replay(99));
    expect(replay(99)).not.toEqual(replay(100));
  });
});

describe("T04-71 Autonomous waypoint navigation and natural exits", () => {
  test("Local traffic follows waypoints inside the box, dwells, and exits at boundary", () => {
    const ac = makeTestAircraft({
      callsign: "N12345",
      xNm: 15,
      yNm: 15,
      headingDeg: 360,
      altitudeFt: 3500,
      speedKt: 110,
      flightRules: "VFR",
      squawk: "1200",
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "north",
        spawnedAtSimMs: 0,
        dwellUntilSimMs: 1000,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [
          { xNm: 15, yNm: 20, altitudeFt: 3500, speedKt: 110, targetToleranceNm: 1.0 },
          { xNm: 20, yNm: 20, altitudeFt: 3500, speedKt: 110, targetToleranceNm: 1.0 },
        ],
        waypointIndex: 0,
      },
    });

    // Step toward first waypoint (15, 20)
    const step1 = stepVfrAircraftNavigation(ac, 0, 0);
    expect(step1.exited).toBe(false);
    expect(ac.intent.assignedHeadingDeg % 360).toBe(0); // pointing north

    // Reach first waypoint
    ac.xNm = 15;
    ac.yNm = 19.5;
    stepVfrAircraftNavigation(ac, 100, 0);
    expect(ac.ambientVfr?.waypointIndex).toBe(1); // sequenced to next waypoint

    // Reach second waypoint and dwell expires
    ac.xNm = 20;
    ac.yNm = 19.5;
    stepVfrAircraftNavigation(ac, 1500, 0);
    expect(ac.ambientVfr?.phase).toBe("EXITING");

    // Aircraft flies beyond 28 NM boundary
    ac.xNm = 29;
    ac.yNm = 20;
    const stepExit = stepVfrAircraftNavigation(ac, 2000, 0);
    expect(stepExit.exited).toBe(true);
  });

  test("Transit traffic crosses corridor and exits at TRACON boundary", () => {
    const ac = makeTestAircraft({
      callsign: "N98765",
      xNm: -25,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 4500,
      speedKt: 120,
      flightRules: "VFR",
      squawk: "1200",
      ambientVfr: {
        mission: "TRANSIT",
        zoneId: "corridor",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [
          { xNm: 0, yNm: 20, altitudeFt: 4500, speedKt: 120, targetToleranceNm: 1.5 },
          { xNm: 30, yNm: 20, altitudeFt: 4500, speedKt: 120, targetToleranceNm: 2.0 },
        ],
        waypointIndex: 0,
      },
    });

    // Step toward first waypoint
    stepVfrAircraftNavigation(ac, 0, 0);
    expect(ac.intent.assignedHeadingDeg).toBeGreaterThan(0);

    // Sequence to exit leg and fly past 28 NM
    ac.ambientVfr!.waypointIndex = 1;
    ac.xNm = 29;
    ac.yNm = 10;
    const res = stepVfrAircraftNavigation(ac, 5000, 0);
    expect(res.exited).toBe(true);
    expect(res.handoff).toBe(false);
  });

  test("Airport-bound traffic routes to destination and hands off to tower", () => {
    const ac = makeTestAircraft({
      callsign: "N42B",
      xNm: 5,
      yNm: 5,
      headingDeg: 45,
      altitudeFt: 3500,
      speedKt: 110,
      flightRules: "VFR",
      squawk: "1200",
      ambientVfr: {
        mission: "AIRPORT_BOUND",
        zoneId: "south",
        destinationAirportId: "KSAT",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [
          { xNm: 8, yNm: 11, altitudeFt: 2500, speedKt: 110, targetToleranceNm: 1.5 },
          { xNm: 12, yNm: 18, altitudeFt: 1850, speedKt: 100, targetToleranceNm: 2.0 },
        ],
        waypointIndex: 0,
      },
    });

    // Step 1: en route
    const step1 = stepVfrAircraftNavigation(ac, 0, 0);
    expect(step1.exited).toBe(false);
    expect(step1.handoff).toBe(false);

    // Sequence to destination waypoint
    ac.ambientVfr!.waypointIndex = 2; // reaches end of waypoints
    const step2 = stepVfrAircraftNavigation(ac, 3000, 0);
    expect(step2.exited).toBe(true);
    expect(step2.handoff).toBe(true);
  });
});

// Synthetic arc shelf: straight edge (-8, 0), then a clockwise arc around
// (0, 0) with radius 8 ending at (8, 0), forming a northern half-disc.
const ARC_SHELF_VOLUME: RegionalAirspaceVolume = {
  id: "UC:KSYN:B_ARC",
  name: "SYNTHETIC BRAVO ARC SHELF",
  type: "CONTROLLED",
  class: "B",
  centerAirportId: "KSYN",
  lowerLimit: { altitudeFt: 3000, unit: "MSL", reference: "MSL" },
  upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
  lowerLimitFt: 3000,
  upperLimitFt: 10000,
  segments: [
    {
      sequence: 10,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: -8, yNm: 0 },
    },
    {
      sequence: 20,
      boundaryVia: "R",
      boundaryViaType: "CLOCKWISE_ARC",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: 8, yNm: 0 },
      arcOrigin: { latDeg: 0, lonDeg: 0 },
      arcOriginNm: { xNm: 0, yNm: 0 },
      arcDistanceNm: 8,
      arcBearingDeg: 90,
    },
  ],
};

// Synthetic lone arc: single arc record with no chain predecessor.
const LONE_ARC_VOLUME: RegionalAirspaceVolume = {
  id: "UC:KSYN:B_LONE",
  name: "SYNTHETIC BRAVO LONE ARC",
  type: "CONTROLLED",
  class: "B",
  centerAirportId: "KSYN",
  lowerLimit: { altitudeFt: 3000, unit: "MSL", reference: "MSL" },
  upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
  lowerLimitFt: 3000,
  upperLimitFt: 10000,
  segments: [
    {
      sequence: 10,
      boundaryVia: "R",
      boundaryViaType: "CLOCKWISE_ARC",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: 4, yNm: 0 },
      arcOrigin: { latDeg: 0, lonDeg: 0 },
      arcOriginNm: { xNm: 0, yNm: 0 },
      arcDistanceNm: 4,
      arcBearingDeg: 90,
    },
  ],
};

function singlePointFragment(
  id: string,
  xNm: number,
  yNm: number,
  floorFt: number,
  center = "KSYN",
): RegionalAirspaceVolume {
  return {
    id,
    name: "SYNTHETIC FRAGMENTED BRAVO",
    type: "CONTROLLED",
    class: "B",
    centerAirportId: center,
    lowerLimit: { altitudeFt: floorFt, unit: "MSL", reference: "MSL" },
    upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
    lowerLimitFt: floorFt,
    upperLimitFt: 10000,
    segments: [
      {
        sequence: 10,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 0, lonDeg: 0 },
        positionNm: { xNm, yNm },
      },
    ],
  };
}

// Fragmented-shelf fixture: six single-point volumes sharing center + class,
// mimicking per-record importer fragmentation. Hull spans roughly x/y ±20.
const FRAGMENTED_VOLUMES: RegionalAirspaceVolume[] = [
  singlePointFragment("UC:KSYN:B-F1", -20, -15, 2500),
  singlePointFragment("UC:KSYN:B-F2", 20, -15, 2500),
  singlePointFragment("UC:KSYN:B-F3", 20, 15, 3000),
  singlePointFragment("UC:KSYN:B-F4", -20, 15, 3500),
  singlePointFragment("UC:KSYN:B-F5", 0, 22, 4000),
  singlePointFragment("UC:KSYN:B-F6", 0, -22, 5000),
];

const SMALL_FRAGMENTED_VOLUMES: RegionalAirspaceVolume[] = [
  singlePointFragment("UC:KSYN:B-S1", -6, -4, 2500),
  singlePointFragment("UC:KSYN:B-S2", 6, -4, 2500),
  singlePointFragment("UC:KSYN:B-S3", 6, 4, 3000),
  singlePointFragment("UC:KSYN:B-S4", -6, 4, 3500),
  singlePointFragment("UC:KSYN:B-S5", 0, 7, 4000),
  singlePointFragment("UC:KSYN:B-S6", 0, -7, 5000),
];

describe("VFR arc tessellation and fragmented-shelf fallback", () => {
  test("Chained arc tessellates the bulge into the polygon", () => {
    const poly = extractVolumePolygonNm(ARC_SHELF_VOLUME);
    expect(poly.length).toBeGreaterThan(3);
    // Northern arc apex near (0, 8) must be sampled (5° tessellation).
    const nearApex = poly.some((p) => Math.hypot(p.xNm - 0, p.yNm - 8) < 0.6);
    expect(nearApex).toBe(true);
    // Point inside the northern half-disc is inside; southern mirror is outside.
    expect(isPointInside3dVolume({ xNm: 0, yNm: 4, altitudeFt: 5000 }, ARC_SHELF_VOLUME)).toBe(
      true,
    );
    expect(isPointInside3dVolume({ xNm: 0, yNm: -4, altitudeFt: 5000 }, ARC_SHELF_VOLUME)).toBe(
      false,
    );
    // Swept route through the bulge is unsafe; route under the shelf is safe.
    expect(
      isRouteSafeFromAvoidance(
        [
          { xNm: -12, yNm: 4, altitudeFt: 5000 },
          { xNm: 12, yNm: 4, altitudeFt: 5000 },
        ],
        [ARC_SHELF_VOLUME],
      ),
    ).toBe(false);
    expect(
      isRouteSafeFromAvoidance(
        [
          { xNm: -12, yNm: -4, altitudeFt: 5000 },
          { xNm: 12, yNm: -4, altitudeFt: 5000 },
        ],
        [ARC_SHELF_VOLUME],
      ),
    ).toBe(true);
  });

  test("Lone arc falls back to a full circle around its origin", () => {
    const poly = extractVolumePolygonNm(LONE_ARC_VOLUME);
    expect(poly.length).toBeGreaterThanOrEqual(3);
    expect(
      isPointInsideAvoidanceVolumes({ xNm: 0, yNm: 0, altitudeFt: 5000 }, [LONE_ARC_VOLUME]),
    ).toBe(true);
    // Outside radius + horizontal margin.
    expect(
      isPointInsideAvoidanceVolumes({ xNm: 6, yNm: 0, altitudeFt: 5000 }, [LONE_ARC_VOLUME]),
    ).toBe(false);
    // Altitude outside the shelf band stays outside.
    expect(
      isPointInsideAvoidanceVolumes({ xNm: 0, yNm: 0, altitudeFt: 1500 }, [LONE_ARC_VOLUME]),
    ).toBe(false);
  });

  test("Single-point fragments are degenerate alone but merge into one hull", () => {
    for (const vol of FRAGMENTED_VOLUMES) {
      expect(isDegenerateAvoidanceVolume(vol)).toBe(true);
    }
    expect(isDegenerateAvoidanceVolume(SYNTHETIC_CLASS_B_VOLUME)).toBe(false);
    const grouped = buildGroupedAvoidanceVolumes(FRAGMENTED_VOLUMES);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.id.startsWith("GROUPED:")).toBe(true);
    expect(grouped[0]!.segments.length).toBeGreaterThanOrEqual(3);
    // Vertical band spans the fragment floors to the shared ceiling.
    expect(grouped[0]!.lowerLimitFt).toBe(2500);
    expect(grouped[0]!.upperLimitFt).toBe(10000);
  });

  test("Fragments from another center do not merge into the hull", () => {
    const mixed = [...FRAGMENTED_VOLUMES, singlePointFragment("UC:KOTH:B-X", 0, 0, 0, "KOTH")];
    // One hull for KSYN; the lone KOTH point cannot form a polygon.
    expect(buildGroupedAvoidanceVolumes(mixed)).toHaveLength(1);
  });

  test("Point and route checks respect the fragmented hull including altitude", () => {
    // Center at shelf altitude is inside the grouped hull.
    expect(
      isPointInsideAvoidanceVolumes({ xNm: 0, yNm: 0, altitudeFt: 5000 }, FRAGMENTED_VOLUMES),
    ).toBe(true);
    // Below the lowest shelf floor (minus margin) and above the ceiling are outside.
    expect(
      isPointInsideAvoidanceVolumes({ xNm: 0, yNm: 0, altitudeFt: 1500 }, FRAGMENTED_VOLUMES),
    ).toBe(false);
    expect(
      isPointInsideAvoidanceVolumes({ xNm: 0, yNm: 0, altitudeFt: 11000 }, FRAGMENTED_VOLUMES),
    ).toBe(false);
    // Far outside the hull is outside.
    expect(
      isPointInsideAvoidanceVolumes({ xNm: 40, yNm: 40, altitudeFt: 5000 }, FRAGMENTED_VOLUMES),
    ).toBe(false);
    // A route cutting through the hull is unsafe; a route around it is safe.
    expect(
      isRouteSafeFromAvoidance(
        [
          { xNm: -30, yNm: 0, altitudeFt: 5000 },
          { xNm: 30, yNm: 0, altitudeFt: 5000 },
        ],
        FRAGMENTED_VOLUMES,
      ),
    ).toBe(false);
    expect(
      isRouteSafeFromAvoidance(
        [
          { xNm: -30, yNm: 30, altitudeFt: 5000 },
          { xNm: 30, yNm: 30, altitudeFt: 5000 },
        ],
        FRAGMENTED_VOLUMES,
      ),
    ).toBe(true);
  });

  test("Planner rejects spawns trapped inside fragmented Bravo", () => {
    const trappedBox: VfrTrainingBox = { centerNm: { xNm: 0, yNm: 0 }, halfExtentNm: 3 };
    let callCount = 0;
    const rng = () => {
      callCount++;
      return (callCount * 0.17) % 1;
    };
    expect(
      planSafeVfrRoute({
        mission: "LOCAL",
        box: trappedBox,
        altitudeFt: 5000,
        speedKt: 110,
        avoidanceVolumes: FRAGMENTED_VOLUMES,
        rng,
        maxAttempts: 5,
      }),
    ).toBeNull();
  });

  test("Per-tick guard deflects heading when the probe would enter Bravo", () => {
    const ac = makeTestAircraft({
      callsign: "NGUARD",
      xNm: -15,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 5000,
      speedKt: 110,
      flightRules: "VFR",
      squawk: "1200",
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "test",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [{ xNm: 15, yNm: 0, altitudeFt: 5000, speedKt: 110, targetToleranceNm: 1.0 }],
        waypointIndex: 0,
      },
    });
    stepVfrAircraftNavigation(ac, 0, 0, null, FRAGMENTED_VOLUMES);
    // Direct course is due east (90); the guard must turn away.
    expect(ac.intent.assignedHeadingDeg).not.toBe(90);
  });

  test("Per-tick guard leaves clear-air headings untouched", () => {
    const ac = makeTestAircraft({
      callsign: "NCLEAR",
      xNm: -40,
      yNm: -40,
      headingDeg: 225,
      altitudeFt: 5000,
      speedKt: 110,
      flightRules: "VFR",
      squawk: "1200",
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "test",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [{ xNm: -45, yNm: -45, altitudeFt: 5000, speedKt: 110, targetToleranceNm: 1.0 }],
        waypointIndex: 0,
      },
    });
    stepVfrAircraftNavigation(ac, 0, 0, null, FRAGMENTED_VOLUMES);
    // Course from (-40,-40) to (-45,-45) is southwest (225 true, magVar 0).
    expect(ac.intent.assignedHeadingDeg).toBe(225);
  });
});

function plannerRegional(
  airspaces: RegionalAirspaceVolume[],
  destination?: { icao: string; xNm: number; yNm: number },
): RegionalFacility {
  const airports: RegionalAirport[] = destination
    ? [
        {
          icao: destination.icao,
          name: "Synthetic destination",
          arp: { latDeg: 33, lonDeg: -84 },
          arpNm: { xNm: destination.xNm, yNm: destination.yNm },
          fieldElevFt: 500,
          magVarDeg: 0,
          publicUse: true,
          towered: true,
          eligible: true,
          runways: [],
          hasPublishedApproaches: false,
        },
      ]
    : [];
  return { airspaces, airports } as unknown as RegionalFacility;
}

describe("T04-92 continuation planner contract", () => {
  test("plans around grouped fragmented shelves instead of preserving a crossing suffix", () => {
    const aircraft = makeTestAircraft({
      xNm: -30,
      yNm: 0,
      altitudeFt: 5000,
      speedKt: 110,
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "TEST_ZONE",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [{ xNm: 30, yNm: 0, altitudeFt: 5000, speedKt: 110, targetToleranceNm: 1 }],
        waypointIndex: 0,
      },
      destination: "KDEST",
    });

    const plan = planSafeVfrContinuation(
      aircraft,
      plannerRegional(SMALL_FRAGMENTED_VOLUMES, { icao: "KDEST", xNm: 30, yNm: 0 }),
    );

    expect(plan).not.toBeNull();
    expect(plan!.waypoints.length).toBe(2);
    expect(plan!.waypointIndex).toBe(0);
    expect(
      isRouteSafeFromAvoidance(
        [
          { xNm: aircraft.xNm, yNm: aircraft.yNm, altitudeFt: aircraft.altitudeFt },
          ...plan!.waypoints.map(({ xNm, yNm, altitudeFt }) => ({
            xNm,
            yNm,
            altitudeFt: altitudeFt ?? aircraft.altitudeFt,
          })),
        ],
        SMALL_FRAGMENTED_VOLUMES,
      ),
    ).toBe(true);
    expect(plan!.waypoints[0]!.yNm).not.toBe(0);
  });

  test("preserves a direct suffix below and above the Class B vertical band", () => {
    const regional = plannerRegional([SYNTHETIC_CLASS_B_VOLUME]);
    const makeAircraft = (altitudeFt: number) =>
      makeTestAircraft({
        xNm: -10,
        yNm: 0,
        altitudeFt,
        ambientVfr: {
          mission: "LOCAL",
          zoneId: "TEST_ZONE",
          spawnedAtSimMs: 0,
          alertEligibility: "AMBIENT_SUPPRESSED",
          waypoints: [{ xNm: 10, yNm: 0, altitudeFt, speedKt: 110, targetToleranceNm: 1 }],
          waypointIndex: 0,
        },
      });

    const below = planSafeVfrContinuation(makeAircraft(2000), regional);
    const above = planSafeVfrContinuation(makeAircraft(11000), regional);

    expect(below?.waypoints).toEqual([
      { xNm: 10, yNm: 0, altitudeFt: 2000, speedKt: 110, targetToleranceNm: 1 },
    ]);
    expect(above?.waypoints).toEqual([
      { xNm: 10, yNm: 0, altitudeFt: 11000, speedKt: 110, targetToleranceNm: 1 },
    ]);
  });

  test("rejects an unsafe suffix when there is no destination target", () => {
    const aircraft = makeTestAircraft({
      xNm: -10,
      yNm: 0,
      altitudeFt: 5000,
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "TEST_ZONE",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [{ xNm: 10, yNm: 0, altitudeFt: 5000, speedKt: 110, targetToleranceNm: 1 }],
        waypointIndex: 0,
      },
    });

    expect(planSafeVfrContinuation(aircraft, plannerRegional([SYNTHETIC_CLASS_B_VOLUME]))).toBe(
      null,
    );
  });

  test("returns a deterministic dogleg when the direct destination route is unsafe", () => {
    const makeAircraft = () =>
      makeTestAircraft({
        xNm: -10,
        yNm: 0,
        altitudeFt: 5000,
        speedKt: 110,
        ambientVfr: {
          mission: "LOCAL",
          zoneId: "TEST_ZONE",
          spawnedAtSimMs: 0,
          alertEligibility: "AMBIENT_SUPPRESSED",
          waypoints: [{ xNm: 10, yNm: 0, altitudeFt: 5000, speedKt: 110, targetToleranceNm: 1 }],
          waypointIndex: 0,
        },
        destination: "KDEST",
      });
    const regional = plannerRegional([SYNTHETIC_CLASS_B_VOLUME], {
      icao: "KDEST",
      xNm: 10,
      yNm: 0,
    });

    const first = planSafeVfrContinuation(makeAircraft(), regional);
    const second = planSafeVfrContinuation(makeAircraft(), regional);

    expect(first).not.toBeNull();
    expect(first).toEqual(second);
    expect(first!.waypoints).toHaveLength(2);
    expect(first!.waypoints[0]!.yNm).not.toBe(0);
    expect(
      isRouteSafeFromAvoidance(
        [
          { xNm: -10, yNm: 0, altitudeFt: 5000 },
          ...first!.waypoints.map(({ xNm, yNm, altitudeFt }) => ({
            xNm,
            yNm,
            altitudeFt: altitudeFt ?? 5000,
          })),
        ],
        [SYNTHETIC_CLASS_B_VOLUME],
      ),
    ).toBe(true);
  });
});

describe("T04-79 Satellite-departure minimal leg", () => {
  const ORIGIN_AIRPORT: RegionalAirport = {
    icao: "KXSA",
    name: "SYNTHETIC SATELLITE",
    arp: { latDeg: 34.18, lonDeg: -85.0 },
    arpNm: { xNm: 0, yNm: 10.8 },
    fieldElevFt: 800,
    magVarDeg: 0,
    publicUse: true,
    towered: true,
    eligible: true,
    runways: [
      {
        id: "09",
        threshold: { latDeg: 34.18, lonDeg: -85.0 },
        thresholdNm: { xNm: 0, yNm: 10.8 },
        headingTrueDeg: 90,
        headingMagDeg: 90,
        lengthFt: 6000,
      },
    ],
    hasPublishedApproaches: true,
  };

  const BOX: VfrTrainingBox = { centerNm: { xNm: 0, yNm: 0 }, halfExtentNm: 30 };

  test("SATELLITE_DEPARTURE without an origin airport plans nothing", () => {
    expect(
      planSafeVfrRoute({
        mission: "SATELLITE_DEPARTURE",
        box: BOX,
        altitudeFt: 4000,
        speedKt: 110,
        avoidanceVolumes: [],
        rng: () => 0.5,
      }),
    ).toBeNull();
  });

  test("Prefed liftoff yields a runway-aligned corridor climb near the origin ARP", () => {
    let routeDraws = 0;
    const rng = () => {
      routeDraws++;
      return 0.5;
    };
    const route = planSafeVfrRoute({
      mission: "SATELLITE_DEPARTURE",
      box: BOX,
      altitudeFt: 4000,
      speedKt: 110,
      originAirport: ORIGIN_AIRPORT,
      liftoffPose: { xNm: 0.5, yNm: 11.3, altitudeFt: 2000, headingDeg: 90, speedKt: 110 },
      magVarDeg: 0,
      avoidanceVolumes: [],
      rng,
    });
    expect(route).not.toBeNull();
    expect(
      Math.hypot(
        route!.spawnPose.xNm - ORIGIN_AIRPORT.arpNm.xNm,
        route!.spawnPose.yNm - ORIGIN_AIRPORT.arpNm.yNm,
      ),
    ).toBeLessThanOrEqual(2);
    expect(route!.spawnPose.headingDeg).toBe(90);
    // Corridor: runway-heading climb + 1-2 wobble intermediates + exit.
    expect(route!.waypoints.length).toBeGreaterThanOrEqual(3);
    expect(route!.waypoints.length).toBeLessThanOrEqual(4);
    // First waypoint climbs on runway heading 090 (due east, constant y).
    const climb = route!.waypoints[0]!;
    expect(climb.altitudeFt).toBe(4000);
    expect(Math.abs(climb.yNm - route!.spawnPose.yNm)).toBeLessThan(1e-6);
    const legLen = Math.hypot(climb.xNm - route!.spawnPose.xNm, climb.yNm - route!.spawnPose.yNm);
    expect(legLen).toBeGreaterThanOrEqual(5);
    expect(legLen).toBeLessThanOrEqual(8);
    // Exit waypoint at exitRadiusNm + 2 (default 28 + 2 = 30) radially outward.
    const exit = route!.waypoints[route!.waypoints.length - 1]!;
    expect(Math.hypot(exit.xNm, exit.yNm)).toBeCloseTo(30, 6);
    expect(exit.altitudeFt).toBe(4000);
    // Corridor geometry consumes the route stream.
    expect(routeDraws).toBeGreaterThan(0);
  });

  test("Bravo avoidance margins are unchanged", () => {
    expect(CLASS_B_HORIZONTAL_MARGIN_NM).toBe(1.0);
    expect(CLASS_B_VERTICAL_MARGIN_FT).toBe(500);
  });
});

describe("T04-80 Satellite-departure line corridor", () => {
  const ORIGIN: RegionalAirport = {
    icao: "KXSB",
    name: "SYNTHETIC SATELLITE B",
    arp: { latDeg: 34.0, lonDeg: -85.0 },
    arpNm: { xNm: 0, yNm: 9 },
    fieldElevFt: 800,
    magVarDeg: 0,
    publicUse: true,
    towered: true,
    eligible: true,
    runways: [
      {
        id: "36",
        threshold: { latDeg: 34.0, lonDeg: -85.0 },
        thresholdNm: { xNm: 0, yNm: 9 },
        headingTrueDeg: 0,
        headingMagDeg: 0,
        lengthFt: 6000,
      },
    ],
    hasPublishedApproaches: true,
  };

  const CORRIDOR_BOX: VfrTrainingBox = { centerNm: { xNm: 0, yNm: 0 }, halfExtentNm: 30 };

  function boxShelf(
    id: string,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    floorFt: number,
    ceilingFt: number,
  ): RegionalAirspaceVolume {
    return {
      id,
      name: "SYNTHETIC DEPARTURE SHELF",
      type: "CONTROLLED",
      class: "B",
      centerAirportId: "KSYN",
      lowerLimit: { altitudeFt: floorFt, unit: "MSL", reference: "MSL" },
      upperLimit: { altitudeFt: ceilingFt, unit: "MSL", reference: "MSL" },
      lowerLimitFt: floorFt,
      upperLimitFt: ceilingFt,
      segments: [
        {
          sequence: 1,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position: { latDeg: 0, lonDeg: 0 },
          positionNm: { xNm: x0, yNm: y0 },
        },
        {
          sequence: 2,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position: { latDeg: 0, lonDeg: 0 },
          positionNm: { xNm: x1, yNm: y0 },
        },
        {
          sequence: 3,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position: { latDeg: 0, lonDeg: 0 },
          positionNm: { xNm: x1, yNm: y1 },
        },
        {
          sequence: 4,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position: { latDeg: 0, lonDeg: 0 },
          positionNm: { xNm: x0, yNm: y1 },
        },
      ],
    };
  }

  /** Deterministic LCG stream in [0, 1). */
  function seededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function planDeparture(
    rng: () => number,
    avoidanceVolumes: readonly RegionalAirspaceVolume[] = [],
  ) {
    return planSafeVfrRoute({
      mission: "SATELLITE_DEPARTURE",
      box: CORRIDOR_BOX,
      altitudeFt: 5000,
      speedKt: 110,
      originAirport: ORIGIN,
      liftoffPose: { xNm: 0, yNm: 10, altitudeFt: 5000, headingDeg: 0, speedKt: 110 },
      magVarDeg: 0,
      avoidanceVolumes,
      rng,
    });
  }

  test("wobble stays within 3 NM, exit targets exitRadiusNm + 2, replay is deterministic", () => {
    expect(SATELLITE_DEPARTURE_WOBBLE_MAX_NM).toBe(3);
    for (let seed = 1; seed <= 40; seed++) {
      const route = planDeparture(seededRng(seed));
      expect(route).not.toBeNull();
      const liftoff = { xNm: route!.spawnPose.xNm, yNm: route!.spawnPose.yNm };
      const exit = route!.waypoints[route!.waypoints.length - 1]!;
      // Exit at 28 + 2 NM radially outward through the liftoff pose (due north here).
      expect(Math.hypot(exit.xNm, exit.yNm)).toBeCloseTo(30, 6);
      expect(exit.xNm).toBeCloseTo(0, 6);
      expect(exit.yNm).toBeCloseTo(30, 6);
      // Climb waypoint holds cruise; intermediates deviate at most 3 NM.
      expect(route!.waypoints[0]!.altitudeFt).toBe(5000);
      for (const mid of route!.waypoints.slice(1, -1)) {
        expect(mid.altitudeFt).toBe(5000);
        expect(distPointToSegment(mid, liftoff, exit)).toBeLessThanOrEqual(3 + 1e-9);
      }
      // Deterministic replay with the same seed.
      const replay = planDeparture(seededRng(seed));
      expect(replay).toEqual(route);
    }
  });

  test("shelf on the direct course escalates across attempts or fails closed, never penetrates", () => {
    // Narrow shelf astride the direct x=0 course: near-direct attempts
    // penetrate, later attempts dogleg within the 3 NM cap.
    const shelf = boxShelf("UC:KSYN:B_NARROW", -0.5, 0.5, 22, 24, 3000, 8000);
    const scripted = [
      0.5, 0.0, 0.9, 0.05, 0.0, 0.0, 0.9, 0.99, 0.0, 0.0, 0.9, 0.99, 0.0, 0.0, 0.9, 0.99, 0.0, 0.0,
      0.9, 0.99,
    ];
    let cursor = 0;
    const rng = () => scripted[cursor++] ?? 0.99;
    // Attempt 0 alone is near-direct and must fail closed.
    cursor = 0;
    expect(
      planSafeVfrRoute({
        mission: "SATELLITE_DEPARTURE",
        box: CORRIDOR_BOX,
        altitudeFt: 5000,
        speedKt: 110,
        originAirport: ORIGIN,
        liftoffPose: { xNm: 0, yNm: 10, altitudeFt: 5000, headingDeg: 0, speedKt: 110 },
        magVarDeg: 0,
        avoidanceVolumes: [shelf],
        rng,
        maxAttempts: 1,
      }),
    ).toBeNull();
    // With escalation the planner clears the shelf inside the wobble cap.
    cursor = 0;
    const route = planSafeVfrRoute({
      mission: "SATELLITE_DEPARTURE",
      box: CORRIDOR_BOX,
      altitudeFt: 5000,
      speedKt: 110,
      originAirport: ORIGIN,
      liftoffPose: { xNm: 0, yNm: 10, altitudeFt: 5000, headingDeg: 0, speedKt: 110 },
      magVarDeg: 0,
      avoidanceVolumes: [shelf],
      rng,
    });
    expect(route).not.toBeNull();
    const liftoff = {
      xNm: route!.spawnPose.xNm,
      yNm: route!.spawnPose.yNm,
      altitudeFt: route!.spawnPose.altitudeFt,
    };
    const full = [liftoff, ...route!.waypoints].map((p) => ({
      xNm: p.xNm,
      yNm: p.yNm,
      altitudeFt: p.altitudeFt ?? 5000,
    }));
    expect(isRouteSafeFromAvoidance(full, [shelf])).toBe(true);
    const exit = route!.waypoints[route!.waypoints.length - 1]!;
    for (const mid of route!.waypoints.slice(1, -1)) {
      expect(distPointToSegment(mid, liftoff, exit)).toBeLessThanOrEqual(3 + 1e-9);
    }
  });

  test("parameterized shelves never admit penetration; full blockage fails closed", () => {
    const shelves: RegionalAirspaceVolume[] = [
      boxShelf("UC:KSYN:B_EAST", 4, 8, 10, 24, 3000, 8000),
      boxShelf("UC:KSYN:B_WEST", -8, -4, 10, 24, 3000, 8000),
      boxShelf("UC:KSYN:B_HIGH", -6, 6, 8, 28, 6000, 9000),
      boxShelf("UC:KSYN:B_WIDE", -8, 8, 8, 28, 3000, 8000),
    ];
    for (const shelf of shelves) {
      for (let seed = 1; seed <= 8; seed++) {
        const route = planDeparture(seededRng(seed * 7919), [shelf]);
        if (route === null) continue;
        const liftoff = {
          xNm: route.spawnPose.xNm,
          yNm: route.spawnPose.yNm,
          altitudeFt: route.spawnPose.altitudeFt,
        };
        const full = [liftoff, ...route.waypoints].map((p) => ({
          xNm: p.xNm,
          yNm: p.yNm,
          altitudeFt: p.altitudeFt ?? 5000,
        }));
        expect(isRouteSafeFromAvoidance(full, [shelf])).toBe(true);
        const exit = route.waypoints[route.waypoints.length - 1]!;
        for (const mid of route.waypoints.slice(1, -1)) {
          expect(distPointToSegment(mid, liftoff, exit)).toBeLessThanOrEqual(3 + 1e-9);
        }
      }
    }
    // Shelf swallowing the whole corridor plus wobble range fails closed.
    const blanket = boxShelf("UC:KSYN:B_BLANKET", -8, 8, 4, 34, 2000, 9000);
    expect(planDeparture(seededRng(3), [blanket])).toBeNull();
  });

  test("per-tick guard deflects unplanned departure legs into Bravo", () => {
    const ac = makeTestAircraft({
      callsign: "NDEPG",
      xNm: -8,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 5000,
      speedKt: 110,
      flightRules: "VFR",
      squawk: "1200",
      ambientVfr: {
        mission: "SATELLITE_DEPARTURE",
        zoneId: "test",
        originAirportId: "KXSB",
        departureRunwayId: "36",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [{ xNm: 10, yNm: 0, altitudeFt: 5000, speedKt: 110, targetToleranceNm: 2.0 }],
        waypointIndex: 0,
      },
    });
    stepVfrAircraftNavigation(ac, 0, 0, null, [SYNTHETIC_CLASS_B_VOLUME]);
    expect(ac.intent.assignedHeadingDeg).not.toBe(90);
  });

  test("boundary exit logs vfr.exit BOUNDARY_EXIT with removal and no tower handoff", () => {
    const events: Array<Record<string, unknown>> = [];
    const log = { append: (e: Record<string, unknown>) => events.push(e) } as never;
    const ac = makeTestAircraft({
      callsign: "NDEPX",
      xNm: 0,
      yNm: 29,
      headingDeg: 0,
      altitudeFt: 5000,
      speedKt: 110,
      flightRules: "VFR",
      squawk: "1200",
      ambientVfr: {
        mission: "SATELLITE_DEPARTURE",
        zoneId: "test",
        originAirportId: "KXSB",
        departureRunwayId: "36",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [
          { xNm: 0, yNm: 16, altitudeFt: 5000, speedKt: 110, targetToleranceNm: 2.0 },
          { xNm: 0, yNm: 30, altitudeFt: 5000, speedKt: 110, targetToleranceNm: 2.0 },
        ],
        waypointIndex: 1,
      },
    });
    const res = stepVfrAircraftNavigation(ac, 5000, 0, log);
    expect(res.exited).toBe(true);
    expect(res.handoff).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "vfr.exit",
      callsign: "NDEPX",
      mission: "SATELLITE_DEPARTURE",
      reason: "BOUNDARY_EXIT",
    });
    expect(events.some((e) => e.type === "vfr.tower.handoff")).toBe(false);
  });

  test("departure short of the boundary or still on liftoff sequencing does not exit", () => {
    const events: Array<Record<string, unknown>> = [];
    const log = { append: (e: Record<string, unknown>) => events.push(e) } as never;
    const ac = makeTestAircraft({
      callsign: "NDEPS",
      xNm: 0,
      yNm: 20,
      headingDeg: 0,
      altitudeFt: 5000,
      speedKt: 110,
      flightRules: "VFR",
      squawk: "1200",
      ambientVfr: {
        mission: "SATELLITE_DEPARTURE",
        zoneId: "test",
        originAirportId: "KXSB",
        departureRunwayId: "36",
        spawnedAtSimMs: 0,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints: [
          { xNm: 0, yNm: 16, altitudeFt: 5000, speedKt: 110, targetToleranceNm: 2.0 },
          { xNm: 0, yNm: 30, altitudeFt: 5000, speedKt: 110, targetToleranceNm: 2.0 },
        ],
        waypointIndex: 1,
      },
    });
    // Inside the boundary: still flying, no exit event.
    expect(stepVfrAircraftNavigation(ac, 5000, 0, log).exited).toBe(false);
    // Beyond the boundary but still sequencing liftoff (index 0): no exit yet.
    ac.xNm = 0;
    ac.yNm = 29;
    ac.ambientVfr!.waypointIndex = 0;
    expect(stepVfrAircraftNavigation(ac, 6000, 0, log).exited).toBe(false);
    expect(events).toHaveLength(0);
  });
});
