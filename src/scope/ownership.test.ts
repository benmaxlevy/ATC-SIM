import { expect, test } from "vitest";
import { SessionLog, createWorld, makeTestAircraft } from "@core";
import { handleRadioText } from "@pilot";
import {
  DROP_TRACK_HELP,
  INITIATE_TRACK_HELP,
  applyDropTrack,
  applyInitiateTrack,
  ownershipStubChar,
  trackPaintColor,
} from "./ownership";
import { PALETTE } from "./palette";
import {
  applyDropTrackToSelection,
  applyInitiateTrackToSelection,
  createTrackDisplay,
  syncTrackDisplays,
} from "./trackDisplay";

test("AC1 — ownership reducer: F3 owns, F4 drops, already-owned F3 stays owned", () => {
  expect(applyInitiateTrack("unowned")).toBe("owned");
  expect(applyInitiateTrack("owned")).toBe("owned");
  expect(applyDropTrack("owned")).toBe("unowned");
  expect(applyDropTrack("unowned")).toBe("unowned");
});

test("AC2 — CSI-like stub is * unowned and G after F3; F4 returns *", () => {
  expect(ownershipStubChar("unowned")).toBe("*");
  expect(ownershipStubChar("owned")).toBe("G");
  expect(ownershipStubChar(applyInitiateTrack("unowned"))).toBe("G");
  expect(ownershipStubChar(applyDropTrack("owned"))).toBe("*");
});

test("spawned tracks are unowned green FDB; F3 paints only the selected track owned white", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  expect(tracks.get("ac-dal")!.ownership).toBe("unowned");
  expect(tracks.get("ac-aal")!.ownership).toBe("unowned");
  expect(trackPaintColor("unowned")).toBe(PALETTE.unowned);
  expect(trackPaintColor("owned")).toBe(PALETTE.owned);
  expect(PALETTE.unowned).toBe("#00FF00");
  expect(PALETTE.unowned.toUpperCase()).not.toBe("#DDDDDD");
  expect(PALETTE.owned).toBe("#FFFFFF");

  const noSel = applyInitiateTrackToSelection(tracks, world);
  expect(noSel.applied).toBe(false);
  expect(noSel.hint).toBe("NO SEL");
  expect(tracks.get("ac-dal")!.ownership).toBe("unowned");
  expect(tracks.get("ac-aal")!.ownership).toBe("unowned");

  world.selectedAircraftId = dal.id;
  expect(applyInitiateTrackToSelection(tracks, world).applied).toBe(true);
  expect(tracks.get("ac-dal")!.ownership).toBe("owned");
  expect(tracks.get("ac-aal")!.ownership).toBe("unowned");

  expect(applyInitiateTrackToSelection(tracks, world).applied).toBe(true);
  expect(tracks.get("ac-dal")!.ownership).toBe("owned");

  expect(applyDropTrackToSelection(tracks, world).applied).toBe(true);
  expect(tracks.get("ac-dal")!.ownership).toBe("unowned");
  expect(tracks.get("ac-aal")!.ownership).toBe("unowned");
});

test("AC6 — F3 does not emit command.accepted; heading still applies on an owned track", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    headingDeg: 90,
  });
  const world = createWorld({ aircraft: [dal] });
  world.selectedAircraftId = dal.id;
  const tracks = new Map();
  tracks.set(dal.id, createTrackDisplay());
  const log = new SessionLog();

  applyInitiateTrackToSelection(tracks, world);
  expect(tracks.get(dal.id)!.ownership).toBe("owned");
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(log.byType("command.rejected")).toHaveLength(0);
  expect(dal.intent.assignedHeadingDeg).toBe(90);

  const result = handleRadioText(world, "DAL123 H270", log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(tracks.get(dal.id)!.ownership).toBe("owned");
  expect(log.byType("command.accepted")).toHaveLength(1);
});

test("AC8 / AC9 — ownership colors are not red; help is initiate-track color-only, not lock-on", () => {
  expect(PALETTE.owned.toLowerCase()).not.toBe("#ff0000");
  expect(PALETTE.unowned.toLowerCase()).not.toBe("#ff0000");
  expect(PALETTE.selected.toLowerCase()).not.toBe("#ff0000");
  expect(trackPaintColor("owned")).toBe("#FFFFFF");
  expect(INITIATE_TRACK_HELP).toMatch(/initiate track/i);
  expect(INITIATE_TRACK_HELP).toMatch(/color only/i);
  expect(INITIATE_TRACK_HELP).toMatch(/not NAS/i);
  expect(INITIATE_TRACK_HELP).toMatch(/not browser find/i);
  expect(DROP_TRACK_HELP).toMatch(/trainer sugar/i);
  expect(DROP_TRACK_HELP).toMatch(/not STARS terminate/i);
  const help = `${INITIATE_TRACK_HELP} ${DROP_TRACK_HELP}`.toLowerCase();
  expect(help).not.toMatch(/lock-?on/);
  expect(help).not.toMatch(/\bclaim\b/);
  expect(help).not.toMatch(/\biff\b/);
});
