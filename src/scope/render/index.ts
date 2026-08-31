/**
 * Consolidated scope rendering entry point.
 */
export { renderScope, getDatablockVisualState, isTrackedTarget } from "./renderScope";
export type { DatablockVisualState } from "./renderScope";

export {
  drawMapLayers,
  drawVideoMapLabel,
  drawDatablock,
  drawTracks,
  drawAtpaConeMileage,
  drawPredictedTrackLines,
  drawTpaRings,
  drawManualTpaCones,
  drawAtpaCones,
  drawSsa,
  drawChordHint,
  drawMapLists,
  drawSystemLists,
  displayAircraft,
  tracePolyline,
} from "./renderScopePaint";

export {
  WX_VIP_CONTOUR_HEX,
  WX_VIP_FILL_HEX,
  drawWeatherLayer,
  wxVipContourHex,
  wxVipFillHex,
} from "./weatherLayer";

export {
  HEADING_TICK_PX,
  HISTORY_DOT_SIZE_PX,
  OWNED_TRACK_COLOR,
  POSITION_SYMBOL_COLOR,
  SELECTED_ACCENT_COLOR,
  SELECTION_BOX_PAD_PX,
  TARGET_SHAPE,
  TARGET_SIZE_PX,
  PRIMARY_TARGET_SIZE_PX,
  TARGET_STROKE_PX,
  TARGET_PUCK_BG,
  UNOWNED_TRACK_COLOR,
  drawHistoryDot,
  drawSelectionBox,
  drawTargetSymbol,
  drawOwnershipStub,
  drawMultiSurveillanceRect,
  drawSiteSurveillanceRect,
  headingTickOffset,
  historyDotColor,
  isPrimaryTarget,
  isTargetDiamondPath,
  renderTargetSymbol,
  selectionBoxRect,
  squawkMatchesBeaconSelect,
  targetDiamondVertices,
  targetStrokeColor,
  targetSymbolDescriptor,
  targetSymbolShape,
  targetTextColor,
} from "./targetSymbol";
export type {
  TargetSurveillanceType,
  TargetSymbolDescriptor,
  TargetSymbolKind,
  TargetSymbolOptions,
} from "./targetSymbol";
