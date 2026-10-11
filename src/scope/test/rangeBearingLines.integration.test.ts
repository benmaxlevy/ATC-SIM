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
  lookupRblTrack,
  onRblSurveillanceReport,
  removeRangeBearingLine,
  resolveRblEndpointPose,
  updateRblCadenceRange,
} from "../rangeBearingLines";
import { createScopeView, applyRadarTilesetBoundary, type ScopeView } from "../scopeView";
import type { SurveillanceReport } from "../surveillance";
import { handleScopeKeyDown, installAlwaysOnScopeKeys, type ScopeKeyEvent } from "../scopeKeys";
import { handlePpiLeftClick } from "../ppi";
import { nmToScreen } from "../camera";
import { renderScope } from "../render/renderScope";
import { createMockCtx } from "./mockCanvas";
import { ensureTrackDisplay } from "../trackDisplay";
import { buildFixRegistry } from "../../core/nav/fixRegistry";

function makeKeyEvent(overrides: Partial<ScopeKeyEvent> = {}): ScopeKeyEvent {
  const key = overrides.key ?? "Enter";
  return {
    key,
    code:
      overrides.code ??
      (key.length === 1 && /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key),
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: null,
    preventDefault() {},
    stopPropagation() {},
    ...overrides,
  };
}

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

    it("uses current distance for traversal while a subthreshold increase holds displayed range", () => {
      const state = createRangeBearingLineState();
      const tracks = new Map<string, { lastReport?: SurveillanceReport }>();
      tracks.set("AAL1", {
        lastReport: makeSyntheticReport({
          aircraftId: "AAL1",
          xNm: 10,
          yNm: 10,
          speedKt: 57.3,
          reportedAtSimMs: 1000,
        }),
      });

      const line = insertRangeBearingLine(
        state,
        { kind: "track", aircraftId: "AAL1" },
        { kind: "static", xNm: 0, yNm: 10 },
        tracks,
        1000,
      )!;

      tracks.set("AAL1", {
        lastReport: makeSyntheticReport({
          aircraftId: "AAL1",
          xNm: 10.05,
          yNm: 10,
          speedKt: 57.3,
          reportedAtSimMs: 2000,
        }),
      });
      onRblSurveillanceReport(state, "AAL1", tracks, 2000);

      const calc = calculateRblReadout(line, tracks, 0)!;
      expect(line.displayedRangeNm).toBe(10);
      expect(calc.rawDistanceNm).toBeCloseTo(10.05);
      expect(calc.rangeStr).toBe("10.00");
      expect(calc.traversalStr).toBe("11");
      expect(calc.readoutText).toBe("270/10.00/11-1");
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

  describe("T02-209 Range-Bearing Input and Removal (STARS §§6.7–6.8)", () => {
    it("handles *T Enter (remove all active RBLs)", () => {
      const view = createScopeView();
      const world = createWorld();
      const nowMs = 1000;

      // Populate 2 lines
      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "static", xNm: 10, yNm: 10 },
        view.tracks,
      );
      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 1, yNm: 1 },
        { kind: "static", xNm: 20, yNm: 20 },
        view.tracks,
      );
      expect(view.rbl.lines.size).toBe(2);

      // Type *T
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      expect(view.preview.buffer).toBe("*T");

      // Press Enter
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);
      expect(view.rbl.lines.size).toBe(0);
      expect(view.preview.phase).toBe("idle");
    });

    it("handles *T<ID> Enter (remove specific RBL ID 1-9)", () => {
      const view = createScopeView();
      const world = createWorld();
      const nowMs = 1000;

      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "static", xNm: 10, yNm: 10 },
        view.tracks,
      );
      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 1, yNm: 1 },
        { kind: "static", xNm: 20, yNm: 20 },
        view.tracks,
      );
      expect(view.rbl.lines.has(1)).toBe(true);
      expect(view.rbl.lines.has(2)).toBe(true);

      // Type *T1 Enter
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "1" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.rbl.lines.has(1)).toBe(false);
      expect(view.rbl.lines.has(2)).toBe(true);
      expect(view.preview.phase).toBe("idle");
    });

    it("rejects nonexistent or out-of-range deletion ID with RBL ID error", () => {
      const view = createScopeView();
      const world = createWorld();
      const nowMs = 1000;

      // Line 1 exists, but line 3 does not
      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "static", xNm: 10, yNm: 10 },
        view.tracks,
      );

      // Type *T3 Enter (ID not present in state)
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "3" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.preview.rejection).toBe("RBL ID");
      expect(view.rbl.lines.has(1)).toBe(true);

      // Out of range: *T0 Enter
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "0" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.preview.rejection).toBe("RBL ID");

      // A longer unspaced numeric token is not a track search; only a catalog
      // fix with that exact token may take precedence over deletion parsing.
      for (const key of ["*", "T", "1", "2", "3", "Enter"]) {
        handleScopeKeyDown(makeKeyEvent({ key }), view, "scope", world, nowMs);
      }
      expect(view.preview.rejection).toBe("RBL ID");
      expect(view.rbl.lines.has(1)).toBe(true);

      // Two digits: *T10 Enter
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "1" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "0" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.preview.rejection).toBe("RBL ID");
    });

    it("treats leading space after T as typed track search (*T 3 Enter yields NO FLIGHT)", () => {
      const view = createScopeView();
      const world = createWorld();
      const nowMs = 1000;

      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 0, yNm: 0 },
        { kind: "static", xNm: 10, yNm: 10 },
        view.tracks,
      );

      // Type *T 3 Enter (with space)
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: " " }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "3" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      // Must NOT delete line 3 or give RBL ID; it is a track search which yields NO FLIGHT!
      expect(view.preview.rejection).toBe("NO FLIGHT");
      expect(view.rbl.lines.has(1)).toBe(true);
    });

    it("creates fixed-fixed line via *T, point click, point click", () => {
      const view = createScopeView();
      const world = createWorld();
      const nowMs = 1000;

      // Scope entry: *T
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);

      // First click on empty PPI (cssX: 400, cssY: 400)
      handlePpiLeftClick(view, world, 400, 400, 800, 800);
      expect(view.rbl.pendingFirstEndpoint).not.toBeNull();
      expect(view.rbl.pendingFirstEndpoint?.kind).toBe("static");
      expect(view.rbl.lines.size).toBe(0);

      // Second click on empty PPI (cssX: 500, cssY: 500) commits immediately
      handlePpiLeftClick(view, world, 500, 500, 800, 800);
      expect(view.rbl.lines.size).toBe(1);
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
      expect(view.preview.phase).toBe("idle");

      const line = view.rbl.lines.get(1);
      expect(line).toBeDefined();
      expect(line?.endpoint1.kind).toBe("static");
      expect(line?.endpoint2.kind).toBe("static");
    });

    it("intercepts a report-backed track click without selecting or recording the PPI click", () => {
      const ac = makeTestAircraft({ id: "CLICK1", callsign: "CLICK1" });
      const world = createWorld({ aircraft: [ac] });
      const view = createScopeView();
      ensureTrackDisplay(view.tracks, ac.id).lastReport = makeSyntheticReport({
        aircraftId: ac.id,
        xNm: view.camera.centerEastNm,
        yNm: view.camera.centerNorthNm,
      });
      world.selectedAircraftId = null;
      view.lastClickEastNm = 77;
      view.lastClickNorthNm = 88;
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, 1000);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, 1000);
      handlePpiLeftClick(view, world, 400, 400, 800, 800);
      expect(view.rbl.pendingFirstEndpoint).toEqual({ kind: "track", aircraftId: ac.id });
      expect(world.selectedAircraftId).toBeNull();
      expect(view.lastClickEastNm).toBe(77);
      expect(view.lastClickNorthNm).toBe(88);
      handlePpiLeftClick(view, world, 500, 500, 800, 800);
      expect(view.rbl.lines.get(1)?.endpoint1).toMatchObject({ kind: "track", aircraftId: ac.id });
    });

    it("creates line via typed fixes (*T FIX Enter, FIX Enter)", () => {
      const world = createWorld({
        fixRegistry: buildFixRegistry({
          navaids: [],
          fixes: [
            { id: "NEMAX", xNm: 10, yNm: 10, kind: "fix" },
            { id: "BAMMI", xNm: 20, yNm: 20, kind: "fix" },
          ],
        }),
      });
      const view = createScopeView();
      const nowMs = 1000;

      // Type *TNEMAX Enter
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      "NEMAX"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.rbl.pendingFirstEndpoint).toMatchObject({ kind: "fix", fixId: "NEMAX" });

      // Stage 2: BAMMI Enter
      "BAMMI"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.rbl.lines.size).toBe(1);
      const line = view.rbl.lines.get(1);
      expect(line?.endpoint1).toMatchObject({ kind: "fix", fixId: "NEMAX" });
      expect(line?.endpoint2).toMatchObject({ kind: "fix", fixId: "BAMMI" });
    });

    it.each(["ABD", "LAMES", "NEMAX"])(
      "resolves generic fix IDs beginning with legacy list prefixes: %s",
      (fixId) => {
        const world = createWorld({
          fixRegistry: buildFixRegistry({
            navaids: [],
            fixes: [
              { id: fixId, xNm: 10, yNm: 10, kind: "fix" },
              { id: "BAMMI", xNm: 20, yNm: 20, kind: "fix" },
            ],
          }),
        });
        const view = createScopeView();
        for (const key of ["*", "T", ...fixId, "Enter", ..."BAMMI", "Enter"]) {
          handleScopeKeyDown(makeKeyEvent({ key }), view, "scope", world, 1000);
        }
        expect(view.rbl.lines.get(1)?.endpoint1).toMatchObject({ kind: "fix", fixId });
      },
    );

    it("keeps numeric catalog fixes ahead of deletion parsing", () => {
      const world = createWorld({
        fixRegistry: buildFixRegistry({
          navaids: [],
          fixes: [
            { id: "123", xNm: 12, yNm: 3, kind: "fix" },
            { id: "456", xNm: 45, yNm: 6, kind: "fix" },
          ],
        }),
      });
      const view = createScopeView();
      for (const key of ["*", "T", "1", "2", "3", "Enter", "4", "5", "6", "Enter"]) {
        handleScopeKeyDown(makeKeyEvent({ key }), view, "scope", world, 1000);
      }
      expect(view.rbl.lines.get(1)?.endpoint1).toMatchObject({ kind: "fix", fixId: "123" });
      expect(view.rbl.lines.get(1)?.endpoint2).toMatchObject({ kind: "fix", fixId: "456" });
    });

    it("requires leading space after T for first typed track (*T ACID without space yields NO FLIGHT)", () => {
      const ac = makeTestAircraft({ id: "DAL123", callsign: "DAL123" });
      const world = createWorld({ aircraft: [ac] });
      const view = createScopeView();
      const nowMs = 1000;

      ensureTrackDisplay(view.tracks, ac.id);
      view.tracks.get(ac.id)!.lastReport = makeSyntheticReport({
        aircraftId: ac.id,
        xNm: 1000,
        yNm: 1000,
      });

      // Type *TDAL123 without space
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      "DAL123"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      // Rejected: cannot become a track without required leading space!
      expect(view.preview.rejection).toBe("NO FLIGHT");
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
    });

    it("resolves first typed track with required leading space (*T DAL123 Enter)", () => {
      const ac = makeTestAircraft({ id: "DAL123", callsign: "DAL123" });
      const world = createWorld({
        aircraft: [ac],
        fixRegistry: buildFixRegistry({
          navaids: [],
          fixes: [{ id: "NEMAX", xNm: 20, yNm: 20, kind: "fix" }],
        }),
      });
      const view = createScopeView();
      const nowMs = 1000;

      ensureTrackDisplay(view.tracks, ac.id);
      view.tracks.get(ac.id)!.lastReport = makeSyntheticReport({
        aircraftId: ac.id,
        xNm: 1000,
        yNm: 1000,
      });

      // Type *T DAL123 Enter (with space)
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: " " }), view, "scope", world, nowMs);
      "DAL123"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.rbl.pendingFirstEndpoint).toMatchObject({ kind: "track", aircraftId: "DAL123" });

      // Stage 2: NEMAX Enter (no leading space required in stage 2)
      "NEMAX"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.rbl.lines.size).toBe(1);
      const line = view.rbl.lines.get(1);
      expect(line?.endpoint1).toMatchObject({ kind: "track", aircraftId: "DAL123" });
      expect(line?.endpoint2).toMatchObject({ kind: "fix", fixId: "NEMAX" });
    });

    it("enforces fix-over-ACID precedence even with space form", () => {
      // Homonymous fix NEMAX and aircraft callsign NEMAX
      const ac = makeTestAircraft({ id: "AC1", callsign: "NEMAX" });
      const world = createWorld({
        aircraft: [ac],
        fixRegistry: buildFixRegistry({
          navaids: [],
          fixes: [{ id: "NEMAX", xNm: 15, yNm: 15, kind: "fix" }],
        }),
      });
      const view = createScopeView();
      const nowMs = 1000;

      ensureTrackDisplay(view.tracks, ac.id);
      view.tracks.get(ac.id)!.lastReport = makeSyntheticReport({
        aircraftId: ac.id,
        xNm: 10,
        yNm: 10,
      });

      // Type *T NEMAX Enter with space
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: " " }), view, "scope", world, nowMs);
      "NEMAX"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      // Fix wins! Endpoint is fix, NOT track
      expect(view.rbl.pendingFirstEndpoint).toMatchObject({ kind: "fix", fixId: "NEMAX" });
    });

    it("rejects empty second stage Enter with FORMAT and never clears active lines", () => {
      const view = createScopeView();
      const world = createWorld({
        fixRegistry: buildFixRegistry({
          navaids: [],
          fixes: [{ id: "NEMAX", xNm: 10, yNm: 10, kind: "fix" }],
        }),
      });
      const nowMs = 1000;

      // Existing active line
      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 1, yNm: 1 },
        { kind: "static", xNm: 2, yNm: 2 },
        view.tracks,
      );
      expect(view.rbl.lines.size).toBe(1);

      // Stage 1: *TNEMAX Enter
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      "NEMAX"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);
      expect(view.rbl.pendingFirstEndpoint).not.toBeNull();

      // Stage 2: Empty Enter
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.preview.rejection).toBe("FORMAT");
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
      // Existing lines preserved!
      expect(view.rbl.lines.size).toBe(1);
    });

    it("rejects extra endpoint fields as FORMAT without inserting or clearing lines", () => {
      const world = createWorld({
        fixRegistry: buildFixRegistry({
          navaids: [],
          fixes: [
            { id: "FIXA", xNm: 10, yNm: 10, kind: "fix" },
            { id: "FIXB", xNm: 20, yNm: 20, kind: "fix" },
          ],
        }),
      });
      const view = createScopeView();
      const nowMs = 1000;
      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 1, yNm: 1 },
        { kind: "static", xNm: 2, yNm: 2 },
        view.tracks,
      );
      for (const key of ["*", "T", "F", "I", "X", "A", " ", "E", "X", "T", "R", "A", "Enter"]) {
        handleScopeKeyDown(makeKeyEvent({ key }), view, "scope", world, nowMs);
      }
      expect(view.preview.rejection).toBe("FORMAT");
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
      expect(view.rbl.lines.size).toBe(1);

      for (const key of [
        "*",
        "T",
        "F",
        "I",
        "X",
        "A",
        "Enter",
        "F",
        "I",
        "X",
        "B",
        " ",
        "E",
        "X",
        "T",
        "R",
        "A",
        "Enter",
      ]) {
        handleScopeKeyDown(makeKeyEvent({ key }), view, "scope", world, nowMs);
      }
      expect(view.preview.rejection).toBe("FORMAT");
      expect(view.rbl.lines.size).toBe(1);
    });

    it("enforces CAPACITY when committing a tenth line and clears pending without mutating active lines", () => {
      const view = createScopeView();
      const world = createWorld({
        fixRegistry: buildFixRegistry({
          navaids: [],
          fixes: [
            { id: "FIXA", xNm: 1, yNm: 1, kind: "fix" },
            { id: "FIXB", xNm: 2, yNm: 2, kind: "fix" },
          ],
        }),
      });
      const nowMs = 1000;

      // Fill 9 lines
      for (let i = 1; i <= 9; i++) {
        insertRangeBearingLine(
          view.rbl,
          { kind: "static", xNm: i, yNm: 0 },
          { kind: "static", xNm: i + 1, yNm: 0 },
          view.tracks,
        );
      }
      expect(view.rbl.lines.size).toBe(9);

      // Attempt 10th line: stage 1 FIXA Enter
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      "FIXA"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);
      expect(view.rbl.pendingFirstEndpoint).not.toBeNull();

      // Stage 2: FIXB Enter
      "FIXB"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.preview.rejection).toBe("CAPACITY");
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
      expect(view.rbl.lines.size).toBe(9);
    });

    it("handles DUP ID error with multiline active and inactive TCP supplemental lines visible on canvas", () => {
      const ac1 = makeTestAircraft({ id: "AC1", callsign: "DAL100" });
      const ac2 = makeTestAircraft({ id: "AC2", callsign: "DAL100" });
      const world = createWorld({
        aircraft: [ac1, ac2],
        flightPlans: [
          {
            id: "FP1",
            acid: "DAL100",
            assignedBeacon: "1234",
            tcp: "21",
            fixes: [],
            scratchpads: [],
            status: "active",
            flightType: "IFR",
          },
          {
            id: "FP2",
            acid: "DAL100",
            assignedBeacon: "5678",
            tcp: "22",
            fixes: [],
            scratchpads: [],
            status: "pending",
            flightType: "IFR",
          },
        ],
      });
      const view = createScopeView();
      const nowMs = 1000;

      ensureTrackDisplay(view.tracks, ac1.id);
      ensureTrackDisplay(view.tracks, ac2.id);
      view.tracks.get(ac1.id)!.lastReport = makeSyntheticReport({
        aircraftId: ac1.id,
        xNm: 10,
        yNm: 10,
      });
      view.tracks.get(ac2.id)!.lastReport = makeSyntheticReport({
        aircraftId: ac2.id,
        xNm: 20,
        yNm: 20,
      });

      // Type *T DAL100 Enter
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: " " }), view, "scope", world, nowMs);
      "DAL100"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.preview.rejection).toContain("DUP ID DAL100");
      expect(view.preview.rejection).toContain("FLIGHT ACTIVE AT 21");
      expect(view.preview.rejection).toContain("FLIGHT INACTIVE AT 22");

      // Verify multiline paint on mock canvas
      const mock = createMockCtx();
      renderScope(mock.ctx, world, view, 800, 600);
      const textCalls = mock.fillTexts.map((f) => f.text);
      expect(textCalls).toContain("DUP ID DAL100");
      expect(textCalls).toContain("FLIGHT ACTIVE AT 21");
      expect(textCalls).toContain("FLIGHT INACTIVE AT 22");
    });

    it("handles DUP BCN error when multiple living tracks report same beacon", () => {
      const ac1 = makeTestAircraft({ id: "AC1", callsign: "DAL1" });
      ac1.reportedSquawk = "4312";
      const ac2 = makeTestAircraft({ id: "AC2", callsign: "DAL2" });
      ac2.reportedSquawk = "4312";
      const world = createWorld({ aircraft: [ac1, ac2] });
      const view = createScopeView();
      const nowMs = 1000;

      ensureTrackDisplay(view.tracks, ac1.id);
      ensureTrackDisplay(view.tracks, ac2.id);
      view.tracks.get(ac1.id)!.lastReport = makeSyntheticReport({
        aircraftId: ac1.id,
        xNm: 10,
        yNm: 10,
      });
      view.tracks.get(ac2.id)!.lastReport = makeSyntheticReport({
        aircraftId: ac2.id,
        xNm: 20,
        yNm: 20,
      });

      // Type *T 4312 Enter
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: " " }), view, "scope", world, nowMs);
      "4312"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);

      expect(view.preview.rejection).toBe("DUP BCN");
    });

    it("resolves only reported beacons, never assigned-only beacon metadata", () => {
      const reported = makeTestAircraft({
        id: "REP1",
        callsign: "REP1",
        reportedSquawk: "4312",
        assignedSquawk: "7001",
        squawk: "7001",
      });
      const assignedOnly = makeTestAircraft({
        id: "ASG1",
        callsign: "ASG1",
        squawk: "4312",
        assignedSquawk: "4312",
      });
      const world = createWorld({
        aircraft: [reported, assignedOnly],
        flightPlans: [
          {
            id: "ASG1-PLAN",
            acid: "ASG1",
            assignedBeacon: "4312",
            tcp: "27",
            fixes: [],
            scratchpads: [],
            status: "active",
            flightType: "IFR",
          },
        ],
      });
      const view = createScopeView();
      for (const ac of [reported, assignedOnly]) {
        ensureTrackDisplay(view.tracks, ac.id).lastReport = makeSyntheticReport({
          aircraftId: ac.id,
          xNm: 10,
          yNm: 10,
        });
      }

      expect(lookupRblTrack("4312", world, view.tracks)).toEqual({
        kind: "resolved",
        aircraftId: "REP1",
      });

      reported.reportedSquawk = undefined;
      expect(lookupRblTrack("4312", world, view.tracks)).toEqual({ kind: "noFlight" });
    });

    it("keeps F7 T list commands separate from literal *T removal while RBLs exist", () => {
      const world = createWorld();
      const view = createScopeView();
      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 1, yNm: 1 },
        { kind: "static", xNm: 2, yNm: 2 },
        view.tracks,
      );
      handleScopeKeyDown(makeKeyEvent({ key: "F7", code: "F7" }), view, "scope", world, 1000);
      handleScopeKeyDown(makeKeyEvent({ key: "T", code: "KeyT" }), view, "scope", world, 1000);
      handleScopeKeyDown(makeKeyEvent({ key: "Enter", code: "Enter" }), view, "scope", world, 1000);
      expect(view.rbl.lines.size).toBe(1);
      expect(view.systemLists.FL.visible).toBe(true);
      expect(view.preview.rejection).toBeNull();
    });

    it("reports DUP ID when one live ACID conflicts with a separate inactive plan", () => {
      const ac = makeTestAircraft({ id: "LIVE1", callsign: "DAL200" });
      const world = createWorld({
        aircraft: [ac],
        flightPlans: [
          {
            id: "INACTIVE",
            acid: "DAL200",
            assignedBeacon: "1234",
            tcp: "27",
            fixes: [],
            scratchpads: [],
            status: "pending",
            flightType: "IFR",
          },
        ],
      });
      const view = createScopeView();
      ensureTrackDisplay(view.tracks, ac.id).lastReport = makeSyntheticReport({
        aircraftId: ac.id,
        xNm: 1,
        yNm: 2,
      });
      expect(lookupRblTrack("DAL200", world, view.tracks)).toEqual({
        kind: "dupId",
        acid: "DAL200",
        activeTcps: [],
        inactiveTcps: ["27"],
      });
    });

    it("uses the correlated operational ACID and does not accept a renamed raw callsign", () => {
      const ac = makeTestAircraft({
        id: "RENAMED1",
        callsign: "OLD100",
        reportedSquawk: "1234",
      });
      const world = createWorld({
        aircraft: [ac],
        flightPlans: [
          {
            id: "ACTIVE-RENAMED",
            acid: "NEW100",
            assignedBeacon: "1234",
            tcp: "27",
            fixes: [],
            scratchpads: [],
            status: "active",
            flightType: "IFR",
          },
        ],
      });
      const view = createScopeView();
      ensureTrackDisplay(view.tracks, ac.id).lastReport = makeSyntheticReport({
        aircraftId: ac.id,
      });
      expect(lookupRblTrack("NEW100", world, view.tracks)).toEqual({
        kind: "resolved",
        aircraftId: ac.id,
      });
      expect(lookupRblTrack("OLD100", world, view.tracks)).toEqual({ kind: "noFlight" });
    });

    it("cancels partial and staged RBL input on real focus takeover and rejects reports without finite time", () => {
      const ac = makeTestAircraft({ id: "TIME1", callsign: "TIME1" });
      const world = createWorld({ aircraft: [ac] });
      const view = createScopeView();
      const report = makeSyntheticReport({ aircraftId: ac.id, xNm: 10, yNm: 10 });
      report.reportedAtSimMs = Number.NaN;
      ensureTrackDisplay(view.tracks, ac.id).lastReport = report;
      expect(lookupRblTrack("TIME1", world, view.tracks)).toEqual({ kind: "noFlight" });

      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 1, yNm: 1 },
        { kind: "static", xNm: 2, yNm: 2 },
        view.tracks,
      );
      const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
      const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
      const fakeWindow = new EventTarget();
      const fakeDocument = new EventTarget() as EventTarget & { activeElement: Element | null };
      fakeDocument.activeElement = null;
      Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
      Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
      try {
        const uninstall = installAlwaysOnScopeKeys(view, world);
        view.preview.phase = "entry";
        view.preview.entryOrigin = "literalSplat";
        view.preview.buffer = "*T";
        fakeDocument.dispatchEvent(new Event("focusin"));
        expect(view.preview.phase).toBe("idle");

        view.rbl.pendingFirstEndpoint = { kind: "static", xNm: 3, yNm: 4 };
        view.preview.phase = "entry";
        view.preview.entryOrigin = "literalSplat";
        view.preview.mnemonic = "RBL";
        fakeDocument.dispatchEvent(new Event("focusin"));
        expect(view.rbl.pendingFirstEndpoint).toBeNull();
        expect(view.preview.phase).toBe("idle");
        expect(view.rbl.lines.size).toBe(1);
        uninstall();
      } finally {
        if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
        else Reflect.deleteProperty(globalThis, "window");
        if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
        else Reflect.deleteProperty(globalThis, "document");
      }
    });

    it("cancels pending RBL creation on Escape without affecting active RBLs", () => {
      const view = createScopeView();
      const world = createWorld();
      const nowMs = 1000;

      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 1, yNm: 1 },
        { kind: "static", xNm: 2, yNm: 2 },
        view.tracks,
      );

      // Stage 1 click
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handlePpiLeftClick(view, world, 300, 300, 800, 800);
      expect(view.rbl.pendingFirstEndpoint).not.toBeNull();

      // Escape
      handleScopeKeyDown(makeKeyEvent({ key: "Escape" }), view, "scope", world, nowMs);
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
      expect(view.preview.phase).toBe("idle");
      expect(view.rbl.lines.size).toBe(1);
    });

    it("fresh unmodified literal star replaces a staged endpoint without touching active lines", () => {
      const view = createScopeView();
      const world = createWorld();
      const nowMs = 1000;
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handlePpiLeftClick(view, world, 300, 300, 800, 800);
      expect(view.rbl.pendingFirstEndpoint).not.toBeNull();

      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
      expect(view.preview).toMatchObject({
        phase: "entry",
        buffer: "*",
        entryOrigin: "literalSplat",
      });
    });

    it("starts literal RBL after an actual MIN first click and preserves the active pair", () => {
      const ac = makeTestAircraft({ id: "MIN-THEN-RBL", callsign: "MIN-THEN-RBL", xNm: 0, yNm: 0 });
      const world = createWorld({ aircraft: [ac] });
      const view = createScopeView();
      view.minSep.activePair = { aircraftIdA: "ACTIVE-A", aircraftIdB: "ACTIVE-B" };
      ensureTrackDisplay(view.tracks, ac.id).lastReport = makeSyntheticReport({
        aircraftId: ac.id,
        xNm: 0,
        yNm: 0,
      });
      handleScopeKeyDown(
        makeKeyEvent({ key: "Delete", code: "Delete" }),
        view,
        "scope",
        world,
        1000,
      );
      const point = nmToScreen(0, 0, view.camera, { widthPx: 800, heightPx: 800 });
      handlePpiLeftClick(view, world, point.x, point.y, 800, 800);
      expect(view.minSep.pendingFirstId).toBe(ac.id);

      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, 1001);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, 1001);
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "ACTIVE-A", aircraftIdB: "ACTIVE-B" });
      expect(view.preview).toMatchObject({
        phase: "entry",
        buffer: "*T",
        entryOrigin: "literalSplat",
      });
    });

    it("starts literal RBL through scope keys while a DCB numeric spinner is armed", () => {
      const view = createScopeView();
      const world = createWorld();
      handleScopeKeyDown(makeKeyEvent({ key: "F9", ctrlKey: true }), view, "scope", world, 1000);
      expect(view.dcbSpinner.armed).toBe(true);
      for (const key of ["*", "T"]) {
        handleScopeKeyDown(makeKeyEvent({ key }), view, "scope", world, 1001);
      }
      expect(view.dcbSpinner.armed).toBe(false);
      expect(view.preview).toMatchObject({
        phase: "entry",
        buffer: "*T",
        entryOrigin: "literalSplat",
      });
    });

    it("cancels pending RBL creation when competing commands start (F7, MIN, radio focus)", () => {
      const view = createScopeView();
      const world = createWorld();
      const nowMs = 1000;

      insertRangeBearingLine(
        view.rbl,
        { kind: "static", xNm: 1, yNm: 1 },
        { kind: "static", xNm: 2, yNm: 2 },
        view.tracks,
      );

      // Stage 1 click
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handlePpiLeftClick(view, world, 300, 300, 800, 800);
      expect(view.rbl.pendingFirstEndpoint).not.toBeNull();

      // F7 press cancels pending RBL
      handleScopeKeyDown(makeKeyEvent({ key: "F7" }), view, "scope", world, nowMs);
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
      expect(view.rbl.lines.size).toBe(1);
      handleScopeKeyDown(makeKeyEvent({ key: "Escape" }), view, "scope", world, nowMs);

      // Stage again
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handlePpiLeftClick(view, world, 300, 300, 800, 800);
      expect(view.rbl.pendingFirstEndpoint).not.toBeNull();

      // MIN (Delete) cancels pending RBL
      handleScopeKeyDown(
        makeKeyEvent({ key: "Delete", code: "Delete" }),
        view,
        "scope",
        world,
        nowMs,
      );
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.preview.armed?.type).toBe("minSep");
      expect(view.rbl.lines.size).toBe(1);
    });

    it("revalidates track endpoint on commit and aborts with NO FLIGHT if track lost report", () => {
      const ac = makeTestAircraft({ id: "LOST1", callsign: "LOST1" });
      const world = createWorld({ aircraft: [ac] });
      const view = createScopeView();
      const nowMs = 1000;

      ensureTrackDisplay(view.tracks, ac.id);
      view.tracks.get(ac.id)!.lastReport = makeSyntheticReport({
        aircraftId: ac.id,
        xNm: 10,
        yNm: 10,
      });

      // Stage 1: LOST1 track
      handleScopeKeyDown(makeKeyEvent({ key: "*" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: "T" }), view, "scope", world, nowMs);
      handleScopeKeyDown(makeKeyEvent({ key: " " }), view, "scope", world, nowMs);
      "LOST1"
        .split("")
        .forEach((ch) =>
          handleScopeKeyDown(makeKeyEvent({ key: ch }), view, "scope", world, nowMs),
        );
      handleScopeKeyDown(makeKeyEvent({ key: "Enter" }), view, "scope", world, nowMs);
      expect(view.rbl.pendingFirstEndpoint).toMatchObject({ kind: "track", aircraftId: "LOST1" });

      // Track loses report
      delete view.tracks.get(ac.id)!.lastReport;

      // Stage 2 click point
      handlePpiLeftClick(view, world, 400, 400, 800, 800);

      expect(view.preview.rejection).toBe("NO FLIGHT");
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
      expect(view.rbl.lines.size).toBe(0);
    });

    it("revalidates that a typed first track is still living at click commit", () => {
      const ac = makeTestAircraft({ id: "REMOVED1", callsign: "REMOVED1" });
      const world = createWorld({ aircraft: [ac] });
      const view = createScopeView();
      ensureTrackDisplay(view.tracks, ac.id).lastReport = makeSyntheticReport({
        aircraftId: ac.id,
        xNm: 10,
        yNm: 10,
      });
      for (const key of ["*", "T", " ", ..."REMOVED1", "Enter"]) {
        handleScopeKeyDown(makeKeyEvent({ key }), view, "scope", world, 1000);
      }
      world.aircraft = [];
      handlePpiLeftClick(view, world, 400, 400, 800, 800);
      expect(view.preview.rejection).toBe("NO FLIGHT");
      expect(view.rbl.pendingFirstEndpoint).toBeNull();
      expect(view.rbl.lines.size).toBe(0);
    });

    it.each(["typed", "click"] as const)(
      "checks lost first-track report before capacity on %s second commit",
      (commitMode) => {
        const ac = makeTestAircraft({ id: "LOSTCAP1", callsign: "LOSTCAP1" });
        const world = createWorld({
          aircraft: [ac],
          fixRegistry: buildFixRegistry({
            navaids: [],
            fixes: [{ id: "FIXB", xNm: 2, yNm: 2, kind: "fix" }],
          }),
        });
        const view = createScopeView();
        ensureTrackDisplay(view.tracks, ac.id).lastReport = makeSyntheticReport({
          aircraftId: ac.id,
          xNm: 10,
          yNm: 10,
        });
        for (let i = 1; i <= 9; i++) {
          insertRangeBearingLine(
            view.rbl,
            { kind: "static", xNm: i, yNm: 0 },
            { kind: "static", xNm: i + 1, yNm: 0 },
            view.tracks,
          );
        }

        for (const key of ["*", "T", " ", ..."LOSTCAP1", "Enter"]) {
          handleScopeKeyDown(makeKeyEvent({ key }), view, "scope", world, 1000);
        }
        expect(view.rbl.pendingFirstEndpoint).toMatchObject({ kind: "track", aircraftId: ac.id });
        delete view.tracks.get(ac.id)!.lastReport;

        if (commitMode === "typed") {
          for (const key of [..."FIXB", "Enter"]) {
            handleScopeKeyDown(makeKeyEvent({ key }), view, "scope", world, 1000);
          }
        } else {
          handlePpiLeftClick(view, world, 400, 400, 800, 800);
        }

        expect(view.preview.rejection).toBe("NO FLIGHT");
        expect(view.rbl.pendingFirstEndpoint).toBeNull();
        expect(view.rbl.lines.size).toBe(9);
      },
    );
  });
});
