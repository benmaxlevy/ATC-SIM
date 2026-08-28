import { describe, expect, it } from "vitest";
import { createWorld, type World, type Aircraft } from "@core";
import { handlePpiLeftClick } from "./ppi";
import { handleScopeKeyDown } from "./scopeKeys";
import { createScopeView } from "./scopeView";
import {
  buildAlertList,
  buildCoastSuspendList,
  buildCrdaStatusList,
  buildSignOnList,
  buildTabFlightPlanList,
  buildTowerArrivalList,
  buildVfrList,
  DEFAULT_SYSTEM_LIST_PLACEMENTS,
  relocateSystemList,
  setSystemListMaxLines,
} from "./systemLists";

function makeTestAircraft(partial: Partial<Aircraft>): Aircraft {
  return {
    id: "ac-1",
    callsign: "AAL123",
    assignedSquawk: "1234",
    squawk: "1234",
    aircraftType: "B738",
    xNm: 10,
    yNm: 10,
    altitudeFt: 5000,
    headingDeg: 270,
    speedKt: 210,
    identUntilSimMs: 0,
    intent: {
      assignedAltitudeFt: 5000,
      assignedHeadingDeg: 270,
      assignedSpeedKt: 210,
      turn: "SHORTEST",
      expectedApproachId: "ILS27",
      clearedApproachId: null,
      locInterceptApproachId: null,
    },
    ...partial,
  };
}

describe("systemLists operational builders", () => {
  it("builds Sign-On list with TCP and sign-on Zulu time", () => {
    const lines = buildSignOnList({ subset: 1, sectorId: "D", signOnSimMs: 11_460_000 });
    expect(lines[0]).toBe("1D  0311");
  });

  it("builds TAB Flight Plan list with formatted unassociated IFR flights", () => {
    const world: World = {
      ...createWorld(),
      aircraft: [
        makeTestAircraft({
          id: "1",
          callsign: "AAL123",
          assignedSquawk: "1234",
          aircraftType: "B738",
          intent: {
            assignedAltitudeFt: 5000,
            assignedHeadingDeg: 270,
            assignedSpeedKt: 210,
            turn: "SHORTEST",
            expectedApproachId: "GAYEL",
            clearedApproachId: null,
            locInterceptApproachId: null,
          },
        }),
        makeTestAircraft({
          id: "2",
          callsign: "DAL456",
          assignedSquawk: "5678",
          aircraftType: "A319",
          intent: {
            assignedAltitudeFt: 8000,
            assignedHeadingDeg: 90,
            assignedSpeedKt: 250,
            turn: "SHORTEST",
            expectedApproachId: "BOS",
            clearedApproachId: null,
            locInterceptApproachId: null,
          },
        }),
      ],
    };

    const lines = buildTabFlightPlanList(world, 10);
    expect(lines[0]).toBe("FLIGHT PLAN");
    expect(lines[1]).toContain("01 AAL123  1234 B738 050 GAY");
    expect(lines[2]).toContain("02 DAL456  5678 A319 080 BOS");
  });

  it("builds Tower arrival sequence list with callsign and type designator", () => {
    const world: World = {
      ...createWorld(),
      aircraft: [
        makeTestAircraft({ id: "far", callsign: "DAL628", aircraftType: "B736", xNm: 20, yNm: 0 }),
        makeTestAircraft({ id: "near", callsign: "AAL100", aircraftType: "CRJ7", xNm: 5, yNm: 0 }),
      ],
    };

    const lines = buildTowerArrivalList(world, "BOS", 0, 0, 10);
    expect(lines[0]).toBe("BOS TOWER");
    expect(lines[1]).toBe("AAL100    CRJ7");
    expect(lines[2]).toBe("DAL628    B736");
  });

  it("builds Coast / Suspend list for coasting flights", () => {
    const lines = buildCoastSuspendList(
      [
        { callsign: "AAL506", status: "C", squawk: "3553", lastAltitudeHundreds: "015" },
        { callsign: "JBU389", status: "C", squawk: "3746", lastAltitudeHundreds: "030" },
      ],
      10,
    );
    expect(lines[0]).toBe("COAST/SUSPEND");
    expect(lines[1]).toBe("12  AAL506    C 3553 015");
    expect(lines[2]).toBe("13  JBU389    C 3746 030");
  });

  it("builds VFR list with formatted VFR flights and discrete squawks", () => {
    const world: World = {
      ...createWorld(),
      aircraft: [
        makeTestAircraft({ id: "1", callsign: "N925RC", squawk: "1200", assignedSquawk: "0263" }),
      ],
    };

    const lines = buildVfrList(world, 10);
    expect(lines[0]).toBe("VFR LIST");
    expect(lines[1]).toBe("14  *N925RC    0263");
  });

  it("builds LA/CA/MCI Alert list with active MSAW and CA alerts", () => {
    const world: World = {
      ...createWorld(),
      aircraft: [],
      alerts: {
        msaw: [{ callsign: "AAL100", severity: "alert", altFt: 600, floorFt: 1000 }],
        ca: [
          {
            callsignA: "DAL111",
            callsignB: "UAE124",
            severity: "alert",
            distNm: 1.5,
            deltaAltFt: 200,
          },
        ],
        atpa: [],
      },
    };

    const lines = buildAlertList(world, 50);
    expect(lines[0]).toBe("LA/CA/MCI");
    expect(lines[1]).toBe("DAL111*UAE124    CA");
    expect(lines[2]).toBe("AAL100           LA");
  });

  it("builds CRDA Status list with configured RPC pairings", () => {
    const lines = buildCrdaStatusList();
    expect(lines[0]).toBe("CRDA STATUS");
    expect(lines[1]).toBe("1  BOS 27/22L");
    expect(lines[2]).toBe("2  BOS 27/33L");
    expect(lines[3]).toBe("3  BOS 4L/15R");
  });
});

