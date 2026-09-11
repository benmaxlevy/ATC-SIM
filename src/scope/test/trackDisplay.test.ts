import { expect, test } from "vitest";
import { type CaAlert, createWorld, makeTestAircraft, stepWorld } from "@core";
import { applyIntent } from "@pilot";
import {
  IDENT_DISPLAY_FLASH_MS,
  acknowledgeAlert,
  applyDropTrackToId,
  clearAcknowledgedAlert,
  clearScratchpad1,
  clearScratchpad2,
  createTrackDisplay,
  createTrackDisplayState,
  deriveScratchpads,
  filterActiveCaAlerts,
  formatApproachShorthand,
  getAlertVisualStatus,
  handleTrackClick,
  ensureTrackDisplay,
  isAlertAcknowledged,
  isCaPairInhibited,
  isIdentFlashing,
  isTrackQueried,
  makeCaPairKey,
  noteIdentAccepted,
  pruneCaPairInhibitsForTrack,
  setCaPairInhibited,
  setLeaderDirForSelection,
  setScratchpad,
  setScratchpad1,
  setScratchpad2,
  syncConflictAcknowledgmentState,
  syncTrackDisplays,
  toggleCaPairInhibited,
  toggleDatablockModeForSelection,
  toggleTrackPdbFdb,
} from "../trackDisplay";
import { sanitizeScratchpad, SCRATCHPAD_MAX_LEN } from "../datablock";

test("IDENT display flash is on within 1 s and off by 3 s sim", () => {
  const ac = makeTestAircraft({ id: "ac-ident" });
  const td = createTrackDisplay();
  expect(IDENT_DISPLAY_FLASH_MS).toBe(2000);
  applyIntent(ac, [{ type: "IDENT" }], 0);
  noteIdentAccepted(td, ac, 0);
  expect(isIdentFlashing(td, 0)).toBe(true);
  expect(isIdentFlashing(td, 1000)).toBe(true);
  expect(isIdentFlashing(td, 3000)).toBe(false);
});

test("a second IDENT retriggers the display pulse without changing kinematics", () => {
  const ac = makeTestAircraft({ id: "ac-ident2" });
  const heading = ac.headingDeg;
  const td = createTrackDisplay();
  applyIntent(ac, [{ type: "IDENT" }], 0);
  noteIdentAccepted(td, ac, 0);
  expect(isIdentFlashing(td, 2500)).toBe(false);
  applyIntent(ac, [{ type: "IDENT" }], 4000);
  noteIdentAccepted(td, ac, 4000);
  expect(isIdentFlashing(td, 4000)).toBe(true);
  expect(isIdentFlashing(td, 5500)).toBe(true);
  expect(isIdentFlashing(td, 7000)).toBe(false);
  expect(ac.headingDeg).toBe(heading);
  expect(ac.intent.assignedHeadingDeg).toBe(heading);
});

test("despawned aircraft drop their history buffer", () => {
  const ac = makeTestAircraft({ id: "ac-live" });
  const world = createWorld({ aircraft: [ac], simTimeMs: 0 });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  expect(tracks.has("ac-live")).toBe(true);
  expect(tracks.get("ac-live")!.history.timesSimMs).toHaveLength(1);
  world.aircraft = [];
  syncTrackDisplays(tracks, world);
  expect(tracks.size).toBe(0);
});

test("sync samples from the render path and never writes Aircraft kinematics fields", () => {
  const ac = makeTestAircraft({ id: "ac-sync", xNm: 1, yNm: 2, headingDeg: 90 });
  const x = ac.xNm;
  const y = ac.yNm;
  const world = createWorld({ aircraft: [ac], simTimeMs: 0 });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  stepWorld(world, 1 / 20);
  expect(ac).not.toHaveProperty("history");
  expect(tracks.get("ac-sync")!.history.eastNm[0]).toBe(x);
  expect(tracks.get("ac-sync")!.history.northNm[0]).toBe(y);
});

test("new tracks default to a partial datablock for unowned and full for owned", () => {
  const unowned = makeTestAircraft({ id: "ac-unowned" });
  const world = createWorld({ aircraft: [unowned] });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  expect(tracks.get("ac-unowned")!.datablockMode).toBe("partial");
  expect(tracks.get("ac-unowned")!.leaderDir).toBe(8);
  expect(tracks.get("ac-unowned")!.ownership).toBe("unowned");
  expect(tracks.get("ac-unowned")!.scratchpad).toBe("");

  const owned = createTrackDisplay("owned");
  expect(owned.datablockMode).toBe("full");
  expect(owned.ownership).toBe("owned");
});

