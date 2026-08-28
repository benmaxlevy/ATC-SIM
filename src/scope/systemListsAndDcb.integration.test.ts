import { describe, expect, it } from "vitest";
import { createWorld, stepWorld, type Aircraft, type World } from "@core";
import {
  buildAlertList,
  buildCoastSuspendList,
  buildCoordinationListLines,
  buildTabFlightPlanList,
  buildTowerArrivalList,
  buildVfrList,
  buildVideoMapsListLines,
  createCoordinationList,
  createScopeView,
  findOverlappingLists,
  handleListMiddleClick,
  handleListMouseMove,
  idleListDragState,
  openDcbMenu,
  closeDcbMenu,
  releaseSingleDeparture,
  stepBriteChannel,
  stepCharSizeChannel,
  toggleGiFilter,
  toggleSsaFilter,
  type ListRect,
} from "./index";

function makeArrival(id: string, callsign: string, xNm: number, yNm: number, gs: number): Aircraft {
  return {
    id,
    callsign,
    assignedSquawk: "1234",
    aircraftType: "B738",
    flightRules: "IFR",
    xNm,
    yNm,
    altitudeFt: 4000,
    headingDeg: 270,
    groundSpeedKt: gs,
    verticalSpeedFpm: 0,
    targetAltitudeFt: 4000,
    targetHeadingDeg: 270,
    targetSpeedKt: gs,
    state: "AIRBORNE",
    handoffState: { status: "NONE" },
    intent: {
      assignedAltitudeFt: 4000,
      assignedHeadingDeg: 270,
      assignedSpeedKt: gs,
      turn: "FLY_HEADING",
      exitFix: "GAYEL",
    },
  };
}

describe("STARS System Lists & DCB Integration Acceptance", () => {
  it("AC1 — drives complete in-scope operational system lists from real World ticks", () => {
    const world = createWorld();
    world.aircraft.push(
      makeArrival("ac-1", "AAL101", 12, 0, 190),
      makeArrival("ac-2", "DAL202", 6, 0, 170),
      {
        ...makeArrival("ac-3", "N789V", 15, 10, 120),
        flightRules: "VFR",
        assignedSquawk: "1200",
      },
    );

    // 1. TAB Flight Plan list
    const tabLines = buildTabFlightPlanList(world, 10);
    expect(tabLines[0]).toBe("FLIGHT PLAN");
    expect(tabLines[1]).toContain("01 AAL101");
    expect(tabLines[2]).toContain("02 DAL202");

    // 2. VFR list
    const vfrLines = buildVfrList(world, 10);
    expect(vfrLines[0]).toBe("VFR LIST");
    expect(vfrLines[1]).toContain("01 N789V   1200");

    // 3. Tower arrival sequence (sorted ascending by distance to threshold)
    const towerLines = buildTowerArrivalList(world, "KDEM", 0, 0, 10);
    expect(towerLines[0]).toBe("KDEM");
    expect(towerLines[1]).toContain("01 DAL202  B738 170  6.0");
    expect(towerLines[2]).toContain("02 AAL101  B738 190 12.0");

    // 4. Alert list with active MSAW and CA
    world.alerts = {
      msaw: [{ aircraftId: "ac-1", warning: true, groundElevationFt: 500 }],
      ca: [{ aircraft1Id: "ac-1", aircraft2Id: "ac-2", horizontalSepNm: 1.2, verticalSepFt: 100, timeToClosestPointSec: 15 }],
      atpa: [],
    };
    const alertLines = buildAlertList(world, 50);
    expect(alertLines[0]).toBe("ALERT LIST");
    expect(alertLines.some((l) => l.includes("LA AAL101"))).toBe(true);
    expect(alertLines.some((l) => l.includes("CA AAL101  DAL202"))).toBe(true);

    // 5. Coordination departures with release lifecycle
    const coordList = createCoordinationList("A", "REPUBLIC", [
      {
        id: "dep-1",
        callsign: "EJA555",
        aircraftType: "C56X",
        squawk: "4412",
        exitFix: "WHITE",
        requestedAltitudeFt: 20000,
        released: false,
      },
    ]);
    const unreleasedLines = buildCoordinationListLines(coordList);
    expect(unreleasedLines[1]).toContain("*01 EJA555  C56X 4412 WHI 200");

    const releaseRes = releaseSingleDeparture(coordList);
    expect(releaseRes.success).toBe(true);
    const releasedLines = buildCoordinationListLines(coordList);
    expect(releasedLines[1]).toContain("+01 EJA555  C56X 4412 WHI 200");

    // 6. Video Maps list
    const view = createScopeView();
    const mapLines = buildVideoMapsListLines(view, "ALL");
    expect(mapLines[0]).toContain("VIDEO MAPS");
  });

  it("AC2 — drives middle-click list dragging and detects overlapping collision frames", () => {
    let dragState = idleListDragState();
    const lists: { id: string; bounds: ListRect }[] = [
      { id: "TAB", bounds: { x: 50, y: 50, width: 120, height: 80 } },
      { id: "TOWER", bounds: { x: 300, y: 50, width: 120, height: 80 } },
    ];
    const paneExtent = { width: 1000, height: 800 };

    // Initial check: no overlap
    let overlapping = findOverlappingLists(lists);
    expect(overlapping.size).toBe(0);

    // Start dragging TAB list
    const click1 = handleListMiddleClick(dragState, { x: 70, y: 70 }, lists, paneExtent);
    dragState = click1.nextState;
    expect(dragState.movingListId).toBe("TAB");

    // Move mouse over TOWER list
    dragState = handleListMouseMove(dragState, { x: 320, y: 70 });
    expect(dragState.movingCurrentPos).toEqual({ x: 320, y: 70 });

    // Drop TAB list directly over TOWER list
    const drop = handleListMiddleClick(dragState, { x: 320, y: 70 }, lists, paneExtent);
    expect(drop.nextState.movingListId).toBeNull();
    expect(drop.updatedPlacement?.id).toBe("TAB");

    // Update bounds and verify collision detection
    lists[0]!.bounds = { x: 300, y: 50, width: 120, height: 80 };
    overlapping = findOverlappingLists(lists);
    expect(overlapping.has("TAB")).toBe(true);
    expect(overlapping.has("TOWER")).toBe(true);
  });

  it("AC3 — drives DCB submenus, channel steppers, and filter toggles without regressions", () => {
    const view = createScopeView(undefined, undefined, { giTextLines: ["KDEM ATIS ECHO"] });

    // 1. Menu transitions
    openDcbMenu(view, "BRITE");
    expect(view.dcbMenu).toBe("BRITE");
    stepBriteChannel(view, "fdb", -1);
    expect(view.brite.fdb).toBe(90);

    openDcbMenu(view, "CHAR_SIZE");
    expect(view.dcbMenu).toBe("CHAR_SIZE");
    stepCharSizeChannel(view, "lists", 1);
    expect(view.charSizes.lists).toBeGreaterThanOrEqual(10);

    openDcbMenu(view, "SSA_FILTER");
    expect(view.dcbMenu).toBe("SSA_FILTER");
    toggleSsaFilter(view, "RANGE");
    expect(view.ssaFilter.RANGE).toBe(false);

    openDcbMenu(view, "GI_FILTER");
    expect(view.dcbMenu).toBe("GI_FILTER");
    toggleGiFilter(view, 0);
    expect(view.giFilterVisible[0]).toBe(false);

    closeDcbMenu(view);
    expect(view.dcbMenu).toBe("MAIN");
  });
});
