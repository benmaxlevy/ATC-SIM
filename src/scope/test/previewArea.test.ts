import { describe, expect, it, test, vi } from "vitest";
import { createFlightPlan, createWorld, makeTestAircraft } from "@core";
import {
  parsePreviewCommand,
  idlePreviewArea,
  previewAreaIsLive,
  beginPreviewBufferEntry,
  formatPreviewReadout,
  previewTrackingSlew,
  previewFlidMatchesSlew,
} from "../previewArea";
import { createScopeView } from "../scopeView";
import { handleScopeKeyDown } from "../scopeKeys";
import { handlePpiLeftClick } from "../ppi";
import { hasActiveUninhibitedConflict } from "../systemLists";
import { associateFlightPlanToTrack, getFlightPlanEntries } from "../systemLists";
import { ensureTrackDisplay, syncTrackDisplays } from "../trackDisplay";
import { parsePreviewCommand as parsePreviewBuffer } from "../previewParse";

function keyEvent(key: string, opts?: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) {
  return {
    key,
    ctrlKey: opts?.ctrlKey,
    shiftKey: opts?.shiftKey,
    altKey: opts?.altKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

test("idle preview is not live", () => {
  const idle = idlePreviewArea();
  expect(idle.phase).toBe("idle");
  expect(previewAreaIsLive(idle)).toBe(false);
});

test("T02-146 — MULTI FUNC M parses identity, field, and value", () => {
  expect(parsePreviewBuffer("*M DAL123 ACID UAL456")).toEqual({
    kind: "action",
    action: { type: "modifyFlightPlan", flid: "DAL123", field: "acid", value: "UAL456" },
  });
  expect(parsePreviewBuffer("*M DAL123 BCN 0701")).toMatchObject({
    kind: "action",
    action: { field: "assignedBeacon", value: "0701" },
  });
  expect(parsePreviewBuffer("*M DAL123 UNKNOWN X")).toEqual({ kind: "invalid", reason: "FORMAT" });
});

test("T02-146 corrective — parses beacon release and rejects invalid modify values", () => {
  expect(parsePreviewBuffer("*B DAL123")).toEqual({
    kind: "action",
    action: { type: "releaseAssignedBeacon", flid: "DAL123" },
  });
  expect(parsePreviewBuffer("*M DAL123 BCN /3")).toMatchObject({ kind: "action" });
  expect(parsePreviewBuffer("*M DAL123 ETA 2460E")).toEqual({ kind: "invalid", reason: "FORMAT" });
  expect(parsePreviewBuffer("*M DAL123 FIXES BOS")).toEqual({ kind: "invalid", reason: "FORMAT" });
  expect(parsePreviewBuffer("*M DAL123 SP ANAT")).toEqual({ kind: "invalid", reason: "ILL SCR" });
  expect(parsePreviewBuffer("*M DAL123 AALT A350")).toMatchObject({ kind: "action" });
});

test("T02-145: INIT CNTL identity matches an unassociated authoritative plan", () => {
  const plan = createFlightPlan({
    id: "fp-init",
    acid: "AAL123",
    assignedBeacon: "7022",
    fixes: [],
    scratchpads: [],
  });
  if (!plan.ok) throw new Error(plan.error.message);
  const world = createWorld({
    flightPlans: [plan.value],
  });
  const aircraft = makeTestAircraft({ id: "target-init", callsign: "1234", squawk: "1200" });
  world.aircraft.push(aircraft);
  const state = idlePreviewArea();
  state.flid = "AAL123";
  expect(previewFlidMatchesSlew(state, aircraft.id, world)).toBe(true);
});

test("T02-145: FL/TAB removes an associated plan but keeps pending plans", () => {
  const pending = createFlightPlan({
    id: "fp-list",
    acid: "DAL456",
    assignedBeacon: "7023",
    fixes: [],
    scratchpads: [],
  });
  if (!pending.ok) throw new Error(pending.error.message);
  const world = createWorld({ flightPlans: [pending.value] });
  const view = createScopeView();
  const aircraft = makeTestAircraft({ id: "target-list", callsign: "1234", squawk: "1200" });
  world.aircraft.push(aircraft);

  expect(getFlightPlanEntries(world, view).map((entry) => entry.callsign)).toContain("DAL456");
  expect(associateFlightPlanToTrack(world, view, 1, aircraft.id)).toBe(true);
  expect(getFlightPlanEntries(world, view).map((entry) => entry.callsign)).not.toContain("DAL456");
});

test("T02-120: *Q and *V are MULTI FUNC Preview slew actions", () => {
  expect(parsePreviewCommand("*Q")).toEqual({
    kind: "action",
    action: { type: "msawCurrentAlertInhibit" },
  });
  expect(parsePreviewCommand("*V")).toEqual({
    kind: "action",
    action: { type: "toggleMsawProcessing" },
  });
});

test("parsePreviewCommand: empty is incomplete; unknown is invalid", () => {
  expect(parsePreviewCommand("")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("B")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("HELLO")).toMatchObject({ kind: "invalid" });
});

test("B45 is a beacon block action", () => {
  const parsed = parsePreviewCommand("B45");
  expect(parsed.kind).toBe("action");
  if (parsed.kind === "action") {
    expect(parsed.action).toEqual({ type: "beaconBlock", digits: "45" });
  }
});

test("CRC STARS leader length and direction command parsing", () => {
  // /<0-7>
  expect(parsePreviewCommand("/2")).toEqual({
    kind: "action",
    action: { type: "setLeaderLength", lengthStep: 2, lengthPx: 24 },
  });
  expect(parsePreviewCommand("/0 DAL123")).toEqual({
    kind: "action",
    action: { type: "setLeaderLength", lengthStep: 0, lengthPx: 0, flid: "DAL123" },
  });

  // Direct <1-9> and <1-9>/<0-7>
  expect(parsePreviewCommand("8")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 8 },
  });
  expect(parsePreviewCommand("8 DAL123")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 8, flid: "DAL123" },
  });
  expect(parsePreviewCommand("8/3")).toEqual({
    kind: "action",
    action: { type: "setLeaderDirAndLength", dir: 8, lengthStep: 3, lengthPx: 36 },
  });
  expect(parsePreviewCommand("8/3 DAL123")).toEqual({
    kind: "action",
    action: { type: "setLeaderDirAndLength", dir: 8, lengthStep: 3, lengthPx: 36, flid: "DAL123" },
  });

  // *L(1-9)
  expect(parsePreviewCommand("*L6")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 6, scope: "allOwned" },
  });
  expect(parsePreviewCommand("*L6 DAL123")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 6, flid: "DAL123" },
  });
  expect(parsePreviewCommand("*L6*")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 6, scope: "allUnowned" },
  });
  expect(parsePreviewCommand("*L6U")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 6, scope: "allUnassociated" },
  });
  expect(parsePreviewCommand("*L8/2")).toEqual({
    kind: "action",
    action: { type: "setLeaderDirAndLength", dir: 8, lengthStep: 2, lengthPx: 24 },
  });
  expect(parsePreviewCommand("*L8/2 DAL123")).toEqual({
    kind: "action",
    action: { type: "setLeaderDirAndLength", dir: 8, lengthStep: 2, lengthPx: 24, flid: "DAL123" },
  });

  // *LDR <0-7>
  expect(parsePreviewCommand("*LDR 4")).toEqual({
    kind: "action",
    action: { type: "setDefaultLeaderLength", lengthStep: 4, lengthPx: 48 },
  });
});

