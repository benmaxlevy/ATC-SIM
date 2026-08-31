import { expect, test, vi } from "vitest";
import { PARSE_ERROR, parseCommand } from "@parse";
import {
  DEFAULT_PARSE_URL,
  MAX_PATH_C_FIXES,
  PATH_C_SCHEMA_VERSION,
  createParsePathC,
  fetchParsePathC,
  isLegalInstruction,
  schemaCheckPathC,
  type PathCRequest,
  type PathCSuccess,
  type ParsePathCFn,
} from "./path-c";

const HEADING: PathCSuccess = {
  callsignToken: null,
  instructions: [{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }],
};

const LEGAL_BODY = {
  ok: true as const,
  callsignToken: null as string | null,
  instructions: HEADING.instructions,
};

const REQ: PathCRequest = {
  text: "pizza the runway",
  source: "voice",
  schemaVersion: PATH_C_SCHEMA_VERSION,
};

test("AC6 — path-c source does not call paid LLM hosts", async () => {
  const sources = import.meta.glob(["./*.{ts,tsx}", "./spoken/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const banned = /openai\.com|api\.groq\.com|api-inference\.huggingface\.co/i;
  const production = Object.entries(sources).filter(([path]) => !path.includes(".test."));
  expect(production.length).toBeGreaterThan(0);
  for (const [path, src] of production) {
    expect(src, path).not.toMatch(banned);
  }
  const src = sources["./path-c.ts"]!;
  const command = sources["./parse-command.ts"]!;
  expect(src).toContain("127.0.0.1:8090/parse");
  expect(src).not.toMatch(/\/ground/);
  expect(command).not.toMatch(/\/ground/);
});

test("required parse fields are text, source, schemaVersion; context is optional", () => {
  const keys = Object.keys(REQ).sort();
  expect(keys).toEqual(["schemaVersion", "source", "text"]);
  expect(PATH_C_SCHEMA_VERSION).toBe("command-ir-v0");
  expect(DEFAULT_PARSE_URL).toBe("http://127.0.0.1:8090/parse");
});

test("AC2 — pathC false never fetches even on pizza the runway", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => HEADING);
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const result = await parseCommand("pizza the runway", {
    source: "voice",
    pathC: false,
    parsePathC,
  });
  expect(result.ok).toBe(false);
  expect(parsePathC).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test("AC3 — local miss + pathC true + legal FLY_HEADING is llm_c", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => HEADING);
  const result = await parseCommand("pizza the runway", {
    source: "voice",
    selectedCallsign: "DAL123",
    pathC: true,
    parsePathC,
  });
  expect(parsePathC).toHaveBeenCalledTimes(1);
  expect(parsePathC).toHaveBeenCalledWith({
    text: "pizza the runway",
    source: "voice",
    schemaVersion: PATH_C_SCHEMA_VERSION,
    context: { callsigns: [], selectedCallsign: "DAL123" },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.source).toBe("voice");
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
  expect(result.sourceText).toBe("pizza the runway");
});

test("AC4 — CHAT type is a miss, no instructions dispatched", async () => {
  const parsePathC: ParsePathCFn = async () =>
    schemaCheckPathC({
      ok: true,
      callsignToken: null,
      instructions: [{ type: "CHAT", text: "hi" }],
    });
  const result = await parseCommand("pizza the runway", {
    source: "voice",
    pathC: true,
    parsePathC,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain(PARSE_ERROR.PARSE_MISS);
  }
  expect(isLegalInstruction({ type: "CHAT" })).toBe(false);
  expect(isLegalInstruction({ type: "DESCEND_VIA", procedureId: "DEM1" })).toBe(true);
  expect(isLegalInstruction({ type: "DESCEND_VIA", procedureId: "DEM1", transitionId: "WN" })).toBe(
    true,
  );
  expect(isLegalInstruction({ type: "JOIN_PROCEDURE", procedureId: "DEM1" })).toBe(true);
  expect(
    isLegalInstruction({ type: "JOIN_PROCEDURE", procedureId: "DEM1", transitionId: "WN" }),
  ).toBe(true);
  expect(isLegalInstruction({ type: "CLIMB_VIA", procedureId: "BAY1", transitionId: "WN" })).toBe(
    false,
  );
  expect(
    isLegalInstruction({
      type: "CROSS",
      fixId: "NEMAX",
      altitudeFt: 4000,
      restriction: "AT",
    }),
  ).toBe(true);
  expect(isLegalInstruction({ type: "DESCEND_VIA" })).toBe(false);
  expect(isLegalInstruction({ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" })).toBe(true);
  expect(isLegalInstruction({ type: "GO_AROUND" })).toBe(true);
  expect(isLegalInstruction({ type: "GO_AROUND", extra: true })).toBe(false);
});

test("AC5 — fetch throw or 503 is a miss, no uncaught exception", async () => {
  const throwing: ParsePathCFn = async () => {
    throw new Error("network down");
  };
  await expect(
    parseCommand("pizza the runway", { source: "voice", pathC: true, parsePathC: throwing }),
  ).resolves.toMatchObject({ ok: false });

  const status503 = vi.fn(async () => new Response("{}", { status: 503 }));
  const from503 = await fetchParsePathC(REQ, { fetch: status503, timeoutMs: 1000 });
  expect(from503).toBeNull();
  const result = await parseCommand("pizza the runway", {
    source: "voice",
    pathC: true,
    parsePathC: createParsePathC({ fetch: status503, timeoutMs: 1000 }),
  });
  expect(result.ok).toBe(false);
});

test("AC12 — timeout is a miss, no uncaught exception", async () => {
  const hanging = () => new Promise<Response>(() => {});
  const result = await parseCommand("pizza the runway", {
    source: "voice",
    pathC: true,
    parsePathC: createParsePathC({ fetch: hanging, timeoutMs: 25 }),
  });
  expect(result.ok).toBe(false);
});

test("AC13 — typed hit does not fetch Path C even when pathC true", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => HEADING);
  const typed = await parseCommand("H270", {
    source: "text",
    pathC: true,
    parsePathC,
  });
  expect(typed.ok).toBe(true);
  if (typed.ok) {
    expect(typed.parseStage).toBe("typed");
  }
  expect(parsePathC).not.toHaveBeenCalled();
});

test("AC13 — Path A hit does not fetch Path C even when pathC true", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => HEADING);
  const spoken = await parseCommand("turn left heading two seven zero", {
    source: "voice",
    selectedCallsign: "DAL123",
    pathC: true,
    parsePathC,
  });
  expect(spoken.ok).toBe(true);
  if (spoken.ok) {
    expect(spoken.parseStage).toBe("spoken_a");
  }
  expect(parsePathC).not.toHaveBeenCalled();
});

test("AC13 — Path B hit does not fetch Path C even when pathC true", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => HEADING);
  const pathB = await parseCommand("heading two seven zero", {
    source: "voice",
    selectedCallsign: "DAL123",
    pathC: true,
    parsePathC,
  });
  expect(pathB.ok).toBe(true);
  if (pathB.ok) {
    expect(pathB.parseStage).toBe("spoken_b");
  }
  expect(parsePathC).not.toHaveBeenCalled();
});

