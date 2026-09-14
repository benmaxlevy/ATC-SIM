import { expect, test } from "vitest";
import { vi } from "vitest";
import { parseCommand, parseRadioText } from "@parse";
import type { ParsePathCFn } from "@parse";
import { scanIfrClearanceRouteWindow } from "../ifr-clearance-route-window";

const fixes = ["KAHN", "SIITH", "VOR1"];
const airports = [
  {
    icao: "KATL",
    name: "Hartsfield/Jackson Atlanta International",
    aliases: [
      "Hartsfield Jackson Atlanta Airport",
      "Atlanta Airport",
      "Atlanta International Airport",
    ],
  },
];

test("typed IFR clearance compiles an empty explicit route as direct to limit", () => {
  expect(parseRadioText("DAL123 CLR TO KAHN VIA DIRECT")).toMatchObject({
    ok: true,
    instructions: [
      { type: "IFR_CLEARANCE", limitId: "KAHN", access: { type: "EXPLICIT_ROUTE", segments: [] } },
    ],
  });
});

test("typed route access and optional fields preserve order", () => {
  expect(
    parseRadioText("DAL123 CLR TO KAHN VIA SIITH THEN DIRECT ALT 50 CVIA FREQ 118.5 SQ 4721"),
  ).toMatchObject({
    ok: true,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        limitId: "KAHN",
        access: { type: "EXPLICIT_ROUTE", segments: [{ type: "DIRECT", fixId: "SIITH" }] },
        altitudeFt: 5000,
        climbVia: true,
        frequency: "118.5",
        squawk: "4721",
      },
    ],
  });
});

test("spoken IFR forms compile like typed forms before tactical direct", async () => {
  const spoken = await parseCommand("DAL123 cleared to KAHN via SIITH then direct", {
    source: "voice",
    fixes,
    pathC: false,
  });
  expect(spoken).toMatchObject({
    ok: true,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        limitId: "KAHN",
        access: { type: "EXPLICIT_ROUTE", segments: [{ type: "DIRECT", fixId: "SIITH" }] },
      },
    ],
  });

  const tactical = await parseCommand("DAL123 cleared direct KAHN", {
    source: "voice",
    fixes,
    pathC: false,
  });
  expect(tactical).toMatchObject({ ok: true, instructions: [{ type: "DIRECT", fixId: "KAHN" }] });
});

test("tactical direct and IFR route use the same noisy fix grounding", async () => {
  const direct = await parseCommand("DAL123 proceed direct FIXI", {
    source: "voice",
    fixes: ["FIX1"],
    pathC: false,
  });
  const route = await parseCommand("DAL123 cleared to KAHN via FIXI HAYNES", {
    source: "voice",
    fixes: ["KAHN", "FIX1", "HAINZ"],
    pathC: false,
  });

  expect(direct).toMatchObject({
    ok: true,
    instructions: [{ type: "DIRECT", fixId: "FIX1" }],
  });
  expect(route).toMatchObject({
    ok: true,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        access: {
          type: "EXPLICIT_ROUTE",
          segments: [
            { type: "DIRECT", fixId: "FIX1" },
            { type: "DIRECT", fixId: "HAINZ" },
          ],
        },
      },
    ],
  });
});

test("airport ICAO and listed spoken alias ground only the IFR clearance limit", async () => {
  const byName = await parseCommand(
    "DAL123 cleared to Hartsfield Jackson Atlanta Airport via direct",
    { source: "voice", fixes, airports, pathC: false },
  );
  expect(byName).toMatchObject({
    ok: true,
    instructions: [
      { type: "IFR_CLEARANCE", limitId: "KATL", access: { type: "EXPLICIT_ROUTE", segments: [] } },
    ],
  });

  const direct = await parseCommand("DAL123 direct KATL", {
    source: "voice",
    fixes,
    airports,
    pathC: false,
  });
  expect(direct.ok).toBe(false);
});

test("Endeavor spoken clearance accepts Atlanta International Airport", async () => {
  const result = await parseCommand(
    "endeavor seventy one fourteen clear to atlanta international airport via direct",
    { source: "voice", fixes, airports, pathC: false },
  );
  expect(result).toMatchObject({
    ok: true,
    callsignToken: "EDV7114",
    instructions: [
      { type: "IFR_CLEARANCE", limitId: "KATL", access: { type: "EXPLICIT_ROUTE", segments: [] } },
    ],
  });
});

