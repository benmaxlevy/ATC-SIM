/**
 * ARINC 424 / FAA CIFP runway identity matching.
 *
 * PG records name a physical runway (`RW26L`). SID/STAR transition identifiers
 * may use suffix `B` (“both”) for the parallel pair (`26L` and `26R`). `B` is
 * not a PG ident. Bare `27` / `RW27` stay exact and do not match `27L`/`27R`.
 *
 * Tool-only. Do not import from `src/`.
 */

export interface ParsedRunwayIdent {
  /** Two-digit runway number (`09`, `26`). */
  number: string;
  /** L/R/C/B/W/T or undefined for a bare number. */
  suffix: string | undefined;
}

/** Parallel ends that FAA `B` (“both”) covers. Not center, not water. */
const BOTH_PARALLEL_SUFFIXES = new Set(["L", "R"]);

const RUNWAY_IDENT_RE = /^(\d{1,2})([A-Z])?$/;

export function stripRwPrefix(id: string): string {
  const trimmed = id.replace(/\s+/g, "").toUpperCase();
  return trimmed.startsWith("RW") ? trimmed.slice(2) : trimmed;
}

export function parseRunwayIdent(id: string): ParsedRunwayIdent | undefined {
  const match = RUNWAY_IDENT_RE.exec(stripRwPrefix(id));
  if (match === null) {
    return undefined;
  }
  const raw = match[1]!;
  return {
    number: raw.length === 1 ? raw.padStart(2, "0") : raw,
    suffix: match[2],
  };
}

export function isGroupedBothRunwayRef(id: string): boolean {
  return parseRunwayIdent(id)?.suffix === "B";
}

export function isAllRunwaysIdent(id: string): boolean {
  return stripRwPrefix(id) === "ALL";
}

/** SID/STAR runway transitions are coded `RW…` in ARINC (not bare `ALL`). */
export function isRunwayTransitionIdent(id: string): boolean {
  return /^RW/i.test(id.trim());
}

/**
 * Catalog ids drop the `RW` prefix (`RW26L` → `26L`) to match existing
 * `27` / `09` SID rows.
 */
export function catalogRunwayId(runwayId: string): string {
  return stripRwPrefix(runwayId);
}

/**
 * `stored` is a PG ident (`RW26L` / `26L`). `ref` is a procedure runway
 * reference (`26B`, `RW27`, `27`).
 */
export function runwayIdsMatch(stored: string, ref: string): boolean {
  const storedKey = stripRwPrefix(stored);
  const refKey = stripRwPrefix(ref);
  if (storedKey.length === 0 || refKey.length === 0) {
    return false;
  }
  if (storedKey === refKey) {
    return true;
  }
  const storedParsed = parseRunwayIdent(stored);
  const refParsed = parseRunwayIdent(ref);
  if (storedParsed === undefined || refParsed === undefined) {
    return false;
  }
  if (refParsed.suffix === "B") {
    return (
      storedParsed.number === refParsed.number &&
      storedParsed.suffix !== undefined &&
      BOTH_PARALLEL_SUFFIXES.has(storedParsed.suffix)
    );
  }
  return storedParsed.number === refParsed.number && storedParsed.suffix === refParsed.suffix;
}

export function matchingRunways<T extends { runwayId: string; airportId?: string }>(
  runways: readonly T[],
  ref: string,
  airportId?: string,
): T[] {
  return runways.filter((row) => {
    if (airportId !== undefined && row.airportId !== airportId) {
      return false;
    }
    return runwayIdsMatch(row.runwayId, ref);
  });
}