test("AC3 — scratchpad round-trips on display state and does not change Aircraft.intent", () => {
  const ac = makeTestAircraft({ id: "ac-spad", altitudeFt: 8000, speedKt: 220 });
  const world = createWorld({ aircraft: [ac] });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  const intentSnapshot = { ...ac.intent };

  expect(SCRATCHPAD_MAX_LEN).toBe(4);
  expect(sanitizeScratchpad("ab12")).toBe("AB12");
  expect(sanitizeScratchpad("toolong!!")).toBe("TOOL");
  expect(sanitizeScratchpad("a-b 9")).toBe("AB9");
  expect(sanitizeScratchpad("")).toBe("");

  setScratchpad(tracks, ac.id, "ab12");
  expect(tracks.get(ac.id)!.scratchpad).toBe("AB12");
  setScratchpad(tracks, ac.id, "hold!");
  expect(tracks.get(ac.id)!.scratchpad).toBe("HOLD");
  setScratchpad(tracks, ac.id, "");
  expect(tracks.get(ac.id)!.scratchpad).toBe("");

  expect(ac.intent).toEqual(intentSnapshot);
  expect(ac.intent.assignedHeadingDeg).toBe(ac.headingDeg);
  expect(ac.intent.assignedAltitudeFt).toBe(8000);
  expect(ac.altitudeFt).toBe(8000);
  expect(ac.speedKt).toBe(220);
});

test("T toggles the selected track only; with no selection it toggles all", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  tracks.get("ac-dal")!.datablockMode = "full";
  tracks.get("ac-aal")!.datablockMode = "full";

  world.selectedAircraftId = dal.id;
  toggleDatablockModeForSelection(tracks, world);
  expect(tracks.get("ac-dal")!.datablockMode).toBe("limited");
  expect(tracks.get("ac-aal")!.datablockMode).toBe("full");

  world.selectedAircraftId = null;
  toggleDatablockModeForSelection(tracks, world);
  expect(tracks.get("ac-dal")!.datablockMode).toBe("full");
  expect(tracks.get("ac-aal")!.datablockMode).toBe("limited");
});

test("leader dir applies to the selected track only; with no selection it applies to all", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  expect(tracks.get("ac-dal")!.leaderDir).toBe(8);
  expect(tracks.get("ac-aal")!.leaderDir).toBe(8);

  world.selectedAircraftId = dal.id;
  setLeaderDirForSelection(tracks, world, 6);
  expect(tracks.get("ac-dal")!.leaderDir).toBe(6);
  expect(tracks.get("ac-aal")!.leaderDir).toBe(8);

  world.selectedAircraftId = null;
  setLeaderDirForSelection(tracks, world, 1);
  expect(tracks.get("ac-dal")!.leaderDir).toBe(1);
  expect(tracks.get("ac-aal")!.leaderDir).toBe(1);
});

test("AC2 — clicking unassociated target queries ground speed for 5 seconds", () => {
  const ac = makeTestAircraft({ id: "ac-ldb", callsign: "VFR12" });
  const world = createWorld({ aircraft: [ac], simTimeMs: 1000 });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  const td = tracks.get(ac.id)!;
  td.datablockMode = "limited";
  td.unassociated = true;

  expect(isTrackQueried(td, world.simTimeMs)).toBe(false);
  handleTrackClick(tracks, world, ac.id);
  expect(isTrackQueried(td, world.simTimeMs)).toBe(true);
  expect(isTrackQueried(td, 1000 + 4999)).toBe(true);
  expect(isTrackQueried(td, 1000 + 5000)).toBe(false);
});

test("AC4 — clicking unowned track toggles between PDB and Green FDB", () => {
  const ac = makeTestAircraft({ id: "ac-other", callsign: "SWA101" });
  const world = createWorld({ aircraft: [ac], simTimeMs: 0 });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  const td = tracks.get(ac.id)!;

  expect(td.ownership).toBe("unowned");
  expect(td.datablockMode).toBe("partial");

  handleTrackClick(tracks, world, ac.id);
  expect(td.datablockMode).toBe("full");
  expect(td.forcedFdb).toBe(true);

  handleTrackClick(tracks, world, ac.id);
  expect(td.datablockMode).toBe("partial");
  expect(td.forcedFdb).toBe(false);
});

