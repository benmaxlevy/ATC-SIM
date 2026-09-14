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

import { rankFixCandidates } from "./catalog-ground";

export const MAX_RETRIEVE_CANDIDATES = 16;

export interface RetrieveHit {
  id: string;
  score: number;
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
  const limit = opts?.limit ?? MAX_RETRIEVE_CANDIDATES;
  if (limit <= 0) {
    return [];
  }
  return rankFixCandidates(token, catalog, { includeDistanceTwo: true })
    .slice(0, limit)
    .map(({ id, score }) => ({ id, score }));
}
