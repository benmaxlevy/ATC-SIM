import { describe, expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { applyIntent } from "@pilot";
import {
  formatFullDatablock,
  formatPartialDatablock,
  formatGroundSpeedTens,
  getSpecialPurposeCode,
} from "./datablock";
import {
  createTrackDisplay,
  deriveScratchpads,
  setScratchpad1,
  setScratchpad2,
  clearScratchpad1,
  clearScratchpad2,
  syncTrackDisplays,
  handleTrackMiddleClick,
} from "./trackDisplay";
import { renderScope } from "./renderScope";
import { createScopeView } from "./scopeView";
import { PALETTE } from "./palette";

interface MockText {
  text: string;
  x: number;
  y: number;
  fillStyle?: string;
  font: string;
}

function createMockCtx() {
  const fillTexts: MockText[] = [];
  let currentFillStyle = "#FFFFFF";
  let currentFont = "12px monospace";

  const ctx = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    rect: () => {},
    stroke: () => {},
    fill: () => {},
    strokeRect: () => {},
    fillRect: () => {},
    clearRect: () => {},
    setLineDash: () => {},
    fillText: (text: string, x: number, y: number) => {
      fillTexts.push({
        text,
        x,
        y,
        fillStyle: currentFillStyle,
        font: currentFont,
      });
    },
    measureText: (text: string) => ({ width: text.length * 7.2 }),
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(val: string) {
      currentFillStyle = val;
    },
    get font() {
      return currentFont;
    },
    set font(val: string) {
      currentFont = val;
    },
  } as unknown as CanvasRenderingContext2D;

  return { ctx, fillTexts };
}

