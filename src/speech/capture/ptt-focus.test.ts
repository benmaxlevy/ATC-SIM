import { expect, test } from "vitest";
import { isTextFieldTarget } from "./ptt-focus";

test("input, textarea, and contenteditable are text fields (AC2)", () => {
  expect(isTextFieldTarget({ tagName: "INPUT" })).toBe(true);
  expect(isTextFieldTarget({ tagName: "input" })).toBe(true);
  expect(isTextFieldTarget({ tagName: "TEXTAREA" })).toBe(true);
  expect(isTextFieldTarget({ isContentEditable: true })).toBe(true);
});

test("canvas, body, and null are not text fields", () => {
  expect(isTextFieldTarget(null)).toBe(false);
  expect(isTextFieldTarget({ tagName: "CANVAS" })).toBe(false);
  expect(isTextFieldTarget({ tagName: "BODY" })).toBe(false);
  expect(isTextFieldTarget({ tagName: "BUTTON" })).toBe(false);
});

test("closest() matching an input counts as focused text field", () => {
  const target = {
    tagName: "SPAN",
    closest: (selector: string) => (selector.includes("input") ? {} : null),
  };
  expect(isTextFieldTarget(target)).toBe(true);
});
