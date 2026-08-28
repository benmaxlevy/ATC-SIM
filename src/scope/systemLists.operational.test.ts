import { describe, expect, it } from "vitest";
import { createWorld, type World, type Aircraft } from "@core";
import {
  buildAlertList,
  buildCoastSuspendList,
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
  it("builds TAB Flight Plan list with formatted unassociated IFR flights", () => {
    const world: World = {
      ...createWorld(),
      aircraft: [
        makeTestAircraft({ id: "1", callsign: "AAL123", assignedSquawk: "1234", intent: { assignedAltitudeFt: 5000, assignedHeadingDeg: 270, assignedSpeedKt: 210, turn: "SHORTEST", expectedApproachId: "GAYEL", clearedApproachId: null, locInterceptApproachId: null } }),
        makeTestAircraft({ id: "2", callsign: "DAL456", assignedSquawk: "5678", intent: { assignedAltitudeFt: 8000, assignedHeadingDeg: 90, assignedSpeedKt: 250, turn: "SHORTEST", expectedApproachId: "BOS", clearedApproachId: null, locInterceptApproachId: null } }),
      ],
    };

    const lines = buildTabFlightPlanList(world, 10);
    expect(lines[0]).toBe("FLIGHT PLAN");
    expect(lines[1]).toContain("01 AAL123  1234 050 GAY");
    expect(lines[2]).toContain("02 DAL456  5678 080 BOS");
  });

  it("builds VFR list with formatted VFR flights", () => {
    const world: World = {
      ...createWorld(),
      aircraft: [
        makeTestAircraft({ id: "1", callsign: "N12345", squawk: "1200", assignedSquawk: "1200" }),
        makeTestAircraft({ id: "2", callsign: "AAL123", squawk: "1234" }),
      ],
    };

    const lines = buildVfrList(world, 10);
    expect(lines[0]).toBe("VFR LIST");
    expect(lines[1]).toContain("01 N12345  1200");
    expect(lines.length).toBe(2);
  });

  it("builds Tower arrival sequence list sorted by distance to airport", () => {
    const world: World = {
      ...createWorld(),
      aircraft: [
        makeTestAircraft({ id: "far", callsign: "DAL456", xNm: 20, yNm: 0, speedKt: 250 }),
        makeTestAircraft({ id: "near", callsign: "AAL123", xNm: 5, yNm: 0, speedKt: 180 }),
      ],
    };

    const lines = buildTowerArrivalList(world, "KDEM", 0, 0, 10);
    expect(lines[0]).toBe("KDEM");
    expect(lines[1]).toContain("01 AAL123  B738 180  5.0");
    expect(lines[2]).toContain("02 DAL456  B738 250 20.0");
  });

  it("builds Alert list with active MSAW and CA alerts", () => {
    const world: World = {
      ...createWorld(),
      aircraft: [],
      alerts: {
        msaw: [{ callsign: "AAL123", severity: "alert", altFt: 600, floorFt: 1000 }],
        ca: [{ callsignA: "AAL123", callsignB: "DAL456", severity: "alert", distNm: 1.5, deltaAltFt: 200 }],
        atpa: [],
      },
    };

    const lines = buildAlertList(world, 50);
    expect(lines[0]).toBe("ALERT LIST");
    expect(lines[1]).toContain("LA AAL123  006");
    expect(lines[2]).toContain("CA AAL123  DAL456 ");
  });

  it("builds Coast / Suspend list for suspended flights", () => {
    const ac = makeTestAircraft({ id: "ac-1", callsign: "AAL123", assignedSquawk: "4500" });
    const lines = buildCoastSuspendList([ac], 10);
    expect(lines[0]).toBe("COAST/SUSPEND");
    expect(lines[1]).toContain("01 AAL123  4500 SUSP");
  });
});
