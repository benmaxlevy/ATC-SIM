import { expect, test, vi } from "vitest";
import { PARSE_ERROR, parseCommand } from "@parse";
import {
  DEFAULT_PARSE_URL,
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
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./path-c.ts"]!;
  expect(src).not.toMatch(/openai\.com|api\.groq\.com|api-inference\.huggingface\.co/i);
  expect(src).toContain("127.0.0.1:8090/parse");
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
  expect(isLegalInstruction({ type: "CLIMB_VIA", procedureId: "DEM1" })).toBe(true);
  expect(
    isLegalInstruction({
      type: "CROSS",
      fixId: "NEMAX",
      altitudeFt: 4000,
      restriction: "AT",
    }),
  ).toBe(true);
  expect(isLegalInstruction({ type: "DESCEND_VIA" })).toBe(false);
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

test("fetch body may include roster context but never n-best or confidence", async () => {
  const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("confidence");
    expect(body).not.toHaveProperty("nbest");
    expect(body.context).toEqual({ callsigns: ["SWA204"], selectedCallsign: "SWA204" });
    return new Response(JSON.stringify(LEGAL_BODY), { status: 200 });
  });
  await fetchParsePathC(
    {
      ...REQ,
      context: { callsigns: ["SWA204"], selectedCallsign: "SWA204" },
    },
    { fetch: fetchSpy },
  );
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});
