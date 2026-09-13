import { expect, test } from "vitest";
import { PARSE_ERROR, parseCommand, parseRadioText } from "@parse";

test("AC — DAL123 DCT NEMAX is DIRECT NEMAX", () => {
  const result = parseRadioText("DAL123 DCT NEMAX");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([{ type: "DIRECT", fixId: "NEMAX" }]);
});

test("DCT DEM tracks a navaid id; mixed case uppercases", () => {
  const result = parseRadioText("dct dem");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBeNull();
  expect(result.instructions).toEqual([{ type: "DIRECT", fixId: "DEM" }]);
});

test("typed DCT accepts a catalog-compatible alphanumeric fix id", () => {
  expect(parseRadioText("DAL123 DCT FIX1")).toMatchObject({
    ok: true,
    instructions: [{ type: "DIRECT", fixId: "FIX1" }],
  });
});

test("spoken direct aliases compile identically for a catalog fix", async () => {
  const results = await Promise.all(
    ["cleared direct FIX1", "proceed direct FIX1"].map((source) =>
      parseCommand(source, {
        source: "voice",
        fixes: ["FIX1"],
        pathC: false,
      }),
    ),
  );
  expect(results.map((result) => (result.ok ? result.instructions : null))).toEqual([
    [{ type: "DIRECT", fixId: "FIX1" }],
    [{ type: "DIRECT", fixId: "FIX1" }],
  ]);
});

test("D remains descend; DCT is the only direct token", () => {
  const descend = parseRadioText("DAL123 D30");
  expect(descend.ok).toBe(true);
  if (descend.ok) {
    expect(descend.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]);
  }
  const word = parseRadioText("DAL123 DIRECT NEMAX");
  expect(word.ok).toBe(false);
  if (!word.ok) {
    expect(word.error).toContain(PARSE_ERROR.UNKNOWN_TOKEN);
  }
});

test("DCT without a fix and a too-short/too-long token fail", () => {
  expect(errorCode("DCT")).toBe(PARSE_ERROR.MISSING_FIX_ID);
  expect(errorCode("DCT X")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
  expect(errorCode("DCT NEMAXXX")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
});

test("H270 still parses after DCT on the same line", () => {
  const result = parseRadioText("DAL123 DCT NEMAX H270");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.instructions).toEqual([
    { type: "DIRECT", fixId: "NEMAX" },
    { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
  ]);
});

function errorCode(source: string): string {
  const result = parseRadioText(source);
  expect(result.ok).toBe(false);
  if (result.ok) {
    return "";
  }
  return result.error.split(":", 1)[0] ?? result.error;
}
