import { describe, expect, test } from "vitest";
import {
  SessionLog,
  createAircraft,
  createWorld,
  handoffFor,
  initiateCenterHandoff,
  acceptOutboundHandoff,
  offerPointout,
} from "@core";
import {
  PALETTE,
  applyDropTrackToSelection,
  createScopeView,
  handleTrackClick,
  handleTrackMiddleClick,
  isTargetDiamondPath,
  renderScope,
  setScratchpad,
  syncTrackDisplays,
} from "./index";

interface StrokeRect {
  x: number;
  y: number;
  w: number;
  h: number;
  strokeStyle: string;
}

interface FillRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PathStroke {
  points: { x: number; y: number }[];
  strokeStyle: string;
  lineWidth: number;
}

interface FillText {
  text: string;
  font: string;
  x?: number;
  y?: number;
  fillStyle?: string;
  textAlign?: string;
  textBaseline?: string;
}

function createMockCtx(): {
  ctx: CanvasRenderingContext2D;
  strokeRects: StrokeRect[];
  fillRects: FillRect[];
  fillTexts: FillText[];
  pathStrokes: PathStroke[];
} {
  const strokeRects: StrokeRect[] = [];
  const fillRects: FillRect[] = [];
  const fillTexts: FillText[] = [];
  const pathStrokes: PathStroke[] = [];
  let currentPath: { x: number; y: number }[] = [];

  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textBaseline: "alphabetic",
    textAlign: "start",
    fillRect(this: { fillStyle: string }, x: number, y: number, w: number, h: number) {
      fillRects.push({ x, y, w, h });
    },
    save() {},
    restore() {},
    beginPath() {
      currentPath = [];
    },
    closePath() {},
    arc() {},
    clip() {},
    rect() {},
    stroke(this: { strokeStyle: string; lineWidth: number }) {
      if (currentPath.length >= 2) {
        pathStrokes.push({
          points: currentPath.slice(),
          strokeStyle: String(this.strokeStyle),
          lineWidth: this.lineWidth,
        });
      }
    },
    fill() {},
    moveTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    lineTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    setTransform() {},
    strokeRect(this: { strokeStyle: string }, x: number, y: number, w: number, h: number) {
      strokeRects.push({ x, y, w, h, strokeStyle: String(this.strokeStyle) });
    },
    measureText(text: string) {
      return { width: Math.max(0, text.length) * 7.2 };
    },
    fillText(
      this: { font: string; fillStyle: string; textAlign: string; textBaseline: string },
      text: string,
      x?: number,
      y?: number,
    ) {
      fillTexts.push({
        text,
        font: this.font,
        x,
        y,
        fillStyle: String(this.fillStyle),
        textAlign: this.textAlign,
        textBaseline: this.textBaseline,
      });
    },
  };

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    strokeRects,
    fillRects,
    fillTexts,
    pathStrokes,
  };
}