test("Path C null callsign is filled from spoken telephony in the transcript", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "ALTITUDE", altitudeFt: 5000, verb: "DESCEND", expedite: true }],
  }));
  const result = await parseCommand("Southwest 203 pizza the runway", {
    source: "voice",
    pathC: true,
    parsePathC,
  });
  expect(parsePathC).toHaveBeenCalledTimes(1);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.callsignToken).toBe("SWA203");
});

test("Path C grounds giblet 204 iden onto unique on-frequency SWA204", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "IDENT" }],
  }));
  const result = await parseCommand("giblet 204 iden", {
    source: "voice",
    pathC: true,
    callsigns: ["DAL123", "SWA204", "JBU17"],
    parsePathC,
  });
  expect(parsePathC).toHaveBeenCalledWith({
    text: "giblet 204 iden",
    source: "voice",
    schemaVersion: PATH_C_SCHEMA_VERSION,
    context: { callsigns: ["DAL123", "SWA204", "JBU17"], selectedCallsign: null },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.callsignToken).toBe("SWA204");
  expect(result.instructions).toEqual([{ type: "IDENT" }]);
});

test("Path C DIRECT C-Max snaps onto catalog SEMAX and sends fixes=", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "DIRECT", fixId: "C-Max" }],
  }));
  const result = await parseCommand("pizza the runway to C-Max", {
    source: "voice",
    selectedCallsign: "DAL123",
    pathC: true,
    fixes: ["NEMAX", "SEMAX", "MERGE"],
    parsePathC,
  });
  expect(parsePathC).toHaveBeenCalledWith({
    text: "pizza the runway to C-Max",
    source: "voice",
    schemaVersion: PATH_C_SCHEMA_VERSION,
    context: {
      callsigns: [],
      selectedCallsign: "DAL123",
      fixes: ["NEMAX", "SEMAX", "MERGE"],
    },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.instructions).toEqual([{ type: "DIRECT", fixId: "SEMAX" }]);
});

