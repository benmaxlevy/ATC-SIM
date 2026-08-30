/**
 * Analog: CRC STARS DCB RANGE / PLACE CNTR / OFF CNTR / RR / PLACE RR / RR CNTR /
 * LDR DIR / LDR / MAPS / WX / CHAR SIZE / BRITE / AUX HISTORY / PTL / DCB position (R07).
 * Trainer delta: separated dark-olive physical caps with CSS bevels; SHIFT swaps MAIN and AUX.
 * MAPS / TPA-ATPA / CHAR SIZE / BRITE / SSA FILTER / GI TEXT / PREF submenus replace the
 * bar; DONE / Esc return to MAIN. RANGE / RR / LDR DIR / LDR length are spinners
 * (arm, wheel steps frozen presets, second click / Esc commits; cursor stays in
 * that cell). An open submenu (PREF, MAPS, …) keeps the cursor in the DCB boxes.
 * CHAR SIZE and
 * BRITE open submenus (`CHAR_SIZE` / `BRITE`) with per-channel spinners. AUX: VOL
 * disabled, HISTORY spinner 0–5, DCB TOP/LEFT/RIGHT/BOTTOM, PTL length spinner,
 * PTL OWN, PTL ALL, TPA/ATPA submenu (TPA ON, TPA MI, ATPA master, four live
 * ATPA cells). FILTER (altitude)
 * stays on MAIN. SSA FILTER hides existing SSA lines; GI TEXT toggles authored
 * facility lines (not METAR HTTP). HIST/PTL cells live on AUX (F7/F8 still work).
 * MAIN quick video maps 1–6; MAPS submenu slots 1–32 (KDEM) or group
 * submenu 7–38. Empty slots disabled. Group cells show CRC starsId plus short name.
 * WX1–6 are disabled chrome (no precipitation). Disabled CRDA cell on SSA FILTER
 * is chrome only. PREF is 8 local slots (not a NAS host). MAIN PREF shows the
 * active set name. No CSA / FMA (R06). Discrete **range** presets only.
 * CHAR SIZE scales **datablock** / lists / DCB / tools / POS. BRITE multiplies
 * drawn channels. Not NAS STARS.
 *
 * UI copy: SHIFT / DONE / MAIN / AUX / HISTORY / PTL / range / center / range rings /
 * leader — not toolbar or modal.
 * F8 / scope-focus H still call toggleHistoryEnabled(view) (0 ↔ last non-zero).
 * F7 still calls togglePtlOn(view) (PTL ALL).
 * Clicks call the same `src/scope` functions as the keyboard. Action caps
 * (SAVE / DONE / CLR ALL) flash the inset bevel then pop; they are not latches.
 * Never a Command, readback, or intent.
 */

import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, ReactNode, WheelEvent } from "react";
import {
  PALETTE,
  SCOPE_FONT_STACK,
  applyBrite,
  applyDcbLeaderDir,
  applyDcbPrefDefaults,
  applyDcbShift,
  applyRrCenter,
  clearAllVideoMaps,
  armDcbSpinner,
  armPlaceCenter,
  armPlaceRangeRing,
  beginAltitudeFilterChord,
  activeDcbPrefName,
  beginDcbPrefSession,
  browserDcbPrefStorage,
  cancelDcbSpinner,
  cancelFilterEntry,
  centerOnAirport,
  closeDcbMenu,
  commitDcbSpinner,
  dcbLeaderDirReadout,
  DCB_LEADER_DIRS,
  DCB_QUICK_MAP_COUNT,
  DCB_ACTION_FLASH_MS,
  dcbActionCapPressed,
  dcbMapsPageSlotNumbers,
  HISTORY_DOT_COUNTS,
  LEADER_LENGTH_STEPS_PX,
  PTL_MINUTE_PRESETS,
  RANGE_PRESETS_NM,
  RR_INTERVALS_NM,
  SSA_FILTER_FIELDS,
  TPA_RADIUS_NM,
  formatDcbBriteReadout,
  formatDcbCharReadout,
  formatDcbHistoryReadout,
  formatDcbLdrLengthReadout,
  formatDcbMapLabel,
  formatDcbPrefReadout,
  formatDcbPtlMinutesReadout,
  formatDcbRangeReadout,
  formatDcbRrReadout,
  formatDcbTpaMiReadout,
  formatFilterBand,
  deleteDcbPref,
  hideMapLists,
  isDcbMapSlotEnabled,
  isLeaderDir,
  isRangeRingOffViewCenter,
  isVerticalDcbDock,
  isVideoMapOn,
  isViewOffAirport,
  openDcbMenu,
  persistDcbPref,
  restoreDcbPrefSession,
  saveAsDcbPref,
  saveDcbPref,
  selectDcbPrefSlot,
  setHistoryDotCount,
  snapBriteLevel,
  setDcbDock,
  stepBriteChannel,
  stepCharSizeChannel,
  stepDcbLeaderDir,
  stepDcbLeaderLength,
  stepHistoryDots,
  stepPtlLength,
  stepRange,
  stepRrInterval,
  stepTpaRadius,
  toggleAtpaAlertCones,
  toggleAtpaConeMileage,
  toggleAtpaInTrailDistance,
  toggleAtpaMonitorCones,
  toggleTpaOn,
  toggleCurrentMapsList,
  toggleGeoMapsList,
  toggleGiFilter,
  togglePtlOn,
  togglePtlOwn,
  toggleSsaFilter,
  toggleVideoMap,
  videoMapByDcbNumber,
  type BriteChannel,
  type CharSizeChannel,
  type CharSizes,
  type DcbSpinnerCell,
  type LeaderLengthPx,
  type PtlMinutes,
  type RangeNm,
  type RrIntervalNm,
  type ScopeView,
  type SsaFilterField,
} from "@scope";
import { focusPpi } from "./FlightStrips";
import { useDcbCursorTrap } from "./useDcbCursorTrap";

export type DcbCellKind = "action" | "toggle" | "spinner" | "submenu" | "disabled";

/** Two physical rows with room for centered two-line caps, flush on the PPI. */
export const DCB_HEIGHT_PX = 75;
export const DCB_FONT_PX = 11;
/** @deprecated T02-10 name; same as DCB_HEIGHT_PX. */
export const DCB_LITE_HEIGHT_PX = DCB_HEIGHT_PX;
/** @deprecated T02-10 name; same as DCB_FONT_PX. */
export const DCB_LITE_FONT_PX = DCB_FONT_PX;
export const DCB_ID = "dcb";
export const DCB_LITE_ID = DCB_ID;
export const DCB_RANGE_READOUT_ID = "dcb-range-readout";
export const DCB_RANGE_OFFSET_ID = "dcb-range-offset";
export const DCB_FILTER_BAND_ID = "dcb-filter-band";
export const DCB_RR_READOUT_ID = "dcb-rr-readout";
export const DCB_LDR_READOUT_ID = "dcb-ldr-readout";
export const DCB_LDR_LENGTH_READOUT_ID = "dcb-ldr-length-readout";
export const DCB_CHAR_READOUT_ID = "dcb-char-readout";
export const DCB_BRITE_READOUT_ID = "dcb-brite-readout";
export const DCB_HISTORY_READOUT_ID = "dcb-history-readout";
export const DCB_PTL_MINUTES_READOUT_ID = "dcb-ptl-minutes-readout";
export const DCB_TPA_MI_READOUT_ID = "dcb-tpa-mi-readout";
export const DCB_RNG_READOUT_ID = DCB_RANGE_READOUT_ID;

export interface DisplayControlBarProps {
  view: ScopeView;
  onChange: () => void;
  world?: Parameters<typeof applyDcbLeaderDir>[1];
}

