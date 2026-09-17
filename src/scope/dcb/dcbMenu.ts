/**
 * Analog: CRC STARS DCB MAIN / AUX / SHIFT / DONE / spinner arm+wheel (R07).
 * Trainer subset: MAIN↔AUX via SHIFT; submenus replace the bar; DONE / Esc
 * return to MAIN. Spinner is arm → step → commit (no requestPointerLock).
 * Armed spinner / open submenu clamps the cursor to that cell or the DCB boxes.
 * Not a toolbar or modal. Not NAS STARS.
 *
 * Scope display state only. Never a Command, readback, or intent.
 */

export type DcbMenu =
  | "MAIN"
  | "AUX"
  | "MAPS"
  | "LDR"
  | "BRITE"
  | "CHAR_SIZE"
  | "PREF"
  | "SSA_FILTER"
  | "GI_FILTER"
  | "TPA_ATPA"
  | "SITE";

export type DcbCellKind = "action" | "toggle" | "spinner" | "submenu" | "disabled";

/**
 * Momentary caps (actions, submenu openers, and spinners) are not latches.
 * Hold or click shows the inset bevel, then they pop back. CRC analog; not a
 * CSS animation. Toggle caps retain their pressed state.
 */
export const DCB_ACTION_FLASH_MS = 70;

export function dcbActionCapPressed(latched: boolean | undefined, flashing: boolean): boolean {
  return latched === true || flashing;
}

export type CharSizeSpinnerCell =
  "CHAR_DATA_BLOCKS" | "CHAR_LISTS" | "CHAR_DCB" | "CHAR_TOOLS" | "CHAR_POS";

export type BriteSpinnerCell =
  | "BRITE_DCB"
  | "BRITE_MPA"
  | "BRITE_MPB"
  | "BRITE_FDB"
  | "BRITE_LST"
  | "BRITE_POS"
  | "BRITE_LDB"
  | "BRITE_OTH"
  | "BRITE_TLS"
  | "BRITE_RR"
  | "BRITE_HST"
  | "BRITE_WX"
  | "BRITE_WXC"
  | "BRITE_BKC"
  | "BRITE_CMP"
  | "BRITE_BCN"
  | "BRITE_PRI";

import { LEADER_LENGTH_STEPS_PX } from "../leader";

export type DcbSpinnerCell =
  | "RANGE"
  | "RR"
  | "LDR_DIR"
  | "LDR_LENGTH"
  | "LDR_LEN"
  | "HISTORY"
  | "H_RATE"
  | "DWELL"
  | "CSR_SPD"
  | "PTL"
  | "TPA_MI"
  | "VOL"
  | "MODE_FSL"
  | CharSizeSpinnerCell
  | BriteSpinnerCell;

export interface DcbSpinnerState {
  armed: boolean;
  cell: DcbSpinnerCell | null;
  buffer: string;
  initialValue: number | null;
}

/** Structural host so this module stays DOM-free and does not import scopeView. */
export interface DcbMenuHost {
  dcbMenu: DcbMenu;
  dcbSpinner: DcbSpinnerState;
}

export function idleDcbSpinner(): DcbSpinnerState {
  return { armed: false, cell: null, buffer: "", initialValue: null };
}

export const idleDcbSpinnerState = idleDcbSpinner;

export function isDcbSubmenu(menu: DcbMenu): boolean {
  return menu !== "MAIN" && menu !== "AUX";
}

interface SpinnerHostCandidate {
  camera?: { rangeNm?: number };
  ringIntervalNm?: number;
  rrIntervalNm?: number;
  showRings?: boolean;
  mapCache?: unknown;
  leaderLengthPx?: number;
  leaderLength?: number;
  defaultLeaderLength?: number;
  defaultLeaderDir?: number;
  ptlMinutes?: number;
  ptlOn?: boolean;
  historyDotCount?: number;
  lastHistoryDotCount?: number;
  historyEnabled?: boolean;
  historyRateSec?: number;
  cursorSpeed?: number;
  vol?: number;
  tpa?: { radiusNm?: number };
  brite?: Record<string, number>;
  charSizes?: Record<string, number>;
  charSizePx?: number;
}

