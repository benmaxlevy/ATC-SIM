/**
 * Analog: CRC STARS DCB (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: lite subset only (RNG / MAPS / FILTER / PTL / HIST / CTR).
 * Not MAPBRITE, CHARSIZE, SHIFT, CSA, CRDA, weather (R06). Not a full DCB.
 * Not NAS STARS.
 *
 * Clicks call the same `src/scope` functions as the keyboard. Never a Command,
 * readback, or intent.
 */

import type { KeyboardEvent, MouseEvent } from "react";
import {
  PALETTE,
  SCOPE_FONT_STACK,
  centerOnAirport,
  formatFilterHundreds,
  isCoastlineToggleEnabled,
  stepRange,
  toggleHistoryEnabled,
  toggleMapLayer,
  togglePtlOn,
  tryApplyAltitudeFilterDigits,
  type ScopeView,
} from "@scope";
import { focusPpi } from "./FlightStrips";

/** Thin DCB-lite strip. Canvas below is the drawable PPI (T02-01 view size). */
export const DCB_LITE_HEIGHT_PX = 32;
export const DCB_LITE_FONT_PX = 12;
export const DCB_LITE_ID = "dcb-lite";
export const DCB_RNG_READOUT_ID = "dcb-rng-readout";
export const DCB_FIL_MIN_ID = "dcb-fil-min";
export const DCB_FIL_MAX_ID = "dcb-fil-max";

export interface DisplayControlBarProps {
  view: ScopeView;
  onChange: () => void;
}