function preventButtonFocus(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

function afterCell(onChange: () => void): void {
  onChange();
  focusPpi();
}

function cancelFilterIfEntering(view: ScopeView): void {
  if (view.filterEntry.phase !== "idle") {
    cancelFilterEntry(view.filterEntry, view.altitudeFilter);
  }
}

function setPressed(el: Element | null, pressed: boolean): void {
  if (!(el instanceof HTMLElement)) {
    return;
  }
  if (el.getAttribute("data-dcb-flashing") === "true") {
    return;
  }
  el.setAttribute("aria-pressed", pressed ? "true" : "false");
}

function setText(id: string, text: string): void {
  const el = globalThis.document?.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function spinnerArmed(view: ScopeView, cell: DcbSpinnerCell): boolean {
  return view.dcbSpinner.armed && view.dcbSpinner.cell === cell;
}

function toggleSpinner(view: ScopeView, onChange: () => void, cell: DcbSpinnerCell): void {
  cancelFilterIfEntering(view);
  if (spinnerArmed(view, cell)) {
    commitDcbSpinner(view);
  } else {
    armDcbSpinner(view, cell);
  }
  afterCell(onChange);
}

function nearestPreset<T extends number>(presets: readonly T[], num: number): T {
  let closest = presets[0]!;
  let minDiff = Math.abs(num - closest);
  for (const preset of presets) {
    const diff = Math.abs(num - preset);
    if (diff < minDiff) {
      minDiff = diff;
      closest = preset;
    }
  }
  return closest;
}

function snapRangeToPreset(num: number): RangeNm {
  return nearestPreset(RANGE_PRESETS_NM, num);
}

function snapRrToPreset(num: number): RrIntervalNm {
  return nearestPreset(RR_INTERVALS_NM, num);
}

function snapPtlToPreset(num: number): PtlMinutes {
  return nearestPreset(PTL_MINUTE_PRESETS, num);
}

function snapLeaderLength(num: number): LeaderLengthPx {
  return nearestPreset(LEADER_LENGTH_STEPS_PX, num);
}

function applyDirectNumericInput(view: ScopeView, cell: DcbSpinnerCell, num: number): void {
  switch (cell) {
    case "RANGE":
      view.camera.rangeNm = snapRangeToPreset(num);
      break;
    case "RR":
      view.ringIntervalNm = snapRrToPreset(num);
      view.showRings = view.ringIntervalNm > 0;
      break;
    case "LDR_DIR":
      if (isLeaderDir(num)) {
        view.defaultLeaderDir = num;
      }
      break;
    case "LDR_LENGTH":
      view.leaderLengthPx = snapLeaderLength(num);
      break;
    case "HISTORY":
      setHistoryDotCount(view, nearestPreset(HISTORY_DOT_COUNTS, num));
      break;
    case "PTL":
      view.ptlMinutes = snapPtlToPreset(num);
      view.ptlOn = true;
      break;
    case "TPA_MI":
      view.tpa.radiusNm = nearestPreset(TPA_RADIUS_NM, num);
      break;
    default:
      if (cell.startsWith("BRITE_")) {
        const channel = cell.slice(6).toLowerCase() as BriteChannel;
        if (channel in view.brite) {
          view.brite[channel] = snapBriteLevel(num);
        }
      }
      break;
  }
}

function onSpinnerWheel(
  _view: ScopeView,
  _cell: DcbSpinnerCell,
  event: WheelEvent<HTMLButtonElement>,
  apply: (delta: -1 | 1) => void,
  onChange: () => void,
): void {
  event.preventDefault();
  event.stopPropagation();
  const delta: -1 | 1 = event.deltaY < 0 ? 1 : -1;
  apply(delta);
  afterCell(onChange);
}

function historySpinnerArmed(view: ScopeView): boolean {
  return view.dcbSpinner.armed && view.dcbSpinner.cell === "HISTORY";
}

function ptlSpinnerArmed(view: ScopeView): boolean {
  return view.dcbSpinner.armed && view.dcbSpinner.cell === "PTL";
}

function ssaFilterCellId(field: SsaFilterField): NonNullable<DcbCellProps["dataDcb"]> {
  switch (field) {
    case "TIME":
      return "ssa-time";
    case "ALTSTG":
      return "ssa-altstg";
    case "FILTER":
      return "ssa-filter-line";
    case "RANGE":
      return "ssa-range";
    case "OFF_CNTR":
      return "ssa-off-cntr";
    case "STATUS":
      return "ssa-status";
    case "PTL":
      return "ssa-ptl";
  }
}

function tpaMiSpinnerArmed(view: ScopeView): boolean {
  return view.dcbSpinner.armed && view.dcbSpinner.cell === "TPA_MI";
}

/**
 * Keep RANGE / MAPS / RR / LDR DIR / LDR / CHAR / BRITE / HISTORY / PTL in sync
 * with keyboard chords.
 */
export function syncDisplayControlBar(
  view: ScopeView,
  world?: Parameters<typeof applyDcbLeaderDir>[1],
): void {
  const doc = globalThis.document;
  if (!doc) {
    return;
  }
  setText(DCB_RANGE_READOUT_ID, String(view.camera.rangeNm));
  setText(DCB_FILTER_BAND_ID, formatFilterBand(view.altitudeFilter, view.filterEntry));
  setText(DCB_RR_READOUT_ID, formatDcbRrReadout(view.ringIntervalNm, view.showRings));
  setPressed(doc.querySelector('[data-dcb-cell="rr"]'), spinnerArmed(view, "RR"));
  setText(DCB_LDR_READOUT_ID, dcbLeaderDirReadout(view, world));
  setText(DCB_LDR_LENGTH_READOUT_ID, formatDcbLdrLengthReadout(view.leaderLengthPx));
  setText(DCB_CHAR_READOUT_ID, formatDcbCharReadout(view.charSizes.dataBlocks));
  setText(DCB_BRITE_READOUT_ID, formatDcbBriteReadout(view.brite.mpa));
  for (const el of doc.querySelectorAll("[data-dcb-map-id]")) {
    const id = el.getAttribute("data-dcb-map-id");
    if (id) {
      setPressed(el, isVideoMapOn(view, id));
    }
  }
  setPressed(doc.querySelector("[data-dcb-ptl]"), view.ptlOn);
  setPressed(doc.querySelector("[data-dcb-hist]"), view.historyEnabled);
  setText(DCB_HISTORY_READOUT_ID, formatDcbHistoryReadout(view.historyDotCount));
  setText(DCB_PTL_MINUTES_READOUT_ID, formatDcbPtlMinutesReadout(view.ptlMinutes));
  setText(DCB_TPA_MI_READOUT_ID, formatDcbTpaMiReadout(view.tpa.radiusNm));
  setPressed(doc.querySelector('[data-dcb-cell="ptl-own"]'), view.ptlOwn);
  setPressed(doc.querySelector('[data-dcb-cell="ptl-all"]'), view.ptlOn);
  setPressed(doc.querySelector('[data-dcb-cell="hist"]'), historySpinnerArmed(view));
  setPressed(doc.querySelector('[data-dcb-cell="ptl-len"]'), ptlSpinnerArmed(view));
  setPressed(doc.querySelector('[data-dcb-cell="dock-top"]'), view.dcbDock === "TOP");
  setPressed(doc.querySelector('[data-dcb-cell="dock-left"]'), view.dcbDock === "LEFT");
  setPressed(doc.querySelector('[data-dcb-cell="dock-right"]'), view.dcbDock === "RIGHT");
  setPressed(doc.querySelector('[data-dcb-cell="dock-bottom"]'), view.dcbDock === "BOTTOM");
  setPressed(doc.querySelector('[data-dcb-cell="maps"]'), view.dcbMenu === "MAPS");
  setPressed(doc.querySelector('[data-dcb-cell="place"]'), view.placeCenterArmed);
  setPressed(doc.querySelector('[data-dcb-cell="off-cntr"]'), isViewOffAirport(view));
  setPressed(doc.querySelector('[data-dcb-cell="place-rr"]'), view.placeRangeRingArmed);
  setPressed(doc.querySelector('[data-dcb-cell="rr-cntr"]'), isRangeRingOffViewCenter(view));
  setPressed(doc.querySelector('[data-dcb-cell="range"]'), spinnerArmed(view, "RANGE"));
  setPressed(doc.querySelector('[data-dcb-cell="ldr-dir"]'), spinnerArmed(view, "LDR_DIR"));
  setPressed(doc.querySelector('[data-dcb-cell="ldr-length"]'), spinnerArmed(view, "LDR_LENGTH"));
  setPressed(doc.querySelector('[data-dcb-cell="geo-maps"]'), view.geoMapsListOn);
  setPressed(doc.querySelector('[data-dcb-cell="current"]'), view.currentMapsListOn);
  setPressed(doc.querySelector('[data-dcb-cell="ssa-filter"]'), view.dcbMenu === "SSA_FILTER");
  setPressed(doc.querySelector('[data-dcb-cell="gi-text"]'), view.dcbMenu === "GI_FILTER");
  for (const field of SSA_FILTER_FIELDS) {
    setPressed(
      doc.querySelector(`[data-dcb-cell="${ssaFilterCellId(field)}"]`),
      view.ssaFilter[field],
    );
  }
  for (const el of doc.querySelectorAll("[data-dcb-gi-slot]")) {
    const slot = Number(el.getAttribute("data-dcb-gi-slot"));
    if (Number.isFinite(slot) && slot >= 1) {
      setPressed(el, view.giFilterVisible[slot - 1] === true);
    }
  }
  setPressed(doc.querySelector('[data-dcb-cell="tpa-on"]'), view.tpa.on);
  setPressed(doc.querySelector('[data-dcb-cell="tpa-mi"]'), tpaMiSpinnerArmed(view));
  setPressed(doc.querySelector('[data-dcb-cell="atpa"]'), view.atpa.on);
  setPressed(doc.querySelector('[data-dcb-cell="atpa-mileage"]'), view.atpa.coneMileage);
  setPressed(doc.querySelector('[data-dcb-cell="atpa-intrail"]'), view.atpa.inTrailDistance);
  setPressed(doc.querySelector('[data-dcb-cell="atpa-alert"]'), view.atpa.alertCones);
  setPressed(doc.querySelector('[data-dcb-cell="atpa-monitor"]'), view.atpa.monitorCones);
}

interface DcbCellProps {
  ariaLabel: string;
  children: ReactNode;
  kind?: DcbCellKind;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onWheel?: (event: WheelEvent<HTMLButtonElement>) => void;
  onDragDelta?: (deltaSteps: number) => void;
  dataDcb?:
    | "lists-all"
    | "ptl"
    | "hist"
    | "range"
    | "maps"
    | "filter"
    | "rr"
    | "ldr"
    | "ldr-dir"
    | "ldr-length"
    | "char"
    | "brite"
    | "char-data-blocks"
    | "char-lists"
    | "char-dcb"
    | "char-tools"
    | "char-pos"
    | "brite-dcb"
    | "brite-mpa"
    | "brite-mpb"
    | "brite-fdb"
    | "brite-lst"
    | "brite-pos"
    | "brite-ldb"
    | "brite-oth"
    | "brite-tls"
    | "brite-rr"
    | "brite-hst"
    | "brite-cmp"
    | "brite-bcn"
    | "brite-pri"
    | "brite-wx"
    | "brite-wxc"
    | "brite-bkc"
    | "place"
    | "off-cntr"
    | "place-rr"
    | "rr-cntr"
    | "shift"
    | "done"
    | "vol"
    | "wx1"
    | "wx2"
    | "wx3"
    | "wx4"
    | "clr-all"
    | "geo-maps"
    | "current"
    | "ptl-len"
    | "ptl-own"
    | "ptl-all"
    | "dock-top"
    | "dock-left"
    | "dock-right"
    | "dock-bottom"
    | "tpa"
    | "ssa-filter"
    | "gi-text"
    | "ssa-all"
    | "ssa-time"
    | "ssa-altstg"
    | "ssa-filter-line"
    | "ssa-range"
    | "ssa-off-cntr"
    | "ssa-status"
    | "ssa-ptl"
    | "crda"
    | "gi-main"
    | "gi-slot"
    | "tpa-on"
    | "tpa-mi"
    | "atpa"
    | "atpa-mileage"
    | "atpa-intrail"
    | "atpa-monitor"
    | "atpa-alert"
    | "pref"
    | `pref-${number}`
    | "pref-default"
    | "pref-restore"
    | "pref-save"
    | "pref-save-as"
    | "pref-delete";
  dataMapId?: string;
  dataMapSlot?: number;
  dataGiSlot?: number;
}

export interface MainDcbLayoutCell {
  id: string;
  row: 1 | 2;
  column: number;
  rowSpan: 1 | 2;
  kind: DcbCellKind;
  label: string;
  value?: string;
}

/**
 * Analog: CRC STARS MAIN DCB physical column grammar (R07).
 * Trainer delta: this is a fixed two-row, 22-column projection; quick maps are
 * authored six-map controls rather than a full NAS video-map host.
 */
export const MAIN_DCB_LAYOUT: readonly MainDcbLayoutCell[] = [
  { id: "range", row: 1, column: 1, rowSpan: 2, kind: "spinner", label: "RANGE" },
  { id: "place-cntr", row: 1, column: 2, rowSpan: 1, kind: "toggle", label: "PLACE CNTR" },
  { id: "off-cntr", row: 2, column: 2, rowSpan: 1, kind: "toggle", label: "OFF CNTR" },
  { id: "rr", row: 1, column: 3, rowSpan: 2, kind: "spinner", label: "RR" },
  { id: "place-rr", row: 1, column: 4, rowSpan: 1, kind: "toggle", label: "PLACE RR" },
  { id: "rr-cntr", row: 2, column: 4, rowSpan: 1, kind: "toggle", label: "RR CNTR" },
  { id: "maps", row: 1, column: 5, rowSpan: 2, kind: "submenu", label: "MAPS" },
  ...Array.from({ length: 6 }, (_, index): MainDcbLayoutCell => ({
    id: `map-${index + 1}`,
    row: index < 3 ? 1 : 2,
    column: 6 + (index % 3),
    rowSpan: 1,
    kind: "toggle",
    label: `MAP ${index + 1}`,
  })),
  ...Array.from({ length: 6 }, (_, index): MainDcbLayoutCell => ({
    id: `wx${index + 1}`,
    row: 1,
    column: 9 + index,
    rowSpan: 2,
    kind: "disabled",
    label: `WX${index + 1}`,
  })),
  { id: "brite", row: 1, column: 15, rowSpan: 2, kind: "submenu", label: "BRITE" },
  { id: "ldr-dir", row: 1, column: 16, rowSpan: 1, kind: "spinner", label: "LDR DIR" },
  { id: "ldr-length", row: 2, column: 16, rowSpan: 1, kind: "spinner", label: "LDR" },
  { id: "char", row: 1, column: 17, rowSpan: 2, kind: "submenu", label: "CHAR SIZE" },
  { id: "mode-fsl", row: 1, column: 18, rowSpan: 2, kind: "disabled", label: "MODE FSL" },
  { id: "pref", row: 1, column: 19, rowSpan: 2, kind: "submenu", label: "PREF" },
  { id: "site-fused", row: 1, column: 20, rowSpan: 2, kind: "disabled", label: "SITE FUSED" },
  { id: "ssa-filter", row: 1, column: 21, rowSpan: 1, kind: "submenu", label: "SSA FILTER" },
  { id: "gi-text", row: 2, column: 21, rowSpan: 1, kind: "submenu", label: "GI TEXT FILTER" },
  { id: "shift", row: 1, column: 22, rowSpan: 2, kind: "action", label: "SHIFT" },
];

function DcbCell({
  ariaLabel,
  children,
  kind = "action",
  pressed,
  disabled,
  onClick,
  onWheel,
  onDragDelta,
  dataDcb,
  dataMapId,
  dataMapSlot,
  dataGiSlot,
}: DcbCellProps) {
  const inert = disabled || kind === "disabled";
  const [flashing, setFlashing] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef<number | null>(null);
  const accumulatedDy = useRef(0);
  const momentary = kind !== "toggle" && kind !== "disabled";
  const inset = dcbActionCapPressed(pressed, momentary && flashing);

  useEffect(() => {
    return () => {
      if (flashTimer.current != null) {
        clearTimeout(flashTimer.current);
      }
      if (clickTimer.current != null) {
        clearTimeout(clickTimer.current);
      }
    };
  }, []);

  function clearFlashTimer(): void {
    if (flashTimer.current != null) {
      clearTimeout(flashTimer.current);
      flashTimer.current = null;
    }
  }

  function armActionFlash(): void {
    if (inert || !momentary) {
      return;
    }
    clearFlashTimer();
    setFlashing(true);
  }

  function releaseActionFlash(): void {
    if (!momentary) {
      return;
    }
    clearFlashTimer();
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null;
      setFlashing(false);
    }, DCB_ACTION_FLASH_MS);
  }

  function invokeClick(): void {
    if (!momentary) {
      onClick();
      return;
    }
    armActionFlash();
    releaseActionFlash();
    if (clickTimer.current != null) {
      clearTimeout(clickTimer.current);
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onClick();
    }, DCB_ACTION_FLASH_MS);
  }

  return (
    <button
      type="button"
      className="dcb-cell"
      aria-label={ariaLabel}
      aria-pressed={inset}
      aria-disabled={inert ? true : undefined}
      disabled={inert}
      data-dcb-kind={kind}
      data-dcb-map-id={dataMapId}
      data-dcb-map-slot={dataMapSlot}
      data-dcb-gi-slot={dataGiSlot}
      data-dcb-ptl={dataDcb === "ptl" ? "" : undefined}
      data-dcb-hist={dataDcb === "hist" ? "" : undefined}
      data-dcb-cell={dataDcb}
      data-dcb-flashing={flashing ? "true" : undefined}
      onMouseDown={preventButtonFocus}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        if (kind === "spinner" && onDragDelta) {
          isDragging.current = true;
          dragStartY.current = event.clientY;
          accumulatedDy.current = 0;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } else if (event.currentTarget.setPointerCapture) {
          if (momentary) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }
        armActionFlash();
      }}
      onPointerMove={(event: PointerEvent<HTMLButtonElement>) => {
        if (isDragging.current && dragStartY.current !== null && onDragDelta) {
          const dy = dragStartY.current - event.clientY; // Up is positive
          accumulatedDy.current += dy;
          dragStartY.current = event.clientY;
          const STEP_PX = 8;
          if (Math.abs(accumulatedDy.current) >= STEP_PX) {
            const steps = Math.trunc(accumulatedDy.current / STEP_PX);
            accumulatedDy.current -= steps * STEP_PX;
            onDragDelta(steps);
          }
        }
      }}
      onPointerUp={(event: PointerEvent<HTMLButtonElement>) => {
        if (isDragging.current) {
          isDragging.current = false;
          dragStartY.current = null;
          accumulatedDy.current = 0;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
        releaseActionFlash();
      }}
      onPointerCancel={() => {
        isDragging.current = false;
        dragStartY.current = null;
        accumulatedDy.current = 0;
        if (momentary) {
          clearFlashTimer();
          setFlashing(false);
        }
      }}
      onWheel={onWheel}
      onClick={() => {
        if (inert) {
          return;
        }
        invokeClick();
      }}
    >
      <span className="dcb-cell-stack">{children}</span>
    </button>
  );
}