test("Path C DESCEND_VIA DEMO1 snaps onto catalog DEM1", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: "DAL200",
    instructions: [{ type: "DESCEND_VIA", procedureId: "DEMO1" }],
  }));
  const result = await parseCommand("pizza via demo 1", {
    source: "voice",
    selectedCallsign: "DAL200",
    pathC: true,
    procedures: [{ id: "DEM1", name: "DEMO ONE" }],
    parsePathC,
  });
  expect(parsePathC).toHaveBeenCalledWith({
    text: "pizza via demo 1",
    source: "voice",
    schemaVersion: PATH_C_SCHEMA_VERSION,
    context: {
      callsigns: [],
      selectedCallsign: "DAL200",
      procedures: [{ id: "DEM1", name: "DEMO ONE" }],
    },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.instructions).toEqual([{ type: "DESCEND_VIA", procedureId: "DEM1" }]);
});

test("Path C TURN_DEGREES on a heading assignment is repaired to FLY_HEADING", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "TURN_DEGREES", direction: "LEFT", degrees: 270 }],
  }));
  const result = await parseCommand("giblet 204 turn left heading 270", {
    source: "voice",
    pathC: true,
    callsigns: ["SWA204"],
    parsePathC,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.callsignToken).toBe("SWA204");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
});

test("Path C CLEARED_APPROACH RW27 and INTERCEPT_LOCALIZER IL27 snap onto catalog ILS27", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: "DAL123",
    instructions: [
      { type: "INTERCEPT_LOCALIZER", approachId: "IL27" },
      { type: "CLEARED_APPROACH", approachId: "RW27" },
    ],
  }));
  const result = await parseCommand("pizza intercept 27 cleared 27", {
    source: "voice",
    pathC: true,
    selectedCallsign: "DAL123",
    approaches: [{ id: "ILS27", name: "ILS RWY 27", runway: "27" }],
    parsePathC,
  });
  expect(parsePathC).toHaveBeenCalledWith({
    text: "pizza intercept 27 cleared 27",
    source: "voice",
    schemaVersion: PATH_C_SCHEMA_VERSION,
    context: {
      callsigns: [],
      selectedCallsign: "DAL123",
      approaches: [{ id: "ILS27", name: "ILS RWY 27", runway: "27" }],
    },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.instructions).toEqual([
    { type: "INTERCEPT_LOCALIZER", approachId: "ILS27" },
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
  ]);
});

test("schemaCheckPathC accepts legal FLY_HEADING and rejects extra keys", () => {
  expect(schemaCheckPathC(LEGAL_BODY)).toEqual(HEADING);
  expect(
    schemaCheckPathC({
      ok: true,
      callsignToken: null,
      instructions: [{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT", chat: true }],
    }),
  ).toBeNull();
  expect(schemaCheckPathC({ ok: true, callsignToken: null, instructions: [] })).toBeNull();
});

test("default fetch body has no n-best or confidence", async () => {
  const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["schemaVersion", "source", "text"]);
    expect(body).not.toHaveProperty("confidence");
    expect(body).not.toHaveProperty("nbest");
    return new Response(JSON.stringify(LEGAL_BODY), { status: 200 });
  });
  const hit = await fetchParsePathC(REQ, { fetch: fetchSpy });
  expect(hit).toEqual(HEADING);
});

test("fetch body may include roster and catalog fixes but never n-best or confidence", async () => {
  const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("confidence");
    expect(body).not.toHaveProperty("nbest");
    expect(body.context).toEqual({
      callsigns: ["SWA204"],
      selectedCallsign: "SWA204",
      fixes: ["SEMAX", "NEMAX"],
    });
    return new Response(JSON.stringify(LEGAL_BODY), { status: 200 });
  });
  await fetchParsePathC(
    {
      ...REQ,
      context: {
        callsigns: ["SWA204"],
        selectedCallsign: "SWA204",
        fixes: ["SEMAX", "NEMAX"],
      },
    },
    { fetch: fetchSpy },
  );
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

