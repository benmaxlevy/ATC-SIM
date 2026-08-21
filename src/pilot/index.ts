/**
 * Public API for `@pilot`.
 *
 * Legal now: `applyCommand` (throws until T01-07); readback templates
 * (`formatReadback`, `formatRejectReadback`, `formatCallsignSpeech`);
 * callsign resolution (`resolveCallsign`, `numericTail`).
 *
 * Later: validation, intent apply.
 *
 * Import rule: `@pilot` may import `@core` only.
 */

import type { Command } from "@core";

export type { ReadbackAircraft, RejectReason } from "./readback";
export { formatCallsignSpeech, formatReadback, formatRejectReadback } from "./readback";
export type { ResolveReason, ResolveResult } from "./resolveCallsign";
export { numericTail, resolveCallsign } from "./resolveCallsign";

export function applyCommand(_world: unknown, _command: Command): never {
  throw new Error("applyCommand is phase 1");
}