function getSpinnerCellValue(host: DcbMenuHost, cell: DcbSpinnerCell): number | null {
  const h = host as unknown as SpinnerHostCandidate;
  switch (cell) {
    case "RANGE":
      return typeof h.camera?.rangeNm === "number" ? h.camera.rangeNm : null;
    case "RR":
      return typeof h.ringIntervalNm === "number"
        ? h.ringIntervalNm
        : typeof h.rrIntervalNm === "number"
          ? h.rrIntervalNm
          : null;
    case "LDR_LENGTH":
    case "LDR_LEN": {
      if (typeof h.leaderLengthPx === "number") {
        const idx = (LEADER_LENGTH_STEPS_PX as readonly number[]).indexOf(h.leaderLengthPx);
        return idx >= 0 ? idx : Math.round(h.leaderLengthPx / 12);
      }
      if (typeof h.leaderLength === "number") return h.leaderLength;
      if (typeof h.defaultLeaderLength === "number") return h.defaultLeaderLength;
      return null;
    }
    case "LDR_DIR":
      return typeof h.defaultLeaderDir === "number" ? h.defaultLeaderDir : null;
    case "PTL":
      return typeof h.ptlMinutes === "number" ? h.ptlMinutes : null;
    case "HISTORY":
      return typeof h.historyDotCount === "number" ? h.historyDotCount : null;
    case "H_RATE":
      return typeof h.historyRateSec === "number" ? h.historyRateSec : null;
    case "CSR_SPD":
      return typeof h.cursorSpeed === "number" ? h.cursorSpeed : null;
    case "VOL":
      return typeof h.vol === "number" ? h.vol : null;
    case "TPA_MI":
      return typeof h.tpa?.radiusNm === "number" ? h.tpa.radiusNm : null;
    default:
      if (cell.startsWith("BRITE_")) {
        const channel = cell.slice(6).toLowerCase();
        return typeof h.brite?.[channel] === "number" ? h.brite[channel] : null;
      }
      if (cell.startsWith("CHAR_")) {
        const sub =
          cell === "CHAR_DATA_BLOCKS"
            ? "dataBlocks"
            : cell === "CHAR_LISTS"
              ? "lists"
              : cell === "CHAR_DCB"
                ? "dcb"
                : cell === "CHAR_TOOLS"
                  ? "tools"
                  : "pos";
        return typeof h.charSizes?.[sub] === "number" ? h.charSizes[sub] : null;
      }
      return null;
  }
}

