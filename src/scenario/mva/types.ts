/**
 * Trainer MVA / floor chart. Not certified MSAW. Sibling of the procedure
 * catalog so procedure JSON stays procedure-only (T04-10).
 *
 * Canonical evaluator types live in `@core`; this file re-exports them so
 * scenario loaders can name `MvaChart` without importing the alert module path.
 */

export type { MvaChart, MvaPolygon, MvaVertex, MsawInhibitGeom } from "@core";
