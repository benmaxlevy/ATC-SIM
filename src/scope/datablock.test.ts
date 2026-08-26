import { expect, test } from "vitest";
import { makeTestAircraft } from "@core";
import { applyIntent } from "@pilot";
import {
  datablockRect,
  formatAltitudeHundreds,
  formatFullDatablock,
  formatGroundSpeedTens,
  formatLimitedDatablock,
  formatPartialDatablock,
  formatRequestedAltitude,
  formatWakeCategory,
  getSpecialPurposeCode,
  linesForDatablock,
  pointInDatablock,
  withInboundHandoffCue,
} from "./datablock";
import { DATABLOCK_FONT, DATABLOCK_FONT_PX, SCOPE_FONT_STACK } from "./fonts";
import { DEFAULT_LEADER_DIR, LEADER_LENGTH_PX } from "./leader";

function track(overrides: {
  callsign?: string;
  altitudeFt?: number;
  assignedAltitudeFt?: number;
  requestedAltitudeFt?: number;
  speedKt?: number;
  aircraftType?: string;
  squawk?: string;
  assignedSquawk?: string;
  reportedSquawk?: string;
  wakeCategory?: string;
  spc?: string;
  pilotReportedAltitude?: boolean;
  atpaDistance?: string;
}) {
  const ac = makeTestAircraft({
    callsign: overrides.callsign ?? "DAL123",
    altitudeFt: overrides.altitudeFt ?? 3000,
    speedKt: overrides.speedKt ?? 210,
    aircraftType: overrides.aircraftType,
    squawk: overrides.squawk,
    wakeCategory: overrides.wakeCategory,
    spc: overrides.spc,
    requestedAltitudeFt: overrides.requestedAltitudeFt,
    assignedSquawk: overrides.assignedSquawk,
    reportedSquawk: overrides.reportedSquawk,
    pilotReportedAltitude: overrides.pilotReportedAltitude,
    atpaDistance: overrides.atpaDistance,
  });
  if (overrides.assignedAltitudeFt != null) {
    ac.intent.assignedAltitudeFt = overrides.assignedAltitudeFt;
  }
  if (overrides.requestedAltitudeFt != null) {
    ac.intent.requestedAltitudeFt = overrides.requestedAltitudeFt;
  }
  return ac;
}

test("AC1 / AC6 — FDB Line 2 time-sharing alternates between Mode C/GS and Scratchpad/Type/ReqAlt across sim timestamps", () => {
  const ac = track({
    altitudeFt: 3000,
    assignedAltitudeFt: 3000,
    speedKt: 210,
    aircraftType: "B738",
  });

  // t=0s (Phase A): Mode C + GS (tens)
  const at0 = formatFullDatablock(ac, { simTimeMs: 0, scratchpad: "HOLD" });
  expect(at0).toEqual({ line1: "DAL123", line2: "030  21" });

  // t=2.5s (Phase B): Scratchpad + Type
  const at2500 = formatFullDatablock(ac, { simTimeMs: 2500, scratchpad: "HOLD" });
  expect(at2500).toEqual({ line1: "DAL123", line2: "HOLD  B738" });

  // t=5s (Phase A): Mode C + GS
  const at5000 = formatFullDatablock(ac, { simTimeMs: 5000, scratchpad: "HOLD" });
  expect(at5000).toEqual({ line1: "DAL123", line2: "030  21" });

  // t=7.5s (Phase B): Scratchpad + Type
  const at7500 = formatFullDatablock(ac, { simTimeMs: 7500, scratchpad: "HOLD" });
  expect(at7500).toEqual({ line1: "DAL123", line2: "HOLD  B738" });

  // Phase override options
  expect(formatFullDatablock(ac, { timeSharePhase: 0, scratchpad: "HOLD" }).line2).toBe("030  21");
  expect(formatFullDatablock(ac, { timeSharePhase: 1, scratchpad: "HOLD" }).line2).toBe(
    "HOLD  B738",
  );

  // When no scratchpad is set, Mode C stays steady on left while right cycles to Type
  const noSpadPhaseB = formatFullDatablock(ac, { simTimeMs: 2500 });
  expect(noSpadPhaseB.line2).toBe("030  B738");

  // When neither scratchpad nor type nor reqAlt exists, Line 2 stays steady Mode C + GS
  const emptyAc = track({ altitudeFt: 3000, speedKt: 210 });
  expect(formatFullDatablock(emptyAc, { simTimeMs: 2500 }).line2).toBe("030  21");
});

