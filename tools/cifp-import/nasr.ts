/**
 * FAA NASR (National Airspace System Resources) subscriber adapter (T04-69).
 *
 * Ingests local NASR APT, ATC/TWR, or manifest files and enriches CIFP airport
 * rows with authoritative `publicUse` and `towered` operational metadata.
 * Missing NASR metadata leaves fields unknown (undefined); never coerced to false.
 *
 * Not imported by `src/` or the browser runtime.
 */

import type { CifpDiagnostic, NormalizedAirport } from "./types.ts";

export interface NasrAirportRecord {
  airportId: string;
  faaId?: string;
  name?: string;
  publicUse?: boolean;
  towered?: boolean;
  sourceFile: string;
  sourceLineNo: number;
  effectiveDate?: string;
  cycle?: string;
}

export interface NasrDataset {
  airports: Map<string, NasrAirportRecord>;
  diagnostics: CifpDiagnostic[];
}

export interface NasrSourceManifest {
  apt?: string;
  twr?: string;
  atc?: string;
  cycle?: string;
  effectiveDate?: string;
}

/** Normalize FAA/ICAO airport identifier (e.g. "ATL" -> "KATL", "katl" -> "KATL"). */
export function normalizeAirportId(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  // Only 3-letter alphabetic FAA ids take the contiguous-US "K" prefix.
  // Alphanumeric fields (6A2, D73, 0GA0) have no K-prefixed ICAO and stay as-is.
  if (/^[A-Z]{3}$/.test(trimmed)) {
    return `K${trimmed}`;
  }
  return trimmed;
}

export function parsePublicUse(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const s = value.trim().toUpperCase();
  if (s === "PU" || s === "PUBLIC" || s === "Y" || s === "YES" || s === "TRUE" || s === "1") {
    return true;
  }
  if (s === "PR" || s === "PRIVATE" || s === "N" || s === "NO" || s === "FALSE" || s === "0") {
    return false;
  }
  return undefined;
}

export function parseTowered(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const s = value.trim().toUpperCase();
  if (
    s === "Y" ||
    s === "YES" ||
    s === "TRUE" ||
    s === "1" ||
    s === "ATCT" ||
    s === "TOWERED" ||
    s === "OPERATIONAL"
  ) {
    return true;
  }
  if (
    s === "N" ||
    s === "NO" ||
    s === "FALSE" ||
    s === "0" ||
    s === "NON-TOWERED" ||
    s === "NON-TOWER" ||
    s.startsWith("NON") ||
    s === "NONE"
  ) {
    return false;
  }
  return undefined;
}

const NASR_CSV_HEADER_TOKENS: ReadonlySet<string> = new Set([
  "ICAO_ID",
  "ICAO",
  "AIRPORT_ID",
  "ARPT_ID",
  "FAA_ID",
  "ID",
  "FAC_USE",
  "FACILITY_USE",
  "USE",
  "PUBLIC_USE",
  "TOWER_ON_SITE",
  "TOWER",
  "TOWERED",
  "TWR_ON_SITE",
  "TOWER_FLAG",
  "TOWER_TYPE",
  "TWR_TYPE",
  "TYPE",
  "NAME",
  "ARPT_NAME",
  "FACILITY_TYPE",
  "SITE_NUMBER",
  "TOWER_HOURS",
]);

