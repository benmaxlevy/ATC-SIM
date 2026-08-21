/**
 * Public API for `@pilot`.
 *
 * Legal now: `applyCommand` — accepts `Command`, throws until phase 1.
 *
 * Later: validation, readback templates, intent apply.
 *
 * Import rule: `@pilot` may import `@core` only.
 */

import type { Command } from "@core";

export function applyCommand(_world: unknown, _command: Command): never {
  throw new Error("applyCommand is phase 1");
}