function padFixes(count: number, extra: readonly string[]): string[] {
  const padding = Array.from({ length: count }, (_, i) => `PAD${String(i).padStart(2, "0")}`);
  return [...padding, ...extra];
}

test("AC1 — unique Haynes margin snap does not fetch Path C", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => HEADING);
  const result = await parseCommand("proceed direct Haynes", {
    source: "voice",
    pathC: true,
    parsePathC,
    fixes: ["HAINZ", "AJAAY", "NEMAX"],
  });
  expect(parsePathC).not.toHaveBeenCalled();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage === "spoken_a" || result.parseStage === "spoken_b").toBe(true);
  expect(result.parseStage).not.toBe("llm_c");
  expect(result.instructions).toEqual([{ type: "DIRECT", fixId: "HAINZ" }]);
});

test("T03-20 AC2 — within-margin Haynes tie injects Path C with retrieved cluster", async () => {
  const padding = padFixes(80, []);
  const catalog = padFixes(80, ["HAINZ", "HAYNZ", "AJAAY"]);
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "DIRECT", fixId: "HAINZ" }],
  }));
  const result = await parseCommand("proceed direct Haynes", {
    source: "voice",
    selectedCallsign: "DAL123",
    pathC: true,
    parsePathC,
    fixes: catalog,
  });
  expect(parsePathC).toHaveBeenCalledTimes(1);
  const sent = parsePathC.mock.calls[0]![0].context?.fixes ?? [];
  expect(sent.length).toBeGreaterThan(0);
  expect(sent.length).toBeLessThanOrEqual(MAX_PATH_C_FIXES);
  expect(sent.length).toBeLessThan(catalog.length);
  expect(sent).not.toHaveLength(64);
  expect(sent).toEqual(expect.arrayContaining(["HAINZ", "HAYNZ"]));
  expect(sent).not.toEqual(catalog);
  expect(sent).not.toEqual(catalog.slice(0, 64));
  for (const id of padding.slice(0, 64)) {
    expect(sent).not.toContain(id);
  }
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.instructions).toEqual([{ type: "DIRECT", fixId: "HAINZ" }]);
});

test("AC2 — Haynes tie with 80 padding sends retrieved cluster, not file-order 64", async () => {
  // HAYNS unique-snaps Haynes (edit distance 1). HAYNZ is the fold-tie with HAINZ.
  const padding = padFixes(80, []);
  expect(padding).toHaveLength(80);
  const catalog = padFixes(80, ["HAINZ", "HAYNZ"]);
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "DIRECT", fixId: "HAINZ" }],
  }));
  const result = await parseCommand("proceed direct Haynes", {
    source: "voice",
    selectedCallsign: "DAL123",
    pathC: true,
    parsePathC,
    fixes: catalog,
  });
  expect(parsePathC).toHaveBeenCalledTimes(1);
  const req = parsePathC.mock.calls[0]![0];
  expect(req).not.toHaveProperty("nbest");
  expect(req).not.toHaveProperty("confidence");
  expect(req.context?.fixes).toBeDefined();
  const sent = req.context?.fixes ?? [];
  expect(sent.length).toBeGreaterThan(0);
  expect(sent.length).toBeLessThanOrEqual(MAX_PATH_C_FIXES);
  expect(sent).toEqual(expect.arrayContaining(["HAINZ", "HAYNZ"]));
  expect(sent).not.toEqual(expect.arrayContaining(padding.slice(0, 64)));
  for (const id of padding.slice(0, 64)) {
    expect(sent).not.toContain(id);
  }
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.instructions).toEqual([{ type: "DIRECT", fixId: "HAINZ" }]);
});