test("post-TERM unassociated track cannot be expanded back to an FDB", () => {
  const ac = makeTestAircraft({ id: "ac-terminated", callsign: "UAL999" });
  const world = createWorld({ aircraft: [ac], selectedAircraftId: ac.id });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  const td = tracks.get(ac.id)!;
  td.unassociated = true;
  td.datablockMode = "partial";

  expect(toggleTrackPdbFdb(td)).toBe("partial");
  expect(td.forcedFdb).toBe(false);

  toggleDatablockModeForSelection(tracks, world);
  expect(td.datablockMode).toBe("partial");
  expect(td.forcedFdb).toBe(false);
});

test("T02-39: formatApproachShorthand maps approach types to standard STARS codes", () => {
  expect(formatApproachShorthand("ILS 27")).toBe("I27");
  expect(formatApproachShorthand("ILS 04R")).toBe("I04R");
  expect(formatApproachShorthand("kdem-ils27")).toBe("I27");
  expect(formatApproachShorthand("RNAV 22L")).toBe("R22L");
  expect(formatApproachShorthand("RNAV 28")).toBe("R28");
  expect(formatApproachShorthand("VISUAL 28")).toBe("V28");
  expect(formatApproachShorthand("LOC 09")).toBe("L09");
  expect(formatApproachShorthand("VOR 15")).toBe("O15");
  expect(formatApproachShorthand(undefined)).toBeUndefined();
  expect(formatApproachShorthand("")).toBeUndefined();
});

test("T02-39: deriveScratchpads auto-derives approach shorthand to SP1 and assigned speed to SP2 only when controller gave a speed", () => {
  const ac = makeTestAircraft({
    id: "ac-app",
    altitudeFt: 5000,
    speedKt: 210,
  });
  ac.intent.assignedAltitudeFt = 5000;
  ac.intent.assignedSpeedKt = 210;
  ac.intent.clearedApproachId = "ILS 27";

  const td = createTrackDisplay("owned");

  // Default spawn / procedure speed: SP2 is empty
  let derived = deriveScratchpads(ac, td);
  expect(derived.sp1).toBe("I27");
  expect(derived.sp2).toBe("");
  expect(td.sp2).toBe("");

  // When controller assigns speed: SP2 derives S21
  ac.intent.controllerAssignedSpeedKt = 210;
  derived = deriveScratchpads(ac, td);
  expect(derived.sp1).toBe("I27");
  expect(derived.sp2).toBe("S21");
  expect(td.sp1).toBe("I27");
  expect(td.sp2).toBe("S21");
  expect(td.scratchpad).toBe("I27");
});

test("plan scratchpads override derived track scratchpads after flight-plan modification", () => {
  const ac = makeTestAircraft({ id: "ac-plan", callsign: "UAL123" });
  ac.flightPlan = { scratchpads: ["HI", "WEST"] };
  const td = createTrackDisplay();

  expect(deriveScratchpads(ac, td)).toEqual({ sp1: "HI", sp2: "WEST" });
});

test("T02-39: deriveScratchpads derives interim altitude to SP1 when no approach is set", () => {
  const ac = makeTestAircraft({
    id: "ac-alt",
    altitudeFt: 8000,
    speedKt: 180,
  });
  ac.intent.assignedAltitudeFt = 4000;
  ac.intent.controllerAssignedAltitudeFt = 4000;
  ac.intent.assignedSpeedKt = 180;
  ac.intent.controllerAssignedSpeedKt = 180;
  ac.intent.clearedApproachId = null;

  const td = createTrackDisplay("owned");
  const derived = deriveScratchpads(ac, td);

  expect(derived.sp1).toBe("040");
  expect(derived.sp2).toBe("S18");
  expect(td.sp1).toBe("040");
  expect(td.sp2).toBe("S18");
});

test("T02-39: manual scratchpads take precedence over auto-derivation and clearing restores auto-derivation", () => {
  const ac = makeTestAircraft({
    id: "ac-man",
    altitudeFt: 8000,
  });
  ac.intent.assignedAltitudeFt = 4000;
  ac.intent.controllerAssignedAltitudeFt = 4000;
  ac.intent.assignedSpeedKt = 210;
  ac.intent.controllerAssignedSpeedKt = 210;

  const tracks = new Map();
  const td = createTrackDisplay("owned");
  tracks.set(ac.id, td);

  setScratchpad1(tracks, ac.id, "HOLD");
  setScratchpad2(tracks, ac.id, "GATE");

  let derived = deriveScratchpads(ac, td);
  expect(derived.sp1).toBe("HOLD");
  expect(derived.sp2).toBe("GATE");

  clearScratchpad1(tracks, ac.id);
  clearScratchpad2(tracks, ac.id);

  derived = deriveScratchpads(ac, td);
  expect(derived.sp1).toBe("040");
  expect(derived.sp2).toBe("S21");
});

