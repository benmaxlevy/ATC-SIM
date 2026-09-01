/**
 * Analog: CRC STARS DCB AUX and submenu layouts (R07). Trainer delta: SHIFT
 * swaps MAIN and AUX; MAPS / TPA-ATPA / CHAR SIZE / BRITE / SSA FILTER / GI TEXT
 * / PREF / LDR / SITE replace the bar; DONE / Esc return to MAIN. Clicks call
 * the same `src/scope` functions as the keyboard. Never a Command, readback, or
 * intent.
 */

import type { ReactNode } from "react";
import {
  applyDcbLeaderDir,
  applyDcbPrefDefaults,
  armDcbSpinner,
  browserDcbPrefStorage,
  closeDcbMenu,
  commitDcbSpinner,
  clearAllVideoMaps,
  DCB_LEADER_DIRS,
  dcbLeaderDirReadout,
  dcbMapsPageSlotNumbers,
  deleteDcbPref,
  formatDcbBriteReadout,
  formatDcbCharReadout,
  formatDcbHistoryReadout,
  formatDcbHistoryRateReadout,
  formatDcbCursorSpeedReadout,
  formatDcbDwellReadout,
  formatDcbPtlMinutesReadout,
  formatDcbTpaMiReadout,
  formatDcbVolReadout,
  openDcbMenu,
  persistDcbPref,
  restoreDcbPrefSession,
  beginDcbPrefSaveAs,
  beginPrefNameEntry,
  saveDcbPref,
  selectDcbPrefSlot,
  setDcbDock,
  stepBriteChannel,
  stepCharSizeChannel,
  stepDcbVol,
  stepHistoryDots,
  stepHistoryRate,
  stepCursorSpeed,
  stepDwellMode,
  cycleDwellMode,
  toggleCursorHome,
  stepPtlLength,
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
  SSA_FILTER_FIELDS,
  type BriteChannel,
  type CharSizeChannel,
  type CharSizes,
  type DcbSpinnerCell,
  type ScopeView,
} from "@scope";
import {
  DCB_HISTORY_READOUT_ID,
  DCB_HISTORY_RATE_READOUT_ID,
  DCB_CURSOR_SPEED_READOUT_ID,
  DCB_DWELL_READOUT_ID,
  DCB_PTL_MINUTES_READOUT_ID,
  DCB_TPA_MI_READOUT_ID,
  DcbCell,
  afterCell,
  cancelFilterIfEntering,
  historySpinnerArmed,
  onSpinnerWheel,
  ptlSpinnerArmed,
  renderDone,
  renderMapSlot,
  renderShift,
  runAuxCell,
  spinnerArmed,
  toggleSpinner,
  tpaMiSpinnerArmed,
  type DcbCellProps,
  type DisplayControlBarProps,
} from "./dcbChrome";

