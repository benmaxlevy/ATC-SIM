import { expect, test } from "vitest";
import { createWorld, makeTestAircraft, stepWorld } from "@core";
import { applyIntent } from "@pilot";
import {
  IDENT_DISPLAY_FLASH_MS,
  createTrackDisplay,
  clearScratchpad1,
  clearScratchpad2,
  deriveScratchpads,
  formatApproachShorthand,
  handleTrackClick,
  isIdentFlashing,
  isTrackQueried,
  noteIdentAccepted,
  setLeaderDirForSelection,
  setScratchpad,
  setScratchpad1,
  setScratchpad2,
  syncTrackDisplays,
  toggleDatablockModeForSelection,
} from "./trackDisplay";
import { sanitizeScratchpad, SCRATCHPAD_MAX_LEN } from "./datablock";

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

test("T02-39: deriveScratchpads auto-derives approach shorthand to SP1 and assigned speed to SP2", () => {
  const ac = makeTestAircraft({
    id: "ac-app",
    altitudeFt: 5000,
    speedKt: 210,
  });
  ac.intent.assignedAltitudeFt = 5000;
  ac.intent.assignedSpeedKt = 210;
  ac.intent.clearedApproachId = "ILS 27";

  const td = createTrackDisplay("owned");
  const derived = deriveScratchpads(ac, td);

  expect(derived.sp1).toBe("I27");
  expect(derived.sp2).toBe("S21");
  expect(td.sp1).toBe("I27");
  expect(td.sp2).toBe("S21");
  expect(td.scratchpad).toBe("I27");
});

test("T02-39: deriveScratchpads derives interim altitude to SP1 when no approach is set", () => {
  const ac = makeTestAircraft({
    id: "ac-alt",
    altitudeFt: 8000,
    speedKt: 180,
  });
  ac.intent.assignedAltitudeFt = 4000;
  ac.intent.assignedSpeedKt = 180;
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
  ac.intent.assignedSpeedKt = 210;

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
