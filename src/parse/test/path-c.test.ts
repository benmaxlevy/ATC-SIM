import { expect, test, vi } from "vitest";
import { parseCommand } from "@parse";
import { matchApproachesForTokens, pathCApproachList } from "../parse-command";
import {
  DEFAULT_PARSE_URL,
  PATH_C_SCHEMA_VERSION,
  fetchParsePathC,
  type ParsePathCFn,
  type PathCRequest,
  type PathCSuccess,
} from "../path-c";

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
  const sources = import.meta.glob(["../*.{ts,tsx}", "../spoken/*.{ts,tsx}"], {
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

test("matchApproachesForTokens maps number words to runway numbers (two six right / twenty six right -> 26R)", () => {
  const approaches = [
    { id: "I26R", name: "ILS RWY 26R", runway: "26R" },
    { id: "RW26R", name: "RNAV RWY 26R", runway: "26R" },
    { id: "ILS27", name: "ILS RWY 27", runway: "27" },
  ];

  // "two six right" -> matches I26R
  const hit1 = matchApproachesForTokens(["two", "six", "right"], approaches);
  expect(hit1.length).toBeGreaterThan(0);
  expect(hit1[0]?.id).toBe("I26R");

  // "twenty six right" -> matches I26R
  const hit2 = matchApproachesForTokens(["twenty", "six", "right"], approaches);
  expect(hit2.length).toBeGreaterThan(0);
  expect(hit2[0]?.id).toBe("I26R");

  // "two seven" -> matches ILS27
  const hit3 = matchApproachesForTokens(["two", "seven"], approaches);
  expect(hit3.length).toBeGreaterThan(0);
  expect(hit3[0]?.id).toBe("ILS27");
});

test("pathCApproachList retains facility approaches when total approaches <= 16", () => {
  const approaches = [
    { id: "ILS27", name: "ILS RWY 27", runway: "27" },
    { id: "ILS09", name: "ILS RWY 09", runway: "09" },
  ];

  // Non-matching queryTokens still retains facility approaches if <= 16
  const result = pathCApproachList(approaches, ["unknown_token"]);
  expect(result).toHaveLength(2);
  expect(result[0]?.id).toBe("ILS27");
});

test("pathCApproachList retains facility approaches when approach cues are present", () => {
  // Create list of 20 approaches (> MAX_PATH_C_FIXES 16)
  const manyApproaches = Array.from({ length: 20 }, (_, idx) => ({
    id: `ILS${idx + 1}`,
    name: `ILS RWY ${idx + 1}`,
    runway: `${idx + 1}`,
  }));

  // With approach cue "ils", returns facility approaches capped at MAX_PATH_C_FIXES
  const withCue = pathCApproachList(manyApproaches, ["ils"]);
  expect(withCue.length).toBe(16);

  // With approach cue "runway", returns facility approaches
  const withRunwayCue = pathCApproachList(manyApproaches, ["runway"]);
  expect(withRunwayCue.length).toBe(16);

  // Without approach cues and without matching tokens, returns empty array
  const withoutCue = pathCApproachList(manyApproaches, ["somewhere"]);
  expect(withoutCue).toHaveLength(0);
});

test("Path C payload context includes retained approaches for cleared approach phraseology", async () => {
  let capturedContext: PathCRequest["context"];
  const parsePathC = vi.fn<ParsePathCFn>(async (req) => {
    capturedContext = req.context;
    return {
      callsignToken: "DAL123",
      instructions: [{ type: "CLEARED_APPROACH", approachId: "I26R" }],
    };
  });

  const facilityApproaches = [
    { id: "I26R", name: "ILS RWY 26R", runway: "26R" },
    { id: "I04L", name: "ILS RWY 04L", runway: "04L" },
  ];

  await parseCommand(
    "Delta one two three join the localizer for runway two six right",
    {
      source: "voice",
      pathC: true,
      parsePathC,
      approaches: facilityApproaches,
    },
  );

  expect(capturedContext).toBeDefined();
  expect(capturedContext?.approaches).toBeDefined();
  expect(capturedContext?.approaches?.some((a) => a.id === "I26R")).toBe(true);
});