test("unknown and ambiguous airport names miss without producing a clearance", async () => {
  const unknownIcao = await parseCommand("DAL123 CLR TO KXXX VIA DIRECT", {
    source: "text",
    fixes,
    airports,
    pathC: false,
  });
  expect(unknownIcao.ok).toBe(false);

  const unknown = await parseCommand("DAL123 cleared to Unknown Regional Airport via direct", {
    source: "voice",
    fixes,
    airports,
    pathC: false,
  });
  expect(unknown.ok).toBe(false);

  const ambiguous = await parseCommand("DAL123 cleared to Atlanta Airport via direct", {
    source: "voice",
    fixes,
    airports: [...airports, { icao: "KXXX", name: "Example Field", aliases: ["Atlanta Airport"] }],
    pathC: false,
  });
  expect(ambiguous.ok).toBe(false);
});

test("spoken optional altitude, frequency, and squawk stay in clearance order", async () => {
  const spoken = await parseCommand(
    "DAL123 cleared to KAHN via direct maintain five thousand frequency one one eight point five squawk four seven two one",
    { source: "voice", fixes, pathC: false },
  );
  expect(spoken).toMatchObject({
    ok: true,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        altitudeFt: 5000,
        frequency: "118.5",
        squawk: "4721",
      },
    ],
  });
});

test("spoken matcher preserves decimal frequency digits including niner", async () => {
  const spoken = await parseCommand(
    "DAL123 clear to KAHN via direct frequency one one niner point five",
    { source: "voice", fixes, pathC: false },
  );
  expect(spoken).toMatchObject({
    ok: true,
    instructions: [{ type: "IFR_CLEARANCE", frequency: "119.5" }],
  });
});

test("malformed or duplicate IFR fields reject instead of falling through", () => {
  expect(parseRadioText("DAL123 CLR TO KAHN").ok).toBe(false);
  expect(parseRadioText("DAL123 CLR TO KAHN VIA DIRECT ALT 50 ALT 60").ok).toBe(false);
  expect(parseRadioText("DAL123 CLR TO KAHN VIA RADAR VECTORS VIA DIRECT").ok).toBe(false);
});

test("optional aliases share strict ALT, CVIA, FREQ, SQ semantic order", async () => {
  expect(
    parseRadioText("DAL123 CLR TO KAHN VIA DIRECT MAINTAIN 50 CVIA FREQUENCY 118.5 SQUAWK 4721"),
  ).toMatchObject({ ok: true, instructions: [{ type: "IFR_CLEARANCE", altitudeFt: 5000 }] });
  for (const text of [
    "DAL123 CLR TO KAHN VIA DIRECT ALT 50 MAINTAIN 60",
    "DAL123 CLR TO KAHN VIA DIRECT FREQ 118.5 FREQUENCY 119.1",
    "DAL123 CLR TO KAHN VIA DIRECT FREQ 118.5 ALT 50",
    "DAL123 CLR TO KAHN VIA DIRECT SQ 4721 CVIA",
  ]) {
    expect(parseRadioText(text).ok, text).toBe(false);
  }
  expect(
    (
      await parseCommand(
        "DAL123 cleared to KAHN via direct frequency one one eight point five maintain five thousand",
        { source: "voice", fixes, pathC: false },
      )
    ).ok,
  ).toBe(false);
});

test("SID access reserves optional words instead of treating ALT as a transition", () => {
  expect(
    parseRadioText("DAL123 CLR TO KAHN VIA DEM12 ALT 50", {
      procedures: [{ id: "DEM12" }],
    }),
  ).toMatchObject({
    ok: true,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        access: { type: "EXPLICIT_ROUTE", segments: [{ type: "PROCEDURE", procedureId: "DEM12" }] },
        altitudeFt: 5000,
      },
    ],
  });
});

