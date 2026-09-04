import type { CWTCategory } from "./types";

/**
 * Formats Box 3 aircraft type and equipment string.
 *
 * Rules:
 * - If CWT active (`useCWT !== false` and `cwtCategory` provided): prefix with `${cwtCategory}/`
 * - Else if heavy (`isHeavy === true`): prefix with `H/`
 * - Otherwise: no prefix
 * - Followed by rawType
 * - Followed by equipment suffix (`/L`, `/G`, etc.) if specified
 */
export function formatEquipment(
  rawType: string,
  suffix?: string,
  options?: {
    isHeavy?: boolean;
    cwtCategory?: CWTCategory;
    useCWT?: boolean;
  },
): string {
  const useCWT = options?.useCWT ?? options?.cwtCategory !== undefined;
  let prefix = "";
  if (useCWT && options?.cwtCategory) {
    prefix = `${options.cwtCategory}/`;
  } else if (options?.isHeavy) {
    prefix = "H/";
  }

  const trimmedSuffix = suffix ? suffix.trim() : "";
  let formattedSuffix = "";
  if (trimmedSuffix.length > 0 && trimmedSuffix !== "/") {
    formattedSuffix = trimmedSuffix.startsWith("/") ? trimmedSuffix : `/${trimmedSuffix}`;
  }

  return `${prefix}${rawType.trim()}${formattedSuffix}`;
}

/**
 * Truncates text fields (e.g. route, remarks) exceeding allocated character limit.
 * Leaves strings `<= maxLength` untouched, and trims to `maxLength` + `***` when overflowing.
 */
export function truncateField(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength))}***`;
}

/**
 * Formats Box 5 beacon squawk code to 4 zero-padded digits.
 */
export function formatBeaconCode(code: string): string {
  return (code ?? "").trim().padStart(4, "0");
}

/**
 * Formats 4-digit Zulu time string (HHMM).
 */
export function formatTimeZulu(time: string): string {
  if (!time) {
    return "";
  }
  const cleaned = time.trim().replace(/[:\s]/g, "").replace(/[zZ]$/, "");
  if (cleaned.length === 0) {
    return "";
  }
  return cleaned.padStart(4, "0").slice(-4);
}

/**
 * Formats Box 2 revision index: empty string when undefined or 0; stringified integer for >= 1.
 */
export function formatRevisionIndex(rev?: number): string {
  if (rev === undefined || rev === null || !Number.isFinite(rev) || rev <= 0) {
    return "";
  }
  return Math.floor(rev).toString();
}
