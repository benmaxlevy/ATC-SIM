/**
 * Public API for `@parse`.
 *
 * `parseCommand` runs normalize → typed tokenizer → Path A → Path B →
 * optional Path C (`phases/_shared/parse-pipeline.md`). Path C is off by default.
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
export {
  DEFAULT_PARSE_URL,
  PATH_C_SCHEMA_VERSION,
  createParsePathC,
  fetchParsePathC,
  schemaCheckPathC,
} from "./path-c";
export type { ParsePathCFn, PathCRequest, PathCSuccess } from "./path-c";
