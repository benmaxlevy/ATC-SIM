/**
 * Analog: CRC STARS System Lists Formatter / Vice stars/lists.go (ListFormatter, formatListEntry).
 * Formats system lists declaratively with token replacements, character padding,
 * fix name compression, and MORE pagination headers.
 */

export interface ListFormatter {
  /** Title rendered on the first line inside the list (e.g. "FLIGHT PLAN", "VFR LIST"). */
  title?: string;
  /** Frame title rendered above the bounding box during drag/preview (e.g. "FLIGHT PLAN (T)"). */
  frameTitle: string;
  /** Maximum number of content lines to display simultaneously. */
  maxLines: number;
  /** Total number of entries available. */
  entries: number;
  /** Function producing line content for entry at given index. */
  formatLine: (idx: number) => string;
}

/**
 * Rewrites a fix name for system list display (max 3 characters).
 */
export function rewriteFixForList(fix: string | undefined): string {
  if (!fix) return "   ";
  const trimmed = fix.trim();
  if (trimmed.length > 3) {
    return trimmed.slice(0, 3).toUpperCase();
  }
  return trimmed.padStart(3, " ").toUpperCase();
}

/**
 * Formats a single entry string with bracketed token replacements.
 * Recognized specifiers: [INDEX], [ACID], [BEACON], [ACTYPE], [REQ_ALT], [ENTRY_FIX], [EXIT_FIX], [DEP_EXIT_FIX], etc.
 */
export function formatListEntry(
  format: string,
  tokens: Record<string, string | number | undefined>,
): string {
  return format.replace(/\[([A-Z0-9_]+)\]/g, (match, specifier: string) => {
    const val = tokens[specifier];
    if (val !== undefined) {
      return String(val);
    }
    return match;
  });
}

/**
 * Builds the array of text lines to render on the scope for a given ListFormatter.
 * Adds title, MORE header if entries > maxLines, and up to maxLines of formatted content.
 */
export function buildSystemListLines(formatter: ListFormatter): string[] {
  const lines: string[] = [];
  if (formatter.title) {
    lines.push(formatter.title);
  }
  if (formatter.entries > formatter.maxLines && formatter.maxLines > 0) {
    lines.push(`MORE: ${formatter.maxLines}/${formatter.entries}`);
  }
  const count = Math.min(formatter.entries, formatter.maxLines > 0 ? formatter.maxLines : formatter.entries);
  for (let i = 0; i < count; i++) {
    const line = formatter.formatLine(i);
    if (line.length > 0) {
      lines.push(line);
    }
  }
  return lines;
}
