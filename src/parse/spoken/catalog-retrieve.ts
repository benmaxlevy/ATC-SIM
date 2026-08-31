/**
 * Rank spoken fix tokens against the full facility catalog.
 *
 * Analog: JO 7110.65 radio communications — intersection / fix names on
 * frequency are spoken as pronounceable names (navaids by ident / name per
 * phraseology). Trainer delta: catalog rows are 5-letter ids (`HAINZ`,
 * `AJAAY`). ASR and controllers say words (`Haynes`, `AJ` / `Ajay`). Retrieve
 * ranks the spoken token onto those ids. Unique snap already maps Haynes→HAINZ
 * and AJ→AJAAY when the match is unique; this module ranks the same pairs when
 * the id sits past file-order 64. Not full 7110.65 coverage.
 *
 * Walks the full sanitized catalog argument. Does not inherit STT / Path C
 * `ids().slice(0, 64)`. Rank only — do not argmax-snap. Unique
 * `groundFixToCatalog` stays the parser happy path.
 *
 * Scores are on [0, 1], higher better, so a later floor (0.80) and margin
 * (0.05) can compare hits without every integer rank passing the floor.
 * Distance 2 is Path C salvage, not snap. Lowering the floor would invent ids.
 */

import {
  catalogFixAliases,
  foldSpokenFix,
  levenshtein,
  normalizeFixKey,
  sanitizeFixIds,
} from "./catalog-ground";

export const MAX_RETRIEVE_CANDIDATES = 16;

export interface RetrieveHit {
  id: string;
  score: number;
}

const SCORE_EXACT = 1;
const SCORE_ALIAS = 0.9;
const SCORE_FOLD_ALIAS = 0.8;
const SCORE_NEAR = 0.6;
const SCORE_FOLD_NEAR = 0.5;
/** Raw d==2, token length >= 5. Below SNAP_SCORE_FLOOR so snapFix stays weak. */
const SCORE_FAR = 0.45;
/** Fold d==2, folded length >= 5. Below SCORE_NEAR / SCORE_FOLD_NEAR. */
const SCORE_FOLD_FAR = 0.4;

interface IndexedFix {
  id: string;
  key: string;
  folded: string;
  aliases: ReadonlySet<string>;
}

interface FixIndex {
  entries: readonly IndexedFix[];
}

const INDEX_CACHE = new WeakMap<object, FixIndex>();

function indexFixes(catalog: readonly string[]): FixIndex {
  const cached = INDEX_CACHE.get(catalog);
  if (cached) {
    return cached;
  }
  const entries: IndexedFix[] = sanitizeFixIds(catalog).map((id) => ({
    id,
    key: normalizeFixKey(id),
    folded: foldSpokenFix(id),
    aliases: new Set(catalogFixAliases(id)),
  }));
  const index: FixIndex = { entries };
  INDEX_CACHE.set(catalog, index);
  return index;
}

function scoreFix(tokenKey: string, folded: string, entry: IndexedFix): number | null {
  if (entry.id === tokenKey || entry.key === tokenKey) {
    return SCORE_EXACT;
  }
  if (entry.aliases.has(tokenKey)) {
    return SCORE_ALIAS;
  }
  if (folded !== tokenKey && entry.aliases.has(folded)) {
    return SCORE_FOLD_ALIAS;
  }
  if (tokenKey.length >= 3 && levenshtein(tokenKey, entry.key) <= 1) {
    return SCORE_NEAR;
  }
  if (folded.length >= 3 && levenshtein(folded, entry.folded) <= 1) {
    return SCORE_FOLD_NEAR;
  }
  // d=2 is Path C salvage, not snap. Lowering the floor would invent ids.
  if (tokenKey.length >= 5 && levenshtein(tokenKey, entry.key) === 2) {
    return SCORE_FAR;
  }
  if (folded.length >= 5 && levenshtein(folded, entry.folded) === 2) {
    return SCORE_FOLD_FAR;
  }
  return null;
}

/**
 * Ranked catalog ids for a spoken token, best-first. Empty / tiny token → [].
 * Never invents an id that is not in `catalog`. Caps the returned list, not
 * the index.
 */
export function retrieveFix(
  token: string | null | undefined,
  catalog: readonly string[],
  opts?: { limit?: number },
): RetrieveHit[] {
  const tokenKey = normalizeFixKey(token ?? "");
  if (tokenKey.length < 2) {
    return [];
  }
  const limit = opts?.limit ?? MAX_RETRIEVE_CANDIDATES;
  if (limit <= 0) {
    return [];
  }
  const index = indexFixes(catalog);
  const folded = foldSpokenFix(tokenKey);
  const hits: RetrieveHit[] = [];
  for (const entry of index.entries) {
    const score = scoreFix(tokenKey, folded, entry);
    if (score === null) {
      continue;
    }
    hits.push({ id: entry.id, score });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, limit);
}
