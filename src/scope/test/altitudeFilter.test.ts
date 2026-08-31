import { expect, test } from "vitest";
import {
  DEFAULT_ALTITUDE_FILTER,
  beginFilterEntry,
  cancelFilterEntry,
  clampFilterHundreds,
  expireFilterEntry,
  formatFilterBand,
  formatFilterReadout,
  handleFilterEntryKey,
  idleFilterEntry,
  inAltitudeFilter,
  parseFilterHundreds,
  parseStrictFilterHundreds,
  tryApplyAltitudeFilter,
  tryApplyAltitudeFilterDigits,
  type AltitudeFilter,
} from "../altitudeFilter";
import { CHORD_TIMEOUT_MS } from "../keymap";

test("AC1 — Mode C hundreds inclusive: 3000 in 020-040, 1900 out, 4000 on max, 4100 out", () => {
  const band: AltitudeFilter = { minHundreds: 20, maxHundreds: 40 };
  expect(inAltitudeFilter(3000, band)).toBe(true);
  expect(inAltitudeFilter(1900, band)).toBe(false);
  expect(inAltitudeFilter(4000, band)).toBe(true);
  expect(inAltitudeFilter(4100, band)).toBe(false);
});

test("default altitude filter is 000-180; non-finite Mode C is outside", () => {
  expect(DEFAULT_ALTITUDE_FILTER).toEqual({ minHundreds: 0, maxHundreds: 180 });
  expect(inAltitudeFilter(0, DEFAULT_ALTITUDE_FILTER)).toBe(true);
  expect(inAltitudeFilter(18000, DEFAULT_ALTITUDE_FILTER)).toBe(true);
  expect(inAltitudeFilter(18100, DEFAULT_ALTITUDE_FILTER)).toBe(false);
  expect(inAltitudeFilter(Number.NaN, DEFAULT_ALTITUDE_FILTER)).toBe(false);
});

test("parse 1-3 digit hundreds; 50 Enter = 050; clamp 0-180", () => {
  expect(parseFilterHundreds("50")).toBe(50);
  expect(parseFilterHundreds("050")).toBe(50);
  expect(parseFilterHundreds("0")).toBe(0);
  expect(parseFilterHundreds("180")).toBe(180);
  expect(parseFilterHundreds("181")).toBe(180);
  expect(parseFilterHundreds("999")).toBe(180);
  expect(parseFilterHundreds("")).toBeNull();
  expect(parseFilterHundreds("12a")).toBeNull();
  expect(parseFilterHundreds("4")).toBe(4);
  expect(parseStrictFilterHundreds("000")).toBe(0);
  expect(parseStrictFilterHundreds("050")).toBe(50);
  expect(parseStrictFilterHundreds("180")).toBe(180);
  expect(parseStrictFilterHundreds("181")).toBeNull();
  expect(parseStrictFilterHundreds("999")).toBeNull();
  expect(parseStrictFilterHundreds("50")).toBeNull();
  expect(parseStrictFilterHundreds("")).toBeNull();
  expect(clampFilterHundreds(-3)).toBe(0);
  expect(clampFilterHundreds(200)).toBe(180);
  expect(clampFilterHundreds(Number.NaN)).toBe(0);
});

test("tryApplyAltitudeFilter is the F-chord predicate: 050-100 applies; max<min does not", () => {
  const filter = { minHundreds: 0, maxHundreds: 180 };
  expect(tryApplyAltitudeFilter(filter, 50, 100)).toBe(true);
  expect(filter).toEqual({ minHundreds: 50, maxHundreds: 100 });
  expect(tryApplyAltitudeFilter(filter, 120, 50)).toBe(false);
  expect(filter).toEqual({ minHundreds: 50, maxHundreds: 100 });
  expect(tryApplyAltitudeFilterDigits(filter, "070", "080")).toBe(true);
  expect(filter).toEqual({ minHundreds: 70, maxHundreds: 80 });
  expect(tryApplyAltitudeFilterDigits(filter, "100", "050")).toBe(false);
  expect(filter).toEqual({ minHundreds: 70, maxHundreds: 80 });
  expect(tryApplyAltitudeFilterDigits(filter, "", "100")).toBe(false);
  expect(tryApplyAltitudeFilter(filter, Number.NaN, 80)).toBe(false);
  expect(filter).toEqual({ minHundreds: 70, maxHundreds: 80 });
});

