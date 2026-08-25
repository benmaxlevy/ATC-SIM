import { expect, expectTypeOf, test, vi } from "vitest";
import type { ParseResult } from "@parse";
import { PARSE_ERROR, parseCommand, parseRadioText } from "@parse";

test("parseCommand returns Promise<ParseResult>", () => {
  expectTypeOf(parseCommand).returns.toEqualTypeOf<Promise<ParseResult>>();
});

test("AC1 — voice descend and maintain three thousand (R01 7110.65)", async () => {
  const result = await parseCommand("Delta one two three descend and maintain three thousand", {
    source: "voice",
    pathC: false,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.parseStage).toBe("spoken_a");
  expect(result.source).toBe("voice");
  expect(result.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]);
  expect(result.sourceText).toBe("Delta one two three descend and maintain three thousand");
});

test("AC2 — turn left heading two seven zero uses selected callsign (R01)", async () => {
  const result = await parseCommand("turn left heading two seven zero", {
    source: "voice",
    selectedCallsign: "DAL123",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.parseStage).toBe("spoken_a");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
});

test("AC3 — combined utterance, heading then altitude, one callsign", async () => {
  const result = await parseCommand(
    "Delta one two three turn left heading two seven zero descend and maintain three thousand",
    { source: "voice" },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
    { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
  ]);
  expect(result.parseStage).toBe("spoken_a");
});

test("AC4 — typed H270 is parseStage typed", async () => {
  const result = await parseCommand("H270", { source: "text" });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("typed");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }]);
});

test("compact DAL123 with English is Path A (typed command-line mix)", async () => {
  const result = await parseCommand("DAL123 fly heading two seven zero", { source: "text" });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("spoken_a");
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }]);
});

test("AC4b — typed English is tokenizer miss then spoken_a", async () => {
  const result = await parseCommand("turn left heading two seven zero", {
    source: "text",
    selectedCallsign: "DAL123",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("spoken_a");
  expect(result.source).toBe("text");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
  expect(result.callsignToken).toBe("DAL123");
});

test("AC5 — Path B salvages bare heading two seven zero", async () => {
  const result = await parseCommand("heading two seven zero", {
    source: "voice",
    selectedCallsign: "DAL123",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("spoken_b");
  expect(result.source).toBe("voice");
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }]);
});

test("AC6 — pizza the runway is a parse miss with no instructions", async () => {
  const result = await parseCommand("pizza the runway", { source: "voice" });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain(PARSE_ERROR.PARSE_MISS);
    expect(result.sourceText).toBe("pizza the runway");
  }
});

test("AC7 — homophone heading to two seven zero yields 270", async () => {
  const withTo = await parseCommand("heading to two seven zero", {
    source: "voice",
    selectedCallsign: "DAL123",
  });
  const without = await parseCommand("heading two seven zero", {
    source: "voice",
    selectedCallsign: "DAL123",
  });
  expect(withTo.ok).toBe(true);
  expect(without.ok).toBe(true);
  if (withTo.ok && without.ok) {
    expect(withTo.instructions).toEqual(without.instructions);
    expect(withTo.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    ]);
  }
});

test("AC9 — pathC false does not call fetch", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  await parseCommand("pizza the runway", { source: "voice", pathC: false });
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test("typed token regression L090 and D30", async () => {
  const left = await parseCommand("L090", { source: "text" });
  expect(left.ok).toBe(true);
  if (left.ok) {
    expect(left.parseStage).toBe("typed");
    expect(left.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 90, turn: "LEFT" }]);
  }
  const down = await parseCommand("D30", { source: "text" });
  expect(down.ok).toBe(true);
  if (down.ok) {
    expect(down.parseStage).toBe("typed");
    expect(down.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]);
  }
});

test("parseRadioText still rejects English (tokenizer is not taught English)", () => {
  const result = parseRadioText("heading two seven zero");
  expect(result.ok).toBe(false);
});

test("spoken parse tests run without a DOM", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});

