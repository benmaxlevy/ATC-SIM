/**
 * Public API for `@parse`.
 *
 * `parseCommand` runs normalize → typed tokenizer → Path A → Path B →
 * configurable Path C (`phases/_shared/parse-pipeline.md`). Low-level callers
 * must opt in so tests and non-browser paths never make surprise network calls.
 * `parseRadioText` remains the phase-1 typed tokenizer (stage 1 only).
 *
 * Import rule: `@parse` may import `@core` only. No World, no DOM.
 */

export type { ParseResult } from "./parseRadioText";
export { parseRadioText } from "./parseRadioText";
export { PARSE_ERROR } from "./tokens";
export type { ParseErrorCode } from "./tokens";
export { parseCommand } from "./parse-command";
export type { ParseCommandOpts } from "./parse-command";
export { normalizeSpoken } from "./spoken/normalizer";
export { matchSpokenPatterns } from "./spoken/pattern-matcher";
export {
  approachesFromCatalog,
  proceduresFromCatalog,
  sanitizeFixIds,
} from "./spoken/catalog-ground";
export type { CatalogApproach, CatalogProcedure } from "./spoken/catalog-ground";
export { MAX_RETRIEVE_CANDIDATES, retrieveFix } from "./spoken/catalog-retrieve";
export type { RetrieveHit } from "./spoken/catalog-retrieve";
export { SNAP_SCORE_FLOOR, SNAP_SCORE_MARGIN, snapFix } from "./spoken/catalog-snap";
export type { RankedCatalogHit, SnapResult } from "./spoken/catalog-snap";
export {
  DEFAULT_PARSE_URL,
  MAX_PATH_C_FIXES,
  PATH_C_SCHEMA_VERSION,
  createParsePathC,
  fetchParsePathC,
  schemaCheckPathC,
} from "./path-c";
export type { ParsePathCFn, PathCContext, PathCRequest, PathCSuccess } from "./path-c";
