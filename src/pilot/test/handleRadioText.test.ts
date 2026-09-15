import { expect, test } from "vitest";
import { SessionLog, createAircraft, createWorld } from "@core";
import { handleRadioText } from "../handleRadioText";

function sample(callsign: string, id: string) {
  return createAircraft({
    id,
    callsign,
    xNm: 10,
    yNm: 5,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
}

test("DAL123 H270 is accepted and assigns heading 270", async () => {
  const dal = sample("DAL123", "ac-dal");
  const aal = sample("AAL456", "ac-aal");
  const world = createWorld({ aircraft: [dal, aal], simTimeMs: 250 });
  const log = new SessionLog();
  const result = await handleRadioText(world, "DAL123 H270", log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(aal.intent.assignedHeadingDeg).not.toBe(270);
  expect(log.byType("command.accepted")).toHaveLength(1);
});

test("C30 at 8000 is rejected", async () => {
  const dal = sample("DAL123", "ac-dal");
  const world = createWorld({ aircraft: [dal] });
  const result = await handleRadioText(world, "DAL123 C30", new SessionLog());
  expect(result.accepted).toBe(false);
});

test("ambiguous suffix 123 is rejected", async () => {
  const world = createWorld({
    aircraft: [sample("DAL123", "ac-dal"), sample("AAL123", "ac-aal")],
  });
  const result = await handleRadioText(world, "123 H270", new SessionLog());
  expect(result.accepted).toBe(false);
});

test("AAL123 D30 while cleared for approach rejects with unable readback", async () => {
  const aal = sample("AAL123", "ac-aal");
  aal.intent.clearedApproachId = "ILS27";
  const world = createWorld({
    aircraft: [aal],
    catalog: {
      airportId: "KDEM",
      approaches: [
        {
          id: "ILS27",
          type: "ILS",
          courseDeg: 270,
          fafDistanceNm: 6,
          thresholdFixId: "RW27",
        },
      ],
      fixes: [],
      navaids: [],
      stars: [],
      sids: [],
    },
  });
  const result = await handleRadioText(world, "AAL123 D30", new SessionLog());
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("ALTITUDE");
  expect(result.readback).toBe("American 123 unable. cleared for the ILS already.");
});

test("AAL123 S180 inside 5 DME boundary rejects with unable readback", async () => {
  const aal = sample("AAL123", "ac-aal");
  aal.xNm = 4;
  aal.yNm = 0;
  aal.headingDeg = 270;
  aal.intent.clearedApproachId = "ILS27";
  const world = createWorld({
    aircraft: [aal],
    catalog: {
      airportId: "KDEM",
      approaches: [
        {
          id: "ILS27",
          type: "ILS",
          courseDeg: 270,
          fafDistanceNm: 6,
          thresholdFixId: "RW27",
        },
      ],
      fixes: [],
      navaids: [],
      stars: [],
      sids: [],
    },
  });
  const result = await handleRadioText(world, "AAL123 S180", new SessionLog());
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("SPEED");
  expect(result.readback).toBe("American 123 unable. restriction too close to 5 DME");
});

test("AAL123 DSR is accepted and mutates intent", async () => {
  const aal = sample("AAL123", "ac-aal");
  aal.intent.controllerAssignedSpeedKt = 210;
  const world = createWorld({ aircraft: [aal] });
  const result = await handleRadioText(world, "AAL123 DSR", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(aal.intent.speedRestrictionsDeleted).toBe(true);
  expect(aal.intent.controllerAssignedSpeedKt).toBeUndefined();
  expect(result.readback).toBe("American 123 delete speed restrictions");
});

test("AAL123 H240 while cleared for approach maintains clearedApproachId and INTERCEPT_LOC", async () => {
  const aal = sample("AAL123", "ac-aal");
  aal.intent.clearedApproachId = "ILS27";
  aal.intent.lateral = { type: "INTERCEPT_LOC", approachId: "ILS27" };
  const world = createWorld({ aircraft: [aal] });
  const result = await handleRadioText(world, "AAL123 H240", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(aal.intent.assignedHeadingDeg).toBe(240);
  expect(aal.intent.clearedApproachId).toBe("ILS27");
  expect(aal.intent.lateral).toEqual({ type: "INTERCEPT_LOC", approachId: "ILS27" });
});
