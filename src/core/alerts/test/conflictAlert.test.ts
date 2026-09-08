import { expect, test } from "vitest";
import { makeTestAircraft } from "../../aircraft";
import {
  AREA_TIER_PARAMETERS,
  CA_LATERAL_NM,
  CA_VERTICAL_FT,
  caSeverityForCallsign,
  classifyAirspaceTier,
  computeKinematicCpa,
  datablockAlertTint,
  detectPairConflict,
  evaluateConflictAlert,
  getAreaTierParameters,
  pairAirspaceTier,
  resolveCaContextFromCatalog,
  type CaContext,
} from "../conflictAlert";

test("CA constants are the frozen lite trainer thresholds", () => {
  expect(CA_LATERAL_NM).toBe(3);
  expect(CA_VERTICAL_FT).toBe(1000);
});

test("AC1 — 2.0 NM apart, Δalt 200 ft is red (alert)", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: 2,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8200,
    speedKt: 250,
  });
  const alerts = evaluateConflictAlert([dal, aal]);
  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toMatchObject({
    callsignA: "AAL45",
    callsignB: "DAL123",
    severity: "alert",
  });
  expect(alerts[0]!.distNm).toBeCloseTo(2, 5);
  expect(alerts[0]!.deltaAltFt).toBeCloseTo(200, 5);
  expect(caSeverityForCallsign(alerts, "DAL123")).toBe("alert");
  expect(caSeverityForCallsign(alerts, "AAL45")).toBe("alert");
});

test("AC2 — 8 NM head-on at 250 kt co-altitude is not a current CA", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: 8,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const alerts = evaluateConflictAlert([dal, aal]);
  expect(alerts).toEqual([]);
});

test("AC3 — 10 NM parallel co-altitude is not a current CA", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: 0,
    yNm: 10,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 250,
  });
  expect(evaluateConflictAlert([dal, aal])).toEqual([]);
});

test("three aircraft yield two unique undirected pairs", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    altitudeFt: 8000,
    speedKt: 0,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: 2,
    yNm: 0,
    altitudeFt: 8000,
    speedKt: 0,
  });
  const ual = makeTestAircraft({
    id: "ac-ual",
    callsign: "UAL100",
    xNm: 4,
    yNm: 0,
    altitudeFt: 8000,
    speedKt: 0,
  });
  const alerts = evaluateConflictAlert([dal, aal, ual]);
  expect(alerts.map((a) => `${a.callsignA}|${a.callsignB}|${a.severity}`)).toEqual([
    "AAL45|DAL123|alert",
    "AAL45|UAL100|alert",
  ]);
  expect(caSeverityForCallsign(alerts, "UAL100")).toBe("alert");
  expect(caSeverityForCallsign(alerts, "SWA1")).toBeNull();
});

test("self pairs and a single aircraft produce no CA", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 0, yNm: 0 });
  expect(evaluateConflictAlert([])).toEqual([]);
  expect(evaluateConflictAlert([dal])).toEqual([]);
});

