/**
 * Public API for `@scope`.
 *
 * Legal now: `PpiPlaceholderId` and empty `PpiPlaceholder` host (T00-10).
 *
 * Later: Canvas PPI, maps, datablocks, scope keys. No Canvas drawing in phase 0.
 *
 * Import rule: `@scope` may import `@core` and `@scenario`.
 *
 * Analog: CRC STARS display (docs.virtualnas.net/crc/stars).
 * Trainer delta: placeholder DOM id only; no maps, tracks, or datablocks yet. Not NAS STARS.
 */
export { PpiPlaceholder, PpiPlaceholderId } from "./ppi-placeholder";
