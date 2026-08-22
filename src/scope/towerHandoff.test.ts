import { expect, test, vi } from "vitest";
import {
  SessionLog,
  acceptTowerHandoff,
  createAircraft,
  createWorld,
  stepWorld,
  SIM_DT_S,
} from "@core";
import { handleRadioText } from "@pilot";
import { PALETTE } from "./palette";
import { applyTowerOwnership, ownershipStubChar, trackPaintColor } from "./ownership";
import { handleScopeKeyDown } from "./scopeKeys";
import { createScopeView } from "./scopeView";
import { createTrackDisplay, syncTrackDisplays } from "./trackDisplay";
import { applyTowerHandoffToSelection } from "./towerHandoff";
import fixesJson from "../scenario/data/kdem/fixes.json";
import ilsJson from "../scenario/data/kdem/ils.json";
import ndbsJson from "../scenario/data/kdem/ndbs.json";
import vorsJson from "../scenario/data/kdem/vors.json";

const ILS27_APPROACH = {
  id: "ILS27",
  courseDeg: 270,
  lengthNm: 18,
  beamHalfWidthDeg: 2.5,
  thresholdFixId: "RW27",
  gsAngleDeg: 3,
  tchFt: 50,
  daFt: 200,
  missed: { headingDeg: 270, climbToFt: 3000, directFixId: "MISSD" },
} as const;

function kdemCatalog() {
  return {
    airportId: "KDEM",
    fieldElevFt: 0,
    navaids: [...vorsJson.vors, ...ndbsJson.ndbs, ...ilsJson.components],
    fixes: fixesJson.fixes,
    stars: [],
    approaches: [ILS27_APPROACH],
    sids: [],
  };
}

function locArrival() {
  const ac = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 4,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 1300,
    speedKt: 160,
  });
  ac.intent.lateral = { type: "LOC", approachId: "ILS27" };
  ac.intent.clearedApproachId = "ILS27";
  ac.intent.vertical = { type: "GS", approachId: "ILS27" };
  return ac;
}

function keyEvent(key: string, shiftKey = false) {
  return {
    key,
    shiftKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

test("AC5 — Shift+H handoff emits handoff.tower and no readback / command.accepted", async () => {
  const dal = locArrival();
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dal],
    catalog: kdemCatalog(),
    sessionLog: log,
    selectedAircraftId: dal.id,
  });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  const event = keyEvent("H", true);
  expect(handleScopeKeyDown(event, view, "radio", world)).toBe(true);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(dal.intent.lateral).toEqual({ type: "LANDING", approachId: "ILS27" });
  expect(dal.intent.landingCleared).toBe(true);
  expect(view.tracks.get(dal.id)!.ownership).toBe("tower");
  expect(log.byType("handoff.tower")).toHaveLength(1);
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(log.byType("command.rejected")).toHaveLength(0);

  const radio = await handleRadioText(world, "DAL123 H090", log);
  expect(radio.accepted).toBe(true);
  expect(log.byType("command.accepted")).toHaveLength(1);
  expect(log.byType("handoff.tower")).toHaveLength(1);
});

test("Shift+H does not toggle history; unmodified H still does when scope-focused", () => {
  const dal = locArrival();
  const world = createWorld({
    aircraft: [dal],
    catalog: kdemCatalog(),
    selectedAircraftId: dal.id,
  });
  const view = createScopeView();
  view.historyEnabled = true;
  syncTrackDisplays(view.tracks, world);

  expect(handleScopeKeyDown(keyEvent("H", true), view, "scope", world)).toBe(true);
  expect(view.historyEnabled).toBe(true);

  expect(handleScopeKeyDown(keyEvent("H", false), view, "scope", world)).toBe(true);
  expect(view.historyEnabled).toBe(false);
});

test("tower ownership color is cyan, not CA red, and stub is T", () => {
  expect(applyTowerOwnership("owned")).toBe("tower");
  expect(ownershipStubChar("tower")).toBe("T");
  expect(trackPaintColor("tower")).toBe(PALETTE.tower);
  expect(PALETTE.tower.toLowerCase()).not.toBe("#ff0000");
  expect(PALETTE.tower.toLowerCase()).not.toBe(PALETTE.caution.toLowerCase());
});

test("HO outside the 5 NM gate is a no-op", () => {
  const dal = locArrival();
  dal.xNm = 8;
  const world = createWorld({
    aircraft: [dal],
    catalog: kdemCatalog(),
    selectedAircraftId: dal.id,
  });
  const tracks = new Map([[dal.id, createTrackDisplay()]]);
  expect(applyTowerHandoffToSelection(tracks, world).applied).toBe(false);
  expect(dal.intent.lateral?.type).toBe("LOC");
  expect(tracks.get(dal.id)!.ownership).toBe("unowned");
});

test("strips tolerate a despawned id after landing", () => {
  const dal = locArrival();
  dal.xNm = 0.15;
  dal.altitudeFt = 80;
  dal.intent.landingCleared = true;
  dal.intent.lateral = { type: "LANDING", approachId: "ILS27" };
  const world = createWorld({
    aircraft: [dal],
    catalog: kdemCatalog(),
    selectedAircraftId: dal.id,
  });
  stepWorld(world, SIM_DT_S);
  expect(world.aircraft).toHaveLength(0);
  const tracks = new Map([[dal.id, createTrackDisplay()]]);
  syncTrackDisplays(tracks, world);
  expect(tracks.has(dal.id)).toBe(false);
  expect(trackPaintColor(tracks.get("missing")?.ownership ?? "unowned")).toBe(PALETTE.unowned);
});

test("acceptTowerHandoff helper stays off the radio pipeline", () => {
  const log = new SessionLog();
  const dal = locArrival();
  expect(acceptTowerHandoff(dal, { log, simTimeMs: 1 })).toBe(true);
  expect(log.byType("handoff.tower")[0]?.callsign).toBe("DAL123");
  expect(log.all().every((event) => event.type !== "command.accepted")).toBe(true);
});
