/**
 * Analog: CRC STARS DCB cell chrome (R07). Trainer delta: dark-olive caps with
 * CSS bevels. Clicks call the same `src/scope` functions as the keyboard.
 * Never a Command, readback, or intent.
 */

import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, ReactNode, WheelEvent } from "react";
import {
  applyDcbLeaderDir,
  applyDcbShift,
  armDcbSpinner,
  beginDcbPrefSession,
  cancelFilterEntry,
  closeDcbMenu,
  commitDcbSpinner,
  dcbActionCapPressed,
  dcbLeaderDirReadout,
  DCB_ACTION_FLASH_MS,
  HISTORY_DOT_COUNTS,
  LEADER_LENGTH_STEPS_PX,
  PTL_MINUTE_PRESETS,
  RANGE_PRESETS_NM,
  RR_INTERVALS_NM,
  SSA_FILTER_FIELDS,
  TPA_RADIUS_NM,
  activeDcbPrefName,
  formatDcbBriteReadout,
  formatDcbCharReadout,
  formatDcbHistoryReadout,
  formatDcbLdrLengthReadout,
  formatDcbMapLabel,
  formatDcbPrefReadout,
  formatDcbPtlMinutesReadout,
  formatDcbRrReadout,
  formatDcbSiteLabel,
  formatDcbTpaMiReadout,
  formatFilterBand,
  hideMapLists,
  isDcbMapSlotEnabled,
  isLeaderDir,
  isRangeRingOffViewCenter,
  isVideoMapOn,
  isViewOffAirport,
  openDcbMenu,
  setHistoryDotCount,
  snapBriteLevel,
  toggleVideoMap,
  toggleWxLevel,
  videoMapByDcbNumber,
  effectiveSurveillanceMode,
  setSurveillanceMode,
  siteDcbChoices,
  surveillanceModeWord,
  surveillanceModesEqual,
  type BriteChannel,
  type DcbSpinnerCell,
  type LeaderLengthPx,
  type PtlMinutes,
  type RangeNm,
  type RrIntervalNm,
  type ScopeView,
  type SsaFilterField,
} from "@scope";
import type { DcbCellKind } from "./dcbLayouts";
import { focusPpi } from "../strips/FlightStrips";

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
export const DCB_SITE_READOUT_ID = "dcb-site-readout";
export const DCB_RNG_READOUT_ID = DCB_RANGE_READOUT_ID;

export function liveSiteMode(view: ScopeView) {
  return effectiveSurveillanceMode(view.surveillanceMode, view.radarSites);
}

export function liveSiteLabel(view: ScopeView): string {
  return formatDcbSiteLabel(liveSiteMode(view));
}

export interface DisplayControlBarProps {
  view: ScopeView;
  onChange: () => void;
  world?: Parameters<typeof applyDcbLeaderDir>[1];
}

