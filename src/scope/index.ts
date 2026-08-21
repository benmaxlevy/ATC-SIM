/**
 * Public API for `@scope`.
 *
 * Legal now: Canvas2D north-up PPI with discrete range 5–60 NM, view center,
 * `nmToScreen` / `screenToNm`, always-on Page/Home/End/F8/wheel, click pick,
 * KDEM digital map (runway, localizer feather, range rings, optional coastline),
 * target square + history dots (F8 / scope-focus H).
 *
 * Later: datablocks, DCB-lite.
 *
 * Import rule: `@scope` may import `@core` and `@scenario`.
 * `@scope` may set `selectedAircraftId`. It must not write intent.
 *
 * Analog: CRC STARS RANGE / CENTER / HISTORY / video maps (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: PageUp/Down + wheel; no extra CRC presets; middle-drag pan
 * is not CRC. History is 5 s sim / 5 dots, no phosphor. Trainer-authored JSON
 * maps, not OSM / tiles (R12). Not NAS STARS.
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
export { PALETTE } from "./palette";
export type { Palette } from "./palette";
export {
  DEFAULT_DIGITAL_MAP,
  DEFAULT_MAP_LAYER_FLAGS,
  activeRingRadiiNm,
  buildLocalizerFeather,
  buildMapCache,
  parseDigitalMap,
  reuseOrBuildMapCache,
} from "./mapLayers";
export type { DigitalMap, MapCache, MapLayerFlags, NmPoint } from "./mapLayers";
export { renderScope } from "./renderScope";
export {
  ALWAYS_ON_SCOPE_KEYS,
  handleScopeKeyDown,
  handleScopeWheel,
  installAlwaysOnScopeKeys,
  isAlwaysOnScopeKey,
  isHistoryToggleKey,
  scopeFocusFromDocument,
} from "./scopeKeys";
export type { ScopeFocus } from "./scopeKeys";
export {
  centerOnAirport,
  centerOnLastClick,
  centerOnWorld,
  createScopeView,
  recordLastClick,
  toggleHistoryEnabled,
} from "./scopeView";
export type { ScopeView } from "./scopeView";
export {
  HISTORY_MAX_DOTS,
  HISTORY_SAMPLE_MS,
  createHistoryBuf,
  maybeSampleHistory,
} from "./history";
export type { HistoryBuf } from "./history";
export {
  CALLSIGN_FONT_PX,
  HEADING_TICK_PX,
  TARGET_SIZE_PX,
  UNOWNED_TRACK_COLOR,
  drawHistoryDot,
  drawTargetSymbol,
} from "./targetSymbol";
export {
  IDENT_DISPLAY_FLASH_MS,
  createTrackDisplay,
  isIdentFlashing,
  syncTrackDisplays,
} from "./trackDisplay";
export type { TrackDisplay } from "./trackDisplay";
