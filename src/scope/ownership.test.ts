import { expect, test, vi } from "vitest";
import {
  SessionLog,
  acceptTowerHandoff,
  createAircraft,
  createWorld,
  handoffFor,
  makeTestAircraft,
  stepWorld,
  SIM_DT_S,
} from "@core";
import { handleRadioText } from "@pilot";
import { createWorldFromScenario, loadKdem } from "@scenario";
import {
  DROP_TRACK_HELP,
  INITIATE_TRACK_HELP,
  applyDropTrack,
  applyHandoffToSelection,
  applyInitiateTrack,
  applyTowerHandoffToSelection,
  applyTowerOwnership,
  ownershipStubChar,
  trackPaintColor,
} from "./ownership";
import { PALETTE } from "./palette";
import { handleScopeKeyDown } from "./scopeKeys";
import { createScopeView } from "./scopeView";
import {
  acceptInboundOnClick,
  applyDropTrackToSelection,
  applyInitiateTrackToSelection,
  createTrackDisplay,
  handleTrackClick,
  handleTrackMiddleClick,
  syncTrackDisplays,
} from "./trackDisplay";
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

test("AC6 — F3 does not emit command.accepted; heading still applies on an owned track", async () => {
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

  const result = await handleRadioText(world, "DAL123 H270", log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(tracks.get(dal.id)!.ownership).toBe("owned");
  expect(log.byType("command.accepted")).toHaveLength(1);
});

test("T04-16 — F3 on pending inbound accepts HO, paints owned, then H270 applies", async () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  world.selectedAircraftId = dal.id;
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  expect(handoffFor(world, dal.id).kind).toBe("inbound");
  expect(tracks.get(dal.id)!.ownership).toBe("unowned");

  applyInitiateTrackToSelection(tracks, world);
  expect(tracks.get(dal.id)!.ownership).toBe("owned");
  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });
  expect(world.sessionLog?.byType("handoff.inbound.accepted")).toHaveLength(1);
  expect(world.sessionLog?.byType("command.accepted") ?? []).toHaveLength(0);

  const log = new SessionLog();
  const result = await handleRadioText(world, "DAL123 H270", log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(log.byType("command.accepted")).toHaveLength(1);
});

test("AC8 / AC9 — ownership colors are not red; help is initiate-track color-only, not lock-on", () => {
  expect(PALETTE.owned.toLowerCase()).not.toBe("#ff0000");
  expect(PALETTE.unowned.toLowerCase()).not.toBe("#ff0000");
  expect(PALETTE.tower.toLowerCase()).not.toBe("#ff0000");
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

test("AC2 — Given a selected arrival on LOC/GS inside 5 NM, Shift+H initiates handoff to Tower", () => {
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

  const res = applyHandoffToSelection(view.tracks, world);
  expect(res).toEqual({ applied: true, target: "tower", hint: null });
  expect(dal.intent.lateral).toEqual({ type: "LANDING", approachId: "ILS27" });
  expect(view.tracks.get(dal.id)!.ownership).toBe("tower");
  expect(log.byType("handoff.tower")).toHaveLength(1);
});

test("AC3 — Given a selected climbing departure (altitude >= 5000 ft), Shift+H initiates handoff to Center", () => {
  const dep = createAircraft({
    id: "ac-dep",
    callsign: "SWA333",
    xNm: 10,
    yNm: 5,
    headingDeg: 90,
    altitudeFt: 5500,
    speedKt: 250,
  });
  dep.intent.vertical = { type: "VIA_SID", sidId: "DEM1" };
  dep.intent.lateral = {
    type: "PROCEDURE",
    sidId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["MISSD", "SNARF", "NORMA"],
  };

  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dep],
    catalog: kdemCatalog(),
    sessionLog: log,
    selectedAircraftId: dep.id,
  });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  const res = applyHandoffToSelection(view.tracks, world);
  expect(res).toEqual({ applied: true, target: "center", hint: null });
  expect(handoffFor(world, dep.id)).toEqual({ kind: "outbound", toSectorId: "C" });
  expect(view.tracks.get(dep.id)!.ownership).toBe("center");
  expect(ownershipStubChar("center")).toBe("C");
  expect(log.byType("handoff.center")).toHaveLength(1);
  expect(log.byType("handoff.outbound.initiated")).toHaveLength(1);
});

test("AC4 — When departure flies past the TRACON boundary (>28 NM), it is gracefully despawned and nav.departed is logged", () => {
  const dep = createAircraft({
    id: "ac-dep",
    callsign: "UAL444",
    xNm: 27.9,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 10000,
    speedKt: 250,
  });
  dep.intent.vertical = { type: "VIA_SID", sidId: "DEM1" };
  dep.intent.lateral = {
    type: "PROCEDURE",
    sidId: "DEM1",
    toFixIndex: 2,
    routeFixIds: ["MISSD", "SNARF", "NORMA"],
  };

  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dep],
    catalog: kdemCatalog(),
    sessionLog: log,
    selectedAircraftId: dep.id,
  });

  // Handoff to center first
  applyHandoffToSelection(new Map(), world);
  expect(handoffFor(world, dep.id)).toEqual({ kind: "outbound", toSectorId: "C" });

  // Move aircraft past 28 NM
  dep.xNm = 28.2;
  stepWorld(world, SIM_DT_S);

  // Verify graceful despawn
  expect(world.aircraft).toHaveLength(0);
  expect(world.selectedAircraftId).toBeNull();
  expect(handoffFor(world, dep.id)).toEqual({ kind: "none" });

  const completed = log.byType("handoff.outbound.completed");
  expect(completed).toHaveLength(1);
  expect(completed[0]?.callsign).toBe("UAL444");
  expect(completed[0]?.toSectorId).toBe("C");

  const departed = log.byType("nav.departed");
  expect(departed).toHaveLength(1);
  expect(departed[0]?.callsign).toBe("UAL444");
});