test("AC2 / AC6 — Line 3 displays assigned altitude prefixed with A when |assigned - altitude| >= 100 ft", () => {
  // Matching altitude: Line 3 omitted
  const same = formatFullDatablock(
    track({ altitudeFt: 3000, assignedAltitudeFt: 3000, speedKt: 210 }),
  );
  expect(same).toEqual({ line1: "DAL123", line2: "030  21" });
  expect(same.line3).toBeUndefined();

  // Differs by 50 ft (< 100 ft): Line 3 omitted
  const underBoundary = formatFullDatablock(
    track({ altitudeFt: 3050, assignedAltitudeFt: 3000, speedKt: 210 }),
  );
  expect(underBoundary.line2).toBe("031  21");
  expect(underBoundary.line3).toBeUndefined();

  // Differs by 100 ft (boundary): Line 3 displays A030
  const atBoundary = formatFullDatablock(
    track({ altitudeFt: 3100, assignedAltitudeFt: 3000, speedKt: 210 }),
  );
  expect(atBoundary.line2).toBe("031  21");
  expect(atBoundary.line3).toBe("A030");

  // Descending from 3250 to 3000 ft: Line 2 is 033 21, Line 3 is A030
  const rounded = formatFullDatablock(
    track({ altitudeFt: 3250, assignedAltitudeFt: 3000, speedKt: 210 }),
  );
  expect(formatAltitudeHundreds(3250)).toBe("033");
  expect(rounded).toEqual({ line1: "DAL123", line2: "033  21", line3: "A030" });

  // Climbing from 3000 to 4000 ft: Line 3 is A040
  const climb = formatFullDatablock(
    track({ altitudeFt: 3000, assignedAltitudeFt: 4000, speedKt: 210 }),
  );
  expect(climb).toEqual({ line1: "DAL123", line2: "030  21", line3: "A040" });
});

test("AC3 — Requested altitude on Line 2 is prefixed with R (e.g. R070) when displayed", () => {
  expect(formatRequestedAltitude(7000)).toBe("R070");
  expect(formatRequestedAltitude(10000)).toBe("R100");
  expect(formatRequestedAltitude(4500)).toBe("R045");
  expect(formatRequestedAltitude(undefined)).toBeUndefined();

  // Track with requested altitude and scratchpad in Phase B
  const acWithReq = track({
    altitudeFt: 3000,
    speedKt: 210,
    requestedAltitudeFt: 7000,
  });
  const spadReq = formatFullDatablock(acWithReq, { simTimeMs: 2500, scratchpad: "BOS" });
  expect(spadReq.line2).toBe("BOS  R070");

  // Track with requested altitude and no scratchpad: Mode C remains on left, R070 on right
  const noSpadReq = formatFullDatablock(acWithReq, { simTimeMs: 2500 });
  expect(noSpadReq.line2).toBe("030  R070");

  // Track with type and requested altitude and no scratchpad in Phase B (t=2500) and Phase C (t=5000)
  const typeAndReq = track({
    altitudeFt: 3000,
    speedKt: 210,
    aircraftType: "B738",
    requestedAltitudeFt: 7000,
  });
  const phaseB = formatFullDatablock(typeAndReq, { simTimeMs: 2500 });
  expect(phaseB.line2).toBe("030  B738");
  const phaseC = formatFullDatablock(typeAndReq, { simTimeMs: 5000 });
  expect(phaseC.line2).toBe("030  R070");
});

