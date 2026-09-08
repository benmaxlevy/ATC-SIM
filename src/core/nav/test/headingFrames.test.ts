import {
  magneticToTrueDeg,
  trueToMagneticDeg,
  type MagneticHeadingDeg,
  type TrueHeadingDeg,
} from "../headingFrames";
import { describe, expect, test } from "vitest";

describe("heading-frame conversions", () => {
  test.each([
    [0, 0, 0],
    [10, 5, 15],
    [2, -5, 357],
    [355, 5, 0],
  ])("magnetic %d with variation %d gives true %d", (magnetic, variation, expected) => {
    expect(magneticToTrueDeg(magnetic as MagneticHeadingDeg, variation)).toBe(expected);
  });

  test.each([
    [0, 0, 0],
    [15, 5, 10],
    [357, -5, 2],
    [0, 5, 355],
  ])("true %d with variation %d gives magnetic %d", (trueHeading, variation, expected) => {
    expect(trueToMagneticDeg(trueHeading as TrueHeadingDeg, variation)).toBe(expected);
  });

  test.each([0, 5, -5])("round-trips at %d degrees variation", (variation) => {
    for (const magnetic of [0, 90, 180, 359]) {
      const trueHeading = magneticToTrueDeg(magnetic as MagneticHeadingDeg, variation);
      expect(trueToMagneticDeg(trueHeading, variation)).toBe(magnetic);
    }
  });
});