function preventButtonFocus(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

export function afterCell(onChange: () => void): void {
  onChange();
  focusPpi();
}

export function cancelFilterIfEntering(view: ScopeView): void {
  if (view.filterEntry.phase !== "idle") {
    cancelFilterEntry(view.filterEntry, view.altitudeFilter);
  }
}

export function setPressed(el: Element | null, pressed: boolean): void {
  if (!(el instanceof HTMLElement)) {
    return;
  }
  if (
    el.getAttribute("data-dcb-flashing") === "true" ||
    el.getAttribute("data-dcb-pointer-down") === "true"
  ) {
    return;
  }
  el.setAttribute("aria-pressed", pressed ? "true" : "false");
}

export function setText(id: string, text: string): void {
  const el = globalThis.document?.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

export function spinnerArmed(view: ScopeView, cell: DcbSpinnerCell): boolean {
  return view.dcbSpinner.armed && view.dcbSpinner.cell === cell;
}

export function toggleSpinner(view: ScopeView, onChange: () => void, cell: DcbSpinnerCell): void {
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

export function applyDirectNumericInput(view: ScopeView, cell: DcbSpinnerCell, num: number): void {
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

export function onSpinnerWheel(
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

export function historySpinnerArmed(view: ScopeView): boolean {
  return view.dcbSpinner.armed && view.dcbSpinner.cell === "HISTORY";
}

export function ptlSpinnerArmed(view: ScopeView): boolean {
  return view.dcbSpinner.armed && view.dcbSpinner.cell === "PTL";
}

export function ssaFilterCellId(field: SsaFilterField): NonNullable<DcbCellProps["dataDcb"]> {
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

export function tpaMiSpinnerArmed(view: ScopeView): boolean {
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
  setPressed(doc.querySelector('[data-dcb-cell="site-fused"]'), view.dcbMenu === "SITE");
  setPressed(
    doc.querySelector('[data-dcb-cell="site-mode-fused"]'),
    surveillanceModesEqual(liveSiteMode(view), "FUSED"),
  );
  setPressed(
    doc.querySelector('[data-dcb-cell="site-multi"]'),
    surveillanceModesEqual(liveSiteMode(view), "MULTI"),
  );
  const siteWord = surveillanceModeWord(liveSiteMode(view));
  setText(DCB_SITE_READOUT_ID, siteWord);
  for (const el of doc.querySelectorAll("[data-dcb-site-id]")) {
    const siteId = el.getAttribute("data-dcb-site-id");
    if (siteId) {
      setPressed(el, surveillanceModesEqual(liveSiteMode(view), { siteId }));
    }
  }
  for (let i = 0; i < 6; i += 1) {
    setPressed(doc.querySelector(`[data-dcb-cell="wx${i + 1}"]`), view.wxLevels[i] === true);
  }
}

export interface DcbCellProps {
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
    | "wx5"
    | "wx6"
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
    | "site-fused"
    | "site-mode-fused"
    | "site-multi"
    | "site-choice"
    | "pref"
    | "mode-fsl"
    | `pref-${number}`
    | "pref-default"
    | "pref-restore"
    | "pref-save"
    | "pref-save-as"
    | "pref-delete";
  dataMapId?: string;
  dataMapSlot?: number;
  dataGiSlot?: number;
  dataSiteId?: string;
}

export function DcbCell({
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
  dataSiteId,
}: DcbCellProps) {
  const inert = disabled || kind === "disabled";
  const [flashing, setFlashing] = useState(false);
  const [pointerDown, setPointerDown] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerPressed = useRef(false);
  const isDragging = useRef(false);
  const dragStartY = useRef<number | null>(null);
  const accumulatedDy = useRef(0);
  const momentary = kind !== "toggle" && kind !== "disabled";
  const inset = dcbActionCapPressed(pressed, momentary && (pointerDown || flashing));

  useEffect(() => {
    return () => {
      if (flashTimer.current != null) {
        clearTimeout(flashTimer.current);
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
    if (!pointerPressed.current) {
      armActionFlash();
      releaseActionFlash();
    }
    pointerPressed.current = false;
    onClick();
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
      data-dcb-site-id={dataSiteId}
      data-dcb-ptl={dataDcb === "ptl" ? "" : undefined}
      data-dcb-hist={dataDcb === "hist" ? "" : undefined}
      data-dcb-cell={dataDcb}
      data-dcb-pointer-down={pointerDown ? "true" : undefined}
      data-dcb-flashing={flashing ? "true" : undefined}
      onMouseDown={preventButtonFocus}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        pointerPressed.current = true;
        setPointerDown(true);
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
        setPointerDown(false);
        if (isDragging.current) {
          isDragging.current = false;
          dragStartY.current = null;
          accumulatedDy.current = 0;
        }
        try {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        } catch {
          // ignore
        }
      }}
      onPointerCancel={() => {
        pointerPressed.current = false;
        setPointerDown(false);
        isDragging.current = false;
        dragStartY.current = null;
        accumulatedDy.current = 0;
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

export function mapSlotClick(view: ScopeView, onChange: () => void, slot: number): void {
  const map = videoMapByDcbNumber(view, slot);
  if (!map || !isDcbMapSlotEnabled(view, slot)) {
    return;
  }
  cancelFilterIfEntering(view);
  toggleVideoMap(view, map.id);
  afterCell(onChange);
}

export function renderMapSlot(view: ScopeView, onChange: () => void, slot: number) {
  const map = videoMapByDcbNumber(view, slot);
  const enabled = isDcbMapSlotEnabled(view, slot);
  const identity =
    map === undefined
      ? String(slot)
      : map.starsId !== undefined
        ? String(map.starsId)
        : String(map.dcbNumber ?? slot);
  const label = map?.dcbLabel ?? "";
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
      <span className="dcb-cell-line">{label}</span>
    </DcbCell>
  );
}

export function renderPrefOpener(view: ScopeView, onChange: () => void) {
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

export function renderSiteOpener(view: ScopeView, onChange: () => void) {
  const label = liveSiteLabel(view);
  const word = surveillanceModeWord(liveSiteMode(view));
  return (
    <DcbCell
      kind="submenu"
      ariaLabel={label}
      dataDcb="site-fused"
      pressed={view.dcbMenu === "SITE"}
      onClick={() => {
        cancelFilterIfEntering(view);
        openDcbMenu(view, "SITE");
        afterCell(onChange);
      }}
    >
      <span className="dcb-cell-line">SITE</span>
      <span id={DCB_SITE_READOUT_ID} className="dcb-cell-line">
        {word}
      </span>
    </DcbCell>
  );
}

export function siteChoiceDataDcb(
  mode: ReturnType<typeof liveSiteMode>,
): "site-mode-fused" | "site-multi" | "site-choice" {
  if (mode === "FUSED") {
    return "site-mode-fused";
  }
  if (mode === "MULTI") {
    return "site-multi";
  }
  return "site-choice";
}

export function renderSite(view: ScopeView, onChange: () => void) {
  const selected = liveSiteMode(view);
  const choices = siteDcbChoices(view.radarSites);
  return (
    <div className="dcb-main-grid" data-dcb-layout="SITE">
      {/*
        R07 CRC SITE is disabled in its FUSION-only analog. This trainer
        lifts FUSED / MULTI / one cap per adapted radarSites row (R05 FOA
        display data). Empty catalog hides MULTI and site-specific caps.
        Network health is not live sensors. Clicks bind T02-75 sampler mode.
      */}
      {choices.map((mode, index) => {
        const word = surveillanceModeWord(mode);
        const siteId = typeof mode === "object" ? mode.siteId : undefined;
        const dataDcb = siteChoiceDataDcb(mode);
        return (
          <div
            key={word}
            className="dcb-main-grid-cell"
            data-dcb-layout-id={dataDcb === "site-choice" ? `site-${word}` : dataDcb}
            data-dcb-row={1}
            data-dcb-column={index + 1}
            data-dcb-row-span={2}
            style={{ gridColumn: index + 1, gridRow: "1 / span 2" }}
          >
            <DcbCell
              kind="toggle"
              ariaLabel={word}
              dataDcb={dataDcb}
              dataSiteId={siteId}
              pressed={surveillanceModesEqual(selected, mode)}
              onClick={() => {
                cancelFilterIfEntering(view);
                setSurveillanceMode(view, mode);
                afterCell(onChange);
              }}
            >
              <span className="dcb-cell-line">{word}</span>
            </DcbCell>
          </div>
        );
      })}
      <div
        className="dcb-main-grid-cell"
        data-dcb-layout-id="done"
        data-dcb-row={1}
        data-dcb-column={choices.length + 1}
        data-dcb-row-span={2}
        style={{ gridColumn: choices.length + 1, gridRow: "1 / span 2" }}
      >
        {renderDone(view, onChange)}
      </div>
    </div>
  );
}

export function renderWxCell(view: ScopeView, onChange: () => void, n: 1 | 2 | 3 | 4 | 5 | 6) {
  return (
    <DcbCell
      key={n}
      kind="toggle"
      ariaLabel={`WX${n}`}
      dataDcb={`wx${n}`}
      pressed={view.wxLevels[n - 1] === true}
      onClick={() => runCell(view, onChange, () => toggleWxLevel(view, n))}
    >
      <span className="dcb-cell-line">{`WX${n}`}</span>
    </DcbCell>
  );
}

export function runCell(view: ScopeView, onChange: () => void, fn: () => void): void {
  cancelFilterIfEntering(view);
  closeDcbMenu(view);
  commitDcbSpinner(view);
  fn();
  afterCell(onChange);
}

export function runAuxCell(view: ScopeView, onChange: () => void, fn: () => void): void {
  cancelFilterIfEntering(view);
  fn();
  afterCell(onChange);
}

export function clickDone(view: ScopeView, onChange: () => void): void {
  cancelFilterIfEntering(view);
  hideMapLists(view);
  closeDcbMenu(view);
  afterCell(onChange);
}

export function renderDone(view: ScopeView, onChange: () => void) {
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

export function renderShift(view: ScopeView, onChange: () => void) {
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