test("STARS authorized system list commands parse correctly", () => {
  expect(parsePreviewCommand("* P").kind).toBe("incomplete");
  expect(parsePreviewCommand("*P").kind).toBe("incomplete");

  // *S relocate SSA
  expect(parsePreviewCommand("*S")).toEqual({
    kind: "action",
    action: { type: "armRelocateList", listId: "SSA" },
  });

  // *T toggle TAB list, resize, and reset
  expect(parsePreviewCommand("*T")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "FL" },
  });
  expect(parsePreviewCommand("*T 15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "FL", maxLines: 15 },
  });
  expect(parsePreviewCommand("*T15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "FL", maxLines: 15 },
  });
  expect(parsePreviewCommand("*T D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "FL" },
  });
  expect(parsePreviewCommand("*TD")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "FL" },
  });

  // *TV toggle VFR list, resize, and reset
  expect(parsePreviewCommand("*TV")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "VL" },
  });
  expect(parsePreviewCommand("*TV 15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "VL", maxLines: 15 },
  });
  expect(parsePreviewCommand("*TV15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "VL", maxLines: 15 },
  });
  expect(parsePreviewCommand("*TV D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "VL" },
  });

  // *TM toggle LA/CA/MCI list and reset
  expect(parsePreviewCommand("*TM")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "AL" },
  });
  expect(parsePreviewCommand("*TM D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "AL" },
  });

  // *TC toggle COAST list, resize, and reset
  expect(parsePreviewCommand("*TC")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "COAST" },
  });
  expect(parsePreviewCommand("*TC 15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "COAST", maxLines: 15 },
  });
  expect(parsePreviewCommand("*TC15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "COAST", maxLines: 15 },
  });
  expect(parsePreviewCommand("*TC D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "COAST" },
  });

  // *TS toggle SIGN ON list and reset
  expect(parsePreviewCommand("*TS")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "SIGN_ON" },
  });
  expect(parsePreviewCommand("*TS D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "SIGN_ON" },
  });

  // *TX toggle VIDEO MAPS list and reset
  expect(parsePreviewCommand("*TX")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "ML" },
  });
  expect(parsePreviewCommand("*TX D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "ML" },
  });

  // *TN toggle CRDA STATUS list and reset
  expect(parsePreviewCommand("*TN")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "CRDA" },
  });
  expect(parsePreviewCommand("*TN D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "CRDA" },
  });

  // *P1, *P2, *P3 toggle TOWER lists, resize, and reset
  expect(parsePreviewCommand("*P1")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "TOWER_1" },
  });
  expect(parsePreviewCommand("*P2")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "TOWER_2" },
  });
  expect(parsePreviewCommand("*P3")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "TOWER_3" },
  });
  expect(parsePreviewCommand("*P1 10")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "TOWER_1", maxLines: 10 },
  });
  expect(parsePreviewCommand("*P2 20")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "TOWER_2", maxLines: 20 },
  });
  expect(parsePreviewCommand("*P3 15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "TOWER_3", maxLines: 15 },
  });
  expect(parsePreviewCommand("*P1 D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "TOWER_1" },
  });
  expect(parsePreviewCommand("*P2 D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "TOWER_2" },
  });
  expect(parsePreviewCommand("*P3 D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "TOWER_3" },
  });

  // *S D reset SSA
  expect(parsePreviewCommand("*S D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "SSA" },
  });
  expect(parsePreviewCommand("*SD")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "SSA" },
  });
});

