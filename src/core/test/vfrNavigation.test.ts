import { describe, expect, test } from "vitest";
import { makeTestAircraft } from "../aircraft";
import type { RegionalAirspaceVolume } from "../../scenario/regional";
import {
  buildGroupedAvoidanceVolumes,
  checkSweptSegmentVolumeCollision,
  extractVolumePolygonNm,
  isDegenerateAvoidanceVolume,
  isPointInside3dVolume,
  isPointInsideAvoidanceVolumes,
  isRouteSafeFromAvoidance,
  planSafeVfrRoute,
  samplePointInBox,
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
