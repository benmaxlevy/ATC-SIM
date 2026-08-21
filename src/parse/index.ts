/**
 * Public API for `@parse`.
 *
 * `parseCommand` runs normalize → typed tokenizer → Path A → Path B
 * (`phases/_shared/parse-pipeline.md`). Path C is off (T03-14).
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
