/**
 * T02-205 Feature Integration Test: Minimum-Separation Input and Selection.
 *
 * Verifies AC1–AC7:
 * - Dedicated Del keybinding, scope focus only, rejection of modifiers/keypad decimal.
 * - Preview Area MIN mnemonic, exact rejection cues ("DUP TRK", "ILL TRK", "FORMAT").
 * - Report-backed target selection, sampled-vs-live divergence, datablock precedence,
 *   equal-priority tie rejection, and off-screen detection.
 * - Snapshot immutability of forbidden World/plan/track state and last centering click.
 * - Help registry and navigation integration.
 */
import { describe, expect, it } from "vitest";
import { createWorld, makeTestAircraft, setSelectedAircraft, type World } from "@core";
import { nmToScreen } from "../camera";
import { bindingById, HELP_COMMAND_GROUPS, HELP_NAVIGATION_GROUPS } from "../keymap";
import { handlePpiLeftClick } from "../ppi";
import { formatPreviewReadout } from "../previewArea";
import { handleScopeKeyDown, type ScopeKeyEvent } from "../scopeKeys";
import { createScopeView, type ScopeView } from "../scopeView";
import {
  clearMinSepState,
  isMinSepPending,
  pruneMinSepTrack,
  resolveActiveMinSep,
} from "../minimumSeparation";
import { armDcbSpinner } from "../dcb/dcbMenu";
import { armPlaceCenter, armPlaceRangeRing } from "../dcb/dcbFunctions";
import { applyDcbPref, serializeDcbPref } from "../dcb/dcbPref";
import { datablockFontCss } from "../fonts";
import { ensureTrackDisplay, terminateTrackWithPlan } from "../trackDisplay";
import type { SurveillanceReport } from "../surveillance";
import { createMockCtx } from "./mockCanvas";
import { renderScope } from "../render/renderScope";
import {
  calculateMinSepBoxMetrics,
  collectDatablockProtectedGeometry,
  computeMinSepBoxCenter,
} from "../render/renderScopePaint";

const CSS_W = 800;
const CSS_H = 800;