test("AC3 — spoken ungrounded Haynes with pathC false is PARSE_MISS", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => HEADING);
  const voice = await parseCommand("proceed direct Haynes", {
    source: "voice",
    pathC: false,
    parsePathC,
    fixes: ["HAINZ", "HAYNZ"],
  });
  const typedLine = await parseCommand("proceed direct Haynes", {
    source: "text",
    pathC: false,
    parsePathC,
    fixes: ["HAINZ", "HAYNZ"],
  });
  expect(parsePathC).not.toHaveBeenCalled();
  expect(voice.ok).toBe(false);
  expect(typedLine.ok).toBe(false);
  if (!voice.ok) {
    expect(voice.error).toContain(PARSE_ERROR.PARSE_MISS);
  }
  if (!typedLine.ok) {
    expect(typedLine.error).toContain(PARSE_ERROR.PARSE_MISS);
  }
});

test("typed DCT NOPE with pathC false still ok-parses for pilot UNKNOWN_FIX", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => HEADING);
  const result = await parseCommand("DCT NOPE", {
    source: "text",
    pathC: false,
    parsePathC,
    fixes: ["HAINZ", "NEMAX"],
  });
  expect(parsePathC).not.toHaveBeenCalled();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("typed");
  expect(result.instructions).toEqual([{ type: "DIRECT", fixId: "NOPE" }]);
  expect(result.ungroundedFixes).toEqual(["NOPE"]);
});

test("empty retrieve on Haynes does not pad Path C or dispatch a fake id", async () => {
  const padding = padFixes(80, []);
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "DIRECT", fixId: "HAYNES" }],
  }));
  const result = await parseCommand("proceed direct Haynes", {
    source: "voice",
    pathC: true,
    parsePathC,
    fixes: padding,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain(PARSE_ERROR.PARSE_MISS);
  }
  if (parsePathC.mock.calls.length > 0) {
    const sent = parsePathC.mock.calls[0]![0].context?.fixes ?? [];
    expect(sent).not.toEqual(expect.arrayContaining(padding.slice(0, 64)));
    expect(sent).not.toContain("HAYNES");
  }
});

test("Path C mock DIRECT HAYNES not in context.fixes is not dispatched", async () => {
  const catalog = padFixes(80, ["HAINZ", "HAYNZ"]);
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "DIRECT", fixId: "HAYNES" }],
  }));
  const result = await parseCommand("proceed direct Haynes", {
    source: "voice",
    pathC: true,
    parsePathC,
    fixes: catalog,
  });
  expect(parsePathC).toHaveBeenCalledTimes(1);
  const sent = parsePathC.mock.calls[0]![0].context?.fixes ?? [];
  expect(sent).toEqual(expect.arrayContaining(["HAINZ", "HAYNZ"]));
  expect(sent).not.toContain("HAYNES");
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain(PARSE_ERROR.PARSE_MISS);
  }
});

test("ASR EAGLE d=2 salvage injects Path C with EAGYL, not file-order 64", async () => {
  const padding = padFixes(80, []);
  const catalog = padFixes(80, ["EAGYL", "EAONE", "EUGNE", "TALLE"]);
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "DIRECT", fixId: "EAGYL" }],
  }));
  const result = await parseCommand("proceed direct eagle", {
    source: "voice",
    selectedCallsign: "DAL123",
    pathC: true,
    parsePathC,
    fixes: catalog,
  });
  expect(parsePathC).toHaveBeenCalledTimes(1);
  const sent = parsePathC.mock.calls[0]![0].context?.fixes ?? [];
  expect(sent.length).toBeGreaterThan(0);
  expect(sent.length).toBeLessThanOrEqual(MAX_PATH_C_FIXES);
  expect(sent).toEqual(expect.arrayContaining(["EAGYL"]));
  expect(sent).not.toEqual(catalog.slice(0, 64));
  expect(sent).not.toEqual(expect.arrayContaining(padding.slice(0, 64)));
  for (const id of padding.slice(0, 64)) {
    expect(sent).not.toContain(id);
  }
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.instructions).toEqual([{ type: "DIRECT", fixId: "EAGYL" }]);
});

test("pizza the runway with a large catalog does not send file-order 64 fixes", async () => {
  const padding = padFixes(80, []);
  const parsePathC = vi.fn<ParsePathCFn>(async () => HEADING);
  const result = await parseCommand("pizza the runway", {
    source: "voice",
    selectedCallsign: "DAL123",
    pathC: true,
    parsePathC,
    fixes: padding,
  });
  expect(parsePathC).toHaveBeenCalledTimes(1);
  const sent = parsePathC.mock.calls[0]![0].context?.fixes;
  expect(sent).toBeUndefined();
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.parseStage).toBe("llm_c");
  }
});
