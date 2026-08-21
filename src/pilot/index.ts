/**
 * Public API for `@pilot`.
 *
 * Legal now: `applyCommand` — throws until phase 1.
 *
 * Later: validation, readback templates, intent apply.
 *
 * Import rule: `@pilot` may import `@core` only.
 */

/** T00-06 will type `_command` as Command; phase 1 will apply intent. */
export function applyCommand(_world: unknown, _command: unknown): never {
  throw new Error("applyCommand is phase 1");
}
