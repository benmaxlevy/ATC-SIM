import { describe, expect, it } from "vitest";
import {
  beginMinSepSelection,
  cancelMinSepPending,
  clearMinSepState,
  computeMinimumSeparation,
  createMinSepState,
  invalidateMinSepPair,
  isValidMinSepTrackInput,
  minSepInputFromReport,
  selectMinSepAircraft,
  type MinSepTrackInput,
} from "../minimumSeparation";
import { createScopeView } from "../scopeView";
import type { SurveillanceReport } from "../surveillance";

describe("minimumSeparation", () => {
  describe("session state management (AC1)", () => {
    it("initializes empty in createMinSepState and on ScopeView", () => {
      const state = createMinSepState();
      expect(state.activePair).toBeNull();
      expect(state.pendingFirstId).toBeNull();
      expect(state.lastError).toBeNull();

      const view = createScopeView(0, 0);
      expect(view.minSep).toBeDefined();
      expect(view.minSep.activePair).toBeNull();
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.lastError).toBeNull();
    });

    it("activates a pair only after two distinct selections, storing stable IDs", () => {
      const state = createMinSepState();
      beginMinSepSelection(state);

      const r1 = selectMinSepAircraft(state, "ac-1");
      expect(r1).toEqual({ status: "pending_first", firstId: "ac-1" });
      expect(state.pendingFirstId).toBe("ac-1");
      expect(state.activePair).toBeNull();

      const r2 = selectMinSepAircraft(state, "ac-2");
      expect(r2).toEqual({
        status: "pair_activated",
        pair: { aircraftIdA: "ac-1", aircraftIdB: "ac-2" },
      });
      expect(state.pendingFirstId).toBeNull();
      expect(state.activePair).toEqual({ aircraftIdA: "ac-1", aircraftIdB: "ac-2" });
    });

    it("aborts pending entry with DUP TRK when duplicate target is selected, preserving active pair", () => {
      const state = createMinSepState();
      // Setup existing active pair
      selectMinSepAircraft(state, "ac-1");
      selectMinSepAircraft(state, "ac-2");
      expect(state.activePair).toEqual({ aircraftIdA: "ac-1", aircraftIdB: "ac-2" });

      // Start new selection and pick same aircraft twice
      beginMinSepSelection(state);
      selectMinSepAircraft(state, "ac-3");
      const dupResult = selectMinSepAircraft(state, "ac-3");

      expect(dupResult).toEqual({
        status: "error",
        error: "DUP TRK",
        preservedPair: { aircraftIdA: "ac-1", aircraftIdB: "ac-2" },
      });
      expect(state.pendingFirstId).toBeNull();
      expect(state.lastError).toBe("DUP TRK");
      // Preserved previous active pair
      expect(state.activePair).toEqual({ aircraftIdA: "ac-1", aircraftIdB: "ac-2" });
    });

    it("cancels or restarts pending entry while preserving active pair", () => {
      const state = createMinSepState();
      selectMinSepAircraft(state, "ac-1");
      selectMinSepAircraft(state, "ac-2");

      // Start selection, pick one, then cancel
      selectMinSepAircraft(state, "ac-3");
      expect(state.pendingFirstId).toBe("ac-3");
      cancelMinSepPending(state);
      expect(state.pendingFirstId).toBeNull();
      expect(state.activePair).toEqual({ aircraftIdA: "ac-1", aircraftIdB: "ac-2" });

      // Begin selection resets pending/error but preserves active
      selectMinSepAircraft(state, "ac-4");
      beginMinSepSelection(state);
      expect(state.pendingFirstId).toBeNull();
      expect(state.activePair).toEqual({ aircraftIdA: "ac-1", aircraftIdB: "ac-2" });
    });

    it("clears both active pair and pending selection on clearMinSepState", () => {
      const state = createMinSepState();
      selectMinSepAircraft(state, "ac-1");
      selectMinSepAircraft(state, "ac-2");
      selectMinSepAircraft(state, "ac-3"); // pending first

      clearMinSepState(state);
      expect(state.activePair).toBeNull();
      expect(state.pendingFirstId).toBeNull();
      expect(state.lastError).toBeNull();

      // Repeated clear is harmless
      clearMinSepState(state);
      expect(state.activePair).toBeNull();
    });

    it("invalidates active pair when requested", () => {
      const state = createMinSepState();
      selectMinSepAircraft(state, "ac-1");
      selectMinSepAircraft(state, "ac-2");
      invalidateMinSepPair(state);
      expect(state.activePair).toBeNull();
    });
  });

  describe("converging kinematic prediction and magnetic variation (AC2)", () => {
    it("predicts exact CPA time, positions, and distance for synthetic converging tracks", () => {
      // Aircraft A at (0, 0) flying East (hdg 090 true) at 360 kt (0.1 NM/s).
      // Aircraft B at (10, 10) flying South (hdg 180 true) at 360 kt (0.1 NM/s).
      // Pos A(t) = (0.1*t, 0)
      // Pos B(t) = (10, 10 - 0.1*t)
      // Δr = (10 - 0.1*t, 10 - 0.1*t)
      // dist^2(t) = 2*(10 - 0.1*t)^2
      // Minimum distance occurs when 10 - 0.1*t = 0 => t = 100 s.
      // At t = 100 s:
      // Pos A = (10, 0), Pos B = (10, 0), distance = 0.0 NM.
      const trackA: MinSepTrackInput = {
        aircraftId: "AAL100",
        xNm: 0,
        yNm: 0,
        headingDeg: 90,
        speedKt: 360,
      };
      const trackB: MinSepTrackInput = {
        aircraftId: "DAL200",
        xNm: 10,
        yNm: 10,
        headingDeg: 180,
        speedKt: 360,
      };

      const result = computeMinimumSeparation(trackA, trackB, 0);
      expect(result).not.toBeNull();
      expect(result!.timeToCpaSec).toBeCloseTo(100, 5);
      expect(result!.posANm.xNm).toBeCloseTo(10, 5);
      expect(result!.posANm.yNm).toBeCloseTo(0, 5);
      expect(result!.posBNm.xNm).toBeCloseTo(10, 5);
      expect(result!.posBNm.yNm).toBeCloseTo(0, 5);
      expect(result!.distanceNm).toBeCloseTo(0, 5);
      expect(result!.isIncreasingDistance).toBe(false);
    });

    it("applies magnetic variation exactly once into true ENU projection", () => {
      // In a magnetic variation area of +14 deg (East variation, magneticToTrue = mag + 14):
      // If track headings are given in magnetic:
      // Aircraft A: magnetic 076 -> true 090 (East)
      // Aircraft B: magnetic 166 -> true 180 (South)
      // This should produce the exact same true-ENU CPA time (100 s) and world positions as above.
      const trackA: MinSepTrackInput = {
        aircraftId: "AAL100",
        xNm: 0,
        yNm: 0,
        headingDeg: 76,
        speedKt: 360,
      };
      const trackB: MinSepTrackInput = {
        aircraftId: "DAL200",
        xNm: 10,
        yNm: 10,
        headingDeg: 166,
        speedKt: 360,
      };

      const result = computeMinimumSeparation(trackA, trackB, 14);
      expect(result).not.toBeNull();
      expect(result!.timeToCpaSec).toBeCloseTo(100, 5);
      expect(result!.posANm.xNm).toBeCloseTo(10, 5);
      expect(result!.posANm.yNm).toBeCloseTo(0, 5);
      expect(result!.posBNm.xNm).toBeCloseTo(10, 5);
      expect(result!.posBNm.yNm).toBeCloseTo(0, 5);
      expect(result!.distanceNm).toBeCloseTo(0, 5);
      expect(result!.isIncreasingDistance).toBe(false);

      // Contrast: if computed with magVarDeg = 0, headings remain 076 and 166, yielding different result.
      const unshifted = computeMinimumSeparation(trackA, trackB, 0);
      expect(unshifted!.posANm.xNm).not.toBeCloseTo(10, 2);
    });
  });

  describe("diverging, parallel, and stationary edges (AC3)", () => {
    it("identifies diverging tracks: tCpa is 0, distance is current distance, isIncreasingDistance is true (NO XING)", () => {
      // Aircraft A at (0, 0) flying West (hdg 270) at 360 kt
      // Aircraft B at (10, 0) flying East (hdg 090) at 360 kt
      // Current distance is 10 NM. Tracks are separating.
      const trackA: MinSepTrackInput = {
        aircraftId: "AAL100",
        xNm: 0,
        yNm: 0,
        headingDeg: 270,
        speedKt: 360,
      };
      const trackB: MinSepTrackInput = {
        aircraftId: "DAL200",
        xNm: 10,
        yNm: 0,
        headingDeg: 90,
        speedKt: 360,
      };

      const result = computeMinimumSeparation(trackA, trackB, 0);
      expect(result).not.toBeNull();
      expect(result!.timeToCpaSec).toBe(0);
      expect(result!.posANm).toEqual({ xNm: 0, yNm: 0 });
      expect(result!.posBNm).toEqual({ xNm: 10, yNm: 0 });
      expect(result!.distanceNm).toBeCloseTo(10, 5);
      expect(result!.isIncreasingDistance).toBe(true);
    });

    it("handles parallel equal-speed tracks without divide-by-zero or false NO XING", () => {
      // Both flying North (hdg 360) at 300 kt, separated laterally by 5 NM
      const trackA: MinSepTrackInput = {
        aircraftId: "AAL100",
        xNm: 0,
        yNm: 0,
        headingDeg: 360,
        speedKt: 300,
      };
      const trackB: MinSepTrackInput = {
        aircraftId: "DAL200",
        xNm: 5,
        yNm: 0,
        headingDeg: 360,
        speedKt: 300,
      };

      const result = computeMinimumSeparation(trackA, trackB, 0);
      expect(result).not.toBeNull();
      expect(result!.timeToCpaSec).toBe(0);
      expect(result!.posANm).toEqual({ xNm: 0, yNm: 0 });
      expect(result!.posBNm).toEqual({ xNm: 5, yNm: 0 });
      expect(result!.distanceNm).toBeCloseTo(5, 5);
      // Parallel equal-velocity does not show NO XING
      expect(result!.isIncreasingDistance).toBe(false);
    });

    it("handles stationary targets with finite current distance and isIncreasingDistance = false", () => {
      const trackA: MinSepTrackInput = {
        aircraftId: "AAL100",
        xNm: 0,
        yNm: 0,
        headingDeg: 0,
        speedKt: 0,
      };
      const trackB: MinSepTrackInput = {
        aircraftId: "DAL200",
        xNm: 3,
        yNm: 4,
        headingDeg: 0,
        speedKt: 0,
      };

      const result = computeMinimumSeparation(trackA, trackB, 0);
      expect(result).not.toBeNull();
      expect(result!.timeToCpaSec).toBe(0);
      expect(result!.distanceNm).toBeCloseTo(5, 5);
      expect(result!.isIncreasingDistance).toBe(false);
    });
  });

  describe("numerical guards, altitude independence, and report isolation (AC4)", () => {
    it("returns null for non-finite inputs or coordinates", () => {
      const valid: MinSepTrackInput = {
        aircraftId: "AAL100",
        xNm: 0,
        yNm: 0,
        headingDeg: 90,
        speedKt: 250,
      };

      expect(computeMinimumSeparation({ ...valid, xNm: NaN }, valid)).toBeNull();
      expect(computeMinimumSeparation(valid, { ...valid, yNm: Infinity })).toBeNull();
      expect(computeMinimumSeparation(valid, { ...valid, speedKt: NaN })).toBeNull();
      expect(computeMinimumSeparation(valid, { ...valid, headingDeg: -Infinity })).toBeNull();
      expect(computeMinimumSeparation(valid, valid, NaN)).toBeNull();
      expect(isValidMinSepTrackInput({ ...valid, aircraftId: "" })).toBe(false);
    });

    it("verifies horizontal crossing yields zero distance regardless of vertical separation", () => {
      // Same horizontal geometry as converging test, but altitudes 3,000 ft and 35,000 ft
      const trackA: MinSepTrackInput = {
        aircraftId: "AAL100",
        xNm: 0,
        yNm: 0,
        headingDeg: 90,
        speedKt: 360,
        altitudeFt: 3000,
      };
      const trackB: MinSepTrackInput = {
        aircraftId: "DAL200",
        xNm: 10,
        yNm: 10,
        headingDeg: 180,
        speedKt: 360,
        altitudeFt: 35000,
      };

      const result = computeMinimumSeparation(trackA, trackB, 0);
      expect(result).not.toBeNull();
      expect(result!.distanceNm).toBeCloseTo(0, 5);
      expect(result!.timeToCpaSec).toBeCloseTo(100, 5);
    });

    it("converts surveillance report without mutating source or requiring live aircraft", () => {
      const report: SurveillanceReport = {
        aircraftId: "N12345",
        xNm: 12.5,
        yNm: -8.2,
        headingDeg: 240,
        speedKt: 180,
        altitudeFt: 5000,
        reportedAtSimMs: 123456,
        sourceSiteId: null,
        paint: "fused-puck",
      };

      const input = minSepInputFromReport(report);
      expect(input).toEqual({
        aircraftId: "N12345",
        xNm: 12.5,
        yNm: -8.2,
        headingDeg: 240,
        speedKt: 180,
        altitudeFt: 5000,
      });

      // Modifying input does not affect report
      input.xNm = 999;
      expect(report.xNm).toBe(12.5);
    });
  });
});
