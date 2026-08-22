import { expect, test } from "vitest";
import { PARSE_ERROR, parseRadioText } from "@parse";

test("AC — DAL123 VIA DEM1 is DESCEND_VIA DEM1", () => {
  const result = parseRadioText("DAL123 VIA DEM1");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([{ type: "DESCEND_VIA", procedureId: "DEM1" }]);
});

test("CVIA DEM1 is CLIMB_VIA; mixed case uppercases", () => {
  const result = parseRadioText("cvia dem1");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBeNull();
  expect(result.instructions).toEqual([{ type: "CLIMB_VIA", procedureId: "DEM1" }]);
});

test("D remains descend; VIA is the only descend-via token", () => {
  const descend = parseRadioText("DAL123 D30");
  expect(descend.ok).toBe(true);
  if (descend.ok) {
    expect(descend.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]);
  }
  const word = parseRadioText("DAL123 DESCEND VIA DEM1");
  expect(word.ok).toBe(false);
  if (!word.ok) {
    expect(word.error).toContain(PARSE_ERROR.UNKNOWN_TOKEN);
  }
});

test("X NEMAX 40 / 40A / 40B are CROSS AT / AOA / AOB at 4000 ft", () => {
  expectOk("DAL123 X NEMAX 40", [
    { type: "CROSS", fixId: "NEMAX", altitudeFt: 4000, restriction: "AT" },
  ]);
  expectOk("X NEMAX 40A", [
    { type: "CROSS", fixId: "NEMAX", altitudeFt: 4000, restriction: "AT_OR_ABOVE" },
  ]);
  expectOk("x nelbo 40b", [
    { type: "CROSS", fixId: "NELBO", altitudeFt: 4000, restriction: "AT_OR_BELOW" },
  ]);
});

test("VIA and X without operands fail; D is not stolen", () => {
  expect(errorCode("VIA")).toBe(PARSE_ERROR.MISSING_PROCEDURE_ID);
  expect(errorCode("CVIA")).toBe(PARSE_ERROR.MISSING_PROCEDURE_ID);
  expect(errorCode("VIA *")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
  expect(errorCode("X")).toBe(PARSE_ERROR.MISSING_FIX_ID);
  expect(errorCode("X NEMAX")).toBe(PARSE_ERROR.MISSING_NUMBER);
  expect(errorCode("X Z 40")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
  expect(errorCode("DAL123 D30")).toBeUndefined();
});

test("VIA then X on one line keeps D as descend", () => {
  const result = parseRadioText("DAL123 VIA DEM1 X NEMAX 40 D30");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.instructions).toEqual([
    { type: "DESCEND_VIA", procedureId: "DEM1" },
    { type: "CROSS", fixId: "NEMAX", altitudeFt: 4000, restriction: "AT" },
    { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
  ]);
});

function errorCode(source: string): string | undefined {
  const result = parseRadioText(source);
  if (result.ok) {
    return undefined;
  }
  return result.error.split(":", 1)[0] ?? result.error;
}

function expectOk(source: string, instructions: Array<Record<string, unknown>>): void {
  const result = parseRadioText(source);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.instructions).toEqual(instructions);
}
