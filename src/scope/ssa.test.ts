import { expect, test } from "vitest";
import { DEFAULT_ALTITUDE_FILTER, idleFilterEntry, type AltitudeFilter } from "./altitudeFilter";
import {
  GI_SLOT_COUNT,
  SSA_ALTIMETER_STUB,
  SSA_FUSED_STUB,
  buildGiLines,
  buildSsaLines,
  buildSsaRenderLines,
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
    ...partial,
  });
}

test("AC1 — SSA block includes subset, time/altstg, status, beacons, range/PTL, dual filter, and altimeters", () => {
  const onAirport = lines({ simTimeMs: 125_000, rangeNm: 20, offCenter: false });
  expect(onAirport).toContain("[▼]");
  expect(onAirport).toContain("(1)");
  expect(onAirport).toContain("0002/05  30.17");
  expect(onAirport).toContain("OK/OK/NA FUSED");
  expect(onAirport).toContain("2364  56  12");
  expect(onAirport).toContain("20NM PTL: 1.0");
  expect(onAirport).toContain("000 180 U 000 180 A");
  expect(onAirport).toContain("BOS 30.17 BED 30.17 OWD 30.18");
  expect(onAirport).toContain("BVY 30.17 LWM 30.19");
  expect(onAirport).toContain("QL: ALL");
  expect(onAirport).toContain("*S1 KDEM 27/09");
  expect(onAirport).not.toContain("OFF CNTR");

  const filter: AltitudeFilter = { minHundreds: 50, maxHundreds: 100 };
  const panned = lines({
    simTimeMs: 0,
    rangeNm: 41,
    offCenter: true,
    filter,
    ptlMinutes: 3.0,
  });
  expect(panned).toContain("050 100 U 050 100 A");
  expect(panned).toContain("41NM PTL: 3.0");
  expect(panned).toContain("OFF CNTR");

  const bosLines = lines({ airportCode: "BOS" });
  expect(bosLines).toContain("*S1 BOS 27/22L");
});

test("AC2 — SSA render lines include alert indicator and red SPCs", () => {
  const renderLines = buildSsaRenderLines({
    simTimeMs: 0,
    rangeNm: 20,
    offCenter: false,
    filter: DEFAULT_ALTITUDE_FILTER,
    filterEntry: idleFilterEntry(DEFAULT_ALTITUDE_FILTER),
    hasAlert: true,
    spcAlerts: ["RF", "EM"],
  });

  const topAlert = renderLines.find((l) => l.text === "[▼]");
  expect(topAlert).toBeDefined();
  expect(topAlert?.style).toBe("alert");

  const spcLine = renderLines.find((l) => l.text === "RF  EM");
  expect(spcLine).toBeDefined();
  expect(spcLine?.style).toBe("spc");
});

test("SSA time is HHMM/SS from sim ms; altimeter and fused stubs match spec", () => {
  expect(formatSsaTime(0)).toBe("0000/00");
  expect(formatSsaTime(3661_000)).toBe("0101/01");
  expect(formatSsaTime(Number.NaN)).toBe("0000/00");
  expect(SSA_ALTIMETER_STUB).toBe("30.17");
  expect(SSA_FUSED_STUB).toBe("OK/OK/NA FUSED");
  expect(formatSsaPtl(1)).toBe("PTL: 1.0");
  expect(formatSsaPtl(0.5)).toBe("PTL: 0.5");
});

test("FILTER chord entry uses the same FIL hundreds readout", () => {
  const filter = DEFAULT_ALTITUDE_FILTER;
  const entry = idleFilterEntry(filter);
  entry.phase = "min";
  entry.digits = "050";
  expect(lines({ filter, filterEntry: entry })).toContain("FIL 050-___");
});

test("AC3 — SSA FILTER hides TIME / ALTSTG and restores them", () => {
  const vis = defaultSsaVisibility();
  vis.TIME = false;
  vis.ALTSTG = false;
  const hidden = lines({ simTimeMs: 125_000, visibility: vis });
  expect(hidden.some((l) => l.includes("0002/05"))).toBe(false);
  expect(hidden.some((l) => l.includes("BOS 30.17"))).toBe(false);
  expect(hidden).toContain("000 180 U 000 180 A");

  vis.TIME = true;
  vis.ALTSTG = true;
  const shown = lines({ simTimeMs: 125_000, visibility: vis });
  expect(shown.some((l) => l.includes("0002/05"))).toBe(true);
  expect(shown.some((l) => l.includes("BOS 30.17"))).toBe(true);
});

test("AC4 — GI FILTER hides a non-empty line on the PPI string list", () => {
  const authored = pad10(["ATIS A", "RWY 27", "ILS 27 IN USE"]);
  const vis = defaultGiVisibility(authored);
  expect(buildGiLines(authored, vis)).toEqual(["ATIS A", "RWY 27", "ILS 27 IN USE"]);
  vis[1] = false;
  expect(buildGiLines(authored, vis)).toEqual(["ATIS A", "ILS 27 IN USE"]);
  expect(GI_SLOT_COUNT).toBe(10);
});

test("AC5 — empty GI slots cannot paint", () => {
  const authored = pad10(["ATIS A", "", "RWY 27"]);
  const vis = [true, true, true, true, true, true, true, true, true, true];
  expect(buildGiLines(authored, vis)).toEqual(["ATIS A", "RWY 27"]);
  expect(buildGiLines(authored, vis).some((line) => line === "")).toBe(false);
});

function pad10(lines: string[]): string[] {
  return Array.from({ length: 10 }, (_, i) => lines[i] ?? "");
}

test("AC6 — SSA/GI comments are CRC analog; not HUD/METAR panel; no Command IR", () => {
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
