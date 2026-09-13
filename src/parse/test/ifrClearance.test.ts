import { expect, test } from "vitest";
import { parseCommand, parseRadioText } from "@parse";

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
