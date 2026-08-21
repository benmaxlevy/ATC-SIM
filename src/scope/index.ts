/**
 * Public API for `@scope`.
 *
 * Legal now: Canvas2D north-up PPI with discrete range 5–60 NM, view center,
 * `nmToScreen` / `screenToNm`, always-on Page/Home/End/F7/F8/wheel, click pick,
 * KDEM digital map (runway, localizer feather, range rings, optional coastline),
 * target square + history dots (F8 / scope-focus H), full/limited datablocks
 * (scope-focus T / M; Mode C hundreds + assigned + GS), predicted track line
 * (PTL, F7 always-on, default off), L1–L9 **leader** lines (scope-focus `L`
 * then 1–9; pixel-constant 24 CSS px; no length menu), altitude filter
 * (scope-focus `F`, default 000–180).
 *
 * Later: DCB-lite.
 *
 * Import rule: `@scope` may import `@core` and `@scenario`.
 * `@scope` may set `selectedAircraftId`. It must not write intent.
 *
 * Analog: CRC STARS RANGE / CENTER / HISTORY / FDB-LDB / PTL / L1–L9 leader /
 * altitude filter / video maps (docs.virtualnas.net/crc/stars — R07). PCG datablock / Mode C (R02).
 * FOA STARS display data / altitude filters (R05).
 * Trainer delta: PageUp/Down + wheel; no extra CRC presets; middle-drag pan
 * is not CRC. History is 5 s sim / 5 dots, no phosphor. PTL is straight
 * 1.0 min, default off. Trainer-authored JSON maps, not OSM / tiles (R12).
 * IBM Plex Mono, not a STARS face. Not NAS STARS.
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
export type { DatablockPickView } from "./pick";
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
  DEFAULT_ALTITUDE_FILTER,
  FILTER_HUNDREDS_MAX,
  FILTER_HUNDREDS_MIN,
  clampFilterHundreds,
  formatFilterReadout,
  inAltitudeFilter,
  parseFilterHundreds,
} from "./altitudeFilter";
export type { AltitudeFilter, FilterEntry, FilterEntryPhase } from "./altitudeFilter";
export {
  CHORD_TIMEOUT_MS,
  SCOPE_CHORD_WINDOW_MS,
  beginScopeChord,
  digitFromKey,
  isFilterChordKey,
  isScopeChordLive,
  leaderDigitFromKey,
} from "./keymap";
export type { ScopeChord } from "./keymap";
export {
  ALWAYS_ON_SCOPE_KEYS,
  handleScopeKeyDown,
  handleScopeWheel,
  installAlwaysOnScopeKeys,
  isAlwaysOnScopeKey,
  isDatablockToggleKey,
  isHistoryToggleKey,
  isModeCToggleKey,
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
  toggleModeCVisible,
  togglePtlOn,
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
  HEADING_TICK_PX,
  TARGET_SIZE_PX,
  UNOWNED_TRACK_COLOR,
  drawHistoryDot,
  drawTargetSymbol,
} from "./targetSymbol";
export {
  PTL_CAP_TICK_PX,
  PTL_MINUTES,
  PTL_STROKE_PX,
  drawPredictedTrackLine,
  ptlEndpoint,
  shouldDrawPtl,
} from "./ptl";
export {
  IDENT_DISPLAY_FLASH_MS,
  createTrackDisplay,
  isIdentFlashing,
  setLeaderDirForSelection,
  syncTrackDisplays,
  toggleDatablockModeForSelection,
} from "./trackDisplay";
export type { TrackDisplay } from "./trackDisplay";
export {
  DEFAULT_LEADER_DIR,
  L5_OVERLAY_GAP_PX,
  LEADER_BLOCK_GAP_PX,
  LEADER_LENGTH_PX,
  LEADER_STROKE_PX,
  datablockTopLeft,
  drawLeaderLine,
  isLeaderDir,
  leaderOffsetPx,
  leaderSegmentPx,
} from "./leader";
export type { DatablockMetrics, LeaderDir } from "./leader";
export {
  datablockMetrics,
  datablockRect,
  formatAltitudeHundreds,
  formatFullDatablock,
  formatGroundSpeedKt,
  formatLimitedDatablock,
  linesForDatablock,
} from "./datablock";
export type { DatablockMode, DatablockSource, FullDatablock, LimitedDatablock } from "./datablock";
export {
  DATABLOCK_FONT,
  DATABLOCK_FONT_PX,
  DATABLOCK_LINE_HEIGHT_PX,
  DEFAULT_DATABLOCK_CELL_PX,
  SCOPE_FONT_STACK,
} from "./fonts";
