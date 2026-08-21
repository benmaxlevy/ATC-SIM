import { expect, test } from "vitest";
import { echoCommandLine, submitCommandLine } from "./echo-command-line";

test('echoCommandLine("  H270  ") === "H270" (AC5)', () => {
  expect(echoCommandLine("  H270  ")).toBe("H270");
});

test("echoCommandLine on whitespace does not throw (AC5)", () => {
  expect(() => echoCommandLine("   ")).not.toThrow();
  expect(echoCommandLine("   ")).toBe("");
});

test("submitCommandLine ignores empty trim (AC5)", () => {
  expect(submitCommandLine("H270", "   ")).toBe("H270");
  expect(submitCommandLine("", "   ")).toBe("");
  expect(submitCommandLine("old", "  hello  ")).toBe("hello");
});