test("parse-command delegates Path C fetch to path-c (does not call fetch itself)", async () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./parse-command.ts"];
  expect(src).toBeDefined();
  expect(src).not.toMatch(/\bfetch\s*\(/);
  expect(src).toMatch(/from\s+["']\.\/path-c["']/);
});

test("ASR transcript Southwest 203 + 5,000 without delay is SWA203 on Path A", async () => {
  const result = await parseCommand("Southwest 203 descend and maintain 5,000 without delay.", {
    source: "voice",
    pathC: false,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("spoken_a");
  expect(result.callsignToken).toBe("SWA203");
  expect(result.instructions).toEqual([
    { type: "ALTITUDE", altitudeFt: 5000, verb: "DESCEND", expedite: true },
  ]);
});

test("ASR turn left heading 270 stays Path A FLY_HEADING (does not fetch Path C)", async () => {
  const parsePathC = vi.fn(async () => ({
    callsignToken: "SWA203",
    instructions: [{ type: "TURN_DEGREES" as const, direction: "LEFT" as const, degrees: 270 }],
  }));
  const result = await parseCommand("Southwest 203 turn left heading 270.", {
    source: "voice",
    pathC: true,
    parsePathC,
  });
  expect(parsePathC).not.toHaveBeenCalled();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("spoken_a");
  expect(result.callsignToken).toBe("SWA203");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
});

test("ASR leftening misses Path A and uses Path C", async () => {
  const parsePathC = vi.fn(async () => ({
    callsignToken: "DAL123",
    instructions: [
      { type: "FLY_HEADING" as const, headingDeg: 150, turn: "LEFT" as const },
      { type: "ALTITUDE" as const, altitudeFt: 5000, verb: "MAINTAIN" as const },
      { type: "SPEED" as const, speedKt: 210, verb: "MAINTAIN" as const },
    ],
  }));
  const result = await parseCommand(
    "Delta one twenty three, turn leftening one five zero, maintain five thousand, maintain two one zero knots.",
    { source: "voice", pathC: true, parsePathC },
  );
  expect(parsePathC).toHaveBeenCalledTimes(1);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 150, turn: "LEFT" },
    { type: "ALTITUDE", altitudeFt: 5000, verb: "MAINTAIN" },
    { type: "SPEED", speedKt: 210, verb: "MAINTAIN" },
  ]);
});

test("T04-05 — spoken ILS vector is Path A heading + untilEstablished + APP", async () => {
  const result = await parseCommand(
    "turn right heading two four zero maintain two thousand until established cleared ils approach runway two seven",
    { source: "voice", selectedCallsign: "DAL123", pathC: false },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("spoken_a");
  expect(result.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 240, turn: "RIGHT" },
    { type: "ALTITUDE", altitudeFt: 2000, verb: "MAINTAIN", untilEstablished: true },
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
  ]);
});

test("catalog snaps spoken C-Max and typed DCT CMAX onto SEMAX", async () => {
  const catalog = ["NEMAX", "SEMAX", "MERGE"];
  const spoken = await parseCommand("proceed direct C-Max", {
    source: "voice",
    selectedCallsign: "DAL123",
    fixes: catalog,
    pathC: false,
  });
  expect(spoken.ok).toBe(true);
  if (spoken.ok) {
    expect(spoken.parseStage).toBe("spoken_a");
    expect(spoken.instructions).toEqual([{ type: "DIRECT", fixId: "SEMAX" }]);
  }

  const typed = await parseCommand("DCT CMAX", {
    source: "text",
    selectedCallsign: "DAL123",
    fixes: catalog,
    pathC: false,
  });
  expect(typed.ok).toBe(true);
  if (typed.ok) {
    expect(typed.parseStage).toBe("typed");
    expect(typed.instructions).toEqual([{ type: "DIRECT", fixId: "SEMAX" }]);
  }
});

test("ASR American201 Direct S Join is Path A DIRECT SJOIN", async () => {
  const catalog = ["SEMAX", "SJOIN", "NJOIN", "MERGE"];
  const parsePathC = vi.fn(async () => ({
    callsignToken: "AAL201",
    instructions: [{ type: "DIRECT" as const, fixId: "American201" }],
  }));
  const result = await parseCommand("American201 Direct S Join", {
    source: "voice",
    fixes: catalog,
    pathC: true,
    parsePathC,
  });
  expect(parsePathC).not.toHaveBeenCalled();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("spoken_a");
  expect(result.callsignToken).toBe("AAL201");
  expect(result.instructions).toEqual([{ type: "DIRECT", fixId: "SJOIN" }]);
});

test("catalog snaps spoken descend via demo 1 onto DEM1", async () => {
  const spoken = await parseCommand("Delta 200 descend via demo 1", {
    source: "voice",
    selectedCallsign: "DAL200",
    procedures: [{ id: "DEM1", name: "DEMO ONE" }],
    pathC: false,
  });
  expect(spoken.ok).toBe(true);
  if (spoken.ok) {
    expect(spoken.parseStage).toBe("spoken_a");
    expect(spoken.callsignToken).toBe("DAL200");
    expect(spoken.instructions).toEqual([{ type: "DESCEND_VIA", procedureId: "DEM1" }]);
  }
});