test("T02-37 AC1 — Inbound handoff displays as blinking white FDB; click accepts to solid white and sector ID", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  world.handoffs.set(dal.id, { kind: "inbound", fromSectorId: "C" });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  // Initial inbound pending state: mode is full, visual is white
  const td = view.tracks.get(dal.id)!;
  expect(td.ownership).toBe("unowned");
  expect(handoffFor(world, dal.id).kind).toBe("inbound");

  // Accept via click
  const accepted = acceptInboundOnClick(view.tracks, world, dal.id);
  expect(accepted).toBe(true);
  expect(td.ownership).toBe("owned");
  expect(td.datablockMode).toBe("full");
  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });
  expect(trackPaintColor(td.ownership)).toBe(PALETTE.owned);
});

test("T02-37 AC2 — Outbound accepted handoff 3-click state progression", () => {
  const dep = makeTestAircraft({ id: "ac-dep", callsign: "SWA333" });
  const world = createWorld({ aircraft: [dep], simTimeMs: 1000 });
  world.handoffs.set(dep.id, {
    kind: "outbound",
    toSectorId: "C",
    status: "accepted",
    acceptedAtSimMs: 1000,
  });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  const td = view.tracks.get(dep.id)!;
  expect(td.outboundFlashUntilSimMs).toBe(6000);
  expect(td.outboundClickStep).toBe(0);

  // 1st click: stops blinking (settles to solid white)
  handleTrackClick(view.tracks, world, dep.id);
  expect(td.outboundClickStep).toBe(1);
  expect(td.outboundFlashUntilSimMs).toBe(0);

  // 2nd click: turns datablock green (unowned green FDB)
  handleTrackClick(view.tracks, world, dep.id);
  expect(td.outboundClickStep).toBe(2);
  expect(td.ownership).toBe("unowned");
  expect(td.datablockMode).toBe("full");

  // 3rd click: collapses FDB to PDB
  handleTrackClick(view.tracks, world, dep.id);
  expect(td.outboundClickStep).toBe(3);
  expect(td.datablockMode).toBe("partial");
});

test("T02-37 AC3 / AC4 — Pointouts: incoming, accepting, rejecting (UN), and converting (**)", () => {
  const ac = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();

  // 1. Incoming pointout
  world.handoffs.set(ac.id, { kind: "pointout_inbound", fromSectorId: "C", status: "pending" });
  syncTrackDisplays(view.tracks, world);
  const td = view.tracks.get(ac.id)!;

  // Slew/click accepts into solid yellow FDB
  handleTrackClick(view.tracks, world, ac.id);
  expect(td.pointoutAccepted).toBe(true);
  expect(handoffFor(world, ac.id)).toMatchObject({ status: "accepted" });

  // Clicking again reverts to green
  handleTrackClick(view.tracks, world, ac.id);
  expect(td.pointoutAccepted).toBe(false);
  expect(td.ownership).toBe("unowned");

  // 2. Rejecting pointout: UN + click
  world.handoffs.set(ac.id, { kind: "pointout_inbound", fromSectorId: "C", status: "pending" });
  handleTrackClick(view.tracks, world, ac.id, "UN");
  expect(td.pointoutRejected).toBe(true);
  expect(handoffFor(world, ac.id)).toMatchObject({ status: "rejected" });

  // 3. Converting pointout to handoff: ** + click
  world.handoffs.set(ac.id, { kind: "pointout_inbound", fromSectorId: "C", status: "pending" });
  handleTrackClick(view.tracks, world, ac.id, "**");
  expect(td.ownership).toBe("owned");
  expect(td.datablockMode).toBe("full");
  expect(handoffFor(world, ac.id)).toEqual({ kind: "none" });
});

test("T02-37 AC5 — Middle-clicking a target toggles Cyan highlight (#00FFFF)", () => {
  const ac = makeTestAircraft({ id: "ac-1", callsign: "AAL100" });
  const world = createWorld({ aircraft: [ac] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  const td = view.tracks.get(ac.id)!;
  expect(td.highlighted).toBeFalsy();
  expect(PALETTE.highlight).toBe("#00FFFF");

  // First middle click: highlight on
  handleTrackMiddleClick(view.tracks, world, ac.id);
  expect(td.highlighted).toBe(true);

  // Second middle click: highlight off
  handleTrackMiddleClick(view.tracks, world, ac.id);
  expect(td.highlighted).toBe(false);
});