test("AC4 — Wake turbulence / RNAV category letters (H, B, R, L, etc.) append to ground speed", () => {
  expect(formatWakeCategory("H")).toBe("H");
  expect(formatWakeCategory("r")).toBe("R");
  expect(formatWakeCategory("b")).toBe("B");
  expect(formatWakeCategory("l")).toBe("L");
  expect(formatWakeCategory("")).toBe("");

  const heavy = track({ altitudeFt: 3000, speedKt: 210, wakeCategory: "H" });
  expect(formatFullDatablock(heavy).line2).toBe("030  21H");

  const rnav = track({ altitudeFt: 3000, speedKt: 210, wakeCategory: "R" });
  expect(formatFullDatablock(rnav).line2).toBe("030  21R");

  const b757 = track({ altitudeFt: 3000, speedKt: 210, wakeCategory: "B" });
  expect(formatFullDatablock(b757).line2).toBe("030  21B");

  const light = track({ altitudeFt: 3000, speedKt: 120, wakeCategory: "L" });
  expect(formatFullDatablock(light).line2).toBe("030  12L");

  const cwtA = track({ altitudeFt: 3000, speedKt: 250, wakeCategory: "A" });
  expect(formatFullDatablock(cwtA).line2).toBe("030  25A");
});

test("AC5 — Special Purpose Code tags (EM, RF, HJ) render cleanly on Line 1 next to callsign", () => {
  // Emergency 7700 -> EM
  const emAc = track({ callsign: "DAL123", squawk: "7700" });
  expect(getSpecialPurposeCode(emAc)).toBe("EM");
  expect(formatFullDatablock(emAc).line1).toBe("DAL123 EM");

  // Radio Failure 7600 -> RF
  const rfAc = track({ callsign: "AAL45", squawk: "7600" });
  expect(getSpecialPurposeCode(rfAc)).toBe("RF");
  expect(formatFullDatablock(rfAc).line1).toBe("AAL45 RF");

  // Hijack 7500 -> HJ
  const hjAc = track({ callsign: "UAL89", squawk: "7500" });
  expect(getSpecialPurposeCode(hjAc)).toBe("HJ");
  expect(formatFullDatablock(hjAc).line1).toBe("UAL89 HJ");

  // Explicit SPC property
  const customSpc = track({ callsign: "SWA12", spc: "MI" });
  expect(getSpecialPurposeCode(customSpc)).toBe("MI");
  expect(formatFullDatablock(customSpc).line1).toBe("SWA12 MI");

  // Line 1 with SPC and inbound handoff cue
  const line1WithHandoff = withInboundHandoffCue(formatFullDatablock(emAc).line1, {
    kind: "inbound",
    fromSectorId: "C",
  });
  expect(line1WithHandoff).toBe("DAL123 EM HO");
});

test("Mode C hidden (M toggle): GS only on Line 2; Line 3 shows assigned altitude when different", () => {
  const same = formatFullDatablock(
    track({ altitudeFt: 3000, assignedAltitudeFt: 3000, speedKt: 210 }),
    { modeCVisible: false },
  );
  expect(same.line2).toBe("21");
  expect(same.line3).toBeUndefined();

  const different = formatFullDatablock(
    track({ altitudeFt: 3200, assignedAltitudeFt: 4000, speedKt: 210 }),
    { modeCVisible: false },
  );
  expect(different.line2).toBe("21");
  expect(different.line3).toBe("A040");
});

test("Pilot reported altitude flag appends * to Mode C field", () => {
  const reported = track({ altitudeFt: 3000, speedKt: 210, pilotReportedAltitude: true });
  expect(formatFullDatablock(reported).line2).toBe("030*  21");
});

