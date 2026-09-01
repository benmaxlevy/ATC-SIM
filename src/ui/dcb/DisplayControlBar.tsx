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
 * WX1–6 latch `view.wxLevels` (VIP 1–6). Disabled CRDA cell on SSA FILTER
 * is chrome only. MAIN SITE opens FUSED / MULTI / one cap per adapted
 * `radarSites` row (R05 FOA display data). CRC R07 SITE is disabled in its
 * FUSION-only analog; this trainer lifts that. Empty sites keep FUSED only.
 * MODE FSL stays disabled. PREF is 32 local slots (not a NAS host). SAVE AS names via
 * the preview-area buffer (R07 analog; no window.prompt / HTML input). MAIN
 * PREF shows the active set name. No CSA / FMA (R06). Discrete **range** presets only.
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

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  PALETTE,
  SCOPE_FONT_STACK,
  applyBrite,
  applyRrCenter,
  armDcbSpinner,
  armPlaceCenter,
  armPlaceRangeRing,
  beginAltitudeFilterChord,
  cancelDcbSpinner,
  centerOnAirport,
  closeDcbMenu,
  commitDcbSpinner,
  dcbLeaderDirReadout,
  DCB_QUICK_MAP_COUNT,
  formatDcbLdrLengthReadout,
  formatDcbRangeReadout,
  formatDcbRrReadout,
  formatFilterBand,
  isLeaderDir,
  isRangeRingOffViewCenter,
  isVerticalDcbDock,
  isViewOffAirport,
  openDcbMenu,
  stepDcbLeaderDir,
  stepDcbLeaderLength,
  stepModeFsl,
  stepRange,
  stepRrInterval,
  type ScopeView,
} from "@scope";
import { MAIN_DCB_LAYOUT } from "./dcbLayouts";
import { useDcbCursorTrap } from "./useDcbCursorTrap";
import {
  DCB_FILTER_BAND_ID,
  DCB_HEIGHT_PX,
  DCB_ID,
  DCB_LDR_LENGTH_READOUT_ID,
  DCB_LDR_READOUT_ID,
  DCB_RANGE_READOUT_ID,
  DCB_RR_READOUT_ID,
  DcbCell,
  afterCell,
  applyDirectNumericInput,
  cancelFilterIfEntering,
  onSpinnerWheel,
  renderMapSlot,
  renderPrefOpener,
  renderShift,
  renderSite,
  renderSiteOpener,
  renderWxCell,
  runCell,
  spinnerArmed,
  toggleSpinner,
  type DcbCellProps,
  type DisplayControlBarProps,
} from "./dcbChrome";
import {
  renderAux,
  renderBrite,
  renderCharSize,
  renderGiFilter,
  renderLdr,
  renderMaps,
  renderPref,
  renderSsaFilter,
  renderTpaAtpa,
} from "./DisplayControlBarMenus";

export type { DcbCellKind, MainDcbLayoutCell } from "./dcbLayouts";
export { MAIN_DCB_LAYOUT } from "./dcbLayouts";
export {
  DCB_BRITE_READOUT_ID,
  DCB_CHAR_READOUT_ID,
  DCB_FILTER_BAND_ID,
  DCB_FONT_PX,
  DCB_HEIGHT_PX,
  DCB_HISTORY_READOUT_ID,
  DCB_ID,
  DCB_LDR_LENGTH_READOUT_ID,
  DCB_LDR_READOUT_ID,
  DCB_LITE_FONT_PX,
  DCB_LITE_HEIGHT_PX,
  DCB_LITE_ID,
  DCB_PTL_MINUTES_READOUT_ID,
  DCB_RANGE_OFFSET_ID,
  DCB_RANGE_READOUT_ID,
  DCB_RNG_READOUT_ID,
  DCB_RR_READOUT_ID,
  DCB_SITE_READOUT_ID,
  DCB_TPA_MI_READOUT_ID,
  type DisplayControlBarProps,
} from "./dcbChrome";
export { BRITE_GRID_LAYOUT, CHAR_SIZE_DCB_LAYOUT } from "./DisplayControlBarMenus";
export { syncDisplayControlBar } from "./dcbChrome";

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
      case "site-fused":
        return renderSiteOpener(view, onChange);
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
      case "mode-fsl":
        return (
          <DcbCell
            kind="spinner"
            ariaLabel="Mode FSL"
            dataDcb="mode-fsl"
            pressed={spinnerArmed(view, "MODE_FSL")}
            onClick={() => toggleSpinner(view, onChange, "MODE_FSL")}
            onWheel={(event) =>
              onSpinnerWheel(view, "MODE_FSL", event, (step) => stepModeFsl(view, step), onChange)
            }
            onDragDelta={(step) => {
              for (let i = 0; i < Math.abs(step); i++) {
                stepModeFsl(view, step > 0 ? 1 : -1);
              }
              afterCell(onChange);
            }}
          >
            <span className="dcb-cell-line">MODE</span>
            <span className="dcb-cell-line">{view.modeFsl}</span>
          </DcbCell>
        );
      case "shift":
        return renderShift(view, onChange);
      default:
        if (id.startsWith("map-")) {
          return renderMapSlot(view, onChange, Number(id.slice(4)));
        }
        if (id.startsWith("wx")) {
          const n = Number(id.slice(2));
          if (n >= 1 && n <= 6) {
            return renderWxCell(view, onChange, n as 1 | 2 | 3 | 4 | 5 | 6);
          }
        }
        return disabled(id, id.toUpperCase());
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
      {([1, 2, 3, 4, 5, 6] as const).map((n) => renderWxCell(view, onChange, n))}
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
        height: vertical ? "100%" : DCB_HEIGHT_PX,
        width: vertical ? DCB_HEIGHT_PX : "100%",
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
                        : menu === "SITE"
                          ? renderSite(view, onChange)
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
