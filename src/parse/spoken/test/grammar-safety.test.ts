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

test("spoken cancel approach clearance is first and preserves later order", () => {
  const result = parseSpokenGrammar(
    "cancel approach clearance fly heading two seven zero maintain five thousand",
    null,
    "cancel approach clearance, fly heading 270, maintain 5000",
  );
  expect(result).toMatchObject({
    ok: true,
    instructions: [
      { type: "CANCEL_APPROACH" },
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
      { type: "ALTITUDE", altitudeFt: 5000, verb: "MAINTAIN" },
    ],
  });
  const incomplete = parseSpokenGrammar("cancel approach", null, "cancel approach");
  expect(incomplete.ok).toBe(false);
});
