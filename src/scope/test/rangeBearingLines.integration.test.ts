/**
 * T02-208 Range-Bearing Model and Readouts Integration Acceptance Test.
 *
 * Authoritative source: Raytheon TI 6191.409 Final Revision 30, 20 August 2019,
 * Section 6.7 (pp. 6-55–56, PDF 585–586) & Section 6.8 (p. 6-58, PDF 588).
 *
 * Verifies all acceptance criteria for T02-208:
 * - Bounded session collection with IDs 1–9; lowest free ID allocated on insertion;
 *   deletion never renumbers surviving lines; maximum 9 lines capacity.
 * - Endpoint variants: static clicked ENU, catalog fix ID + ENU, canonical track ID.
 *   Coincident endpoints and duplicate endpoint pairs allowed.
 * - Track endpoints use latest surveillance report pose (sampled/reported position & ground speed),
 *   never live World truth, interpolated motion, or future prediction. Finite coordinates required.
 * - Direction & magnetic bearing: runs from endpoint 1 to endpoint 2; uses ENU course and
 *   trueToMagneticDeg with authored navigation magVar applied once.
 * - Traversal duration: 60 * dist / speedKt. Shown ONLY when exactly one endpoint is a track.
 *   Two tracks or no tracks omits traversal duration.
 *   Zero speed with positive distance shows '**'; zero speed with 0 NM distance shows '0'.
 * - Exact readout format: BBB/RR.RR[/M]-ID without NM suffix or box.
 *   Bearing is 3 digits zero-padded whole degree (north normalized to 000).
 *   Range has 2 decimal places. Traversal time is integer minutes without leading zeros.
 *   Overflow masks: '***.**' when raw range > 999.99 NM; '**' when raw time > 99 min.
 * - Range update cadence in simulation time on report events:
 *   Decreases of any size and increases >= 0.1 NM update immediately.
 *   Smaller increases wait until a report event at >= 4,500 ms after the last range update.
 *   Unchanged frames, pause, and accelerated sim preserve simulated-time deadline.
 * - Optional generic scenario radarTilesetBoundaryNm polygon adaptation:
 *   Validated at load time (at least 3 finite vertices).
 *   Boundary-inclusive containment. If either endpoint is outside the polygon, bearing is '777'.
 *   Omitted polygon means unbounded plane default (normal bearing). No hardcoded airport geometry.
 * - Non-mutation inspection: model mutates no World aircraft, plan, intent, selection, alert,
 *   audio, handoff, PTL, camera, or persistent preference state.
 */

import { describe, expect, it } from "vitest";
import { createWorld, makeTestAircraft, type World } from "@core";
import { parseRadarTilesetBoundaryNm } from "@scenario";
import {
  MAX_RBL_COUNT,
  RBL_OUTSIDE_TILESET_BEARING,
  calculateRblReadout,
  clearRangeBearingLines,
  createRangeBearingLineState,
  formatRblBearing,
  formatRblRange,
  formatRblTraversalMinutes,
  insertRangeBearingLine,
  isPointInsideOrOnPolygon,
  onRblSurveillanceReport,
  removeRangeBearingLine,
  resolveRblEndpointPose,
  updateRblCadenceRange,
} from "../rangeBearingLines";
import { createScopeView, applyRadarTilesetBoundary, type ScopeView } from "../scopeView";
import type { SurveillanceReport } from "../surveillance";

function makeSyntheticReport(overrides: Partial<SurveillanceReport> = {}): SurveillanceReport {
  return {
    aircraftId: "AAL100",
    xNm: 10,
    yNm: 10,
    headingDeg: 90,
    speedKt: 300,
    altitudeFt: 5000,
    reportedAtSimMs: 1000,
    sourceSiteId: "SITE-1",
    paint: "fused-puck",
    ...overrides,
  };
}

