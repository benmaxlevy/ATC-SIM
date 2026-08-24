import { expect, test } from "vitest";
import { DEFAULT_ALTITUDE_FILTER, idleFilterEntry, type AltitudeFilter } from "./altitudeFilter";
import {
  GI_SLOT_COUNT,
  SSA_ALTIMETER_STUB,
  SSA_FUSED_STUB,
  buildGiLines,
  buildSsaLines,
  defaultGiVisibility,
  defaultSsaVisibility,
  formatSsaPtl,
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
    visibility: partial.visibility,
    ptlMinutes: partial.ptlMinutes,
  });
}

test("AC1 — SSA block includes FILTER hundreds and RANGE; OFF CNTR only when panned", () => {
  const onAirport = lines({ simTimeMs: 125_000, rangeNm: 20, offCenter: false });
  expect(onAirport).toEqual(["0002/05", "KDEM 29.92", "FILTER 000-180", "RANGE 20", "OK", "PTL 1.0"]);
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
  expect(formatSsaPtl(1)).toBe("PTL 1.0");
  expect(formatSsaPtl(0.5)).toBe("PTL 0.5");
});

test("FILTER chord entry uses the same FIL hundreds readout", () => {
  const filter = DEFAULT_ALTITUDE_FILTER;
  const entry = idleFilterEntry(filter);
  entry.phase = "min";
  entry.digits = "050";
  expect(lines({ filter, filterEntry: entry })).toContain("FIL 050-___");
});

test("AC1 — SSA FILTER hides TIME / ALTSTG and restores them", () => {
  const vis = defaultSsaVisibility();
  vis.TIME = false;
  vis.ALTSTG = false;
  const hidden = lines({ simTimeMs: 125_000, visibility: vis });
  expect(hidden).not.toContain("0002/05");
  expect(hidden).not.toContain(SSA_ALTIMETER_STUB);
  expect(hidden).toContain("FILTER 000-180");
  vis.TIME = true;
  vis.ALTSTG = true;
  const shown = lines({ simTimeMs: 125_000, visibility: vis });
  expect(shown[0]).toBe("0002/05");
  expect(shown).toContain(SSA_ALTIMETER_STUB);
});

test("AC2 — hiding STATUS omits OK; RANGE/FILTER still match camera/filter when visible", () => {
  const vis = defaultSsaVisibility();
  vis.STATUS = false;
  const hidden = lines({ rangeNm: 10, visibility: vis });
  expect(hidden).not.toContain(SSA_FUSED_STUB);
  expect(hidden).toContain("RANGE 10");
  expect(hidden).toContain("FILTER 000-180");
  vis.FILTER = false;
  vis.RANGE = false;
  vis.OFF_CNTR = false;
  vis.STATUS = true;
  const onlyStatus = lines({ rangeNm: 10, offCenter: true, visibility: vis });
  expect(onlyStatus).not.toContain("RANGE 10");
  expect(onlyStatus).not.toContain("FILTER 000-180");
  expect(onlyStatus).not.toContain("OFF CNTR");
  expect(onlyStatus).toContain(SSA_FUSED_STUB);
});

test("AC3 — GI FILTER hides a non-empty line on the PPI string list", () => {
  const authored = pad10(["ATIS A", "RWY 27", "ILS 27 IN USE"]);
  const vis = defaultGiVisibility(authored);
  expect(buildGiLines(authored, vis)).toEqual(["ATIS A", "RWY 27", "ILS 27 IN USE"]);
  vis[1] = false;
  expect(buildGiLines(authored, vis)).toEqual(["ATIS A", "ILS 27 IN USE"]);
  expect(GI_SLOT_COUNT).toBe(10);
});

test("AC4 — empty GI slots cannot paint", () => {
  const authored = pad10(["ATIS A", "", "RWY 27"]);
  const vis = [true, true, true, true, true, true, true, true, true, true];
  expect(buildGiLines(authored, vis)).toEqual(["ATIS A", "RWY 27"]);
  expect(buildGiLines(authored, vis).some((line) => line === "")).toBe(false);
});

function pad10(lines: string[]): string[] {
  return Array.from({ length: 10 }, (_, i) => lines[i] ?? "");
}

test("AC5/AC6 — SSA/GI comments are CRC analog; not HUD/METAR panel; no Command IR", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./ssa.ts"]!;
  expect(src).toMatch(/Analog: CRC STARS SSA/);
  expect(src).toMatch(/GI TEXT/);
  expect(src).toMatch(/FILTER/);
  expect(src).toMatch(/\brange\b/i);
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/R05/);
  expect(src).toMatch(/not a HUD/i);
  expect(src).toMatch(/METAR panel/i);
  expect(src).not.toMatch(/sidebar/i);
  expect(src).not.toMatch(/from\s+["']@parse["']/);
  expect(src).not.toMatch(/from\s+["']@pilot["']/);
  expect(src).not.toMatch(/handleRadioText/);
  expect(src).not.toMatch(/parseRadioText/);
  expect(src).not.toMatch(/command\.accepted/);
  expect(src).not.toMatch(/\bfetch\s*\(/);
});
