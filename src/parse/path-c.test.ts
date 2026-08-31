import { expect, test, vi } from "vitest";
import { parseCommand } from "@parse";
import {
  DEFAULT_PARSE_URL,
  PATH_C_SCHEMA_VERSION,
  fetchParsePathC,
  type ParsePathCFn,
  type PathCRequest,
  type PathCSuccess,
} from "./path-c";

const HEADING: PathCSuccess = {
  callsignToken: null,
  instructions: [{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }],
};

const REQ: PathCRequest = {
  text: "pizza the runway",
  source: "voice",
  schemaVersion: PATH_C_SCHEMA_VERSION,
};

test("path-c source does not call paid LLM hosts", async () => {
  const sources = import.meta.glob(["./*.{ts,tsx}", "./spoken/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const banned = /openai\.com|api\.groq\.com|api-inference\.huggingface\.co/i;
  const production = Object.entries(sources).filter(([path]) => !path.includes(".test."));
  for (const [path, src] of production) {
    expect(src, path).not.toMatch(banned);
  }
  expect(DEFAULT_PARSE_URL).toBe("http://127.0.0.1:8090/parse");
});

test("pathC false never fetches", async () => {
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

test("local miss + pathC true + legal FLY_HEADING is llm_c", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => HEADING);
  const result = await parseCommand("pizza the runway", {
    source: "voice",
    selectedCallsign: "DAL123",
    pathC: true,
    parsePathC,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.parseStage).toBe("llm_c");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
});

test("fetch throw or 503 is a miss", async () => {
  const throwing: ParsePathCFn = async () => {
    throw new Error("network down");
  };
  await expect(
    parseCommand("pizza the runway", { source: "voice", pathC: true, parsePathC: throwing }),
  ).resolves.toMatchObject({ ok: false });
  const from503 = await fetchParsePathC(REQ, {
    fetch: vi.fn(async () => new Response("{}", { status: 503 })),
    timeoutMs: 1000,
  });
  expect(from503).toBeNull();
});
