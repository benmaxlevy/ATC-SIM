import { expect, test } from "vitest";
import {
  DEFAULT_ALTITUDE_FILTER,
  idleFilterEntry,
  type AltitudeFilter,
} from "./altitudeFilter";
import {
  SSA_ALTIMETER_STUB,
  SSA_FUSED_STUB,
  buildSsaLines,
  formatSsaTime,
} from "./ssa";

function lines(partial: Partial<Parameters<typeof buildSsaLines>[0]> = {}) {
  const filter = partial.filter ?? DEFAULT_ALTITUDE_FILTER;
  return buildSsaLines({
    simTimeMs: partial.simTimeMs ?? 0,
    rangeNm: partial.rangeNm ?? 20,
    offCenter: partial.offCenter ?? false,
    filter,
    filterEntry: partial.filterEntry ?? idleFilterEntry(filter),
  });
}

test("AC1 — SSA block includes FILTER hundreds and RANGE; OFF CNTR only when panned", () => {
  const onAirport = lines({ simTimeMs: 125_000, rangeNm: 20, offCenter: false });
  expect(onAirport).toEqual([
    "0002/05",
    "KDEM 29.92",
    "FILTER 000-180",
    "RANGE 20",
    "OK",
  ]);
  expect(onAirport).not.toContain("OFF CNTR");

  const filter: AltitudeFilter = { minHundreds: 50, maxHundreds: 100 };
  const panned = lines({
    simTimeMs: 0,
    rangeNm: 10,
    offCenter: true,
    filter,
  });
  expect(panned).toContain("FILTER 050-100");
  expect(panned).toContain("RANGE 10");
  expect(panned).toContain("OFF CNTR");
  expect(panned.indexOf("RANGE 10")).toBeLessThan(panned.indexOf("OFF CNTR"));
  expect(panned.indexOf("OFF CNTR")).toBeLessThan(panned.indexOf("OK"));
});

test("SSA time is HHMM/SS from sim ms; altimeter and fused stubs are constant", () => {
  expect(formatSsaTime(0)).toBe("0000/00");
  expect(formatSsaTime(3661_000)).toBe("0101/01");
  expect(formatSsaTime(Number.NaN)).toBe("0000/00");
  expect(SSA_ALTIMETER_STUB).toBe("KDEM 29.92");
  expect(SSA_FUSED_STUB).toBe("OK");
});

test("FILTER chord entry uses the same FIL hundreds readout", () => {
  const filter = DEFAULT_ALTITUDE_FILTER;
  const entry = idleFilterEntry(filter);
  entry.phase = "min";
  entry.digits = "050";
  expect(lines({ filter, filterEntry: entry })).toContain("FIL 050-___");
});

test("AC5/AC6 — SSA builder is scope status only: FILTER/range comments, no Command IR", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./ssa.ts"]!;
  expect(src).toMatch(/Analog: CRC STARS SSA/);
  expect(src).toMatch(/FILTER/);
  expect(src).toMatch(/\brange\b/i);
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/R05/);
  expect(src).not.toMatch(/\bHUD\b/);
  expect(src).not.toMatch(/sidebar/i);
  expect(src).not.toMatch(/from\s+["']@parse["']/);
  expect(src).not.toMatch(/from\s+["']@pilot["']/);
  expect(src).not.toMatch(/handleRadioText/);
  expect(src).not.toMatch(/parseRadioText/);
  expect(src).not.toMatch(/command\.accepted/);
});