function setSpinnerCellValue(host: DcbMenuHost, cell: DcbSpinnerCell, val: number): void {
  const h = host as unknown as SpinnerHostCandidate;
  switch (cell) {
    case "RANGE":
      if (h.camera && typeof h.camera === "object") {
        h.camera.rangeNm = val;
      }
      break;
    case "RR":
      if ("ringIntervalNm" in h) {
        h.ringIntervalNm = val;
      }
      if ("rrIntervalNm" in h) {
        h.rrIntervalNm = val;
      }
      if ("showRings" in h) {
        h.showRings = val > 0;
      }
      if ("mapCache" in h) {
        h.mapCache = null;
      }
      break;
    case "LDR_LENGTH":
    case "LDR_LEN": {
      const step = Math.max(0, Math.min(7, Math.round(val)));
      const px = LEADER_LENGTH_STEPS_PX[step] ?? step * 12;
      if ("leaderLengthPx" in h) {
        h.leaderLengthPx = px;
      }
      if ("leaderLength" in h) {
        h.leaderLength = step;
      }
      if ("defaultLeaderLength" in h) {
        h.defaultLeaderLength = step;
      }
      break;
    }
    case "LDR_DIR":
      if ("defaultLeaderDir" in h) {
        h.defaultLeaderDir = val;
      }
      break;
    case "PTL":
      if ("ptlMinutes" in h) {
        h.ptlMinutes = val;
      }
      if ("ptlOn" in h) {
        h.ptlOn = true;
      }
      break;
    case "HISTORY":
      if ("historyDotCount" in h) {
        h.historyDotCount = val;
      }
      if (val > 0 && "lastHistoryDotCount" in h) {
        h.lastHistoryDotCount = val;
      }
      if ("historyEnabled" in h) {
        h.historyEnabled = val > 0;
      }
      break;
    case "H_RATE":
      if ("historyRateSec" in h) {
        h.historyRateSec = val;
      }
      break;
    case "CSR_SPD":
      if ("cursorSpeed" in h) {
        h.cursorSpeed = val;
      }
      break;
    case "VOL":
      if ("vol" in h) {
        h.vol = val;
      }
      break;
    case "TPA_MI":
      if (h.tpa && typeof h.tpa === "object") {
        h.tpa.radiusNm = val;
      }
      break;
    default:
      if (cell.startsWith("BRITE_")) {
        const channel = cell.slice(6).toLowerCase();
        if (h.brite && typeof h.brite === "object") {
          h.brite[channel] = val;
        }
      } else if (cell.startsWith("CHAR_")) {
        const sub =
          cell === "CHAR_DATA_BLOCKS"
            ? "dataBlocks"
            : cell === "CHAR_LISTS"
              ? "lists"
              : cell === "CHAR_DCB"
                ? "dcb"
                : cell === "CHAR_TOOLS"
                  ? "tools"
                  : "pos";
        if (h.charSizes && typeof h.charSizes === "object") {
          h.charSizes[sub] = val;
          if (sub === "dataBlocks" && "charSizePx" in h) {
            h.charSizePx = val;
          }
        }
      }
      break;
  }
}

export function validateDcbSpinnerValue(cell: DcbSpinnerCell, val: number): boolean {
  if (isNaN(val) || !isFinite(val)) {
    return false;
  }
  switch (cell) {
    case "RANGE":
      return Number.isInteger(val) && val >= 6 && val <= 512;
    case "RR":
      return [2, 5, 10, 20].includes(val);
    case "LDR_LENGTH":
    case "LDR_LEN":
      return Number.isInteger(val) && val >= 0 && val <= 7;
    case "PTL":
      return val >= 0 && val <= 5.0 && Math.abs(val * 2 - Math.round(val * 2)) < 1e-6;
    case "VOL":
      return Number.isInteger(val) && val >= 0 && val <= 7;
    case "CSR_SPD":
      return Number.isInteger(val) && val >= 1 && val <= 5;
    case "HISTORY":
      return Number.isInteger(val) && val >= 0 && val <= 9;
    case "H_RATE":
      return val >= 1.0 && val <= 10.0;
    case "LDR_DIR":
      return Number.isInteger(val) && val >= 1 && val <= 9;
    case "TPA_MI":
      return [2, 3, 5, 10].includes(val) || (val > 0 && val <= 50);
    default:
      if (cell.startsWith("BRITE_")) {
        return Number.isInteger(val) && val >= 0 && val <= 100;
      }
      if (cell.startsWith("CHAR_")) {
        return Number.isInteger(val) && val >= 0 && val <= 50;
      }
      return true;
  }
}

export function cancelDcbSpinner(host: DcbMenuHost): boolean {
  if (!host.dcbSpinner.armed) {
    return false;
  }
  if (host.dcbSpinner.cell && host.dcbSpinner.initialValue !== null) {
    setSpinnerCellValue(host, host.dcbSpinner.cell, host.dcbSpinner.initialValue);
  }
  host.dcbSpinner.armed = false;
  host.dcbSpinner.cell = null;
  host.dcbSpinner.buffer = "";
  host.dcbSpinner.initialValue = null;
  return true;
}

export function armDcbSpinner(host: DcbMenuHost, cell: DcbSpinnerCell): void {
  host.dcbSpinner.armed = true;
  host.dcbSpinner.cell = cell;
  host.dcbSpinner.buffer = "";
  host.dcbSpinner.initialValue = getSpinnerCellValue(host, cell);
}

