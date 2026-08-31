import { expect, test } from "vitest";
import { normalizeSpoken } from "../../spoken/normalizer";

test("AC8 — tests are DOM-free", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});

test("lowercase, punctuation strip, and filler drop", () => {
  expect(normalizeSpoken("Uh, Turn Left Heading Two Seven Zero, please.")).toBe(
    "turn left heading two seven zero",
  );
});

test("ICAO digit aliases niner/tree/fife", () => {
  expect(normalizeSpoken("heading two niner zero")).toBe("heading two nine zero");
  expect(normalizeSpoken("heading tree six zero")).toBe("heading three six zero");
  expect(normalizeSpoken("heading two fife zero")).toBe("heading two five zero");
});

test("oh in digit context becomes zero", () => {
  expect(normalizeSpoken("heading two seven oh")).toBe("heading two seven zero");
});

test("homophone heading to two seven zero drops the extra to", () => {
  expect(normalizeSpoken("heading to two seven zero")).toBe("heading two seven zero");
  expect(normalizeSpoken("heading two seven zero")).toBe("heading two seven zero");
});

test("descend to is not rewritten as two (7110.65, not ICAO climb to)", () => {
  expect(normalizeSpoken("descend to three thousand")).toBe("descend to three thousand");
});

test("typed tokens survive lowercased", () => {
  expect(normalizeSpoken("DAL123 H270")).toBe("dal123 h270");
  expect(normalizeSpoken("L090")).toBe("l090");
  expect(normalizeSpoken("D30")).toBe("d30");
});