test("T02-113: makeCaPairKey canonicalizes pair keys in lexicographical order", () => {
  expect(makeCaPairKey("ac1", "ac2")).toBe("ac1|ac2");
  expect(makeCaPairKey("ac2", "ac1")).toBe("ac1|ac2");
  expect(makeCaPairKey("DAL2", "AAL1")).toBe("AAL1|DAL2");
  expect(makeCaPairKey("AAL1", "DAL2")).toBe("AAL1|DAL2");
  expect(makeCaPairKey("same", "same")).toBe("same|same");
});

test("T02-113: set/toggle/remove pair inhibits updates caInhibitedPairs correctly", () => {
  const state = createTrackDisplayState();
  expect(isCaPairInhibited(state, "AAL1", "DAL2")).toBe(false);

  // Set inhibit
  setCaPairInhibited(state, "DAL2", "AAL1", true);
  expect(isCaPairInhibited(state, "AAL1", "DAL2")).toBe(true);
  expect(isCaPairInhibited(state, "DAL2", "AAL1")).toBe(true);
  expect(state.caInhibitedPairs.has("AAL1|DAL2")).toBe(true);

  // Toggle off
  const toggledOff = toggleCaPairInhibited(state, "AAL1", "DAL2");
  expect(toggledOff).toBe(false);
  expect(isCaPairInhibited(state, "AAL1", "DAL2")).toBe(false);

  // Toggle on
  const toggledOn = toggleCaPairInhibited(state, "DAL2", "AAL1");
  expect(toggledOn).toBe(true);
  expect(isCaPairInhibited(state, "AAL1", "DAL2")).toBe(true);

  // Explicit remove
  setCaPairInhibited(state, "AAL1", "DAL2", false);
  expect(isCaPairInhibited(state, "AAL1", "DAL2")).toBe(false);
  expect(state.caInhibitedPairs.has("AAL1|DAL2")).toBe(false);
});

test("T02-113: acknowledge / clear acknowledge updates state and transitions visual status", () => {
  const state = createTrackDisplayState();

  expect(isAlertAcknowledged(state, "AAL1", "DAL2")).toBe(false);
  expect(getAlertVisualStatus(state, "AAL1", "DAL2")).toBe("alert");

  // Acknowledge alert
  acknowledgeAlert(state, "DAL2", "AAL1");
  expect(isAlertAcknowledged(state, "AAL1", "DAL2")).toBe(true);
  expect(isAlertAcknowledged(state, "DAL2", "AAL1")).toBe(true);
  expect(getAlertVisualStatus(state, "AAL1", "DAL2")).toBe("acknowledged");

  // If pair is also inhibited, visual status is inhibited
  setCaPairInhibited(state, "AAL1", "DAL2", true);
  expect(getAlertVisualStatus(state, "AAL1", "DAL2")).toBe("inhibited");
  setCaPairInhibited(state, "AAL1", "DAL2", false);

  // Clear acknowledge
  clearAcknowledgedAlert(state, "AAL1", "DAL2");
  expect(isAlertAcknowledged(state, "AAL1", "DAL2")).toBe(false);
  expect(getAlertVisualStatus(state, "AAL1", "DAL2")).toBe("alert");
});