export function inputDcbSpinnerKey(host: DcbMenuHost, key: string): boolean {
  if (!host.dcbSpinner.armed) {
    return false;
  }
  if (/^[0-9]$/.test(key)) {
    host.dcbSpinner.buffer += key;
    return true;
  }
  if (key === ".") {
    if (!host.dcbSpinner.buffer.includes(".")) {
      host.dcbSpinner.buffer += key;
    }
    return true;
  }
  return false;
}

export function backspaceDcbSpinner(host: DcbMenuHost): boolean {
  if (!host.dcbSpinner.armed) {
    return false;
  }
  if (host.dcbSpinner.buffer.length > 0) {
    host.dcbSpinner.buffer = host.dcbSpinner.buffer.slice(0, -1);
  }
  return true;
}

export function commitDcbSpinner(host: DcbMenuHost): boolean {
  if (!host.dcbSpinner.armed || !host.dcbSpinner.cell) {
    return false;
  }
  const cell = host.dcbSpinner.cell;
  const buffer = host.dcbSpinner.buffer.trim();
  let success = true;

  if (buffer.length > 0) {
    const num = Number(buffer);
    if (!isNaN(num) && validateDcbSpinnerValue(cell, num)) {
      setSpinnerCellValue(host, cell, num);
      success = true;
    } else {
      if (host.dcbSpinner.initialValue !== null) {
        setSpinnerCellValue(host, cell, host.dcbSpinner.initialValue);
      }
      success = false;
    }
  } else {
    success = true;
  }

  host.dcbSpinner.armed = false;
  host.dcbSpinner.cell = null;
  host.dcbSpinner.buffer = "";
  host.dcbSpinner.initialValue = null;
  return success;
}

/**
 * Wheel step while armed. Returns false if the spinner is idle (no mutation).
 */
export function stepDcbSpinner(
  host: DcbMenuHost,
  delta: -1 | 1,
  apply: (delta: -1 | 1) => void,
): boolean {
  if (!host.dcbSpinner.armed) {
    return false;
  }
  apply(delta);
  if (host.dcbSpinner.cell) {
    const current = getSpinnerCellValue(host, host.dcbSpinner.cell);
    if (current !== null) {
      host.dcbSpinner.initialValue = current;
      host.dcbSpinner.buffer = String(current);
    } else {
      host.dcbSpinner.buffer = "";
    }
  }
  return true;
}

/** SHIFT on MAIN opens AUX; SHIFT on AUX returns MAIN. Cancels an armed spinner. */
export function applyDcbShift(host: DcbMenuHost): void {
  cancelDcbSpinner(host);
  if (host.dcbMenu === "AUX") {
    host.dcbMenu = "MAIN";
    return;
  }
  if (host.dcbMenu === "MAIN") {
    host.dcbMenu = "AUX";
  }
}

export function openDcbMenu(host: DcbMenuHost, menu: DcbMenu): void {
  cancelDcbSpinner(host);
  host.dcbMenu = menu;
}

export function toggleDcbMenu(host: DcbMenuHost, menu: "MAPS" | "LDR"): void {
  cancelDcbSpinner(host);
  host.dcbMenu = host.dcbMenu === menu ? "MAIN" : menu;
}

/** DONE: leave a submenu (or AUX) for MAIN. */
export function closeDcbMenu(host: DcbMenuHost): void {
  cancelDcbSpinner(host);
  host.dcbMenu = "MAIN";
}

/**
 * Esc: if a spinner is armed, disarm with no extra mutation.
 * Else if a submenu is open, return to MAIN.
 */
export function handleDcbEscape(host: DcbMenuHost): boolean {
  if (cancelDcbSpinner(host)) {
    return true;
  }
  if (isDcbSubmenu(host.dcbMenu)) {
    host.dcbMenu = "MAIN";
    return true;
  }
  return false;
}
