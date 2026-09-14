import { expect, test, vi } from "vitest";
import { parseCommand } from "@parse";
import { matchApproachesForTokens, pathCApproachList } from "../parse-command";
import {
  DEFAULT_PARSE_URL,
  PATH_C_SCHEMA_VERSION,
  fetchParsePathC,
  isLegalInstruction,
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

const ATLANTA = [{ icao: "KATL", name: "Atlanta International" }];

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

test("Path C schema accepts exact discrete/VFR squawk IR and rejects malformed codes", () => {
  expect(isLegalInstruction({ type: "ASSIGN_SQUAWK", code: "0342", source: "DISCRETE" })).toBe(
    true,
  );
  expect(isLegalInstruction({ type: "ASSIGN_SQUAWK", code: "1200", source: "VFR" })).toBe(true);
  expect(isLegalInstruction({ type: "ASSIGN_SQUAWK", code: "1289", source: "DISCRETE" })).toBe(
    false,
  );
  expect(isLegalInstruction({ type: "ASSIGN_SQUAWK", code: "4721", source: "VFR" })).toBe(false);
});

test("Path C keeps airport candidates out of DIRECT and FIX_THEN_DIRECT", async () => {
  const airport = { icao: "KATL", name: "Atlanta International" };
  const direct = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "DIRECT", fixId: "KATL" }],
  }));
  await expect(
    parseCommand("proceed direct KATL", {
      source: "voice",
      airports: [airport],
      pathC: true,
      parsePathC: direct,
    }),
  ).resolves.toMatchObject({ ok: false });

  const fixThenDirect = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        limitId: "KATL",
        access: { type: "FIX_THEN_DIRECT", fixId: "KATL" },
      },
    ],
  }));
  await expect(
    parseCommand("cleared to KATL via KATL then direct", {
      source: "voice",
      airports: [airport],
      pathC: true,
      parsePathC: fixThenDirect,
    }),
  ).resolves.toMatchObject({ ok: false });

  const overlap = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [{ type: "DIRECT", fixId: "KATL" }],
  }));
  await expect(
    parseCommand("proceed direct KATL", {
      source: "voice",
      fixes: ["KATL"],
      airports: [airport],
      pathC: true,
      parsePathC: overlap,
    }),
  ).resolves.toMatchObject({ ok: false });
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

  await parseCommand("Delta one two three join the localizer for runway two six right", {
    source: "voice",
    pathC: true,
    parsePathC,
    approaches: facilityApproaches,
  });

  expect(capturedContext).toBeDefined();
  expect(capturedContext?.approaches).toBeDefined();
  expect(capturedContext?.approaches?.some((a) => a.id === "I26R")).toBe(true);
});

test("IFR route fallback sends only route-window evidence and accepts canonical EXPLICIT_ROUTE", async () => {
  let captured: PathCRequest | undefined;
  const parsePathC = vi.fn<ParsePathCFn>(async (request) => {
    captured = request;
    return {
      callsignToken: "DAL123",
      instructions: [
        {
          type: "IFR_CLEARANCE",
          limitId: "KAHN",
          access: {
            type: "EXPLICIT_ROUTE",
            segments: [
              { type: "DIRECT", fixId: "SEMAX" },
              { type: "DIRECT", fixId: "CD" },
            ],
          },
        },
      ],
    };
  });

  const result = await parseCommand("DAL123 cleared to KAHN via SEE MAX CD", {
    source: "voice",
    fixes: ["KAHN", "SEE", "MAX", "SEMAX", "CD"],
    pathC: true,
    parsePathC,
  });

  expect(result).toMatchObject({
    ok: true,
    parseStage: "llm_c",
    instructions: [
      {
        type: "IFR_CLEARANCE",
        access: {
          type: "EXPLICIT_ROUTE",
          segments: [
            { type: "DIRECT", fixId: "SEMAX" },
            { type: "DIRECT", fixId: "CD" },
          ],
        },
      },
    ],
  });
  expect(captured?.context?.fixes).toBeUndefined();
  expect(captured?.context?.routeWindow?.transcript).toBe("see max cd");
  expect(captured?.context?.routeWindow?.candidates.map((item) => item.id)).toEqual(
    expect.arrayContaining(["SEMAX", "CD"]),
  );
  expect(captured?.context?.routeWindow?.candidates.every((item) => item.spans.length > 0)).toBe(
    true,
  );
  expect(captured?.context?.clearanceLimits?.map((item) => item.id)).toEqual(["KAHN"]);
});

