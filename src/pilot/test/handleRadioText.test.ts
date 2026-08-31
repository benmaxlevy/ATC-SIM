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
