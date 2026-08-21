/**
 * Public API for `@scope`.
 *
 * Legal now: Canvas2D north-up PPI (`paintPpi`, `worldToCanvas` / `canvasToWorld`),
 * and the `ppi-placeholder` canvas host (id kept from T00-10).
 *
 * Later: click pick (T01-11), maps, datablocks, scope keys.
 *
 * Import rule: `@scope` may import `@core` and `@scenario`.
 * `@scope` may read World (including `selectedAircraftId`) but must not write intent.
 *
 * Analog: CRC STARS display (docs.virtualnas.net/crc/stars).
 * Trainer delta: ticks + temporary callsign text; no datablocks, leaders, or maps. Not NAS STARS.
 */
export { PpiPlaceholder, PpiPlaceholderId } from "./ppi-placeholder";
export type { Camera } from "./camera";
export { DEFAULT_CAMERA, DEFAULT_RANGE_NM, canvasToWorld, pxPerNm, worldToCanvas } from "./camera";
export { paintPpi, fitCanvasToCss } from "./ppi";
