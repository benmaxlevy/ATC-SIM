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

test("parse-command source does not import fetch or a path-c module", async () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./parse-command.ts"];
  expect(src).toBeDefined();
  expect(src).not.toMatch(/\bfetch\s*\(/);
  expect(src).not.toMatch(/path-c/);
  expect(src).not.toMatch(/from\s+["']\.\/path-c["']/);
});