describe("STARS CRC Scope Visual & Interactive Fidelity Acceptance (T02-38)", () => {
  describe("AC1: Target symbol shapes (diamond, asterisk, V, square, sector ID)", () => {
    test("primary-only target renders as an unfilled diamond without a datablock", () => {
      const primaryAc = createAircraft({
        id: "ac-pri",
        callsign: "PRI1",
        xNm: 0,
        yNm: 0,
        headingDeg: 90,
        altitudeFt: 3500,
        speedKt: 120,
        isPrimary: true,
      });
      const world = createWorld({ aircraft: [primaryAc] });
      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);

      const { ctx, fillTexts, pathStrokes } = createMockCtx();
      renderScope(ctx, world, view, 800, 800);

      // Primary target renders diamond path (4 vertices)
      const diamondStrokes = pathStrokes.filter(
        (s) => s.points.length >= 4 && isTargetDiamondPath(s.points, 400, 400),
      );
      expect(diamondStrokes.length).toBeGreaterThanOrEqual(1);

      // Primary target has no datablock or callsign rendered
      expect(fillTexts.some((t) => t.text === "PRI1")).toBe(false);
      expect(fillTexts.some((t) => t.text === "035")).toBe(false);
    });

    test("unassociated secondary targets render *, V for 1200 squawk, and square for beacon select", () => {
      const unassocDefault = createAircraft({
        id: "ac-unassoc",
        callsign: "TGT1",
        xNm: 5,
        yNm: 0,
        headingDeg: 90,
        altitudeFt: 5000,
        speedKt: 150,
        squawk: "0342",
      });
      const unassocVfr = createAircraft({
        id: "ac-vfr",
        callsign: "VFR1200",
        xNm: -5,
        yNm: 0,
        headingDeg: 270,
        altitudeFt: 4500,
        speedKt: 110,
        squawk: "1200",
      });
      const unassocBcnSelect = createAircraft({
        id: "ac-bcn",
        callsign: "BCN4501",
        xNm: 0,
        yNm: 5,
        headingDeg: 180,
        altitudeFt: 6000,
        speedKt: 180,
        squawk: "4501",
      });

      const world = createWorld({
        aircraft: [unassocDefault, unassocVfr, unassocBcnSelect],
      });
      const view = createScopeView();
      view.beaconSelectCodes = ["4501"];
      syncTrackDisplays(view.tracks, world);

      // Configure unassociated mode
      for (const ac of world.aircraft) {
        const td = view.tracks.get(ac.id)!;
        td.datablockMode = "limited";
        td.unassociated = true;
        td.squawk = ac.squawk;
      }

      const { ctx, fillTexts, strokeRects } = createMockCtx();
      renderScope(ctx, world, view, 800, 800);

      // Default unassociated squawk renders '*' symbol
      expect(fillTexts.some((t) => t.text === "*")).toBe(true);

      // 1200 VFR squawk renders 'V' symbol
      expect(fillTexts.some((t) => t.text === "V")).toBe(true);

      // Beacon code select match renders square symbol (strokeRect centered at target)
      expect(strokeRects.some((r) => r.w === 8 && r.h === 8)).toBe(true);
    });

    test("tracked target renders owning sector ID letter (D, T, C)", () => {
      const ownedDep = createAircraft({
        id: "ac-owned",
        callsign: "DAL101",
        xNm: 2,
        yNm: 2,
        headingDeg: 90,
        altitudeFt: 8000,
        speedKt: 250,
      });
      const towerAc = createAircraft({
        id: "ac-twr",
        callsign: "AAL202",
        xNm: -2,
        yNm: 2,
        headingDeg: 270,
        altitudeFt: 2000,
        speedKt: 140,
      });
      const centerAc = createAircraft({
        id: "ac-ctr",
        callsign: "UAL303",
        xNm: 2,
        yNm: -2,
        headingDeg: 45,
        altitudeFt: 14000,
        speedKt: 300,
      });

      const world = createWorld({
        aircraft: [ownedDep, towerAc, centerAc],
      });
      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);

      view.tracks.get(ownedDep.id)!.ownership = "owned";
      view.tracks.get(towerAc.id)!.ownership = "tower";
      view.tracks.get(centerAc.id)!.ownership = "center";

      const { ctx, fillTexts } = createMockCtx();
      renderScope(ctx, world, view, 800, 800);

      // Owned local track renders 'D' (default departure/TRACON sector ID)
      expect(fillTexts.some((t) => t.text === "D")).toBe(true);

      // Tower track renders 'T'
      expect(fillTexts.some((t) => t.text === "T")).toBe(true);

      // Center track renders 'C'
      expect(fillTexts.some((t) => t.text === "C")).toBe(true);
    });
  });

  describe("AC2: Datablocks (LDB, PDB, FDB)", () => {
    test("LDB displays squawk + altitude and queries ground speed on click for 5 seconds", () => {
      const ac = createAircraft({
        id: "ac-ldb-test",
        callsign: "N12345",
        xNm: 3,
        yNm: 3,
        headingDeg: 90,
        altitudeFt: 4500,
        speedKt: 180,
        squawk: "1200",
      });
      const world = createWorld({ aircraft: [ac], simTimeMs: 1000 });
      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);

      const td = view.tracks.get(ac.id)!;
      td.datablockMode = "limited";
      td.unassociated = true;
      td.squawk = "1200";

      // Initial state: squawk + Mode C hundreds (1200 045)
      const initial = createMockCtx();
      renderScope(initial.ctx, world, view, 800, 800);
      expect(initial.fillTexts.some((t) => t.text === "1200 045")).toBe(true);

      // Click to query ground speed
      handleTrackClick(view.tracks, world, ac.id);

      // Queried state: Mode C hundreds + speed in tens (045 18)
      const queried = createMockCtx();
      renderScope(queried.ctx, world, view, 800, 800);
      expect(queried.fillTexts.some((t) => t.text === "045 18")).toBe(true);

      // Advance time by 4999 ms -> still queried
      world.simTimeMs = 1000 + 4999;
      const stillQueried = createMockCtx();
      renderScope(stillQueried.ctx, world, view, 800, 800);
      expect(stillQueried.fillTexts.some((t) => t.text === "045 18")).toBe(true);

      // Advance time past 5000 ms -> query expires and reverts to 1200 045
      world.simTimeMs = 1000 + 5001;
      const expired = createMockCtx();
      renderScope(expired.ctx, world, view, 800, 800);
      expect(expired.fillTexts.some((t) => t.text === "1200 045")).toBe(true);
    });

    test("PDB renders Line 2 only for unowned associated track, and clicking toggles to Green FDB", () => {
      const ac = createAircraft({
        id: "ac-pdb-test",
        callsign: "SWA555",
        xNm: 4,
        yNm: 4,
        headingDeg: 180,
        altitudeFt: 8000,
        speedKt: 250,
        aircraftType: "B737",
      });
      const world = createWorld({ aircraft: [ac], simTimeMs: 0 });
      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);

      const td = view.tracks.get(ac.id)!;
      expect(td.ownership).toBe("unowned");
      expect(td.datablockMode).toBe("partial");

      // PDB state: Line 2 only (080  25), suppressing callsign and aircraft type
      const pdbCtx = createMockCtx();
      renderScope(pdbCtx.ctx, world, view, 800, 800);
      expect(pdbCtx.fillTexts.some((t) => t.text === "080  25")).toBe(true);
      expect(pdbCtx.fillTexts.some((t) => t.text === "SWA555")).toBe(false);
      expect(pdbCtx.fillTexts.some((t) => t.text === "B737")).toBe(false);

      // Click to toggle to forced FDB (Green FDB)
      handleTrackClick(view.tracks, world, ac.id);
      expect(td.datablockMode).toBe("full");
      expect(td.forcedFdb).toBe(true);

      const fdbCtx = createMockCtx();
      renderScope(fdbCtx.ctx, world, view, 800, 800);
      const callsignText = fdbCtx.fillTexts.find((t) => t.text === "SWA555");
      expect(callsignText).toBeDefined();
      expect(callsignText?.fillStyle).toBe(PALETTE.unowned); // Green #00FF00
      expect(fdbCtx.fillTexts.some((t) => t.text === "080  25")).toBe(true);

      // Click again toggles back to PDB
      handleTrackClick(view.tracks, world, ac.id);
      expect(td.datablockMode).toBe("partial");
      expect(td.forcedFdb).toBe(false);
    });

    test("FDB time-shares Line 2 between altitude/GS and scratchpad/type, and renders Line 3 assigned altitude A<alt>", () => {
      const ac = createAircraft({
        id: "ac-fdb-test",
        callsign: "AAL777",
        xNm: 5,
        yNm: 5,
        headingDeg: 90,
        altitudeFt: 8000,
        speedKt: 250,
        aircraftType: "A321",
      });
      ac.intent.assignedAltitudeFt = 4000;
      ac.intent.controllerAssignedAltitudeFt = 4000;
      const world = createWorld({ aircraft: [ac], simTimeMs: 0 });
      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);

      const td = view.tracks.get(ac.id)!;
      td.ownership = "owned";
      td.datablockMode = "full";
      setScratchpad(view.tracks, ac.id, "HOLD");

      // Phase 0 (0 - 2500ms): Mode C altitude + Ground speed on Line 2; Line 3 has A040
      world.simTimeMs = 1000;
      const phase0 = createMockCtx();
      renderScope(phase0.ctx, world, view, 800, 800);
      expect(phase0.fillTexts.some((t) => t.text === "AAL777")).toBe(true);
      expect(phase0.fillTexts.some((t) => t.text === "080  25")).toBe(true);
      expect(phase0.fillTexts.some((t) => t.text === "A040")).toBe(true);

      // Phase 1 (2500 - 5000ms): Scratchpad + Aircraft type on Line 2; Line 3 has A040
      world.simTimeMs = 3000;
      const phase1 = createMockCtx();
      renderScope(phase1.ctx, world, view, 800, 800);
      expect(phase1.fillTexts.some((t) => t.text === "AAL777")).toBe(true);
      expect(phase1.fillTexts.some((t) => t.text === "HOLD  A321")).toBe(true);
      expect(phase1.fillTexts.some((t) => t.text === "A040")).toBe(true);

      // When assigned altitude matches Mode C altitude (8000 ft), Line 3 is omitted
      ac.intent.assignedAltitudeFt = 8000;
      const noLine3 = createMockCtx();
      renderScope(noLine3.ctx, world, view, 800, 800);
      expect(noLine3.fillTexts.some((t) => t.text === "A080")).toBe(false);
    });
  });

  describe("AC3: Ownership transitions & handoff/pointout lifecycle", () => {
    test("inbound handoff renders blinking white FDB and clicking accepts to solid white FDB", () => {
      const log = new SessionLog();
      const ac = createAircraft({
        id: "ac-inbound",
        callsign: "DAL999",
        xNm: 10,
        yNm: 10,
        headingDeg: 270,
        altitudeFt: 10000,
        speedKt: 280,
      });
      const world = createWorld({
        aircraft: [ac],
        sessionLog: log,
        simTimeMs: 0,
      });
      world.handoffs.set(ac.id, { kind: "inbound", fromSectorId: "C" });

      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);

      // Inbound pending: Blinking white FDB (visible at t=0, hidden at t=800, visible at t=1600)
      world.simTimeMs = 0;
      const t0 = createMockCtx();
      renderScope(t0.ctx, world, view, 800, 800);
      expect(t0.fillTexts.some((t) => t.text === "DAL999")).toBe(true);

      world.simTimeMs = 800;
      const t500 = createMockCtx();
      renderScope(t500.ctx, world, view, 800, 800);
      expect(t500.fillTexts.some((t) => t.text === "DAL999")).toBe(false);

      // Left click to accept inbound handoff
      world.simTimeMs = 1600;
      handleTrackClick(view.tracks, world, ac.id);

      const td = view.tracks.get(ac.id)!;
      expect(td.ownership).toBe("owned");
      expect(td.datablockMode).toBe("full");
      expect(handoffFor(world, ac.id)).toEqual({ kind: "none" });
      expect(log.byType("handoff.inbound.accepted")).toHaveLength(1);

      // Once accepted: Solid white FDB at all times
      world.simTimeMs = 2400;
      const acceptedT1500 = createMockCtx();
      renderScope(acceptedT1500.ctx, world, view, 800, 800);
      const callsign = acceptedT1500.fillTexts.find((t) => t.text === "DAL999");
      expect(callsign).toBeDefined();
      expect(callsign?.fillStyle).toBe(PALETTE.owned); // White #FFFFFF
      expect(acceptedT1500.fillTexts.some((t) => t.text === "D")).toBe(true); // Owning sector ID
    });

    test("outbound handoff accepted flashes white for 5s and completes 3-click progression", () => {
      const log = new SessionLog();
      const ac = createAircraft({
        id: "ac-outbound",
        callsign: "UAL888",
        xNm: 15,
        yNm: 10,
        headingDeg: 45,
        altitudeFt: 9000,
        speedKt: 260,
      });
      const world = createWorld({
        aircraft: [ac],
        sessionLog: log,
        simTimeMs: 1000,
      });
      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);
      view.tracks.get(ac.id)!.ownership = "owned";

      // Initiate outbound handoff and accept it
      initiateCenterHandoff(ac, { world, log, simTimeMs: 1000 }, "C");
      acceptOutboundHandoff(world, ac.id, 0);
      syncTrackDisplays(view.tracks, world);

      const td = view.tracks.get(ac.id)!;
      expect(td.outboundFlashUntilSimMs).toBe(1000 + 5000);

      // Flashes white during 5s: visible at t=1600 (even phase), hidden at t=2400 (odd phase)
      world.simTimeMs = 1600;
      const flashOn = createMockCtx();
      renderScope(flashOn.ctx, world, view, 800, 800);
      expect(flashOn.fillTexts.some((t) => t.text === "UAL888")).toBe(true);

      world.simTimeMs = 2400;
      const flashOff = createMockCtx();
      renderScope(flashOff.ctx, world, view, 800, 800);
      expect(flashOff.fillTexts.some((t) => t.text === "UAL888")).toBe(false);

      // 3-Click progression:
      // Click 1: Stops flashing -> solid white FDB
      handleTrackClick(view.tracks, world, ac.id);
      expect(td.outboundClickStep).toBe(1);
      world.simTimeMs = 2500;
      const step1Ctx = createMockCtx();
      renderScope(step1Ctx.ctx, world, view, 800, 800);
      expect(step1Ctx.fillTexts.some((t) => t.text === "UAL888")).toBe(true);

      // Click 2: Transitions to unowned Green FDB
      handleTrackClick(view.tracks, world, ac.id);
      expect(td.outboundClickStep).toBe(2);
      expect(td.ownership).toBe("unowned");
      expect(td.datablockMode).toBe("full");
      const step2Ctx = createMockCtx();
      renderScope(step2Ctx.ctx, world, view, 800, 800);
      const greenCallsign = step2Ctx.fillTexts.find((t) => t.text === "UAL888");
      expect(greenCallsign?.fillStyle).toBe(PALETTE.unowned);

      // Click 3: Transitions to unowned Green PDB (Line 2 only)
      handleTrackClick(view.tracks, world, ac.id);
      expect(td.outboundClickStep).toBe(3);
      expect(td.datablockMode).toBe("partial");
      world.simTimeMs = 5000;
      const step3Ctx = createMockCtx();
      renderScope(step3Ctx.ctx, world, view, 800, 800);
      expect(step3Ctx.fillTexts.some((t) => t.text === "UAL888")).toBe(false);
      expect(step3Ctx.fillTexts.some((t) => t.text === "090  26")).toBe(true);
    });

    test("pointout lifecycle: offer, accept, UN reject, ** convert, and F4 drop track", () => {
      const log = new SessionLog();
      const ac = createAircraft({
        id: "ac-po",
        callsign: "FFT123",
        xNm: 8,
        yNm: 8,
        headingDeg: 180,
        altitudeFt: 7000,
        speedKt: 220,
      });
      const world = createWorld({ aircraft: [ac], sessionLog: log, simTimeMs: 0 });
      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);

      // 1. Offer incoming pointout -> Blinking Yellow FDB with 'PO'
      offerPointout(world, ac, "C");
      world.simTimeMs = 0;
      const poBlinkOn = createMockCtx();
      renderScope(poBlinkOn.ctx, world, view, 800, 800);
      expect(poBlinkOn.fillTexts.some((t) => t.text === "FFT123 PO")).toBe(true);

      world.simTimeMs = 800;
      const poBlinkOff = createMockCtx();
      renderScope(poBlinkOff.ctx, world, view, 800, 800);
      expect(poBlinkOff.fillTexts.some((t) => t.text === "FFT123 PO")).toBe(false);

      // 2. Accept pointout via click -> Solid Yellow FDB
      handleTrackClick(view.tracks, world, ac.id);
      const td = view.tracks.get(ac.id)!;
      expect(td.pointoutAccepted).toBe(true);
      world.simTimeMs = 1500;
      const poAccepted = createMockCtx();
      renderScope(poAccepted.ctx, world, view, 800, 800);
      const yellowCallsign = poAccepted.fillTexts.find((t) => t.text === "FFT123");
      expect(yellowCallsign).toBeDefined();
      expect(yellowCallsign?.fillStyle).toBe(PALETTE.caution); // Yellow #FFFF00

      // 3. UN reject pointout
      offerPointout(world, ac, "C");
      handleTrackClick(view.tracks, world, ac.id, "UN");
      expect(td.pointoutRejected).toBe(true);
      expect(log.byType("pointout.rejected")).toHaveLength(1);

      // 4. Convert pointout to handoff via '**'
      offerPointout(world, ac, "C");
      handleTrackClick(view.tracks, world, ac.id, "**");
      expect(td.ownership).toBe("owned");
      expect(td.datablockMode).toBe("full");
      expect(log.byType("pointout.converted")).toHaveLength(1);

      // 5. F4 drop track -> Reverts to unowned green PDB and position symbol '*'
      world.selectedAircraftId = ac.id;
      const dropResult = applyDropTrackToSelection(view.tracks, world);
      expect(dropResult.applied).toBe(true);
      expect(td.ownership).toBe("unowned");
      expect(td.datablockMode).toBe("partial");

      const droppedCtx = createMockCtx();
      renderScope(droppedCtx.ctx, world, view, 800, 800);
      expect(droppedCtx.fillTexts.some((t) => t.text === "*")).toBe(true);
      expect(droppedCtx.fillTexts.some((t) => t.text === "070  22")).toBe(true);
      expect(droppedCtx.fillTexts.some((t) => t.text === "FFT123")).toBe(false);
    });
  });

  describe("AC4: Middle-click cyan highlight (#00FFFF) across LDB, PDB, and FDB", () => {
    test("middle-clicking toggles cyan highlight on LDB, PDB, and FDB modes", () => {
      const ldbAc = createAircraft({
        id: "ac-ldb-hl",
        callsign: "VFR01",
        xNm: 2,
        yNm: 2,
        headingDeg: 90,
        altitudeFt: 3000,
        speedKt: 100,
        squawk: "1200",
      });
      const pdbAc = createAircraft({
        id: "ac-pdb-hl",
        callsign: "SWA02",
        xNm: -2,
        yNm: 2,
        headingDeg: 270,
        altitudeFt: 6000,
        speedKt: 210,
      });
      const fdbAc = createAircraft({
        id: "ac-fdb-hl",
        callsign: "DAL03",
        xNm: 2,
        yNm: -2,
        headingDeg: 45,
        altitudeFt: 10000,
        speedKt: 280,
      });

      const world = createWorld({ aircraft: [ldbAc, pdbAc, fdbAc], simTimeMs: 0 });
      const view = createScopeView();
      syncTrackDisplays(view.tracks, world);

      const ldbTd = view.tracks.get(ldbAc.id)!;
      ldbTd.datablockMode = "limited";
      ldbTd.unassociated = true;
      ldbTd.squawk = "1200";

      const pdbTd = view.tracks.get(pdbAc.id)!;
      pdbTd.ownership = "unowned";
      pdbTd.datablockMode = "partial";

      const fdbTd = view.tracks.get(fdbAc.id)!;
      fdbTd.ownership = "owned";
      fdbTd.datablockMode = "full";

      // 1. Highlight LDB track
      handleTrackMiddleClick(view.tracks, world, ldbAc.id);
      expect(ldbTd.highlighted).toBe(true);
      const ldbHlCtx = createMockCtx();
      renderScope(ldbHlCtx.ctx, world, view, 800, 800);
      const ldbText = ldbHlCtx.fillTexts.find((t) => t.text === "1200 030");
      expect(ldbText?.fillStyle).toBe(PALETTE.highlight); // Cyan #00FFFF

      // Toggle LDB highlight off
      handleTrackMiddleClick(view.tracks, world, ldbAc.id);
      expect(ldbTd.highlighted).toBe(false);

      // 2. Highlight PDB track
      handleTrackMiddleClick(view.tracks, world, pdbAc.id);
      expect(pdbTd.highlighted).toBe(true);
      const pdbHlCtx = createMockCtx();
      renderScope(pdbHlCtx.ctx, world, view, 800, 800);
      const pdbText = pdbHlCtx.fillTexts.find((t) => t.text === "060  21");
      expect(pdbText?.fillStyle).toBe(PALETTE.highlight); // Cyan #00FFFF

      // Toggle PDB highlight off
      handleTrackMiddleClick(view.tracks, world, pdbAc.id);
      expect(pdbTd.highlighted).toBe(false);

      // 3. Highlight FDB track
      handleTrackMiddleClick(view.tracks, world, fdbAc.id);
      expect(fdbTd.highlighted).toBe(true);
      const fdbHlCtx = createMockCtx();
      renderScope(fdbHlCtx.ctx, world, view, 800, 800);
      const fdbText = fdbHlCtx.fillTexts.find((t) => t.text === "DAL03");
      expect(fdbText?.fillStyle).toBe(PALETTE.highlight); // Cyan #00FFFF

      // Toggle FDB highlight off
      handleTrackMiddleClick(view.tracks, world, fdbAc.id);
      expect(fdbTd.highlighted).toBe(false);
      const fdbNormalCtx = createMockCtx();
      renderScope(fdbNormalCtx.ctx, world, view, 800, 800);
      const fdbNormalText = fdbNormalCtx.fillTexts.find((t) => t.text === "DAL03");
      expect(fdbNormalText?.fillStyle).toBe(PALETTE.owned); // White #FFFFFF
    });
  });
});
