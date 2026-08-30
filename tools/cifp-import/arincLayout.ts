/**
 * ARINC 424-18 / FAA CIFP fixed-width field helpers (T04-31).
 *
 * Column numbers are 1-based, matching the specification. Records are 132
 * characters. Packed lat/lon is N/S+DDMMSSHH and E/W+DDDMMSSHH.
 *
 * FAA CIFP uses the same 132-char packing as ARINC 424-18. VHF navaid (D)
 * primary records put VOR lat/lon at 33/42 when the facility has a VOR;
 * DME-only / TACAN / ILS-DME rows leave those blank and put DME lat/lon at
 * 56/65. Terminal NDB (PN) uses subsection N at column 6, not column 13.
 */

import type { CifpDialect } from "./types.ts";

export const ARINC_RECORD_LENGTH = 132;

/** 1-based ARINC 424-18 / FAA CIFP columns used by the subset parser. */
export const ARINC_COL = {
  SECTION: 5,
  SUBSECTION_NAVAID: 6,
  AIRPORT_ID: 7,
  SUBSECTION_AIRPORT: 13,
  IDENT: 14,
  CONT_POINT: 22,
  FREQ: 23,
  NAVAID_CLASS: 28,
  LAT: 33,
  LON: 42,
  DME_IDENT: 52,
  DME_LAT: 56,
  DME_LON: 65,
  CONT_PROCEDURE: 39,
  NAME: 94,
} as const;

/** ARINC 424-style: N/S + DD + MM + SS + hundredths (9 chars). */
export function parsePackedLat(text: string, context?: string): number {
  const match = /^([NS])(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(text);
  if (match === null) {
    throw new Error(
      context ? `${context}: invalid packed latitude ${text}` : `invalid packed latitude ${text}`,
    );
  }
  const deg = packedToDeg(match[2]!, match[3]!, match[4]!, match[5]!);
  return match[1] === "S" ? -deg : deg;
}

/** ARINC 424-style: E/W + DDD + MM + SS + hundredths (10 chars). */
export function parsePackedLon(text: string, context?: string): number {
  const match = /^([EW])(\d{3})(\d{2})(\d{2})(\d{2})$/.exec(text);
  if (match === null) {
    throw new Error(
      context ? `${context}: invalid packed longitude ${text}` : `invalid packed longitude ${text}`,
    );
  }
  const deg = packedToDeg(match[2]!, match[3]!, match[4]!, match[5]!);
  return match[1] === "W" ? -deg : deg;
}

function packedToDeg(deg: string, min: string, sec: string, hundredths: string): number {
  const minutes = Number(min);
  const seconds = Number(sec);
  if (minutes >= 60 || seconds >= 60) {
    throw new Error(`invalid packed DMS ${deg}${min}${sec}${hundredths}`);
  }
  return Number(deg) + minutes / 60 + (seconds + Number(hundredths) / 100) / 3600;
}

export function readField(line: string, start: number, length: number): string {
  return line.slice(start - 1, start - 1 + length);
}

export function readTrim(line: string, start: number, length: number): string {
  return readField(line, start, length).trim();
}

export function padRecord(line: string): string {
  if (line.length >= ARINC_RECORD_LENGTH) {
    return line.slice(0, ARINC_RECORD_LENGTH);
  }
  return line + " ".repeat(ARINC_RECORD_LENGTH - line.length);
}

export function isPrimaryRecord(line: string, continuationColumn: number): boolean {
  const flag = readField(line, continuationColumn, 1);
  return flag === "0" || flag === "1" || flag === " " || flag === "";
}

/**
 * Section/subsection ident used throughout CIFP (PA, D, DB, EA, PC, PI, PE, …).
 *
 * Enroute/navaid family (D, DB, EA, PN): subsection at column 6.
 * Airport family (PA, PG, PC, PE, PD, PF, PI, PM): column 6 blank, subsection
 * at column 13. FAA terminal NDB is `PN` at columns 5–6 (not column 13).
 */
export function sectionIdent(line: string): string {
  const section = readField(line, ARINC_COL.SECTION, 1);
  const subNavaid = readField(line, ARINC_COL.SUBSECTION_NAVAID, 1).trim();
  const subAirport = readField(line, ARINC_COL.SUBSECTION_AIRPORT, 1).trim();
  if (section === "P" || section === "H") {
    if (subNavaid.length > 0) {
      return `${section}${subNavaid}`;
    }
    return subAirport.length > 0 ? `${section}${subAirport}` : section;
  }
  return subNavaid.length > 0 ? `${section}${subNavaid}` : section;
}

/** Packed lat/lon at 1-based columns, or undefined when either side is blank. */
export function readPackedLatLon(
  line: string,
  latStart: number,
  lonStart: number,
): { lat: string; lon: string } | undefined {
  const lat = readTrim(line, latStart, 9);
  const lon = readTrim(line, lonStart, 10);
  if (lat.length === 0 || lon.length === 0) {
    return undefined;
  }
  return { lat, lon };
}

export function writeField(buf: string[], start: number, length: number, value: string): void {
  for (let i = 0; i < length; i++) {
    buf[start - 1 + i] = value[i] ?? " ";
  }
}

/** Build a 132-char record from 1-based [start, length, value] tuples. */
export function arincRecord(fields: Array<[number, number, string]>): string {
  const buf = Array.from({ length: ARINC_RECORD_LENGTH }, () => " ");
  for (const [start, length, value] of fields) {
    writeField(buf, start, length, value);
  }
  return buf.join("");
}

export function detectCifpDialect(text: string): CifpDialect {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("HDR")) {
      continue;
    }
    const paddedLook = line.length >= 128 && /^[ST]/.test(line);
    if (paddedLook) {
      return "fixed-width";
    }
    if (trimmed.includes(",")) {
      return "comma-separated";
    }
  }
  return "comma-separated";
}

