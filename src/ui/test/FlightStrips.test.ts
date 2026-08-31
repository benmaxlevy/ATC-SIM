import { expect, test } from "vitest";
import { createWorldFromScenario, loadKdem } from "@scenario";
import {
  compareCallsigns,
  formatAssignedAltitudeHundreds,
  formatAssignedHeading,
  formatAssignedSpeed,
  sortStripsByCallsign,
  stripsFromWorld,
} from "../strips/FlightStrips";

test("format assigned heading/altitude/speed from intent", () => {
  expect(formatAssignedHeading(270)).toBe("H270");
  expect(formatAssignedAltitudeHundreds(3000)).toBe("A030");
  expect(formatAssignedSpeed(210)).toBe("S210");
});

test("sort is callsign lexicographic", () => {
  expect(compareCallsigns("AAL45", "DAL123")).toBeLessThan(0);
  expect(
    sortStripsByCallsign([{ callsign: "UAL200" }, { callsign: "AAL45" }]).map((r) => r.callsign),
  ).toEqual(["AAL45", "UAL200"]);
});

test("six spawned KDEM arrivals yield six strips", () => {
  const world = createWorldFromScenario(loadKdem());
  expect(stripsFromWorld(world)).toHaveLength(6);
});