test("Line 3 shows squawk mismatch and ATPA distance when active", () => {
  // Squawk mismatch
  const mismatch = track({
    altitudeFt: 3000,
    assignedAltitudeFt: 3000,
    assignedSquawk: "0342",
    reportedSquawk: "1200",
  });
  expect(formatFullDatablock(mismatch).line3).toBe("1200");

  // Assigned altitude + squawk mismatch
  const mismatchWithAssigned = track({
    altitudeFt: 3000,
    assignedAltitudeFt: 4000,
    assignedSquawk: "0342",
    reportedSquawk: "1200",
  });
  expect(formatFullDatablock(mismatchWithAssigned).line3).toBe("A040  1200");

  // ATPA distance
  const atpa = track({ altitudeFt: 3000, assignedAltitudeFt: 3000, atpaDistance: "2.4" });
  expect(formatFullDatablock(atpa).line3).toBe("2.4");
});

test("limited datablock is Mode C hundreds only and ignores M", () => {
  const ac = track({
    altitudeFt: 3250,
    assignedAltitudeFt: 4000,
    speedKt: 210,
    aircraftType: "B738",
  });
  expect(formatLimitedDatablock(ac)).toEqual({ line1: "033" });
  expect(formatLimitedDatablock(ac).line1).toBe(formatAltitudeHundreds(ac.altitudeFt));
  expect(formatLimitedDatablock(ac)).not.toHaveProperty("line2");
  expect(formatLimitedDatablock(ac)).not.toHaveProperty("line3");
  expect(linesForDatablock(ac, "limited", true, "ABCD")).toEqual({ line1: "033" });
});

test("Mode C hundreds clamp to 000–999", () => {
  expect(formatAltitudeHundreds(-50)).toBe("000");
  expect(formatAltitudeHundreds(100_000)).toBe("999");
  expect(formatAltitudeHundreds(Number.NaN)).toBe("000");
});

test("C/D/A assigned altitude with Mode C lag >= 100 ft displays A<alt> on Line 3", () => {
  const ac = makeTestAircraft({
    callsign: "DAL123",
    altitudeFt: 8000,
    speedKt: 210,
  });
  applyIntent(ac, [{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }], 0);
  expect(ac.intent.assignedAltitudeFt).toBe(3000);
  expect(ac.altitudeFt).toBe(8000);
  expect(formatFullDatablock(ac).line2).toBe("080  21");
  expect(formatFullDatablock(ac).line3).toBe("A030");

  applyIntent(ac, [{ type: "ALTITUDE", altitudeFt: 9000, verb: "CLIMB" }], 0);
  expect(formatFullDatablock(ac).line2).toBe("080  21");
  expect(formatFullDatablock(ac).line3).toBe("A090");

  applyIntent(ac, [{ type: "ALTITUDE", altitudeFt: 8000, verb: "MAINTAIN" }], 0);
  expect(formatFullDatablock(ac).line2).toBe("080  21");
  expect(formatFullDatablock(ac).line3).toBeUndefined();
});

test("default L8 offset is north 36 px; rect contains the text cell", () => {
  expect(DEFAULT_LEADER_DIR).toBe(8);
  expect(LEADER_LENGTH_PX).toBe(36);
  expect(LEADER_LENGTH_PX).toBeGreaterThan(24);
  const full = datablockRect(100, 200, { line1: "DAL123", line2: "030  21" }, 7.2, 12);
  expect(full.h).toBe(24);
  expect(full.w).toBe(7 * 7.2);
  const inside = { x: full.x + full.w / 2, y: full.y + full.h / 2 };
  expect(pointInDatablock(inside.x, inside.y, full)).toBe(true);
  expect(pointInDatablock(100, 200, full)).toBe(false);
  expect(full.y + full.h).toBeLessThan(200);
  const limited = datablockRect(100, 200, { line1: "033" }, 7.2, 12);
  expect(limited.h).toBe(12);
  const three = datablockRect(
    100,
    200,
    { line1: "DAL123", line2: "030  21", line3: "A040" },
    7.2,
    12,
  );
  expect(three.h).toBe(36);
});

