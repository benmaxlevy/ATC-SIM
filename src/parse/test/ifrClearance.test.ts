import { expect, test } from "vitest";
import { vi } from "vitest";
import { parseCommand, parseRadioText } from "@parse";
import type { ParsePathCFn } from "@parse";

const fixes = ["KAHN", "SIITH", "VOR1"];

test("typed IFR clearance compiles one limit and one direct access method", () => {
  expect(parseRadioText("DAL123 CLR TO KAHN VIA DIRECT")).toMatchObject({
    ok: true,
    instructions: [{ type: "IFR_CLEARANCE", limitId: "KAHN", access: { type: "DIRECT" } }],
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
        access: { type: "FIX_THEN_DIRECT", fixId: "SIITH" },
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
        access: { type: "FIX_THEN_DIRECT", fixId: "SIITH" },
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
  expect(parseRadioText("DAL123 CLR TO KAHN VIA DEM12 ALT 50")).toMatchObject({
    ok: true,
    instructions: [
      { type: "IFR_CLEARANCE", access: { type: "SID", procedureId: "DEM12" }, altitudeFt: 5000 },
    ],
  });
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
