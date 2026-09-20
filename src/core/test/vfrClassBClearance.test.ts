import { describe, expect, test } from "vitest";
import {
  applyClassBInstruction,
  createAircraft,
  createWorld,
  handleClassBBoundary,
  SessionLog,
  validateClassBInstruction,
} from "@core";
import type { RegionalAirspaceVolume, RegionalFacility } from "../../scenario/regional";
import type { Instruction } from "../command/types";

const volume: RegionalAirspaceVolume = {
  id: "UC:KSYN:B_CORE",
  name: "SYNTHETIC BRAVO CORE",
  type: "CONTROLLED",
  class: "B",
  centerAirportId: "KSYN",
  lowerLimit: { altitudeFt: 3000, unit: "MSL", reference: "MSL" },
  upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
  lowerLimitFt: 3000,
  upperLimitFt: 10000,
  segments: [
    {
      sequence: 1,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: -5, yNm: -5 },
    },
    {
      sequence: 2,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: 5, yNm: -5 },
    },
    {
      sequence: 3,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: 5, yNm: 5 },
    },
    {
      sequence: 4,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: -5, yNm: 5 },
    },
  ],
};

const regional = {
  schemaVersion: 1,
  centerAirportId: "KSYN",
  facilityName: "KSYN APPROACH",
  radiusNm: 40,
  arp: { latDeg: 0, lonDeg: 0 },
  source: { families: [] },
  airports: [],
  airspaces: [volume],
} as unknown as RegionalFacility;

const mvaChart = {
  airportId: "KSYN",
  defaultMinAltitudeFt: 3000,
  polygons: [],
};

function aircraft(overrides?: Partial<Parameters<typeof createAircraft>[0]>) {
  return createAircraft({
    id: "ac-vfr-bravo",
    callsign: "N12345",
    xNm: -10,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 4000,
    speedKt: 110,
    flightRules: "VFR",
    ...overrides,
  });
}

function command(
  instruction: Extract<Instruction, { type: "CLASS_B_CLEARANCE" }>,
): Extract<Instruction, { type: "CLASS_B_CLEARANCE" }> {
  return instruction;
}

describe("T04-95 VFR Class B clearance state and execution", () => {
  test("accepts a VFR TO_ENTER clearance and keeps it separate from IFR state", () => {
    const ac = aircraft();
    const world = createWorld({ aircraft: [ac], regional, mvaChart });
    const instruction = command({ type: "CLASS_B_CLEARANCE", operation: "TO_ENTER" });

    expect(validateClassBInstruction(ac, instruction, { regional, mvaChart })).toEqual({
      ok: true,
    });
    applyClassBInstruction(ac, instruction, world, new SessionLog());

    expect(ac.flightRules).toBe("VFR");
    expect(ac.activeClearance).toBeUndefined();
    expect(ac.classBClearance).toMatchObject({
      operation: "TO_ENTER",
      routeMode: "OWN_NAVIGATION",
      active: true,
    });
  });

  test("rejects IFR and already-inside entry requests", () => {
    const ifr = aircraft({ flightRules: "IFR" });
    const entry = command({ type: "CLASS_B_CLEARANCE", operation: "TO_ENTER" });
    expect(validateClassBInstruction(ifr, entry, { regional, mvaChart })).toEqual({
      ok: false,
      detail: "CLEARANCE: VFR aircraft required",
    });

    const inside = aircraft({ xNm: 0, yNm: 0 });
    expect(validateClassBInstruction(inside, entry, { regional, mvaChart })).toEqual({
      ok: false,
      detail: "CLEARANCE: aircraft is already inside Class B airspace",
    });
  });

  test("requires routes to satisfy THROUGH and OUT_OF geometry", () => {
    const world = createWorld({
      regional,
      catalog: {
        airportId: "KSYN",
        fixes: [
          { id: "BRAVO-IN", xNm: 0, yNm: 0, kind: "fix" },
          { id: "BRAVO-OUT", xNm: 10, yNm: 0, kind: "fix" },
          { id: "BRAVO-SAFE", xNm: -10, yNm: 10, kind: "fix" },
        ],
        navaids: [],
        stars: [],
        sids: [],
        approaches: [],
      },
    });
    const through = command({
      type: "CLASS_B_CLEARANCE",
      operation: "THROUGH",
      route: [
        { type: "DIRECT", fixId: "BRAVO-IN" },
        { type: "DIRECT", fixId: "BRAVO-OUT" },
      ],
    });
    expect(
      validateClassBInstruction(aircraft(), through, { regional, fixRegistry: world.fixRegistry }),
    ).toEqual({ ok: true });

    const bad = command({
      type: "CLASS_B_CLEARANCE",
      operation: "THROUGH",
      route: [{ type: "DIRECT", fixId: "BRAVO-SAFE" }],
    });
    expect(
      validateClassBInstruction(aircraft(), bad, { regional, fixRegistry: world.fixRegistry }),
    ).toEqual({
      ok: false,
      detail: "CLEARANCE: route does not satisfy Class B clearance",
    });
  });

  test("REMAIN OUTSIDE rejects an aircraft already inside Bravo", () => {
    const ac = aircraft({ xNm: 0, yNm: 0 });
    expect(validateClassBInstruction(ac, { type: "REMAIN_OUTSIDE_BRAVO" }, { regional })).toEqual({
      ok: false,
      detail: "CLEARANCE: aircraft is inside Class B airspace",
    });
  });

  test("resumes the prior VFR altitude after an explicit command or boundary exit", () => {
    const ac = aircraft({ altitudeFt: 2500 });
    const world = createWorld({ aircraft: [ac], regional, mvaChart, sessionLog: new SessionLog() });
    const clearance = command({
      type: "CLASS_B_CLEARANCE",
      operation: "TO_ENTER",
      altitudeFt: 4000,
    });
    applyClassBInstruction(ac, clearance, world, world.sessionLog);
    expect(ac.intent.assignedAltitudeFt).toBe(4000);

    expect(
      validateClassBInstruction(ac, { type: "RESUME_APPROPRIATE_VFR_ALTITUDES" }, { regional }),
    ).toEqual({ ok: true });
    applyClassBInstruction(
      ac,
      { type: "RESUME_APPROPRIATE_VFR_ALTITUDES" },
      world,
      world.sessionLog,
    );
    expect(ac.intent.assignedAltitudeFt).toBe(2500);
    expect(ac.classBAltitudeSnapshot).toBeUndefined();

    ac.classBAltitudeSnapshot = { assignedAltitudeFt: 4000, priorVfrAltitudeFt: 2500 };
    ac.intent.assignedAltitudeFt = 4000;
    handleClassBBoundary(world, ac, true, false);
    expect(ac.intent.assignedAltitudeFt).toBe(2500);
    expect(world.sessionLog?.byType("class_b.exited")).toHaveLength(1);
    expect(world.sessionLog?.byType("class_b.exited")[0]?.notification).toBe(
      "LEAVING KSYN APPROACH BRAVO AIRSPACE",
    );
  });
});