function mapSlotClick(view: ScopeView, onChange: () => void, slot: number): void {
  const map = videoMapByDcbNumber(view, slot);
  if (!map || !isDcbMapSlotEnabled(view, slot)) {
    return;
  }
  cancelFilterIfEntering(view);
  toggleVideoMap(view, map.id);
  afterCell(onChange);
}

function renderMapSlot(view: ScopeView, onChange: () => void, slot: number) {
  const map = videoMapByDcbNumber(view, slot);
  const enabled = isDcbMapSlotEnabled(view, slot);
  const identity =
    map === undefined
      ? String(slot)
      : map.starsId !== undefined
        ? String(map.starsId)
        : String(map.dcbNumber ?? slot);
  const label = map?.dcbLabel ?? "";
  const labelLines = label ? label.split(/[\s_]+/) : [];
  return (
    <DcbCell
      key={slot}
      kind={enabled ? "toggle" : "disabled"}
      ariaLabel={map ? formatDcbMapLabel(map) : `Map ${slot}`}
      dataMapId={map?.id}
      dataMapSlot={slot}
      pressed={map ? isVideoMapOn(view, map.id) : false}
      disabled={!enabled}
      onClick={() => mapSlotClick(view, onChange, slot)}
    >
      <span className="dcb-cell-line">{identity}</span>
      {labelLines.length > 0 ? (
        labelLines.map((line, idx) => (
          <span className="dcb-cell-line" key={idx}>
            {line}
          </span>
        ))
      ) : (
        <span className="dcb-cell-line" />
      )}
    </DcbCell>
  );
}

function renderPrefOpener(view: ScopeView, onChange: () => void) {
  const name = activeDcbPrefName(view);
  const readout = formatDcbPrefReadout(name);
  return (
    <DcbCell
      kind="submenu"
      ariaLabel={name ? `Pref ${name}` : "Pref"}
      dataDcb="pref"
      pressed={view.dcbMenu === "PREF"}
      onClick={() => {
        cancelFilterIfEntering(view);
        beginDcbPrefSession(view);
        openDcbMenu(view, "PREF");
        afterCell(onChange);
      }}
    >
      <span className="dcb-cell-line">PREF</span>
      <span className="dcb-cell-line">{readout}</span>
    </DcbCell>
  );
}

function renderWxCell(n: 1 | 2 | 3 | 4) {
  return (
    <DcbCell
      key={n}
      kind="disabled"
      ariaLabel={`WX${n}`}
      dataDcb={`wx${n}`}
      disabled
      onClick={() => undefined}
    >
      <span className="dcb-cell-line">{`WX${n}`}</span>
    </DcbCell>
  );
}

function runCell(view: ScopeView, onChange: () => void, fn: () => void): void {
  cancelFilterIfEntering(view);
  closeDcbMenu(view);
  commitDcbSpinner(view);
  fn();
  afterCell(onChange);
}

function runAuxCell(view: ScopeView, onChange: () => void, fn: () => void): void {
  cancelFilterIfEntering(view);
  fn();
  afterCell(onChange);
}

function clickDone(view: ScopeView, onChange: () => void): void {
  cancelFilterIfEntering(view);
  hideMapLists(view);
  closeDcbMenu(view);
  afterCell(onChange);
}

function renderDone(view: ScopeView, onChange: () => void) {
  return (
    <DcbCell
      kind="action"
      ariaLabel="Done"
      dataDcb="done"
      onClick={() => clickDone(view, onChange)}
    >
      <span className="dcb-cell-line">DONE</span>
    </DcbCell>
  );
}

function renderShift(view: ScopeView, onChange: () => void) {
  return (
    <DcbCell
      kind="action"
      ariaLabel="Shift"
      dataDcb="shift"
      onClick={() => {
        cancelFilterIfEntering(view);
        applyDcbShift(view);
        afterCell(onChange);
      }}
    >
      <span className="dcb-cell-line">SHIFT</span>
    </DcbCell>
  );
}