test("AC9 — formatters and font say datablock / Mode C, not label; FDB/LDB + omitted fields", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./datablock.ts"] ?? "";
  expect(src).toMatch(/datablock/);
  expect(src).toMatch(/Mode C/);
  expect(src).toMatch(/PCG/);
  expect(src).toMatch(/FDB/);
  expect(src).toMatch(/LDB/);
  expect(src).toMatch(/scratchpad/);
  expect(src).toMatch(/beacon/);
  expect(src).toMatch(/Never a label/);
  expect(src).not.toMatch(/function formatLabel/);
  expect(DATABLOCK_FONT).toContain("IBM Plex Mono");
  expect(DATABLOCK_FONT).toContain("monospace");
  expect(DATABLOCK_FONT_PX).toBe(12);
  expect(SCOPE_FONT_STACK).toContain("IBM Plex Mono");
  const htmlSources = import.meta.glob("../../index.html", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const html = htmlSources["../../index.html"] ?? "";
  expect(html).toMatch(/IBM\+Plex\+Mono/);
});

test("T04-17 — pending inbound FDB line 1 shows HO; none stays callsign", () => {
  expect(withInboundHandoffCue("DAL123", { kind: "none" })).toBe("DAL123");
  expect(withInboundHandoffCue("DAL123", { kind: "inbound", fromSectorId: "C" })).toBe("DAL123 HO");
  expect(withInboundHandoffCue("033", { kind: "inbound", fromSectorId: "C" })).toBe("033 HO");
});

test("T02-35 AC1 — LDB formats assigned squawk code and Mode C altitude", () => {
  const ac = makeTestAircraft({
    callsign: "VFR12",
    squawk: "1200",
    altitudeFt: 4500,
    speedKt: 180,
  });
  // Default LDB: squawk + Mode C
  expect(formatLimitedDatablock(ac)).toEqual({ line1: "1200 045" });

  // Beacon code inhibited/hidden: Mode C altitude only
  expect(formatLimitedDatablock(ac, { beaconVisible: false })).toEqual({ line1: "045" });
});

test("T02-35 AC2 — Queried LDB formats Mode C altitude and ground speed (tens of knots)", () => {
  const ac = makeTestAircraft({
    callsign: "VFR12",
    squawk: "1200",
    altitudeFt: 4500,
    speedKt: 180,
  });
  expect(formatLimitedDatablock(ac, { queried: true })).toEqual({ line1: "045 18" });
  expect(formatGroundSpeedTens(180)).toBe("18");
  expect(formatGroundSpeedTens(85)).toBe("09");
  expect(formatGroundSpeedTens(80)).toBe("08");
  expect(formatGroundSpeedTens(250)).toBe("25");
});

test("T02-35 AC3 — PDB formats Line 2 only (Mode C altitude + ground speed in tens), suppressing callsign", () => {
  const ac = makeTestAircraft({
    callsign: "DAL123",
    altitudeFt: 4500,
    speedKt: 180,
    aircraftType: "B738",
  });
  const pdb = formatPartialDatablock(ac);
  expect(pdb).toEqual({ line1: "045  18" });
  expect(linesForDatablock(ac, "partial")).toEqual({ line1: "045  18" });

  // With scratchpad time-sharing: phase 0 is 045 18, phase 1 is HOLD 18
  const phase0 = formatPartialDatablock(ac, { scratchpad: "HOLD", simTimeMs: 0 });
  expect(phase0).toEqual({ line1: "045  18" });
  const phase1 = formatPartialDatablock(ac, { scratchpad: "HOLD", simTimeMs: 2500 });
  expect(phase1).toEqual({ line1: "HOLD  18" });

  // With suppressPdbSpeed option
  const suppressed = formatPartialDatablock(ac, { suppressPdbSpeed: true });
  expect(suppressed).toEqual({ line1: "045" });
});

test("T02-40: formatGroundSpeedTens handles flight category suffixes VFR and Overflight", () => {
  expect(formatGroundSpeedTens(110, { flightRules: "VFR" })).toBe("11V");
  expect(formatGroundSpeedTens(280, { isOverflight: true })).toBe("28E");
  // Wake category takes precedence over VFR suffix
  expect(formatGroundSpeedTens(110, { wakeCategory: "L", flightRules: "VFR" })).toBe("11L");
});

