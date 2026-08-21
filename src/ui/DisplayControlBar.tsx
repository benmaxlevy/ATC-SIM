/**
 * Analog: CRC STARS DCB cell grid (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: green equal-height cells on the glass (RANGE / MAPS / FILTER /
 * PTL / HIST / CTR). RWY/LOC/CST/RING are temporary cells until T02-17 MAPS
 * submenu. Pressed = invert/stipple, not a CSS chip. No WX / PREF / SHIFT /
 * CSA / CRDA / FMA (R06). Not a full DCB. Not NAS STARS.
 *
 * Clicks call the same `src/scope` functions as the keyboard. Never a Command,
 * readback, or intent.
 */

import type { MouseEvent, ReactNode } from "react";
import {
  PALETTE,
  SCOPE_FONT_STACK,
  beginAltitudeFilterChord,
  cancelFilterEntry,
  centerOnAirport,
  cycleRange,
  formatDcbRangeReadout,
  formatFilterBand,
  isCoastlineToggleEnabled,
  isViewOffAirport,
  toggleHistoryEnabled,
  toggleMapLayer,
  togglePtlOn,
  type MapLayerId,
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
export const DCB_RNG_READOUT_ID = DCB_RANGE_READOUT_ID;

export interface DisplayControlBarProps {
  view: ScopeView;
  onChange: () => void;
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

/**
 * Keep RANGE / MAPS / FILTER / PTL / HIST in sync with keyboard chords.
 */
export function syncDisplayControlBar(view: ScopeView): void {
  const doc = globalThis.document;
  if (!doc) {
    return;
  }
  const range = doc.getElementById(DCB_RANGE_READOUT_ID);
  if (range) {
    range.textContent = formatDcbRangeReadout(view.camera.rangeNm);
  }
  const offset = doc.getElementById(DCB_RANGE_OFFSET_ID);
  if (offset) {
    offset.textContent = isViewOffAirport(view) ? "OFF CNTR" : "\u00a0";
  }
  const band = doc.getElementById(DCB_FILTER_BAND_ID);
  if (band) {
    band.textContent = formatFilterBand(view.altitudeFilter, view.filterEntry);
  }
  setPressed(doc.querySelector('[data-dcb-map="rwy"]'), view.showRunway);
  setPressed(doc.querySelector('[data-dcb-map="loc"]'), view.showLocalizer);
  setPressed(doc.querySelector('[data-dcb-map="ring"]'), view.showRings);
  setPressed(doc.querySelector('[data-dcb-map="cst"]'), view.showCoastline);
  setPressed(doc.querySelector("[data-dcb-ptl]"), view.ptlOn);
  setPressed(doc.querySelector("[data-dcb-hist]"), view.historyEnabled);
}

interface DcbCellProps {
  ariaLabel: string;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  dataDcbMap?: "rwy" | "loc" | "ring" | "cst";
  dataDcb?: "ptl" | "hist" | "range" | "maps" | "filter" | "ctr";
}

function DcbCell({
  ariaLabel,
  children,
  pressed,
  disabled,
  onClick,
  dataDcbMap,
  dataDcb,
}: DcbCellProps) {
  return (
    <button
      type="button"
      className="dcb-cell"
      aria-label={ariaLabel}
      aria-pressed={pressed}
      disabled={disabled}
      data-dcb-map={dataDcbMap}
      data-dcb-ptl={dataDcb === "ptl" ? "" : undefined}
      data-dcb-hist={dataDcb === "hist" ? "" : undefined}
      data-dcb-cell={dataDcb}
      onMouseDown={preventButtonFocus}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function mapClick(view: ScopeView, onChange: () => void, layer: MapLayerId): void {
  cancelFilterIfEntering(view);
  toggleMapLayer(view, layer);
  afterCell(onChange);
}

export function DisplayControlBar({ view, onChange }: DisplayControlBarProps) {
  const coastOn = isCoastlineToggleEnabled(view);
  const offCntr = isViewOffAirport(view);

  return (
    <div
      id={DCB_ID}
      className="dcb"
      role="group"
      aria-label="Display control bar"
      style={{
        height: DCB_HEIGHT_PX,
        fontFamily: SCOPE_FONT_STACK,
        fontSize: DCB_FONT_PX,
        backgroundColor: PALETTE.background,
        color: PALETTE.map,
        ["--dcb-cell" as string]: PALETTE.dcbCell,
        ["--dcb-text" as string]: PALETTE.map,
        ["--dcb-gutter" as string]: PALETTE.background,
        ["--dcb-pressed" as string]: PALETTE.map,
        ["--dcb-pressed-text" as string]: PALETTE.background,
      }}
    >
      <DcbCell
        ariaLabel="Range"
        dataDcb="range"
        onClick={() => {
          cancelFilterIfEntering(view);
          cycleRange(view.camera);
          afterCell(onChange);
        }}
      >
        <span id={DCB_RANGE_READOUT_ID} className="dcb-cell-line">
          {formatDcbRangeReadout(view.camera.rangeNm)}
        </span>
        <span id={DCB_RANGE_OFFSET_ID} className="dcb-cell-line">
          {offCntr ? "OFF CNTR" : "\u00a0"}
        </span>
      </DcbCell>
      <DcbCell
        ariaLabel="Maps"
        dataDcb="maps"
        onClick={() => {
          cancelFilterIfEntering(view);
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">MAPS</span>
        <span className="dcb-cell-line">{"\u00a0"}</span>
      </DcbCell>
      <DcbCell
        ariaLabel="Runway map"
        dataDcbMap="rwy"
        pressed={view.showRunway}
        onClick={() => mapClick(view, onChange, "runway")}
      >
        <span className="dcb-cell-line">RWY</span>
        <span className="dcb-cell-line">{"\u00a0"}</span>
      </DcbCell>
      <DcbCell
        ariaLabel="Localizer map"
        dataDcbMap="loc"
        pressed={view.showLocalizer}
        onClick={() => mapClick(view, onChange, "localizer")}
      >
        <span className="dcb-cell-line">LOC</span>
        <span className="dcb-cell-line">{"\u00a0"}</span>
      </DcbCell>
      <DcbCell
        ariaLabel="Coastline map"
        dataDcbMap="cst"
        pressed={view.showCoastline}
        disabled={!coastOn}
        onClick={() => mapClick(view, onChange, "coastline")}
      >
        <span className="dcb-cell-line">CST</span>
        <span className="dcb-cell-line">{"\u00a0"}</span>
      </DcbCell>
      <DcbCell
        ariaLabel="Range rings"
        dataDcbMap="ring"
        pressed={view.showRings}
        onClick={() => mapClick(view, onChange, "rings")}
      >
        <span className="dcb-cell-line">RING</span>
        <span className="dcb-cell-line">{"\u00a0"}</span>
      </DcbCell>
      <DcbCell
        ariaLabel="Altitude filter"
        dataDcb="filter"
        onClick={() => {
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
        ariaLabel="Predicted track line"
        dataDcb="ptl"
        pressed={view.ptlOn}
        onClick={() => {
          cancelFilterIfEntering(view);
          togglePtlOn(view);
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">PTL</span>
        <span className="dcb-cell-line">{view.ptlOn ? "ON" : "OFF"}</span>
      </DcbCell>
      <DcbCell
        ariaLabel="History"
        dataDcb="hist"
        pressed={view.historyEnabled}
        onClick={() => {
          cancelFilterIfEntering(view);
          toggleHistoryEnabled(view);
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">HIST</span>
        <span className="dcb-cell-line">{view.historyEnabled ? "ON" : "OFF"}</span>
      </DcbCell>
      <DcbCell
        ariaLabel="Center airport"
        dataDcb="ctr"
        onClick={() => {
          cancelFilterIfEntering(view);
          centerOnAirport(view);
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">CTR</span>
        <span className="dcb-cell-line">{"\u00a0"}</span>
      </DcbCell>
    </div>
  );
}
