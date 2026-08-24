/**
 * Analog: CRC STARS DCB RANGE / PLACE CNTR / OFF CNTR / RR / PLACE RR / RR CNTR /
 * LDR DIR / LDR / MAPS / WX / CHAR SIZE / BRITE / AUX HISTORY / PTL / DCB position (R07).
 * Trainer delta: separated dark-olive physical caps with CSS bevels; SHIFT swaps MAIN and AUX.
 * MAPS / TPA-ATPA / CHAR SIZE / BRITE / SSA FILTER / GI TEXT / PREF submenus replace the
 * bar; DONE / Esc return to MAIN. RANGE / RR / LDR DIR / LDR length are spinners
 * (arm, wheel steps frozen presets, second click / Esc commits). CHAR SIZE and
 * BRITE open submenus (`CHAR_SIZE` / `BRITE`) with per-channel spinners. AUX: VOL
 * disabled, HISTORY spinner 0–5, DCB TOP/LEFT/RIGHT/BOTTOM, PTL length spinner,
 * PTL OWN, PTL ALL, TPA/ATPA submenu (J-rings + ATPA stub). FILTER (altitude)
 * stays on MAIN. SSA FILTER hides existing SSA lines; GI TEXT toggles authored
 * facility lines (not METAR HTTP). HIST/PTL cells live on AUX (F7/F8 still work).
 * MAIN quick video maps 1–6; MAPS submenu slots 1–30 (empty slots disabled).
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
  cancelFilterEntry,
  centerOnAirport,
  closeDcbMenu,
  commitDcbSpinner,
  dcbLeaderDirReadout,
  DCB_LEADER_DIRS,
  DCB_MAP_SLOT_COUNT,
  DCB_QUICK_MAP_COUNT,
  DCB_ACTION_FLASH_MS,
  dcbActionCapPressed,
  GI_SLOT_COUNT,
  SSA_FILTER_FIELDS,
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
  setDcbDock,
  stepBriteChannel,
  stepCharSizeChannel,
  stepDcbLeaderDir,
  stepDcbLeaderLength,
  stepDcbSpinner,
  stepHistoryDots,
  stepPtlLength,
  stepRange,
  stepRrInterval,
  stepTpaRadius,
  toggleAtpaOn,
  toggleCurrentMapsList,
  toggleGeoMapsList,
  toggleGiFilter,
  togglePtlOn,
  togglePtlOwn,
  toggleSsaFilter,
  toggleTpaOn,
  toggleVideoMap,
  videoMapByDcbNumber,
  type BriteChannel,
  type CharSizeChannel,
  type DcbCellKind,
  type DcbSpinnerCell,
  type ScopeView,
  type SsaFilterField,
} from "@scope";
import { focusPpi } from "./FlightStrips";

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

function onSpinnerWheel(
  view: ScopeView,
  cell: DcbSpinnerCell,
  event: WheelEvent<HTMLButtonElement>,
  apply: (delta: -1 | 1) => void,
  onChange: () => void,
): void {
  if (!spinnerArmed(view, cell)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const delta: -1 | 1 = event.deltaY < 0 ? -1 : 1;
  stepDcbSpinner(view, delta, apply);
  onChange();
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

function ssaFilterLines(field: SsaFilterField): { line1: string; line2: string } {
  if (field === "OFF_CNTR") {
    return { line1: "OFF", line2: "CNTR" };
  }
  return { line1: field, line2: "" };
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
}

interface DcbCellProps {
  ariaLabel: string;
  children: ReactNode;
  kind?: DcbCellKind;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onWheel?: (event: WheelEvent<HTMLButtonElement>) => void;
  dataDcb?:
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
    | "ssa-time"
    | "ssa-altstg"
    | "ssa-filter-line"
    | "ssa-range"
    | "ssa-off-cntr"
    | "ssa-status"
    | "ssa-ptl"
    | "crda"
    | "gi-slot"
    | "tpa-on"
    | "tpa-mi"
    | "atpa"
    | "atpa-cones"
    | "atpa-monitor"
    | "atpa-alert"
    | "pref"
    | "pref-1"
    | "pref-2"
    | "pref-3"
    | "pref-4"
    | "pref-5"
    | "pref-6"
    | "pref-7"
    | "pref-8"
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
  dataDcb,
  dataMapId,
  dataMapSlot,
  dataGiSlot,
}: DcbCellProps) {
  const inert = disabled || kind === "disabled";
  const [flashing, setFlashing] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        if (event.currentTarget.setPointerCapture) {
          if (momentary) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }
        armActionFlash();
      }}
      onPointerUp={releaseActionFlash}
      onPointerCancel={() => {
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
      <span className="dcb-cell-line">{slot}</span>
      <span className="dcb-cell-line">{map?.dcbLabel ?? ""}</span>
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
    <>
      {renderShift(view, onChange)}
      <DcbCell kind="disabled" ariaLabel="Volume" dataDcb="vol" disabled onClick={() => undefined}>
        <span className="dcb-cell-line">VOL</span>
      </DcbCell>
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
        onWheel={(event) => {
          if (!historySpinnerArmed(view)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const delta: -1 | 1 = event.deltaY < 0 ? -1 : 1;
          stepDcbSpinner(view, delta, (step) => stepHistoryDots(view, step));
          onChange();
        }}
      >
        <span className="dcb-cell-line">HISTORY</span>
        <span id={DCB_HISTORY_READOUT_ID} className="dcb-cell-line">
          {formatDcbHistoryReadout(view.historyDotCount)}
        </span>
      </DcbCell>
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
        onWheel={(event) => {
          if (!ptlSpinnerArmed(view)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const delta: -1 | 1 = event.deltaY < 0 ? -1 : 1;
          stepDcbSpinner(view, delta, (step) => stepPtlLength(view, step));
          onChange();
        }}
      >
        <span className="dcb-cell-line">PTL</span>
        <span id={DCB_PTL_MINUTES_READOUT_ID} className="dcb-cell-line">
          {formatDcbPtlMinutesReadout(view.ptlMinutes)}
        </span>
      </DcbCell>
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
        <span className="dcb-cell-line">TPA</span>
        <span className="dcb-cell-line">ATPA</span>
      </DcbCell>
    </>
  );
}

function renderTpaAtpa(view: ScopeView, onChange: () => void) {
  const miArmed = tpaMiSpinnerArmed(view);
  return (
    <>
      {renderDone(view, onChange)}
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
      <DcbCell
        kind="spinner"
        ariaLabel="TPA mileage"
        dataDcb="tpa-mi"
        pressed={miArmed}
        onClick={() => {
          cancelFilterIfEntering(view);
          if (miArmed) {
            commitDcbSpinner(view);
          } else {
            armDcbSpinner(view, "TPA_MI");
          }
          afterCell(onChange);
        }}
        onWheel={(event) =>
          onSpinnerWheel(view, "TPA_MI", event, (step) => stepTpaRadius(view, step), onChange)
        }
      >
        <span className="dcb-cell-line">TPA MI</span>
        <span id={DCB_TPA_MI_READOUT_ID} className="dcb-cell-line">
          {formatDcbTpaMiReadout(view.tpa.radiusNm)}
        </span>
      </DcbCell>
      <DcbCell
        kind="toggle"
        ariaLabel="ATPA"
        dataDcb="atpa"
        pressed={view.atpa.on}
        onClick={() => runAuxCell(view, onChange, () => toggleAtpaOn(view))}
      >
        <span className="dcb-cell-line">ATPA</span>
        <span className="dcb-cell-line">{view.atpa.on ? "ON" : "OFF"}</span>
      </DcbCell>
      <DcbCell
        kind="disabled"
        ariaLabel="ATPA cones"
        dataDcb="atpa-cones"
        disabled
        onClick={() => undefined}
      >
        <span className="dcb-cell-line">CONES</span>
      </DcbCell>
      <DcbCell
        kind="disabled"
        ariaLabel="ATPA monitor"
        dataDcb="atpa-monitor"
        disabled
        onClick={() => undefined}
      >
        <span className="dcb-cell-line">MONITOR</span>
      </DcbCell>
      <DcbCell
        kind="disabled"
        ariaLabel="ATPA alert"
        dataDcb="atpa-alert"
        disabled
        onClick={() => undefined}
      >
        <span className="dcb-cell-line">ALERT</span>
      </DcbCell>
    </>
  );
}

function renderSsaFilter(view: ScopeView, onChange: () => void) {
  return (
    <>
      {renderDone(view, onChange)}
      {SSA_FILTER_FIELDS.map((field) => {
        const lines = ssaFilterLines(field);
        return (
          <DcbCell
            key={field}
            kind="toggle"
            ariaLabel={`SSA ${lines.line1}${lines.line2.trim() ? ` ${lines.line2}` : ""}`}
            dataDcb={ssaFilterCellId(field)}
            pressed={view.ssaFilter[field]}
            onClick={() => {
              cancelFilterIfEntering(view);
              toggleSsaFilter(view, field);
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">{lines.line1}</span>
            <span className="dcb-cell-line">{lines.line2}</span>
          </DcbCell>
        );
      })}
      <DcbCell kind="disabled" ariaLabel="CRDA" dataDcb="crda" disabled onClick={() => undefined}>
        <span className="dcb-cell-line">CRDA</span>
      </DcbCell>
    </>
  );
}

function renderGiFilter(view: ScopeView, onChange: () => void) {
  return (
    <>
      {renderDone(view, onChange)}
      {Array.from({ length: GI_SLOT_COUNT }, (_, i) => {
        const slot = i + 1;
        const authored = view.giTextLines[i] ?? "";
        const empty = authored.length === 0;
        return (
          <DcbCell
            key={slot}
            kind={empty ? "disabled" : "toggle"}
            ariaLabel={`GI ${slot}`}
            dataDcb="gi-slot"
            dataGiSlot={slot}
            pressed={!empty && view.giFilterVisible[i]}
            disabled={empty}
            onClick={() => {
              cancelFilterIfEntering(view);
              toggleGiFilter(view, i);
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">{`GI ${slot}`}</span>
            <span className="dcb-cell-line">{authored}</span>
          </DcbCell>
        );
      })}
    </>
  );
}

function renderMaps(view: ScopeView, onChange: () => void) {
  const slots = Array.from({ length: DCB_MAP_SLOT_COUNT }, (_, i) => i + 1);
  return (
    <>
      {renderDone(view, onChange)}
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
      {slots.map((slot) => renderMapSlot(view, onChange, slot))}
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
    </>
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

const CHAR_SPINNER_CELLS: {
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
  },
  {
    cell: "CHAR_LISTS",
    channel: "lists",
    dataDcb: "char-lists",
    ariaLabel: "Lists character size",
    line1: "LISTS",
    line2: "",
  },
  {
    cell: "CHAR_DCB",
    channel: "dcb",
    dataDcb: "char-dcb",
    ariaLabel: "DCB character size",
    line1: "DCB",
    line2: "",
  },
  {
    cell: "CHAR_TOOLS",
    channel: "tools",
    dataDcb: "char-tools",
    ariaLabel: "Tools character size",
    line1: "TOOLS",
    line2: "",
  },
  {
    cell: "CHAR_POS",
    channel: "pos",
    dataDcb: "char-pos",
    ariaLabel: "Position symbol size",
    line1: "POS",
    line2: "",
  },
];

const BRITE_SPINNER_CELLS: {
  cell: DcbSpinnerCell;
  channel: BriteChannel;
  dataDcb: NonNullable<DcbCellProps["dataDcb"]>;
  label: string;
}[] = [
  { cell: "BRITE_DCB", channel: "dcb", dataDcb: "brite-dcb", label: "DCB" },
  { cell: "BRITE_MPA", channel: "mpa", dataDcb: "brite-mpa", label: "MPA" },
  { cell: "BRITE_MPB", channel: "mpb", dataDcb: "brite-mpb", label: "MPB" },
  { cell: "BRITE_FDB", channel: "fdb", dataDcb: "brite-fdb", label: "FDB" },
  { cell: "BRITE_LST", channel: "lst", dataDcb: "brite-lst", label: "LST" },
  { cell: "BRITE_POS", channel: "pos", dataDcb: "brite-pos", label: "POS" },
  { cell: "BRITE_LDB", channel: "ldb", dataDcb: "brite-ldb", label: "LDB" },
  { cell: "BRITE_OTH", channel: "oth", dataDcb: "brite-oth", label: "OTH" },
  { cell: "BRITE_TLS", channel: "tls", dataDcb: "brite-tls", label: "TLS" },
  { cell: "BRITE_RR", channel: "rr", dataDcb: "brite-rr", label: "RR" },
  { cell: "BRITE_HST", channel: "hst", dataDcb: "brite-hst", label: "HST" },
];

const BRITE_DISABLED_CELLS: {
  dataDcb: NonNullable<DcbCellProps["dataDcb"]>;
  label: string;
  ariaLabel: string;
}[] = [
  { dataDcb: "brite-cmp", label: "CMP", ariaLabel: "CMP" },
  { dataDcb: "brite-bcn", label: "BCN", ariaLabel: "BCN" },
  { dataDcb: "brite-pri", label: "PRI", ariaLabel: "PRI" },
  { dataDcb: "brite-wx", label: "WX", ariaLabel: "WX" },
  { dataDcb: "brite-wxc", label: "WXC", ariaLabel: "WXC" },
  { dataDcb: "brite-bkc", label: "BKC", ariaLabel: "BKC" },
];

function renderCharSize(view: ScopeView, onChange: () => void) {
  return (
    <>
      {renderDone(view, onChange)}
      {CHAR_SPINNER_CELLS.map((item) => {
        const armed = spinnerArmed(view, item.cell);
        const size =
          item.channel === "dcb"
            ? view.charSizes.dcb
            : item.channel === "pos"
              ? view.charSizes.pos
              : view.charSizes[item.channel];
        return (
          <DcbCell
            key={item.cell}
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
          >
            <span className="dcb-cell-line">{item.line1}</span>
            <span className="dcb-cell-line">
              {item.line2
                ? `${item.line2} ${formatDcbCharReadout(size)}`
                : formatDcbCharReadout(size)}
            </span>
          </DcbCell>
        );
      })}
    </>
  );
}

function renderBrite(view: ScopeView, onChange: () => void) {
  return (
    <>
      {renderDone(view, onChange)}
      {BRITE_SPINNER_CELLS.map((item) => (
        <DcbCell
          key={item.cell}
          kind="spinner"
          ariaLabel={item.label}
          dataDcb={item.dataDcb}
          pressed={spinnerArmed(view, item.cell)}
          onClick={() => toggleSpinner(view, onChange, item.cell)}
          onWheel={(event) =>
            onSpinnerWheel(
              view,
              item.cell,
              event,
              (step) => stepBriteChannel(view, item.channel, step),
              onChange,
            )
          }
        >
          <span className="dcb-cell-line">{item.label}</span>
          <span className="dcb-cell-line">{formatDcbBriteReadout(view.brite[item.channel])}</span>
        </DcbCell>
      ))}
      {BRITE_DISABLED_CELLS.map((item) => (
        <DcbCell
          key={item.label}
          kind="disabled"
          ariaLabel={item.ariaLabel}
          dataDcb={item.dataDcb}
          disabled
          onClick={() => undefined}
        >
          <span className="dcb-cell-line">{item.label}</span>
        </DcbCell>
      ))}
    </>
  );
}

function prefStore() {
  return browserDcbPrefStorage() ?? undefined;
}

function renderPref(view: ScopeView, onChange: () => void) {
  return (
    <>
      {renderDone(view, onChange)}
      {Array.from({ length: 8 }, (_, i) => (
        <DcbCell
          key={i}
          kind="toggle"
          ariaLabel={`Pref ${i + 1}`}
          dataDcb={`pref-${i + 1}` as DcbCellProps["dataDcb"]}
          pressed={view.dcbPref.activeIndex === i}
          onClick={() => {
            cancelFilterIfEntering(view);
            selectDcbPrefSlot(view, i);
            persistDcbPref(view, prefStore());
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">PREF</span>
          <span className="dcb-cell-line">{`${i + 1}`}</span>
        </DcbCell>
      ))}
      <DcbCell
        kind="action"
        ariaLabel="Default"
        dataDcb="pref-default"
        onClick={() => {
          cancelFilterIfEntering(view);
          applyDcbPrefDefaults(view);
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">DEFAULT</span>
      </DcbCell>
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
    </>
  );
}

export function DisplayControlBar({ view, onChange, world }: DisplayControlBarProps) {
  const dcbPx = view.charSizes.dcb;
  const dcbText = applyBrite(PALETTE.dcbText, view.brite.dcb);
  const dcbFill = applyBrite(PALETTE.dcbCap, view.brite.dcb);
  const dcbDisabledText = applyBrite(PALETTE.dcbDisabledText, view.brite.dcb);
  const dcbHighlight = applyBrite(PALETTE.dcbHighlight, view.brite.dcb);
  const menu = view.dcbMenu;
  const vertical = isVerticalDcbDock(view.dcbDock);

  return (
    <div
      id={DCB_ID}
      className={vertical ? "dcb dcb-vertical" : "dcb"}
      role="group"
      aria-label="Display control bar"
      data-dcb-menu={menu}
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
    </div>
  );
}
