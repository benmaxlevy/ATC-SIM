/**
 * Public API for `@scope`.
 *
 * Legal now: Canvas2D north-up PPI with discrete range 5–60 NM, view center,
 * `nmToScreen` / `screenToNm`, always-on Page/Home/End/F7/F8/wheel, click pick,
 * KDEM digital map (runway, localizer feather, range rings, optional coastline),
 * target diamond + history dots (F8 / scope-focus H), full/limited datablocks
 * (scope-focus T / M; Mode C hundreds + assigned + GS), predicted track line
 * (PTL, F7 always-on, default off), L1–L9 **leader** lines (scope-focus `L`
 * then 1–9; pixel-constant 36 CSS px; no length menu), altitude filter
 * (scope-focus `F`, default 000–180), F3/F4 ownership color stub (not NAS),
 * F1 help overlay (`TRAINER KEYS — NOT CRC`), Tab cycle focus, `/` radio focus.
 *
 * DCB (T02-16/T02-17) is a green cell grid on the PPI glass; it calls these same
 * camera / map / filter / PTL / history / MAPS / RR / LDR / CHAR / BRITE
 * functions. RANGE click cycles presets. Not a full STARS DCB (no WX / PREF /
 * SHIFT / CSA / CRDA / FMA).
 *
 * SSA (T02-20) is a screen-fixed top-left status block (sim time, KDEM 29.92
 * stub, FILTER, RANGE, OFF CNTR, OK). Never a Command.
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
  cycleRange,
  formatDcbRangeReadout,
  formatRangeReadout,
  stepRange,
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
export {
  HISTORY_TRAIL,
  PALETTE,
  DEFAULT_MAP_BRITE_INDEX,
  MAP_BRITE_STEPS,
  historyTrailColor,
  mapBriteColors,
} from "./palette";
export type { Palette, MapBriteIndex } from "./palette";
export {
  DEFAULT_DIGITAL_MAP,
  DEFAULT_MAP_LAYER_FLAGS,
  activeRingRadiiNm,
  buildLocalizerFeather,
  buildMapCache,
  getMapCacheBuildCount,
  parseDigitalMap,
  resetMapCacheBuildCount,
  reuseOrBuildMapCache,
} from "./mapLayers";
export type { DigitalMap, MapCache, MapLayerFlags, NmPoint } from "./mapLayers";
export { renderScope } from "./renderScope";
export { SSA_ALTIMETER_STUB, SSA_FUSED_STUB, buildSsaLines, formatSsaTime } from "./ssa";
export type { SsaInput } from "./ssa";
export {
  DEFAULT_ALTITUDE_FILTER,
  FILTER_HUNDREDS_MAX,
  FILTER_HUNDREDS_MIN,
  beginFilterEntry,
  cancelFilterEntry,
  clampFilterHundreds,
  formatFilterBand,
  formatFilterHundreds,
  formatFilterReadout,
  handleFilterEntryKey,
  inAltitudeFilter,
  parseFilterHundreds,
  tryApplyAltitudeFilter,
  tryApplyAltitudeFilterDigits,
} from "./altitudeFilter";
export type { AltitudeFilter, FilterEntry, FilterEntryPhase } from "./altitudeFilter";
export {
  CHORD_TIMEOUT_MS,
  HELP_FOOTER,
  HELP_GLOSSARY_NOTE,
  HELP_KEYS_POINTER,
  KEY_BINDINGS,
  RADIO_CONFLICT_WARNING,
  SCOPE_CHORD_WINDOW_MS,
  alwaysOnKeyBindings,
  beginScopeChord,
  bindingById,
  digitFromKey,
  isCycleFocusKey,
  isFilterChordKey,
  isHelpToggleKey,
  isMouseBinding,
  isRadioFocusSlashKey,
  isScopeChordLive,
  leaderDigitFromKey,
  mouseKeyBindings,
  scopeFocusKeyBindings,
} from "./keymap";
export type { KeyBinding, KeyFocus, ScopeChord } from "./keymap";
export {
  ALWAYS_ON_SCOPE_KEYS,
  HELP_OVERLAY_ID,
  RADIO_COMMAND_LINE_ID,
  cycleScopeRadioFocus,
  focusRadioCommandLine,
  handleScopeKeyDown,
  handleScopeWheel,
  helpOverlayHasKeyboardFocus,
  installAlwaysOnScopeKeys,
  isAlwaysOnScopeKey,
  isDatablockToggleKey,
  isHistoryToggleKey,
  isModeCToggleKey,
  scopeFocusFromDocument,
} from "./scopeKeys";
export type { ScopeFocus, ScopeKeyUi } from "./scopeKeys";
export {
  centerOnAirport,
  centerOnLastClick,
  centerOnWorld,
  createScopeView,
  beginAltitudeFilterChord,
  isCoastlineToggleEnabled,
  isViewOffAirport,
  recordLastClick,
  toggleHelpOverlay,
  toggleHistoryEnabled,
  toggleMapLayer,
  toggleModeCVisible,
  togglePtlOn,
} from "./scopeView";
export type { MapLayerId, ScopeView } from "./scopeView";
export {
  DCB_LEADER_DIRS,
  DEFAULT_RR_INTERVAL_NM,
  RR_INTERVALS_NM,
  applyDcbLeaderDir,
  armPlaceCenter,
  closeDcbSubmenu,
  cycleCharSize,
  cycleMapBrite,
  cycleRrInterval,
  dcbCatalogMaps,
  dcbLeaderDirReadout,
  formatDcbBriteReadout,
  formatDcbCharReadout,
  formatDcbMapLabel,
  formatDcbRrReadout,
  isVideoMapOn,
  snapRrInterval,
  toggleDcbSubmenu,
  toggleVideoMap,
} from "./dcbFunctions";
export type { DcbSubmenu, RrIntervalNm } from "./dcbFunctions";
export {
  HISTORY_MAX_DOTS,
  HISTORY_SAMPLE_MS,
  createHistoryBuf,
  maybeSampleHistory,
} from "./history";
export type { HistoryBuf } from "./history";
export {
  HEADING_TICK_PX,
  HISTORY_DOT_SIZE_PX,
  OWNED_TRACK_COLOR,
  POSITION_SYMBOL_COLOR,
  SELECTION_BOX_PAD_PX,
  TARGET_SHAPE,
  TARGET_SIZE_PX,
  UNOWNED_TRACK_COLOR,
  drawHistoryDot,
  drawSelectionBox,
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
  applyDropTrackToSelection,
  applyInitiateTrackToSelection,
  createTrackDisplay,
  isIdentFlashing,
  setLeaderDirForSelection,
  setScratchpad,
  syncTrackDisplays,
  toggleDatablockModeForSelection,
} from "./trackDisplay";
export type { TrackDisplay } from "./trackDisplay";
export {
  DROP_TRACK_HELP,
  INITIATE_TRACK_HELP,
  NO_SEL_HINT,
  applyDropTrack,
  applyInitiateTrack,
  ownershipStubChar,
  trackPaintColor,
} from "./ownership";
export type { TrackOwnership } from "./ownership";
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
  SCRATCHPAD_MAX_LEN,
  datablockMetrics,
  datablockRect,
  formatAltitudeHundreds,
  formatFullDatablock,
  formatGroundSpeedKt,
  formatLimitedDatablock,
  linesForDatablock,
  sanitizeScratchpad,
} from "./datablock";
export type {
  DatablockLines,
  DatablockMode,
  DatablockSource,
  FullDatablock,
  LimitedDatablock,
} from "./datablock";
export {
  CHAR_SIZE_STEPS_PX,
  DATABLOCK_FONT,
  DATABLOCK_FONT_PX,
  DATABLOCK_LINE_HEIGHT_PX,
  DEFAULT_CHAR_SIZE_PX,
  DEFAULT_DATABLOCK_CELL_PX,
  SCOPE_FONT_STACK,
  datablockFontCss,
  datablockLineHeightPx,
} from "./fonts";
export type { CharSizePx } from "./fonts";
