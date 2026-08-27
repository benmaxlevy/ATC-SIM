/**
 * Public API for `@scope`.
 *
 * Legal now: Canvas2D north-up PPI with discrete range 5–60 NM, view center,
 * `nmToScreen` / `screenToNm`, always-on Page/Home/End/F7/F8/wheel, click pick,
 * KDEM digital map (runway, localizer feather, range rings, optional coastline),
 * target diamond + history dots (F8 / scope-focus H), full/limited datablocks
 * (scope-focus T / M; Mode C hundreds + assigned + GS), predicted track line
 * (PTL, F7 always-on, default off), L1–L9 **leader** lines (scope-focus `L`
 * then 1–9; pixel-constant default 36 CSS px; DCB LDR length 0/24/36/48), altitude filter
 * (scope-focus `F`, default 000–180), F3/F4 ownership color stub (not NAS),
 * F1 help overlay (`TRAINER KEYS — NOT CRC`), Tab cycle focus, `/` radio focus.
 * Scope-focus `*` TPA/ATPA slew chords (R07 Table 36) parse and prompt on the PPI.
 * T04-09 CA displays static `CA` + tone (no yellow). T04-10 MSAW still
 * tints yellow then red. CA is raised only for current conflicts. The PPI does
 * not compute pair distance.
 *
 * DCB (T02-16/T02-17/T02-22/T02-25) is a green cell grid on the PPI glass; it calls these same
 * camera / map / filter / PTL / history / MAPS / RR / LDR / CHAR / BRITE
 * functions. MAIN↔AUX via SHIFT; submenus replace the bar; RANGE / RR / LDR DIR /
 * LDR length / CHAR SIZE / BRITE are spinners over frozen presets. AUX has HISTORY 0–5, PTL
 * length/OWN/ALL, DCB TOP/LEFT/RIGHT/BOTTOM; VOL disabled. Trainer subset
 * (SHIFT/DONE/VOL, disabled WX) — not a full STARS DCB (no precipitation /
 * CSA / CRDA / FMA). Local PREF 1–8 is trainer localStorage, not a NAS host.
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
 * Trainer delta: PageUp/Down + wheel; no extra CRC presets; right-drag slew
 * (middle-drag still works) is not CRC. History is 5 s sim / 5 dots, no phosphor. PTL is straight
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
export {
  cssPointFromClient,
  fitCanvasToCss,
  handlePpiCanvasClick,
  handlePpiCanvasMiddleClick,
  handlePpiDoubleClick,
  handlePpiLeftClick,
  handlePpiMiddleClick,
  handlePpiPanDelta,
  isPpiSlewButton,
  isPpiSlewHeld,
  paintPpi,
} from "./ppi";
export {
  HIT_RADIUS_CSS_PX,
  middleClickAircraftAt,
  pickAircraftAt,
  selectAircraftAt,
  selectOrAcceptAircraftAt,
} from "./pick";
export type { DatablockPickView } from "./pick";
export {
  HISTORY_TRAIL,
  PALETTE,
  BRITE_DISABLED_CHANNELS,
  BRITE_PAINT_CHANNELS,
  BRITE_STEPS,
  DEFAULT_BRITE,
  DEFAULT_BRITE_LEVEL,
  DEFAULT_MAP_BRITE_INDEX,
  MAP_BRITE_STEPS,
  alertOrOwnershipColor,
  alertTintPaintColor,
  applyBrite,
  caDatablockTagVisible,
  cloneBrite,
  historyTrailColor,
  mapBriteColors,
  snapBriteLevel,
  trackAlertTint,
  trackPaintAlertTint,
  withCaDatablockTag,
} from "./palette";
export type { BriteChannel, BriteLevel, BriteState, Palette, MapBriteIndex } from "./palette";
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
export { getDatablockVisualState, isTrackedTarget, renderScope } from "./renderScope";
export type { DatablockVisualState } from "./renderScope";
export {
  GI_SLOT_COUNT,
  SSA_ALTIMETER_STUB,
  SSA_FILTER_FIELDS,
  SSA_FUSED_STUB,
  buildGiLines,
  buildSsaLines,
  defaultGiVisibility,
  defaultSsaVisibility,
  formatSsaPtl,
  formatSsaTime,
  padGiTextLines,
} from "./ssa";
export type { SsaFilterField, SsaInput, SsaVisibility } from "./ssa";
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
  isStarsChordPrefixKey,
  isTowerHandoffKey,
  leaderDigitFromKey,
  mouseKeyBindings,
  scopeFocusKeyBindings,
} from "./keymap";
export type { KeyBinding, KeyFocus, ScopeChord } from "./keymap";
export {
  STARS_CHORD_NM_MAX,
  STARS_CHORD_NM_MIN,
  applyStarsChordAction,
  armOrApplyStarsChordAction,
  beginStarsChordEntry,
  cancelStarsChordEntry,
  commitStarsChord,
  expireStarsChordEntry,
  formatStarsChordAction,
  formatStarsChordReadout,
  handleStarsChordEntryKey,
  idleStarsChordEntry,
  parseStarsChord,
  starsChordActionNeedsSlew,
} from "./starsChord";
export type {
  StarsChordAction,
  StarsChordApplyResult,
  StarsChordArmOrApplyResult,
  StarsChordEnableMode,
  StarsChordEntry,
  StarsChordEntryPhase,
  StarsChordKeyOutcome,
  StarsChordResult,
  StarsChordTarget,
  StarsChordToggleMode,
} from "./starsChord";
export {
  ALWAYS_ON_SCOPE_KEYS,
  HELP_OVERLAY_ID,
  RADIO_COMMAND_LINE_ID,
  cycleScopeRadioFocus,
  focusRadioCommandLine,
  handleScopeKeyDown,
  handleScopeKeyUp,
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
  isRangeRingOffViewCenter,
  isViewOffAirport,
  recordLastClick,
  setRangeRingOrigin,
  snapRangeRingToViewCenter,
  toggleHelpOverlay,
  setBeaconatorActive,
  toggleBeaconator,
  formatDcbHistoryReadout,
  formatDcbPtlMinutesReadout,
  setDcbDock,
  setHistoryDotCount,
  stepHistoryDots,
  stepPtlLength,
  stepTpaRadius,
  toggleHistoryEnabled,
  toggleMapLayer,
  toggleModeCVisible,
  toggleGiFilter,
  togglePtlOn,
  togglePtlOwn,
  toggleSsaFilter,
  toggleTpaOn,
  toggleAtpaOn,
  toggleAtpaAlertCones,
  toggleAtpaConeMileage,
  toggleAtpaInTrailDistance,
  toggleAtpaMonitorCones,
  formatDcbTpaMiReadout,
} from "./scopeView";
export type { MapLayerId, ScopeView } from "./scopeView";
export {
  DCB_ACTION_FLASH_MS,
  applyDcbShift,
  armDcbSpinner,
  closeDcbMenu,
  commitDcbSpinner,
  dcbActionCapPressed,
  handleDcbEscape,
  idleDcbSpinner,
  isDcbSubmenu,
  openDcbMenu,
  stepDcbSpinner,
  toggleDcbMenu,
} from "./dcbMenu";
export type { DcbCellKind, DcbMenu, DcbMenuHost, DcbSpinnerCell, DcbSpinnerState } from "./dcbMenu";
export {
  DCB_PREF_READOUT_MAX_CHARS,
  DCB_PREF_SLOT_COUNT,
  DCB_PREF_SCHEMA_VERSION,
  DCB_THICKNESS_PX,
  activeDcbPrefName,
  applyDcbPref,
  applyDcbPrefDefaults,
  beginDcbPrefSession,
  browserDcbPrefStorage,
  dcbPrefStorageKey,
  deleteDcbPref,
  drawablePpiSize,
  formatDcbPrefReadout,
  isVerticalDcbDock,
  loadDcbPrefFromStorage,
  persistDcbPref,
  restoreDcbPrefSession,
  saveAsDcbPref,
  saveDcbPref,
  selectDcbPrefSlot,
  serializeDcbPref,
} from "./dcbPref";
export type {
  DcbDock,
  DcbPrefBody,
  DcbPrefFile,
  DcbPrefRuntime,
  DcbPrefSlot,
  DcbPrefStorage,
} from "./dcbPref";
export {
  DCB_LEADER_DIRS,
  DCB_MAP_SLOT_COUNT,
  DCB_QUICK_MAP_COUNT,
  DEFAULT_RR_INTERVAL_NM,
  RR_INTERVALS_NM,
  applyDcbLeaderDir,
  applyRrCenter,
  armPlaceCenter,
  armPlaceRangeRing,
  buildMapListLines,
  clearAllVideoMaps,
  cycleCharSize,
  cycleMapBrite,
  cycleRrInterval,
  dcbCatalogMaps,
  dcbLeaderDirReadout,
  dcbLeaderDirValue,
  formatDcbBriteReadout,
  formatDcbCharReadout,
  formatDcbLdrLengthReadout,
  formatDcbMapLabel,
  formatDcbRrReadout,
  hideMapLists,
  isDcbMapSlotEnabled,
  isVideoMapOn,
  snapRrInterval,
  stepBriteChannel,
  stepCharSizeChannel,
  stepDcbLeaderDir,
  stepDcbLeaderLength,
  stepRrInterval,
  toggleCurrentMapsList,
  toggleGeoMapsList,
  toggleVideoMap,
  videoMapByDcbNumber,
} from "./dcbFunctions";
export type { MapListKind, RrIntervalNm } from "./dcbFunctions";
export {
  HISTORY_DOT_COUNTS,
  HISTORY_MAX_DOTS,
  HISTORY_SAMPLE_MS,
  createHistoryBuf,
  historyDotsToDraw,
  maybeSampleHistory,
  stepHistoryDotCount,
} from "./history";
export type { HistoryBuf, HistoryDotCount } from "./history";
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
  isPrimaryTarget,
  isTargetDiamondPath,
  renderTargetSymbol,
  targetDiamondVertices,
  targetSymbolDescriptor,
  targetSymbolShape,
} from "./targetSymbol";
export type {
  TargetSurveillanceType,
  TargetSymbolDescriptor,
  TargetSymbolKind,
  TargetSymbolOptions,
} from "./targetSymbol";
export {
  PTL_CAP_TICK_PX,
  PTL_MINUTES,
  PTL_MINUTE_PRESETS,
  PTL_STROKE_PX,
  drawPredictedTrackLine,
  ptlEndpoint,
  shouldDrawPtl,
  shouldDrawPtlForTrack,
  stepPtlMinutes,
} from "./ptl";
export type { PtlMinutes } from "./ptl";
export {
  DEFAULT_ATPA_STATE,
  DEFAULT_TPA_RADIUS_NM,
  DEFAULT_TPA_STATE,
  TPA_RADIUS_NM,
  TPA_STROKE_COLOR,
  TPA_STROKE_PX,
  aircraftForTpaRings,
  atpaFeatureEffective,
  formatDcbTpaMiReadout as formatTpaMiReadout,
  formatTpaSizeReadout,
  groundTrackPointNm,
  manualTpaConePoints,
  stepTpaRadiusNm,
  tpaConeDigitPlacement,
  tpaConesToPaint,
  tpaRingDigitPlacement,
  tpaRingPoints,
  tpaRingsToPaint,
  tpaScreenRadiusPx,
  tpaSizeReadoutEnabled,
} from "./tpa";
export type {
  AtpaFeature,
  AtpaState,
  TpaConePaint,
  TpaRadiusNm,
  TpaRingPaint,
  TpaState,
} from "./tpa";
export {
  ATPA_CONE_HALF_ANGLE_DEG,
  atpaConeColor,
  atpaConePoints,
  atpaSuppressesManualTpaCone,
  selectAtpaConesToPaint,
  shouldPaintAtpaGeometry,
} from "./atpaCone";
export type { AtpaConePaintFlags, AtpaNmPoint } from "./atpaCone";
export {
  ATPA_CONE_MILEAGE_ALONG_FRAC,
  ATPA_CONE_MILEAGE_OFFSET_NM,
  atpaConeMileagePlacement,
  atpaConeMileageReadout,
  atpaInTrailDatablockReadout,
  atpaPairForTrailing,
  atpaReadoutColor,
  atpaReadoutEnabled,
  formatAtpaConeMileage,
  formatAtpaInTrailDistance,
} from "./atpaReadout";
export type {
  AtpaConeMileagePlacement,
  AtpaConeMileagePose,
  AtpaInTrailReadout,
  AtpaNmPose,
  AtpaReadoutGate,
} from "./atpaReadout";
export {
  IDENT_DISPLAY_FLASH_MS,
  LDB_QUERY_DURATION_MS,
  OUTBOUND_ACCEPTED_FLASH_MS,
  acceptInboundOnClick,
  applyDropTrackToSelection,
  applyInitiateTrackToSelection,
  createTrackDisplay,
  ensureTrackDisplay,
  handleTrackClick,
  handleTrackMiddleClick,
  isIdentFlashing,
  isTrackQueried,
  queryTrack,
  selectedTrackId,
  setLeaderDirForSelection,
  setScratchpad,
  syncTrackDisplays,
  toggleDatablockModeForSelection,
  toggleTrackHighlight,
  toggleTrackPdbFdb,
} from "./trackDisplay";
export type { TrackDisplay } from "./trackDisplay";
export {
  DROP_TRACK_HELP,
  INITIATE_TRACK_HELP,
  NO_SEL_HINT,
  TOWER_HANDOFF_HELP,
  applyCenterOwnership,
  applyDropTrack,
  applyHandoffToSelection,
  applyInitiateTrack,
  applyTowerHandoffToSelection,
  applyTowerOwnership,
  ownershipStubChar,
  trackPaintColor,
} from "./ownership";
export type { HandoffResult, TrackOwnership } from "./ownership";
export {
  DEFAULT_LEADER_DIR,
  DEFAULT_LEADER_LENGTH_PX,
  L5_OVERLAY_GAP_PX,
  LEADER_BLOCK_GAP_PX,
  LEADER_LENGTH_PX,
  LEADER_LENGTH_STEPS_PX,
  LEADER_STROKE_PX,
  datablockTopLeft,
  drawLeaderLine,
  effectiveLeaderLengthPx,
  isLeaderDir,
  leaderOffsetPx,
  leaderSegmentPx,
} from "./leader";
export type { DatablockMetrics, LeaderDir, LeaderLengthPx } from "./leader";
export {
  SCRATCHPAD_MAX_LEN,
  DATABLOCK_FIELD_GAP,
  datablockMetrics,
  datablockRect,
  formatAltitudeHundreds,
  formatFullDatablock,
  formatGroundSpeedKt,
  formatGroundSpeedTens,
  formatLimitedDatablock,
  formatPartialDatablock,
  fullDatablockLine3Parts,
  linesForDatablock,
  sanitizeScratchpad,
  withInboundHandoffCue,
} from "./datablock";
export type {
  DatablockLines,
  DatablockMode,
  DatablockSource,
  FullDatablock,
  FullDatablockLine3Parts,
  LimitedDatablock,
  LimitedDatablockOpts,
  PartialDatablock,
  PartialDatablockOpts,
} from "./datablock";
export {
  CHAR_SIZE_STEPS_PX,
  DATABLOCK_FONT,
  DATABLOCK_FONT_PX,
  DATABLOCK_LINE_HEIGHT_PX,
  DCB_CHAR_SIZE_STEPS_PX,
  DEFAULT_CHAR_SIZES,
  DEFAULT_CHAR_SIZE_PX,
  DEFAULT_DATABLOCK_CELL_PX,
  DEFAULT_DCB_CHAR_SIZE_PX,
  DEFAULT_POS_SIZE_PX,
  POS_SIZE_STEPS_PX,
  SCOPE_FONT_STACK,
  cloneCharSizes,
  datablockFontCss,
  datablockLineHeightPx,
} from "./fonts";
export type { CharSizeChannel, CharSizePx, CharSizes, DcbCharSizePx, PosSizePx } from "./fonts";
