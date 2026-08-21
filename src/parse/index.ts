/**
 * Public API for `@parse`.
 *
 * Legal now: `parseRadioText` — phase 1 typed tokenizer (stage 1).
 * `parseCommand` still throws; Path A/B/C are phase 3.
 *
 * Later: `parseCommand` normalize → typed → Path A → Path B → optional Path C.
 *
 * Import rule: `@parse` may import `@core` only. No World, no DOM.
 */

import type { Command } from "@core";

export type { ParseResult } from "./parseRadioText";
export { parseRadioText } from "./parseRadioText";
export { PARSE_ERROR } from "./tokens";
export type { ParseErrorCode } from "./tokens";

export function parseCommand(_text: string): Command {
  throw new Error("parseCommand is phase 1");
}
