/**
 * Analog: CRC STARS DCB RANGE / PLACE CNTR / OFF CNTR / RR / PLACE RR / RR CNTR /
 * LDR DIR / LDR / MAPS / WX / AUX HISTORY / PTL / DCB position (R07).
 * Trainer delta: green equal-height cells on the glass. SHIFT swaps MAIN and AUX.
 * MAPS / TPA-ATPA submenus replace the bar; DONE / Esc return to MAIN. RANGE / RR /
 * LDR DIR / LDR length are spinners (arm, wheel steps frozen presets, second click /
 * Esc commits). CHAR SIZE and BRITE stay click-cycle until T02-26. AUX: VOL disabled,
 * HISTORY spinner 0–5, DCB TOP/LEFT/RIGHT/BOTTOM, PTL length spinner, PTL OWN,
 * PTL ALL, TPA/ATPA stub. FILTER stays on MAIN. HIST/PTL cells live on AUX (F7/F8
 * still work). MAIN quick video maps 1–6; MAPS submenu slots 1–30 (empty slots
 * disabled). WX1–4 are disabled chrome (no precipitation). No PREF / CSA / CRDA /
 * FMA (R06). Discrete **range** presets only. Not NAS STARS.
 *
 * UI copy: SHIFT / DONE / MAIN / AUX / HISTORY / PTL / range / center / range rings /
 * leader — not toolbar or modal.
 * F8 / scope-focus H still call toggleHistoryEnabled(view) (0 ↔ last non-zero).
 * F7 still calls togglePtlOn(view) (PTL ALL).
 * Clicks call the same `src/scope` functions as the keyboard. Never a Command,
 * readback, or intent.
 */

import type { MouseEvent, PointerEvent, ReactNode, WheelEvent } from "react";
import {
  PALETTE,
  SCOPE_FONT_STACK,
  applyDcbLeaderDir,
  applyDcbShift,
  applyRrCenter,
  clearAllVideoMaps,
  armDcbSpinner,
  armPlaceCenter,
  armPlaceRangeRing,
  beginAltitudeFilterChord,
  cancelFilterEntry,
  centerOnAirport,
  closeDcbMenu,
  closeDcbSubmenu,
  commitDcbSpinner,
  cycleCharSize,
  cycleMapBrite,
  dcbLeaderDirReadout,
  DCB_LEADER_DIRS,
  DCB_MAP_SLOT_COUNT,
  DCB_QUICK_MAP_COUNT,
  formatDcbBriteReadout,
  formatDcbCharReadout,
  formatDcbHistoryReadout,
  formatDcbLdrLengthReadout,
  formatDcbMapLabel,
  formatDcbPtlMinutesReadout,
  formatDcbRangeReadout,
  formatDcbRrReadout,
  formatFilterBand,
  hideMapLists,
  isDcbMapSlotEnabled,
  isRangeRingOffViewCenter,
  isVerticalDcbDock,
  isVideoMapOn,
  isViewOffAirport,
  openDcbMenu,
  setDcbDock,
  stepDcbLeaderDir,
  stepDcbLeaderLength,
  stepDcbSpinner,
  stepHistoryDots,
  stepPtlLength,
  stepRange,
  stepRrInterval,
  toggleCurrentMapsList,
  toggleGeoMapsList,
  togglePtlOn,
  togglePtlOwn,
  toggleVideoMap,
  videoMapByDcbNumber,
  type DcbCellKind,
  type DcbSpinnerCell,
  type ScopeView,
} from "@scope";
import { focusPpi } from "./FlightStrips";

/** Two rows of mono 11–12 px plus 1 px gutters, flush on the PPI. */
export const DCB_HEIGHT_PX = 36;
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
export const DCB_RNG_READOUT_ID = DCB_RANGE_READOUT_ID;

/** CHAR SIZE 11/12/13 → DCB 10/11/12 so two lines still fit the 36 px bar. */
const DCB_CHAR_PX: Record<11 | 12 | 13, number> = { 11: 10, 12: 11, 13: 12 };

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

