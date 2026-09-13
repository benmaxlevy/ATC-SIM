import { describe, expect, it } from "vitest";
import { createAircraft, createWorld, SessionLog } from "@core";
import { handleRadioText } from "../handleRadioText";

function aircraft() {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 4,
    yNm: 5,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
    flightRules: "IFR",
  });
}

describe("T02-177 MAINTAIN VFR radio instruction", () => {
  it("sets only the explicit VFR marker and logs deterministic readback", async () => {
    const ac = aircraft();
    const world = createWorld({ aircraft: [ac] });
    const before = structuredClone(ac);
    const log = new SessionLog();

    const result = await handleRadioText(world, "DAL123 MVFR", log);

    expect(result).toMatchObject({ accepted: true, readback: "Delta 123 maintain VFR" });
    expect(ac.maintainVfr).toBe(true);
    expect(ac.intent).toEqual(before.intent);
    expect(ac.altitudeFt).toBe(before.altitudeFt);
    expect(ac.headingDeg).toBe(before.headingDeg);
    expect(ac.speedKt).toBe(before.speedKt);
    expect(log.byType("command.accepted")[0]?.command.instructions).toEqual([
      { type: "MAINTAIN_VFR" },
    ]);
  });

  it("accepts spoken parity and does not mutate an IFR plan", async () => {
    const ac = aircraft();
    const world = createWorld({
      aircraft: [ac],
      flightPlans: [
        {
          id: "fp-dal",
          status: "pending",
          acid: "DAL123",
          fixes: [],
          scratchpads: [],
          assignedBeacon: "4721",
        },
      ],
    });
    const log = new SessionLog();
    const result = await handleRadioText(world, "DAL123 maintain VFR", log, 0, { source: "voice" });

    expect(result).toMatchObject({ accepted: true, readback: "Delta 123 maintain VFR" });
    expect(ac.maintainVfr).toBe(true);
    expect(world.flightPlans[0]).toMatchObject({ status: "pending", assignedBeacon: "4721" });
  });

  it("rejects an unknown callsign without marking any aircraft", async () => {
    const ac = aircraft();
    const world = createWorld({ aircraft: [ac] });
    const result = await handleRadioText(world, "NOPE MVFR", new SessionLog());

    expect(result.accepted).toBe(false);
    expect(ac.maintainVfr).toBe(false);
  });
});
