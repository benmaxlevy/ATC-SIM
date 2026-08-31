import { expect, expectTypeOf, test, vi } from "vitest";
import type { ParseResult } from "@parse";
import { PARSE_ERROR, parseCommand, parseRadioText, type ParsePathCFn } from "@parse";

test("parseCommand returns Promise<ParseResult>", () => {
  expectTypeOf(parseCommand).returns.toEqualTypeOf<Promise<ParseResult>>();
});

test("voice descend and maintain three thousand", async () => {
  const result = await parseCommand("Delta one two three descend and maintain three thousand", {
    source: "voice",
    pathC: false,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.callsignToken).toBe("DAL123");
  expect(result.parseStage).toBe("spoken_a");
  expect(result.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]);
});

test("typed H270 is parseStage typed", async () => {
  const result = await parseCommand("H270", { source: "text" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.parseStage).toBe("typed");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }]);
});

test("combined heading then altitude", async () => {
  const result = await parseCommand(
    "Delta one two three turn left heading two seven zero descend and maintain three thousand",
    { source: "voice" },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
    { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
  ]);
});

test("pizza the runway is a parse miss", async () => {
  const result = await parseCommand("pizza the runway", { source: "voice", pathC: false });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain(PARSE_ERROR.PARSE_MISS);
});

test("pathC false does not fetch", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }],
  }));
  await parseCommand("pizza the runway", { source: "voice", pathC: false, parsePathC });
  expect(parsePathC).not.toHaveBeenCalled();
});

test("parseRadioText still rejects English", () => {
  expect(parseRadioText("turn left heading two seven zero").ok).toBe(false);
});
