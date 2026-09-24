import { describe, expect, it } from "vitest";
import { createAircraft, createFlightPlan, createWorld, SessionLog, stepWorld } from "@core";
import { flightPlanForAircraft } from "@core";
import { formatReadback } from "../readback";
import { handleRadioText } from "../handleRadioText";
import { validateInstructions } from "../validate";
import { datablockSourceFromWorld } from "../../scope/datablock";

function aircraft() {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 4,
    yNm: 5,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
  });
}

describe("T02-176 squawk assignment", () => {
  it("accepts an assignment without synchronously changing reported surveillance", async () => {
    const ac = aircraft();
    const world = createWorld({ aircraft: [ac] });
    const log = new SessionLog();
    const result = await handleRadioText(world, "DAL123 SQ 0342", log);

    expect(result.accepted).toBe(true);
    expect(result.readback).toContain("squawk 0342");
    expect(result.spokenReadback).toContain("squawk zero three four two");
    expect(ac.assignedSquawk).toBe("0342");
    expect(ac.reportedSquawk).toBeUndefined();
    expect(ac.pendingReportedSquawk).toMatchObject({ code: "0342", dueSimMs: 1000 });
    expect(log.byType("command.accepted")[0]?.command.instructions).toEqual([
      { type: "ASSIGN_SQUAWK", code: "0342", source: "DISCRETE" },
    ]);
  });

  it("updates reported surveillance through the existing hook after the pilot delay", async () => {
    const ac = aircraft();
    const world = createWorld({ aircraft: [ac] });
    await handleRadioText(world, "DAL123 SQ VFR", new SessionLog());
    expect(ac.reportedSquawk).toBeUndefined();

    stepWorld(world, 0.5);
    expect(ac.reportedSquawk).toBeUndefined();
    stepWorld(world, 0.5);
    expect(ac.assignedSquawk).toBe("1200");
    expect(ac.reportedSquawk).toBe("1200");
    expect(ac.pendingReportedSquawk).toBeUndefined();
  });

  it("keeps radio assignment separate until a manual plan edit", async () => {
    const ac = aircraft();
    const created = createFlightPlan({
      id: "fp-dal",
      acid: "DAL123",
      assignedBeacon: "4700",
      status: "pending",
      fixes: [],
      scratchpads: [],
    });
    if (!created.ok) throw new Error(created.error.message);
    const world = createWorld({ aircraft: [ac], flightPlans: [created.value] });
    await handleRadioText(world, "DAL123 SQ 4721", new SessionLog());
    expect(world.flightPlans[0]?.assignedBeacon).toBe("4700");
    expect(datablockSourceFromWorld(world, ac)).toMatchObject({
      callsign: "DAL123",
      assignedSquawk: "4721",
      reportedSquawk: undefined,
    });
    expect(flightPlanForAircraft(world, ac.id)).toBeUndefined();
    stepWorld(world, 1);
    expect(flightPlanForAircraft(world, ac.id)).toBeUndefined();
    expect(world.flightPlans[0]?.assignedBeacon).toBe("4700");

    // The plan beacon is a separate, manual flight-plan field. Once edited to
    // match the reported surveillance code, normal derived correlation works.
    world.flightPlans[0]!.assignedBeacon = "4721";
    expect(flightPlanForAircraft(world, ac.id)?.id).toBe("fp-dal");
    expect(datablockSourceFromWorld(world, ac)).toMatchObject({
      callsign: "DAL123",
      assignedSquawk: "4721",
      reportedSquawk: "4721",
    });
  });

  it("rejects invalid assignment atomically", async () => {
    const ac = aircraft();
    ac.assignedSquawk = "4312";
    ac.reportedSquawk = "4312";
    const world = createWorld({ aircraft: [ac] });
    const result = await handleRadioText(world, "DAL123 SQ 1289", new SessionLog());

    expect(result).toMatchObject({ accepted: false, reason: "SQUAWK" });
    expect(result.readback).toMatch(/unable squawk/i);
    expect(ac.assignedSquawk).toBe("4312");
    expect(ac.reportedSquawk).toBe("4312");
    expect(ac.pendingReportedSquawk).toBeUndefined();
  });

  it("keeps IDENT separate from assignment", () => {
    const ac = aircraft();
    const before = ac.identUntilSimMs;
    expect(validateInstructions(ac, [{ type: "IDENT" }]).ok).toBe(true);
    expect(ac.identUntilSimMs).toBe(before);
    expect(
      formatReadback({
        callsign: ac.callsign,
        instructions: [{ type: "IDENT" }],
        aircraft: ac,
      }),
    ).toContain("ident");
  });
});
