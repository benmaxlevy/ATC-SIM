import { describe, expect, it, test, vi } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import {
  parsePreviewCommand,
  idlePreviewArea,
  previewAreaIsLive,
  beginPreviewBufferEntry,
  formatPreviewReadout,
} from "../previewArea";
import { createScopeView } from "../scopeView";
import { handleScopeKeyDown } from "../scopeKeys";
import { handlePpiLeftClick } from "../ppi";
import { hasActiveUninhibitedConflict } from "../systemLists";

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

  it("CA K, CA P, and CA E accept all-slew target selection", () => {
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

    beginPreviewBufferEntry(view.preview, "CA E", 3000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
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
    expect(view.preview.armed?.type).toBe("caPairInhibit");
    expect(formatPreviewReadout(view.preview)).toBe("CA P ac1");

    // Click Track 2
    handlePpiLeftClick(view, world, 550, 400, 1000, 800);
    expect(view.preview.phase).toBe("idle");
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(true);
  });

  it("CA E <trk1> <trk2> directly removes pairwise inhibit", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100" });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200" });
    world.aircraft = [ac1, ac2];
    view.caInhibitedPairs.add("AAL100|DAL200");

    beginPreviewBufferEntry(view.preview, "CA E AAL100 DAL200", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);
    expect(view.preview.phase).toBe("idle");
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(false);
  });

  it("CA E <trk1> [Click Track 2] removes pairwise inhibit", () => {
    const world = createWorld();
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 0, yNm: 0 });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200", xNm: 2, yNm: 0 });
    world.aircraft = [ac1, ac2];
    view.caInhibitedPairs.add("AAL100|DAL200");

    beginPreviewBufferEntry(view.preview, "CA E AAL100", 1000);
    handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);

    expect(view.preview.phase).toBe("armed");
    expect(view.preview.armed?.type).toBe("caPairEnable");

    // Click Track 2
    handlePpiLeftClick(view, world, 550, 400, 1000, 800);
    expect(view.preview.phase).toBe("idle");
    expect(view.caInhibitedPairs.has("AAL100|DAL200")).toBe(false);
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

    // Conflict alert is acknowledged
    expect(view.acknowledgedAlertPairs.has("AAL100|DAL200")).toBe(true);
    expect(view.tracks.get("ac1")?.caAcknowledged).toBe(true);
    expect(view.tracks.get("ac2")?.caAcknowledged).toBe(true);

    // Audio alert tone is silenced
    expect(hasActiveUninhibitedConflict(world, view)).toBe(false);
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
    expect(formatPreviewReadout(view.preview)).toBe("CA E BOGUS INV");
  });
});
