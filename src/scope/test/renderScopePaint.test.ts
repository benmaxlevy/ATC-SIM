import { describe, expect, test } from "vitest";
import { createWorld, makeTestAircraft, type CaAlert, type MsawAlert } from "@core";
import { createScopeView } from "../scopeView";
import { createTrackDisplay, setCaPairInhibited, syncTrackDisplays } from "../trackDisplay";
import {
  PALETTE,
  applyBrite,
  isAlertBlinkOn,
  ALERT_BLINK_PERIOD_MS,
  ALERT_BLINK_HALF_PERIOD_MS,
} from "../palette";
import { createMockCtx } from "./mockCanvas";
import {
  drawDatablock,
  isCaAlertAcknowledged,
  isCaInhibitedForTrack,
  isMsawAlertAcknowledged,
} from "../render/renderScopePaint";
import { renderScope } from "../render/renderScope";
import { getAlertEntries } from "../systemLists";

describe("Datablock inline alert glyphs", () => {
  describe("Blink clock & period", () => {
    test("square-wave blink cadence operates at 800ms ON / 800ms OFF (1600ms period)", () => {
      expect(ALERT_BLINK_HALF_PERIOD_MS).toBe(800);
      expect(ALERT_BLINK_PERIOD_MS).toBe(1600);

      // Phase 1: ON [0, 800)
      expect(isAlertBlinkOn(0)).toBe(true);
      expect(isAlertBlinkOn(200)).toBe(true);
      expect(isAlertBlinkOn(799)).toBe(true);

      // Phase 2: OFF [800, 1600)
      expect(isAlertBlinkOn(800)).toBe(false);
      expect(isAlertBlinkOn(1200)).toBe(false);
      expect(isAlertBlinkOn(1599)).toBe(false);

      // Cycle repeats
      expect(isAlertBlinkOn(1600)).toBe(true);
      expect(isAlertBlinkOn(2399)).toBe(true);
      expect(isAlertBlinkOn(2400)).toBe(false);
      expect(isAlertBlinkOn(3199)).toBe(false);
      expect(isAlertBlinkOn(3200)).toBe(true);
    });
  });

  describe("Active unacknowledged Conflict Alert (CA)", () => {
    test("displays red CA flashing at 800ms cadence on Line 0 of both conflicting tracks", () => {
      const world = createWorld();
      const view = createScopeView();

      const ac1 = makeTestAircraft({
        id: "ac-dal1",
        callsign: "DAL100",
        altitudeFt: 5000,
        speedKt: 250,
      });
      const ac2 = makeTestAircraft({
        id: "ac-ual2",
        callsign: "UAL200",
        altitudeFt: 5000,
        speedKt: 250,
      });
      world.aircraft = [ac1, ac2];

      const td1 = createTrackDisplay("owned");
      const td2 = createTrackDisplay("owned");
      view.tracks.set(ac1.id, td1);
      view.tracks.set(ac2.id, td2);

      const caAlert: CaAlert = {
        callsignA: "DAL100",
        callsignB: "UAL200",
        severity: "alert",
        distNm: 1.5,
        deltaAltFt: 0,
      };
      world.alerts.ca = [caAlert];

      // At simTimeMs = 0 (blink ON): both tracks render "CA" in PALETTE.alert red.
      world.simTimeMs = 0;
      const mockOn = createMockCtx();
      drawDatablock(mockOn.ctx, ac1, 100, 100, view, world);
      drawDatablock(mockOn.ctx, ac2, 200, 200, view, world);

      const caFillsOn = mockOn.fillTexts.filter((f) => f.text === "CA");
      expect(caFillsOn).toHaveLength(2);
      expect(caFillsOn[0]?.fillStyle).toBe(applyBrite(PALETTE.alert, view.brite.fdb));
      expect(caFillsOn[1]?.fillStyle).toBe(applyBrite(PALETTE.alert, view.brite.fdb));

      // At simTimeMs = 800 (blink OFF): neither track renders "CA".
      world.simTimeMs = 800;
      const mockOff = createMockCtx();
      drawDatablock(mockOff.ctx, ac1, 100, 100, view, world);
      drawDatablock(mockOff.ctx, ac2, 200, 200, view, world);

      const caFillsOff = mockOff.fillTexts.filter((f) => f.text === "CA");
      expect(caFillsOff).toHaveLength(0);

      // Callsigns still render in both phases
      expect(mockOff.fillTexts.some((f) => f.text.startsWith("DAL100"))).toBe(true);
      expect(mockOff.fillTexts.some((f) => f.text.startsWith("UAL200"))).toBe(true);
    });

    test("pair inhibit removes Line 0 CA for only that pair, without a Δ glyph", () => {
      const world = createWorld();
      const view = createScopeView();
      const acA = makeTestAircraft({ id: "pair-a", callsign: "AAL100" });
      const acB = makeTestAircraft({ id: "pair-b", callsign: "DAL200" });
      const acC = makeTestAircraft({ id: "pair-c", callsign: "JBU300" });
      world.aircraft = [acA, acB, acC];
      for (const ac of world.aircraft) {
        const td = createTrackDisplay("owned");
        td.datablockMode = "full";
        view.tracks.set(ac.id, td);
      }
      world.alerts.ca = [
        {
          callsignA: "AAL100",
          callsignB: "DAL200",
          severity: "alert",
          distNm: 1,
          deltaAltFt: 0,
        },
        {
          callsignA: "DAL200",
          callsignB: "JBU300",
          severity: "alert",
          distNm: 1,
          deltaAltFt: 0,
        },
      ];

      setCaPairInhibited(view, acA.id, acB.id, true);
      world.simTimeMs = 0;
      const inhibited = createMockCtx();
      drawDatablock(inhibited.ctx, acA, 100, 100, view, world);
      drawDatablock(inhibited.ctx, acB, 200, 200, view, world);
      drawDatablock(inhibited.ctx, acC, 300, 300, view, world);
      expect(inhibited.fillTexts.filter((fill) => fill.text === "CA")).toHaveLength(2);
      expect(inhibited.fillTexts.filter((fill) => fill.text === "Δ")).toHaveLength(2);

      setCaPairInhibited(view, acA.id, acB.id, false);
      const restored = createMockCtx();
      drawDatablock(restored.ctx, acA, 100, 100, view, world);
      drawDatablock(restored.ctx, acB, 200, 200, view, world);
      expect(restored.fillTexts.filter((fill) => fill.text === "CA")).toHaveLength(2);
    });
  });

  describe("Acknowledged Conflict Alert (CA)", () => {
    test("displays solid red CA continuously on Line 0 (does not flash)", () => {
      const world = createWorld();
      const view = createScopeView();

      const ac1 = makeTestAircraft({
        id: "ac-ack1",
        callsign: "AAL300",
        altitudeFt: 6000,
        speedKt: 240,
      });
      world.aircraft = [ac1];

      const td1 = createTrackDisplay("owned");
      td1.caAcknowledged = true;
      view.tracks.set(ac1.id, td1);

      world.alerts.ca = [
        {
          callsignA: "AAL300",
          callsignB: "SWA400",
          severity: "alert",
          distNm: 2.0,
          deltaAltFt: 100,
        },
      ];

      expect(isCaAlertAcknowledged(ac1, td1, view, world)).toBe(true);

      // Test across multiple phases: 0ms (normally ON), 800ms (normally OFF), 1200ms (normally OFF)
      for (const timeMs of [0, 800, 1200, 1599, 1600]) {
        world.simTimeMs = timeMs;
        const mock = createMockCtx();
        drawDatablock(mock.ctx, ac1, 150, 150, view, world);

        const caFills = mock.fillTexts.filter((f) => f.text === "CA");
        expect(caFills).toHaveLength(1);
        expect(caFills[0]?.fillStyle).toBe(applyBrite(PALETTE.alert, view.brite.fdb));
      }
    });

    test("recognizes acknowledgment via alert object, pair set, or track display", () => {
      const world = createWorld();
      const view = createScopeView();
      const ac = makeTestAircraft({ id: "ac-x", callsign: "SKW500" });

      // Unacknowledged initially
      expect(isCaAlertAcknowledged(ac, undefined, view, world)).toBe(false);

      // TrackDisplay acknowledged flag
      const td = createTrackDisplay("owned");
      td.alertAcknowledged = true;
      expect(isCaAlertAcknowledged(ac, td, view, world)).toBe(true);

      // Alert object acknowledgment
      td.alertAcknowledged = false;
      const alert: CaAlert = {
        callsignA: "SKW500",
        callsignB: "FFT600",
        severity: "alert",
        distNm: 1.0,
        deltaAltFt: 0,
      };
      (alert as { acknowledged?: boolean }).acknowledged = true;
      world.alerts.ca = [alert];
      expect(isCaAlertAcknowledged(ac, td, view, world)).toBe(true);

      // View pair set acknowledgment
      (alert as { acknowledged?: boolean }).acknowledged = false;
      (view as { acknowledgedAlertPairs?: Set<string> }).acknowledgedAlertPairs = new Set([
        "FFT600|SKW500",
      ]);
      expect(isCaAlertAcknowledged(ac, td, view, world)).toBe(true);
    });
  });

  describe("CA/MCI inhibit upright-delta glyph (Δ)", () => {
    test("displays normal Δ immediately after the ACID when CA is inhibited", () => {
      const world = createWorld();
      const view = createScopeView();

      const ac = makeTestAircraft({
        id: "ac-inh",
        callsign: "JBU700",
        altitudeFt: 4000,
        speedKt: 210,
      });
      world.aircraft = [ac];

      const td = createTrackDisplay("owned");
      td.caInhibited = true;
      view.tracks.set(ac.id, td);

      expect(isCaInhibitedForTrack(ac, td, view)).toBe(true);

      const mock = createMockCtx();
      drawDatablock(mock.ctx, ac, 100, 100, view, world);

      const triangleFills = mock.fillTexts.filter((f) => f.text === "Δ");
      expect(triangleFills).toHaveLength(1);
      expect(triangleFills[0]?.fillStyle).toBe(applyBrite(PALETTE.owned, view.brite.fdb));

      // Glyph is inline after the ACID, not on a separate line above it.
      const callsignFill = mock.fillTexts.find((f) => f.text.startsWith("JBU700"));
      expect(callsignFill).toBeDefined();
      expect(triangleFills[0]!.y).toBe(callsignFill!.y);
      expect(triangleFills[0]!.x!).toBeGreaterThan(callsignFill!.x!);
    });

    test("pair inhibit shows Δ on both members without affecting a shared active pair", () => {
      const world = createWorld();
      const view = createScopeView();
      const acA = makeTestAircraft({ id: "acA", callsign: "AAL100" });
      const acB = makeTestAircraft({ id: "acB", callsign: "DAL200" });
      const acC = makeTestAircraft({ id: "acC", callsign: "UAL300" });
      world.aircraft = [acA, acB, acC];
      world.alerts.ca = [
        { callsignA: "AAL100", callsignB: "DAL200", severity: "alert", distNm: 1, deltaAltFt: 0 },
        { callsignA: "AAL100", callsignB: "UAL300", severity: "alert", distNm: 1, deltaAltFt: 0 },
      ];
      for (const ac of world.aircraft) view.tracks.set(ac.id, createTrackDisplay("owned"));
      setCaPairInhibited(view, acA.id, acB.id, true);

      const paints = world.aircraft.map((ac) => {
        const mock = createMockCtx();
        drawDatablock(mock.ctx, ac, 100, 100, view, world);
        return mock.fillTexts.filter((f) => f.text === "Δ");
      });
      expect(paints[0]).toHaveLength(1);
      expect(paints[1]).toHaveLength(1);
      expect(paints[2]).toHaveLength(0);
      const caPaint = createMockCtx();
      drawDatablock(caPaint.ctx, acA, 100, 100, view, world);
      expect(caPaint.fillTexts.filter((f) => f.text === "CA")).toHaveLength(1);
      expect(getAlertEntries(world, view)).toEqual(["CA AAL100*UAL300"]);
    });

    test("inhibitCA alias is supported and suppresses CA alert from showing 'CA'", () => {
      const world = createWorld();
      const view = createScopeView();

      const ac = makeTestAircraft({
        id: "ac-inh2",
        callsign: "ASA800",
        altitudeFt: 5000,
        speedKt: 220,
      });
      world.aircraft = [ac];

      const td = createTrackDisplay("owned");
      td.inhibitCA = true; // TI 6191.409 Section 2.16 specification flag
      view.tracks.set(ac.id, td);

      // Active conflict in world
      world.alerts.ca = [
        {
          callsignA: "ASA800",
          callsignB: "SWA900",
          severity: "alert",
          distNm: 1.2,
          deltaAltFt: 0,
        },
      ];

      expect(isCaInhibitedForTrack(ac, td, view)).toBe(true);

      world.simTimeMs = 0; // Blink ON
      const mock = createMockCtx();
      drawDatablock(mock.ctx, ac, 120, 120, view, world);

      // Renders "Δ", but not active "+".
      expect(mock.fillTexts.some((f) => f.text === "Δ")).toBe(true);
      expect(mock.fillTexts.some((f) => f.text === "+")).toBe(false);
    });
  });

  describe("MSAW inline glyph rendering", () => {
    test("unacknowledged MSAW flashes red LA at 800ms cadence", () => {
      const world = createWorld();
      const view = createScopeView();

      const ac = makeTestAircraft({
        id: "ac-msaw",
        callsign: "N12345",
        altitudeFt: 1500,
        speedKt: 120,
      });
      world.aircraft = [ac];

      const td = createTrackDisplay("owned");
      view.tracks.set(ac.id, td);

      const msawAlert: MsawAlert = {
        callsign: "N12345",
        severity: "alert",
        altFt: 1500,
        floorFt: 2000,
      };
      world.alerts.msaw = [msawAlert];

      // At 0ms (ON): renders Line 0 "LA".
      world.simTimeMs = 0;
      const mockOn = createMockCtx();
      drawDatablock(mockOn.ctx, ac, 100, 100, view, world);
      const laOn = mockOn.fillTexts.find((f) => f.text === "LA");
      expect(laOn?.fillStyle).toBe(applyBrite(PALETTE.alert, view.brite.fdb));

      // At 800ms (OFF): does not render "LA".
      world.simTimeMs = 800;
      const mockOff = createMockCtx();
      drawDatablock(mockOff.ctx, ac, 100, 100, view, world);
      expect(mockOff.fillTexts.some((f) => f.text === "LA")).toBe(false);
    });

    test("acknowledged MSAW displays solid red LA", () => {
      const world = createWorld();
      const view = createScopeView();

      const ac = makeTestAircraft({
        id: "ac-msaw-ack",
        callsign: "N99999",
        altitudeFt: 1400,
        speedKt: 110,
      });
      world.aircraft = [ac];

      const td = createTrackDisplay("owned");
      td.msawAcknowledged = true;
      view.tracks.set(ac.id, td);

      world.alerts.msaw = [
        {
          callsign: "N99999",
          severity: "alert",
          altFt: 1400,
          floorFt: 2000,
        },
      ];

      expect(isMsawAlertAcknowledged(ac, td, view, world)).toBe(true);

      // Steady at 800ms (OFF phase of unack)
      world.simTimeMs = 800;
      const mock = createMockCtx();
      drawDatablock(mock.ctx, ac, 100, 100, view, world);
      const la = mock.fillTexts.find((f) => f.text === "LA");
      expect(la?.fillStyle).toBe(applyBrite(PALETTE.alert, view.brite.fdb));
    });

    test("displays normal * immediately after the ACID when MSAW is inhibited", () => {
      const world = createWorld();
      const view = createScopeView();
      const ac = makeTestAircraft({ id: "ac-msaw-inhibit", callsign: "N12345" });
      const td = createTrackDisplay("owned");
      td.msawInhibited = true;
      world.aircraft = [ac];
      world.alerts.msaw = [
        { callsign: ac.callsign, severity: "alert", altFt: 1500, floorFt: 2000 },
      ];
      view.tracks.set(ac.id, td);

      const mock = createMockCtx();
      drawDatablock(mock.ctx, ac, 100, 100, view, world);
      expect(mock.fillTexts.some((fill) => fill.text === "*")).toBe(true);
      expect(mock.fillTexts.some((fill) => fill.text === "+")).toBe(false);
      const acid = mock.fillTexts.find((fill) => fill.text === ac.callsign);
      const glyph = mock.fillTexts.find((fill) => fill.text === "*");
      expect(glyph?.x).toBeCloseTo((acid?.x ?? 0) + mock.ctx.measureText(ac.callsign).width);
    });

    test("uses CA for active MCI and Δ when its global MCI inhibit is on", () => {
      const world = createWorld();
      const view = createScopeView();
      const ac = makeTestAircraft({ id: "ac-mci", callsign: "UAL123" });
      world.aircraft = [ac];
      view.tracks.set(ac.id, createTrackDisplay("owned"));
      (world.alerts as { mci?: Array<Record<string, string>> }).mci = [{ callsign: ac.callsign }];

      const active = createMockCtx();
      drawDatablock(active.ctx, ac, 100, 100, view, world);
      expect(active.fillTexts.some((fill) => fill.text === "CA")).toBe(true);

      view.mciEnabled = false;
      const inhibited = createMockCtx();
      drawDatablock(inhibited.ctx, ac, 100, 100, view, world);
      expect(inhibited.fillTexts.some((fill) => fill.text === "Δ")).toBe(true);
      expect(inhibited.fillTexts.some((fill) => fill.text === "+")).toBe(false);
    });
  });

  describe("Partial Datablock (PDB) mode & Multi-tag layout", () => {
    test("renders Line 0 alert in partial datablock mode", () => {
      const world = createWorld();
      const view = createScopeView();

      const ac = makeTestAircraft({
        id: "ac-pdb",
        callsign: "VFR101",
        altitudeFt: 3500,
        speedKt: 110,
      });
      world.aircraft = [ac];

      const td = createTrackDisplay("unowned");
      td.datablockMode = "partial";
      td.caInhibited = true;
      view.tracks.set(ac.id, td);

      const mock = createMockCtx();
      drawDatablock(mock.ctx, ac, 80, 80, view, world);

      expect(mock.fillTexts.some((f) => f.text === "Δ")).toBe(true);
      // PDB format renders Mode C / GS line
      expect(mock.fillTexts.some((f) => f.text.includes("035"))).toBe(true);
    });

    test("renders + inline when both CA and MSAW are inhibited", () => {
      const world = createWorld();
      const view = createScopeView();

      const ac = makeTestAircraft({
        id: "ac-combo",
        callsign: "C172",
        altitudeFt: 1200,
        speedKt: 95,
      });
      world.aircraft = [ac];

      const td = createTrackDisplay("owned");
      td.caInhibited = true;
      td.msawInhibited = true;
      view.tracks.set(ac.id, td);

      world.alerts.msaw = [
        {
          callsign: "C172",
          severity: "alert",
          altFt: 1200,
          floorFt: 1800,
        },
      ];

      const mock = createMockCtx();
      drawDatablock(mock.ctx, ac, 100, 100, view, world);

      const inhibitFill = mock.fillTexts.find((f) => f.text === "+");
      const callsignFill = mock.fillTexts.find((f) => f.text.startsWith("C172"));
      expect(inhibitFill).toBeDefined();
      expect(callsignFill).toBeDefined();
      expect(inhibitFill!.y).toBe(callsignFill!.y);
      expect(inhibitFill!.x!).toBeGreaterThan(callsignFill!.x!);
      expect(mock.fillTexts.some((f) => f.text === "Δ" || f.text === "*")).toBe(false);
    });

    test("shows slash-separated LA/CA when both alerts apply", () => {
      const world = createWorld();
      const view = createScopeView();
      const ac = makeTestAircraft({ id: "ac-la-ca", callsign: "AAL123", altitudeFt: 1000 });
      world.aircraft = [ac];
      const td = createTrackDisplay("owned");
      view.tracks.set(ac.id, td);
      world.alerts.ca = [
        {
          callsignA: ac.callsign,
          callsignB: "UAL456",
          severity: "alert",
          distNm: 1,
          deltaAltFt: 0,
        },
      ];
      world.alerts.msaw = [
        { callsign: ac.callsign, severity: "alert", altFt: 1500, floorFt: 2000 },
      ];

      world.simTimeMs = 0;
      const on = createMockCtx();
      drawDatablock(on.ctx, ac, 100, 100, view, world);
      expect(on.fillTexts.some((fill) => fill.text === "LA/CA")).toBe(true);
      const acid = on.fillTexts.find((fill) => fill.text.startsWith("AAL123"));
      expect(acid).toBeDefined();
      const acidY = acid?.y;
      expect(acidY).toBeDefined();
      const lowerDatablockLines = on.fillTexts.filter(
        (fill) => fill.y != null && acidY != null && fill.y > acidY,
      );
      expect(lowerDatablockLines.length).toBeGreaterThan(0);
      expect(
        lowerDatablockLines.every(
          (fill) => fill.fillStyle === applyBrite(PALETTE.owned, view.brite.fdb),
        ),
      ).toBe(true);

      world.simTimeMs = 800;
      const off = createMockCtx();
      drawDatablock(off.ctx, ac, 100, 100, view, world);
      expect(off.fillTexts.some((fill) => fill.text === "LA/CA")).toBe(false);

      // Acknowledging only CA must not make Line 0 alternate LA/CA and CA.
      td.caAcknowledged = true;
      const caAckOnly = createMockCtx();
      drawDatablock(caAckOnly.ctx, ac, 100, 100, view, world);
      expect(caAckOnly.fillTexts.some((fill) => fill.text === "LA/CA")).toBe(false);
      expect(caAckOnly.fillTexts.some((fill) => fill.text === "CA")).toBe(false);

      td.msawAcknowledged = true;
      const bothAck = createMockCtx();
      drawDatablock(bothAck.ctx, ac, 100, 100, view, world);
      expect(bothAck.fillTexts.some((fill) => fill.text === "LA/CA")).toBe(true);
    });

    test("does not blink ACIDs or Field 2 inhibit marks", () => {
      const world = createWorld();
      const view = createScopeView();
      const ac = makeTestAircraft({ id: "ac-steady-fields", callsign: "SWA789" });
      const td = createTrackDisplay("owned");
      td.caInhibited = true;
      world.aircraft = [ac];
      view.tracks.set(ac.id, td);

      for (const simTimeMs of [0, 800]) {
        world.simTimeMs = simTimeMs;
        const mock = createMockCtx();
        drawDatablock(mock.ctx, ac, 100, 100, view, world);
        const acid = mock.fillTexts.find((fill) => fill.text.startsWith("SWA789"));
        expect(acid?.fillStyle).toBe(applyBrite(PALETTE.owned, view.brite.fdb));
        expect(mock.fillTexts.some((fill) => fill.text === "Δ")).toBe(true);
      }
    });
  });

  describe("End-to-End renderScope integration", () => {
    test("renderScope integrates blinking Line 0 CA across frame renders", () => {
      const world = createWorld();
      const view = createScopeView();

      const ac1 = makeTestAircraft({
        id: "ac-e2e-1",
        callsign: "UAL111",
        altitudeFt: 8000,
        speedKt: 250,
      });
      const ac2 = makeTestAircraft({
        id: "ac-e2e-2",
        callsign: "DAL222",
        altitudeFt: 8000,
        speedKt: 250,
      });
      world.aircraft = [ac1, ac2];

      syncTrackDisplays(view.tracks, world);
      const td1 = view.tracks.get(ac1.id)!;
      const td2 = view.tracks.get(ac2.id)!;
      td1.ownership = "owned";
      td1.datablockMode = "full";
      td2.ownership = "owned";
      td2.datablockMode = "full";

      world.alerts.ca = [
        {
          callsignA: "DAL222",
          callsignB: "UAL111",
          severity: "alert",
          distNm: 2.1,
          deltaAltFt: 0,
        },
      ];

      // Frame at simTimeMs = 400 (ON): paints CA.
      world.simTimeMs = 400;
      const mock1 = createMockCtx();
      renderScope(mock1.ctx, world, view, 800, 600);
      expect(mock1.fillTexts.filter((f) => f.text === "CA").length).toBeGreaterThanOrEqual(1);

      // Frame at simTimeMs = 1000 (OFF): does not paint CA.
      world.simTimeMs = 1000;
      const mock2 = createMockCtx();
      renderScope(mock2.ctx, world, view, 800, 600);
      expect(mock2.fillTexts.filter((f) => f.text === "CA")).toHaveLength(0);
    });

    test("keeps LA/CA/MCI list entries green through alert blink phases", () => {
      const world = createWorld();
      const view = createScopeView();
      view.systemLists.AL.visible = true;
      world.alerts.ca = [
        {
          callsignA: "AAL101",
          callsignB: "DAL202",
          severity: "alert",
          distNm: 1.2,
          deltaAltFt: 100,
        },
      ];

      for (const simTimeMs of [0, 800]) {
        world.simTimeMs = simTimeMs;
        const mock = createMockCtx();
        renderScope(mock.ctx, world, view, 800, 600);
        const alertRow = mock.fillTexts.find((fill) => fill.text === "CA AAL101*DAL202");
        expect(alertRow?.fillStyle).toBe(applyBrite(PALETTE.ssa, view.brite.lst));
      }
    });
  });
});