test("AC6 — max < min on commit leaves the previous filter; no throw", () => {
  const filter = { minHundreds: 0, maxHundreds: 180 };
  const entry = idleFilterEntry(filter);
  beginFilterEntry(entry, filter, 0);
  expect(handleFilterEntryKey(entry, filter, "1", 10)).toBe(true);
  expect(handleFilterEntryKey(entry, filter, "2", 20)).toBe(true);
  expect(handleFilterEntryKey(entry, filter, "0", 30)).toBe(true);
  expect(handleFilterEntryKey(entry, filter, "Enter", 40)).toBe(true);
  expect(entry.phase).toBe("max");
  expect(handleFilterEntryKey(entry, filter, "0", 50)).toBe(true);
  expect(handleFilterEntryKey(entry, filter, "5", 60)).toBe(true);
  expect(handleFilterEntryKey(entry, filter, "0", 70)).toBe(true);
  expect(() => handleFilterEntryKey(entry, filter, "Enter", 80)).not.toThrow();
  expect(filter).toEqual({ minHundreds: 0, maxHundreds: 180 });
  expect(entry.phase).toBe("idle");
});

test("AC5 — Esc during entry restores prior min/max", () => {
  const filter = { minHundreds: 20, maxHundreds: 40 };
  const entry = idleFilterEntry(filter);
  beginFilterEntry(entry, filter, 0);
  handleFilterEntryKey(entry, filter, "0", 10);
  handleFilterEntryKey(entry, filter, "5", 20);
  handleFilterEntryKey(entry, filter, "0", 30);
  handleFilterEntryKey(entry, filter, "Enter", 40);
  handleFilterEntryKey(entry, filter, "1", 50);
  expect(formatFilterReadout(filter, entry)).toBe("FIL 050-1__");
  expect(handleFilterEntryKey(entry, filter, "Escape", 60)).toBe(true);
  expect(filter).toEqual({ minHundreds: 20, maxHundreds: 40 });
  expect(entry.phase).toBe("idle");
  expect(formatFilterReadout(filter, entry)).toBe("FILTER 020-040");
});

test("Backspace edits the active field; empty Enter rejects", () => {
  const filter = { minHundreds: 0, maxHundreds: 180 };
  const entry = idleFilterEntry(filter);
  beginFilterEntry(entry, filter, 0);
  handleFilterEntryKey(entry, filter, "1", 10);
  handleFilterEntryKey(entry, filter, "2", 20);
  handleFilterEntryKey(entry, filter, "Backspace", 30);
  expect(entry.digits).toBe("1");
  handleFilterEntryKey(entry, filter, "Backspace", 40);
  expect(handleFilterEntryKey(entry, filter, "Enter", 50)).toBe(true);
  expect(filter).toEqual({ minHundreds: 0, maxHundreds: 180 });
  expect(entry.phase).toBe("idle");
});

test("1.5 s timeout restores the previous altitude filter", () => {
  const filter = { minHundreds: 10, maxHundreds: 20 };
  const entry = idleFilterEntry(filter);
  beginFilterEntry(entry, filter, 0);
  handleFilterEntryKey(entry, filter, "0", 100);
  expect(expireFilterEntry(entry, filter, 100 + CHORD_TIMEOUT_MS)).toBe(true);
  expect(filter).toEqual({ minHundreds: 10, maxHundreds: 20 });
  expect(entry.phase).toBe("idle");
});

test("AC8 — readout is FILTER / FIL, never cull or slider", () => {
  const filter = DEFAULT_ALTITUDE_FILTER;
  const entry = idleFilterEntry(filter);
  expect(formatFilterReadout(filter, entry)).toBe("FILTER 000-180");
  expect(formatFilterBand(filter, entry)).toBe("000-180");
  beginFilterEntry(entry, filter, 0);
  expect(formatFilterReadout(filter, entry)).toBe("FIL ___-___");
  expect(formatFilterBand(filter, entry)).toBe("___-___");
  entry.digits = "05";
  expect(formatFilterReadout(filter, entry)).toBe("FIL 05_-___");
  expect(formatFilterBand(filter, entry)).toBe("05_-___");
  expect(formatFilterReadout(filter, entry).toLowerCase()).not.toContain("cull");
  expect(formatFilterReadout(filter, entry).toLowerCase()).not.toContain("slider");
});

test("cancelFilterEntry restores previous without throwing", () => {
  const filter = { minHundreds: 70, maxHundreds: 90 };
  const entry = idleFilterEntry(filter);
  beginFilterEntry(entry, filter, 0);
  filter.minHundreds = 1;
  filter.maxHundreds = 2;
  expect(() => cancelFilterEntry(entry, filter)).not.toThrow();
  expect(filter).toEqual({ minHundreds: 70, maxHundreds: 90 });
});

test("cancelFilterEntry on idle leaves committed *LA limits in place", () => {
  const filter = { minHundreds: 0, maxHundreds: 150 };
  const entry = idleFilterEntry({ minHundreds: 0, maxHundreds: 180 });
  cancelFilterEntry(entry, filter);
  expect(filter).toEqual({ minHundreds: 0, maxHundreds: 150 });
  expect(entry.phase).toBe("idle");
});