describe("STARS CRC Datablock & Scratchpad Fidelity Acceptance (T02-42)", () => {
  describe("AC1: Radio Clearances to Automatic Scratchpad Derivation (SP1 / SP2)", () => {
    test("Approach clearance derives standard shorthand in SP1 (e.g. ILS 27 -> I27)", () => {
      const ac = makeTestAircraft({
        id: "ac-ils",
        callsign: "DAL100",
        altitudeFt: 5000,
        speedKt: 210,
      });
      const td = createTrackDisplay("owned");

      // Initially no approach
      let derived = deriveScratchpads(ac, td);
      expect(derived.sp1).toBe("");

      // Expected approach
      ac.intent.expectedApproachId = "kdem-ils27";
      derived = deriveScratchpads(ac, td);
      expect(derived.sp1).toBe("I27");
      expect(td.sp1).toBe("I27");

      // Cleared approach overrides expected
      ac.intent.clearedApproachId = "RNAV 22L";
      derived = deriveScratchpads(ac, td);
      expect(derived.sp1).toBe("R22L");
      expect(td.sp1).toBe("R22L");
    });

    test("Interim assigned altitude derives 3-digit hundreds in SP1 when no approach is set", () => {
      const ac = makeTestAircraft({
        id: "ac-alt",
        callsign: "AAL200",
        altitudeFt: 8000,
        speedKt: 250,
      });
      const td = createTrackDisplay("owned");

      // Descend clearance to 4,000 ft
      applyIntent(ac, [{ type: "ALTITUDE", altitudeFt: 4000, verb: "DESCEND" }], 0);
      const derived = deriveScratchpads(ac, td);
      expect(derived.sp1).toBe("040");

      // When level at assigned altitude, interim altitude scratchpad clears
      ac.altitudeFt = 4000;
      const leveled = deriveScratchpads(ac, td);
      expect(leveled.sp1).toBe("");
    });

    test("Speed clearance derives S + 2-digit tens in SP2 (e.g. 210 kt -> S21)", () => {
      const ac = makeTestAircraft({
        id: "ac-spd",
        callsign: "SWA300",
        altitudeFt: 6000,
        speedKt: 250,
      });
      const td = createTrackDisplay("owned");

      // Reduce speed to 180 kt
      applyIntent(ac, [{ type: "SPEED", speedKt: 180, verb: "REDUCE" }], 0);
      const derived = deriveScratchpads(ac, td);
      expect(derived.sp2).toBe("S18");
      expect(td.sp2).toBe("S18");
    });

    test("Manual scratchpad entry overrides auto-derivation and clearing restores auto-derivation", () => {
      const ac = makeTestAircraft({
        id: "ac-override",
        callsign: "UAL400",
        altitudeFt: 8000,
      });
      ac.intent.assignedAltitudeFt = 3000;
      ac.intent.assignedSpeedKt = 210;

      const tracks = new Map();
      const td = createTrackDisplay("owned");
      tracks.set(ac.id, td);

      // Automatic values
      let derived = deriveScratchpads(ac, td);
      expect(derived.sp1).toBe("030");
      expect(derived.sp2).toBe("S21");

      // Manual override
      setScratchpad1(tracks, ac.id, "HOLD");
      setScratchpad2(tracks, ac.id, "GATE");
      derived = deriveScratchpads(ac, td);
      expect(derived.sp1).toBe("HOLD");
      expect(derived.sp2).toBe("GATE");

      // Clearing manual overrides
      clearScratchpad1(tracks, ac.id);
      clearScratchpad2(tracks, ac.id);
      derived = deriveScratchpads(ac, td);
      expect(derived.sp1).toBe("030");
      expect(derived.sp2).toBe("S21");
    });
  });

  describe("AC2: Tens-Based Ground Speed & Category Suffixes", () => {
    test("Ground speed formats to 2-digit tens with wake/RNAV suffix", () => {
      expect(formatGroundSpeedTens(180, { wakeCategory: "H" })).toBe("18H");
      expect(formatGroundSpeedTens(250, { wakeCategory: "R" })).toBe("25R");
      expect(formatGroundSpeedTens(210, { wakeCategory: "B" })).toBe("21B");
      expect(formatGroundSpeedTens(120, { wakeCategory: "L" })).toBe("12L");
      expect(formatGroundSpeedTens(250, { wakeCategory: "A" })).toBe("25A");
      expect(formatGroundSpeedTens(210)).toBe("21");
      expect(formatGroundSpeedTens(85)).toBe("09");
      expect(formatGroundSpeedTens(80)).toBe("08");
    });

    test("Flight category suffixes (VFR / Overflight) apply when no wake category is present", () => {
      expect(formatGroundSpeedTens(110, { flightRules: "VFR" })).toBe("11V");
      expect(formatGroundSpeedTens(280, { isOverflight: true })).toBe("28E");
      // Wake takes precedence over VFR
      expect(formatGroundSpeedTens(110, { wakeCategory: "L", flightRules: "VFR" })).toBe("11L");
    });

    test("PDB suppresses ground speed when suppressPdbSpeed option is enabled", () => {
      const ac = makeTestAircraft({
        callsign: "N12345",
        altitudeFt: 3500,
        speedKt: 120,
      });
      const normalPdb = formatPartialDatablock(ac);
      expect(normalPdb.line1).toBe("035  12");

      const suppressedPdb = formatPartialDatablock(ac, { suppressPdbSpeed: true });
      expect(suppressedPdb.line1).toBe("035");
    });
  });

  describe("AC3: Multi-Phase Line 2 Time-Sharing Rotation & Handoff Center Placement", () => {
    test("Left and Right columns rotate smoothly across simulation time without dead phases", () => {
      const ac = makeTestAircraft({
        id: "ac-cycle",
        callsign: "AAL500",
        altitudeFt: 6000,
        speedKt: 210,
        aircraftType: "A321",
        requestedAltitudeFt: 10000,
      });

      // Left queue: [Mode C (060), SP1 (I27), SP2 (S21)] (length 3)
      // Right queue: [GS (21), Type (A321), ReqAlt (R100)] (length 3)
      const opts = { sp1: "I27", sp2: "S21" };

      // t=0s (Phase 0): 060  21
      expect(formatFullDatablock(ac, { ...opts, simTimeMs: 0 }).line2).toBe("060  21");

      // t=2.5s (Phase 1): I27  A321
      expect(formatFullDatablock(ac, { ...opts, simTimeMs: 2500 }).line2).toBe("I27  A321");

      // t=5.0s (Phase 2): S21  R100
      expect(formatFullDatablock(ac, { ...opts, simTimeMs: 5000 }).line2).toBe("S21  R100");

      // t=7.5s (Phase 3): 060  21 (cycles back)
      expect(formatFullDatablock(ac, { ...opts, simTimeMs: 7500 }).line2).toBe("060  21");
    });

    test("Active handoff displays center sector ID character on Line 2", () => {
      const ac = makeTestAircraft({
        id: "ac-ho",
        callsign: "DAL600",
        altitudeFt: 7000,
        speedKt: 250,
        aircraftType: "B738",
      });

      const fdbHandoff = formatFullDatablock(ac, {
        sp1: "I27",
        handoffSectorId: "D",
        timeSharePhase: 0,
      });
      expect(fdbHandoff.line2).toBe("070  D  25");

      const fdbPhase1 = formatFullDatablock(ac, {
        sp1: "I27",
        handoffSectorId: "D",
        timeSharePhase: 1,
      });
      expect(fdbPhase1.line2).toBe("I27  D  B738");

      const pdbHandoff = formatPartialDatablock(ac, {
        sp1: "I27",
        handoffSectorId: "C",
        timeSharePhase: 0,
      });
      expect(pdbHandoff.line1).toBe("070  C  25");
    });
  });

  describe("AC4: Special Purpose Transponder Emergency Codes (EM, RF, HJ)", () => {
    test("Squawk 7700 renders EM next to callsign on Line 1", () => {
      const ac = makeTestAircraft({ callsign: "EM1", squawk: "7700" });
      expect(getSpecialPurposeCode(ac)).toBe("EM");
      expect(formatFullDatablock(ac).line1).toBe("EM1 EM");
    });

    test("Squawk 7600 renders RF next to callsign on Line 1", () => {
      const ac = makeTestAircraft({ callsign: "RF1", squawk: "7600" });
      expect(getSpecialPurposeCode(ac)).toBe("RF");
      expect(formatFullDatablock(ac).line1).toBe("RF1 RF");
    });

    test("Squawk 7500 renders HJ next to callsign on Line 1", () => {
      const ac = makeTestAircraft({ callsign: "HJ1", squawk: "7500" });
      expect(getSpecialPurposeCode(ac)).toBe("HJ");
      expect(formatFullDatablock(ac).line1).toBe("HJ1 HJ");
    });
  });

  describe("AC5: End-to-End Scope Rendering & Canvas Verification", () => {
    test("renderScope paints Full Data Block with time-shared lines, leader, and ownership styling", () => {
      const ac = makeTestAircraft({
        id: "ac-render",
        callsign: "JBU700",
        altitudeFt: 5000,
        speedKt: 210,
        aircraftType: "A320",
        xNm: 0,
        yNm: 0,
      });
      ac.intent.clearedApproachId = "ILS 27";
      ac.intent.assignedSpeedKt = 210;

      const world = createWorld({ aircraft: [ac], simTimeMs: 0 });
      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);

      const td = view.tracks.get(ac.id)!;
      td.ownership = "owned";
      td.datablockMode = "full";

      // Render at t=0ms: Line 1 JBU700, Line 2 Mode C (050) + GS (21)
      const mock0 = createMockCtx();
      renderScope(mock0.ctx, world, view, 800, 800);

      const line1 = mock0.fillTexts.find((t) => t.text === "JBU700");
      expect(line1).toBeDefined();
      expect(line1?.fillStyle).toBe(PALETTE.owned); // White #FFFFFF

      const line2At0 = mock0.fillTexts.find((t) => t.text === "050  21");
      expect(line2At0).toBeDefined();

      // Render at t=2500ms: Line 2 Phase 1 SP1 (I27) + Type (A320)
      world.simTimeMs = 2500;
      const mock2500 = createMockCtx();
      renderScope(mock2500.ctx, world, view, 800, 800);
      const line2At2500 = mock2500.fillTexts.find((t) => t.text === "I27  A320");
      expect(line2At2500).toBeDefined();

      // Render at t=5000ms: Line 2 Phase 2 SP2 (S21) + GS (21)
      world.simTimeMs = 5000;
      const mock5000 = createMockCtx();
      renderScope(mock5000.ctx, world, view, 800, 800);
      const line2At5000 = mock5000.fillTexts.find((t) => t.text === "S21  21");
      expect(line2At5000).toBeDefined();
    });

    test("Middle-clicking track toggles Cyan highlight (#00FFFF) across all datablock lines", () => {
      const ac = makeTestAircraft({
        id: "ac-hl",
        callsign: "DAL800",
        altitudeFt: 6000,
        speedKt: 250,
      });
      const world = createWorld({ aircraft: [ac] });
      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);

      const td = view.tracks.get(ac.id)!;
      td.ownership = "owned";
      td.datablockMode = "full";

      handleTrackMiddleClick(view.tracks, world, ac.id);
      expect(td.highlighted).toBe(true);

      const mock = createMockCtx();
      renderScope(mock.ctx, world, view, 800, 800);

      const callsignText = mock.fillTexts.find((t) => t.text === "DAL800");
      expect(callsignText?.fillStyle).toBe(PALETTE.highlight); // #00FFFF
    });
  });
});