/**
 * Keep RANGE / MAPS / RR / LDR DIR / LDR / CHAR / BRITE / FILTER / HISTORY / PTL in sync
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
  setText(DCB_RANGE_READOUT_ID, formatDcbRangeReadout(view.camera.rangeNm));
  setText(DCB_FILTER_BAND_ID, formatFilterBand(view.altitudeFilter, view.filterEntry));
  setText(DCB_RR_READOUT_ID, formatDcbRrReadout(view.ringIntervalNm, view.showRings));
  setPressed(doc.querySelector('[data-dcb-cell="rr"]'), spinnerArmed(view, "RR"));
  setText(DCB_LDR_READOUT_ID, dcbLeaderDirReadout(view, world));
  setText(DCB_LDR_LENGTH_READOUT_ID, formatDcbLdrLengthReadout(view.leaderLengthPx));
  setText(DCB_CHAR_READOUT_ID, formatDcbCharReadout(view.charSizePx));
  setText(DCB_BRITE_READOUT_ID, formatDcbBriteReadout(view.mapBriteIndex));
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
    | "tpa";
  dataMapId?: string;
  dataMapSlot?: number;
}

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
}: DcbCellProps) {
  const inert = disabled || kind === "disabled";
  return (
    <button
      type="button"
      className="dcb-cell"
      aria-label={ariaLabel}
      aria-pressed={pressed}
      aria-disabled={inert ? true : undefined}
      disabled={inert}
      data-dcb-kind={kind}
      data-dcb-map-id={dataMapId}
      data-dcb-map-slot={dataMapSlot}
      data-dcb-ptl={dataDcb === "ptl" ? "" : undefined}
      data-dcb-hist={dataDcb === "hist" ? "" : undefined}
      data-dcb-cell={dataDcb}
      onMouseDown={preventButtonFocus}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        if (kind === "spinner" && event.currentTarget.setPointerCapture) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onWheel={onWheel}
      onClick={() => {
        if (inert) {
          return;
        }
        onClick();
      }}
    >
      {children}
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
      <span className="dcb-cell-line">{map?.dcbLabel ?? "\u00a0"}</span>
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
      <span className="dcb-cell-line">{"\u00a0"}</span>
    </DcbCell>
  );
}

function runCell(view: ScopeView, onChange: () => void, fn: () => void): void {
  cancelFilterIfEntering(view);
  closeDcbSubmenu(view);
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
    <DcbCell kind="action" ariaLabel="Done" dataDcb="done" onClick={() => clickDone(view, onChange)}>
      <span className="dcb-cell-line">DONE</span>
      <span className="dcb-cell-line">{"\u00a0"}</span>
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
      <span className="dcb-cell-line">{view.dcbMenu === "AUX" ? "AUX" : "MAIN"}</span>
    </DcbCell>
  );
}

function renderMain(view: ScopeView, onChange: () => void, world: DisplayControlBarProps["world"]) {
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
        <span className="dcb-cell-line">{"\u00a0"}</span>
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
        <span className="dcb-cell-line">{"\u00a0"}</span>
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
          onSpinnerWheel(view, "LDR_LENGTH", event, (step) => stepDcbLeaderLength(view, step), onChange)
        }
      >
        <span className="dcb-cell-line">LDR</span>
        <span id={DCB_LDR_LENGTH_READOUT_ID} className="dcb-cell-line">
          {formatDcbLdrLengthReadout(view.leaderLengthPx)}
        </span>
      </DcbCell>
      {/* CHAR/BRITE remain click-cycle until T02-26 converts them to submenus. */}
      <DcbCell
        kind="action"
        ariaLabel="Character size"
        dataDcb="char"
        onClick={() => runCell(view, onChange, () => cycleCharSize(view))}
      >
        <span className="dcb-cell-line">CHAR</span>
        <span id={DCB_CHAR_READOUT_ID} className="dcb-cell-line">
          {formatDcbCharReadout(view.charSizePx)}
        </span>
      </DcbCell>
      <DcbCell
        kind="action"
        ariaLabel="Map brightness"
        dataDcb="brite"
        onClick={() => runCell(view, onChange, () => cycleMapBrite(view))}
      >
        <span className="dcb-cell-line">BRITE</span>
        <span id={DCB_BRITE_READOUT_ID} className="dcb-cell-line">
          {formatDcbBriteReadout(view.mapBriteIndex)}
        </span>
      </DcbCell>
      <DcbCell
        kind="action"
        ariaLabel="Altitude filter"
        dataDcb="filter"
        onClick={() => {
          closeDcbSubmenu(view);
          beginAltitudeFilterChord(view);
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">FILTER</span>
        <span id={DCB_FILTER_BAND_ID} className="dcb-cell-line">
          {formatFilterBand(view.altitudeFilter, view.filterEntry)}
        </span>
      </DcbCell>
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
        <span className="dcb-cell-line">{"\u00a0"}</span>
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
  return <>{renderDone(view, onChange)}</>;
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
        <span className="dcb-cell-line">{"\u00a0"}</span>
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
          <span className="dcb-cell-line">{"\u00a0"}</span>
        </DcbCell>
      ))}
    </>
  );
}

export function DisplayControlBar({ view, onChange, world }: DisplayControlBarProps) {
  const dcbPx = DCB_CHAR_PX[view.charSizePx] ?? DCB_FONT_PX;
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
        color: PALETTE.ssa,
        ["--dcb-cell" as string]: PALETTE.dcbCell,
        ["--dcb-text" as string]: PALETTE.dcbText,
        ["--dcb-gutter" as string]: PALETTE.background,
        ["--dcb-pressed" as string]: PALETTE.dcbText,
        ["--dcb-pressed-text" as string]: PALETTE.background,
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
              : renderMain(view, onChange, world)}
    </div>
  );
}
