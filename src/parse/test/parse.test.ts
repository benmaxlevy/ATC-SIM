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

test.each(["Giant 123 heading 270", "Giant 123 heavy heading 270"])(
  "%s resolves the same callsign",
  async (text) => {
    const result = await parseCommand(text, {
      source: "voice",
      callsigns: ["GTI123"],
      pathC: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.callsignToken).toBe("GTI123");
    expect(result.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    ]);
  },
);

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

test("explicit spoken callsign grounds uniquely and never uses selection to override it", async () => {
  const result = await parseCommand("Delta one two three heading two seven zero", {
    source: "voice",
    selectedCallsign: "UAL456",
    callsigns: ["DAL123", "UAL456"],
    pathC: false,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.callsignToken).toBe("DAL123");
});

test("ambiguous callsign suffix is a parse miss", async () => {
  const result = await parseCommand("radio check", {
    source: "voice",
    selectedCallsign: "DAL204",
    callsigns: ["DAL204", "UAL204"],
    pathC: true,
    parsePathC: async () => ({
      callsignToken: "204",
      instructions: [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }],
    }),
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain(PARSE_ERROR.PARSE_MISS);
});

test("selected callsign is used only when spoken callsign is absent", async () => {
  const result = await parseCommand("heading two seven zero", {
    source: "voice",
    selectedCallsign: "DAL123",
    callsigns: ["DAL123"],
    pathC: false,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.callsignToken).toBe("DAL123");
});

test.each([
  "Delta one two three climb maintain flight level one eight zero",
  "Delta one two three climb and maintain flight level one eight zero",
])("climb maintain variants preserve the same altitude instruction: %s", async (text) => {
  const result = await parseCommand(text, { source: "voice", pathC: false });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 18000, verb: "CLIMB" }]);
});

test("heading plus speed preserves both instructions in order", async () => {
  const result = await parseCommand(
    "Delta one two three turn right heading two nine zero maintain one ninety knots",
    { source: "voice", pathC: false },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 290, turn: "RIGHT" },
    { type: "SPEED", speedKt: 190, verb: "MAINTAIN" },
  ]);
});

test.each(["descend via the demo one arrival", "descend by the demo one arrival"])(
  "safe descend via/by variant requires a known procedure: %s",
  async (text) => {
    const result = await parseCommand(text, {
      source: "voice",
      procedures: [{ id: "DEM1", name: "DEMO ONE" }],
      pathC: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.instructions).toEqual([{ type: "DESCEND_VIA", procedureId: "DEM1" }]);
  },
);

test("descend by an unknown arrival does not guess a procedure", async () => {
  const result = await parseCommand("descend by the arrival", {
    source: "voice",
    procedures: [{ id: "DEM1", name: "DEMO ONE" }],
    pathC: false,
  });
  expect(result.ok).toBe(false);
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
