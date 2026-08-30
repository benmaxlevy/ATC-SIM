import { expect, test } from "vitest";
import {
  catalogRunwayId,
  isGroupedBothRunwayRef,
  parseRunwayIdent,
  runwayIdsMatch,
  stripRwPrefix,
} from "./runwayIdentity.ts";

test("strip RW prefix and catalog ids", () => {
  expect(stripRwPrefix("RW26L")).toBe("26L");
  expect(stripRwPrefix("26B")).toBe("26B");
  expect(stripRwPrefix("rw09r")).toBe("09R");
  expect(catalogRunwayId("RW27")).toBe("27");
});

test("parse pads single-digit numbers", () => {
  expect(parseRunwayIdent("RW9B")).toEqual({ number: "09", suffix: "B" });
  expect(parseRunwayIdent("9L")).toEqual({ number: "09", suffix: "L" });
  expect(parseRunwayIdent("RW10")).toEqual({ number: "10", suffix: undefined });
});

test("FAA B means both parallel L/R — 26B/27B/08B/09B", () => {
  expect(isGroupedBothRunwayRef("26B")).toBe(true);
  expect(isGroupedBothRunwayRef("RW27B")).toBe(true);
  expect(isGroupedBothRunwayRef("08B")).toBe(true);
  expect(isGroupedBothRunwayRef("RW09B")).toBe(true);
  expect(runwayIdsMatch("RW26L", "26B")).toBe(true);
  expect(runwayIdsMatch("RW26R", "RW26B")).toBe(true);
  expect(runwayIdsMatch("RW27L", "27B")).toBe(true);
  expect(runwayIdsMatch("RW27R", "27B")).toBe(true);
  expect(runwayIdsMatch("RW08L", "08B")).toBe(true);
  expect(runwayIdsMatch("RW08R", "08B")).toBe(true);
  expect(runwayIdsMatch("RW09L", "09B")).toBe(true);
  expect(runwayIdsMatch("RW09R", "09B")).toBe(true);
});

test("B does not match center, water, or a bare number", () => {
  expect(runwayIdsMatch("RW26C", "26B")).toBe(false);
  expect(runwayIdsMatch("RW08W", "08B")).toBe(false);
  expect(runwayIdsMatch("RW26", "26B")).toBe(false);
  expect(runwayIdsMatch("RW27", "27B")).toBe(false);
});

test("exact RW27 / 27 does not match 27L or 27R", () => {
  expect(runwayIdsMatch("RW27", "27")).toBe(true);
  expect(runwayIdsMatch("27", "RW27")).toBe(true);
  expect(runwayIdsMatch("RW27L", "27")).toBe(false);
  expect(runwayIdsMatch("RW27R", "RW27")).toBe(false);
  expect(runwayIdsMatch("RW26L", "26L")).toBe(true);
  expect(runwayIdsMatch("RW26L", "26R")).toBe(false);
});

test("grouped refs do not jump numbers", () => {
  expect(runwayIdsMatch("RW27L", "26B")).toBe(false);
  expect(runwayIdsMatch("RW02L", "2B")).toBe(true);
  expect(runwayIdsMatch("RW26L", "2B")).toBe(false);
});