test("comments align CA with Raytheon STARS manual TI 6191.409 Section 2.16.3", () => {
  const sources = import.meta.glob("../*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["../conflictAlert.ts"]!;
  expect(src).toMatch(/conflict alert/i);
  expect(src).toMatch(/STARS/);
  expect(src).toMatch(/TI 6191\.409/);
});

test("AC5 — datablockAlertTint follows CA alert > MSAW alert > CA caution > MSAW caution", () => {
  expect(datablockAlertTint({})).toBeNull();
  expect(datablockAlertTint({ ca: null, msaw: null })).toBeNull();
  expect(datablockAlertTint({ ca: "caution" })).toBe("ca-caution");
  expect(datablockAlertTint({ ca: "alert" })).toBe("ca-alert");
  expect(datablockAlertTint({ msaw: "caution" })).toBe("msaw-caution");
  expect(datablockAlertTint({ msaw: "alert" })).toBe("msaw-alert");
  expect(datablockAlertTint({ ca: "caution", msaw: "alert" })).toBe("msaw-alert");
  expect(datablockAlertTint({ ca: "alert", msaw: "alert" })).toBe("ca-alert");
  expect(datablockAlertTint({ ca: "caution", msaw: "caution" })).toBe("ca-caution");
  expect(datablockAlertTint({ ca: "alert", msaw: "caution" })).toBe("ca-alert");
});

test("T02-111: Area Tier parameters match Raytheon STARS manual TI 6191.409 Section 2.16.3", () => {
  expect(AREA_TIER_PARAMETERS[1]).toEqual({
    tier: 1,
    name: "Runway Corridor",
    dSepNm: 0.5,
    hSepFt: 100,
    tLookS: 15,
  });
  expect(AREA_TIER_PARAMETERS[2]).toEqual({
    tier: 2,
    name: "Approach / Runway Capture Box",
    dSepNm: 2.5,
    hSepFt: 500,
    tLookS: 25,
  });
  expect(AREA_TIER_PARAMETERS[3]).toEqual({
    tier: 3,
    name: "Core Terminal",
    dSepNm: 3.0,
    hSepFt: 1000,
    tLookS: 35,
  });
  expect(AREA_TIER_PARAMETERS[4]).toEqual({
    tier: 4,
    name: "Outer Terminal",
    dSepNm: 3.0,
    hSepFt: 1000,
    tLookS: 45,
  });
});

test("T02-111: classifyAirspaceTier evaluates track into Type 1, 2, 3, or 4", () => {
  const context: CaContext = {
    originXNm: 0,
    originYNm: 0,
    fieldElevFt: 100,
    runways: [
      {
        id: "27",
        thresholdXNm: 0,
        thresholdYNm: 0,
        headingDeg: 270,
        lengthNm: 2.0,
        elevationFt: 100,
      },
    ],
    approaches: [
      {
        id: "ILS27",
        thresholdXNm: 0,
        thresholdYNm: 0,
        courseDeg: 270,
        lengthNm: 6.0,
        halfWidthNm: 1.0,
        maxAltFt: 2600,
      },
    ],
  };

  // Type 1: on runway centerline (heading 270 is westbound, so along runway is x < 0)
  // At x = -1.0, y = 0.2 (cross-track 0.2 <= 0.5 NM), alt = 150 ft (50 ft AGL <= 100 ft)
  expect(classifyAirspaceTier({ xNm: -1.0, yNm: 0.2, altitudeFt: 150 }, context)).toBe(1);

  // Exceeds Type 1 altitude (120 ft AGL > 100 ft) -> falls back to Core Terminal (Tier 3)
  expect(classifyAirspaceTier({ xNm: -1.0, yNm: 0.2, altitudeFt: 250 }, context)).toBe(3);

  // Exceeds Type 1 cross-track (0.8 NM > 0.5 NM) -> falls back to Core Terminal (Tier 3)
  expect(classifyAirspaceTier({ xNm: -1.0, yNm: 0.8, altitudeFt: 150 }, context)).toBe(3);

  // Type 2: on final approach course (inbound 270, so approach corridor extends east x > 0)
  // At x = 4.0, y = 0.3 (cross-track 0.3 <= 1.0 NM, dist 4.0 <= 6.0 NM), alt = 2000 ft (< 2600 ft)
  expect(classifyAirspaceTier({ xNm: 4.0, yNm: 0.3, altitudeFt: 2000 }, context)).toBe(2);

  // Exceeds Type 2 distance (7.0 NM > 6.0 NM) -> falls back to Core Terminal (Tier 3)
  expect(classifyAirspaceTier({ xNm: 7.0, yNm: 0.3, altitudeFt: 2000 }, context)).toBe(3);

  // Exceeds Type 2 altitude (2700 ft >= 2600 ft) -> falls back to Core Terminal (Tier 3)
  expect(classifyAirspaceTier({ xNm: 4.0, yNm: 0.3, altitudeFt: 2700 }, context)).toBe(3);

  // Type 3: Core Terminal (<= 12 NM from origin, not in runway or approach corridor)
  expect(
    classifyAirspaceTier({ xNm: 8.0, yNm: 8.0, altitudeFt: 6000 }, context), // dist = ~11.3 NM
  ).toBe(3);

  // Type 4: Outer Terminal (> 12 NM from origin)
  expect(classifyAirspaceTier({ xNm: 15.0, yNm: 0, altitudeFt: 8000 }, context)).toBe(4);
});

test("T02-111: pairAirspaceTier governs separation by min(tierA, tierB)", () => {
  expect(pairAirspaceTier(4, 4)).toBe(4);
  expect(pairAirspaceTier(4, 3)).toBe(3);
  expect(pairAirspaceTier(3, 4)).toBe(3);
  expect(pairAirspaceTier(3, 2)).toBe(2);
  expect(pairAirspaceTier(2, 3)).toBe(2);
  expect(pairAirspaceTier(4, 1)).toBe(1);
  expect(pairAirspaceTier(1, 4)).toBe(1);

  expect(getAreaTierParameters(pairAirspaceTier(4, 3)).tLookS).toBe(35);
  expect(getAreaTierParameters(pairAirspaceTier(3, 2)).dSepNm).toBe(2.5);
  expect(getAreaTierParameters(pairAirspaceTier(2, 1)).hSepFt).toBe(100);
});

test("T02-111: computeKinematicCpa computes exact head-on CPA", () => {
  const trackA = {
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 5000,
    speedKt: 300,
  };
  const trackB = {
    xNm: 10,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 5000,
    speedKt: 300,
  };
  // Rel speed = 600 kt = 600 / 3600 = 1/6 NM/s. Distance = 10 NM -> tCpa = 60 s.
  const cpa = computeKinematicCpa(trackA, trackB);
  expect(cpa.isConverging).toBe(true);
  expect(cpa.tCpaS).toBeCloseTo(60, 4);
  expect(cpa.cpaDistNm).toBeCloseTo(0, 4);
  expect(cpa.currentDistNm).toBeCloseTo(10, 4);
  expect(cpa.relSpeedKt).toBeCloseTo(600, 4);
});

test("T02-111: computeKinematicCpa correctly identifies right-angle converging CPA", () => {
  // Track A moving north from (0, -3) at 360 kt (0.1 NM/s)
  const trackA = {
    xNm: 0,
    yNm: -3,
    headingDeg: 0,
    altitudeFt: 5000,
    speedKt: 360,
  };
  // Track B moving east from (-3, 0) at 360 kt (0.1 NM/s)
  const trackB = {
    xNm: -3,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 5000,
    speedKt: 360,
  };
  // Both arrive at (0, 0) at t = 30 s
  const cpa = computeKinematicCpa(trackA, trackB);
  expect(cpa.isConverging).toBe(true);
  expect(cpa.tCpaS).toBeCloseTo(30, 4);
  expect(cpa.cpaDistNm).toBeCloseTo(0, 4);
});

test("T02-111: computeKinematicCpa flags parallel and diverging tracks as non-converging", () => {
  // Parallel same speed
  const aParallel = { xNm: 0, yNm: 0, headingDeg: 90, altitudeFt: 5000, speedKt: 250 };
  const bParallel = { xNm: 0, yNm: 4, headingDeg: 90, altitudeFt: 5000, speedKt: 250 };
  const cpaParallel = computeKinematicCpa(aParallel, bParallel);
  expect(cpaParallel.isConverging).toBe(false);
  expect(cpaParallel.tCpaS).toBe(0);
  expect(cpaParallel.cpaDistNm).toBe(4);

  // Diverging tracks flying away from each other
  const aDiverging = { xNm: 0, yNm: 0, headingDeg: 270, altitudeFt: 5000, speedKt: 250 };
  const bDiverging = { xNm: 3, yNm: 0, headingDeg: 90, altitudeFt: 5000, speedKt: 250 };
  const cpaDiverging = computeKinematicCpa(aDiverging, bDiverging);
  expect(cpaDiverging.isConverging).toBe(false);
  expect(cpaDiverging.tCpaS).toBeLessThanOrEqual(0);
  expect(cpaDiverging.cpaDistNm).toBe(3);
});

test("T02-111: detects active violation immediately (tCpa = 0)", () => {
  const dal = makeTestAircraft({
    callsign: "DAL100",
    xNm: 15,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const aal = makeTestAircraft({
    callsign: "AAL200",
    xNm: 16.5,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8200,
    speedKt: 250,
  });
  // In Outer Terminal (Tier 4): Dsep = 3.0 NM, Hsep = 1000 ft. Current dist = 1.5 NM, deltaAlt = 200 ft.
  const alert = detectPairConflict(dal, aal);
  expect(alert).not.toBeNull();
  expect(alert!.conflictType).toBe("active");
  expect(alert!.timeToCpaS).toBe(0);
  expect(alert!.distNm).toBeCloseTo(1.5, 4);
  expect(alert!.deltaAltFt).toBeCloseTo(200, 4);
  expect(alert!.areaTier).toBe(4);
});

test("T02-111: ignores diverging tracks unless currently violating", () => {
  // Diverging and separated: 2.8 NM apart in Tier 2 (Dsep = 2.5 NM)
  const context: CaContext = {
    approaches: [
      {
        id: "APP1",
        thresholdXNm: 0,
        thresholdYNm: 0,
        courseDeg: 90,
        lengthNm: 6,
        halfWidthNm: 2,
        maxAltFt: 3000,
      },
    ],
  };
  const dal = makeTestAircraft({
    callsign: "DAL1",
    xNm: -2,
    yNm: 0,
    headingDeg: 270, // westbound
    altitudeFt: 2000,
    speedKt: 150,
  });
  const aal = makeTestAircraft({
    callsign: "AAL2",
    xNm: 0.8,
    yNm: 0,
    headingDeg: 90, // eastbound
    altitudeFt: 2000,
    speedKt: 150,
  });
  // Distance = 2.8 NM > 2.5 NM. Both flying away from each other.
  expect(detectPairConflict(dal, aal, context)).toBeNull();

  // Diverging but actively violating: 1.8 NM apart in Tier 2 (Dsep = 2.5 NM)
  const dalViolating = makeTestAircraft({
    callsign: "DAL1",
    xNm: -1,
    yNm: 0,
    headingDeg: 270, // westbound
    altitudeFt: 2000,
    speedKt: 150,
  });
  const aalViolating = makeTestAircraft({
    callsign: "AAL2",
    xNm: 0.8,
    yNm: 0,
    headingDeg: 90, // eastbound
    altitudeFt: 2000,
    speedKt: 150,
  });
  const alert = detectPairConflict(dalViolating, aalViolating, context);
  expect(alert).not.toBeNull();
  expect(alert!.conflictType).toBe("active");
  expect(alert!.timeToCpaS).toBe(0);
});

test("T02-111: lookahead window cutoff Tlook respects governing tier", () => {
  // In Tier 3 (Core Terminal, <= 12 NM): Tlook = 35 s.
  // In Tier 4 (Outer Terminal, > 12 NM): Tlook = 45 s.
  // Head-on at 480 kt closing speed = 480 / 3600 = 2/15 NM/s (~0.1333 NM/s).
  // At 5.0 NM separation, tCpa = 5.0 / (2/15) = 37.5 s.

  // Case 1: Within Core Terminal (Tier 3) -> tCpa (37.5 s) > Tlook (35 s) -> NO alert yet
  const t3A = makeTestAircraft({
    callsign: "T3A",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 6000,
    speedKt: 240,
  });
  const t3B = makeTestAircraft({
    callsign: "T3B",
    xNm: 5,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 6000,
    speedKt: 240,
  });
  expect(detectPairConflict(t3A, t3B)).toBeNull();

  // Once closer: at 4.0 NM separation -> tCpa = 4.0 / (2/15) = 30 s <= 35 s -> Alert triggers!
  const t3AClose = makeTestAircraft({
    callsign: "T3A",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 6000,
    speedKt: 240,
  });
  const t3BClose = makeTestAircraft({
    callsign: "T3B",
    xNm: 4,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 6000,
    speedKt: 240,
  });
  const alertT3 = detectPairConflict(t3AClose, t3BClose);
  expect(alertT3).not.toBeNull();
  expect(alertT3!.conflictType).toBe("predictive");
  expect(alertT3!.areaTier).toBe(3);
  expect(alertT3!.timeToCpaS).toBeCloseTo(30, 1);

  // Case 2: In Outer Terminal (Tier 4, > 12 NM) -> tCpa (37.5 s) <= Tlook (45 s) -> Alert triggers!
  const t4A = makeTestAircraft({
    callsign: "T4A",
    xNm: 15,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 10000,
    speedKt: 240,
  });
  const t4B = makeTestAircraft({
    callsign: "T4B",
    xNm: 20,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 10000,
    speedKt: 240,
  });
  const alertT4 = detectPairConflict(t4A, t4B);
  expect(alertT4).not.toBeNull();
  expect(alertT4!.conflictType).toBe("predictive");
  expect(alertT4!.areaTier).toBe(4);
  expect(alertT4!.timeToCpaS).toBeCloseTo(37.5, 1);
});

test("T02-111: vertical climbing and descending profiles project altitude at CPA", () => {
  // Both converging horizontally in Tier 3: 4.0 NM apart at 480 kt closing -> tCpa = 30 s.
  // Profile 1: Currently separated by 1500 ft (A at 5000, B at 6500).
  // B is descending at 1800 ft/min (30 ft/s) assigned to 4000 ft.
  // Over 30 s, B descends 900 ft to 5600 ft. At CPA, deltaAlt = |5600 - 5000| = 600 ft < 1000 ft!
  const acA = makeTestAircraft({
    callsign: "ACA",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 5000,
    speedKt: 240,
  });
  const acBDescend = makeTestAircraft({
    callsign: "ACB",
    xNm: 4,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 6500,
    speedKt: 240,
  });
  acBDescend.intent.assignedAltitudeFt = 4000;

  const alertDescend = detectPairConflict(acA, acBDescend);
  expect(alertDescend).not.toBeNull();
  expect(alertDescend!.conflictType).toBe("predictive");

  // Profile 2: Currently at conflict altitude (A at 5000, B at 5200, diff 200 ft),
  // but B is climbing away at 1800 ft/min (30 ft/s) assigned to 9000 ft.
  // Over 30 s, B climbs 900 ft to 6100 ft. At CPA, deltaAlt = 1100 ft >= 1000 ft!
  const acBClimb = makeTestAircraft({
    callsign: "ACB",
    xNm: 4,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 5200,
    speedKt: 240,
  });
  acBClimb.intent.assignedAltitudeFt = 9000;

  const alertClimb = detectPairConflict(acA, acBClimb);
  expect(alertClimb).toBeNull();
});

test("T02-111: resolveCaContextFromCatalog generic data loading without facility branch", () => {
  const catalog = {
    airportId: "TEST",
    fieldElevFt: 50,
    originXNm: 0,
    originYNm: 0,
    fixes: [
      { id: "RW27", xNm: 0, yNm: 0 },
      { id: "RW09", xNm: -2, yNm: 0 },
    ],
    approaches: [
      { id: "ILS27", runway: "27", courseDeg: 270, thresholdFixId: "RW27" },
      { id: "ILS09", runway: "09", courseDeg: 90, thresholdFixId: "RW09" },
    ],
  };
  const ctx = resolveCaContextFromCatalog(catalog);
  expect(ctx.fieldElevFt).toBe(50);
  expect(ctx.runways).toHaveLength(2);
  expect(ctx.approaches).toHaveLength(2);
  expect(ctx.runways![0]!.id).toBe("27");
  expect(ctx.runways![0]!.headingDeg).toBe(270);
  expect(ctx.approaches![0]!.courseDeg).toBe(270);
});