function keyEvent(key: string) {
  return {
    key,
    preventDefault(): void {},
    stopPropagation(): void {},
  };
}

function typeScope(view: ReturnType<typeof createScopeView>, keys: string[], startMs = 0): number {
  let now = startMs;
  for (const key of keys) {
    handleScopeKeyDown(keyEvent(key), view, "scope", undefined, now);
    now += 100;
  }
  return now;
}

describe("T02-62 list management commands", () => {
  const TOGGLE_KEYS: ReadonlyArray<{ keys: string[]; listId: string }> = [
    { keys: ["*", "T", "Enter"], listId: "TAB" },
    { keys: ["*", "T", "A", "B", "Enter"], listId: "TAB" },
    { keys: ["*", "T", "V", "Enter"], listId: "VFR" },
    { keys: ["*", "T", "C", "Enter"], listId: "COAST" },
    { keys: ["*", "T", "S", "Enter"], listId: "SIGN_ON" },
    { keys: ["*", " ", "P", "1", "Enter"], listId: "TOWER_1" },
    { keys: ["*", " ", "P", "2", "Enter"], listId: "TOWER_2" },
    { keys: ["*", " ", "P", "3", "Enter"], listId: "TOWER_3" },
    { keys: ["*", "T", "M", "Enter"], listId: "ALERT" },
    { keys: ["*", "T", "X", "Enter"], listId: "MAPS" },
    { keys: ["*", "T", "N", "Enter"], listId: "CRDA" },
  ];

  it("toggles each Table 31 list on * mnemonic Enter", () => {
    const view = createScopeView();
    for (const row of TOGGLE_KEYS) {
      const before = view.systemLists[row.listId]!.visible;
      typeScope(view, row.keys);
      expect(view.systemLists[row.listId]!.visible, row.listId).toBe(!before);
      expect(view.preview.phase).toBe("idle");
    }
    expect(DEFAULT_SYSTEM_LIST_PLACEMENTS.TAB.visible).toBe(false);
  });

  it("accepts optional spaces in * T Enter", () => {
    const view = createScopeView();
    expect(view.systemLists.TAB.visible).toBe(false);
    typeScope(view, ["*", " ", "T", "Enter"]);
    expect(view.systemLists.TAB.visible).toBe(true);
  });

  it("sets maxLines 1–100 and rejects *T 0 / *T 999 without mutation", () => {
    const view = createScopeView();
    const original = view.systemLists.TAB.maxLines;
    typeScope(view, ["*", "T", " ", "2", "5", "Enter"]);
    expect(view.systemLists.TAB.maxLines).toBe(25);
    expect(view.systemLists.TAB.visible).toBe(false);

    typeScope(view, ["*", "T", "0", "Enter"], 1000);
    expect(view.preview.rejection).toBe("*T0 INV");
    expect(view.systemLists.TAB.maxLines).toBe(25);

    typeScope(view, ["*", "T", "9", "9", "9", "Enter"], 2000);
    expect(view.preview.rejection).toBe("*T999 INV");
    expect(view.systemLists.TAB.maxLines).toBe(25);

    expect(setSystemListMaxLines(view, "TAB", 1)).toBe(true);
    expect(view.systemLists.TAB.maxLines).toBe(1);
    expect(original).toBe(10);
  });

  it("relocates TAB on live *T click and SSA on *S click; disarms after placement", () => {
    const view = createScopeView();
    const world = createWorld();
    typeScope(view, ["*", "T"]);
    expect(view.preview.phase).toBe("entry");
    handlePpiLeftClick(view, world, 400, 200, 800, 800);
    expect(view.systemLists.TAB.x).toBe(0.5);
    expect(view.systemLists.TAB.y).toBe(0.25);
    expect(view.preview.phase).toBe("idle");
    expect(view.preview.armed).toBeNull();

    typeScope(view, ["*", "S"], 50);
    handlePpiLeftClick(view, world, 0, 800, 800, 800);
    expect(view.systemLists.SSA.x).toBe(0);
    expect(view.systemLists.SSA.y).toBe(1);
    expect(view.preview.phase).toBe("idle");
    expect(view.systemLists.SSA.visible).toBe(true);
  });

  it("relocates SSA after *S Enter arm, and clamps click to [0, 1]", () => {
    const view = createScopeView();
    const world = createWorld();
    typeScope(view, ["*", "S", "Enter"]);
    expect(view.preview.phase).toBe("armed");
    expect(view.preview.armed).toEqual({ type: "armRelocateList", listId: "SSA" });
    expect(view.systemLists.SSA.visible).toBe(true);
    handlePpiLeftClick(view, world, -40, 1200, 800, 800);
    expect(view.systemLists.SSA.x).toBe(0);
    expect(view.systemLists.SSA.y).toBe(1);
    expect(view.preview.phase).toBe("idle");
  });

  it("flashes INV for malformed *TZ and does not mutate TAB", () => {
    const view = createScopeView();
    const before = { ...view.systemLists.TAB };
    typeScope(view, ["*", "T", "Z", "Enter"]);
    expect(view.preview.rejection).toBe("*TZ INV");
    expect(view.systemLists.TAB).toEqual(before);
  });

  it("keeps bare *P as TPA Enter fallback, not TOWER_1 toggle", () => {
    const view = createScopeView();
    const hidden = view.systemLists.TOWER_1.visible;
    typeScope(view, ["*", "P", "Enter"]);
    expect(view.systemLists.TOWER_1.visible).toBe(hidden);
    expect(view.preview.phase).toBe("idle");
  });

  it("relocates via relocateSystemList helper without touching other lists", () => {
    const view = createScopeView();
    expect(relocateSystemList(view, "VFR", 0.9, 0.1)).toBe(true);
    expect(view.systemLists.VFR.x).toBe(0.9);
    expect(view.systemLists.VFR.y).toBe(0.1);
    expect(view.systemLists.TAB.x).toBe(DEFAULT_SYSTEM_LIST_PLACEMENTS.TAB.x);
    expect(relocateSystemList(view, "NOPE", 0.5, 0.5)).toBe(false);
  });
});
