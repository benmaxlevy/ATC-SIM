import { expect, test } from "vitest";
import { createWorld, makeTestAircraft, stepWorld } from "@core";
import { applyIntent } from "@pilot";
import {
  IDENT_DISPLAY_FLASH_MS,
  createTrackDisplay,
  isIdentFlashing,
  noteIdentAccepted,
  syncTrackDisplays,
  toggleDatablockModeForSelection,
  setLeaderDirForSelection,
} from "./trackDisplay";

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

test("new tracks default to a full datablock", () => {
  const ac = makeTestAircraft({ id: "ac-fdb" });
  const world = createWorld({ aircraft: [ac] });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  expect(tracks.get("ac-fdb")!.datablockMode).toBe("full");
  expect(tracks.get("ac-fdb")!.leaderDir).toBe(8);
  expect(tracks.get("ac-fdb")!.ownership).toBe("unowned");
});

test("T toggles the selected track only; with no selection it toggles all", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);

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
