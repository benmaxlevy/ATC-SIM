/**
 * Public API for `@parse`.
 *
 * Legal now: `parseCommand` — typed to return `Command`, throws until phase 1
 * (do not implement tokens).
 *
 * Later: text/voice string → `Command` (phase 1).
 *
 * Import rule: `@parse` may import `@core` only.
 */

import type { Command } from "@core";

export function parseCommand(_text: string): Command {
  throw new Error("parseCommand is phase 1");
}
