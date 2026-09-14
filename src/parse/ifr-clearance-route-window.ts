import type { ClearanceRouteSegment } from "@core";
import {
  compactProcedureKey,
  groundFixPhraseToCatalog,
  matchSpokenStarTransition,
  sanitizeCatalogProcedures,
  type CatalogFixInput,
  type CatalogProcedure,
} from "./spoken/catalog-ground";
import { isFixIdToken } from "./tokens";

/** Tokens which begin a clearance field or another supported clearance item. */
const ROUTE_BOUNDARIES = new Set([
  "alt",
  "maintain",
  "cvia",
  "freq",
  "frequency",
  "sq",
  "squawk",
  "climb",
  "descend",
  "contact",
  "expect",
]);

const ROUTE_STOP_WORDS = new Set(["direct", "then", ...ROUTE_BOUNDARIES]);
const MAX_ROUTE_PHRASE_WORDS = 6;

export function isIfrRouteBoundary(tokens: readonly string[], index: number): boolean {
  return isBoundary(tokens, index);
}

/** Token bounds for the route body after a clearance `VIA`. */
export function routeWindowBounds(
  tokens: readonly string[],
  startIndex: number,
): { startIndex: number; endIndex: number } | null {
  let endIndex = startIndex;
  while (!isBoundary(tokens, endIndex)) endIndex += 1;
  return endIndex > startIndex ? { startIndex, endIndex } : null;
}

export interface IfrClearanceRouteWindowOptions {
  fixes?: readonly CatalogFixInput[];
  procedures?: readonly CatalogProcedure[];
}

export interface IfrClearanceRouteWindow {
  nextIndex: number;
  segments: ClearanceRouteSegment[];
}

function routeKey(value: string): string {
  return compactProcedureKey(value);
}

function isBoundary(tokens: readonly string[], index: number): boolean {
  const token = tokens[index]?.toLowerCase();
  if (token === undefined) return true;
  if (ROUTE_BOUNDARIES.has(token)) return true;
  return (token === "climb" || token === "descend") && tokens[index + 1] === "via";
}

function isControlWord(token: string | undefined): boolean {
  return token !== undefined && ROUTE_STOP_WORDS.has(token.toLowerCase());
}

function groundedFixMatches(
  tokens: readonly string[],
  index: number,
  fixes: readonly CatalogFixInput[],
): Array<{ id: string; next: number }> {
  const out: Array<{ id: string; next: number }> = [];
  const seen = new Set<string>();
  const max = Math.min(MAX_ROUTE_PHRASE_WORDS, tokens.length - index);
  for (let length = max; length >= 1; length -= 1) {
    const slice = tokens.slice(index, index + length);
    if (slice.some((token) => isControlWord(token))) continue;
    const id = groundFixPhraseToCatalog(slice, fixes);
    if (id !== null && !seen.has(id)) {
      seen.add(id);
      out.push({ id, next: index + length });
    }
  }
  return out;
}

function rawFixMatch(
  tokens: readonly string[],
  index: number,
): Array<{ id: string; next: number }> {
  const token = tokens[index];
  if (!token || isControlWord(token) || !isFixIdToken(token.toUpperCase())) return [];
  return [{ id: token.toUpperCase(), next: index + 1 }];
}

function procedurePhraseMatches(
  tokens: readonly string[],
  index: number,
  procedures: readonly CatalogProcedure[],
): Array<{ procedureId: string; next: number }> {
  const out: Array<{ procedureId: string; next: number }> = [];
  const seen = new Set<string>();
  const max = Math.min(MAX_ROUTE_PHRASE_WORDS, tokens.length - index);
  for (let length = max; length >= 1; length -= 1) {
    const slice = tokens.slice(index, index + length);
    if (slice.some((token) => isControlWord(token))) continue;
    const key = routeKey(slice.join(" "));
    if (!key) continue;
    for (const procedure of procedures) {
      const normalized = procedure.id.trim().toUpperCase();
      if (
        normalized &&
        !seen.has(normalized) &&
        [procedure.id, procedure.name ?? ""].some((alias) => routeKey(alias) === key)
      ) {
        seen.add(normalized);
        out.push({ procedureId: normalized, next: index + length });
      }
    }
  }
  return out;
}

