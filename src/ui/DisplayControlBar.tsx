/**
 * Analog: CRC STARS DCB RANGE / PLACE CNTR / OFF CNTR / RR / PLACE RR / RR CNTR /
 * LDR DIR / LDR (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: green equal-height cells on the glass. SHIFT swaps MAIN and AUX.
 * MAPS submenu replaces the bar; DONE / Esc return to MAIN. RANGE / RR / LDR DIR /
 * LDR length are spinners (arm, wheel steps frozen presets, second click / Esc
 * commits). CHAR SIZE and BRITE stay click-cycle until T02-26. AUX is SHIFT back
 * + VOL disabled. FILTER / PTL / HIST stay on MAIN. Pressed = invert/stipple.
 * No WX / PREF / CSA / CRDA / FMA (R06). Discrete **range** presets only. Not NAS STARS.
 *
 * UI copy: SHIFT / DONE / MAIN / AUX / range / center / range rings / leader —
 * not toolbar or modal.
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
  dcbCatalogMaps,
  dcbLeaderDirReadout,
  DCB_LEADER_DIRS,
  formatDcbBriteReadout,
  formatDcbCharReadout,
  formatDcbLdrLengthReadout,
  formatDcbMapLabel,
  formatDcbRangeReadout,
  formatDcbRrReadout,
  formatFilterBand,
  isCoastlineToggleEnabled,
  isRangeRingOffViewCenter,
  isVideoMapOn,
  isViewOffAirport,
  openDcbMenu,
  stepDcbLeaderDir,
  stepDcbLeaderLength,
  stepDcbSpinner,
  stepRange,
  stepRrInterval,
  toggleHistoryEnabled,
  toggleMapLayer,
  togglePtlOn,
  toggleVideoMap,
  type DcbCellKind,
  type DcbSpinnerCell,
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
export const DCB_LDR_LENGTH_READOUT_ID = "dcb-ldr-length-readout";
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

/**
 * Keep RANGE / MAPS / RR / LDR DIR / LDR / CHAR / BRITE / FILTER / PTL / HIST in sync
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
  setPressed(doc.querySelector('[data-dcb-map="rwy"]'), view.showRunway);
  setPressed(doc.querySelector('[data-dcb-map="loc"]'), view.showLocalizer);
  setPressed(doc.querySelector('[data-dcb-map="cst"]'), view.showCoastline);
  setPressed(doc.querySelector("[data-dcb-ptl]"), view.ptlOn);
  setPressed(doc.querySelector("[data-dcb-hist]"), view.historyEnabled);
  setPressed(doc.querySelector('[data-dcb-cell="maps"]'), view.dcbMenu === "MAPS");
  setPressed(doc.querySelector('[data-dcb-cell="place"]'), view.placeCenterArmed);
  setPressed(doc.querySelector('[data-dcb-cell="off-cntr"]'), isViewOffAirport(view));
  setPressed(doc.querySelector('[data-dcb-cell="place-rr"]'), view.placeRangeRingArmed);
  setPressed(doc.querySelector('[data-dcb-cell="rr-cntr"]'), isRangeRingOffViewCenter(view));
  setPressed(doc.querySelector('[data-dcb-cell="range"]'), spinnerArmed(view, "RANGE"));
  setPressed(doc.querySelector('[data-dcb-cell="ldr-dir"]'), spinnerArmed(view, "LDR_DIR"));
  setPressed(doc.querySelector('[data-dcb-cell="ldr-length"]'), spinnerArmed(view, "LDR_LENGTH"));
}

interface DcbCellProps {
  ariaLabel: string;
  children: ReactNode;
  kind?: DcbCellKind;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onWheel?: (event: WheelEvent<HTMLButtonElement>) => void;
  dataDcbMap?: "rwy" | "loc" | "cst";
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
    | "vol";
  dataMapId?: string;
}

function DcbCell({
  ariaLabel,
  children,
  kind = "action",
  pressed,
  disabled,
  onClick,
  onWheel,
  dataDcbMap,
  dataDcb,
  dataMapId,
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
      data-dcb-map={dataDcbMap}
      data-dcb-map-id={dataMapId}
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

function mapClick(view: ScopeView, onChange: () => void, layer: MapLayerId): void {
  cancelFilterIfEntering(view);
  closeDcbSubmenu(view);
  toggleMapLayer(view, layer);
  afterCell(onChange);
}

function runCell(view: ScopeView, onChange: () => void, fn: () => void): void {
  cancelFilterIfEntering(view);
  closeDcbSubmenu(view);
  commitDcbSpinner(view);
  fn();
  afterCell(onChange);
}

function clickDone(view: ScopeView, onChange: () => void): void {
  cancelFilterIfEntering(view);
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
  const coastOn = isCoastlineToggleEnabled(view);
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
      <DcbCell
        kind="toggle"
        ariaLabel="Runway map"
        dataDcbMap="rwy"
        pressed={view.showRunway}
        onClick={() => mapClick(view, onChange, "runway")}
      >
        <span className="dcb-cell-line">RWY</span>
        <span className="dcb-cell-line">{"\u00a0"}</span>
      </DcbCell>
      <DcbCell
        kind="toggle"
        ariaLabel="Localizer map"
        dataDcbMap="loc"
        pressed={view.showLocalizer}
        onClick={() => mapClick(view, onChange, "localizer")}
      >
        <span className="dcb-cell-line">LOC</span>
        <span className="dcb-cell-line">{"\u00a0"}</span>
      </DcbCell>
      <DcbCell
        kind="toggle"
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
      <DcbCell
        kind="toggle"
        ariaLabel="Predicted track line"
        dataDcb="ptl"
        pressed={view.ptlOn}
        onClick={() => runCell(view, onChange, () => togglePtlOn(view))}
      >
        <span className="dcb-cell-line">PTL</span>
        <span className="dcb-cell-line">{view.ptlOn ? "ON" : "OFF"}</span>
      </DcbCell>
      <DcbCell
        kind="toggle"
        ariaLabel="History"
        dataDcb="hist"
        pressed={view.historyEnabled}
        onClick={() => runCell(view, onChange, () => toggleHistoryEnabled(view))}
      >
        <span className="dcb-cell-line">HIST</span>
        <span className="dcb-cell-line">{view.historyEnabled ? "ON" : "OFF"}</span>
      </DcbCell>
      {renderShift(view, onChange)}
    </>
  );
}

function renderAux(view: ScopeView, onChange: () => void) {
  return (
    <>
      {renderShift(view, onChange)}
      <DcbCell kind="disabled" ariaLabel="Volume" dataDcb="vol" disabled onClick={() => undefined}>
        <span className="dcb-cell-line">VOL</span>
        <span className="dcb-cell-line">{"\u00a0"}</span>
      </DcbCell>
    </>
  );
}

function renderMaps(view: ScopeView, onChange: () => void) {
  const coastOn = isCoastlineToggleEnabled(view);
  const catalog = dcbCatalogMaps(view);
  return (
    <>
      {renderDone(view, onChange)}
      {catalog.map((map) => {
        const coastOff = map.role === "coastline" && !coastOn;
        return (
          <DcbCell
            key={map.id}
            kind={coastOff ? "disabled" : "toggle"}
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

  return (
    <div
      id={DCB_ID}
      className="dcb"
      role="group"
      aria-label="Display control bar"
      data-dcb-menu={menu}
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
      {menu === "AUX"
        ? renderAux(view, onChange)
        : menu === "MAPS"
          ? renderMaps(view, onChange)
          : menu === "LDR"
            ? renderLdr(view, onChange, world)
            : renderMain(view, onChange, world)}
    </div>
  );
}
