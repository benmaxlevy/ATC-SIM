import { expect, test } from "vitest";
import { isPpiSlewButton, isPpiSlewHeld } from "./ppiPointer";

test("right and middle buttons slew; left does not", () => {
  expect(isPpiSlewButton(0)).toBe(false);
  expect(isPpiSlewButton(1)).toBe(true);
  expect(isPpiSlewButton(2)).toBe(true);
  expect(isPpiSlewHeld(0)).toBe(false);
  expect(isPpiSlewHeld(1)).toBe(false);
  expect(isPpiSlewHeld(2)).toBe(true);
  expect(isPpiSlewHeld(4)).toBe(true);
  expect(isPpiSlewHeld(6)).toBe(true);
});