test("T02-41 AC1/AC2: Left field cycles Mode C <-> SP1 <-> SP2, skipping unpopulated scratchpads", () => {
  const ac = track({
    altitudeFt: 5000,
    speedKt: 210,
    aircraftType: "A321",
  });

  // 1 populated left field (Mode C only): remains steady on Mode C across all phases
  expect(formatFullDatablock(ac, { timeSharePhase: 0 }).line2).toBe("050  21");
  expect(formatFullDatablock(ac, { timeSharePhase: 1 }).line2).toBe("050  A321");
  expect(formatFullDatablock(ac, { timeSharePhase: 2 }).line2).toBe("050  21");

  // 2 populated left fields (Mode C + SP1): cycles Mode C <-> SP1
  const twoFields = { sp1: "I27" };
  expect(formatFullDatablock(ac, { ...twoFields, timeSharePhase: 0 }).line2).toBe("050  21");
  expect(formatFullDatablock(ac, { ...twoFields, timeSharePhase: 1 }).line2).toBe("I27  A321");
  expect(formatFullDatablock(ac, { ...twoFields, timeSharePhase: 2 }).line2).toBe("050  21");
  expect(formatFullDatablock(ac, { ...twoFields, timeSharePhase: 3 }).line2).toBe("I27  A321");

  // 3 populated left fields (Mode C + SP1 + SP2): cycles Mode C <-> SP1 <-> SP2
  const threeFields = { sp1: "I27", sp2: "S21" };
  expect(formatFullDatablock(ac, { ...threeFields, timeSharePhase: 0 }).line2).toBe("050  21");
  expect(formatFullDatablock(ac, { ...threeFields, timeSharePhase: 1 }).line2).toBe("I27  A321");
  expect(formatFullDatablock(ac, { ...threeFields, timeSharePhase: 2 }).line2).toBe("S21  21");
  expect(formatFullDatablock(ac, { ...threeFields, timeSharePhase: 3 }).line2).toBe("050  A321");
  expect(formatFullDatablock(ac, { ...threeFields, timeSharePhase: 4 }).line2).toBe("I27  21");
  expect(formatFullDatablock(ac, { ...threeFields, timeSharePhase: 5 }).line2).toBe("S21  A321");
});

test("T02-41 AC3: Right field cycles GS <-> Type <-> Req Alt", () => {
  const ac = track({
    altitudeFt: 5000,
    speedKt: 210,
    aircraftType: "B738",
    requestedAltitudeFt: 8000,
  });

  // 3 populated right fields (GS + Type + ReqAlt): cycles GS <-> Type <-> R080
  expect(formatFullDatablock(ac, { timeSharePhase: 0 }).line2).toBe("050  21");
  expect(formatFullDatablock(ac, { timeSharePhase: 1 }).line2).toBe("050  B738");
  expect(formatFullDatablock(ac, { timeSharePhase: 2 }).line2).toBe("050  R080");
  expect(formatFullDatablock(ac, { timeSharePhase: 3 }).line2).toBe("050  21");
});

test("T02-41 AC4: Center handoff sector ID appears between left and right fields during active handoff", () => {
  const ac = track({
    altitudeFt: 8000,
    speedKt: 250,
    aircraftType: "B772",
    wakeCategory: "H",
  });

  const fdbHandoff = formatFullDatablock(ac, {
    sp1: "I27",
    handoffSectorId: "D",
    timeSharePhase: 0,
  });
  expect(fdbHandoff.line2).toBe("080  D  25H");

  const fdbPhase1 = formatFullDatablock(ac, {
    sp1: "I27",
    handoffSectorId: "D",
    timeSharePhase: 1,
  });
  expect(fdbPhase1.line2).toBe("I27  D  B772");

  const pdbHandoff = formatPartialDatablock(ac, {
    sp1: "I27",
    handoffSectorId: "C",
    timeSharePhase: 0,
  });
  expect(pdbHandoff.line1).toBe("080  C  25H");
});
