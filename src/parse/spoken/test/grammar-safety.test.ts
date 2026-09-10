import { expect, test } from "vitest";
import { parseSpokenGrammar } from "../grammar";

test("missing turn direction uses shortest heading", () => {
  const result = parseSpokenGrammar("fly heading two five zero", null, "fly heading two five zero");
  expect(result).toMatchObject({
    ok: true,
    instructions: [{ type: "FLY_HEADING", headingDeg: 250, turn: "SHORTEST" }],
  });
});

test("spoken heading preserves 290", () => {
  const result = parseSpokenGrammar(
    "turn left heading two nine zero",
    null,
    "turn left heading two nine zero",
  );
  expect(result).toMatchObject({
    ok: true,
    instructions: [{ type: "FLY_HEADING", headingDeg: 290, turn: "LEFT" }],
  });
});