function isNasrCsvHeaderLine(line: string): boolean {
  // Fixed-width NASR records (APT/ATT/RWY/RMK/ARS, TWR*) never form a CSV
  // header, even when remark/address fields contain commas and incidental
  // words like "TYPE" or "ICAO".
  if (/^(APT|ATT|RWY|RMK|ARS|TWR)/.test(line)) {
    return false;
  }
  const cols = line.split(",").map((c) => c.trim().toUpperCase().replace(/["']/g, ""));
  return cols.some((col) => NASR_CSV_HEADER_TOKENS.has(col));
}

export function parseNasrApt(content: string, sourceFile = "APT.txt"): NasrDataset {
  const dataset: NasrDataset = {
    airports: new Map(),
    diagnostics: [],
  };

  const trimmed = content.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    parseJsonNasr(trimmed, dataset, sourceFile, "apt");
    return dataset;
  }

  const lines = content.split(/\r?\n/);
  let headerMap: Map<string, number> | undefined;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const lineNo = i + 1;

    // Detect CSV header only when known header tokens are present.
    // Real fixed-width APT address fields contain commas (e.g. "KODIAK, AK").
    if (headerMap === undefined && line.includes(",") && isNasrCsvHeaderLine(line)) {
      const cols = line.split(",").map((c) => c.trim().toUpperCase().replace(/["']/g, ""));
      headerMap = new Map();
      cols.forEach((col, idx) => headerMap!.set(col, idx));
      continue;
    }

    if (headerMap !== undefined) {
      parseCsvAptRow(line, lineNo, headerMap, dataset, sourceFile);
      continue;
    }

    // Pipe-separated or legacy fixed-width line
    if (line.startsWith("APT|") || line.includes("|")) {
      parsePipeAptRow(line, lineNo, dataset, sourceFile);
      continue;
    }

    if (line.startsWith("APT")) {
      parseLegacyFixedAptRow(rawLine, lineNo, dataset, sourceFile);
      continue;
    }
  }

  return dataset;
}

export function parseNasrTwr(content: string, sourceFile = "TWR.txt"): NasrDataset {
  const dataset: NasrDataset = {
    airports: new Map(),
    diagnostics: [],
  };

  const trimmed = content.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    parseJsonNasr(trimmed, dataset, sourceFile, "twr");
    return dataset;
  }

  const lines = content.split(/\r?\n/);
  let headerMap: Map<string, number> | undefined;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const lineNo = i + 1;

    // Detect CSV header only when known header tokens are present.
    // Real fixed-width TWR remark fields contain commas.
    if (headerMap === undefined && line.includes(",") && isNasrCsvHeaderLine(line)) {
      const cols = line.split(",").map((c) => c.trim().toUpperCase().replace(/["']/g, ""));
      headerMap = new Map();
      cols.forEach((col, idx) => headerMap!.set(col, idx));
      continue;
    }

    if (headerMap !== undefined) {
      parseCsvTwrRow(line, lineNo, headerMap, dataset, sourceFile);
      continue;
    }

    if (line.startsWith("TWR|") || line.includes("|")) {
      parsePipeTwrRow(line, lineNo, dataset, sourceFile);
      continue;
    }

    if (line.startsWith("TWR")) {
      parseLegacyFixedTwrRow(rawLine, lineNo, dataset, sourceFile);
      continue;
    }
  }

  return dataset;
}

function parseJsonNasr(
  jsonText: string,
  dataset: NasrDataset,
  sourceFile: string,
  kind: "apt" | "twr",
): void {
  try {
    const parsed = JSON.parse(jsonText);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      const rawId = (row["airportId"] ?? row["icaoId"] ?? row["arptId"] ?? row["id"]) as
        string | undefined;
      if (!rawId || typeof rawId !== "string") {
        continue;
      }
      const airportId = normalizeAirportId(rawId);
      const publicUse = kind === "apt" ? parsePublicUse(row["publicUse"] ?? row["use"]) : undefined;
      const towered = kind === "twr" ? parseTowered(row["towered"] ?? row["towerFlag"]) : undefined;

      addNasrRecord(
        dataset,
        {
          airportId,
          faaId: rawId.length === 3 ? rawId.toUpperCase() : undefined,
          name: typeof row["name"] === "string" ? row["name"] : undefined,
          publicUse,
          towered,
          sourceFile,
          sourceLineNo: i + 1,
          cycle: typeof row["cycle"] === "string" ? row["cycle"] : undefined,
          effectiveDate:
            typeof row["effectiveDate"] === "string" ? row["effectiveDate"] : undefined,
        },
        sourceFile,
        i + 1,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dataset.diagnostics.push({
      severity: "error",
      code: "MALFORMED_NASR_JSON",
      message: `${sourceFile}: failed to parse JSON: ${msg}`,
    });
  }
}

function parseCsvAptRow(
  line: string,
  lineNo: number,
  headers: Map<string, number>,
  dataset: NasrDataset,
  sourceFile: string,
): void {
  const parts = splitCsvLine(line);
  const icaoIdx = headers.get("ICAO_ID") ?? headers.get("ICAO") ?? headers.get("AIRPORT_ID") ?? -1;
  const arptIdx = headers.get("ARPT_ID") ?? headers.get("FAA_ID") ?? headers.get("ID") ?? -1;
  const useIdx =
    headers.get("FAC_USE") ??
    headers.get("FACILITY_USE") ??
    headers.get("USE") ??
    headers.get("PUBLIC_USE") ??
    -1;
  const twrIdx =
    headers.get("TOWER_ON_SITE") ??
    headers.get("TOWER") ??
    headers.get("TOWERED") ??
    headers.get("TWR_ON_SITE") ??
    headers.get("TOWER_FLAG") ??
    -1;
  const nameIdx = headers.get("NAME") ?? headers.get("ARPT_NAME") ?? -1;

  const rawId = (parts[icaoIdx] || parts[arptIdx] || "").trim();
  if (rawId.length === 0) {
    return;
  }
  const airportId = normalizeAirportId(rawId);
  const rawUse = useIdx >= 0 ? parts[useIdx] : undefined;
  const publicUse = parsePublicUse(rawUse);
  const rawTwr = twrIdx >= 0 ? parts[twrIdx] : undefined;
  const towered = parseTowered(rawTwr);
  const name = nameIdx >= 0 ? parts[nameIdx]?.trim() : undefined;

  addNasrRecord(
    dataset,
    {
      airportId,
      faaId: rawId.length === 3 ? rawId.toUpperCase() : undefined,
      name: name && name.length > 0 ? name : undefined,
      publicUse,
      towered,
      sourceFile,
      sourceLineNo: lineNo,
    },
    sourceFile,
    lineNo,
  );
}

function parseCsvTwrRow(
  line: string,
  lineNo: number,
  headers: Map<string, number>,
  dataset: NasrDataset,
  sourceFile: string,
): void {
  const parts = splitCsvLine(line);
  const icaoIdx = headers.get("ICAO_ID") ?? headers.get("ICAO") ?? headers.get("AIRPORT_ID") ?? -1;
  const arptIdx = headers.get("ARPT_ID") ?? headers.get("FAA_ID") ?? headers.get("ID") ?? -1;
  const twrIdx =
    headers.get("TOWER_TYPE") ??
    headers.get("TWR_TYPE") ??
    headers.get("TOWER_FLAG") ??
    headers.get("TOWERED") ??
    headers.get("TYPE") ??
    -1;

  const rawId = (parts[icaoIdx] || parts[arptIdx] || "").trim();
  if (rawId.length === 0) {
    return;
  }
  const airportId = normalizeAirportId(rawId);
  const rawTwr = twrIdx >= 0 ? parts[twrIdx] : "Y";
  const towered = parseTowered(rawTwr);

  addNasrRecord(
    dataset,
    {
      airportId,
      faaId: rawId.length === 3 ? rawId.toUpperCase() : undefined,
      towered,
      sourceFile,
      sourceLineNo: lineNo,
    },
    sourceFile,
    lineNo,
  );
}

function parsePipeAptRow(
  line: string,
  lineNo: number,
  dataset: NasrDataset,
  sourceFile: string,
): void {
  const parts = line.split("|").map((p) => p.trim());
  // Standard pipe format: APT|site_no|facility_type|location_id|icao_id|...|facility_use|arpt_name
  const rawId = parts[4] || parts[3] || parts[1] || "";
  if (rawId.length === 0) {
    return;
  }
  const airportId = normalizeAirportId(rawId);
  const rawUse = parts.find((p) => p === "PU" || p === "PR") ?? parts[6];
  const publicUse = parsePublicUse(rawUse);

  addNasrRecord(
    dataset,
    {
      airportId,
      faaId: rawId.length === 3 ? rawId.toUpperCase() : undefined,
      publicUse,
      sourceFile,
      sourceLineNo: lineNo,
    },
    sourceFile,
    lineNo,
  );
}

function parsePipeTwrRow(
  line: string,
  lineNo: number,
  dataset: NasrDataset,
  sourceFile: string,
): void {
  const parts = line.split("|").map((p) => p.trim());
  const rawId = parts[1] || parts[2] || "";
  if (rawId.length === 0) {
    return;
  }
  const airportId = normalizeAirportId(rawId);
  const rawTwr = parts[3] || "Y";
  const towered = parseTowered(rawTwr);

  addNasrRecord(
    dataset,
    {
      airportId,
      faaId: rawId.length === 3 ? rawId.toUpperCase() : undefined,
      towered,
      sourceFile,
      sourceLineNo: lineNo,
    },
    sourceFile,
    lineNo,
  );
}

function parseLegacyFixedAptRow(
  line: string,
  lineNo: number,
  dataset: NasrDataset,
  sourceFile: string,
): void {
  const fixedId = line.length >= 31 ? line.slice(27, 31).trim() : "";
  const matchId = /^APT\s+\S+\s+\S+\s+([A-Z0-9]{3,4})/.exec(line);
  const rawId = fixedId.length > 0 ? fixedId : matchId ? matchId[1] : "";
  if (!rawId || rawId.length === 0) {
    return;
  }
  const airportId = normalizeAirportId(rawId);
  // Real NASR APT fixed-width carries ownership + FAC_USE as a 4-char pair
  // (e.g. "PUPU", "PRPR", "PUPR", "PRPU") at 0-based 183-186. FAC_USE is the
  // second pair. Synthetic short rows fall back to word-boundary search.
  const fixedUse = line.length >= 187 ? line.slice(185, 187).toUpperCase() : "";
  let publicUse: boolean | undefined;
  if (fixedUse === "PU") {
    publicUse = true;
  } else if (fixedUse === "PR") {
    publicUse = false;
  } else if (line.length < 187) {
    const prefix = line.slice(0, 100);
    const hasPu = /\bPU\b/.test(prefix);
    const hasPr = /\bPR\b/.test(prefix);
    publicUse = hasPu ? true : hasPr ? false : undefined;
  }

  addNasrRecord(
    dataset,
    {
      airportId,
      faaId: rawId.length === 3 ? rawId.toUpperCase() : undefined,
      publicUse,
      sourceFile,
      sourceLineNo: lineNo,
    },
    sourceFile,
    lineNo,
  );
}

function parseLegacyFixedTwrRow(
  line: string,
  lineNo: number,
  dataset: NasrDataset,
  sourceFile: string,
): void {
  const matchId = /^TWR\s+([A-Z0-9]{3,4})/.exec(line);
  const rawId = matchId ? matchId[1] : line.slice(4, 8).trim();
  if (!rawId || rawId.length === 0) {
    return;
  }
  const airportId = normalizeAirportId(rawId);
  addNasrRecord(
    dataset,
    {
      airportId,
      faaId: rawId.length === 3 ? rawId.toUpperCase() : undefined,
      towered: true,
      sourceFile,
      sourceLineNo: lineNo,
    },
    sourceFile,
    lineNo,
  );
}

function addNasrRecord(
  dataset: NasrDataset,
  record: NasrAirportRecord,
  sourceFile: string,
  lineNo: number,
): void {
  const existing = dataset.airports.get(record.airportId);
  if (existing === undefined) {
    dataset.airports.set(record.airportId, record);
    return;
  }

  // Check for publicUse conflict vs duplicate
  if (record.publicUse !== undefined && existing.publicUse !== undefined) {
    if (record.publicUse !== existing.publicUse) {
      dataset.diagnostics.push({
        severity: "error",
        code: "CONFLICTING_NASR_RECORD",
        message: `Conflicting publicUse for ${record.airportId}: ${existing.sourceFile}:${existing.sourceLineNo} (${existing.publicUse}) vs ${sourceFile}:${lineNo} (${record.publicUse})`,
        airportId: record.airportId,
        lineNo,
      });
      return;
    }
    // Duplicate identical row
    dataset.diagnostics.push({
      severity: "warning",
      code: "DUPLICATE_NASR_RECORD",
      message: `Duplicate NASR publicUse record for ${record.airportId} on line ${lineNo} (matches line ${existing.sourceLineNo})`,
      airportId: record.airportId,
      lineNo,
    });
  } else if (record.publicUse !== undefined) {
    existing.publicUse = record.publicUse;
  }

  // Check for towered conflict vs duplicate
  if (record.towered !== undefined && existing.towered !== undefined) {
    if (record.towered !== existing.towered) {
      dataset.diagnostics.push({
        severity: "error",
        code: "CONFLICTING_NASR_RECORD",
        message: `Conflicting towered status for ${record.airportId}: ${existing.sourceFile}:${existing.sourceLineNo} (${existing.towered}) vs ${sourceFile}:${lineNo} (${record.towered})`,
        airportId: record.airportId,
        lineNo,
      });
      return;
    }
    // Duplicate identical row
    dataset.diagnostics.push({
      severity: "warning",
      code: "DUPLICATE_NASR_RECORD",
      message: `Duplicate NASR towered record for ${record.airportId} on line ${lineNo} (matches line ${existing.sourceLineNo})`,
      airportId: record.airportId,
      lineNo,
    });
  } else if (record.towered !== undefined) {
    existing.towered = record.towered;
  }

  if (record.name && !existing.name) {
    existing.name = record.name;
  }
}

export function mergeNasrData(datasets: NasrDataset[]): NasrDataset {
  const merged: NasrDataset = {
    airports: new Map(),
    diagnostics: [],
  };

  for (const ds of datasets) {
    merged.diagnostics.push(...ds.diagnostics);
    for (const record of ds.airports.values()) {
      addNasrRecord(merged, record, record.sourceFile, record.sourceLineNo);
    }
  }

  return merged;
}

export function enrichAirportsWithNasr(
  airports: NormalizedAirport[],
  nasr: NasrDataset,
): {
  enriched: NormalizedAirport[];
  diagnostics: CifpDiagnostic[];
} {
  const portableSourceId = (source: string): string => {
    const normalized = source.replaceAll("\\", "/");
    return normalized.slice(normalized.lastIndexOf("/") + 1) || "local-source";
  };
  const diagnostics: CifpDiagnostic[] = [...nasr.diagnostics];
  const matchedNasrKeys = new Set<string>();

  const enriched: NormalizedAirport[] = airports.map((airport) => {
    // Try matching by normalized ICAO, or 3-letter FAA ID
    let match = nasr.airports.get(airport.airportId);
    if (!match && airport.airportId.startsWith("K") && airport.airportId.length === 4) {
      match = nasr.airports.get(airport.airportId.slice(1));
    }

    if (match !== undefined) {
      matchedNasrKeys.add(match.airportId);
      return {
        ...airport,
        publicUse: match.publicUse,
        towered: match.towered,
        serviceMetadata: {
          publicUse: match.publicUse,
          towered: match.towered,
          sourceFile: portableSourceId(match.sourceFile),
          sourceRecordId: match.faaId ?? match.airportId,
          effectiveDate: match.effectiveDate,
          cycle: match.cycle,
        },
      };
    }

    // No NASR companion: fields remain undefined, never coerced to false
    return {
      ...airport,
      publicUse: undefined,
      towered: undefined,
      serviceMetadata: undefined,
    };
  });

  // Report unmatched NASR records
  for (const nasrAirport of nasr.airports.values()) {
    if (!matchedNasrKeys.has(nasrAirport.airportId)) {
      diagnostics.push({
        severity: "warning",
        code: "UNMATCHED_NASR_RECORD",
        message: `NASR airport ${nasrAirport.airportId} did not match any CIFP airport in source`,
        airportId: nasrAirport.airportId,
        lineNo: nasrAirport.sourceLineNo,
      });
    }
  }

  return { enriched, diagnostics };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ""));
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ""));
  return result;
}