test("T02-113: pairwise inhibit isolation — inhibiting (A, B) does not suppress (A, C) or (B, C)", () => {
  const acA = makeTestAircraft({ id: "acA", callsign: "AAL1" });
  const acB = makeTestAircraft({ id: "acB", callsign: "DAL2" });
  const acC = makeTestAircraft({ id: "acC", callsign: "UAL3" });
  const world = createWorld({ aircraft: [acA, acB, acC] });

  const state = createTrackDisplayState();
  const tdA = createTrackDisplay("owned");
  const tdB = createTrackDisplay("owned");
  const tdC = createTrackDisplay("owned");
  state.tracks!.set(acA.id, tdA);
  state.tracks!.set(acB.id, tdB);
  state.tracks!.set(acC.id, tdC);

  const alerts: CaAlert[] = [
    { callsignA: "AAL1", callsignB: "DAL2", severity: "alert", distNm: 1.0, deltaAltFt: 200 },
    { callsignA: "AAL1", callsignB: "UAL3", severity: "alert", distNm: 1.5, deltaAltFt: 300 },
    { callsignA: "DAL2", callsignB: "UAL3", severity: "alert", distNm: 2.0, deltaAltFt: 400 },
  ];

  // Inhibit pair (AAL1, DAL2)
  setCaPairInhibited(state, "acA", "acB", true);

  const filtered = filterActiveCaAlerts(alerts, world, state);
  expect(filtered).toHaveLength(2);
  expect(filtered.some((a) => a.callsignA === "AAL1" && a.callsignB === "DAL2")).toBe(false);
  expect(filtered.some((a) => a.callsignA === "AAL1" && a.callsignB === "UAL3")).toBe(true);
  expect(filtered.some((a) => a.callsignA === "DAL2" && a.callsignB === "UAL3")).toBe(true);
});

test("T02-113: single-track inhibit suppresses all alerts involving that track", () => {
  const acA = makeTestAircraft({ id: "acA", callsign: "AAL1" });
  const acB = makeTestAircraft({ id: "acB", callsign: "DAL2" });
  const acC = makeTestAircraft({ id: "acC", callsign: "UAL3" });
  const world = createWorld({ aircraft: [acA, acB, acC] });

  const state = createTrackDisplayState();
  const tdA = createTrackDisplay("owned");
  const tdB = createTrackDisplay("owned");
  const tdC = createTrackDisplay("owned");
  state.tracks!.set(acA.id, tdA);
  state.tracks!.set(acB.id, tdB);
  state.tracks!.set(acC.id, tdC);

  const alerts: CaAlert[] = [
    { callsignA: "AAL1", callsignB: "DAL2", severity: "alert", distNm: 1.0, deltaAltFt: 200 },
    { callsignA: "AAL1", callsignB: "UAL3", severity: "alert", distNm: 1.5, deltaAltFt: 300 },
    { callsignA: "DAL2", callsignB: "UAL3", severity: "alert", distNm: 2.0, deltaAltFt: 400 },
  ];

  // Set single-track inhibit on acA using inhibitCA
  tdA.inhibitCA = true;

  const filtered = filterActiveCaAlerts(alerts, world, state);
  // Both (AAL1, DAL2) and (AAL1, UAL3) must be suppressed; (DAL2, UAL3) remains active
  expect(filtered).toHaveLength(1);
  expect(filtered[0]!.callsignA).toBe("DAL2");
  expect(filtered[0]!.callsignB).toBe("UAL3");
});

test("T02-113: dropping or deleting a track prunes its pairwise inhibits and acknowledgments", () => {
  const state = createTrackDisplayState();
  setCaPairInhibited(state, "acA", "acB", true);
  setCaPairInhibited(state, "acA", "acC", true);
  setCaPairInhibited(state, "acB", "acC", true);
  acknowledgeAlert(state, "acA", "acB");
  acknowledgeAlert(state, "acB", "acC");

  expect(state.caInhibitedPairs.size).toBe(3);
  expect(state.acknowledgedAlertPairs.size).toBe(2);

  // Prune for track acA
  pruneCaPairInhibitsForTrack(state, "acA");

  expect(isCaPairInhibited(state, "acA", "acB")).toBe(false);
  expect(isCaPairInhibited(state, "acA", "acC")).toBe(false);
  expect(isCaPairInhibited(state, "acB", "acC")).toBe(true);
  expect(isAlertAcknowledged(state, "acA", "acB")).toBe(false);
  expect(isAlertAcknowledged(state, "acB", "acC")).toBe(true);
});

test("T02-113: applyDropTrackToId with caState automatically prunes pairwise inhibits", () => {
  const acA = makeTestAircraft({ id: "acA", callsign: "AAL1" });
  const acB = makeTestAircraft({ id: "acB", callsign: "DAL2" });
  const world = createWorld({ aircraft: [acA, acB] });

  const state = createTrackDisplayState();
  const tdA = createTrackDisplay("owned");
  const tdB = createTrackDisplay("owned");
  state.tracks!.set(acA.id, tdA);
  state.tracks!.set(acB.id, tdB);

  setCaPairInhibited(state, "acA", "acB", true);
  expect(isCaPairInhibited(state, "acA", "acB")).toBe(true);

  // Drop track acA with caState passed
  const result = applyDropTrackToId(state.tracks!, world, "acA", state);
  expect(result.applied).toBe(true);
  expect(tdA.ownership).toBe("unowned");
  expect(isCaPairInhibited(state, "acA", "acB")).toBe(false);
});

