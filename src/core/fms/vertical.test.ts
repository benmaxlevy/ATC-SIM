import { expect, test } from "vitest";
import { targetAltitudeFt } from "@core";

test("targetAltitudeFt holds next AOA/AT while VIA is armed", () => {
  const via = { type: "VIA_STAR" as const, starId: "DEM1", sense: "DESCEND" as const };
  expect(
    targetAltitudeFt({
      assignedFt: 11000,
      vertical: via,
      nextConstraint: { type: "AT_OR_ABOVE", altitudeFt: 10000 },
      onStar: true,
    }),
  ).toBe(10000);
  expect(
    targetAltitudeFt({
      assignedFt: 4000,
      vertical: via,
      nextConstraint: { type: "AT", altitudeFt: 4000 },
      onStar: true,
    }),
  ).toBe(4000);
});