test("STARS system list command aliases are strictly rejected as invalid", () => {
  const rejectedAliases = [
    "*FL",
    "*FL10",
    "*FL 25",
    "*FL D",
    "*FLD",
    "*TAB",
    "*TAB 10",
    "*TAB D",
    "*FPL",
    "*VL",
    "*VL10",
    "*VL 25",
    "*VL D",
    "*VLD",
    "*VFR",
    "*TL",
    "*TL D",
    "*TLD",
    "*TL1",
    "*TLBED",
    "*TLBED 10",
    "*TLBOS",
    "*ML",
    "*ML D",
    "*MLD",
    "*AL",
    "*AL D",
    "*ALD",
    "*CR",
    "*CR D",
    "*CRD",
    "*CRDA",
    "*CRDA D",
    "*CS",
    "*CS D",
    "*CSD",
    "*COAST",
    "*COAST D",
    "*SO",
    "*SO D",
    "*SOD",
    "*SIGN_ON",
    "*SIGN_ON D",
    "*SSA",
    "*SSA D",
    "*SSAD",
  ];

  for (const alias of rejectedAliases) {
    expect(parsePreviewCommand(alias).kind, `Command ${alias} must be invalid`).toBe("invalid");
  }
});

describe("T02-114: Conflict Alert (CA) preview grammar & slew execution", () => {
  it("CA K <trk> toggles single-track inhibit", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac = makeTestAircraft({ id: "ac1", callsign: "AAL100" });
    world.aircraft = [ac];

    // Toggle on
    beginPreviewBufferEntry(view.preview, "CA K AAL100", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.preview.phase).toBe("idle");
    expect(view.tracks.get("ac1")?.caInhibited).toBe(true);
    expect(view.tracks.get("ac1")?.inhibitCA).toBe(true);

    // Toggle off
    beginPreviewBufferEntry(view.preview, "CA K AAL100", 2000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.tracks.get("ac1")?.caInhibited).toBe(false);
    expect(view.tracks.get("ac1")?.inhibitCA).toBe(false);
  });

  it("CA K and CA P accept all-slew target selection", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    world.aircraft = [ac1, ac2];

    beginPreviewBufferEntry(view.preview, "CA K", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.preview.armed?.type).toBe("caSingleTrackInhibit");
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    expect(view.tracks.get(ac1.id)?.caInhibited).toBe(true);

    beginPreviewBufferEntry(view.preview, "CA P", 2000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    handlePpiLeftClick(view, world, 550, 400, 1000, 800);
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(true);

    beginPreviewBufferEntry(view.preview, "CA P", 3000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    handlePpiLeftClick(view, world, 550, 400, 1000, 800);
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(false);
  });

  it("CA K and CA P slew directly without Enter", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    world.aircraft = [ac1, ac2];

    beginPreviewBufferEntry(view.preview, "CA K", 1000);
    expect(previewTrackingSlew(view.preview)?.type).toBe("caSingleTrackInhibit");
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    expect(view.tracks.get(ac1.id)?.caInhibited).toBe(true);

    beginPreviewBufferEntry(view.preview, "CA P", 2000);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    handlePpiLeftClick(view, world, 550, 400, 1000, 800);
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(true);

    beginPreviewBufferEntry(view.preview, "CA P", 3000);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    handlePpiLeftClick(view, world, 550, 400, 1000, 800);
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(false);
  });

  it("CA [ENTER] followed by two track clicks toggles pairwise inhibit", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    world.aircraft = [ac1, ac2];

    // Press F11 then Enter to initiate CA pair slew mode
    handleScopeKeyDown(keyEvent("F11"), view);
    expect(view.preview.buffer).toBe("CA ");
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);

    // Arms pair slew mode, displaying "CA"
    expect(view.preview.phase).toBe("armed");
    expect(view.preview.armed?.type).toBe("caPairSlew");
    expect(formatPreviewReadout(view.preview)).toBe("CA");

    // Click Track 1
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    expect(view.preview.phase).toBe("armed");
    expect(formatPreviewReadout(view.preview)).toBe("CA AAL100");

    // Click Track 2
    handlePpiLeftClick(view, world, 550, 400, 1000, 800);
    expect(view.preview.phase).toBe("idle");
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(true);

    // Repeat to toggle off
    handleScopeKeyDown(keyEvent("F11"), view);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    handlePpiLeftClick(view, world, 550, 400, 1000, 800);
    expect(view.preview.phase).toBe("idle");
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(false);
  });

  it("CA [ENTER] plus one slew toggles the selected active CA pair", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    world.aircraft = [ac1, ac2];
    world.alerts.ca = [
      { callsignA: "AAL100", callsignB: "DAL200", severity: "alert", distNm: 1, deltaAltFt: 0 },
    ];

    beginPreviewBufferEntry(view.preview, "CA", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    expect(view.preview.phase).toBe("idle");
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(true);

    beginPreviewBufferEntry(view.preview, "CA", 2000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(false);
  });

  it("CA [ENTER] does not choose arbitrarily when MULT CONFL has two partners", () => {
    const world = createWorld();
    const view = createScopeView();
    const acA = makeTestAircraft({ id: "acA", callsign: "AAL100", xNm: 0, yNm: 0 });
    const acB = makeTestAircraft({ id: "acB", callsign: "DAL200", xNm: 2, yNm: 0 });
    const acC = makeTestAircraft({ id: "acC", callsign: "UAL300", xNm: -2, yNm: 0 });
    world.aircraft = [acA, acB, acC];
    world.alerts.ca = [
      {
        callsignA: "AAL100",
        callsignB: "DAL200",
        severity: "alert",
        distNm: 1,
        deltaAltFt: 0,
      },
      {
        callsignA: "AAL100",
        callsignB: "UAL300",
        severity: "alert",
        distNm: 1,
        deltaAltFt: 0,
      },
    ];

    beginPreviewBufferEntry(view.preview, "CA", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    expect(view.preview.phase).toBe("armed");
    expect(view.caInhibitedPairs.size).toBe(0);
  });

  it("CA P <trk1> <trk2> directly adds pairwise inhibit", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100" });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200" });
    world.aircraft = [ac1, ac2];

    beginPreviewBufferEntry(view.preview, "CA P AAL100 DAL200", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.preview.phase).toBe("idle");
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(true);
  });

  it("CA P <trk1> [Click Track 2] adds pairwise inhibit", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    world.aircraft = [ac1, ac2];

    beginPreviewBufferEntry(view.preview, "CA P AAL100", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);

    // Armed waiting for track 2 click
    expect(view.preview.phase).toBe("armed");
    expect(view.preview.armed?.type).toBe("caPairToggle");
    expect(formatPreviewReadout(view.preview)).toBe("CA P ac1");

    // Click Track 2
    handlePpiLeftClick(view, world, 550, 400, 1000, 800);
    expect(view.preview.phase).toBe("idle");
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(true);
  });

  it("CA P <trk1> <trk2> toggles an inhibited pair back on", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100" });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200" });
    world.aircraft = [ac1, ac2];
    view.caInhibitedPairs.add("AAL100|DAL200");

    beginPreviewBufferEntry(view.preview, "CA P AAL100 DAL200", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.preview.phase).toBe("idle");
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(false);
  });

  it("CA P <trk1> [Click Track 2] toggles an inhibited pair back on", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    world.aircraft = [ac1, ac2];
    view.caInhibitedPairs.add("AAL100|DAL200");

    beginPreviewBufferEntry(view.preview, "CA P AAL100", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);

    expect(view.preview.phase).toBe("armed");
    expect(view.preview.armed?.type).toBe("caPairToggle");

    // Click Track 2
    handlePpiLeftClick(view, world, 550, 400, 1000, 800);
    expect(view.preview.phase).toBe("idle");
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(false);
  });

  it("CA C I/E and bare CA C affect only locally owned pairs", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    const ac3 = makeTestAircraft({ id: "ac3", callsign: "UAL300", xNm: 4, yNm: 0 });
    world.aircraft = [ac1, ac2, ac3];
    ensureTrackDisplay(view.tracks, "ac1").ownership = "owned";
    ensureTrackDisplay(view.tracks, "ac2").ownership = "owned";
    ensureTrackDisplay(view.tracks, "ac3").ownership = "unowned";
    view.caInhibitedPairs.add("AAL100|UAL300");

    beginPreviewBufferEntry(view.preview, "CA C I", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.caControllerOwnedPairsInhibited).toBe(true);
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(true);
    expect(view.caInhibitedPairs.has("AAL100|UAL300")).toBe(true);

    // A qualifying pair introduced after CA C I remains governed by the setting.
    const ac4 = makeTestAircraft({ id: "ac4", callsign: "BOS400", xNm: 6, yNm: 0 });
    world.aircraft.push(ac4);
    ensureTrackDisplay(view.tracks, "ac4").ownership = "owned";
    world.alerts.ca = [
      { callsignA: "AAL100", callsignB: "BOS400", severity: "alert", distNm: 1, deltaAltFt: 0 },
    ];
    expect(hasActiveUninhibitedConflict(world, view)).toBe(false);

    beginPreviewBufferEntry(view.preview, "CA C E", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.caControllerOwnedPairsInhibited).toBe(false);
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(false);
    expect(view.caInhibitedPairs.has("AAL100|UAL300")).toBe(true);

    beginPreviewBufferEntry(view.preview, "CA C", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.caControllerOwnedPairsInhibited).toBe(true);
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(true);
  });

  it("clicking an alerted track with empty preview buffer acknowledges the alert immediately", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    world.aircraft = [ac1, ac2];
    world.alerts = {
      ca: [
        {
          callsignA: "AAL100",
          callsignB: "DAL200",
          severity: "alert",
          distNm: 0.5,
          deltaAltFt: 0,
        },
      ],
      msaw: [],
      atpa: [],
    };

    // Before ack: audible conflict alert is active
    expect(hasActiveUninhibitedConflict(world, view)).toBe(true);
    expect(view.tracks.get("ac1")?.caAcknowledged).toBeUndefined();

    // Empty preview buffer -> Left-click alerted track ac1
    expect(view.preview.phase).toBe("idle");
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);

    // Only clicked aircraft side is acknowledged; other side remains audible.
    expect(view.acknowledgedAlertPairs.has("AAL100|DAL200")).toBe(false);
    expect(view.tracks.get("ac1")?.caAcknowledged).toBe(true);
    expect(view.tracks.get("ac2")?.caAcknowledged).toBeUndefined();

    // Other side keeps CA tone active.
    expect(hasActiveUninhibitedConflict(world, view)).toBe(true);

    ensureTrackDisplay(view.tracks, ac2.id).caAcknowledged = true;
    expect(hasActiveUninhibitedConflict(world, view)).toBe(false);
  });

  it("clicking an LA/CA track with empty preview buffer acknowledges both indicators", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    world.aircraft = [ac1, ac2];
    world.alerts = {
      ca: [
        {
          callsignA: "AAL100",
          callsignB: "DAL200",
          severity: "alert",
          distNm: 0.5,
          deltaAltFt: 0,
        },
      ],
      msaw: [{ callsign: "AAL100", severity: "alert", altFt: 1500, floorFt: 2000 }],
      atpa: [],
    };

    handlePpiLeftClick(view, world, 500, 400, 1000, 800);

    expect(view.tracks.get(ac1.id)?.caAcknowledged).toBe(true);
    expect(view.tracks.get(ac1.id)?.msawAcknowledged).toBe(true);
  });

  it("T02-120: *Q suppresses only this LA alert and *V persistently toggles processing", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac = makeTestAircraft({ id: "ac-qv", callsign: "AAL100", xNm: 0, yNm: 0 });
    world.aircraft = [ac];
    world.alerts = {
      ca: [],
      msaw: [{ callsign: ac.callsign, severity: "alert", altFt: 1500, floorFt: 2000 }],
      atpa: [],
    };
    ensureTrackDisplay(view.tracks, ac.id).ownership = "owned";

    beginPreviewBufferEntry(view.preview, "*Q", 1000);
    expect(previewTrackingSlew(view.preview)?.type).toBe("msawCurrentAlertInhibit");
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    expect(view.tracks.get(ac.id)?.msawCurrentAlertInhibited).toBe(true);

    // A clear releases Q; a later alert is therefore visible again.
    world.alerts.msaw = [];
    syncTrackDisplays(view.tracks, world);
    expect(view.tracks.get(ac.id)?.msawCurrentAlertInhibited).toBe(false);

    beginPreviewBufferEntry(view.preview, "*V", 2000);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    expect(view.tracks.get(ac.id)?.msawProcessingInhibited).toBe(true);
    beginPreviewBufferEntry(view.preview, "*V", 3000);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    expect(view.tracks.get(ac.id)?.msawProcessingInhibited).toBe(false);
  });

  it("T02-120: Q rejects an unowned or non-alerting selection without mutation", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac = makeTestAircraft({ id: "ac-invalid-q", callsign: "AAL100", xNm: 0, yNm: 0 });
    world.aircraft = [ac];
    world.alerts = { ca: [], msaw: [], atpa: [] };
    beginPreviewBufferEntry(view.preview, "*Q", 1000);
    handlePpiLeftClick(view, world, 500, 400, 1000, 800);
    expect(view.tracks.get(ac.id)?.msawCurrentAlertInhibited).toBeUndefined();
    expect(view.preview.rejection).toBe("*Q INV");
  });

  it("clicking an alerted track when preview buffer is NOT empty does not acknowledge alert", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    world.aircraft = [ac1, ac2];
    world.alerts = {
      ca: [
        {
          callsignA: "AAL100",
          callsignB: "DAL200",
          severity: "alert",
          distNm: 0.5,
          deltaAltFt: 0,
        },
      ],
      msaw: [],
      atpa: [],
    };

    // Buffer has active text (e.g. typing beacon code)
    beginPreviewBufferEntry(view.preview, "B45", 1000);
    expect(view.preview.buffer).toBe("B45");

    handlePpiLeftClick(view, world, 500, 400, 1000, 800);

    // Not acknowledged
    expect(view.acknowledgedAlertPairs.has("AAL100|DAL200")).toBe(false);
    expect(hasActiveUninhibitedConflict(world, view)).toBe(true);
  });

  it("rejects invalid/nonexistent track IDs with INV flash", () => {
    const world = createWorld();
    const view = createScopeView();

    beginPreviewBufferEntry(view.preview, "CA K BOGUS", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.preview.phase).toBe("idle");
    expect(formatPreviewReadout(view.preview)).toBe("CA K BOGUS INV");

    beginPreviewBufferEntry(view.preview, "CA P BOGUS", 2000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.preview.phase).toBe("idle");
    expect(formatPreviewReadout(view.preview)).toBe("CA P BOGUS INV");

    beginPreviewBufferEntry(view.preview, "CA E BOGUS", 3000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.preview.phase).toBe("idle");
    expect(formatPreviewReadout(view.preview)).toMatch(/CA E BOGUS INV/);
  });
});
