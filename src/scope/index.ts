/**
 * Public API for `@scope`.
 *
 * Legal now: Canvas2D north-up PPI (`paintPpi`, `worldToCanvas` / `canvasToWorld`),
 * click pick (`pickAircraftAt` / `selectAircraftAt`, 12 CSS px), and the
 * `ppi-placeholder` canvas host (id kept from T00-10).
 *
 * Later: maps, datablocks, scope keys.
 *
 * Import rule: `@scope` may import `@core` and `@scenario`.
 * `@scope` may set `selectedAircraftId`. It must not write intent.
 *
 * Analog: CRC STARS display (docs.virtualnas.net/crc/stars).
 * Trainer delta: ticks + temporary callsign text; no datablocks, leaders, or maps. Not NAS STARS.
 */
export { PpiPlaceholder, PpiPlaceholderId } from "./ppi-placeholder";
export type { Camera } from "./camera";
export { DEFAULT_CAMERA, DEFAULT_RANGE_NM, canvasToWorld, pxPerNm, worldToCanvas } from "./camera";
export { paintPpi, fitCanvasToCss, handlePpiCanvasClick } from "./ppi";
export { HIT_RADIUS_CSS_PX, pickAircraftAt, selectAircraftAt } from "./pick";