test("route windows support implicit and explicit arbitrary direct chains", async () => {
  const implicit = await parseCommand("DAL123 cleared to KAHN via SIITH VOR1 ALT 50", {
    source: "voice",
    fixes,
    pathC: false,
  });
  const explicit = await parseCommand(
    "DAL123 cleared to KAHN via direct SIITH direct VOR1 ALT 50",
    { source: "voice", fixes, pathC: false },
  );
  const expected = {
    type: "IFR_CLEARANCE",
    limitId: "KAHN",
    access: {
      type: "EXPLICIT_ROUTE",
      segments: [
        { type: "DIRECT", fixId: "SIITH" },
        { type: "DIRECT", fixId: "VOR1" },
      ],
    },
    altitudeFt: 5000,
  };
  expect(implicit).toMatchObject({ ok: true, instructions: [expected] });
  expect(explicit).toMatchObject({ ok: true, instructions: [expected] });
});

test("typed route windows accept many ordered direct legs and stop at optionals", () => {
  const fixIds = ["FIX01", "FIX02", "FIX03", "FIX04", "FIX05", "FIX06", "FIX07", "FIX08"];
  const result = parseRadioText(
    "DAL123 CLR TO KAHN VIA FIX01 DIRECT FIX02 FIX03 DIRECT FIX04 FIX05 FIX06 DIRECT FIX07 FIX08 ALT 70",
    { fixes: ["KAHN", ...fixIds] },
  );

  expect(result).toMatchObject({
    ok: true,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        limitId: "KAHN",
        access: {
          type: "EXPLICIT_ROUTE",
          segments: fixIds.map((fixId) => ({ type: "DIRECT", fixId })),
        },
        altitudeFt: 7000,
      },
    ],
  });
});

test("route windows choose a complete longest exact multi-word catalog alias", () => {
  const result = parseRadioText("DAL123 CLR TO KAHN VIA SEE MAX HOUND", {
    fixes: ["KAHN", "SEE", "SEMAX", "HOUND"],
  });

  expect(result).toMatchObject({
    ok: true,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        access: {
          type: "EXPLICIT_ROUTE",
          segments: [
            { type: "DIRECT", fixId: "SEMAX" },
            { type: "DIRECT", fixId: "HOUND" },
          ],
        },
      },
    ],
  });
});

test("route windows do not concatenate adjacent tokens into a compact fix id", async () => {
  const result = await parseCommand("DAL123 cleared to KAHN via AB CD", {
    source: "text",
    fixes: ["KAHN", "ABCD"],
    pathC: false,
  });

  expect(result).toMatchObject({ ok: false, error: "PARSE_MISS" });
});

test("ambiguous complete route segmentations reject with PARSE_MISS", async () => {
  const result = await parseCommand("DAL123 cleared to KAHN via SEE MAX", {
    source: "text",
    fixes: ["KAHN", "SEE", "MAX", "SEMAX"],
    pathC: false,
  });

  expect(result).toMatchObject({ ok: false, error: "PARSE_MISS" });
});

test("route-window parsing is pure and does not mutate caller inputs", () => {
  const tokens = ["FIX01", "THEN", "SEE", "MAX", "ALT"];
  const options = {
    fixes: ["FIX01", "SEMAX"],
    procedures: [
      {
        id: "SID1",
        name: "Sierra One",
        transitions: [{ id: "NORTH", name: "North Transition" }],
      },
    ],
  } as const;
  const tokensBefore = [...tokens];
  const optionsBefore = structuredClone(options);

  const first = scanIfrClearanceRouteWindow(tokens, 0, options);
  const second = scanIfrClearanceRouteWindow(tokens, 0, options);

  expect(first).toEqual(second);
  expect(tokens).toEqual(tokensBefore);
  expect(options).toEqual(optionsBefore);
});

