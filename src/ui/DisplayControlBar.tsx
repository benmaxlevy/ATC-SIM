/**
 * Analog: CRC STARS DCB cell grid (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: green equal-height cells on the glass — RANGE / MAPS / RR /
 * LDR DIR / CHAR SIZE / BRITE / FILTER / PTL / HIST / PLACE CNTR. MAPS opens
 * numbered catalog `dcbLabel`s. RR is generated range rings (2/5/10 NM, toggleable).
 * LDR DIR is L1–L9 (same as scope-focus L+digit; no length menu). Pressed =
 * invert/stipple, not a CSS chip. No WX / PREF / SHIFT / CSA / CRDA / FMA (R06).
 * Discrete range presets only. Not NAS STARS.
 *
 * Clicks call the same `src/scope` functions as the keyboard. Never a Command,
 * readback, or intent.
 */

import type { MouseEvent, ReactNode } from "react";
import {
  PALETTE,
  SCOPE_FONT_STACK,
  applyDcbLeaderDir,
  armPlaceCenter,
  beginAltitudeFilterChord,
  cancelFilterEntry,
  closeDcbSubmenu,
  cycleCharSize,
  cycleMapBrite,
  cycleRange,
  cycleRrInterval,
  dcbCatalogMaps,
  dcbLeaderDirReadout,
  DCB_LEADER_DIRS,
  formatDcbBriteReadout,
  formatDcbCharReadout,
  formatDcbMapLabel,
  formatDcbRangeReadout,
  formatDcbRrReadout,
  formatFilterBand,
  isCoastlineToggleEnabled,
  isVideoMapOn,
  isViewOffAirport,
  toggleDcbSubmenu,
  toggleHistoryEnabled,
  toggleMapLayer,
  togglePtlOn,
  toggleVideoMap,
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
export const DCB_RR_READOUT_ID = "dcb-rr-readout";
export const DCB_LDR_READOUT_ID = "dcb-ldr-readout";
export const DCB_CHAR_READOUT_ID = "dcb-char-readout";
export const DCB_BRITE_READOUT_ID = "dcb-brite-readout";
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

/**
 * Keep RANGE / MAPS / RR / LDR / CHAR / BRITE / FILTER / PTL / HIST in sync
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
  setText(DCB_RANGE_OFFSET_ID, isViewOffAirport(view) ? "OFF CNTR" : "\u00a0");
  setText(DCB_FILTER_BAND_ID, formatFilterBand(view.altitudeFilter, view.filterEntry));
  setText(DCB_RR_READOUT_ID, formatDcbRrReadout(view.ringIntervalNm, view.showRings));
  setPressed(doc.querySelector('[data-dcb-cell="rr"]'), view.showRings);
  setText(DCB_LDR_READOUT_ID, dcbLeaderDirReadout(view, world));
  setText(DCB_CHAR_READOUT_ID, formatDcbCharReadout(view.charSizePx));
  setText(DCB_BRITE_READOUT_ID, formatDcbBriteReadout(view.mapBriteIndex));
  setPressed(doc.querySelector('[data-dcb-map="rwy"]'), view.showRunway);
  setPressed(doc.querySelector('[data-dcb-map="loc"]'), view.showLocalizer);
  setPressed(doc.querySelector('[data-dcb-map="cst"]'), view.showCoastline);
  setPressed(doc.querySelector("[data-dcb-ptl]"), view.ptlOn);
  setPressed(doc.querySelector("[data-dcb-hist]"), view.historyEnabled);
  setPressed(doc.querySelector('[data-dcb-cell="maps"]'), view.dcbSubmenu === "maps");
  setPressed(doc.querySelector('[data-dcb-cell="ldr"]'), view.dcbSubmenu === "ldr");
  setPressed(doc.querySelector('[data-dcb-cell="place"]'), view.placeCenterArmed);
}

interface DcbCellProps {
  ariaLabel: string;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  dataDcbMap?: "rwy" | "loc" | "cst";
  dataDcb?:
    "ptl" | "hist" | "range" | "maps" | "filter" | "rr" | "ldr" | "char" | "brite" | "place";
  dataMapId?: string;
}

function DcbCell({
  ariaLabel,
  children,
  pressed,
  disabled,
  onClick,
  dataDcbMap,
  dataDcb,
  dataMapId,
}: DcbCellProps) {
  return (
    <button
      type="button"
      className="dcb-cell"
      aria-label={ariaLabel}
      aria-pressed={pressed}
      disabled={disabled}
      data-dcb-map={dataDcbMap}
      data-dcb-map-id={dataMapId}
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
  closeDcbSubmenu(view);
  toggleMapLayer(view, layer);
  afterCell(onChange);
}

function runCell(view: ScopeView, onChange: () => void, fn: () => void): void {
  cancelFilterIfEntering(view);
  closeDcbSubmenu(view);
  fn();
  afterCell(onChange);
}

export function DisplayControlBar({ view, onChange, world }: DisplayControlBarProps) {
  const coastOn = isCoastlineToggleEnabled(view);
  const offCntr = isViewOffAirport(view);
  const catalog = dcbCatalogMaps(view);
  const dcbPx = DCB_CHAR_PX[view.charSizePx] ?? DCB_FONT_PX;

  return (
    <div
      id={DCB_ID}
      className="dcb"
      role="group"
      aria-label="Display control bar"
      style={{
        height: DCB_HEIGHT_PX,
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
      <DcbCell
        ariaLabel="Range"
        dataDcb="range"
        onClick={() => runCell(view, onChange, () => cycleRange(view.camera))}
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
        pressed={view.dcbSubmenu === "maps"}
        onClick={() => {
          cancelFilterIfEntering(view);
          toggleDcbSubmenu(view, "maps");
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
        dataDcb="rr"
        pressed={view.showRings}
        onClick={() => runCell(view, onChange, () => cycleRrInterval(view))}
      >
        <span className="dcb-cell-line">RR</span>
        <span id={DCB_RR_READOUT_ID} className="dcb-cell-line">
          {formatDcbRrReadout(view.ringIntervalNm, view.showRings)}
        </span>
      </DcbCell>
      <DcbCell
        ariaLabel="Leader direction"
        dataDcb="ldr"
        pressed={view.dcbSubmenu === "ldr"}
        onClick={() => {
          cancelFilterIfEntering(view);
          toggleDcbSubmenu(view, "ldr");
          afterCell(onChange);
        }}
      >
        <span className="dcb-cell-line">LDR</span>
        <span id={DCB_LDR_READOUT_ID} className="dcb-cell-line">
          {dcbLeaderDirReadout(view, world)}
        </span>
      </DcbCell>
      <DcbCell
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
      <DcbCell
        ariaLabel="Predicted track line"
        dataDcb="ptl"
        pressed={view.ptlOn}
        onClick={() => runCell(view, onChange, () => togglePtlOn(view))}
      >
        <span className="dcb-cell-line">PTL</span>
        <span className="dcb-cell-line">{view.ptlOn ? "ON" : "OFF"}</span>
      </DcbCell>
      <DcbCell
        ariaLabel="History"
        dataDcb="hist"
        pressed={view.historyEnabled}
        onClick={() => runCell(view, onChange, () => toggleHistoryEnabled(view))}
      >
        <span className="dcb-cell-line">HIST</span>
        <span className="dcb-cell-line">{view.historyEnabled ? "ON" : "OFF"}</span>
      </DcbCell>
      <DcbCell
        ariaLabel="Place center"
        dataDcb="place"
        pressed={view.placeCenterArmed}
        onClick={() => runCell(view, onChange, () => armPlaceCenter(view))}
      >
        <span className="dcb-cell-line">PLACE</span>
        <span className="dcb-cell-line">CNTR</span>
      </DcbCell>
      {view.dcbSubmenu === "maps" ? (
        <div className="dcb-submenu" role="group" aria-label="Maps">
          {catalog.map((map) => {
            const coastOff = map.role === "coastline" && !coastOn;
            return (
              <DcbCell
                key={map.id}
                ariaLabel={formatDcbMapLabel(map)}
                dataMapId={map.id}
                pressed={isVideoMapOn(view, map.id)}
                disabled={coastOff}
                onClick={() => {
                  cancelFilterIfEntering(view);
                  toggleVideoMap(view, map.id);
                  afterCell(onChange);
                }}
              >
                <span className="dcb-cell-line">{map.dcbNumber}</span>
                <span className="dcb-cell-line">{map.dcbLabel}</span>
              </DcbCell>
            );
          })}
        </div>
      ) : null}
      {view.dcbSubmenu === "ldr" ? (
        <div className="dcb-submenu" role="group" aria-label="Leader direction">
          {DCB_LEADER_DIRS.map((dir) => (
            <DcbCell
              key={dir}
              ariaLabel={`Leader L${dir}`}
              pressed={dcbLeaderDirReadout(view, world) === `L${dir}`}
              onClick={() => {
                cancelFilterIfEntering(view);
                if (world) {
                  applyDcbLeaderDir(view, world, dir);
                }
                closeDcbSubmenu(view);
                afterCell(onChange);
              }}
            >
              <span className="dcb-cell-line">{`L${dir}`}</span>
              <span className="dcb-cell-line">{"\u00a0"}</span>
            </DcbCell>
          ))}
        </div>
      ) : null}
    </div>
  );
}
