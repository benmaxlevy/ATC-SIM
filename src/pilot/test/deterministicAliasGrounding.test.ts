import { expect, test } from "vitest";
import { createAircraft, createWorld, SessionLog, setSelectedAircraft } from "@core";
import { handleRadioText } from "../handleRadioText";

function aircraft(id: string, callsign: string, alias: string) {
  return createAircraft({
    id,
    callsign,
    spokenAliases: [alias],
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 5000,
    speedKt: 120,
  });
}

test("alias dispatches canonical command to intended aircraft, not selection", async () => {
  const target = aircraft("target", "N123", "Skyhawk");
  const selected = aircraft("selected", "N456", "Archer");
  const world = createWorld({ aircraft: [target, selected] });
  setSelectedAircraft(world, selected.id);
  const beforeSelected = selected.intent.assignedHeadingDeg;

  const result = await handleRadioText(world, "Skyhawk 123 H270", new SessionLog());

  expect(result.accepted).toBe(true);
  expect(target.intent.assignedHeadingDeg).toBe(270);
  expect(selected.intent.assignedHeadingDeg).toBe(beforeSelected);
  expect(result.command?.callsign).toBe("N123");
});

test("ambiguous alias is a parse miss with no aircraft mutation", async () => {
  const first = aircraft("first", "N123", "Skyhawk");
  const second = aircraft("second", "N456", "Skyhawk");
  const world = createWorld({ aircraft: [first, second], selectedAircraftId: second.id });
  const before = [first.intent.assignedHeadingDeg, second.intent.assignedHeadingDeg];
  const log = new SessionLog();

  const result = await handleRadioText(world, "Skyhawk 123 H270", log);

  expect(result).toMatchObject({ accepted: false, reason: "PARSE" });
  expect(first.intent.assignedHeadingDeg).toBe(before[0]);
  expect(second.intent.assignedHeadingDeg).toBe(before[1]);
  expect(log.byType("command.rejected")[0]?.command).toBeNull();
});