test("procedure transitions and exact Atlanta/SWEPT route regression ground in order", async () => {
  const procedure = await parseCommand("DAL123 cleared to KAHN via SID1 NORTH transition HOUND", {
    source: "voice",
    fixes: ["KAHN", "HOUND"],
    procedures: [{ id: "SID1", transitions: [{ id: "NORTH" }] }],
    pathC: false,
  });
  expect(procedure).toMatchObject({
    ok: true,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        access: {
          type: "EXPLICIT_ROUTE",
          segments: [
            { type: "PROCEDURE", procedureId: "SID1", transitionId: "NORTH" },
            { type: "DIRECT", fixId: "HOUND" },
          ],
        },
      },
    ],
  });

  const atlanta = await parseCommand(
    "endeavor seventy one fourteen clear to atlanta international airport via direct swept direct",
    {
      source: "voice",
      fixes: ["SWEPT"],
      airports,
      pathC: false,
    },
  );
  expect(atlanta).toMatchObject({
    ok: true,
    callsignToken: "EDV7114",
    instructions: [
      {
        type: "IFR_CLEARANCE",
        limitId: "KATL",
        access: {
          type: "EXPLICIT_ROUTE",
          segments: [{ type: "DIRECT", fixId: "SWEPT" }],
        },
      },
    ],
  });
});

test("adjacent SWEPT KIMMY route chain stays deterministic and local", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => null);
  const result = await parseCommand(
    "endeavor seven eight one fourteen clear to atlanta international airport via swept kimmy direct",
    {
      source: "voice",
      selectedCallsign: "EDV7114",
      fixes: ["SWEPT", "KIMMY"],
      routeCandidates: [
        { id: "SWEPT", kind: "FIX", aliases: ["SWEPT"] },
        { id: "KIMMY", kind: "FIX", aliases: ["KIMMY"] },
      ],
      airports,
      pathC: true,
      parsePathC,
    },
  );
  expect(result).toMatchObject({
    ok: true,
    callsignToken: "EDV7114",
    instructions: [
      {
        type: "IFR_CLEARANCE",
        limitId: "KATL",
        access: {
          type: "EXPLICIT_ROUTE",
          segments: [
            { type: "DIRECT", fixId: "SWEPT" },
            { type: "DIRECT", fixId: "KIMMY" },
          ],
        },
      },
    ],
  });
  expect(parsePathC).not.toHaveBeenCalled();
});

test("IFR route chain never falls back to tactical airport direct", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => null);
  const result = await parseCommand(
    "endeavor 1155 clear to atlanta international airport via direct swept direct kimmy direct bluff direct",
    {
      source: "voice",
      fixes: ["SWEPT", "KIMMY", "BLUFF"],
      routeCandidates: [
        { id: "SWEPT", kind: "FIX", aliases: ["SWEPT"] },
        { id: "KIMMY", kind: "FIX", aliases: ["KIMMY"] },
        { id: "BLUFF", kind: "FIX", aliases: ["BLUFF"] },
      ],
      airports,
      pathC: true,
      parsePathC,
    },
  );
  expect(result).toMatchObject({
    ok: true,
    callsignToken: "EDV1155",
    instructions: [
      {
        type: "IFR_CLEARANCE",
        limitId: "KATL",
        access: {
          type: "EXPLICIT_ROUTE",
          segments: [
            { type: "DIRECT", fixId: "SWEPT" },
            { type: "DIRECT", fixId: "KIMMY" },
            { type: "DIRECT", fixId: "BLUFF" },
          ],
        },
      },
    ],
  });
  expect(parsePathC).not.toHaveBeenCalled();
});

test("unknown, duplicate, and airport route tokens return PARSE_MISS", async () => {
  for (const text of [
    "DAL123 cleared to KAHN via SIITH NOPE",
    "DAL123 cleared to KAHN via direct direct SIITH",
    "DAL123 cleared to KAHN via SIITH then",
    "DAL123 cleared to KAHN via KATL",
  ]) {
    const result = await parseCommand(text, {
      source: "voice",
      fixes: ["SIITH"],
      airports,
      pathC: false,
    });
    expect(result).toMatchObject({ ok: false, error: "PARSE_MISS" });
  }
});

test("Path C cannot bypass malformed clearance grammar", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => ({
    callsignToken: "DAL123",
    instructions: [
      { type: "IFR_CLEARANCE", limitId: "KAHN", access: { type: "DIRECT" }, altitudeFt: 5000 },
    ],
  }));
  const result = await parseCommand(
    "DAL123 cleared to KAHN via direct frequency one one eight point five maintain five thousand",
    { source: "voice", fixes, pathC: true, parsePathC },
  );
  expect(result.ok).toBe(false);
  expect(parsePathC).not.toHaveBeenCalled();
});
