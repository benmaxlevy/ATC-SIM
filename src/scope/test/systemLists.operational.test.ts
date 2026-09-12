import { describe, expect, it } from "vitest";
import { createAircraft, createWorld, type Aircraft } from "@core";
import { createScopeView } from "../scopeView";
import {
  DEFAULT_ADAPTATION_ANCHORS,
  associateFlightPlanToTrack,
  buildAlertList,
  hasActiveUninhibitedConflict,
  buildTabFlightPlanList,
  buildTowerArrivalList,
  buildVfrList,
  deleteFlightPlanEntry,
  getFlightPlanEntries,
  handleFlightPlanListClick,
  handleVideoMapsListClick,
  relocateSystemList,
  resetSystemListToDefault,
  scrollFlightPlanList,
  setSystemListMaxLines,
  toggleSystemList,
  resolveTowerAirport,
} from "../systemLists";
import { buildVideoMapsListLines } from "../coordinationList";
import {
  isVideoMapOn,
  toggleGeoMapsList,
  toggleCurrentMapsList,
  clearAllVideoMaps,
} from "../dcb/dcbFunctions";
import { ensureTrackDisplay } from "../trackDisplay";
import { handlePpiLeftClick } from "../ppi";
import { handleScopeKeyDown, handleScopeKeyUp } from "../scopeKeys";
import { parsePreviewCommand } from "../previewParse";
import {
  beginPreviewBufferEntry,
  commitPreviewCommand,
  previewTrackingSlew,
  previewRelocateListId,
} from "../previewArea";
import { renderScope } from "../render/renderScope";

function makeTestAircraft(
  partial: Omit<Partial<Aircraft>, "intent"> & {
    id: string;
    callsign: string;
    flightRules?: string;
    intent?: Partial<Aircraft["intent"]>;
  },
): Aircraft {
  return {
    id: partial.id,
    callsign: partial.callsign,
    xNm: partial.xNm ?? 0,
    yNm: partial.yNm ?? 0,
    altitudeFt: partial.altitudeFt ?? 3000,
    headingDeg: partial.headingDeg ?? 90,
    speedKt: partial.speedKt ?? 180,
    squawk: partial.squawk ?? "1200",
    assignedSquawk: partial.assignedSquawk ?? "1200",
    aircraftType: partial.aircraftType ?? "B738",
    identUntilSimMs: 0,
    ...(partial.flightRules ? { flightRules: partial.flightRules } : {}),
    intent: {
      assignedAltitudeFt: 3000,
      assignedHeadingDeg: 90,
      assignedSpeedKt: 180,
      turn: "SHORTEST",
      clearedApproachId: null,
      expectedApproachId: null,
      locInterceptApproachId: null,
      ...partial.intent,
    },
  } as Aircraft;
}

