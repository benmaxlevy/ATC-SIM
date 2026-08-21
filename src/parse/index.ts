/**
 * Public API for `@parse`.
 *
 * Legal now: `parseCommand` — throws until phase 1 (do not implement tokens).
 *
 * Later: text/voice string → `Command` (phase 1). T00-06 retargets the return
 * type to `Command` while keeping the throw until the parser exists.
 *
 * Import rule: `@parse` may import `@core` only.
 */

/** T00-06 will type this as Command. */
export function parseCommand(_text: string): never {
  throw new Error("parseCommand is phase 1");
}