function procedureMatches(
  tokens: readonly string[],
  index: number,
  procedures: readonly CatalogProcedure[],
): {
  matches: Array<{ segment: ClearanceRouteSegment; next: number }>;
  ambiguous: boolean;
} {
  const out: Array<{ segment: ClearanceRouteSegment; next: number }> = [];
  const spokenTokens = tokens.map((token) => token.toLowerCase());
  for (const match of procedurePhraseMatches(tokens, index, procedures)) {
    const transition = matchSpokenStarTransition(
      spokenTokens,
      match.next,
      match.procedureId,
      procedures,
    );
    if (transition.kind === "ambiguous") {
      return { matches: [], ambiguous: true };
    }
    if (transition.kind === "hit") {
      out.push({
        segment: {
          type: "PROCEDURE",
          procedureId: match.procedureId,
          transitionId: transition.id,
        },
        next: transition.next,
      });
    } else {
      out.push({
        segment: { type: "PROCEDURE", procedureId: match.procedureId },
        next: match.next,
      });
    }
  }
  return { matches: out, ambiguous: false };
}

function uniquePaths(paths: IfrClearanceRouteWindow[]): IfrClearanceRouteWindow[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = JSON.stringify(path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Scan the route body after VIA. DIRECT is a connector, not a route segment;
 * a terminal connector means direct to the separately parsed clearance limit.
 * Every other route token must be a complete catalog phrase when a catalog is
 * supplied. The small backtracking parser prevents a long alias or procedure
 * transition from being greedily split into unrelated legs.
 */
export function scanIfrClearanceRouteWindow(
  tokens: readonly string[],
  startIndex: number,
  options: IfrClearanceRouteWindowOptions = {},
): IfrClearanceRouteWindow | null {
  const fixes = options.fixes ?? [];
  const procedures = sanitizeCatalogProcedures(options.procedures);
  const useCatalog = fixes.length > 0 || procedures.length > 0;
  const memo = new Map<string, IfrClearanceRouteWindow[]>();

  const parse = (
    index: number,
    segments: ClearanceRouteSegment[],
    afterThen = false,
  ): IfrClearanceRouteWindow[] => {
    const key = `${index}|${afterThen}|${JSON.stringify(segments)}`;
    const cached = memo.get(key);
    if (cached) return cached;

    if (isBoundary(tokens, index)) {
      const result = !afterThen && segments.length > 0 ? [{ nextIndex: index, segments }] : [];
      memo.set(key, result);
      return result;
    }

    const token = tokens[index]!.toLowerCase();
    if (token === "then") {
      if (afterThen || segments.length === 0) {
        memo.set(key, []);
        return [];
      }
      const result = parse(index + 1, segments, true);
      memo.set(key, result);
      return result;
    }

    if (token === "direct") {
      const next = index + 1;
      if (isBoundary(tokens, next)) {
        const result = [{ nextIndex: next, segments }];
        memo.set(key, result);
        return result;
      }
      if (tokens[next]?.toLowerCase() === "then" || tokens[next]?.toLowerCase() === "direct") {
        memo.set(key, []);
        return [];
      }
      const matches = useCatalog
        ? groundedFixMatches(tokens, next, fixes)
        : rawFixMatch(tokens, next);
      const paths = matches.flatMap((match) =>
        parse(match.next, [...segments, { type: "DIRECT", fixId: match.id }]),
      );
      const result = uniquePaths(paths);
      memo.set(key, result);
      return result;
    }

    const procedure =
      procedures.length > 0
        ? procedureMatches(tokens, index, procedures)
        : { matches: [], ambiguous: false };
    if (procedure.ambiguous) {
      memo.set(key, []);
      return [];
    }
    const fixesAt = useCatalog
      ? groundedFixMatches(tokens, index, fixes)
      : rawFixMatch(tokens, index);
    const matches =
      procedure.matches.length > 0
        ? procedure.matches.map((match) => ({ segment: match.segment, next: match.next }))
        : fixesAt.map((match) => ({
            segment: { type: "DIRECT", fixId: match.id } as const,
            next: match.next,
          }));
    const paths = matches.flatMap((match) => parse(match.next, [...segments, match.segment]));
    const result = uniquePaths(paths);
    memo.set(key, result);
    return result;
  };

  const paths = parse(startIndex, []);
  if (paths.length !== 1) return null;
  return paths[0]!;
}
