/**
 * Public API for `@scope`.
 *
 * Legal now: Canvas2D north-up PPI with discrete range 5–60 NM, view center,
 * `nmToScreen` / `screenToNm`, always-on Page/Home/End/wheel, click pick.
 *
 * Later: maps, datablocks, DCB-lite.
 *
 * Import rule: `@scope` may import `@core` and `@scenario`.
 * `@scope` may set `selectedAircraftId`. It must not write intent.
 *
 * Analog: CRC STARS RANGE / CENTER (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: PageUp/Down + wheel; no extra CRC presets; middle-drag pan
 * is not CRC. No zoom-to-cursor (R12). Not NAS STARS.
 */
export { PpiPlaceholder, PpiPlaceholderId } from "./ppi-placeholder";
export type { RangeNm, ScopeCamera, ScopeViewSize } from "./camera";
export {
  AIRPORT_REF_EAST_NM,
  AIRPORT_REF_NORTH_NM,
  DEFAULT_RANGE_NM,
  DEFAULT_SCOPE_CAMERA,
  RANGE_PRESETS_NM,
  applyPanScreenDelta,
  applyRangeIn,
  applyRangeOut,
  formatRangeReadout,
  nmToScreen,
  pxPerNm,
  rangeCircle,
  screenToNm,
} from "./camera";
export { paintPpi, fitCanvasToCss, handlePpiCanvasClick } from "./ppi";
export {
  cssPointFromClient,
  handlePpiDoubleClick,
  handlePpiLeftClick,
  handlePpiPanDelta,
} from "./ppiPointer";
export { HIT_RADIUS_CSS_PX, pickAircraftAt, selectAircraftAt } from "./pick";
export { renderScope } from "./renderScope";
export {
  ALWAYS_ON_SCOPE_KEYS,
  handleScopeKeyDown,
  handleScopeWheel,
  installAlwaysOnScopeKeys,
  isAlwaysOnScopeKey,
} from "./scopeKeys";
export {
  centerOnAirport,
  centerOnLastClick,
  centerOnWorld,
  createScopeView,
  recordLastClick,
} from "./scopeView";
export type { ScopeView } from "./scopeView";