describe("T02-208 Range-Bearing Line Model and Readouts", () => {
  describe("Session collection and ID allocation (AC: IDs 1–9, lowest free, stable)", () => {
    it("allocates lowest free ID from 1 to 9 and caps at 9 lines", () => {
      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();

      // Insert 9 lines
      const createdLines = [];
      for (let i = 1; i <= MAX_RBL_COUNT; i++) {
        const line = insertRangeBearingLine(
          state,
          { kind: "static", xNm: i, yNm: 0 },
          { kind: "static", xNm: i + 1, yNm: 0 },
          tracks,
          0,
        );
        expect(line).not.toBeNull();
        expect(line?.id).toBe(i);
        createdLines.push(line!);
      }
      expect(state.lines.size).toBe(9);

      // Attempt 10th line: rejected by capacity
      const line10 = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "static", xNm: 1, yNm: 1 },
        tracks,
        0,
      );
      expect(line10).toBeNull();

      // Remove ID 2; other IDs remain stable
      const removed = removeRangeBearingLine(state, 2);
      expect(removed).toBe(true);
      expect(state.lines.has(2)).toBe(false);
      expect(state.lines.has(1)).toBe(true);
      expect(state.lines.has(3)).toBe(true);
      expect(state.lines.has(9)).toBe(true);
      expect(state.lines.size).toBe(8);

      // Next insertion receives the freed lowest ID 2
      const newLine = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 50, yNm: 50 },
        { kind: "static", xNm: 60, yNm: 60 },
        tracks,
        0,
      );
      expect(newLine).not.toBeNull();
      expect(newLine?.id).toBe(2);
      expect(state.lines.size).toBe(9);
    });

    it("allows identical/coincident endpoints and duplicate endpoint pairs", () => {
      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();

      // Coincident endpoints (static to same static)
      const line1 = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 15, yNm: 20 },
        { kind: "static", xNm: 15, yNm: 20 },
        tracks,
        0,
      );
      expect(line1).not.toBeNull();
      expect(line1?.id).toBe(1);

      // Duplicate endpoint pair
      const line2 = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 15, yNm: 20 },
        { kind: "static", xNm: 15, yNm: 20 },
        tracks,
        0,
      );
      expect(line2).not.toBeNull();
      expect(line2?.id).toBe(2);

      const calc1 = calculateRblReadout(line1!, tracks, 0);
      expect(calc1?.rawDistanceNm).toBe(0);
      expect(calc1?.rangeStr).toBe("0.00");
    });
  });

  describe("Endpoint resolution and report pose divergence", () => {
    it("uses latest surveillance report pose, divergent from live aircraft truth", () => {
      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();

      // Simulated aircraft truth at (100, 100), but surveillance report frozen at (10, 10)
      tracks.set("AAL100", {
        lastReport: makeSyntheticReport({
          aircraftId: "AAL100",
          xNm: 10,
          yNm: 10,
          speedKt: 240,
        }),
      });

      const line = insertRangeBearingLine(
        state,
        { kind: "track", aircraftId: "AAL100" },
        { kind: "static", xNm: 10, yNm: 20 },
        tracks,
        0,
      );
      expect(line).not.toBeNull();

      const calc = calculateRblReadout(line!, tracks, 0);
      expect(calc).not.toBeNull();
      expect(calc?.endpoint1Pose.xNm).toBe(10);
      expect(calc?.endpoint1Pose.yNm).toBe(10);
      expect(calc?.rawDistanceNm).toBe(10);
    });

    it("rejects non-finite coordinates or missing track report", () => {
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();

      // Non-finite static coordinates
      expect(resolveRblEndpointPose({ kind: "static", xNm: NaN, yNm: 10 }, tracks)).toBeNull();
      expect(
        resolveRblEndpointPose({ kind: "fix", fixId: "FIX", xNm: 10, yNm: Infinity }, tracks),
      ).toBeNull();

      // Missing track report
      expect(resolveRblEndpointPose({ kind: "track", aircraftId: "GHOST" }, tracks)).toBeNull();

      // Track report with NaN position
      tracks.set("BAD", {
        lastReport: makeSyntheticReport({ aircraftId: "BAD", xNm: NaN, yNm: 0 }),
      });
      expect(resolveRblEndpointPose({ kind: "track", aircraftId: "BAD" }, tracks)).toBeNull();
    });
  });

  describe("Bearing, direction, magVar, and north normalization (PDF 585–586)", () => {
    it("computes bearing from endpoint 1 to endpoint 2 and applies magVar once", () => {
      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();

      // From (0,0) to (0, 10) is true course 000 (due north)
      const line1 = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "static", xNm: 0, yNm: 10 },
        tracks,
        0,
      )!;

      // With magVar = 0, north is 000
      let calc = calculateRblReadout(line1, tracks, 0);
      expect(calc?.bearingStr).toBe("000");

      // With magVar = -5 (westerly variation): magnetic = true - (-5) = 005
      calc = calculateRblReadout(line1, tracks, -5);
      expect(calc?.bearingStr).toBe("005");

      // With magVar = +5 (easterly variation): magnetic = true - 5 = 355
      calc = calculateRblReadout(line1, tracks, 5);
      expect(calc?.bearingStr).toBe("355");

      // Reversing endpoint order reverses bearing (from (0,10) to (0,0) is true course 180)
      const lineReverse = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 0, yNm: 10 },
        { kind: "static", xNm: 0, yNm: 0 },
        tracks,
        0,
      )!;
      calc = calculateRblReadout(lineReverse, tracks, 0);
      expect(calc?.bearingStr).toBe("180");
    });

    it("normalizes rounded north (359.6 -> 360 -> 000)", () => {
      // 359.8 degrees rounds to 360, must display as 000
      expect(formatRblBearing(359.8, 0, false)).toBe("000");
      expect(formatRblBearing(0.2, 0, false)).toBe("000");
      expect(formatRblBearing(0.0, 0, false)).toBe("000");
      expect(formatRblBearing(45.2, 0, false)).toBe("045");
      expect(formatRblBearing(4.8, 0, false)).toBe("005");
    });
  });

  describe("Traversal duration and endpoint track count rules (PDF 585–586)", () => {
    it("omits traversal duration when both endpoints are static/fixes (no tracks)", () => {
      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();

      const line = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "fix", fixId: "BOSOX", xNm: 0, yNm: 10 },
        tracks,
        0,
      )!;

      const calc = calculateRblReadout(line, tracks, 0);
      expect(calc?.traversalStr).toBeNull();
      expect(calc?.readoutText).toBe("000/10.00-1");
    });

    it("omits traversal duration when both endpoints are tracks (two tracks)", () => {
      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();
      tracks.set("TRK1", {
        lastReport: makeSyntheticReport({ aircraftId: "TRK1", xNm: 0, yNm: 0, speedKt: 250 }),
      });
      tracks.set("TRK2", {
        lastReport: makeSyntheticReport({ aircraftId: "TRK2", xNm: 0, yNm: 10, speedKt: 300 }),
      });

      const line = insertRangeBearingLine(
        state,
        { kind: "track", aircraftId: "TRK1" },
        { kind: "track", aircraftId: "TRK2" },
        tracks,
        0,
      )!;

      const calc = calculateRblReadout(line, tracks, 0);
      expect(calc?.traversalStr).toBeNull();
      expect(calc?.readoutText).toBe("000/10.00-1");
    });

    it("shows traversal duration when exactly one endpoint is a track (track to fix or fix to track)", () => {
      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();
      // 12 NM at 240 kt: 60 * 12 / 240 = 3 minutes
      tracks.set("AAL1", {
        lastReport: makeSyntheticReport({ aircraftId: "AAL1", xNm: 0, yNm: 0, speedKt: 240 }),
      });

      // Track to fix
      const line1 = insertRangeBearingLine(
        state,
        { kind: "track", aircraftId: "AAL1" },
        { kind: "static", xNm: 0, yNm: 12 },
        tracks,
        0,
      )!;
      const calc1 = calculateRblReadout(line1, tracks, 0);
      expect(calc1?.traversalStr).toBe("3");
      expect(calc1?.readoutText).toBe("000/12.00/3-1");

      // Fix to track: reverse direction reverses bearing, but traversal time remains 3 min
      const line2 = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 0, yNm: 12 },
        { kind: "track", aircraftId: "AAL1" },
        tracks,
        0,
      )!;
      const calc2 = calculateRblReadout(line2, tracks, 0);
      expect(calc2?.bearingStr).toBe("180");
      expect(calc2?.traversalStr).toBe("3");
      expect(calc2?.readoutText).toBe("180/12.00/3-2");
    });

    it("handles zero-speed and missing speed per trainer choices", () => {
      // Positive distance with zero speed: mask '**'
      expect(formatRblTraversalMinutes(10, 0)).toBe("**");
      // Coincident distance (0 NM) with zero speed: '0'
      expect(formatRblTraversalMinutes(0, 0)).toBe("0");
      // Missing speed: suppresses traversal time (returns null)
      expect(formatRblTraversalMinutes(10, undefined)).toBeNull();
    });

    it("handles overflow masks (> 999.99 NM range and > 99 min time)", () => {
      // Range limit 999.99 NM
      expect(formatRblRange(999.99)).toBe("999.99");
      expect(formatRblRange(999.991)).toBe("***.**");
      expect(formatRblRange(1500)).toBe("***.**");

      // Traversal time limit 99 minutes
      // 99 min at 60 kt is 99 NM
      expect(formatRblTraversalMinutes(99, 60)).toBe("99");
      // 100 NM at 60 kt is 100 min -> '**'
      expect(formatRblTraversalMinutes(100, 60)).toBe("**");
    });
  });

  describe("Range update cadence (PDF 586: decreases, >=0.1 NM increases, 4.5s boundary)", () => {
    it("updates immediately for any range decrease", () => {
      const initial = 10.0;
      const lastUpdateMs = 1000;
      const reportMs = 1500; // only 500ms elapsed (< 4500ms)

      // Decrease by 0.01 NM: updates immediately
      const res = updateRblCadenceRange(initial, 9.99, lastUpdateMs, reportMs);
      expect(res.displayedRangeNm).toBe(9.99);
      expect(res.lastRangeUpdateSimMs).toBe(reportMs);
    });

    it("updates immediately for range increase >= 0.1 NM", () => {
      const initial = 10.0;
      const lastUpdateMs = 1000;
      const reportMs = 1200; // only 200ms elapsed

      // Exactly 0.100 NM increase: updates immediately
      const res1 = updateRblCadenceRange(initial, 10.1, lastUpdateMs, reportMs);
      expect(res1.displayedRangeNm).toBe(10.1);
      expect(res1.lastRangeUpdateSimMs).toBe(reportMs);

      // Large increase 0.5 NM: updates immediately
      const res2 = updateRblCadenceRange(initial, 10.5, lastUpdateMs, reportMs);
      expect(res2.displayedRangeNm).toBe(10.5);
      expect(res2.lastRangeUpdateSimMs).toBe(reportMs);
    });

    it("delays smaller increase (< 0.1 NM) until next report event at >= 4,500 ms", () => {
      const initial = 10.0;
      const lastUpdateMs = 1000;

      // Small increase (+0.05 NM) at 4,499 ms elapsed (simMs = 5499): NOT updated
      const resBefore = updateRblCadenceRange(initial, 10.05, lastUpdateMs, 5499);
      expect(resBefore.displayedRangeNm).toBe(10.0);
      expect(resBefore.lastRangeUpdateSimMs).toBe(lastUpdateMs);

      // Small increase (+0.05 NM) at exactly 4,500 ms elapsed (simMs = 5500): UPDATED
      const resAt = updateRblCadenceRange(initial, 10.05, lastUpdateMs, 5500);
      expect(resAt.displayedRangeNm).toBe(10.05);
      expect(resAt.lastRangeUpdateSimMs).toBe(5500);

      // Small increase (+0.08 NM) at 6,000 ms elapsed (simMs = 7000): UPDATED
      const resAfter = updateRblCadenceRange(initial, 10.08, lastUpdateMs, 7000);
      expect(resAfter.displayedRangeNm).toBe(10.08);
      expect(resAfter.lastRangeUpdateSimMs).toBe(7000);
    });

    it("applies cadence through onRblSurveillanceReport across simulation time steps", () => {
      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();

      const report = makeSyntheticReport({ aircraftId: "DAL1", xNm: 0, yNm: 0, speedKt: 250 });
      tracks.set("DAL1", { lastReport: report });

      const line = insertRangeBearingLine(
        state,
        { kind: "track", aircraftId: "DAL1" },
        { kind: "static", xNm: 0, yNm: 10 },
        tracks,
        1000,
      )!;
      expect(line.displayedRangeNm).toBe(10);
      expect(line.lastRangeUpdateSimMs).toBe(1000);

      // Aircraft moves slightly further away: dx=0, dy=-0.05 -> dist = 10.05 NM
      // 1. Report at 3000 ms (2,000 ms elapsed, subthreshold increase): displayed range stays 10.00
      report.yNm = -0.05;
      report.reportedAtSimMs = 3000;
      onRblSurveillanceReport(state, "DAL1", tracks, 3000);
      expect(line.displayedRangeNm).toBe(10);
      expect(line.lastRangeUpdateSimMs).toBe(1000);

      // 2. Unrelated frame/render without new report: does not update or postpone deadline
      expect(line.displayedRangeNm).toBe(10);
      expect(line.lastRangeUpdateSimMs).toBe(1000);

      // 3. New report arrives at 5500 ms (4,500 ms elapsed since last update): updates to 10.05
      report.reportedAtSimMs = 5500;
      onRblSurveillanceReport(state, "DAL1", tracks, 5500);
      expect(line.displayedRangeNm).toBeCloseTo(10.05, 5);
      expect(line.lastRangeUpdateSimMs).toBe(5500);
    });
  });

  describe("Optional radar tileset boundary adaptation (PDF 586: bearing 777)", () => {
    const polygon = [
      { xNm: -20, yNm: -20 },
      { xNm: 20, yNm: -20 },
      { xNm: 20, yNm: 20 },
      { xNm: -20, yNm: 20 },
    ];

    it("formats bearing 777 if either endpoint is outside the polygon", () => {
      const state = createRangeBearingLineState({ radarTilesetBoundaryNm: polygon });
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();

      // Both endpoints inside: normal bearing
      const lineInside = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "static", xNm: 5, yNm: 5 },
        tracks,
        0,
      )!;
      const calcInside = calculateRblReadout(lineInside, tracks, 0, state.radarTilesetBoundaryNm);
      expect(calcInside?.isOutsideTileset).toBe(false);
      expect(calcInside?.bearingStr).toBe("045");
      expect(calcInside?.readoutText).toBe("045/7.07-1");

      // Endpoint 2 outside (+25, +25): bearing 777
      const lineOut2 = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "static", xNm: 25, yNm: 25 },
        tracks,
        0,
      )!;
      const calcOut2 = calculateRblReadout(lineOut2, tracks, 0, state.radarTilesetBoundaryNm);
      expect(calcOut2?.isOutsideTileset).toBe(true);
      expect(calcOut2?.bearingStr).toBe(RBL_OUTSIDE_TILESET_BEARING);
      expect(calcOut2?.readoutText).toBe("777/35.36-2");

      // Endpoint 1 outside: bearing 777
      const lineOut1 = insertRangeBearingLine(
        state,
        { kind: "static", xNm: -25, yNm: 0 },
        { kind: "static", xNm: 0, yNm: 0 },
        tracks,
        0,
      )!;
      const calcOut1 = calculateRblReadout(lineOut1, tracks, 0, state.radarTilesetBoundaryNm);
      expect(calcOut1?.isOutsideTileset).toBe(true);
      expect(calcOut1?.bearingStr).toBe(RBL_OUTSIDE_TILESET_BEARING);
    });

    it("boundary-inclusive containment keeps on-boundary points inside (normal bearing)", () => {
      // Exactly on edge (x=20, y=0)
      expect(isPointInsideOrOnPolygon({ xNm: 20, yNm: 0 }, polygon)).toBe(true);
      // Exactly on corner vertex (x=20, y=20)
      expect(isPointInsideOrOnPolygon({ xNm: 20, yNm: 20 }, polygon)).toBe(true);
      // Just inside (x=19.99, y=0)
      expect(isPointInsideOrOnPolygon({ xNm: 19.99, yNm: 0 }, polygon)).toBe(true);
      // Just outside (x=20.01, y=0)
      expect(isPointInsideOrOnPolygon({ xNm: 20.01, yNm: 0 }, polygon)).toBe(false);
    });

    it("defaults to unbounded plane when radarTilesetBoundaryNm is omitted (normal bearing)", () => {
      const state = createRangeBearingLineState(); // boundary omitted
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();

      // Very far point (x=500, y=500)
      const lineFar = insertRangeBearingLine(
        state,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "static", xNm: 500, yNm: 500 },
        tracks,
        0,
      )!;
      const calc = calculateRblReadout(lineFar, tracks, 0, state.radarTilesetBoundaryNm);
      expect(calc?.isOutsideTileset).toBe(false);
      expect(calc?.bearingStr).toBe("045");
    });

    it("parses and validates radarTilesetBoundaryNm at scenario load time", () => {
      expect(parseRadarTilesetBoundaryNm(undefined)).toBeUndefined();
      expect(() => parseRadarTilesetBoundaryNm([])).toThrow(/at least 3 vertices/);
      expect(() =>
        parseRadarTilesetBoundaryNm([
          { xNm: 0, yNm: 0 },
          { xNm: 1, yNm: 1 },
        ]),
      ).toThrow(/at least 3 vertices/);

      const valid = [
        { xNm: 0, yNm: 0 },
        { xNm: 10, yNm: 0 },
        { xNm: 10, yNm: 10 },
      ];
      expect(parseRadarTilesetBoundaryNm(valid)).toEqual(valid);
    });
  });

  describe("ScopeView binding and session lifecycle", () => {
    it("initializes empty RBL state on ScopeView and binds scenario tileset boundary", () => {
      const boundary = [
        { xNm: -30, yNm: -30 },
        { xNm: 30, yNm: -30 },
        { xNm: 30, yNm: 30 },
      ];
      const view: ScopeView = createScopeView(0, 0, { radarTilesetBoundaryNm: boundary });
      expect(view.rbl.lines.size).toBe(0);
      expect(view.rbl.radarTilesetBoundaryNm).toEqual(boundary);

      // Dynamic update via applyRadarTilesetBoundary
      applyRadarTilesetBoundary(view, undefined);
      expect(view.rbl.radarTilesetBoundaryNm).toBeUndefined();

      applyRadarTilesetBoundary(view, boundary);
      expect(view.rbl.radarTilesetBoundaryNm).toEqual(boundary);
    });

    it("clearRangeBearingLines clears all lines on scenario switch", () => {
      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();

      insertRangeBearingLine(
        state,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "static", xNm: 1, yNm: 1 },
        tracks,
      );
      insertRangeBearingLine(
        state,
        { kind: "static", xNm: 2, yNm: 2 },
        { kind: "static", xNm: 3, yNm: 3 },
        tracks,
      );
      expect(state.lines.size).toBe(2);

      clearRangeBearingLines(state);
      expect(state.lines.size).toBe(0);
    });
  });

  describe("Inspection: model purity and absence of side effects", () => {
    it("mutates no World aircraft, plan, intent, selection, alert, audio, PTL, or camera state", () => {
      const aircraft = makeTestAircraft({ id: "TEST1", xNm: 5, yNm: 5 });
      const world: World = createWorld({ aircraft: [aircraft] });

      const initialWorldSnapshot = JSON.stringify(world);

      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();
      tracks.set("TEST1", {
        lastReport: makeSyntheticReport({ aircraftId: "TEST1", xNm: 5, yNm: 5, speedKt: 250 }),
      });

      const line = insertRangeBearingLine(
        state,
        { kind: "track", aircraftId: "TEST1" },
        { kind: "static", xNm: 10, yNm: 10 },
        tracks,
        1000,
      );
      expect(line).not.toBeNull();

      calculateRblReadout(line!, tracks, 0);
      onRblSurveillanceReport(state, "TEST1", tracks, 5500);

      // Verify World state was untouched
      expect(JSON.stringify(world)).toBe(initialWorldSnapshot);
    });
  });
});