function keyEvent(key: string, code = key): KeyboardEvent {
  return {
    key,
    code,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: null,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as KeyboardEvent;
}

describe("T02-105: Tower List (TL) & VFR List (VL) Sequences and Drop Interactions", () => {
  describe("1. Tower List (TL) Formatting & Lifecycle", () => {
    it("formats local tower header, active callsign, and ICAO aircraft type designator", () => {
      const world = createWorld();
      world.aircraft.push(
        makeTestAircraft({
          id: "ac-1",
          callsign: "AAL100",
          aircraftType: "CRJ7",
          xNm: 5,
          yNm: 0,
          altitudeFt: 2500,
          intent: { landingCleared: true },
        }),
        makeTestAircraft({
          id: "ac-2",
          callsign: "AAL506",
          aircraftType: "A319",
          xNm: 8,
          yNm: 0,
          altitudeFt: 3000,
          intent: { landingCleared: true },
        }),
        makeTestAircraft({
          id: "ac-3",
          callsign: "DAL628",
          aircraftType: "B736",
          xNm: 12,
          yNm: 0,
          altitudeFt: 4000,
          intent: { landingCleared: true },
        }),
      );

      const lines = buildTowerArrivalList(world, "BOS", 0, 0, 10);
      expect(lines[0]).toBe("BOS TOWER");
      expect(lines[1]).toBe("AAL100   CRJ7");
      expect(lines[2]).toBe("AAL506   A319");
      expect(lines[3]).toBe("DAL628   B736");
    });

    it("formats satellite tower header e.g. BED TOWER", () => {
      const world = createWorld();
      world.aircraft.push(
        makeTestAircraft({
          id: "ac-bed-1",
          callsign: "N12345",
          aircraftType: "C172",
          xNm: 2,
          yNm: 2,
          altitudeFt: 1500,
          intent: { landingCleared: true },
        }),
      );

      const lines = buildTowerArrivalList(world, "BED", 2, 2, 10);
      expect(lines[0]).toBe("BED TOWER");
      expect(lines[1]).toBe("N12345   C172");
    });

    it("dynamically populates when aircraft stage for departure", () => {
      const world = createWorld();
      world.scheduledDepartures = [
        {
          callsign: "AAL924",
          aircraftType: "E145",
          runwayId: "BOS04R",
          sidId: "BOSOX",
          assignedAltitudeFt: 5000,
          scheduledSimMs: 1000,
          spawned: false,
        },
      ];

      const lines = buildTowerArrivalList(world, "BOS", 0, 0, 10);
      expect(lines).toContain("AAL924   E145");
    });

    it("dynamically populates when aircraft hand off to tower and clears on roll-out or manual drop", () => {
      const world = createWorld();
      const ac = makeTestAircraft({
        id: "ac-arr-1",
        callsign: "EDV461",
        aircraftType: "CRJ2",
        xNm: 3,
        yNm: 0,
        altitudeFt: 1000,
        intent: { landingCleared: true },
      });
      world.aircraft.push(ac);

      // Active arrival on tower list
      let lines = buildTowerArrivalList(world, "BOS", 0, 0, 10);
      expect(lines).toContain("EDV461   CRJ2");

      // Roll-out / landed clears entry
      ac.altitudeFt = 0;
      lines = buildTowerArrivalList(world, "BOS", 0, 0, 10);
      expect(lines).not.toContain("EDV461   CRJ2");

      // Manual drop clears entry
      ac.altitudeFt = 1000;
      const dropped = new Set(["EDV461"]);
      lines = buildTowerArrivalList(world, "BOS", 0, 0, 10, dropped);
      expect(lines).not.toContain("EDV461   CRJ2");
    });

    it("filters arrivals by aircraft destination and sorts ascending by distance", () => {
      const world = createWorld();
      world.aircraft.push(
        createAircraft({
          id: "ac-far",
          callsign: "DAL450",
          aircraftType: "A321",
          xNm: 0,
          yNm: 45,
          headingDeg: 180,
          altitudeFt: 10000,
          speedKt: 250,
          destinationAirport: "KATL",
        }),
        createAircraft({
          id: "ac-near",
          callsign: "SWA210",
          aircraftType: "B738",
          xNm: 0,
          yNm: 15,
          headingDeg: 180,
          altitudeFt: 5000,
          speedKt: 210,
          destinationAirport: "KATL",
        }),
        createAircraft({
          id: "ac-mid",
          callsign: "AAL300",
          aircraftType: "B772",
          xNm: 0,
          yNm: 30,
          headingDeg: 180,
          altitudeFt: 8000,
          speedKt: 240,
          destinationAirport: "KATL",
        }),
        createAircraft({
          id: "ac-other",
          callsign: "SKW551",
          aircraftType: "CRJ9",
          xNm: 0,
          yNm: 10,
          headingDeg: 180,
          altitudeFt: 3000,
          speedKt: 190,
          destinationAirport: "KPDK",
        }),
      );

      // KATL Tower list: includes DAL450, SWA210, AAL300; excludes SKW551 (destination KPDK)
      const katlLines = buildTowerArrivalList(world, "KATL", 0, 0, 10);
      expect(katlLines[0]).toBe("KATL TOWER");
      // Sorted ascending by distance from (0,0): SWA210 (15 NM) -> AAL300 (30 NM) -> DAL450 (45 NM)
      expect(katlLines[1]).toBe("SWA210   B738");
      expect(katlLines[2]).toBe("AAL300   B772");
      expect(katlLines[3]).toBe("DAL450   A321");
      expect(katlLines).not.toContain(expect.stringContaining("SKW551"));

      // KPDK Tower list: includes SKW551
      const kpdkLines = buildTowerArrivalList(world, "KPDK", 0, 10, 10);
      expect(kpdkLines[0]).toBe("KPDK TOWER");
      expect(kpdkLines[1]).toBe("SKW551   CRJ9");
      expect(kpdkLines).not.toContain(expect.stringContaining("DAL450"));
    });

    it("displays arrival tracks > 30 NM away when destination matches", () => {
      const world = createWorld();
      world.aircraft.push(
        createAircraft({
          id: "ac-55nm",
          callsign: "JBU882",
          aircraftType: "A320",
          xNm: 40,
          yNm: 38, // ~55.17 NM away
          headingDeg: 220,
          altitudeFt: 12000,
          speedKt: 250,
          fp: { destination: "KATL" },
        }),
      );

      const lines = buildTowerArrivalList(world, "KATL", 0, 0, 10);
      expect(lines).toContain("JBU882   A320");
    });

    it("resolves Tower 1, 2, and 3 arrival airports with sensible fallbacks to facility and satellite airports", () => {
      const world = createWorld();
      (world as unknown as { catalog: unknown }).catalog = {
        airportId: "KATL",
        satelliteAirports: ["KFTY", "KPDK"],
      };

      // Case 1: Explicit towerAirports on ScopeView
      const viewWithExplicit = createScopeView(0, 0, {
        towerAirports: ["KATL", "KFTY", "KMGE"],
      });
      expect(resolveTowerAirport(viewWithExplicit, world, 0, "KATL")).toBe("KATL");
      expect(resolveTowerAirport(viewWithExplicit, world, 1, "KATL")).toBe("KFTY");
      expect(resolveTowerAirport(viewWithExplicit, world, 2, "KATL")).toBe("KMGE");

      // Case 2: Inferred from ssaWeatherAirports
      const viewWithWeather = createScopeView(0, 0, {
        ssaWeatherAirports: ["KATL", "KFTY", "KPDK", "KMGE", "KRYY"],
      });
      expect(resolveTowerAirport(viewWithWeather, world, 0, "KATL")).toBe("KATL");
      expect(resolveTowerAirport(viewWithWeather, world, 1, "KATL")).toBe("KFTY");
      expect(resolveTowerAirport(viewWithWeather, world, 2, "KATL")).toBe("KPDK");

      // Case 3: Fallback to catalog primary and satellite airports
      const viewDefault = createScopeView();
      expect(resolveTowerAirport(viewDefault, world, 0, "KATL")).toBe("KATL");
      expect(resolveTowerAirport(viewDefault, world, 1, "KATL")).toBe("KFTY");
      expect(resolveTowerAirport(viewDefault, world, 2, "KATL")).toBe("KPDK");
    });

    it("Tower 1, 2, and 3 can be independently positioned and configured", () => {
      const view = createScopeView();
      expect(view.systemLists.TL).toBeDefined();
      expect(view.systemLists.TOWER_2).toBeDefined();
      expect(view.systemLists.TOWER_3).toBeDefined();

      // Independent initial positions
      expect(view.systemLists.TL.y).toBe(0.02);
      expect(view.systemLists.TOWER_2.y).toBe(0.25);
      expect(view.systemLists.TOWER_3.y).toBe(0.48);

      // Relocate Tower 2 independently
      relocateSystemList(view, "TOWER_2", 0.5, 0.5);
      expect(view.systemLists.TOWER_2.x).toBe(0.5);
      expect(view.systemLists.TOWER_2.y).toBe(0.5);
      expect(view.systemLists.TL.x).toBe(0.75);
      expect(view.systemLists.TL.y).toBe(0.02);
    });
  });

  describe("2. Tower List Commands", () => {
    it("*P1 Enter toggles primary tower list", () => {
      const view = createScopeView();
      expect(view.systemLists.TL.visible).toBe(false);

      const parsed = parsePreviewCommand("*P1");
      expect(parsed.kind).toBe("action");
      if (parsed.kind === "action" && parsed.action.type === "toggleList") {
        expect(parsed.action.listId).toBe("TOWER_1");
      }

      toggleSystemList(view, "TL");
      expect(view.systemLists.TL.visible).toBe(true);

      toggleSystemList(view, "TL");
      expect(view.systemLists.TL.visible).toBe(false);
    });

    it("*P1, *P2, *P3 Enter toggle tower lists and support resize", () => {
      const parsedP1 = parsePreviewCommand("*P1");
      expect(parsedP1).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "TOWER_1" },
      });
      const parsedP2 = parsePreviewCommand("*P2");
      expect(parsedP2).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "TOWER_2" },
      });
      const parsedP3 = parsePreviewCommand("*P3");
      expect(parsedP3).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "TOWER_3" },
      });

      const parsedP1Resize = parsePreviewCommand("*P1 10");
      expect(parsedP1Resize).toEqual({
        kind: "action",
        action: { type: "resizeList", listId: "TOWER_1", maxLines: 10 },
      });
      const parsedP2Resize = parsePreviewCommand("*P2 20");
      expect(parsedP2Resize).toEqual({
        kind: "action",
        action: { type: "resizeList", listId: "TOWER_2", maxLines: 20 },
      });
      const parsedP3Resize = parsePreviewCommand("*P3 15");
      expect(parsedP3Resize).toEqual({
        kind: "action",
        action: { type: "resizeList", listId: "TOWER_3", maxLines: 15 },
      });
    });

    it("*P1 [Click] Enter repositions tower list anchor and *P1 D Enter resets", () => {
      const view = createScopeView();
      const world = createWorld();

      // 1. Type *P1 into preview
      beginPreviewBufferEntry(view.preview, "*P1", Date.now());
      expect(view.preview.buffer).toBe("*P1");

      // 2. Click scope canvas at (600, 400) on 1000x1000 canvas -> stages candidate (0.6, 0.4)
      handlePpiLeftClick(view, world, 600, 400, 1000, 1000);
      expect(view.stagedListAnchor).toEqual({ listId: "TOWER_1", x: 0.6, y: 0.4 });
      // Live coordinates are not mutated yet
      expect(view.systemLists.TL.x).toBe(0.75);

      // 3. Press Enter to commit staged anchor
      handleScopeKeyDown(keyEvent("Enter"), view, "scope", world, Date.now());
      expect(view.systemLists.TL.x).toBe(0.6);
      expect(view.systemLists.TL.y).toBe(0.4);
      expect(view.stagedListAnchor).toBeNull();
      expect(view.preview.phase).toBe("idle");

      // 4. *P1 D Enter resets to adaptation default
      const resetParsed = parsePreviewCommand("*P1 D");
      expect(resetParsed.kind).toBe("action");
      if (resetParsed.kind === "action" && resetParsed.action.type === "resetListPosition") {
        expect(resetParsed.action.listId).toBe("TOWER_1");
      }
      resetSystemListToDefault(view, "TL");
      expect(view.systemLists.TL.x).toBe(0.75);
      expect(view.systemLists.TL.y).toBe(0.02);
    });

    it("F1 then left-click list entry manually drops that entry from the tower list", () => {
      const view = createScopeView();
      const world = createWorld();

      // Configure active entry in tower list
      view.systemLists.TL.visible = true;
      view.activeListEntries = [
        {
          listId: "TL",
          rowIndex: 1,
          callsign: "AAL100",
          bounds: { x: 750, y: 40, width: 100, height: 16 },
        },
      ];

      // Press F1 -> arms drop mode
      handleScopeKeyDown(keyEvent("F1"), view, "scope", world, Date.now());
      expect(view.f1DropArmed).toBe(true);

      // Release F1 (drop mode remains armed until click)
      handleScopeKeyUp(keyEvent("F1"), view);
      expect(view.f1DropArmed).toBe(true);

      // Left-click the list entry row
      handlePpiLeftClick(view, world, 760, 45, 1000, 1000);

      // Entry dropped from tower list
      expect(view.towerListDroppedCallsigns?.has("AAL100")).toBe(true);
      expect(view.f1DropArmed).toBe(false);

      // Tower list output reflects manual drop
      world.aircraft.push(
        makeTestAircraft({
          id: "ac-1",
          callsign: "AAL100",
          aircraftType: "CRJ7",
          xNm: 5,
          yNm: 0,
          intent: { landingCleared: true },
        }),
      );
      const lines = buildTowerArrivalList(world, "BOS", 0, 0, 10, view.towerListDroppedCallsigns);
      expect(lines).not.toContain("AAL100   CRJ7");
    });
  });

  describe("3. VFR List (VL) Formatting & Fields", () => {
    it("formats VFR LIST header, callsign, 4-digit beacon code, and altitude hundreds", () => {
      const world = createWorld();
      world.aircraft.push(
        makeTestAircraft({
          id: "vfr-1",
          callsign: "N12345",
          squawk: "1200",
          assignedSquawk: "1200",
          altitudeFt: 4500,
        }),
        makeTestAircraft({
          id: "vfr-2",
          callsign: "N982B",
          squawk: "4215",
          assignedSquawk: "4215",
          altitudeFt: 2500,
          flightRules: "VFR",
        }),
      );

      const lines = buildVfrList(world, 10);
      expect(lines[0]).toBe("VFR LIST");
      expect(lines[1]).toBe("N12345  1200  045");
      expect(lines[2]).toBe("N982B   4215  025");
    });
  });

  describe("4. VFR List Commands", () => {
    it("*TV Enter and dedicated VFR key toggle VFR list visibility", () => {
      const view = createScopeView();
      expect(view.systemLists.VL.visible).toBe(false);

      // *TV Enter
      const parsed = parsePreviewCommand("*TV");
      expect(parsed.kind).toBe("action");
      if (parsed.kind === "action" && parsed.action.type === "toggleList") {
        expect(parsed.action.listId).toBe("VL");
      }

      toggleSystemList(view, "VL");
      expect(view.systemLists.VL.visible).toBe(true);

      // Dedicated VFR key toggles off
      const handled = handleScopeKeyDown(keyEvent("VFR"), view, "scope");
      expect(handled).toBe(true);
      expect(view.systemLists.VL.visible).toBe(false);
    });

    it("*TV [Click] Enter repositions VFR list anchor and *TV D Enter resets", () => {
      const view = createScopeView();
      const world = createWorld();

      // 1. Type *TV into preview
      beginPreviewBufferEntry(view.preview, "*TV", Date.now());
      expect(view.preview.buffer).toBe("*TV");

      // 2. Click scope canvas at (200, 500) on 1000x1000 canvas -> stages (0.2, 0.5)
      handlePpiLeftClick(view, world, 200, 500, 1000, 1000);
      expect(view.stagedListAnchor).toEqual({ listId: "VL", x: 0.2, y: 0.5 });
      expect(view.systemLists.VL.x).toBe(0.02);

      // 3. Press Enter to commit staged anchor
      handleScopeKeyDown(keyEvent("Enter"), view, "scope", world, Date.now());
      expect(view.systemLists.VL.x).toBe(0.2);
      expect(view.systemLists.VL.y).toBe(0.5);
      expect(view.stagedListAnchor).toBeNull();

      // 4. *TV D resets to default (0.02, 0.70)
      const resetParsed = parsePreviewCommand("*TV D");
      expect(resetParsed).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "VL" },
      });
      resetSystemListToDefault(view, "VL");
      expect(view.systemLists.VL.x).toBe(0.02);
      expect(view.systemLists.VL.y).toBe(0.7);
    });

    it("+[Index#] [Left-Click Radar Target] promotes / associates VFR entry to radar target", () => {
      const view = createScopeView();
      const world = createWorld();

      // Untracked radar target at (0, 0)
      const target = makeTestAircraft({
        id: "target-1",
        callsign: "UNTRK",
        xNm: 0,
        yNm: 0,
        squawk: "1200",
        altitudeFt: 4500,
      });

      // VFR list entry #1 at distance
      const vfrAc = makeTestAircraft({
        id: "vfr-plane",
        callsign: "N12345",
        xNm: 50,
        yNm: 50,
        squawk: "1200",
        altitudeFt: 4500,
      });
      world.aircraft.push(vfrAc, target);

      // Type "+1" into preview buffer
      beginPreviewBufferEntry(view.preview, "+1", Date.now());
      expect(view.preview.buffer).toBe("+1");

      // Scope view camera centered at (0, 0)
      view.camera.centerEastNm = 0;
      view.camera.centerNorthNm = 0;

      // Click on target at center of 1000x1000 canvas (500, 500)
      handlePpiLeftClick(view, world, 500, 500, 1000, 1000);

      // Target promoted/associated to VFR entry
      expect(target.callsign).toBe("N12345");
      const track = view.tracks.get("target-1");
      expect(track).toBeDefined();
      expect(track?.datablockMode).toBe("full");
      expect(track?.unassociated).toBe(false);
      expect(view.preview.phase).toBe("idle");

      // Entry removed from VFR list upon promotion
      expect(view.vfrListDroppedCallsigns?.has("N12345")).toBe(true);
      const lines = buildVfrList(world, 10, view.vfrListDroppedCallsigns, view.tracks);
      expect(lines).not.toContain("N12345  1200  045");
    });

    it("F1 then left-click list entry drops entry from the VFR list", () => {
      const view = createScopeView();
      const world = createWorld();

      view.systemLists.VL.visible = true;
      view.activeListEntries = [
        {
          listId: "VL",
          rowIndex: 1,
          callsign: "N982B",
          bounds: { x: 20, y: 720, width: 120, height: 16 },
        },
      ];

      // Press F1
      handleScopeKeyDown(keyEvent("F1"), view, "scope", world, Date.now());
      expect(view.f1DropArmed).toBe(true);

      // Click list entry
      handlePpiLeftClick(view, world, 30, 725, 1000, 1000);

      // Dropped from VFR list
      expect(view.vfrListDroppedCallsigns?.has("N982B")).toBe(true);
      expect(view.f1DropArmed).toBe(false);
    });
  });
});

