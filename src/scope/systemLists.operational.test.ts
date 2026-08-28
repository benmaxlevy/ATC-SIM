import { describe, expect, it } from "vitest";
import { createWorld, type World, type Aircraft } from "@core";
import {
  buildAlertList,
  buildCoastSuspendList,
  buildCrdaStatusList,
  buildSignOnList,
  buildTabFlightPlanList,
  buildTowerArrivalList,
  buildVfrList,
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