function renderPhysicalMain(
  view: ScopeView,
  onChange: () => void,
  world: DisplayControlBarProps["world"],
) {
  const disabled = (id: string, label: string) => (
    <DcbCell
      kind="disabled"
      ariaLabel={label}
      dataDcb={id === "mode-fsl" ? undefined : (id as DcbCellProps["dataDcb"])}
      disabled
      onClick={() => undefined}
    >
      {label.includes(" ") ? (
        label.split(" ").map((part) => (
          <span className="dcb-cell-line" key={part}>
            {part}
          </span>
        ))
      ) : (
        <span className="dcb-cell-line">{label}</span>
      )}
    </DcbCell>
  );
  const render = (id: string): ReactNode => {
    switch (id) {
      case "range":
        return (
          <DcbCell
            kind="spinner"
            ariaLabel={formatDcbRangeReadout(view.camera.rangeNm)}
            dataDcb="range"
            pressed={spinnerArmed(view, "RANGE")}
            onClick={() => toggleSpinner(view, onChange, "RANGE")}
            onWheel={(event) =>
              onSpinnerWheel(view, "RANGE", event, (step) => stepRange(view.camera, step), onChange)
            }
            onDragDelta={(step) => {
              for (let i = 0; i < Math.abs(step); i++) {
                stepRange(view.camera, step > 0 ? 1 : -1);
              }
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">RANGE</span>
            <span id={DCB_RANGE_READOUT_ID} className="dcb-cell-line">
              {view.camera.rangeNm}
            </span>
          </DcbCell>
        );
      case "place-cntr":
        return (
          <DcbCell
            kind="toggle"
            ariaLabel="Place center"
            dataDcb="place"
            pressed={view.placeCenterArmed}
            onClick={() => runCell(view, onChange, () => armPlaceCenter(view))}
          >
            <span className="dcb-cell-line">PLACE</span>
            <span className="dcb-cell-line">CNTR</span>
          </DcbCell>
        );
      case "off-cntr":
        return (
          <DcbCell
            kind="toggle"
            ariaLabel="Off center"
            dataDcb="off-cntr"
            pressed={isViewOffAirport(view)}
            onClick={() => runCell(view, onChange, () => centerOnAirport(view))}
          >
            <span className="dcb-cell-line">OFF</span>
            <span className="dcb-cell-line">CNTR</span>
          </DcbCell>
        );
      case "rr":
        return (
          <DcbCell
            kind="spinner"
            ariaLabel="Range rings"
            dataDcb="rr"
            pressed={spinnerArmed(view, "RR")}
            onClick={() => toggleSpinner(view, onChange, "RR")}
            onWheel={(event) =>
              onSpinnerWheel(view, "RR", event, (step) => stepRrInterval(view, step), onChange)
            }
            onDragDelta={(step) => {
              for (let i = 0; i < Math.abs(step); i++) {
                stepRrInterval(view, step > 0 ? 1 : -1);
              }
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">RR</span>
            <span id={DCB_RR_READOUT_ID} className="dcb-cell-line">
              {formatDcbRrReadout(view.ringIntervalNm, view.showRings)}
            </span>
          </DcbCell>
        );
      case "place-rr":
        return (
          <DcbCell
            kind="toggle"
            ariaLabel="Place range rings"
            dataDcb="place-rr"
            pressed={view.placeRangeRingArmed}
            onClick={() => runCell(view, onChange, () => armPlaceRangeRing(view))}
          >
            <span className="dcb-cell-line">PLACE</span>
            <span className="dcb-cell-line">RR</span>
          </DcbCell>
        );
      case "rr-cntr":
        return (
          <DcbCell
            kind="toggle"
            ariaLabel="Range rings center"
            dataDcb="rr-cntr"
            pressed={isRangeRingOffViewCenter(view)}
            onClick={() => runCell(view, onChange, () => applyRrCenter(view))}
          >
            <span className="dcb-cell-line">RR</span>
            <span className="dcb-cell-line">CNTR</span>
          </DcbCell>
        );
      case "maps":
        return (
          <DcbCell
            kind="submenu"
            ariaLabel="Maps"
            dataDcb="maps"
            pressed={view.dcbMenu === "MAPS"}
            onClick={() => {
              cancelFilterIfEntering(view);
              openDcbMenu(view, "MAPS");
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">MAPS</span>
          </DcbCell>
        );
      case "brite":
        return (
          <DcbCell
            kind="submenu"
            ariaLabel="Brite"
            dataDcb="brite"
            pressed={view.dcbMenu === "BRITE"}
            onClick={() => {
              cancelFilterIfEntering(view);
              openDcbMenu(view, "BRITE");
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">BRITE</span>
          </DcbCell>
        );
      case "ldr-dir":
        return (
          <DcbCell
            kind="spinner"
            ariaLabel="Leader direction"
            dataDcb="ldr-dir"
            pressed={spinnerArmed(view, "LDR_DIR")}
            onClick={() => toggleSpinner(view, onChange, "LDR_DIR")}
            onWheel={(event) =>
              onSpinnerWheel(
                view,
                "LDR_DIR",
                event,
                (step) => stepDcbLeaderDir(view, world, step),
                onChange,
              )
            }
            onDragDelta={(step) => {
              for (let i = 0; i < Math.abs(step); i++) {
                stepDcbLeaderDir(view, world, step > 0 ? 1 : -1);
              }
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">LDR DIR</span>
            <span id={DCB_LDR_READOUT_ID} className="dcb-cell-line">
              {dcbLeaderDirReadout(view, world)}
            </span>
          </DcbCell>
        );
      case "ldr-length":
        return (
          <DcbCell
            kind="spinner"
            ariaLabel="Leader length"
            dataDcb="ldr-length"
            pressed={spinnerArmed(view, "LDR_LENGTH")}
            onClick={() => toggleSpinner(view, onChange, "LDR_LENGTH")}
            onWheel={(event) =>
              onSpinnerWheel(
                view,
                "LDR_LENGTH",
                event,
                (step) => stepDcbLeaderLength(view, step),
                onChange,
              )
            }
            onDragDelta={(step) => {
              for (let i = 0; i < Math.abs(step); i++) {
                stepDcbLeaderLength(view, step > 0 ? 1 : -1);
              }
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">LDR</span>
            <span id={DCB_LDR_LENGTH_READOUT_ID} className="dcb-cell-line">
              {formatDcbLdrLengthReadout(view.leaderLengthPx)}
            </span>
          </DcbCell>
        );
      case "char":
        return (
          <DcbCell
            kind="submenu"
            ariaLabel="Character size"
            dataDcb="char"
            pressed={view.dcbMenu === "CHAR_SIZE"}
            onClick={() => {
              cancelFilterIfEntering(view);
              openDcbMenu(view, "CHAR_SIZE");
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">CHAR</span>
            <span className="dcb-cell-line">SIZE</span>
          </DcbCell>
        );
      case "pref":
        return renderPrefOpener(view, onChange);
      case "ssa-filter":
        return (
          <DcbCell
            kind="submenu"
            ariaLabel="SSA filter"
            dataDcb="ssa-filter"
            pressed={view.dcbMenu === "SSA_FILTER"}
            onClick={() => {
              cancelFilterIfEntering(view);
              openDcbMenu(view, "SSA_FILTER");
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">SSA</span>
            <span className="dcb-cell-line">FILTER</span>
          </DcbCell>
        );
      case "gi-text":
        return (
          <DcbCell
            kind="submenu"
            ariaLabel="GI text filter"
            dataDcb="gi-text"
            pressed={view.dcbMenu === "GI_FILTER"}
            onClick={() => {
              cancelFilterIfEntering(view);
              openDcbMenu(view, "GI_FILTER");
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">GI TEXT</span>
            <span className="dcb-cell-line">FILTER</span>
          </DcbCell>
        );
      case "shift":
        return renderShift(view, onChange);
      default:
        if (id.startsWith("map-")) {
          return renderMapSlot(view, onChange, Number(id.slice(4)));
        }
        return disabled(
          id,
          id === "mode-fsl" ? "MODE FSL" : id === "site-fused" ? "SITE FUSED" : id.toUpperCase(),
        );
    }
  };
  return (
    <div className="dcb-main-grid" data-dcb-layout="MAIN">
      {MAIN_DCB_LAYOUT.map((cell) => (
        <div
          key={cell.id}
          className="dcb-main-grid-cell"
          data-dcb-layout-id={cell.id}
          data-dcb-row={cell.row}
          data-dcb-column={cell.column}
          data-dcb-row-span={cell.rowSpan}
          style={{
            gridColumn: cell.column,
            gridRow: `${cell.row} / span ${cell.rowSpan}`,
          }}
        >
          {render(cell.id)}
        </div>
      ))}
    </div>
  );
}

/** Legacy flat projection retained for submenu compatibility snapshots. */
export function renderMainLegacy(
  view: ScopeView,
  onChange: () => void,
  world: DisplayControlBarProps["world"],
) {
  const offCntr = isViewOffAirport(view);
  return (
    <>
      <DcbCell
        kind="spinner"
        ariaLabel="Range"
        dataDcb="range"
        pressed={spinnerArmed(view, "RANGE")}
        onClick={() => {
          cancelFilterIfEntering(view);
          if (spinnerArmed(view, "RANGE")) {
            commitDcbSpinner(view);
          } else {
            armDcbSpinner(view, "RANGE");
          }
          afterCell(onChange);
        }}
        onWheel={(event) =>
          onSpinnerWheel(view, "RANGE", event, (step) => stepRange(view.camera, step), onChange)
        }
      >
        <span id={DCB_RANGE_READOUT_ID} className="dcb-cell-line">
          {formatDcbRangeReadout(view.camera.rangeNm)}
        </span>
      </DcbCell>
      <DcbCell
        kind="toggle"
        ariaLabel="Place center"
        dataDcb="place"
        pressed={view.placeCenterArmed}
        onClick={() => runCell(view, onChange, () => armPlaceCenter(view))}
      >
        <span className="dcb-cell-line">PLACE</span>
        <span className="dcb-cell-line">CNTR</span>
      </DcbCell>
      <DcbCell
        kind="toggle"
        ariaLabel="Off center"
        dataDcb="off-cntr"
        pressed={offCntr}
        onClick={() => runCell(view, onChange, () => centerOnAirport(view))}
      >
        <span className="dcb-cell-line">OFF</span>
        <span className="dcb-cell-line">CNTR</span>
      </DcbCell>
      <DcbCell
        kind="submenu"
        ariaLabel="Maps"
        dataDcb="maps"
        pressed={view.dcbMenu === "MAPS"}
        onClick={() => {
          cancelFilterIfEntering(view);
          openDcbMenu(view, "MAPS");
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">MAPS</span>
      </DcbCell>
      {Array.from({ length: DCB_QUICK_MAP_COUNT }, (_, i) => renderMapSlot(view, onChange, i + 1))}
      {([1, 2, 3, 4] as const).map((n) => renderWxCell(n))}
      <DcbCell
        kind="spinner"
        ariaLabel="Range rings"
        dataDcb="rr"
        pressed={spinnerArmed(view, "RR")}
        onClick={() => toggleSpinner(view, onChange, "RR")}
        onWheel={(event) =>
          onSpinnerWheel(view, "RR", event, (step) => stepRrInterval(view, step), onChange)
        }
      >
        <span className="dcb-cell-line">RR</span>
        <span id={DCB_RR_READOUT_ID} className="dcb-cell-line">
          {formatDcbRrReadout(view.ringIntervalNm, view.showRings)}
        </span>
      </DcbCell>
      <DcbCell
        kind="toggle"
        ariaLabel="Place range rings"
        dataDcb="place-rr"
        pressed={view.placeRangeRingArmed}
        onClick={() => runCell(view, onChange, () => armPlaceRangeRing(view))}
      >
        <span className="dcb-cell-line">PLACE</span>
        <span className="dcb-cell-line">RR</span>
      </DcbCell>
      <DcbCell
        kind="toggle"
        ariaLabel="Range rings center"
        dataDcb="rr-cntr"
        pressed={isRangeRingOffViewCenter(view)}
        onClick={() => runCell(view, onChange, () => applyRrCenter(view))}
      >
        <span className="dcb-cell-line">RR</span>
        <span className="dcb-cell-line">CNTR</span>
      </DcbCell>
      <DcbCell
        kind="spinner"
        ariaLabel="Leader direction"
        dataDcb="ldr-dir"
        pressed={spinnerArmed(view, "LDR_DIR")}
        onClick={() => toggleSpinner(view, onChange, "LDR_DIR")}
        onWheel={(event) =>
          onSpinnerWheel(
            view,
            "LDR_DIR",
            event,
            (step) => stepDcbLeaderDir(view, world, step),
            onChange,
          )
        }
      >
        <span className="dcb-cell-line">LDR DIR</span>
        <span id={DCB_LDR_READOUT_ID} className="dcb-cell-line">
          {dcbLeaderDirReadout(view, world)}
        </span>
      </DcbCell>
      <DcbCell
        kind="spinner"
        ariaLabel="Leader length"
        dataDcb="ldr-length"
        pressed={spinnerArmed(view, "LDR_LENGTH")}
        onClick={() => toggleSpinner(view, onChange, "LDR_LENGTH")}
        onWheel={(event) =>
          onSpinnerWheel(
            view,
            "LDR_LENGTH",
            event,
            (step) => stepDcbLeaderLength(view, step),
            onChange,
          )
        }
      >
        <span className="dcb-cell-line">LDR</span>
        <span id={DCB_LDR_LENGTH_READOUT_ID} className="dcb-cell-line">
          {formatDcbLdrLengthReadout(view.leaderLengthPx)}
        </span>
      </DcbCell>
      {/* CHAR SIZE / BRITE open CRC-analog submenus (T02-26). Not click-cycle. */}
      <DcbCell
        kind="submenu"
        ariaLabel="Character size"
        dataDcb="char"
        pressed={view.dcbMenu === "CHAR_SIZE"}
        onClick={() => {
          cancelFilterIfEntering(view);
          openDcbMenu(view, "CHAR_SIZE");
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">CHAR</span>
        <span className="dcb-cell-line">SIZE</span>
      </DcbCell>
      <DcbCell
        kind="submenu"
        ariaLabel="Brite"
        dataDcb="brite"
        pressed={view.dcbMenu === "BRITE"}
        onClick={() => {
          cancelFilterIfEntering(view);
          openDcbMenu(view, "BRITE");
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">BRITE</span>
      </DcbCell>
      <DcbCell
        kind="action"
        ariaLabel="Altitude filter"
        dataDcb="filter"
        onClick={() => {
          closeDcbMenu(view);
          beginAltitudeFilterChord(view);
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">FILTER</span>
        <span id={DCB_FILTER_BAND_ID} className="dcb-cell-line">
          {formatFilterBand(view.altitudeFilter, view.filterEntry)}
        </span>
      </DcbCell>
      <DcbCell
        kind="submenu"
        ariaLabel="SSA filter"
        dataDcb="ssa-filter"
        pressed={view.dcbMenu === "SSA_FILTER"}
        onClick={() => {
          cancelFilterIfEntering(view);
          openDcbMenu(view, "SSA_FILTER");
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">SSA</span>
        <span className="dcb-cell-line">FILTER</span>
      </DcbCell>
      <DcbCell
        kind="submenu"
        ariaLabel="GI text"
        dataDcb="gi-text"
        pressed={view.dcbMenu === "GI_FILTER"}
        onClick={() => {
          cancelFilterIfEntering(view);
          openDcbMenu(view, "GI_FILTER");
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">GI</span>
        <span className="dcb-cell-line">TEXT</span>
      </DcbCell>
      {renderPrefOpener(view, onChange)}
      {renderShift(view, onChange)}
    </>
  );
}

function renderAux(view: ScopeView, onChange: () => void) {
  const historyArmed = historySpinnerArmed(view);
  const ptlArmed = ptlSpinnerArmed(view);
  return (
    <div className="dcb-main-grid" data-dcb-layout="AUX">
      {/* Col 1 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="vol"
        data-dcb-row={1}
        data-dcb-column={1}
        data-dcb-row-span={2}
        style={{ gridColumn: 1, gridRow: "1 / span 2" }}
      >
        <DcbCell
          kind="disabled"
          ariaLabel="Volume"
          dataDcb="vol"
          disabled
          onClick={() => undefined}
        >
          <span className="dcb-cell-line">VOL</span>
          <span className="dcb-cell-line">2</span>
        </DcbCell>
      </div>

      {/* Col 2 (Split) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="hist"
        data-dcb-row={1}
        data-dcb-column={2}
        data-dcb-row-span={1}
        style={{ gridColumn: 2, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="spinner"
          ariaLabel="History"
          dataDcb="hist"
          pressed={historyArmed}
          onClick={() => {
            cancelFilterIfEntering(view);
            if (historyArmed) {
              commitDcbSpinner(view);
            } else {
              armDcbSpinner(view, "HISTORY");
            }
            afterCell(onChange);
          }}
          onWheel={(event) =>
            onSpinnerWheel(view, "HISTORY", event, (step) => stepHistoryDots(view, step), onChange)
          }
          onDragDelta={(step) => {
            for (let i = 0; i < Math.abs(step); i++) {
              stepHistoryDots(view, step > 0 ? 1 : -1);
            }
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">HISTORY</span>
          <span id={DCB_HISTORY_READOUT_ID} className="dcb-cell-line">
            {formatDcbHistoryReadout(view.historyDotCount)}
          </span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="h-rate"
        data-dcb-row={2}
        data-dcb-column={2}
        data-dcb-row-span={1}
        style={{ gridColumn: 2, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="History rate" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">H_RATE</span>
          <span className="dcb-cell-line">4.5</span>
        </DcbCell>
      </div>

      {/* Col 3 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="cursor-home"
        data-dcb-row={1}
        data-dcb-column={3}
        data-dcb-row-span={2}
        style={{ gridColumn: 3, gridRow: "1 / span 2" }}
      >
        <DcbCell kind="disabled" ariaLabel="Cursor home" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">CURSOR</span>
          <span className="dcb-cell-line">HOME</span>
        </DcbCell>
      </div>

      {/* Col 4 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="csr-spd"
        data-dcb-row={1}
        data-dcb-column={4}
        data-dcb-row-span={2}
        style={{ gridColumn: 4, gridRow: "1 / span 2" }}
      >
        <DcbCell kind="disabled" ariaLabel="Cursor speed" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">CSR SPD</span>
          <span className="dcb-cell-line">4</span>
        </DcbCell>
      </div>

      {/* Col 5 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="map-uncor"
        data-dcb-row={1}
        data-dcb-column={5}
        data-dcb-row-span={2}
        style={{ gridColumn: 5, gridRow: "1 / span 2" }}
      >
        <DcbCell kind="disabled" ariaLabel="Map uncorrected" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">MAP</span>
          <span className="dcb-cell-line">UNCOR</span>
        </DcbCell>
      </div>

      {/* Col 6 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="uncor"
        data-dcb-row={1}
        data-dcb-column={6}
        data-dcb-row-span={2}
        style={{ gridColumn: 6, gridRow: "1 / span 2" }}
      >
        <DcbCell kind="disabled" ariaLabel="Uncorrected" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">UNCOR</span>
        </DcbCell>
      </div>

      {/* Col 7 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="beacon-mode2"
        data-dcb-row={1}
        data-dcb-column={7}
        data-dcb-row-span={2}
        style={{ gridColumn: 7, gridRow: "1 / span 2" }}
      >
        <DcbCell kind="disabled" ariaLabel="Beacon mode 2" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">BEACON</span>
          <span className="dcb-cell-line">MODE-2</span>
        </DcbCell>
      </div>

      {/* Col 8 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="rtqc"
        data-dcb-row={1}
        data-dcb-column={8}
        data-dcb-row-span={2}
        style={{ gridColumn: 8, gridRow: "1 / span 2" }}
      >
        <DcbCell kind="disabled" ariaLabel="RTQC" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">RTQC</span>
        </DcbCell>
      </div>

      {/* Col 9 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="mcp"
        data-dcb-row={1}
        data-dcb-column={9}
        data-dcb-row-span={2}
        style={{ gridColumn: 9, gridRow: "1 / span 2" }}
      >
        <DcbCell kind="disabled" ariaLabel="MCP" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">MCP</span>
        </DcbCell>
      </div>

      {/* Col 10 (Split) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="dock-top"
        data-dcb-row={1}
        data-dcb-column={10}
        data-dcb-row-span={1}
        style={{ gridColumn: 10, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="DCB top"
          dataDcb="dock-top"
          pressed={view.dcbDock === "TOP"}
          onClick={() => runAuxCell(view, onChange, () => setDcbDock(view, "TOP"))}
        >
          <span className="dcb-cell-line">DCB</span>
          <span className="dcb-cell-line">TOP</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="dock-left"
        data-dcb-row={2}
        data-dcb-column={10}
        data-dcb-row-span={1}
        style={{ gridColumn: 10, gridRow: "2 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="DCB left"
          dataDcb="dock-left"
          pressed={view.dcbDock === "LEFT"}
          onClick={() => runAuxCell(view, onChange, () => setDcbDock(view, "LEFT"))}
        >
          <span className="dcb-cell-line">DCB</span>
          <span className="dcb-cell-line">LEFT</span>
        </DcbCell>
      </div>

      {/* Col 11 (Split) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="dock-right"
        data-dcb-row={1}
        data-dcb-column={11}
        data-dcb-row-span={1}
        style={{ gridColumn: 11, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="DCB right"
          dataDcb="dock-right"
          pressed={view.dcbDock === "RIGHT"}
          onClick={() => runAuxCell(view, onChange, () => setDcbDock(view, "RIGHT"))}
        >
          <span className="dcb-cell-line">DCB</span>
          <span className="dcb-cell-line">RIGHT</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="dock-bottom"
        data-dcb-row={2}
        data-dcb-column={11}
        data-dcb-row-span={1}
        style={{ gridColumn: 11, gridRow: "2 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="DCB bottom"
          dataDcb="dock-bottom"
          pressed={view.dcbDock === "BOTTOM"}
          onClick={() => runAuxCell(view, onChange, () => setDcbDock(view, "BOTTOM"))}
        >
          <span className="dcb-cell-line">DCB</span>
          <span className="dcb-cell-line">BOTTOM</span>
        </DcbCell>
      </div>

      {/* Col 12 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ptl-len"
        data-dcb-row={1}
        data-dcb-column={12}
        data-dcb-row-span={2}
        style={{ gridColumn: 12, gridRow: "1 / span 2" }}
      >
        <DcbCell
          kind="spinner"
          ariaLabel="Predicted track line length"
          dataDcb="ptl-len"
          pressed={ptlArmed}
          onClick={() => {
            cancelFilterIfEntering(view);
            if (ptlArmed) {
              commitDcbSpinner(view);
            } else {
              armDcbSpinner(view, "PTL");
            }
            afterCell(onChange);
          }}
          onWheel={(event) =>
            onSpinnerWheel(view, "PTL", event, (step) => stepPtlLength(view, step), onChange)
          }
          onDragDelta={(step) => {
            for (let i = 0; i < Math.abs(step); i++) {
              stepPtlLength(view, step > 0 ? 1 : -1);
            }
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">PTL LNTH</span>
          <span id={DCB_PTL_MINUTES_READOUT_ID} className="dcb-cell-line">
            {formatDcbPtlMinutesReadout(view.ptlMinutes)}
          </span>
        </DcbCell>
      </div>

      {/* Col 13 (Split) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ptl-own"
        data-dcb-row={1}
        data-dcb-column={13}
        data-dcb-row-span={1}
        style={{ gridColumn: 13, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="Predicted track line own"
          dataDcb="ptl-own"
          pressed={view.ptlOwn}
          onClick={() => runAuxCell(view, onChange, () => togglePtlOwn(view))}
        >
          <span className="dcb-cell-line">PTL</span>
          <span className="dcb-cell-line">OWN</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ptl-all"
        data-dcb-row={2}
        data-dcb-column={13}
        data-dcb-row-span={1}
        style={{ gridColumn: 13, gridRow: "2 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="Predicted track line all"
          dataDcb="ptl-all"
          pressed={view.ptlOn}
          onClick={() => runAuxCell(view, onChange, () => togglePtlOn(view))}
        >
          <span className="dcb-cell-line">PTL</span>
          <span className="dcb-cell-line">ALL</span>
        </DcbCell>
      </div>

      {/* Col 14 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="dwell-on"
        data-dcb-row={1}
        data-dcb-column={14}
        data-dcb-row-span={2}
        style={{ gridColumn: 14, gridRow: "1 / span 2" }}
      >
        <DcbCell kind="disabled" ariaLabel="Dwell on" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">DWELL</span>
          <span className="dcb-cell-line">ON</span>
        </DcbCell>
      </div>

      {/* Col 15 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="tpa"
        data-dcb-row={1}
        data-dcb-column={15}
        data-dcb-row-span={2}
        style={{ gridColumn: 15, gridRow: "1 / span 2" }}
      >
        <DcbCell
          kind="submenu"
          ariaLabel="TPA ATPA"
          dataDcb="tpa"
          pressed={view.dcbMenu === "TPA_ATPA"}
          onClick={() => {
            cancelFilterIfEntering(view);
            openDcbMenu(view, "TPA_ATPA");
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">TPA/</span>
          <span className="dcb-cell-line">ATPA</span>
        </DcbCell>
      </div>

      {/* Col 16 (Split) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="tsas"
        data-dcb-row={1}
        data-dcb-column={16}
        data-dcb-row-span={1}
        style={{ gridColumn: 16, gridRow: "1 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="TSAS" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">TSAS</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="time-line"
        data-dcb-row={2}
        data-dcb-column={16}
        data-dcb-row-span={1}
        style={{ gridColumn: 16, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="Time line" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">TIME</span>
          <span className="dcb-cell-line">LINE</span>
        </DcbCell>
      </div>

      {/* Col 17 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="shift"
        data-dcb-row={1}
        data-dcb-column={17}
        data-dcb-row-span={2}
        style={{ gridColumn: 17, gridRow: "1 / span 2" }}
      >
        {renderShift(view, onChange)}
      </div>
    </div>
  );
}

function renderTpaAtpa(view: ScopeView, onChange: () => void) {
  const miArmed = tpaMiSpinnerArmed(view);
  return (
    <div className="dcb-main-grid" data-dcb-layout="TPA_ATPA">
      {/*
        R07 TPA ATPA Submenu (quoted):
        A/TPA Mileage — "displays mileage in the A/TPA cone"
        Intrail Distance — "displays intrail distance in the datablock"
        Alert Cones — "displays alert cones at this TCP"
        Monitor Cones — "displays monitor cones at this TCP"
        No separate Warning Cones cell — Alert Cones gates alert and warning.
        Master ATPA is not a DCB cell — R07 gates per feature. TPA ON / TPA MI
        are the T02-28 J-ring toggle and 2/3/5/10 NM spinner.
        Clicks are never Command IR.
      */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="tpa-on"
        data-dcb-row={1}
        data-dcb-column={1}
        data-dcb-row-span={1}
        style={{ gridColumn: 1, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="TPA"
          dataDcb="tpa-on"
          pressed={view.tpa.on}
          onClick={() => runAuxCell(view, onChange, () => toggleTpaOn(view))}
        >
          <span className="dcb-cell-line">TPA</span>
          <span className="dcb-cell-line">{view.tpa.on ? "ON" : "OFF"}</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="tpa-mi"
        data-dcb-row={1}
        data-dcb-column={2}
        data-dcb-row-span={1}
        style={{ gridColumn: 2, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="spinner"
          ariaLabel="TPA mileage"
          dataDcb="tpa-mi"
          pressed={miArmed}
          onClick={() => toggleSpinner(view, onChange, "TPA_MI")}
          onWheel={(event) =>
            onSpinnerWheel(view, "TPA_MI", event, (step) => stepTpaRadius(view, step), onChange)
          }
          onDragDelta={(step) => {
            for (let i = 0; i < Math.abs(step); i++) {
              stepTpaRadius(view, step > 0 ? 1 : -1);
            }
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">TPA MI</span>
          <span id={DCB_TPA_MI_READOUT_ID} className="dcb-cell-line">
            {formatDcbTpaMiReadout(view.tpa.radiusNm)}
          </span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="atpa-mileage"
        data-dcb-row={1}
        data-dcb-column={3}
        data-dcb-row-span={1}
        style={{ gridColumn: 3, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="A/TPA mileage"
          dataDcb="atpa-mileage"
          pressed={view.atpa.coneMileage}
          onClick={() => runAuxCell(view, onChange, () => toggleAtpaConeMileage(view))}
        >
          <span className="dcb-cell-line">A/TPA</span>
          <span className="dcb-cell-line">MILEAGE</span>
          <span className="dcb-cell-line">{view.atpa.coneMileage ? "ENABLED" : "DISABLED"}</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="atpa-intrail"
        data-dcb-row={1}
        data-dcb-column={4}
        data-dcb-row-span={1}
        style={{ gridColumn: 4, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="Intrail distance"
          dataDcb="atpa-intrail"
          pressed={view.atpa.inTrailDistance}
          onClick={() => runAuxCell(view, onChange, () => toggleAtpaInTrailDistance(view))}
        >
          <span className="dcb-cell-line">INTRAIL</span>
          <span className="dcb-cell-line">DISTANCE</span>
          <span className="dcb-cell-line">
            {view.atpa.inTrailDistance ? "ENABLED" : "DISABLED"}
          </span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="atpa-alert"
        data-dcb-row={1}
        data-dcb-column={5}
        data-dcb-row-span={1}
        style={{ gridColumn: 5, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="Alert cones"
          dataDcb="atpa-alert"
          pressed={view.atpa.alertCones}
          onClick={() => runAuxCell(view, onChange, () => toggleAtpaAlertCones(view))}
        >
          <span className="dcb-cell-line">ALERT</span>
          <span className="dcb-cell-line">CONES</span>
          <span className="dcb-cell-line">{view.atpa.alertCones ? "ENABLED" : "DISABLED"}</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="atpa-monitor"
        data-dcb-row={1}
        data-dcb-column={6}
        data-dcb-row-span={1}
        style={{ gridColumn: 6, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="Monitor cones"
          dataDcb="atpa-monitor"
          pressed={view.atpa.monitorCones}
          onClick={() => runAuxCell(view, onChange, () => toggleAtpaMonitorCones(view))}
        >
          <span className="dcb-cell-line">MONITOR</span>
          <span className="dcb-cell-line">CONES</span>
          <span className="dcb-cell-line">{view.atpa.monitorCones ? "ENABLED" : "DISABLED"}</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="done"
        data-dcb-row={1}
        data-dcb-column={7}
        data-dcb-row-span={1}
        style={{ gridColumn: 7, gridRow: "1 / span 1" }}
      >
        {renderDone(view, onChange)}
      </div>
    </div>
  );
}

function renderSsaFilter(view: ScopeView, onChange: () => void) {
  const allOn = SSA_FILTER_FIELDS.every((f) => view.ssaFilter[f]);
  return (
    <div className="dcb-main-grid" data-dcb-layout="SSA_FILTER">
      {/* Col 1 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-all"
        data-dcb-row={1}
        data-dcb-column={1}
        data-dcb-row-span={1}
        style={{ gridColumn: 1, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="SSA ALL"
          dataDcb="ssa-all"
          pressed={allOn}
          onClick={() => {
            cancelFilterIfEntering(view);
            const next = !allOn;
            for (const f of SSA_FILTER_FIELDS) {
              view.ssaFilter[f] = next;
            }
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">ALL</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-wx"
        data-dcb-row={2}
        data-dcb-column={1}
        data-dcb-row-span={1}
        style={{ gridColumn: 1, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA WX" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">WX</span>
        </DcbCell>
      </div>

      {/* Col 2 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-time"
        data-dcb-row={1}
        data-dcb-column={2}
        data-dcb-row-span={1}
        style={{ gridColumn: 2, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="SSA TIME"
          dataDcb="ssa-time"
          pressed={view.ssaFilter.TIME}
          onClick={() => {
            cancelFilterIfEntering(view);
            toggleSsaFilter(view, "TIME");
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">TIME</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-altstg"
        data-dcb-row={2}
        data-dcb-column={2}
        data-dcb-row-span={1}
        style={{ gridColumn: 2, gridRow: "2 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="SSA ALTSTG"
          dataDcb="ssa-altstg"
          pressed={view.ssaFilter.ALTSTG}
          onClick={() => {
            cancelFilterIfEntering(view);
            toggleSsaFilter(view, "ALTSTG");
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">ALTSTG</span>
        </DcbCell>
      </div>

      {/* Col 3 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-status"
        data-dcb-row={1}
        data-dcb-column={3}
        data-dcb-row-span={1}
        style={{ gridColumn: 3, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="SSA STATUS"
          dataDcb="ssa-status"
          pressed={view.ssaFilter.STATUS}
          onClick={() => {
            cancelFilterIfEntering(view);
            toggleSsaFilter(view, "STATUS");
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">STATUS</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-plan"
        data-dcb-row={2}
        data-dcb-column={3}
        data-dcb-row-span={1}
        style={{ gridColumn: 3, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA PLAN" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">PLAN</span>
        </DcbCell>
      </div>

      {/* Col 4 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-radar"
        data-dcb-row={1}
        data-dcb-column={4}
        data-dcb-row-span={1}
        style={{ gridColumn: 4, gridRow: "1 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA RADAR" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">RADAR</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-codes"
        data-dcb-row={2}
        data-dcb-column={4}
        data-dcb-row-span={1}
        style={{ gridColumn: 4, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA CODES" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">CODES</span>
        </DcbCell>
      </div>

      {/* Col 5 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-spc"
        data-dcb-row={1}
        data-dcb-column={5}
        data-dcb-row-span={1}
        style={{ gridColumn: 5, gridRow: "1 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA SPC" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">SPC</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-sys-off"
        data-dcb-row={2}
        data-dcb-column={5}
        data-dcb-row-span={1}
        style={{ gridColumn: 5, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA SYS OFF" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">SYS OFF</span>
        </DcbCell>
      </div>

      {/* Col 6 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-range"
        data-dcb-row={1}
        data-dcb-column={6}
        data-dcb-row-span={1}
        style={{ gridColumn: 6, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="SSA RANGE"
          dataDcb="ssa-range"
          pressed={view.ssaFilter.RANGE}
          onClick={() => {
            cancelFilterIfEntering(view);
            toggleSsaFilter(view, "RANGE");
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">RANGE</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-ptl"
        data-dcb-row={2}
        data-dcb-column={6}
        data-dcb-row-span={1}
        style={{ gridColumn: 6, gridRow: "2 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="SSA PTL"
          dataDcb="ssa-ptl"
          pressed={view.ssaFilter.PTL}
          onClick={() => {
            cancelFilterIfEntering(view);
            toggleSsaFilter(view, "PTL");
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">PTL</span>
        </DcbCell>
      </div>

      {/* Col 7 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-filter-line"
        data-dcb-row={1}
        data-dcb-column={7}
        data-dcb-row-span={1}
        style={{ gridColumn: 7, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="SSA ALT FIL"
          dataDcb="ssa-filter-line"
          pressed={view.ssaFilter.FILTER}
          onClick={() => {
            cancelFilterIfEntering(view);
            toggleSsaFilter(view, "FILTER");
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">ALT FIL</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-nas-if"
        data-dcb-row={2}
        data-dcb-column={7}
        data-dcb-row-span={1}
        style={{ gridColumn: 7, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA NAS I/F" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">NAS I/F</span>
        </DcbCell>
      </div>

      {/* Col 8 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-airport"
        data-dcb-row={1}
        data-dcb-column={8}
        data-dcb-row-span={1}
        style={{ gridColumn: 8, gridRow: "1 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA AIRPORT" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">AIRPORT</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-op-mode"
        data-dcb-row={2}
        data-dcb-column={8}
        data-dcb-row-span={1}
        style={{ gridColumn: 8, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA OP MODE" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">OP MODE</span>
        </DcbCell>
      </div>

      {/* Col 9 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-tt"
        data-dcb-row={1}
        data-dcb-column={9}
        data-dcb-row-span={1}
        style={{ gridColumn: 9, gridRow: "1 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA TT" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">TT</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-wx-hist"
        data-dcb-row={2}
        data-dcb-column={9}
        data-dcb-row-span={1}
        style={{ gridColumn: 9, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA WX HIST" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">WX HIST</span>
        </DcbCell>
      </div>

      {/* Col 10 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-ql"
        data-dcb-row={1}
        data-dcb-column={10}
        data-dcb-row-span={1}
        style={{ gridColumn: 10, gridRow: "1 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA QL" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">QL</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-tw-off"
        data-dcb-row={2}
        data-dcb-column={10}
        data-dcb-row-span={1}
        style={{ gridColumn: 10, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA TW OFF" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">TW OFF</span>
        </DcbCell>
      </div>

      {/* Col 11 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-con-cpl"
        data-dcb-row={1}
        data-dcb-column={11}
        data-dcb-row-span={1}
        style={{ gridColumn: 11, gridRow: "1 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA CON/CPL" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">CON/CPL</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-off-ind"
        data-dcb-row={2}
        data-dcb-column={11}
        data-dcb-row-span={1}
        style={{ gridColumn: 11, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="SSA OFF IND" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">OFF IND</span>
        </DcbCell>
      </div>

      {/* Col 12 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="crda"
        data-dcb-row={1}
        data-dcb-column={12}
        data-dcb-row-span={1}
        style={{ gridColumn: 12, gridRow: "1 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="CRDA" dataDcb="crda" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">CRDA</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="ssa-blank"
        data-dcb-row={2}
        data-dcb-column={12}
        data-dcb-row-span={1}
        style={{ gridColumn: 12, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="Disabled" disabled onClick={() => undefined}>
          <span className="dcb-cell-line" />
        </DcbCell>
      </div>

      {/* Col 13 (Full) */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="done"
        data-dcb-row={1}
        data-dcb-column={13}
        data-dcb-row-span={2}
        style={{ gridColumn: 13, gridRow: "1 / span 2" }}
      >
        {renderDone(view, onChange)}
      </div>
    </div>
  );
}

function renderGiSlotCell(view: ScopeView, onChange: () => void, slot: number) {
  const authored = view.giTextLines[slot - 1] ?? "";
  const empty = authored.length === 0;
  return (
    <DcbCell
      key={slot}
      kind={empty ? "disabled" : "toggle"}
      ariaLabel={`GI ${slot}`}
      dataDcb="gi-slot"
      dataGiSlot={slot}
      pressed={!empty && view.giFilterVisible[slot - 1]}
      disabled={empty}
      onClick={() => {
        cancelFilterIfEntering(view);
        toggleGiFilter(view, slot - 1);
        afterCell(onChange);
      }}
    >
      <span className="dcb-cell-line">{`GI ${slot}`}</span>
      {authored ? <span className="dcb-cell-line">{authored}</span> : null}
    </DcbCell>
  );
}

function renderGiFilter(view: ScopeView, onChange: () => void) {
  return (
    <div className="dcb-main-grid" data-dcb-layout="GI_FILTER">
      {/* Col 1 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-main"
        data-dcb-row={1}
        data-dcb-column={1}
        data-dcb-row-span={1}
        style={{ gridColumn: 1, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="GI MAIN"
          dataDcb="gi-main"
          pressed={true}
          onClick={() => undefined}
        >
          <span className="dcb-cell-line">MAIN</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-slot-1"
        data-dcb-row={2}
        data-dcb-column={1}
        data-dcb-row-span={1}
        style={{ gridColumn: 1, gridRow: "2 / span 1" }}
      >
        {renderGiSlotCell(view, onChange, 1)}
      </div>

      {/* Col 2 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-slot-2"
        data-dcb-row={1}
        data-dcb-column={2}
        data-dcb-row-span={1}
        style={{ gridColumn: 2, gridRow: "1 / span 1" }}
      >
        {renderGiSlotCell(view, onChange, 2)}
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-slot-3"
        data-dcb-row={2}
        data-dcb-column={2}
        data-dcb-row-span={1}
        style={{ gridColumn: 2, gridRow: "2 / span 1" }}
      >
        {renderGiSlotCell(view, onChange, 3)}
      </div>

      {/* Col 3 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-slot-4"
        data-dcb-row={1}
        data-dcb-column={3}
        data-dcb-row-span={1}
        style={{ gridColumn: 3, gridRow: "1 / span 1" }}
      >
        {renderGiSlotCell(view, onChange, 4)}
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-slot-5"
        data-dcb-row={2}
        data-dcb-column={3}
        data-dcb-row-span={1}
        style={{ gridColumn: 3, gridRow: "2 / span 1" }}
      >
        {renderGiSlotCell(view, onChange, 5)}
      </div>

      {/* Col 4 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-slot-6"
        data-dcb-row={1}
        data-dcb-column={4}
        data-dcb-row-span={1}
        style={{ gridColumn: 4, gridRow: "1 / span 1" }}
      >
        {renderGiSlotCell(view, onChange, 6)}
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-slot-7"
        data-dcb-row={2}
        data-dcb-column={4}
        data-dcb-row-span={1}
        style={{ gridColumn: 4, gridRow: "2 / span 1" }}
      >
        {renderGiSlotCell(view, onChange, 7)}
      </div>

      {/* Col 5 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-slot-8"
        data-dcb-row={1}
        data-dcb-column={5}
        data-dcb-row-span={1}
        style={{ gridColumn: 5, gridRow: "1 / span 1" }}
      >
        {renderGiSlotCell(view, onChange, 8)}
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-slot-9"
        data-dcb-row={2}
        data-dcb-column={5}
        data-dcb-row-span={1}
        style={{ gridColumn: 5, gridRow: "2 / span 1" }}
      >
        {renderGiSlotCell(view, onChange, 9)}
      </div>

      {/* Col 6 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="gi-slot-10"
        data-dcb-row={1}
        data-dcb-column={6}
        data-dcb-row-span={1}
        style={{ gridColumn: 6, gridRow: "1 / span 1" }}
      >
        {renderGiSlotCell(view, onChange, 10)}
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="done"
        data-dcb-row={2}
        data-dcb-column={6}
        data-dcb-row-span={1}
        style={{ gridColumn: 6, gridRow: "2 / span 1" }}
      >
        {renderDone(view, onChange)}
      </div>
    </div>
  );
}

function renderMaps(view: ScopeView, onChange: () => void) {
  return (
    <div className="dcb-main-grid" data-dcb-layout="MAPS">
      {/* Col 1 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="done"
        data-dcb-row={1}
        data-dcb-column={1}
        data-dcb-row-span={1}
        style={{ gridColumn: 1, gridRow: "1 / span 1" }}
      >
        {renderDone(view, onChange)}
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="clr-all"
        data-dcb-row={2}
        data-dcb-column={1}
        data-dcb-row-span={1}
        style={{ gridColumn: 1, gridRow: "2 / span 1" }}
      >
        <DcbCell
          kind="action"
          ariaLabel="Clear all"
          dataDcb="clr-all"
          onClick={() => {
            cancelFilterIfEntering(view);
            clearAllVideoMaps(view);
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">CLR</span>
          <span className="dcb-cell-line">ALL</span>
        </DcbCell>
      </div>

      {/* Cols 2..17 (Slots 1..32 KDEM, or group submenu 7–38) */}
      {dcbMapsPageSlotNumbers(view).map((slot, i) => {
        const col = Math.floor(i / 2) + 2;
        const row = (i % 2) + 1;
        return (
          <div
            key={slot}
            className="dcb-main-grid-cell"
            data-dcb-layout-id={`map-slot-${slot}`}
            data-dcb-row={row}
            data-dcb-column={col}
            data-dcb-row-span={1}
            style={{ gridColumn: col, gridRow: `${row} / span 1` }}
          >
            {renderMapSlot(view, onChange, slot)}
          </div>
        );
      })}

      {/* Col 18 */}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="geo-maps"
        data-dcb-row={1}
        data-dcb-column={18}
        data-dcb-row-span={1}
        style={{ gridColumn: 18, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="GEO MAPS"
          dataDcb="geo-maps"
          pressed={view.geoMapsListOn}
          onClick={() => {
            cancelFilterIfEntering(view);
            toggleGeoMapsList(view);
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">GEO</span>
          <span className="dcb-cell-line">MAPS</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="current"
        data-dcb-row={2}
        data-dcb-column={18}
        data-dcb-row-span={1}
        style={{ gridColumn: 18, gridRow: "2 / span 1" }}
      >
        <DcbCell
          kind="toggle"
          ariaLabel="CURRENT"
          dataDcb="current"
          pressed={view.currentMapsListOn}
          onClick={() => {
            cancelFilterIfEntering(view);
            toggleCurrentMapsList(view);
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">CURRENT</span>
        </DcbCell>
      </div>
    </div>
  );
}

function renderLdr(view: ScopeView, onChange: () => void, world: DisplayControlBarProps["world"]) {
  return (
    <>
      {renderDone(view, onChange)}
      {DCB_LEADER_DIRS.map((dir) => (
        <DcbCell
          key={dir}
          kind="action"
          ariaLabel={`Leader L${dir}`}
          pressed={dcbLeaderDirReadout(view, world) === `L${dir}`}
          onClick={() => {
            cancelFilterIfEntering(view);
            if (world) {
              applyDcbLeaderDir(view, world, dir);
            }
            closeDcbMenu(view);
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">{`L${dir}`}</span>
        </DcbCell>
      ))}
    </>
  );
}

export const CHAR_SIZE_DCB_LAYOUT: {
  id: string;
  column: number;
  cell: DcbSpinnerCell;
  channel: CharSizeChannel;
  dataDcb: NonNullable<DcbCellProps["dataDcb"]>;
  ariaLabel: string;
  line1: string;
  line2: string;
}[] = [
  {
    cell: "CHAR_DATA_BLOCKS",
    channel: "dataBlocks",
    dataDcb: "char-data-blocks",
    ariaLabel: "Data blocks character size",
    line1: "DATA",
    line2: "BLOCKS",
    id: "char-data-blocks",
    column: 1,
  },
  {
    cell: "CHAR_LISTS",
    channel: "lists",
    dataDcb: "char-lists",
    ariaLabel: "Lists character size",
    line1: "LISTS",
    line2: "",
    id: "char-lists",
    column: 2,
  },
  {
    cell: "CHAR_DCB",
    channel: "dcb",
    dataDcb: "char-dcb",
    ariaLabel: "DCB character size",
    line1: "DCB",
    line2: "",
    id: "char-dcb",
    column: 3,
  },
  {
    cell: "CHAR_TOOLS",
    channel: "tools",
    dataDcb: "char-tools",
    ariaLabel: "Tools character size",
    line1: "TOOLS",
    line2: "",
    id: "char-tools",
    column: 4,
  },
  {
    cell: "CHAR_POS",
    channel: "pos",
    dataDcb: "char-pos",
    ariaLabel: "Position symbol size",
    line1: "POS",
    line2: "",
    id: "char-pos",
    column: 5,
  },
];

function renderCharSize(view: ScopeView, onChange: () => void) {
  return (
    <div className="dcb-main-grid" data-dcb-layout="CHAR_SIZE">
      {CHAR_SIZE_DCB_LAYOUT.map((item) => {
        const armed = spinnerArmed(view, item.cell);
        const size =
          item.channel === "dcb"
            ? view.charSizes.dcb
            : item.channel === "pos"
              ? view.charSizes.pos
              : view.charSizes[item.channel as keyof CharSizes];
        return (
          <div
            key={item.id}
            className="dcb-main-grid-cell"
            data-dcb-layout-id={item.id}
            data-dcb-row={1}
            data-dcb-column={item.column}
            data-dcb-row-span={1}
            style={{ gridColumn: item.column, gridRow: "1 / span 1" }}
          >
            <DcbCell
              kind="spinner"
              ariaLabel={item.ariaLabel}
              dataDcb={item.dataDcb}
              pressed={armed}
              onClick={() => toggleSpinner(view, onChange, item.cell)}
              onWheel={(event) =>
                onSpinnerWheel(
                  view,
                  item.cell,
                  event,
                  (step) => stepCharSizeChannel(view, item.channel, step),
                  onChange,
                )
              }
              onDragDelta={(step) => {
                for (let i = 0; i < Math.abs(step); i++) {
                  stepCharSizeChannel(view, item.channel, step > 0 ? 1 : -1);
                }
                afterCell(onChange);
              }}
            >
              <span className="dcb-cell-line">{item.line1}</span>
              {item.line2 ? <span className="dcb-cell-line">{item.line2}</span> : null}
              <span className="dcb-cell-line">{formatDcbCharReadout(size)}</span>
            </DcbCell>
          </div>
        );
      })}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="done"
        data-dcb-row={1}
        data-dcb-column={6}
        data-dcb-row-span={1}
        style={{ gridColumn: 6, gridRow: "1 / span 1" }}
      >
        {renderDone(view, onChange)}
      </div>
    </div>
  );
}

export const BRITE_GRID_LAYOUT: {
  id: string;
  col: number;
  row: 1 | 2;
  rowSpan: 1 | 2;
  channel?: BriteChannel;
  label: string;
  disabled?: boolean;
  staticVal?: string;
}[] = [
  { id: "dcb", col: 1, row: 1, rowSpan: 1, channel: "dcb", label: "DCB" },
  { id: "bkc", col: 1, row: 2, rowSpan: 1, label: "BKC", disabled: true, staticVal: "100" },
  { id: "mpa", col: 2, row: 1, rowSpan: 1, channel: "mpa", label: "MPA" },
  { id: "mpb", col: 2, row: 2, rowSpan: 1, channel: "mpb", label: "MPB" },
  { id: "fdb", col: 3, row: 1, rowSpan: 1, channel: "fdb", label: "FDB" },
  { id: "lst", col: 3, row: 2, rowSpan: 1, channel: "lst", label: "LST" },
  { id: "pos", col: 4, row: 1, rowSpan: 1, channel: "pos", label: "POS" },
  { id: "ldb", col: 4, row: 2, rowSpan: 1, channel: "ldb", label: "LDB" },
  { id: "oth", col: 5, row: 1, rowSpan: 1, channel: "oth", label: "OTH" },
  { id: "tls", col: 5, row: 2, rowSpan: 1, channel: "tls", label: "TLS" },
  { id: "rr", col: 6, row: 1, rowSpan: 1, channel: "rr", label: "RR" },
  { id: "cmp", col: 6, row: 2, rowSpan: 1, label: "CMP", disabled: true, staticVal: "45" },
  { id: "bcn", col: 7, row: 1, rowSpan: 1, label: "BCN", disabled: true, staticVal: "55" },
  { id: "pri", col: 7, row: 2, rowSpan: 1, channel: "pri", label: "PRI" },
  { id: "hst", col: 8, row: 1, rowSpan: 1, channel: "hst", label: "HST" },
  { id: "wx", col: 8, row: 2, rowSpan: 1, label: "WX", disabled: true, staticVal: "100" },
  { id: "wxc", col: 9, row: 1, rowSpan: 1, label: "WXC", disabled: true, staticVal: "100" },
  { id: "blank1", col: 9, row: 2, rowSpan: 1, label: "", disabled: true },
  { id: "done", col: 10, row: 1, rowSpan: 2, label: "DONE" },
];

function renderBrite(view: ScopeView, onChange: () => void) {
  return (
    <div className="dcb-main-grid" data-dcb-layout="BRITE">
      {BRITE_GRID_LAYOUT.map((cell) => {
        let node: ReactNode;
        if (cell.id === "done") {
          node = renderDone(view, onChange);
        } else if (cell.channel) {
          const spinnerKey = `BRITE_${cell.channel.toUpperCase()}` as DcbSpinnerCell;
          const armed = spinnerArmed(view, spinnerKey);
          node = (
            <DcbCell
              key={cell.id}
              kind="spinner"
              ariaLabel={cell.label}
              dataDcb={`brite-${cell.channel}` as NonNullable<DcbCellProps["dataDcb"]>}
              pressed={armed}
              onClick={() => toggleSpinner(view, onChange, spinnerKey)}
              onWheel={(event) =>
                onSpinnerWheel(
                  view,
                  spinnerKey,
                  event,
                  (step) => stepBriteChannel(view, cell.channel!, step),
                  onChange,
                )
              }
              onDragDelta={(step) => {
                for (let i = 0; i < Math.abs(step); i++) {
                  stepBriteChannel(view, cell.channel!, step > 0 ? 1 : -1);
                }
                afterCell(onChange);
              }}
            >
              <span className="dcb-cell-line">{cell.label}</span>
              <span className="dcb-cell-line">
                {formatDcbBriteReadout(view.brite[cell.channel])}
              </span>
            </DcbCell>
          );
        } else {
          node = (
            <DcbCell
              key={cell.id}
              kind="disabled"
              ariaLabel={cell.label || "Disabled"}
              dataDcb={
                cell.id.startsWith("blank")
                  ? undefined
                  : (`brite-${cell.id}` as NonNullable<DcbCellProps["dataDcb"]>)
              }
              disabled
              onClick={() => undefined}
            >
              <span className="dcb-cell-line">{cell.label}</span>
              {cell.staticVal ? <span className="dcb-cell-line">{cell.staticVal}</span> : null}
            </DcbCell>
          );
        }

        return (
          <div
            key={cell.id}
            className="dcb-main-grid-cell"
            data-dcb-layout-id={cell.id}
            data-dcb-row={cell.row}
            data-dcb-column={cell.col}
            data-dcb-row-span={cell.rowSpan}
            style={{
              gridColumn: cell.col,
              gridRow: `${cell.row} / span ${cell.rowSpan}`,
            }}
          >
            {node}
          </div>
        );
      })}
    </div>
  );
}

function prefStore() {
  return browserDcbPrefStorage() ?? undefined;
}

function renderPref(view: ScopeView, onChange: () => void) {
  return (
    <div className="dcb-main-grid" data-dcb-layout="PREF">
      {Array.from({ length: 16 }, (_, colIdx) => {
        const col = colIdx + 1;
        const slot1 = colIdx * 2 + 1;
        const slot2 = colIdx * 2 + 2;
        const name1 = view.dcbPref.slots[slot1 - 1]?.name ?? "";
        const name2 = view.dcbPref.slots[slot2 - 1]?.name ?? "";
        return [
          <div
            key={slot1}
            className="dcb-main-grid-cell"
            data-dcb-layout-id={`pref-slot-${slot1}`}
            data-dcb-row={1}
            data-dcb-column={col}
            data-dcb-row-span={1}
            style={{ gridColumn: col, gridRow: "1 / span 1" }}
          >
            <DcbCell
              kind="toggle"
              ariaLabel={`Pref ${slot1}`}
              dataDcb={`pref-${slot1}` as NonNullable<DcbCellProps["dataDcb"]>}
              pressed={view.dcbPref.activeIndex === slot1 - 1}
              onClick={() => {
                cancelFilterIfEntering(view);
                selectDcbPrefSlot(view, slot1 - 1);
                persistDcbPref(view, prefStore());
                afterCell(onChange);
              }}
            >
              <span className="dcb-cell-line">{`${slot1}`}</span>
              {name1 ? <span className="dcb-cell-line">{name1}</span> : null}
            </DcbCell>
          </div>,
          <div
            key={slot2}
            className="dcb-main-grid-cell"
            data-dcb-layout-id={`pref-slot-${slot2}`}
            data-dcb-row={2}
            data-dcb-column={col}
            data-dcb-row-span={1}
            style={{ gridColumn: col, gridRow: "2 / span 1" }}
          >
            <DcbCell
              kind="toggle"
              ariaLabel={`Pref ${slot2}`}
              dataDcb={`pref-${slot2}` as NonNullable<DcbCellProps["dataDcb"]>}
              pressed={view.dcbPref.activeIndex === slot2 - 1}
              onClick={() => {
                cancelFilterIfEntering(view);
                selectDcbPrefSlot(view, slot2 - 1);
                persistDcbPref(view, prefStore());
                afterCell(onChange);
              }}
            >
              <span className="dcb-cell-line">{`${slot2}`}</span>
              {name2 ? <span className="dcb-cell-line">{name2}</span> : null}
            </DcbCell>
          </div>,
        ];
      })}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="pref-default"
        data-dcb-row={1}
        data-dcb-column={17}
        data-dcb-row-span={1}
        style={{ gridColumn: 17, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="action"
          ariaLabel="Default"
          dataDcb="pref-default"
          onClick={() => {
            cancelFilterIfEntering(view);
            applyDcbPrefDefaults(view);
            persistDcbPref(view, prefStore());
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">DEFAULT</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="pref-fsstars"
        data-dcb-row={2}
        data-dcb-column={17}
        data-dcb-row-span={1}
        style={{ gridColumn: 17, gridRow: "2 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="FSSTARS" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">FSSTARS</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="pref-restore"
        data-dcb-row={1}
        data-dcb-column={18}
        data-dcb-row-span={1}
        style={{ gridColumn: 18, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="action"
          ariaLabel="Restore"
          dataDcb="pref-restore"
          onClick={() => {
            cancelFilterIfEntering(view);
            restoreDcbPrefSession(view);
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">RESTORE</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="pref-save"
        data-dcb-row={2}
        data-dcb-column={18}
        data-dcb-row-span={1}
        style={{ gridColumn: 18, gridRow: "2 / span 1" }}
      >
        <DcbCell
          kind="action"
          ariaLabel="Save"
          dataDcb="pref-save"
          onClick={() => {
            cancelFilterIfEntering(view);
            saveDcbPref(view, prefStore());
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">SAVE</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="pref-chg-pin"
        data-dcb-row={1}
        data-dcb-column={19}
        data-dcb-row-span={1}
        style={{ gridColumn: 19, gridRow: "1 / span 1" }}
      >
        <DcbCell kind="disabled" ariaLabel="Change PIN" disabled onClick={() => undefined}>
          <span className="dcb-cell-line">CHG PIN</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="pref-save-as"
        data-dcb-row={2}
        data-dcb-column={19}
        data-dcb-row-span={1}
        style={{ gridColumn: 19, gridRow: "2 / span 1" }}
      >
        <DcbCell
          kind="action"
          ariaLabel="Save as"
          dataDcb="pref-save-as"
          onClick={() => {
            cancelFilterIfEntering(view);
            saveAsDcbPref(view, prefStore());
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">SAVE</span>
          <span className="dcb-cell-line">AS</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="pref-delete"
        data-dcb-row={1}
        data-dcb-column={20}
        data-dcb-row-span={1}
        style={{ gridColumn: 20, gridRow: "1 / span 1" }}
      >
        <DcbCell
          kind="action"
          ariaLabel="Delete"
          dataDcb="pref-delete"
          onClick={() => {
            cancelFilterIfEntering(view);
            deleteDcbPref(view, prefStore());
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">DELETE</span>
        </DcbCell>
      </div>
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="done"
        data-dcb-row={2}
        data-dcb-column={20}
        data-dcb-row-span={1}
        style={{ gridColumn: 20, gridRow: "2 / span 1" }}
      >
        {renderDone(view, onChange)}
      </div>
    </div>
  );
}

export function DisplayControlBar({ view, onChange, world }: DisplayControlBarProps) {
  const dcbRef = useRef<HTMLDivElement>(null);
  const trap = useDcbCursorTrap(view, dcbRef);
  const dcbPx = view.charSizes.dcb;
  const dcbText = applyBrite(PALETTE.dcbText, view.brite.dcb);
  const dcbFill = applyBrite(PALETTE.dcbCap, view.brite.dcb);
  const dcbDisabledText = applyBrite(PALETTE.dcbDisabledText, view.brite.dcb);
  const dcbHighlight = applyBrite(PALETTE.dcbHighlight, view.brite.dcb);
  const menu = view.dcbMenu;
  const vertical = isVerticalDcbDock(view.dcbDock);

  const typedBuffer = useRef<string>("");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!view.dcbSpinner.armed || !view.dcbSpinner.cell) {
        typedBuffer.current = "";
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        e.stopPropagation();
        typedBuffer.current += e.key;
        if (view.dcbSpinner.cell === "LDR_DIR") {
          const val = Number(typedBuffer.current);
          if (isLeaderDir(val)) {
            view.defaultLeaderDir = val;
            commitDcbSpinner(view);
            typedBuffer.current = "";
            afterCell(onChange);
          }
        }
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        typedBuffer.current = typedBuffer.current.slice(0, -1);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const num = Number(typedBuffer.current);
        if (Number.isFinite(num) && typedBuffer.current.length > 0) {
          applyDirectNumericInput(view, view.dcbSpinner.cell, num);
        }
        commitDcbSpinner(view);
        typedBuffer.current = "";
        afterCell(onChange);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelDcbSpinner(view);
        typedBuffer.current = "";
        afterCell(onChange);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [view, onChange]);

  return (
    <div
      ref={dcbRef}
      id={DCB_ID}
      className={vertical ? "dcb dcb-vertical" : "dcb"}
      role="group"
      aria-label="Display control bar"
      data-dcb-menu={menu}
      data-dcb-cursor-trap={trap.kind}
      data-dcb-dock={view.dcbDock}
      style={{
        height: vertical ? undefined : DCB_HEIGHT_PX,
        width: vertical ? DCB_HEIGHT_PX : undefined,
        fontFamily: SCOPE_FONT_STACK,
        fontSize: dcbPx,
        backgroundColor: PALETTE.background,
        color: dcbText,
        ["--dcb-cap" as string]: dcbFill,
        ["--dcb-cell" as string]: dcbFill,
        ["--dcb-text" as string]: dcbText,
        ["--dcb-disabled-text" as string]: dcbDisabledText,
        ["--dcb-highlight" as string]: dcbHighlight,
        ["--dcb-shadow" as string]: PALETTE.dcbShadow,
        ["--dcb-gutter" as string]: PALETTE.background,
        ["--dcb-pressed" as string]: applyBrite(PALETTE.dcbPressed, view.brite.dcb),
        ["--dcb-pressed-text" as string]: applyBrite(PALETTE.dcbPressedText, view.brite.dcb),
        ["--dcb-pressed-shadow" as string]: PALETTE.dcbShadow,
        ["--dcb-pressed-highlight" as string]: dcbHighlight,
      }}
    >
      {menu === "AUX"
        ? renderAux(view, onChange)
        : menu === "MAPS"
          ? renderMaps(view, onChange)
          : menu === "LDR"
            ? renderLdr(view, onChange, world)
            : menu === "TPA_ATPA"
              ? renderTpaAtpa(view, onChange)
              : menu === "CHAR_SIZE"
                ? renderCharSize(view, onChange)
                : menu === "BRITE"
                  ? renderBrite(view, onChange)
                  : menu === "SSA_FILTER"
                    ? renderSsaFilter(view, onChange)
                    : menu === "GI_FILTER"
                      ? renderGiFilter(view, onChange)
                      : menu === "PREF"
                        ? renderPref(view, onChange)
                        : renderPhysicalMain(view, onChange, world)}
      {trap.cursor ? (
        <div
          className="dcb-trapped-cursor"
          style={{ left: trap.cursor.x, top: trap.cursor.y }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
