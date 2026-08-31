import { expect, test } from "vitest";
import { makeTestAircraft } from "@core";
import {
  datablockRect,
  formatAltitudeHundreds,
  formatLimitedDatablock,
  linesForDatablock,
  pointInDatablock,
} from "./datablock";
import { DEFAULT_LEADER_DIR, LEADER_LENGTH_PX } from "./leader";

test("limited datablock is Mode C hundreds only", () => {
  const ac = makeTestAircraft({
    callsign: "DAL123",
    altitudeFt: 3250,
    speedKt: 210,
    aircraftType: "B738",
  });
  ac.intent.assignedAltitudeFt = 4000;
  expect(formatLimitedDatablock(ac)).toEqual({ line1: "033" });
  expect(linesForDatablock(ac, "limited", true, "ABCD")).toEqual({ line1: "033" });
});

test("Mode C hundreds clamp to 000–999", () => {
  expect(formatAltitudeHundreds(-50)).toBe("000");
  expect(formatAltitudeHundreds(100_000)).toBe("999");
  expect(formatAltitudeHundreds(Number.NaN)).toBe("000");
});

test("default L8 offset is north 36 px; rect contains the text cell", () => {
  expect(DEFAULT_LEADER_DIR).toBe(8);
  expect(LEADER_LENGTH_PX).toBe(36);
  const full = datablockRect(100, 200, { line1: "DAL123", line2: "030  21" }, 7.2, 12);
  expect(full.h).toBe(24);
  expect(pointInDatablock(full.x + full.w / 2, full.y + full.h / 2, full)).toBe(true);
  expect(pointInDatablock(100, 200, full)).toBe(false);
});