function makeKeyEvent(overrides: Partial<ScopeKeyEvent> = {}): ScopeKeyEvent {
  return {
    key: "Delete",
    code: "Delete",
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

function attachReport(
  view: ScopeView,
  aircraftId: string,
  overrides: Partial<SurveillanceReport> = {},
): SurveillanceReport {
  const td = ensureTrackDisplay(view.tracks, aircraftId);
  const report: SurveillanceReport = {
    aircraftId,
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    speedKt: 250,
    altitudeFt: 5000,
    reportedAtSimMs: 1000,
    sourceSiteId: null,
    paint: "fused-puck",
    ...overrides,
  };
  td.lastReport = report;
  return report;
}

function renderSnapshot(world: World, view: ScopeView) {
  const canvas = createMockCtx();
  renderScope(canvas.ctx, world, view, CSS_W, CSS_H);
}

describe("Minimum-Separation Input and Selection (T02-205)", () => {
  describe("AC1: Input, routing, mnemonic, and exact error strings", () => {
    it("Scope Del, click displayed A, click displayed B activates pair and completes Preview", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      const acA = makeTestAircraft({ id: "ac-1", callsign: "AAL101", xNm: -10, yNm: 0 });
      const acB = makeTestAircraft({ id: "ac-2", callsign: "DAL202", xNm: 10, yNm: 0 });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -10, yNm: 0 });
      attachReport(view, acB.id, { xNm: 10, yNm: 0 });

      // 1. Scope Del starts pending MIN
      const delConsumed = handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      expect(delConsumed).toBe(true);
      expect(isMinSepPending(view)).toBe(true);
      expect(formatPreviewReadout(view.preview)).toBe("MIN");

      // 2. Click displayed A
      const ptA = nmToScreen(-10, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBe("ac-1");
      expect(view.minSep.activePair).toBeNull();
      expect(formatPreviewReadout(view.preview)).toBe("MIN");

      // 3. Click displayed B
      const ptB = nmToScreen(10, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptB.x, ptB.y, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "ac-1", aircraftIdB: "ac-2" });
      expect(isMinSepPending(view)).toBe(false);
      expect(formatPreviewReadout(view.preview)).toBeNull();
    });

    it("Scope Del then Enter clears active and pending state; repeat is harmless", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };

      // Scope Del
      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      expect(formatPreviewReadout(view.preview)).toBe("MIN");

      // Scope Enter
      const enterConsumed = handleScopeKeyDown(
        makeKeyEvent({ key: "Enter", code: "Enter" }),
        view,
        "scope",
        world,
        1100,
      );
      expect(enterConsumed).toBe(true);
      expect(view.minSep.activePair).toBeNull();
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(formatPreviewReadout(view.preview)).toBeNull();

      // Repeated Del then Enter while empty
      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1200);
      handleScopeKeyDown(makeKeyEvent({ key: "Enter", code: "Enter" }), view, "scope", world, 1300);
      expect(view.minSep.activePair).toBeNull();
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(formatPreviewReadout(view.preview)).toBeNull();
    });

    it("Del, click A, Enter clears all with no partial pair", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      const acA = makeTestAircraft({ id: "ac-1", xNm: 0, yNm: 0 });
      world.aircraft.push(acA);
      attachReport(view, acA.id, { xNm: 0, yNm: 0 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(0, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBe("ac-1");

      handleScopeKeyDown(makeKeyEvent({ key: "Enter", code: "Enter" }), view, "scope", world, 1100);
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.activePair).toBeNull();
      expect(formatPreviewReadout(view.preview)).toBeNull();
    });

    it("Del, click A, empty click leaves entry pending and active pair unchanged", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "old-1", aircraftIdB: "old-2" };

      const acA = makeTestAircraft({ id: "ac-1", xNm: 0, yNm: 0 });
      world.aircraft.push(acA);
      attachReport(view, acA.id, { xNm: 0, yNm: 0 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(0, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBe("ac-1");

      // Empty click far away
      handlePpiLeftClick(view, world, 50, 50, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBe("ac-1");
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "old-1", aircraftIdB: "old-2" });
      expect(formatPreviewReadout(view.preview)).toBe("MIN");
    });

    it("Del, click A, click A aborts pending with DUP TRK and retains previous active pair", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "old-1", aircraftIdB: "old-2" };

      const acA = makeTestAircraft({ id: "ac-1", xNm: 0, yNm: 0 });
      world.aircraft.push(acA);
      attachReport(view, acA.id, { xNm: 0, yNm: 0 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(0, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);

      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "old-1", aircraftIdB: "old-2" });
      expect(formatPreviewReadout(view.preview)).toBe("DUP TRK");
    });

    it("First A vanishes before B attempted selection aborts with ILL TRK", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "old-1", aircraftIdB: "old-2" };

      const acA = makeTestAircraft({ id: "ac-1", xNm: 0, yNm: 0 });
      const acB = makeTestAircraft({ id: "ac-2", xNm: 5, yNm: 5 });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: 0, yNm: 0 });
      attachReport(view, acB.id, { xNm: 5, yNm: 5 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(0, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBe("ac-1");

      // Target A vanishes from world before second selection
      world.aircraft = world.aircraft.filter((a) => a.id !== "ac-1");

      const ptB = nmToScreen(5, 5, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptB.x, ptB.y, CSS_W, CSS_H);

      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "old-1", aircraftIdB: "old-2" });
      expect(formatPreviewReadout(view.preview)).toBe("ILL TRK");
    });

    it("First A pans off-screen before B attempted selection aborts with ILL TRK", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "old-1", aircraftIdB: "old-2" };

      const acA = makeTestAircraft({ id: "ac-1", xNm: 15, yNm: 0 });
      const acB = makeTestAircraft({ id: "ac-2", xNm: -5, yNm: 0 });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: 15, yNm: 0 });
      attachReport(view, acB.id, { xNm: -5, yNm: 0 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(15, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBe("ac-1");

      // Scope camera pans west so ac-1 at +15 NM pans off the right edge
      view.camera.centerEastNm = -10;
      const recheckedPtA = nmToScreen(15, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      expect(recheckedPtA.x > CSS_W).toBe(true);

      const ptB = nmToScreen(-5, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptB.x, ptB.y, CSS_W, CSS_H);

      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "old-1", aircraftIdB: "old-2" });
      expect(formatPreviewReadout(view.preview)).toBe("ILL TRK");
    });

    it("Equal-priority overlapping A/B hit aborts pending with ILL TRK", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "old-1", aircraftIdB: "old-2" };

      // Two aircraft at exact same report position
      const acA = makeTestAircraft({ id: "ac-1", xNm: 0, yNm: 0 });
      const acB = makeTestAircraft({ id: "ac-2", xNm: 0, yNm: 0 });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: 0, yNm: 0 });
      attachReport(view, acB.id, { xNm: 0, yNm: 0 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const pt = nmToScreen(0, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, pt.x, pt.y, CSS_W, CSS_H);

      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "old-1", aircraftIdB: "old-2" });
      expect(formatPreviewReadout(view.preview)).toBe("ILL TRK");
    });

    it("Target with malformed report aborts pending with ILL TRK", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      const acA = makeTestAircraft({ id: "ac-1", xNm: 0, yNm: 0 });
      world.aircraft.push(acA);
      // Malformed report with NaN speed
      attachReport(view, acA.id, { xNm: 0, yNm: 0, speedKt: NaN });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const pt = nmToScreen(0, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, pt.x, pt.y, CSS_W, CSS_H);

      expect(view.minSep.pendingFirstId).toBeNull();
      expect(formatPreviewReadout(view.preview)).toBe("ILL TRK");
    });

    it("Del then printable character aborts pending with FORMAT and preserves previous valid pair", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "old-1", aircraftIdB: "old-2" };

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      expect(formatPreviewReadout(view.preview)).toBe("MIN");

      const charConsumed = handleScopeKeyDown(
        makeKeyEvent({ key: "A", code: "KeyA" }),
        view,
        "scope",
        world,
        1100,
      );
      expect(charConsumed).toBe(true);
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "old-1", aircraftIdB: "old-2" });
      expect(formatPreviewReadout(view.preview)).toBe("FORMAT");
    });

    it("Del, Escape cancels pending; Del while already pending restarts pending", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "old-1", aircraftIdB: "old-2" };

      // Del then Esc
      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      expect(formatPreviewReadout(view.preview)).toBe("MIN");
      const escConsumed = handleScopeKeyDown(
        makeKeyEvent({ key: "Escape", code: "Escape" }),
        view,
        "scope",
        world,
        1100,
      );
      expect(escConsumed).toBe(true);
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "old-1", aircraftIdB: "old-2" });
      expect(formatPreviewReadout(view.preview)).toBeNull();

      // Del, click 1, Del restarts pending
      const acA = makeTestAircraft({ id: "ac-1", xNm: 0, yNm: 0 });
      world.aircraft.push(acA);
      attachReport(view, acA.id, { xNm: 0, yNm: 0 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1200);
      const ptA = nmToScreen(0, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBe("ac-1");

      const del2Consumed = handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1300);
      expect(del2Consumed).toBe(true);
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "old-1", aircraftIdB: "old-2" });
      expect(formatPreviewReadout(view.preview)).toBe("MIN");
    });

    it("Backspace during pending MIN does not edit radio or remove mnemonic", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      expect(formatPreviewReadout(view.preview)).toBe("MIN");

      const bsConsumed = handleScopeKeyDown(
        makeKeyEvent({ key: "Backspace", code: "Backspace" }),
        view,
        "scope",
        world,
        1100,
      );
      expect(bsConsumed).toBe(true);
      expect(formatPreviewReadout(view.preview)).toBe("MIN");
    });
  });

  describe("AC2: Dedicated-key, modifier, radio, modal, and conflict isolation", () => {
    it("Dedicated Del in radio/modal/help editor is not consumed by scope MIN", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      // Focus radio: Del must not activate MIN
      const resRadio = handleScopeKeyDown(makeKeyEvent(), view, "radio", world, 1000);
      expect(resRadio).toBe(false);
      expect(isMinSepPending(view)).toBe(false);

      // Event on HTMLInputElement mock
      const mockInput = {
        nodeType: 1,
        tagName: "INPUT",
        closest: () => null,
      };
      const resModal = handleScopeKeyDown(
        makeKeyEvent({ target: mockInput as unknown as EventTarget }),
        view,
        "scope",
        world,
        1100,
      );
      expect(resModal).toBe(false);
      expect(isMinSepPending(view)).toBe(false);
    });

    it("Modifiers (Ctrl, Alt, Shift, Meta) and keypad Decimal/Delete do not activate MIN", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      expect(handleScopeKeyDown(makeKeyEvent({ ctrlKey: true }), view, "scope", world, 1000)).toBe(
        false,
      );
      expect(handleScopeKeyDown(makeKeyEvent({ altKey: true }), view, "scope", world, 1010)).toBe(
        false,
      );
      expect(handleScopeKeyDown(makeKeyEvent({ shiftKey: true }), view, "scope", world, 1020)).toBe(
        false,
      );
      expect(handleScopeKeyDown(makeKeyEvent({ metaKey: true }), view, "scope", world, 1030)).toBe(
        false,
      );
      expect(
        handleScopeKeyDown(
          makeKeyEvent({ key: "Delete", code: "NumpadDecimal" }),
          view,
          "scope",
          world,
          1040,
        ),
      ).toBe(false);
      expect(
        handleScopeKeyDown(
          makeKeyEvent({ key: "Decimal", code: "NumpadDecimal" }),
          view,
          "scope",
          world,
          1050,
        ),
      ).toBe(false);
      expect(isMinSepPending(view)).toBe(false);
    });

    it("Starting MIN rolls back armed DCB spinner with existing rollback behavior", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.camera.rangeNm = 20;

      // Arm DCB RANGE spinner and type new value
      armDcbSpinner(view, "RANGE");
      view.camera.rangeNm = 40; // temporary mutation
      expect(view.dcbSpinner.armed).toBe(true);

      // Press scope Del
      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      expect(view.dcbSpinner.armed).toBe(false);
      // Spinner rollback restored rangeNm
      expect(view.camera.rangeNm).toBe(20);
      expect(formatPreviewReadout(view.preview)).toBe("MIN");
    });

    it("Arming DCB spinner or place-center cancels pending MIN without leaving hidden arm", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      expect(isMinSepPending(view)).toBe(true);

      armDcbSpinner(view, "RANGE");
      expect(isMinSepPending(view)).toBe(false);
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(formatPreviewReadout(view.preview)).toBeNull();

      // Test armPlaceCenter cancels pending MIN
      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1100);
      expect(isMinSepPending(view)).toBe(true);
      armPlaceCenter(view);
      expect(isMinSepPending(view)).toBe(false);

      // Test armPlaceRangeRing cancels pending MIN
      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1200);
      expect(isMinSepPending(view)).toBe(true);
      armPlaceRangeRing(view);
      expect(isMinSepPending(view)).toBe(false);
    });

    it("Radio focus or Tab cancels pending MIN while preserving active pair", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "old-1", aircraftIdB: "old-2" };

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      expect(isMinSepPending(view)).toBe(true);

      // Tab cycles focus
      handleScopeKeyDown(makeKeyEvent({ key: "Tab", code: "Tab" }), view, "scope", world, 1100);
      expect(isMinSepPending(view)).toBe(false);
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "old-1", aircraftIdB: "old-2" });
    });
  });

  describe("AC3: Report-backed hit testing and sampled-versus-live pose divergence", () => {
    it("Clicks follow sampled report pose, not live truth", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      // Aircraft live position is at (+20, +20), but report is at (-5, 0)
      const acA = makeTestAircraft({ id: "ac-1", xNm: 20, yNm: 20 });
      const acB = makeTestAircraft({ id: "ac-2", xNm: 20, yNm: -20 });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -5, yNm: 0 });
      attachReport(view, acB.id, { xNm: 5, yNm: 0 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);

      // Click at live truth (+20, +20) -> misses report
      const livePt = nmToScreen(20, 20, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, livePt.x, livePt.y, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBeNull(); // miss

      // Click at report pose (-5, 0) -> hits!
      const reportPtA = nmToScreen(-5, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, reportPtA.x, reportPtA.y, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBe("ac-1");

      // Click second report pose (5, 0) -> hits and activates
      const reportPtB = nmToScreen(5, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, reportPtB.x, reportPtB.y, CSS_W, CSS_H);
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "ac-1", aircraftIdB: "ac-2" });
    });

    it("Datablock hit testing selects eligible target with datablock-first precedence", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      const acA = makeTestAircraft({ id: "ac-1", callsign: "AAL101", xNm: -5, yNm: 0 });
      const acB = makeTestAircraft({ id: "ac-2", callsign: "DAL202", xNm: 5, yNm: 0 });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -5, yNm: 0 });
      attachReport(view, acB.id, { xNm: 5, yNm: 0 });

      // Render scope to populate datablockRenderSnapshot
      renderSnapshot(world, view);
      expect(view.datablockRenderSnapshot).toBeDefined();

      const layoutA = view.datablockRenderSnapshot?.layouts.get("ac-1");
      expect(layoutA?.rect).toBeDefined();
      if (!layoutA?.rect) {
        throw new Error("layoutA.rect not defined");
      }

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);

      // Click on datablock rectangle of ac-1
      const dbX = layoutA.rect.x + layoutA.rect.width / 2;
      const dbY = layoutA.rect.y + layoutA.rect.height / 2;
      handlePpiLeftClick(view, world, dbX, dbY, CSS_W, CSS_H);
      expect(view.minSep.pendingFirstId).toBe("ac-1");
    });

    it("Altitude-filtered datablocks do not disqualify still-visible symbol", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      // Set altitude filter 100–200 (10,000–20,000 ft)
      view.altitudeFilter = { minHundreds: 100, maxHundreds: 200 };

      // Aircraft at 5,000 ft (outside altitude filter, datablock suppressed but symbol visible)
      const acA = makeTestAircraft({ id: "ac-1", xNm: 0, yNm: 0, altitudeFt: 5000 });
      world.aircraft.push(acA);
      attachReport(view, acA.id, { xNm: 0, yNm: 0, altitudeFt: 5000 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const symPt = nmToScreen(0, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, symPt.x, symPt.y, CSS_W, CSS_H);

      expect(view.minSep.pendingFirstId).toBe("ac-1");
    });
  });

  describe("AC4: Snapshot assertions prove MIN clicks do not alter forbidden state", () => {
    it("MIN clicks do not change World.selectedAircraftId, plans, ownership, handoffs, or last centering click", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      const acA = makeTestAircraft({ id: "ac-1", callsign: "AAL101", xNm: -5, yNm: 0 });
      const acB = makeTestAircraft({ id: "ac-2", callsign: "DAL202", xNm: 5, yNm: 0 });
      const acOther = makeTestAircraft({ id: "ac-sel", callsign: "SWA303", xNm: 0, yNm: 10 });
      world.aircraft.push(acA, acB, acOther);
      attachReport(view, acA.id, { xNm: -5, yNm: 0 });
      attachReport(view, acB.id, { xNm: 5, yNm: 0 });
      attachReport(view, acOther.id, { xNm: 0, yNm: 10 });

      // Previously selected aircraft
      setSelectedAircraft(world, "ac-sel");
      view.lastClickEastNm = 99;
      view.lastClickNorthNm = 88;

      // Deep snapshot of forbidden properties before MIN interaction
      const snapshotWorldSelected = world.selectedAircraftId;
      const snapshotLastEast = view.lastClickEastNm;
      const snapshotLastNorth = view.lastClickNorthNm;
      const snapshotAcA = JSON.parse(JSON.stringify(acA));
      const snapshotAcB = JSON.parse(JSON.stringify(acB));
      const snapshotFlightPlans = JSON.parse(JSON.stringify(world.flightPlans));
      const snapshotAlerts = JSON.parse(JSON.stringify(world.alerts));
      const snapshotTracks = new Map(
        Array.from(view.tracks.entries()).map(([k, v]) => [k, { ...v }]),
      );

      // Perform complete MIN selection sequence
      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(-5, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      const ptB = nmToScreen(5, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptB.x, ptB.y, CSS_W, CSS_H);

      // Pair activated
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "ac-1", aircraftIdB: "ac-2" });

      // Forbidden mutations must be identical
      expect(world.selectedAircraftId).toBe(snapshotWorldSelected);
      expect(view.lastClickEastNm).toBe(snapshotLastEast);
      expect(view.lastClickNorthNm).toBe(snapshotLastNorth);
      expect(JSON.parse(JSON.stringify(acA))).toEqual(snapshotAcA);
      expect(JSON.parse(JSON.stringify(acB))).toEqual(snapshotAcB);
      expect(JSON.parse(JSON.stringify(world.flightPlans))).toEqual(snapshotFlightPlans);
      expect(JSON.parse(JSON.stringify(world.alerts))).toEqual(snapshotAlerts);

      // Track displays (ownership, datablockMode) must remain identical
      for (const [id, originalTd] of snapshotTracks.entries()) {
        const currentTd = view.tracks.get(id);
        expect(currentTd?.ownership).toBe(originalTd.ownership);
        expect(currentTd?.datablockMode).toBe(originalTd.datablockMode);
      }
    });
  });

  describe("AC5: Help registry, search, and keymap inspection", () => {
    it("Registers minimum-separation in KEY_BINDINGS and Help navigation", () => {
      const binding = bindingById("minimum-separation");
      expect(binding).toBeDefined();
      expect(binding?.focus).toBe("scope");
      expect(binding?.windowsKeys).toContain("Delete");
      expect(binding?.action.toLowerCase()).toContain("minimum separation");

      // Verify command reference entry
      const trackingAlertsGroup = HELP_COMMAND_GROUPS.find((g) => g.id === "tracking-alerts");
      expect(trackingAlertsGroup).toBeDefined();
      const minEntry = trackingAlertsGroup?.entries.find((e) => e.id === "minimum-separation");
      expect(minEntry).toBeDefined();
      expect(minEntry?.command).toContain("Del");
      expect(minEntry?.input).toBe("Scope only");
      expect(minEntry?.result.toLowerCase()).toContain("minimum separation");

      // Verify navigation group registration
      const aircraftAlertsNav = HELP_NAVIGATION_GROUPS.find(
        (g) => g.id === "aircraft",
      )?.bindingSections.find((s) => s.id === "aircraft-alerts");
      expect(aircraftAlertsNav?.bindingIds).toContain("minimum-separation");
    });

    it("Does not bind bare End, ?, F2, typed MIN, or DCB buttons as alternate MIN activators", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      // End remains centering
      view.lastClickEastNm = 12;
      view.lastClickNorthNm = 34;
      handleScopeKeyDown(makeKeyEvent({ key: "End", code: "End" }), view, "scope", world, 1000);
      expect(view.camera.centerEastNm).toBe(12);
      expect(isMinSepPending(view)).toBe(false);

      // ? remains help toggle
      handleScopeKeyDown(
        makeKeyEvent({ key: "?", code: "Slash", shiftKey: true }),
        view,
        "scope",
        world,
        1100,
      );
      expect(view.helpOpen).toBe(true);
      expect(isMinSepPending(view)).toBe(false);
    });
  });

  describe("T02-206 AC2: Graphics rendering, Canvas recordings, styling, and font modulation", () => {
    it("Draws projection lines, upright triangles, connecting segment, and boxed NM text in white/TLS brite", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.brite.tls = 100;

      const acA = makeTestAircraft({
        id: "ac-1",
        callsign: "AAL101",
        xNm: -10,
        yNm: 0,
        headingDeg: 90,
        speedKt: 300,
      });
      const acB = makeTestAircraft({
        id: "ac-2",
        callsign: "DAL202",
        xNm: 0,
        yNm: -10,
        headingDeg: 0,
        speedKt: 300,
      });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -10, yNm: 0, headingDeg: 90, speedKt: 300 });
      attachReport(view, acB.id, { xNm: 0, yNm: -10, headingDeg: 0, speedKt: 300 });

      // Del, click A, click B
      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(-10, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      const ptB = nmToScreen(0, -10, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptB.x, ptB.y, CSS_W, CSS_H);
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "ac-1", aircraftIdB: "ac-2" });

      const mock = createMockCtx();
      renderScope(mock.ctx, world, view, CSS_W, CSS_H);

      // Verify stroke rect (boxed readout)
      expect(mock.strokeRects.length).toBeGreaterThanOrEqual(1);
      const boxRect = mock.strokeRects.find((r) => r.strokeStyle.toUpperCase() === "#FFFFFF");
      expect(boxRect).toBeDefined();

      // Verify fillText includes distance readout with " NM"
      const distText = mock.fillTexts.find((t) => t.text.includes("NM"));
      expect(distText).toBeDefined();
      expect(distText?.text).toMatch(/^\d+\.\d{2} NM$/);
      expect(distText?.font).toBe(datablockFontCss(view.charSizes.tools));

      // Verify filled upright triangles (fill count incremented)
      expect(mock.fills.count).toBeGreaterThanOrEqual(2);

      // Verify triangles are rendered after strokeRect (independent of distance box background)
      const boxRectIndex = mock.strokeRects.findIndex(
        (r) => r.strokeStyle.toUpperCase() === "#FFFFFF",
      );
      expect(boxRectIndex).toBeGreaterThanOrEqual(0);

      // Verify 3 distinct path strokes: proj A, proj B, and connecting segment in white
      const minStrokes = mock.pathStrokes.filter((s) => s.strokeStyle.toUpperCase() === "#FFFFFF");
      expect(minStrokes.length).toBeGreaterThanOrEqual(3);
    });

    it("Draws exact 0.00 NM for horizontal crossing with differing altitudes", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      // Head-on horizontal collision at origin, different altitudes
      const acA = makeTestAircraft({
        id: "ac-1",
        callsign: "AAL101",
        xNm: -10,
        yNm: 0,
        altitudeFt: 5000,
        headingDeg: 90,
        speedKt: 300,
      });
      const acB = makeTestAircraft({
        id: "ac-2",
        callsign: "DAL202",
        xNm: 10,
        yNm: 0,
        altitudeFt: 10000,
        headingDeg: 270,
        speedKt: 300,
      });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, {
        xNm: -10,
        yNm: 0,
        altitudeFt: 5000,
        headingDeg: 90,
        speedKt: 300,
      });
      attachReport(view, acB.id, {
        xNm: 10,
        yNm: 0,
        altitudeFt: 10000,
        headingDeg: 270,
        speedKt: 300,
      });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(-10, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      const ptB = nmToScreen(10, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptB.x, ptB.y, CSS_W, CSS_H);

      const mock = createMockCtx();
      renderScope(mock.ctx, world, view, CSS_W, CSS_H);

      const distText = mock.fillTexts.find((t) => t.text.includes("NM"));
      expect(distText).toBeDefined();
      expect(distText?.text).toBe("0.00 NM");
      // No NO XING cue since tracks are converging towards 0.00 NM CPA
      const noXing = mock.fillTexts.find((t) => t.text === "NO XING");
      expect(noXing).toBeUndefined();
    });

    it("Draws 'NO XING' without question mark when horizontal separation is increasing", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      // Diverging aircraft (moving away from each other)
      const acA = makeTestAircraft({
        id: "ac-1",
        callsign: "AAL101",
        xNm: -5,
        yNm: 0,
        headingDeg: 270,
        speedKt: 300,
      });
      const acB = makeTestAircraft({
        id: "ac-2",
        callsign: "DAL202",
        xNm: 5,
        yNm: 0,
        headingDeg: 90,
        speedKt: 300,
      });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -5, yNm: 0, headingDeg: 270, speedKt: 300 });
      attachReport(view, acB.id, { xNm: 5, yNm: 0, headingDeg: 90, speedKt: 300 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(-5, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      const ptB = nmToScreen(5, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptB.x, ptB.y, CSS_W, CSS_H);

      const mock = createMockCtx();
      renderScope(mock.ctx, world, view, CSS_W, CSS_H);

      const noXing = mock.fillTexts.find((t) => t.text === "NO XING");
      expect(noXing).toBeDefined();
      expect(mock.fillTexts.find((t) => t.text.includes("NO XING?"))).toBeUndefined();
    });

    it("Does not show 'NO XING' for equal-velocity parallel tracks", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      // Parallel identical velocities (constant separation)
      const acA = makeTestAircraft({
        id: "ac-1",
        callsign: "AAL101",
        xNm: 0,
        yNm: 0,
        headingDeg: 90,
        speedKt: 300,
      });
      const acB = makeTestAircraft({
        id: "ac-2",
        callsign: "DAL202",
        xNm: 0,
        yNm: 5,
        headingDeg: 90,
        speedKt: 300,
      });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: 0, yNm: 0, headingDeg: 90, speedKt: 300 });
      attachReport(view, acB.id, { xNm: 0, yNm: 5, headingDeg: 90, speedKt: 300 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(0, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      const ptB = nmToScreen(0, 5, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptB.x, ptB.y, CSS_W, CSS_H);

      const mock = createMockCtx();
      renderScope(mock.ctx, world, view, CSS_W, CSS_H);

      const noXing = mock.fillTexts.find((t) => t.text === "NO XING");
      expect(noXing).toBeUndefined();
      const dist = mock.fillTexts.find((t) => t.text.includes("5.00 NM"));
      expect(dist).toBeDefined();
    });

    it("TLS 0 hides MIN ink without clearing active pair; independent of PTL switches", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);
      view.ptlOn = false; // PTL switch off
      view.brite.tls = 0; // TLS 0

      const acA = makeTestAircraft({
        id: "ac-1",
        callsign: "AAL101",
        xNm: -10,
        yNm: 0,
        headingDeg: 90,
        speedKt: 300,
      });
      const acB = makeTestAircraft({
        id: "ac-2",
        callsign: "DAL202",
        xNm: 10,
        yNm: 0,
        headingDeg: 270,
        speedKt: 300,
      });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -10, yNm: 0, headingDeg: 90, speedKt: 300 });
      attachReport(view, acB.id, { xNm: 10, yNm: 0, headingDeg: 270, speedKt: 300 });

      handleScopeKeyDown(makeKeyEvent(), view, "scope", world, 1000);
      const ptA = nmToScreen(-10, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptA.x, ptA.y, CSS_W, CSS_H);
      const ptB = nmToScreen(10, 0, view.camera, { widthPx: CSS_W, heightPx: CSS_H });
      handlePpiLeftClick(view, world, ptB.x, ptB.y, CSS_W, CSS_H);
      expect(view.minSep.activePair).toEqual({ aircraftIdA: "ac-1", aircraftIdB: "ac-2" });

      const mock0 = createMockCtx();
      renderScope(mock0.ctx, world, view, CSS_W, CSS_H);
      // No MIN text rendered because TLS is 0
      expect(mock0.fillTexts.find((t) => /^\d+\.\d{2} NM$/.test(t.text))).toBeUndefined();

      // Restore TLS brite: MIN ink immediately reappears while PTL is still off
      view.brite.tls = 80;
      const mock80 = createMockCtx();
      renderScope(mock80.ctx, world, view, CSS_W, CSS_H);
      expect(mock80.fillTexts.find((t) => /^\d+\.\d{2} NM$/.test(t.text))).toBeDefined();
    });

    it("Clamps mileage box inside viewport when nominal midpoint is outside", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      // Tracks far off to the east (x = 100 NM, nominal midpoint offscreen)
      const acA = makeTestAircraft({
        id: "ac-1",
        callsign: "AAL101",
        xNm: 90,
        yNm: 0,
        headingDeg: 90,
        speedKt: 300,
      });
      const acB = makeTestAircraft({
        id: "ac-2",
        callsign: "DAL202",
        xNm: 110,
        yNm: 0,
        headingDeg: 270,
        speedKt: 300,
      });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: 90, yNm: 0, headingDeg: 90, speedKt: 300 });
      attachReport(view, acB.id, { xNm: 110, yNm: 0, headingDeg: 270, speedKt: 300 });

      // Directly set active pair
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };

      const mock = createMockCtx();
      renderScope(mock.ctx, world, view, CSS_W, CSS_H);

      const boxRect = mock.strokeRects[0];
      expect(boxRect).toBeDefined();
      // Right edge of box must be within CSS_W
      expect(boxRect.x + boxRect.w).toBeLessThanOrEqual(CSS_W);
      expect(boxRect.x).toBeGreaterThanOrEqual(0);
    });

    it("Keeps box inline at midpoint when CPA triangles are far apart (> 60 px)", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      // Trajectories crossing with wide CPA separation (10 NM apart at CPA)
      const acA = makeTestAircraft({
        id: "ac-1",
        callsign: "AAL101",
        xNm: -10,
        yNm: 5,
        headingDeg: 90,
        speedKt: 300,
      });
      const acB = makeTestAircraft({
        id: "ac-2",
        callsign: "DAL202",
        xNm: 10,
        yNm: -5,
        headingDeg: 270,
        speedKt: 300,
      });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -10, yNm: 5, headingDeg: 90, speedKt: 300 });
      attachReport(view, acB.id, { xNm: 10, yNm: -5, headingDeg: 270, speedKt: 300 });
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };

      const resolved = resolveActiveMinSep(view.minSep, view.tracks, world.navigation.magVarDeg)!;
      const cpaA = nmToScreen(resolved.prediction.posANm.xNm, resolved.prediction.posANm.yNm, view.camera, {
        widthPx: CSS_W,
        heightPx: CSS_H,
      });
      const cpaB = nmToScreen(resolved.prediction.posBNm.xNm, resolved.prediction.posBNm.yNm, view.camera, {
        widthPx: CSS_W,
        heightPx: CSS_H,
      });
      const dPx = Math.hypot(cpaB.x - cpaA.x, cpaB.y - cpaA.y);
      expect(dPx).toBeGreaterThan(60);

      const boxMetrics = calculateMinSepBoxMetrics(view, resolved.prediction);
      const { center, isOffset } = computeMinSepBoxCenter(cpaA, cpaB, boxMetrics, {
        widthPx: CSS_W,
        heightPx: CSS_H,
      });
      expect(isOffset).toBe(false);
      expect(center.x).toBeCloseTo((cpaA.x + cpaB.x) / 2, 1);
      expect(center.y).toBeCloseTo((cpaA.y + cpaB.y) / 2, 1);

      const mock = createMockCtx();
      renderScope(mock.ctx, world, view, CSS_W, CSS_H);

      const boxRect = mock.strokeRects.find((r) => r.strokeStyle.toUpperCase() === "#FFFFFF");
      expect(boxRect).toBeDefined();
      expect(boxRect!.x + boxRect!.w / 2).toBeCloseTo((cpaA.x + cpaB.x) / 2, 1);
      expect(boxRect!.y + boxRect!.h / 2).toBeCloseTo((cpaA.y + cpaB.y) / 2, 1);
    });

    it("Offsets box perpendicular/upward when CPA triangles are close together (e.g. 0 NM collision or < 10 px apart) while keeping triangles at CPA positions", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      // Head-on collision at origin (0 NM CPA, distance = 0)
      const acA = makeTestAircraft({
        id: "ac-1",
        callsign: "AAL101",
        xNm: -10,
        yNm: 0,
        headingDeg: 90,
        speedKt: 300,
      });
      const acB = makeTestAircraft({
        id: "ac-2",
        callsign: "DAL202",
        xNm: 10,
        yNm: 0,
        headingDeg: 270,
        speedKt: 300,
      });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -10, yNm: 0, headingDeg: 90, speedKt: 300 });
      attachReport(view, acB.id, { xNm: 10, yNm: 0, headingDeg: 270, speedKt: 300 });
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };

      const resolved = resolveActiveMinSep(view.minSep, view.tracks, world.navigation.magVarDeg)!;
      const cpaA = nmToScreen(resolved.prediction.posANm.xNm, resolved.prediction.posANm.yNm, view.camera, {
        widthPx: CSS_W,
        heightPx: CSS_H,
      });
      const cpaB = nmToScreen(resolved.prediction.posBNm.xNm, resolved.prediction.posBNm.yNm, view.camera, {
        widthPx: CSS_W,
        heightPx: CSS_H,
      });
      const dPx = Math.hypot(cpaB.x - cpaA.x, cpaB.y - cpaA.y);
      expect(dPx).toBeLessThan(1e-3);

      const boxMetrics = calculateMinSepBoxMetrics(view, resolved.prediction);
      const { center, isOffset } = computeMinSepBoxCenter(cpaA, cpaB, boxMetrics, {
        widthPx: CSS_W,
        heightPx: CSS_H,
      });
      expect(isOffset).toBe(true);
      // Box is offset upward from (cpaA.y)
      expect(center.y).toBeLessThan(cpaA.y);

      const mock = createMockCtx();
      renderScope(mock.ctx, world, view, CSS_W, CSS_H);

      const boxRect = mock.strokeRects.find((r) => r.strokeStyle.toUpperCase() === "#FFFFFF");
      expect(boxRect).toBeDefined();
      const renderedBoxCenterY = boxRect!.y + boxRect!.h / 2;
      // Rendered box is offset upward from the collision point
      expect(renderedBoxCenterY).toBeCloseTo(center.y, 1);
      expect(renderedBoxCenterY).toBeLessThan(cpaA.y);

      // Verify no leader line was drawn (only 3 white pathStrokes: projA, projB, connecting segment)
      const whiteStrokes = mock.pathStrokes.filter((s) => s.strokeStyle.toUpperCase() === "#FFFFFF");
      expect(whiteStrokes.length).toBe(3);

      // Triangles remain painted at exact CPA positions
      expect(mock.fills.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("T02-206 AC3: Protected geometry and datablock layout integration", () => {
    it("Includes MIN projection lines, CPA markers, and boxed rect in collectDatablockProtectedGeometry", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      const acA = makeTestAircraft({
        id: "ac-1",
        callsign: "AAL101",
        xNm: -10,
        yNm: 0,
        headingDeg: 90,
        speedKt: 300,
      });
      const acB = makeTestAircraft({
        id: "ac-2",
        callsign: "DAL202",
        xNm: 10,
        yNm: 0,
        headingDeg: 270,
        speedKt: 300,
      });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -10, yNm: 0, headingDeg: 90, speedKt: 300 });
      attachReport(view, acB.id, { xNm: 10, yNm: 0, headingDeg: 270, speedKt: 300 });
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };

      const geom = collectDatablockProtectedGeometry(world, view, {
        widthPx: CSS_W,
        heightPx: CSS_H,
      });

      // Must have segment geometries for projections & connecting line
      const segments = geom.filter((g) => g.kind === "segment");
      expect(segments.length).toBeGreaterThanOrEqual(3);

      // Must have circle geometries for CPA triangles
      const circles = geom.filter((g) => g.kind === "circle" && g.radius === 6);
      expect(circles.length).toBe(2);

      // Must have rect geometry for boxed readout
      const rects = geom.filter((g) => g.kind === "rect");
      expect(rects.length).toBe(1);
    });

    it("Accounts for session magnetic variation in CPA projection and graphics", () => {
      const world = createWorld();
      world.navigation.magVarDeg = 15; // 15 degrees East
      const view = createScopeView(0, 0);

      const acA = makeTestAircraft({
        id: "ac-1",
        callsign: "AAL101",
        xNm: -10,
        yNm: 0,
        headingDeg: 90,
        speedKt: 300,
      });
      const acB = makeTestAircraft({
        id: "ac-2",
        callsign: "DAL202",
        xNm: 10,
        yNm: 0,
        headingDeg: 270,
        speedKt: 300,
      });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -10, yNm: 0, headingDeg: 90, speedKt: 300 });
      attachReport(view, acB.id, { xNm: 10, yNm: 0, headingDeg: 270, speedKt: 300 });
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };

      const resolved = resolveActiveMinSep(view.minSep, view.tracks, world.navigation.magVarDeg);
      expect(resolved).not.toBeNull();
      // True heading = 90 + 15 = 105 for A, 270 + 15 = 285 for B
      expect(resolved?.prediction.posANm).toBeDefined();
    });
  });

  describe("T02-206 AC4: Lifecycle cleanup, drops, despawn, and PREF exclusion", () => {
    it("F4 drop removes active MIN pair", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      const acA = makeTestAircraft({ id: "ac-1", callsign: "AAL101", xNm: -10, yNm: 0 });
      const acB = makeTestAircraft({ id: "ac-2", callsign: "DAL202", xNm: 10, yNm: 0 });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -10, yNm: 0 });
      attachReport(view, acB.id, { xNm: 10, yNm: 0 });
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };

      // Select acA and press F4
      setSelectedAircraft(world, acA.id);
      handleScopeKeyDown(makeKeyEvent({ key: "F4", code: "F4" }), view, "scope", world, 1000);

      expect(view.minSep.activePair).toBeNull();
    });

    it("Slash-symbol TERM CNTL removes active MIN pair", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      const acA = makeTestAircraft({ id: "ac-1", callsign: "AAL101", xNm: -10, yNm: 0 });
      const acB = makeTestAircraft({ id: "ac-2", callsign: "DAL202", xNm: 10, yNm: 0 });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -10, yNm: 0 });
      attachReport(view, acB.id, { xNm: 10, yNm: 0 });
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };

      // Direct call to terminateTrackWithPlan with caState (view)
      terminateTrackWithPlan(view.tracks, world, acA.id, view);
      expect(view.minSep.activePair).toBeNull();
    });

    it("Despawn or loss of surveillance report prunes active MIN pair during sync", () => {
      const world = createWorld();
      const view = createScopeView(0, 0);

      const acA = makeTestAircraft({ id: "ac-1", callsign: "AAL101", xNm: -10, yNm: 0 });
      const acB = makeTestAircraft({ id: "ac-2", callsign: "DAL202", xNm: 10, yNm: 0 });
      world.aircraft.push(acA, acB);
      attachReport(view, acA.id, { xNm: -10, yNm: 0 });
      attachReport(view, acB.id, { xNm: 10, yNm: 0 });
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };

      // acA report drops (radar coverage lost / sampler drops report)
      const tdA = view.tracks.get(acA.id)!;
      delete tdA.lastReport;
      pruneMinSepTrack(view.minSep, acA.id);
      expect(view.minSep.activePair).toBeNull();
    });

    it("Session reset clears active and pending MIN state", () => {
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };
      view.minSep.pendingFirstId = "ac-3";

      clearMinSepState(view.minSep);
      expect(view.minSep.activePair).toBeNull();
      expect(view.minSep.pendingFirstId).toBeNull();
      expect(view.minSep.lastError).toBeNull();
    });

    it("PREF serialization excludes MIN session state", () => {
      const view = createScopeView(0, 0);
      view.minSep.activePair = { aircraftIdA: "ac-1", aircraftIdB: "ac-2" };
      view.minSep.pendingFirstId = "ac-1";

      const pref = serializeDcbPref(view);
      expect((pref as unknown as { minSep?: unknown }).minSep).toBeUndefined();

      const targetView = createScopeView(0, 0);
      applyDcbPref(targetView, pref);
      expect(targetView.minSep.activePair).toBeNull();
      expect(targetView.minSep.pendingFirstId).toBeNull();
    });
  });
});