test("IFR route fallback rejects a partial chain", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: "DAL123",
    instructions: [
      {
        type: "IFR_CLEARANCE",
        limitId: "KAHN",
        access: { type: "EXPLICIT_ROUTE", segments: [{ type: "DIRECT", fixId: "AB" }] },
      },
    ],
  }));

  const result = await parseCommand("DAL123 cleared to KAHN via AB CD", {
    source: "voice",
    fixes: ["KAHN", "AB"],
    routeCandidates: [
      { id: "AB", kind: "FIX", aliases: ["AB"] },
      { id: "CD", kind: "FIX", aliases: ["CD"] },
    ],
    pathC: true,
    parsePathC,
  });

  expect(result).toMatchObject({ ok: false, error: "PARSE_MISS" });
  expect(parsePathC).toHaveBeenCalledOnce();
});

test("IFR route fallback rejects an unmatched route token", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: "DAL123",
    instructions: [
      {
        type: "IFR_CLEARANCE",
        limitId: "KAHN",
        access: { type: "EXPLICIT_ROUTE", segments: [{ type: "DIRECT", fixId: "AB" }] },
      },
    ],
  }));

  const result = await parseCommand("DAL123 cleared to KAHN via AB UNKNOWN", {
    source: "voice",
    fixes: ["KAHN", "AB"],
    routeCandidates: [{ id: "AB", kind: "FIX", aliases: ["AB"] }],
    pathC: true,
    parsePathC,
  });

  expect(result).toMatchObject({ ok: false, error: "PARSE_MISS" });
  expect(parsePathC).toHaveBeenCalledOnce();
});

test("IFR route fallback rejects a concatenated or tactical direct", async () => {
  const outputs = [
    {
      callsignToken: "EDV7114",
      instructions: [
        {
          type: "IFR_CLEARANCE" as const,
          limitId: "KATL",
          access: {
            type: "EXPLICIT_ROUTE" as const,
            segments: [{ type: "DIRECT" as const, fixId: "SWEPT_KIMMY" }],
          },
        },
      ],
    },
    {
      callsignToken: "EDV1155",
      instructions: [{ type: "DIRECT" as const, fixId: "ATL" }],
    },
  ];
  for (const output of outputs) {
    const parsePathC = vi.fn<ParsePathCFn>(async () => output);
    const result = await parseCommand(
      output.instructions[0]?.type === "DIRECT"
        ? "endeavor 1155 clear to atlanta international airport via direct swept direct kimmy direct bluff direct"
        : "EDV7114 clear to atlanta international airport via swept kimmy direct",
      {
        source: "voice",
        selectedCallsign: output.callsignToken,
        fixes: ["SWEPT"],
        routeCandidates: [
          { id: "SWEPT", kind: "FIX", aliases: ["SWEPT"] },
          { id: "KIMMY", kind: "FIX", aliases: ["KIMMY"] },
          { id: "BLUFF", kind: "FIX", aliases: ["BLUFF"] },
        ],
        airports: ATLANTA,
        pathC: true,
        parsePathC,
      },
    );
    expect(result).toMatchObject({ ok: false, error: "PARSE_MISS" });
    expect(parsePathC).toHaveBeenCalledOnce();
  }
});

test.each([
  {
    name: "unknown route id",
    output: { type: "DIRECT", fixId: "NOPE" },
  },
  {
    name: "airport route id",
    output: { type: "DIRECT", fixId: "KATL" },
  },
] as const)("IFR route fallback rejects $name", async ({ output }) => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: null,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        limitId: "KAHN",
        access: { type: "EXPLICIT_ROUTE", segments: [output] },
      },
    ],
  }));
  const result = await parseCommand("DAL123 cleared to KAHN via AB CD", {
    source: "voice",
    fixes: ["KAHN", "AB"],
    airports: [{ icao: "KATL", name: "Atlanta International" }],
    pathC: true,
    parsePathC,
  });
  expect(result).toMatchObject({ ok: false, error: "PARSE_MISS" });
});