function preventButtonFocus(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

function afterButton(onChange: () => void): void {
  onChange();
  focusPpi();
}

function filInput(id: string): HTMLInputElement | null {
  const el = globalThis.document?.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

function revertFilFields(view: ScopeView): void {
  const min = filInput(DCB_FIL_MIN_ID);
  const max = filInput(DCB_FIL_MAX_ID);
  if (min) {
    min.value = formatFilterHundreds(view.altitudeFilter.minHundreds);
  }
  if (max) {
    max.value = formatFilterHundreds(view.altitudeFilter.maxHundreds);
  }
}

function applyFilFields(view: ScopeView): boolean {
  const min = filInput(DCB_FIL_MIN_ID);
  const max = filInput(DCB_FIL_MAX_ID);
  if (!min || !max) {
    return false;
  }
  return tryApplyAltitudeFilterDigits(view.altitudeFilter, min.value, max.value);
}

function setPressed(el: Element | null, pressed: boolean): void {
  if (!(el instanceof HTMLElement)) {
    return;
  }
  el.setAttribute("aria-pressed", pressed ? "true" : "false");
  el.classList.toggle("dcb-lite-is-pressed", pressed);
}

/**
 * Keep RNG / MAP / FILTER / PTL / HIST in sync with keyboard chords.
 * Skip FIL fields while they are focused so typing is not overwritten.
 */
export function syncDisplayControlBar(view: ScopeView): void {
  const doc = globalThis.document;
  if (!doc) {
    return;
  }
  const rng = doc.getElementById(DCB_RNG_READOUT_ID);
  if (rng) {
    rng.textContent = String(view.camera.rangeNm);
  }
  setPressed(doc.querySelector('[data-dcb-map="rwy"]'), view.showRunway);
  setPressed(doc.querySelector('[data-dcb-map="loc"]'), view.showLocalizer);
  setPressed(doc.querySelector('[data-dcb-map="ring"]'), view.showRings);
  setPressed(doc.querySelector('[data-dcb-map="cst"]'), view.showCoastline);
  setPressed(doc.querySelector("[data-dcb-ptl]"), view.ptlOn);
  setPressed(doc.querySelector("[data-dcb-hist]"), view.historyEnabled);

  const active = doc.activeElement;
  const min = filInput(DCB_FIL_MIN_ID);
  const max = filInput(DCB_FIL_MAX_ID);
  if (min && active !== min) {
    min.value = formatFilterHundreds(view.altitudeFilter.minHundreds);
  }
  if (max && active !== max) {
    max.value = formatFilterHundreds(view.altitudeFilter.maxHundreds);
  }
}

export function DisplayControlBar({ view, onChange }: DisplayControlBarProps) {
  const coastOn = isCoastlineToggleEnabled(view);

  function onFilKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" || event.key === "NumpadEnter") {
      event.preventDefault();
      if (applyFilFields(view)) {
        onChange();
      }
      focusPpi();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      revertFilFields(view);
      focusPpi();
    }
  }

  return (
    <div
      id={DCB_LITE_ID}
      className="dcb-lite"
      role="toolbar"
      aria-label="Display control bar"
      style={{
        height: DCB_LITE_HEIGHT_PX,
        backgroundColor: PALETTE.uiChromeBg,
        color: PALETTE.uiChrome,
        fontFamily: SCOPE_FONT_STACK,
        fontSize: DCB_LITE_FONT_PX,
      }}
    >
      <span className="dcb-lite-title">DCB</span>
      <span className="dcb-lite-group" aria-label="Range">
        <span className="dcb-lite-label">RNG</span>
        <span id={DCB_RNG_READOUT_ID} className="dcb-lite-readout">
          {view.camera.rangeNm}
        </span>
        <button
          type="button"
          className="dcb-lite-btn"
          aria-label="Range in"
          onMouseDown={preventButtonFocus}
          onClick={() => {
            stepRange(view.camera, -1);
            afterButton(onChange);
          }}
        >
          −
        </button>
        <button
          type="button"
          className="dcb-lite-btn"
          aria-label="Range out"
          onMouseDown={preventButtonFocus}
          onClick={() => {
            stepRange(view.camera, 1);
            afterButton(onChange);
          }}
        >
          +
        </button>
      </span>
      <span className="dcb-lite-group" aria-label="Maps">
        <span className="dcb-lite-label">MAPS</span>
        <button
          type="button"
          className="dcb-lite-btn"
          data-dcb-map="rwy"
          aria-label="Runway map"
          aria-pressed={view.showRunway}
          onMouseDown={preventButtonFocus}
          onClick={() => {
            toggleMapLayer(view, "runway");
            afterButton(onChange);
          }}
        >
          RWY
        </button>
        <button
          type="button"
          className="dcb-lite-btn"
          data-dcb-map="loc"
          aria-label="Localizer map"
          aria-pressed={view.showLocalizer}
          onMouseDown={preventButtonFocus}
          onClick={() => {
            toggleMapLayer(view, "localizer");
            afterButton(onChange);
          }}
        >
          LOC
        </button>
        <button
          type="button"
          className="dcb-lite-btn"
          data-dcb-map="ring"
          aria-label="Range rings"
          aria-pressed={view.showRings}
          onMouseDown={preventButtonFocus}
          onClick={() => {
            toggleMapLayer(view, "rings");
            afterButton(onChange);
          }}
        >
          RING
        </button>
        <button
          type="button"
          className="dcb-lite-btn"
          data-dcb-map="cst"
          aria-label="Coastline map"
          aria-pressed={view.showCoastline}
          disabled={!coastOn}
          onMouseDown={preventButtonFocus}
          onClick={() => {
            toggleMapLayer(view, "coastline");
            afterButton(onChange);
          }}
        >
          CST
        </button>
      </span>
      <span className="dcb-lite-group" aria-label="Altitude filter">
        <span className="dcb-lite-label">FILTER</span>
        <input
          id={DCB_FIL_MIN_ID}
          className="dcb-lite-fil"
          inputMode="numeric"
          maxLength={3}
          aria-label="Altitude filter min hundreds"
          defaultValue={formatFilterHundreds(view.altitudeFilter.minHundreds)}
          onKeyDown={onFilKeyDown}
        />
        <span className="dcb-lite-fil-sep">–</span>
        <input
          id={DCB_FIL_MAX_ID}
          className="dcb-lite-fil"
          inputMode="numeric"
          maxLength={3}
          aria-label="Altitude filter max hundreds"
          defaultValue={formatFilterHundreds(view.altitudeFilter.maxHundreds)}
          onKeyDown={onFilKeyDown}
        />
        <button
          type="button"
          className="dcb-lite-btn"
          aria-label="Apply altitude filter"
          onMouseDown={preventButtonFocus}
          onClick={() => {
            if (applyFilFields(view)) {
              onChange();
            }
            focusPpi();
          }}
        >
          Apply
        </button>
      </span>
      <button
        type="button"
        className="dcb-lite-btn"
        data-dcb-ptl=""
        aria-label="Predicted track line"
        aria-pressed={view.ptlOn}
        onMouseDown={preventButtonFocus}
        onClick={() => {
          togglePtlOn(view);
          afterButton(onChange);
        }}
      >
        PTL
      </button>
      <button
        type="button"
        className="dcb-lite-btn"
        data-dcb-hist=""
        aria-label="History"
        aria-pressed={view.historyEnabled}
        onMouseDown={preventButtonFocus}
        onClick={() => {
          toggleHistoryEnabled(view);
          afterButton(onChange);
        }}
      >
        HIST
      </button>
      <button
        type="button"
        className="dcb-lite-btn"
        aria-label="Center airport"
        onMouseDown={preventButtonFocus}
        onClick={() => {
          centerOnAirport(view);
          afterButton(onChange);
        }}
      >
        CTR
      </button>
    </div>
  );
}