test("T02-113: syncTrackDisplays prunes inhibits when a track despawns", () => {
  const acA = makeTestAircraft({ id: "acA", callsign: "AAL1" });
  const acB = makeTestAircraft({ id: "acB", callsign: "DAL2" });
  const world = createWorld({ aircraft: [acA, acB] });

  const state = createTrackDisplayState();
  setCaPairInhibited(state, "acA", "acB", true);
  syncTrackDisplays(state.tracks!, world, undefined, state);
  expect(isCaPairInhibited(state, "acA", "acB")).toBe(true);

  // Despawn acA
  world.aircraft = [acB];
  syncTrackDisplays(state.tracks!, world, undefined, state);
  expect(state.tracks!.has("acA")).toBe(false);
  expect(isCaPairInhibited(state, "acA", "acB")).toBe(false);
});

test("T02-113: clearing conflict state automatically resets acknowledgment when separation is restored", () => {
  const acA = makeTestAircraft({ id: "acA", callsign: "AAL1" });
  const acB = makeTestAircraft({ id: "acB", callsign: "DAL2" });
  const world = createWorld({ aircraft: [acA, acB] });
  const state = createTrackDisplayState();

  const activeAlert: CaAlert = {
    callsignA: "AAL1",
    callsignB: "DAL2",
    severity: "alert",
    distNm: 1.0,
    deltaAltFt: 200,
  };
  world.alerts.ca = [activeAlert];

  // Acknowledge alert
  acknowledgeAlert(state, "AAL1", "DAL2");
  expect(isAlertAcknowledged(state, "AAL1", "DAL2")).toBe(true);

  // Separation restored -> alerts list empty
  world.alerts.ca = [];
  syncConflictAcknowledgmentState(state, world.alerts.ca, world);

  // Acknowledgment reset
  expect(isAlertAcknowledged(state, "AAL1", "DAL2")).toBe(false);

  // Fresh alert trips unacknowledged
  world.alerts.ca = [activeAlert];
  expect(isAlertAcknowledged(state, "AAL1", "DAL2")).toBe(false);
  expect(getAlertVisualStatus(state, "AAL1", "DAL2")).toBe("alert");
});

test("T02-113: filterActiveCaAlerts with forTone suppresses acknowledged alerts for audio", () => {
  const acA = makeTestAircraft({ id: "acA", callsign: "AAL1" });
  const acB = makeTestAircraft({ id: "acB", callsign: "DAL2" });
  const world = createWorld({ aircraft: [acA, acB] });
  const state = createTrackDisplayState();

  const alerts: CaAlert[] = [
    { callsignA: "AAL1", callsignB: "DAL2", severity: "alert", distNm: 1.0, deltaAltFt: 200 },
  ];

  // Without ack, alert passes for display and tone
  expect(filterActiveCaAlerts(alerts, world, state)).toHaveLength(1);
  expect(filterActiveCaAlerts(alerts, world, state, { forTone: true })).toHaveLength(1);

  // Acknowledge alert
  acknowledgeAlert(state, "AAL1", "DAL2");

  // Still active for display
  expect(filterActiveCaAlerts(alerts, world, state)).toHaveLength(1);
  // Suppressed for audible tone
  expect(filterActiveCaAlerts(alerts, world, state, { forTone: true })).toHaveLength(0);
});

test("CA tone remains active when only one aircraft side is acknowledged", () => {
  const acA = makeTestAircraft({ id: "acA", callsign: "AAL1" });
  const acB = makeTestAircraft({ id: "acB", callsign: "DAL2" });
  const world = createWorld({ aircraft: [acA, acB] });
  const state = createTrackDisplayState();
  const alerts: CaAlert[] = [
    { callsignA: "AAL1", callsignB: "DAL2", severity: "alert", distNm: 1, deltaAltFt: 200 },
  ];

  ensureTrackDisplay(state.tracks!, acA.id).caAcknowledged = true;
  expect(filterActiveCaAlerts(alerts, world, state, { forTone: true })).toHaveLength(1);

  ensureTrackDisplay(state.tracks!, acB.id).caAcknowledged = true;
  expect(filterActiveCaAlerts(alerts, world, state, { forTone: true })).toHaveLength(0);
});