export function parseMagVarDeg(text: string, context: string): number {
  const packed = text.trim();
  if (packed.length === 0) {
    return 0;
  }
  const match = /^([EW])(\d{4})$/.exec(packed);
  if (match === null) {
    throw new Error(`${context}: invalid magnetic variation ${text}`);
  }
  const tenths = Number(match[2]);
  const deg = tenths / 10;
  return match[1] === "W" ? -deg : deg;
}

export function parseTenthsDeg(text: string, context: string): number | undefined {
  const packed = text.trim();
  if (packed.length === 0) {
    return undefined;
  }
  if (!/^\d+$/.test(packed)) {
    throw new Error(`${context}: invalid tenths-of-degree field ${text}`);
  }
  return Number(packed) / 10;
}

export function parseHundredthsDeg(text: string, context: string): number | undefined {
  const packed = text.trim();
  if (packed.length === 0) {
    return undefined;
  }
  if (!/^\d+$/.test(packed)) {
    throw new Error(`${context}: invalid hundredths-of-degree field ${text}`);
  }
  return Number(packed) / 100;
}

export function parseFreqMhz(text: string, context: string): number | undefined {
  const packed = text.trim();
  if (packed.length === 0) {
    return undefined;
  }
  if (!/^\d+$/.test(packed)) {
    throw new Error(`${context}: invalid frequency ${text}`);
  }
  return Number(packed) / 100;
}

/** NDB frequency: 5 numeric characters in tenths of kHz. */
export function parseFreqKhz(text: string, context: string): number | undefined {
  const packed = text.trim();
  if (packed.length === 0) {
    return undefined;
  }
  if (!/^\d+$/.test(packed)) {
    throw new Error(`${context}: invalid NDB frequency ${text}`);
  }
  return Number(packed) / 10;
}

export function parseFeet(text: string, context: string): number | undefined {
  const packed = text.trim();
  if (packed.length === 0) {
    return undefined;
  }
  if (/^FL\d{3}$/i.test(packed)) {
    return Number(packed.slice(2)) * 100;
  }
  if (!/^-?\d+$/.test(packed)) {
    throw new Error(`${context}: invalid altitude/elevation ${text}`);
  }
  return Number(packed);
}