export function renderAux(view: ScopeView, onChange: () => void) {
  const volArmed = spinnerArmed(view, "VOL");
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
          kind="spinner"
          ariaLabel="Volume"
          dataDcb="vol"
          pressed={volArmed}
          onClick={() => {
            cancelFilterIfEntering(view);
            if (volArmed) {
              commitDcbSpinner(view);
            } else {
              armDcbSpinner(view, "VOL");
            }
            afterCell(onChange);
          }}
          onWheel={(event) =>
            onSpinnerWheel(view, "VOL", event, (step) => stepDcbVol(view, step), onChange)
          }
          onDragDelta={(step) => {
            for (let i = 0; i < Math.abs(step); i++) {
              stepDcbVol(view, step > 0 ? 1 : -1);
            }
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">VOL</span>
          <span className="dcb-cell-line">{formatDcbVolReadout(view.vol ?? 2)}</span>
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
        <DcbCell
          kind="spinner"
          ariaLabel="History rate"
          dataDcb="h-rate"
          pressed={spinnerArmed(view, "H_RATE")}
          onClick={() => toggleSpinner(view, onChange, "H_RATE")}
          onWheel={(event) =>
            onSpinnerWheel(view, "H_RATE", event, (step) => stepHistoryRate(view, step), onChange)
          }
          onDragDelta={(step) => {
            for (let i = 0; i < Math.abs(step); i++) {
              stepHistoryRate(view, step > 0 ? 1 : -1);
            }
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">H_RATE</span>
          <span id={DCB_HISTORY_RATE_READOUT_ID} className="dcb-cell-line">
            {formatDcbHistoryRateReadout(view.historyRateSec)}
          </span>
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
        <DcbCell
          kind="spinner"
          ariaLabel="Dwell mode"
          dataDcb="dwell"
          pressed={spinnerArmed(view, "DWELL")}
          onClick={() => toggleSpinner(view, onChange, "DWELL")}
          onWheel={(event) =>
            onSpinnerWheel(view, "DWELL", event, (step) => stepDwellMode(view, step), onChange)
          }
          onDragDelta={(step) => {
            for (let i = 0; i < Math.abs(step); i++) {
              stepDwellMode(view, step > 0 ? 1 : -1);
            }
            afterCell(onChange);
          }}
        >
          <span className="dcb-cell-line">DWELL</span>
          <span id={DCB_DWELL_READOUT_ID} className="dcb-cell-line">
            {formatDcbDwellReadout(view.dwellMode)}
          </span>
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

export function renderTpaAtpa(view: ScopeView, onChange: () => void) {
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

export function renderSsaFilter(view: ScopeView, onChange: () => void) {
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
        <DcbCell
          kind="toggle"
          ariaLabel="SSA WX"
          dataDcb="ssa-wx"
          pressed={view.ssaFilter.WX}
          onClick={() => {
            cancelFilterIfEntering(view);
            toggleSsaFilter(view, "WX");
            afterCell(onChange);
          }}
        >
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

export function renderGiSlotCell(view: ScopeView, onChange: () => void, slot: number) {
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

export function renderGiFilter(view: ScopeView, onChange: () => void) {
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

export function renderMaps(view: ScopeView, onChange: () => void) {
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

export function renderLdr(
  view: ScopeView,
  onChange: () => void,
  world: DisplayControlBarProps["world"],
) {
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

export function renderCharSize(view: ScopeView, onChange: () => void) {
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
  { id: "bkc", col: 1, row: 2, rowSpan: 1, channel: "bkc", label: "BKC" },
  { id: "mpa", col: 2, row: 1, rowSpan: 1, channel: "mpa", label: "MPA" },
  { id: "mpb", col: 2, row: 2, rowSpan: 1, channel: "mpb", label: "MPB" },
  { id: "fdb", col: 3, row: 1, rowSpan: 1, channel: "fdb", label: "FDB" },
  { id: "lst", col: 3, row: 2, rowSpan: 1, channel: "lst", label: "LST" },
  { id: "pos", col: 4, row: 1, rowSpan: 1, channel: "pos", label: "POS" },
  { id: "ldb", col: 4, row: 2, rowSpan: 1, channel: "ldb", label: "LDB" },
  { id: "oth", col: 5, row: 1, rowSpan: 1, channel: "oth", label: "OTH" },
  { id: "tls", col: 5, row: 2, rowSpan: 1, channel: "tls", label: "TLS" },
  { id: "rr", col: 6, row: 1, rowSpan: 1, channel: "rr", label: "RR" },
  { id: "cmp", col: 6, row: 2, rowSpan: 1, channel: "cmp", label: "CMP" },
  { id: "bcn", col: 7, row: 1, rowSpan: 1, channel: "bcn", label: "BCN" },
  { id: "pri", col: 7, row: 2, rowSpan: 1, channel: "pri", label: "PRI" },
  { id: "hst", col: 8, row: 1, rowSpan: 1, channel: "hst", label: "HST" },
  { id: "wx", col: 8, row: 2, rowSpan: 1, channel: "wx", label: "WX" },
  { id: "wxc", col: 9, row: 1, rowSpan: 1, channel: "wxc", label: "WXC" },
  { id: "blank1", col: 9, row: 2, rowSpan: 1, label: "", disabled: true },
  { id: "done", col: 10, row: 1, rowSpan: 2, label: "DONE" },
];

export function renderBrite(view: ScopeView, onChange: () => void) {
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

export function prefStore() {
  return browserDcbPrefStorage() ?? undefined;
}

export function renderPref(view: ScopeView, onChange: () => void) {
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
            beginDcbPrefSaveAs(view);
            beginPrefNameEntry(view.preview, Date.now());
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