describe("T02-104: Flight Plan List (FL) Buffering, Correlation & Pagination", () => {
  describe("1. Flight Plan Buffer Data Feed", () => {
    it("buffers pending/proposed departures and unassociated tracks", () => {
      const world = createWorld();
      const view = createScopeView();

      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 60000,
          spawned: false,
          index: 1,
        },
        {
          callsign: "AAL456",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "6412",
          scheduledSimMs: 120000,
          spawned: false,
          index: 2,
        },
        {
          callsign: "SWA789",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "3311",
          scheduledSimMs: 1000,
          spawned: true, // already spawned -> excluded from pending departures
        },
      ];

      // Add unassociated radar track
      const unassociatedAc = makeTestAircraft({
        id: "ac-uncorr",
        callsign: "DAL623",
        squawk: "2374",
        assignedSquawk: "2374",
      });
      world.aircraft.push(unassociatedAc);
      const tdUncorr = ensureTrackDisplay(view.tracks, unassociatedAc.id);
      tdUncorr.unassociated = true;

      // Add correlated owned track -> must be excluded
      const ownedAc = makeTestAircraft({
        id: "ac-owned",
        callsign: "UAL999",
        squawk: "1122",
        assignedSquawk: "1122",
      });
      world.aircraft.push(ownedAc);
      const tdOwned = ensureTrackDisplay(view.tracks, ownedAc.id);
      tdOwned.ownership = "owned";
      tdOwned.datablockMode = "full";
      tdOwned.unassociated = false;

      // Add VFR aircraft -> excluded from FL
      const vfrAc = makeTestAircraft({
        id: "ac-vfr",
        callsign: "N12345",
        squawk: "1200",
        assignedSquawk: "1200",
      });
      world.aircraft.push(vfrAc);

      const entries = getFlightPlanEntries(world, view);
      const callsigns = entries.map((e) => e.callsign);

      expect(callsigns).toContain("AAL123");
      expect(callsigns).toContain("AAL456");
      expect(callsigns).toContain("DAL623");
      expect(callsigns).not.toContain("SWA789");
      expect(callsigns).not.toContain("UAL999");
      expect(callsigns).not.toContain("N12345");
    });
  });

  describe("2. Text Formatting & Pagination Header", () => {
    it("formats header, columns, and MORE: X/Y pagination exactly matching specification", () => {
      const world = createWorld();
      const view = createScopeView();

      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 1000,
          index: 1,
        },
        {
          callsign: "AAL456",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "6412",
          scheduledSimMs: 2000,
          index: 2,
        },
        {
          callsign: "DAL623",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "2374",
          scheduledSimMs: 3000,
          index: 4,
        },
        {
          callsign: "DAL660",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "2374",
          scheduledSimMs: 4000,
          index: 9,
        },
        {
          callsign: "JBU301",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "4611",
          scheduledSimMs: 5000,
          index: 11,
        },
        {
          callsign: "JBU393",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "1660",
          scheduledSimMs: 6000,
          index: 0,
        },
        {
          callsign: "EXTRA1",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "5501",
          scheduledSimMs: 7000,
        },
        {
          callsign: "EXTRA2",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "5502",
          scheduledSimMs: 8000,
        },
        {
          callsign: "EXTRA3",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "5503",
          scheduledSimMs: 9000,
        },
        {
          callsign: "EXTRA4",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "5504",
          scheduledSimMs: 10000,
        },
        {
          callsign: "EXTRA5",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "5505",
          scheduledSimMs: 11000,
        },
        {
          callsign: "EXTRA6",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "5506",
          scheduledSimMs: 12000,
        },
      ];

      // Render with maxLines = 6
      const lines = buildTabFlightPlanList(world, 6, view);

      expect(lines[0]).toBe("FLIGHT PLAN");
      expect(lines[1]).toBe("MORE: 1/2");
      expect(lines[2]).toBe(" 1 AAL123  7022");
      expect(lines[3]).toBe(" 2 AAL456  6412");
      expect(lines[4]).toBe(" 4 DAL623  2374");
      expect(lines[5]).toBe(" 9 DAL660  2374");
      expect(lines[6]).toBe("11 JBU301  4611");
      expect(lines[7]).toBe(" 0 JBU393  1660");
      expect(lines).toHaveLength(8); // Title + MORE + 6 entries
    });

    it("omits MORE header when entries fit within maxLines", () => {
      const world = createWorld();
      const view = createScopeView();

      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 1000,
          index: 1,
        },
        {
          callsign: "AAL456",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "6412",
          scheduledSimMs: 2000,
          index: 2,
        },
      ];

      const lines = buildTabFlightPlanList(world, 10, view);
      expect(lines[0]).toBe("FLIGHT PLAN");
      expect(lines.some((l) => l.startsWith("MORE:"))).toBe(false);
      expect(lines[1]).toBe(" 1 AAL123  7022");
      expect(lines[2]).toBe(" 2 AAL456  6412");
      expect(lines).toHaveLength(3);
    });
  });

  describe("3. Event-driven Correlation & Purge", () => {
    it("does not correlate while building or rendering the flight-plan list", () => {
      const world = createWorld();
      const view = createScopeView();

      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 60000,
          spawned: false,
          index: 1,
        },
      ];

      // Before correlation, FL has AAL123
      const linesBefore = buildTabFlightPlanList(world, 10, view);
      expect(linesBefore.some((l) => l.includes("AAL123"))).toBe(true);

      // An unassociated radar target appears on scope squawking 7022
      const target = makeTestAircraft({
        id: "ac-raw-1",
        callsign: "1234",
        squawk: "7022",
        assignedSquawk: "7022",
      });
      world.aircraft.push(target);
      const td = ensureTrackDisplay(view.tracks, target.id);
      td.unassociated = true;
      td.datablockMode = "partial";
      td.ownership = "unowned";

      buildTabFlightPlanList(world, 10, view);
      expect(td.datablockMode).toBe("partial");
      expect(td.unassociated).toBe(true);
      expect(target.callsign).toBe("1234");
      expect(buildTabFlightPlanList(world, 10, view).some((l) => l.includes("AAL123"))).toBe(true);
    });

    it("does not automatically correlate non-discrete (1200 VFR) squawks", () => {
      const world = createWorld();
      const view = createScopeView();

      world.scheduledDepartures = [
        {
          callsign: "N12345",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "1200",
          scheduledSimMs: 60000,
          spawned: false,
          index: 1,
        },
      ];

      const target = makeTestAircraft({
        id: "ac-vfr-target",
        callsign: "N12345",
        squawk: "1200",
        assignedSquawk: "1200",
      });
      world.aircraft.push(target);
      const td = ensureTrackDisplay(view.tracks, target.id);
      td.unassociated = true;

      buildTabFlightPlanList(world, 10, view);
      expect(td.unassociated).toBe(true);
    });
  });

  describe("4. Commands & Interactive Controls", () => {
    it("*T Enter toggles FL visibility", () => {
      const view = createScopeView();
      expect(view.systemLists.FL?.visible).toBe(false);

      const parsedToggle = parsePreviewCommand("*T");
      expect(parsedToggle).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "FL" },
      });

      toggleSystemList(view, "FL");
      expect(view.systemLists.FL?.visible).toBe(true);

      toggleSystemList(view, "FL");
      expect(view.systemLists.FL?.visible).toBe(false);
    });

    it("dedicated FPL key toggles FL visibility", () => {
      const view = createScopeView();
      expect(view.systemLists.FL?.visible).toBe(false);

      handleScopeKeyDown(keyEvent("FPL"), view, "scope");
      expect(view.systemLists.FL?.visible).toBe(true);

      handleScopeKeyDown(keyEvent("FPL"), view, "scope");
      expect(view.systemLists.FL?.visible).toBe(false);
    });

    it("*T [Number] Enter sets visible capacity clamped to [1, 100]", () => {
      const view = createScopeView();

      const parsed10 = parsePreviewCommand("*T10");
      expect(parsed10).toEqual({
        kind: "action",
        action: { type: "resizeList", listId: "FL", maxLines: 10 },
      });

      const parsedSpaced = parsePreviewCommand("*T 25");
      expect(parsedSpaced).toEqual({
        kind: "action",
        action: { type: "resizeList", listId: "FL", maxLines: 25 },
      });

      setSystemListMaxLines(view, "FL", 25);
      expect(view.systemLists.FL?.maxLines).toBe(25);

      // Clamp test
      setSystemListMaxLines(view, "FL", 200);
      expect(view.systemLists.FL?.maxLines).toBe(100);

      setSystemListMaxLines(view, "FL", 0);
      expect(view.systemLists.FL?.maxLines).toBe(1);
    });

    it("scrolls pagination via PageDown/PageUp and clicking MORE: X/Y", () => {
      const world = createWorld();
      const view = createScopeView();
      toggleSystemList(view, "FL");
      setSystemListMaxLines(view, "FL", 2);

      world.scheduledDepartures = [
        {
          callsign: "AAL101",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7001",
          scheduledSimMs: 1000,
          index: 1,
        },
        {
          callsign: "AAL102",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7002",
          scheduledSimMs: 2000,
          index: 2,
        },
        {
          callsign: "AAL103",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7003",
          scheduledSimMs: 3000,
          index: 3,
        },
        {
          callsign: "AAL104",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7004",
          scheduledSimMs: 4000,
          index: 4,
        },
      ];

      // Page 1: AAL101, AAL102
      let lines = buildTabFlightPlanList(world, 2, view);
      expect(lines[1]).toBe("MORE: 1/2");
      expect(lines[2]).toContain("AAL101");
      expect(lines[3]).toContain("AAL102");

      // Page Down advances
      const scrolledDown = scrollFlightPlanList(view, 1, world);
      expect(scrolledDown).toBe(true);
      lines = buildTabFlightPlanList(world, 2, view);
      expect(lines[1]).toBe("MORE: 2/2");
      expect(lines[2]).toContain("AAL103");
      expect(lines[3]).toContain("AAL104");

      // Page Up retreats
      const scrolledUp = scrollFlightPlanList(view, -1, world);
      expect(scrolledUp).toBe(true);
      lines = buildTabFlightPlanList(world, 2, view);
      expect(lines[2]).toContain("AAL101");

      // Click MORE: X/Y advances
      // Line 0 = Title, Line 1 = MORE header
      handleFlightPlanListClick(view, world, 1);
      lines = buildTabFlightPlanList(world, 2, view);
      expect(lines[2]).toContain("AAL103");

      // Click MORE: X/Y at end cycles back to page 1
      handleFlightPlanListClick(view, world, 1);
      lines = buildTabFlightPlanList(world, 2, view);
      expect(lines[2]).toContain("AAL101");
    });

    it("direct track association: associateFlightPlanToTrack associates flight plan to target", () => {
      const world = createWorld();
      const view = createScopeView();
      toggleSystemList(view, "FL");

      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 1000,
          index: 1,
        },
      ];

      // Uncorrelated radar target on scope at (0, 0)
      const target = makeTestAircraft({
        id: "ac-tgt-1",
        callsign: "1234",
        squawk: "1200",
        xNm: 0,
        yNm: 0,
      });
      world.aircraft.push(target);
      const td = ensureTrackDisplay(view.tracks, target.id);
      td.unassociated = true;

      // Associate with target directly
      const success = associateFlightPlanToTrack(world, view, 1, target.id);
      expect(success).toBe(true);

      // Verify target updated to FDB with plan callsign and squawk
      expect(target.callsign).toBe("1234");
      expect(target.assignedSquawk).toBe("1200");
      expect(td.unassociated).toBe(false);
      expect(td.datablockMode).toBe("full");
      expect(td.ownership).toBe("unowned");

      // Entry immediately purged from FL
      const remaining = getFlightPlanEntries(world, view);
      expect(remaining.some((e) => e.callsign === "AAL123")).toBe(false);
    });

    it("+1 <click target> associates flight plan from list to target without changing leader direction", () => {
      const world = createWorld();
      const view = createScopeView();

      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 1000,
          index: 1,
        },
      ];

      const target = makeTestAircraft({
        id: "target-1",
        callsign: "UNTRK",
        xNm: 0,
        yNm: 0,
        squawk: "1200",
        altitudeFt: 4500,
      });
      world.aircraft.push(target);
      const td = ensureTrackDisplay(view.tracks, target.id);
      td.unassociated = true;
      td.leaderDir = 7;

      view.camera.centerEastNm = 0;
      view.camera.centerNorthNm = 0;

      // Type +1 into preview buffer
      beginPreviewBufferEntry(view.preview, "+1", Date.now());
      expect(view.preview.buffer).toBe("+1");

      // Click target at (500, 500)
      handlePpiLeftClick(view, world, 500, 500, 1000, 1000);

      expect(target.callsign).toBe("UNTRK");
      expect(target.assignedSquawk).toBe("1200");
      expect(td.unassociated).toBe(false);
      expect(td.datablockMode).toBe("full");
      expect(td.ownership).toBe("unowned");
      expect(td.leaderDir).toBe(7); // Leader direction preserved!
      expect(view.preview.phase).toBe("idle");
    });

    it("F3 1 <click target> associates flight plan from list to target without changing leader direction", () => {
      const world = createWorld();
      const view = createScopeView();

      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 1000,
          index: 1,
        },
      ];

      const target = makeTestAircraft({
        id: "target-1",
        callsign: "UNTRK",
        xNm: 0,
        yNm: 0,
        squawk: "1200",
        altitudeFt: 4500,
      });
      world.aircraft.push(target);
      const td = ensureTrackDisplay(view.tracks, target.id);
      td.unassociated = true;
      td.leaderDir = 7;

      view.camera.centerEastNm = 0;
      view.camera.centerNorthNm = 0;

      // Press F3 then type 1
      handleScopeKeyDown(keyEvent("F3"), view, "scope", world, 1000);
      expect(view.preview.armed?.type).toBe("initCntl");
      handleScopeKeyDown(keyEvent("1"), view, "scope", world, 1050);
      expect(view.preview.flid).toBe("1");

      // Click target
      handlePpiLeftClick(view, world, 500, 500, 1000, 1000);

      expect(target.callsign).toBe("UNTRK");
      expect(target.assignedSquawk).toBe("1200");
      expect(td.unassociated).toBe(false);
      expect(td.datablockMode).toBe("full");
      expect(td.ownership).toBe("unowned");
      expect(td.leaderDir).toBe(7);
      expect(view.preview.phase).toBe("idle");
    });

    it("<1-9><click target> sets leader direction reliably on all targets (uncorrelated and owned)", () => {
      const world = createWorld();
      const view = createScopeView();

      // Flight plan entry with index 1 exists in the system
      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 1000,
          index: 1,
        },
      ];

      const unassociated = makeTestAircraft({
        id: "uncorr-1",
        callsign: "UNTRK",
        xNm: 0,
        yNm: 0,
        squawk: "1200",
      });
      const owned = makeTestAircraft({
        id: "owned-1",
        callsign: "DAL456",
        xNm: 10,
        yNm: 10,
        squawk: "2345",
      });
      world.aircraft.push(unassociated, owned);

      const tdUncorr = ensureTrackDisplay(view.tracks, unassociated.id);
      tdUncorr.unassociated = true;
      tdUncorr.leaderDir = 7;

      const tdOwned = ensureTrackDisplay(view.tracks, owned.id);
      tdOwned.ownership = "owned";
      tdOwned.datablockMode = "full";
      tdOwned.leaderDir = 7;

      view.camera.centerEastNm = 0;
      view.camera.centerNorthNm = 0;

      // Type "1" into preview buffer and click unassociated target
      beginPreviewBufferEntry(view.preview, "1", Date.now());
      handlePpiLeftClick(view, world, 500, 500, 1000, 1000);

      // Should set leaderDir to 1 (SW), NOT associate the flight plan!
      expect(tdUncorr.leaderDir).toBe(1);
      expect(unassociated.callsign).toBe("UNTRK"); // Not associated to AAL123
      expect(tdUncorr.unassociated).toBe(true);

      // Center camera on owned target and type "3"
      view.camera.centerEastNm = 10;
      view.camera.centerNorthNm = 10;
      beginPreviewBufferEntry(view.preview, "3", Date.now());
      handlePpiLeftClick(view, world, 500, 500, 1000, 1000);
      expect(tdOwned.leaderDir).toBe(3);
    });

    it("direct track association rejects if target is already correlated/owned", () => {
      const world = createWorld();
      const view = createScopeView();

      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 1000,
          index: 1,
        },
      ];

      const target = makeTestAircraft({
        id: "ac-owned-1",
        callsign: "DAL555",
        squawk: "4411",
      });
      world.aircraft.push(target);
      const td = ensureTrackDisplay(view.tracks, target.id);
      td.ownership = "owned";
      td.datablockMode = "full";
      td.unassociated = false;

      const success = associateFlightPlanToTrack(world, view, 1, target.id);
      expect(success).toBe(false);
    });

    it("deletion via *DEL [Index#] Enter removes flight plan from queue", () => {
      const world = createWorld();
      const view = createScopeView();

      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 1000,
          index: 1,
        },
        {
          callsign: "DAL456",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "6412",
          scheduledSimMs: 2000,
          index: 2,
        },
      ];

      const parsed = parsePreviewCommand("*DEL 1");
      expect(parsed).toEqual({
        kind: "action",
        action: { type: "deleteFlightPlanEntry", index: 1 },
      });

      const deleted = deleteFlightPlanEntry(world, view, 1);
      expect(deleted).toBe(true);

      const entries = getFlightPlanEntries(world, view);
      expect(entries.some((e) => e.callsign === "AAL123")).toBe(false);
      expect(entries.some((e) => e.callsign === "DAL456")).toBe(true);
    });

    it("deletion via F1 then left-clicking list row removes flight plan from queue", () => {
      const world = createWorld();
      const view = createScopeView();
      toggleSystemList(view, "FL");

      world.scheduledDepartures = [
        {
          callsign: "AAL123",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "7022",
          scheduledSimMs: 1000,
          index: 1,
        },
        {
          callsign: "DAL456",
          runwayId: "27",
          sidId: "BOS1",
          assignedSquawk: "6412",
          scheduledSimMs: 2000,
          index: 2,
        },
      ];

      buildTabFlightPlanList(world, 10, view);

      // Press F1
      handleScopeKeyDown(keyEvent("F1"), view, "scope");
      expect(view.beaconatorActive).toBe(true);

      // Click row for AAL123 (Row 0: title, Row 1: AAL123)
      handleFlightPlanListClick(view, world, 1);

      const entries = getFlightPlanEntries(world, view);
      expect(entries.some((e) => e.callsign === "AAL123")).toBe(false);
      expect(entries.some((e) => e.callsign === "DAL456")).toBe(true);
    });
  });

  describe("T02-106: Video Map Lists (ML) Active Indicators & Interactive Scope Toggling", () => {
    it("1. formats VIDEO MAPS header with > active indicators and two blank spaces for inactive", () => {
      const view = createScopeView();
      // Default: map 1 and map 4 are active
      const lines = buildVideoMapsListLines(view, "ALL");
      expect(lines[0]).toBe("VIDEO MAPS");
      expect(lines[1]).toContain(">  1 BOS AIRSPACE");
      expect(lines[2]).toContain("   2 FINAL 4R/4L");
      expect(lines[3]).toContain("   3 FINAL 22L/27");
      expect(lines[4]).toContain(">  4 MVA SECTORS");
      expect(lines[5]).toContain("   5 VFR REPORTING");
    });

    it("2. formats ACTIVE MAPS directory header displaying only currently enabled maps", () => {
      const view = createScopeView();
      const lines = buildVideoMapsListLines(view, "CURRENT");
      expect(lines[0]).toBe("ACTIVE MAPS");
      expect(lines.some((l) => l.includes("1 BOS AIRSPACE"))).toBe(true);
      expect(lines.some((l) => l.includes("4 MVA SECTORS"))).toBe(true);
      expect(lines.some((l) => l.includes("2 FINAL"))).toBe(false);
    });

    it("3. commands: *TX Enter toggles ML visibility and MAP [ID] toggles map layer", () => {
      const view = createScopeView();
      expect(view.systemLists.ML.visible).toBe(false);

      const parsedToggle = parsePreviewCommand("*TX");
      expect(parsedToggle).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "ML" },
      });

      const parsedMap = parsePreviewCommand("MAP 2");
      expect(parsedMap).toEqual({
        kind: "action",
        action: { type: "toggleVideoMap", mapId: "2" },
      });

      const parsedAllOff = parsePreviewCommand("MAP ALL OFF");
      expect(parsedAllOff).toEqual({
        kind: "action",
        action: { type: "setAllVideoMaps", enabled: false },
      });
    });

    it("4. *TX D Enter resets ML placement anchor to adaptation default", () => {
      const view = createScopeView();
      relocateSystemList(view, "ML", 0.1, 0.2);
      expect(view.systemLists.ML.x).toBe(0.1);

      const parsed = parsePreviewCommand("*TX D");
      expect(parsed).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "ML" },
      });

      resetSystemListToDefault(view, "ML");
      expect(view.systemLists.ML.x).toBe(DEFAULT_ADAPTATION_ANCHORS.ML.x);
      expect(view.systemLists.ML.y).toBe(DEFAULT_ADAPTATION_ANCHORS.ML.y);
    });

    it("5. interactive scope canvas layer toggling: left-clicking map row toggles map layer ON/OFF and updates > indicator", () => {
      const view = createScopeView();
      const world = createWorld();

      // Ensure map 2 is initially inactive
      expect(isVideoMapOn(view, "2")).toBe(false);
      let lines = buildVideoMapsListLines(view, "ALL");
      expect(lines[2]).toContain("   2 FINAL 4R/4L");

      // Configure active entry and rect hitboxes as renderScopePaint would
      view.systemLists.ML.visible = true;
      view.activeListEntries = [
        {
          listId: "ML",
          rowIndex: 1,
          callsign: "1",
          mapId: "1",
          bounds: { x: 250, y: 36, width: 150, height: 16 },
        },
        {
          listId: "ML",
          rowIndex: 2,
          callsign: "2",
          mapId: "2",
          bounds: { x: 250, y: 52, width: 150, height: 16 },
        },
      ];
      view.activeListRects = [
        {
          id: "ML",
          bounds: { x: 250, y: 20, width: 150, height: 100 },
        },
      ];

      // Left-click on row 2 (map 2) -> toggles ON
      handlePpiLeftClick(view, world, 260, 54, 1000, 1000);
      expect(isVideoMapOn(view, "2")).toBe(true);

      // Rebuilding list shows > indicator on map 2
      lines = buildVideoMapsListLines(view, "ALL");
      expect(lines[2]).toContain(">  2 FINAL 4R/4L");

      // Left-click on row 2 again -> toggles OFF
      handlePpiLeftClick(view, world, 260, 54, 1000, 1000);
      expect(isVideoMapOn(view, "2")).toBe(false);

      // > indicator clears
      lines = buildVideoMapsListLines(view, "ALL");
      expect(lines[2]).toContain("   2 FINAL 4R/4L");

      // Also verify direct handleVideoMapsListClick
      handleVideoMapsListClick(view, 2);
      expect(isVideoMapOn(view, "2")).toBe(true);
      handleVideoMapsListClick(view, 2);
      expect(isVideoMapOn(view, "2")).toBe(false);
      // Clicking header (line 0) does nothing
      expect(handleVideoMapsListClick(view, 0)).toBe(true);
      expect(isVideoMapOn(view, "2")).toBe(false);
    });

    it("6. *TX [Click] Enter repositions map list anchor", () => {
      const view = createScopeView();
      const world = createWorld();

      // Start typing *TX into preview buffer
      beginPreviewBufferEntry(view.preview, "*TX", Date.now());
      expect(view.preview.buffer).toBe("*TX");

      // Click scope canvas at (300, 400) on 1000x1000 canvas -> stages candidate (0.3, 0.4)
      handlePpiLeftClick(view, world, 300, 400, 1000, 1000);
      expect(view.stagedListAnchor).toEqual({ listId: "ML", x: 0.3, y: 0.4 });
      // Live coordinates not mutated yet
      expect(view.systemLists.ML.x).toBe(0.25);

      // Press Enter to commit staged anchor
      handleScopeKeyDown(keyEvent("Enter"), view, "scope", world, Date.now());
      expect(view.systemLists.ML.x).toBe(0.3);
      expect(view.systemLists.ML.y).toBe(0.4);
      expect(view.stagedListAnchor).toBeNull();
      expect(view.preview.phase).toBe("idle");
    });

    it("7. DCB MAPS menu controls toggle GEO MAPS, CURRENT, and CLR ALL", () => {
      const view = createScopeView();

      // Initial: ML hidden
      expect(view.systemLists.ML.visible).toBe(false);
      expect(view.geoMapsListOn).toBe(false);

      // DCB MAPS -> GEO MAPS toggles VIDEO MAPS directory ON
      toggleGeoMapsList(view);
      expect(view.systemLists.ML.visible).toBe(true);
      expect(view.mapListMode).toBe("GEO");
      expect(view.geoMapsListOn).toBe(true);
      expect(view.currentMapsListOn).toBe(false);
      expect(view.systemLists.ML.frameTitle).toBe("VIDEO MAPS (ML)");

      // Second click toggles it OFF
      toggleGeoMapsList(view);
      expect(view.systemLists.ML.visible).toBe(false);
      expect(view.geoMapsListOn).toBe(false);

      // DCB MAPS -> CURRENT toggles ACTIVE MAPS directory ON
      toggleCurrentMapsList(view);
      expect(view.systemLists.ML.visible).toBe(true);
      expect(view.mapListMode).toBe("CURRENT");
      expect(view.currentMapsListOn).toBe(true);
      expect(view.geoMapsListOn).toBe(false);
      expect(view.systemLists.ML.frameTitle).toBe("ACTIVE MAPS (ML)");

      // Second click toggles it OFF
      toggleCurrentMapsList(view);
      expect(view.systemLists.ML.visible).toBe(false);
      expect(view.currentMapsListOn).toBe(false);

      // DCB MAPS -> CLR ALL clears all active map layers
      expect(isVideoMapOn(view, "1")).toBe(true);
      clearAllVideoMaps(view);
      expect(isVideoMapOn(view, "1")).toBe(false);
      expect(isVideoMapOn(view, "4")).toBe(false);
      const currentLines = buildVideoMapsListLines(view, "CURRENT");
      expect(currentLines.length).toBe(1);
      expect(currentLines[0]).toBe("ACTIVE MAPS");
    });

    it("8. keyboard commands MAP [ID] and MAP ALL OFF execute via handleScopeKeyDown", () => {
      const view = createScopeView();
      const world = createWorld();

      // Map 2 is off initially
      expect(isVideoMapOn(view, "2")).toBe(false);

      // Enter "MAP 2"
      beginPreviewBufferEntry(view.preview, "MAP 2", Date.now());
      handleScopeKeyDown(keyEvent("Enter"), view, "scope", world, Date.now());
      expect(isVideoMapOn(view, "2")).toBe(true);

      // Enter "MAP4" toggles map 4 from on to off
      expect(isVideoMapOn(view, "4")).toBe(true);
      beginPreviewBufferEntry(view.preview, "MAP4", Date.now());
      handleScopeKeyDown(keyEvent("Enter"), view, "scope", world, Date.now());
      expect(isVideoMapOn(view, "4")).toBe(false);

      // Enter "MAP ALL OFF"
      beginPreviewBufferEntry(view.preview, "MAP ALL OFF", Date.now());
      handleScopeKeyDown(keyEvent("Enter"), view, "scope", world, Date.now());
      expect(isVideoMapOn(view, "1")).toBe(false);
      expect(isVideoMapOn(view, "2")).toBe(false);
      expect(isVideoMapOn(view, "4")).toBe(false);
    });
  });

  describe("T02-107: Alert Status Box (AL) Dynamic Alerts & Controls", () => {
    it("1. renders idle header LA/CA/MCI with no rows when no active alerts", () => {
      const world = createWorld();
      const view = createScopeView();
      const lines = buildAlertList(world, 50, view);
      expect(lines.length).toBe(1);
      expect(lines[0]).toBe("LA/CA/MCI");
    });

    it("2. dynamically unfurls CA and LA rows with correct formatting", () => {
      const world = createWorld();
      const view = createScopeView();
      world.aircraft = [
        makeTestAircraft({ id: "ac1", callsign: "AAL100", altitudeFt: 3000 }),
        makeTestAircraft({ id: "ac2", callsign: "DAL628", altitudeFt: 3000 }),
        makeTestAircraft({ id: "ac3", callsign: "JBU389", altitudeFt: 1500 }),
      ];
      world.alerts = {
        ca: [
          {
            callsignA: "AAL100",
            callsignB: "DAL628",
            severity: "alert",
            distNm: 1.5,
            deltaAltFt: 0,
          },
        ],
        msaw: [{ callsign: "JBU389", altFt: 1500, severity: "alert", floorFt: 2000 }],
        atpa: [],
      };

      const lines = buildAlertList(world, 50, view);
      expect(lines[0]).toBe("LA/CA/MCI");
      expect(lines).toContain("CA AAL100*DAL628");
      expect(lines).toContain("LA JBU389 015");
    });

    it("3. *CA [Left-Click Target] inhibits CA for targeted track", () => {
      const world = createWorld();
      const view = createScopeView();
      const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100", xNm: 5, yNm: 5 });
      const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL628", xNm: 5.5, yNm: 5.5 });
      world.aircraft = [ac1, ac2];
      world.alerts = {
        ca: [
          {
            callsignA: "AAL100",
            callsignB: "DAL628",
            severity: "alert",
            distNm: 0.5,
            deltaAltFt: 0,
          },
        ],
        msaw: [],
        atpa: [],
      };

      // Ensure alert shows initially
      let lines = buildAlertList(world, 50, view);
      expect(lines).toContain("CA AAL100*DAL628");

      // Invented *CA is rejected
      expect(parsePreviewCommand("*CA").kind).toBe("invalid");

      // Enter authentic CA K command
      beginPreviewBufferEntry(view.preview, "CA K AAL100", 1000);
      handleScopeKeyDown(keyEvent("Enter"), view, "scope", world);

      // Verify alert is now inhibited in AL list
      lines = buildAlertList(world, 50, view);
      expect(lines.some((l) => l.includes("CA AAL100"))).toBe(false);
    });

    it("4. *LA [Left-Click Target] inhibits MSAW for targeted track", () => {
      const world = createWorld();
      const view = createScopeView();
      const ac = makeTestAircraft({ id: "ac3", callsign: "JBU389", altitudeFt: 1500 });
      world.aircraft = [ac];
      world.alerts = {
        ca: [],
        msaw: [{ callsign: "JBU389", altFt: 1500, severity: "alert", floorFt: 2000 }],
        atpa: [],
      };

      let lines = buildAlertList(world, 50, view);
      expect(lines).toContain("LA JBU389 015");

      // Inhibit via trackDisplay
      const td = ensureTrackDisplay(view.tracks, "ac3");
      td.msawInhibited = true;

      lines = buildAlertList(world, 50, view);
      expect(lines.some((l) => l.includes("LA JBU389"))).toBe(false);
    });

    it("*TM Enter toggles AL list visibility on and off", () => {
      const view = createScopeView();
      expect(view.systemLists.AL.visible).toBe(true);

      const parsed = parsePreviewCommand("*TM");
      expect(parsed).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "AL" },
      });

      beginPreviewBufferEntry(view.preview, "*TM", 1000);
      handleScopeKeyDown(keyEvent("Enter"), view, "scope");
      expect(view.systemLists.AL.visible).toBe(false);

      beginPreviewBufferEntry(view.preview, "*TM", 2000);
      handleScopeKeyDown(keyEvent("Enter"), view, "scope");
      expect(view.systemLists.AL.visible).toBe(true);
    });

    it("5. *MCI Enter toggles mciEnabled boolean on view", () => {
      const view = createScopeView();
      expect(view.mciEnabled).toBe(true);

      const parsed = parsePreviewCommand("*MCI");
      expect(parsed).toEqual({
        kind: "action",
        action: { type: "toggleMci" },
      });

      beginPreviewBufferEntry(view.preview, "*MCI", 1000);
      handleScopeKeyDown(keyEvent("Enter"), view, "scope");
      expect(view.mciEnabled).toBe(false);

      beginPreviewBufferEntry(view.preview, "*MCI", 2000);
      handleScopeKeyDown(keyEvent("Enter"), view, "scope");
      expect(view.mciEnabled).toBe(true);
    });

    it("6. *TM [Click] Enter repositions alert box and *TM D Enter resets", () => {
      const view = createScopeView();
      relocateSystemList(view, "AL", 0.35, 0.45);
      expect(view.systemLists.AL.x).toBe(0.35);

      const parsed = parsePreviewCommand("*TM D");
      expect(parsed).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "AL" },
      });

      resetSystemListToDefault(view, "AL");
      expect(view.systemLists.AL.x).toBe(DEFAULT_ADAPTATION_ANCHORS.AL.x);
      expect(view.systemLists.AL.y).toBe(DEFAULT_ADAPTATION_ANCHORS.AL.y);
    });

    it("7. *TM [Click] Enter repositions alert box via interactive scope click and Enter commit", () => {
      const view = createScopeView();
      const world = createWorld();

      beginPreviewBufferEntry(view.preview, "*TM", 1000);
      expect(view.preview.buffer).toBe("*TM");

      // Click on canvas at (300, 400) on 1000x800 display -> normalized (0.3, 0.5)
      handlePpiLeftClick(view, world, 300, 400, 1000, 800, "");
      expect(view.stagedListAnchor).toEqual({
        listId: "AL",
        x: 0.3,
        y: 0.5,
      });

      // Press Enter commits relocation
      handleScopeKeyDown(keyEvent("Enter"), view, "scope", world, 1500);
      expect(view.systemLists.AL.x).toBeCloseTo(0.3);
      expect(view.systemLists.AL.y).toBeCloseTo(0.5);
      expect(view.stagedListAnchor).toBeNull();
    });

    it("8. dynamically unfurls MCI rows and obeys mciEnabled toggle", () => {
      const world = createWorld();
      const view = createScopeView();
      world.alerts = {
        ca: [],
        msaw: [],
        atpa: [],
        mci: [{ intruderSquawkOrCallsign: "1200", protectedCallsign: "UAL856" }],
      };

      let lines = buildAlertList(world, 50, view);
      expect(lines[0]).toBe("LA/CA/MCI");
      expect(lines).toContain("MCI 1200 UAL856");

      // Toggle MCI off
      view.mciEnabled = false;
      lines = buildAlertList(world, 50, view);
      expect(lines.length).toBe(1);
      expect(lines[0]).toBe("LA/CA/MCI");
      expect(lines.slice(1).some((l) => l.includes("MCI"))).toBe(false);
    });

    it("9. hasActiveUninhibitedConflict correctly signals audible conflict alert state", () => {
      const world = createWorld();
      const view = createScopeView();
      const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100" });
      const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL628" });
      world.aircraft = [ac1, ac2];
      world.alerts = {
        ca: [
          {
            callsignA: "AAL100",
            callsignB: "DAL628",
            severity: "alert",
            distNm: 1.0,
            deltaAltFt: 200,
          },
        ],
        msaw: [],
        atpa: [],
      };

      // Uninhibited -> audible active
      expect(hasActiveUninhibitedConflict(world, view)).toBe(true);

      // Inhibit via trackDisplay for ac1
      const td1 = ensureTrackDisplay(view.tracks, "ac1");
      td1.caInhibited = true;
      expect(hasActiveUninhibitedConflict(world, view)).toBe(false);

      // Reset ac1 and inhibit ac2
      td1.caInhibited = false;
      expect(hasActiveUninhibitedConflict(world, view)).toBe(true);
      const td2 = ensureTrackDisplay(view.tracks, "ac2");
      td2.caInhibited = true;
      expect(hasActiveUninhibitedConflict(world, view)).toBe(false);
    });

    it("10. *LA [Left-Click Target] inhibits MSAW for targeted track via live preview slew buffer", () => {
      const world = createWorld();
      const view = createScopeView();
      const target = makeTestAircraft({
        id: "ac-low",
        callsign: "N12345",
        altitudeFt: 800,
        xNm: 0,
        yNm: 0,
      });
      world.aircraft = [target];
      world.alerts = {
        ca: [],
        msaw: [{ callsign: "N12345", altFt: 800, severity: "alert", floorFt: 2000 }],
        atpa: [],
      };

      // Purged alias *LA does not arm inhibitMsaw tracking slew
      beginPreviewBufferEntry(view.preview, "*LA", 1000);
      expect(previewTrackingSlew(view.preview)).toBeNull();
      expect(commitPreviewCommand("*LA").kind).toBe("invalid");
    });
  });

  describe("7. SSA Relocation and Dragging", () => {
    it("1. <MULTI FUNC>S<SLEW LOCATION> relocates SSA anchor immediately without requiring Enter", () => {
      const world = createWorld();
      const view = createScopeView();
      expect(view.systemLists.SSA.x).toBe(DEFAULT_ADAPTATION_ANCHORS.SSA.x);
      expect(view.systemLists.SSA.y).toBe(DEFAULT_ADAPTATION_ANCHORS.SSA.y);

      // Type *S into preview buffer
      beginPreviewBufferEntry(view.preview, "*S", 1000);
      expect(previewRelocateListId(view.preview)).toBe("SSA");

      // Left-click scope at (300, 200) on a 1000x1000 viewport
      handlePpiLeftClick(view, world, 300, 200, 1000, 1000, "");
      expect(view.systemLists.SSA.x).toBe(0.3);
      expect(view.systemLists.SSA.y).toBe(0.2);
      expect(view.preview.phase).toBe("idle");
    });

    it("2. <MULTI FUNC>S Enter <SLEW LOCATION> relocates SSA anchor when armed", () => {
      const world = createWorld();
      const view = createScopeView();

      beginPreviewBufferEntry(view.preview, "*S", 1000);
      handleScopeKeyDown(
        { key: "Enter", preventDefault() {}, stopPropagation() {} },
        view,
        "scope",
        world,
        1100,
      );
      expect(view.preview.phase).toBe("armed");
      expect(view.preview.armed?.type).toBe("armRelocateList");
      expect(previewRelocateListId(view.preview)).toBe("SSA");

      // Left-click scope at (600, 400)
      handlePpiLeftClick(view, world, 600, 400, 1000, 1000, "");
      expect(view.systemLists.SSA.x).toBe(0.6);
      expect(view.systemLists.SSA.y).toBe(0.4);
      expect(view.preview.phase).toBe("idle");
    });

    it("3. *SD and *S D resets SSA placement anchor to adaptation default", () => {
      const view = createScopeView();
      relocateSystemList(view, "SSA", 0.5, 0.5);
      expect(view.systemLists.SSA.x).toBe(0.5);

      const parsed1 = parsePreviewCommand("*SD");
      expect(parsed1).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "SSA" },
      });

      const parsed2 = parsePreviewCommand("*S D");
      expect(parsed2).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "SSA" },
      });

      resetSystemListToDefault(view, "SSA");
      expect(view.systemLists.SSA.x).toBe(DEFAULT_ADAPTATION_ANCHORS.SSA.x);
      expect(view.systemLists.SSA.y).toBe(DEFAULT_ADAPTATION_ANCHORS.SSA.y);
    });

    it("4. renderScope paints SSA at relocated position and records activeListRect with handleBounds", () => {
      const world = createWorld();
      const view = createScopeView();
      relocateSystemList(view, "SSA", 0.25, 0.35);

      const fillTexts: { text: string; x: number; y: number }[] = [];
      const strokeRects: { x: number; y: number; w: number; h: number }[] = [];
      const mockCtx = {
        save() {},
        restore() {},
        beginPath() {},
        closePath() {},
        arc() {},
        clip() {},
        rect() {},
        fillRect() {},
        stroke() {},
        fill() {},
        moveTo() {},
        lineTo() {},
        setTransform() {},
        measureText(text: string) {
          return { width: text.length * 8 };
        },
        fillText(text: string, x: number, y: number) {
          fillTexts.push({ text, x, y });
        },
        strokeRect(x: number, y: number, w: number, h: number) {
          strokeRects.push({ x, y, w, h });
        },
        font: "12px monospace",
        textBaseline: "top",
        textAlign: "left",
        lineWidth: 1,
      } as unknown as CanvasRenderingContext2D;

      renderScope(mockCtx, world, view, 1000, 1000);

      // SSA should paint at x = 250, y = 350
      const triText = fillTexts.find((t) => t.text === "▼");
      expect(triText).toBeDefined();
      expect(triText?.x).toBe(250);
      expect(triText?.y).toBe(350);

      // Active list rects should include SSA
      const ssaRect = view.activeListRects?.find((r) => r.id === "SSA");
      expect(ssaRect).toBeDefined();
      expect(ssaRect?.bounds.x).toBe(250);
      expect(ssaRect?.bounds.y).toBe(350);
      expect(ssaRect?.handleBounds).toBeDefined();
      expect(ssaRect?.handleBounds?.x).toBe(250);
      expect(ssaRect?.handleBounds?.y).toBe(350);
    });
  });

  describe("Strict Command Alias Removal (Only Authorized List Commands Allowed)", () => {
    const REMOVED_ALIASES = [
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

    it("rejects all removed list command aliases in parsePreviewCommand and commitPreviewCommand", () => {
      for (const cmd of REMOVED_ALIASES) {
        const parsed = parsePreviewCommand(cmd);
        expect(parsed.kind, `Command ${cmd} should be invalid in parsePreviewCommand`).toBe(
          "invalid",
        );

        const committed = commitPreviewCommand(cmd);
        expect(committed.kind, `Command ${cmd} should be invalid in commitPreviewCommand`).toBe(
          "invalid",
        );
      }
    });

    it("does not allow slew relocation for removed list aliases", () => {
      const view = createScopeView();
      for (const cmd of [
        "*FL",
        "*TAB",
        "*VL",
        "*TL",
        "*ML",
        "*AL",
        "*CR",
        "*CS",
        "*SO",
        "*SSA",
        "*TLBED",
      ]) {
        beginPreviewBufferEntry(view.preview, cmd, Date.now());
        expect(
          previewRelocateListId(view.preview),
          `previewRelocateListId should be null for ${cmd}`,
        ).toBeNull();
      }
    });

    it("pressing Enter on removed aliases does not toggle or resize lists and rejects preview", () => {
      const view = createScopeView();
      const world = createWorld();

      // Check initial states
      expect(view.systemLists.FL.visible).toBe(false);
      expect(view.systemLists.VL.visible).toBe(false);
      expect(view.systemLists.TL.visible).toBe(false);
      expect(view.systemLists.ML.visible).toBe(false);

      for (const cmd of [
        "*FL",
        "*TAB",
        "*VL",
        "*TL",
        "*TLBED",
        "*ML",
        "*AL",
        "*CR",
        "*CS",
        "*SO",
        "*SSA",
      ]) {
        beginPreviewBufferEntry(view.preview, cmd, 1000);
        handleScopeKeyDown(keyEvent("Enter"), view, "scope", world, 1000);
        // Should not toggle any list
        expect(view.systemLists.FL.visible).toBe(false);
        expect(view.systemLists.VL.visible).toBe(false);
        expect(view.systemLists.TL.visible).toBe(false);
        expect(view.systemLists.ML.visible).toBe(false);
      }
    });

    it("allows only authorized commands for list toggle, resize, and relocation", () => {
      // *T
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

      // *TV
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

      // *TM
      expect(parsePreviewCommand("*TM")).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "AL" },
      });
      expect(parsePreviewCommand("*TM D")).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "AL" },
      });

      // *TC
      expect(parsePreviewCommand("*TC")).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "COAST" },
      });
      expect(parsePreviewCommand("*TC 15")).toEqual({
        kind: "action",
        action: { type: "resizeList", listId: "COAST", maxLines: 15 },
      });
      expect(parsePreviewCommand("*TC D")).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "COAST" },
      });

      // *TS
      expect(parsePreviewCommand("*TS")).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "SIGN_ON" },
      });
      expect(parsePreviewCommand("*TS D")).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "SIGN_ON" },
      });

      // *TX
      expect(parsePreviewCommand("*TX")).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "ML" },
      });
      expect(parsePreviewCommand("*TX D")).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "ML" },
      });

      // *TN
      expect(parsePreviewCommand("*TN")).toEqual({
        kind: "action",
        action: { type: "toggleList", listId: "CRDA" },
      });
      expect(parsePreviewCommand("*TN D")).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "CRDA" },
      });

      // *P1, *P2, *P3
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

      // *S
      expect(parsePreviewCommand("*S")).toEqual({
        kind: "action",
        action: { type: "armRelocateList", listId: "SSA" },
      });
      expect(parsePreviewCommand("*S D")).toEqual({
        kind: "action",
        action: { type: "resetListPosition", listId: "SSA" },
      });

      // Relocation list IDs
      const view = createScopeView();
      for (const [cmd, expectedId] of [
        ["*T", "FL"],
        ["*TV", "VL"],
        ["*TM", "AL"],
        ["*TC", "COAST"],
        ["*TS", "SIGN_ON"],
        ["*TX", "ML"],
        ["*TN", "CRDA"],
        ["*P1", "TOWER_1"],
        ["*P2", "TOWER_2"],
        ["*P3", "TOWER_3"],
        ["*S", "SSA"],
      ]) {
        beginPreviewBufferEntry(view.preview, cmd, Date.now());
        expect(previewRelocateListId(view.preview), `Relocate listId for ${cmd}`).toBe(expectedId);
      }
    });

    it("ensures non-list commands remain working properly", () => {
      // *CA is strictly rejected (purged alias)
      expect(parsePreviewCommand("*CA").kind).toBe("invalid");
      // Authentic CA K command
      expect(parsePreviewCommand("CA K AAL100")).toEqual({
        kind: "action",
        action: { type: "caSingleTrackInhibit", trk: "AAL100" },
      });
      // *LA inhibit MSAW / set altitude filter limits
      expect(parsePreviewCommand("*LA")).toEqual({ kind: "incomplete" });
      expect(parsePreviewCommand("*LA010050")).toEqual({
        kind: "action",
        action: { type: "setAltitudeFilterLimits", floorHundreds: 10, ceilingHundreds: 50 },
      });
      // *MCI Mode C Intruder
      expect(parsePreviewCommand("*MCI")).toEqual({
        kind: "action",
        action: { type: "toggleMci" },
      });
      // *C recenter scope
      expect(parsePreviewCommand("*C")).toEqual({
        kind: "action",
        action: { type: "armRecenterScope" },
      });
      // *RR range rings
      expect(parsePreviewCommand("*RR 5")).toEqual({
        kind: "action",
        action: { type: "setRangeRingInterval", intervalNm: 5 },
      });
      // *PTL minutes
      expect(parsePreviewCommand("*PTL 5")).toEqual({
        kind: "action",
        action: { type: "setPtlMinutes", minutes: 5 },
      });
      // *HIST history dots
      expect(parsePreviewCommand("*HIST 3")).toEqual({
        kind: "action",
        action: { type: "setHistoryDots", count: 3 },
      });
      // *WX weather
      expect(parsePreviewCommand("*WX ALL")).toEqual({
        kind: "action",
        action: { type: "setWxLevelsAll", enabled: true },
      });
      // *D video maps
      expect(parsePreviewCommand("*D ALL")).toEqual({
        kind: "action",
        action: { type: "setAllVideoMaps", enabled: true },
      });
      // *F display filters / force FDB
      expect(parsePreviewCommand("*F")).toEqual({
        kind: "action",
        action: { type: "displayFilters" },
      });
      // *BCN beacon filter
      expect(parsePreviewCommand("*BCN 1200")).toEqual({
        kind: "action",
        action: { type: "addBeaconCodeFilter", code: "1200" },
      });
      // *0 - *8 leader clock
      expect(parsePreviewCommand("*0")).toEqual({
        kind: "action",
        action: { type: "resetLeaderDir" },
      });
      expect(parsePreviewCommand("*8")).toEqual({
        kind: "action",
        action: { type: "setLeaderDir", starsDir: 8, dir: 8 },
      });
    });
  });
});
