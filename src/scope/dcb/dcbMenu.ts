/**
 * Analog: CRC STARS DCB MAIN / AUX / SHIFT / DONE / spinner arm+wheel (R07).
 * Trainer subset: MAIN↔AUX via SHIFT; submenus replace the bar; DONE / Esc
 * return to MAIN. Spinner is arm → step → commit (no requestPointerLock).
 * Armed spinner / open submenu clamps the cursor to that cell or the DCB boxes.
 * Not a toolbar or modal. Not NAS STARS.
 *
 * Scope display state only. Never a Command, readback, or intent.
 */

import { CHAR_SIZE_STEPS_PX, DCB_CHAR_SIZE_STEPS_PX, POS_SIZE_STEPS_PX } from "../fonts";
import { FMA_RUNWAY_DIR_TO_KEYPAD, FMA_RUNWAY_KEYPAD_TO_DIR } from "./dcbFunctions";
import { getFmaMaximumPtlSeconds } from "./dcbPref";

function charSpinnerValues(cell: string): readonly number[] {
  return cell === "CHAR_DCB"
    ? DCB_CHAR_SIZE_STEPS_PX
    : cell === "CHAR_POS"
      ? POS_SIZE_STEPS_PX
      : CHAR_SIZE_STEPS_PX;
}

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
  | "SITE"
  | "MODE";

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
  | "BRITE_PRI"
  | "BRITE_AMZ"
  | "BRITE_NTZ"
  | "BRITE_RWY"
  | "BRITE_REF";

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
  | "MAG"
  | "FMA_AMZ"
  | "FMA_PTL"
  | "FMA_VOICE"
  | `FMA_LDR_${string}`
  | CharSizeSpinnerCell
  | BriteSpinnerCell;

export type SpinnerCommittedValue = string | number | null;

export interface DcbSpinnerState {
  armed: boolean;
  cell: DcbSpinnerCell | null;
  buffer: string;
  initialValue: number | null;
  initialStringValue?: string | null;
  initialShowRings?: boolean;
  initialMapCache?: unknown;
  initialPtlOn?: boolean;
  onCancel?: () => void;
  onCommit?: (cell: DcbSpinnerCell, value: SpinnerCommittedValue) => void;
}

/** Structural host so this module stays DOM-free and does not import scopeView. */
export interface DcbMenuHost {
  dcbMenu: DcbMenu;
  dcbMenuParent?: "MAIN" | "AUX";
  dcbSpinner: DcbSpinnerState;
}

export function idleDcbSpinner(): DcbSpinnerState {
  return { armed: false, cell: null, buffer: "", initialValue: null };
}

export const idleDcbSpinnerState = idleDcbSpinner;

export function isDcbSubmenu(menu: DcbMenu): boolean {
  return menu !== "MAIN" && menu !== "AUX";
}

export function isFmaDcbSpinnerCell(cell: DcbSpinnerCell | null): boolean {
  if (!cell) return false;
  return (
    cell === "MAG" ||
    cell === "FMA_AMZ" ||
    cell === "FMA_PTL" ||
    cell === "FMA_VOICE" ||
    cell.startsWith("FMA_LDR_") ||
    cell === "BRITE_NTZ" ||
    cell === "BRITE_AMZ" ||
    cell === "BRITE_RWY" ||
    cell === "BRITE_REF"
  );
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
  fmaMag?: number;
  fmaPtlSeconds?: number;
  fmaVoiceLevel?: number;
  fmaRunwayLeaders?: Map<string, number | null>;
  fmaSurveillance?: { enabled: boolean; selectedAmzId: string | null };
  fmaAmzs?: Array<{ id: string; label?: string; monitoring?: { maximumPtlS?: number } }>;
  lastWarning?: string | null;
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
    case "MAG":
      return typeof h.fmaMag === "number" ? h.fmaMag : null;
    case "FMA_PTL":
      return typeof h.fmaPtlSeconds === "number" ? h.fmaPtlSeconds : null;
    case "FMA_VOICE":
      return typeof h.fmaVoiceLevel === "number" ? h.fmaVoiceLevel : null;
    case "FMA_AMZ":
      return null;
    default:
      if (cell.startsWith("FMA_LDR_")) {
        const rwy = cell.slice(8);
        const dir = h.fmaRunwayLeaders?.get(rwy) as number | null | undefined;
        return dir == null ? 5 : (FMA_RUNWAY_DIR_TO_KEYPAD[dir] ?? 5);
      }
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
        return typeof h.charSizes?.[sub] === "number"
          ? charSpinnerValues(cell).indexOf(h.charSizes[sub])
          : null;
      }
      return null;
  }
}

export interface DcbSpinnerArmOptions {
  onCancel?: () => void;
  onCommit?: (cell: DcbSpinnerCell, value: SpinnerCommittedValue) => void;
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
        h.ptlOn = val > 0;
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
    case "MAG":
      if ("fmaMag" in h) {
        h.fmaMag = val;
      }
      break;
    case "FMA_PTL":
      if ("fmaPtlSeconds" in h) {
        h.fmaPtlSeconds = val;
      }
      break;
    case "FMA_VOICE":
      if ("fmaVoiceLevel" in h) {
        h.fmaVoiceLevel = val;
      }
      break;
    default:
      if (cell.startsWith("FMA_LDR_")) {
        const rwy = cell.slice(8);
        if (h.fmaRunwayLeaders) {
          h.fmaRunwayLeaders.set(rwy, FMA_RUNWAY_KEYPAD_TO_DIR[val] ?? null);
        }
      } else if (cell.startsWith("BRITE_")) {
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
          const token = charSpinnerValues(cell)[val];
          if (token === undefined) return;
          h.charSizes[sub] = token;
          if (sub === "dataBlocks" && "charSizePx" in h) {
            h.charSizePx = token;
          }
        }
      }
      break;
  }
}

export function validateDcbSpinnerValue(
  cell: DcbSpinnerCell,
  val: number,
  maximumFmaPtlSeconds = 30,
): boolean {
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
      return Number.isInteger(val) && val >= 0 && val <= 5;
    case "CSR_SPD":
      return Number.isInteger(val) && val >= 1 && val <= 5;
    case "HISTORY":
      return Number.isInteger(val) && val >= 0 && val <= 9;
    case "H_RATE":
      return val >= 1.0 && val <= 10.0;
    case "LDR_DIR":
      return Number.isInteger(val) && val >= 1 && val <= 9 && val !== 5;
    case "TPA_MI":
      return [2, 3, 5, 10].includes(val) || (val > 0 && val <= 50);
    case "MAG":
      return Number.isInteger(val) && val >= 1 && val <= 8;
    case "FMA_PTL":
      return Number.isInteger(val) && val >= 0 && val <= maximumFmaPtlSeconds;
    case "FMA_VOICE":
      return Number.isInteger(val) && val >= 1 && val <= 10;
    default:
      if (cell.startsWith("FMA_LDR_")) {
        return Number.isInteger(val) && val >= 1 && val <= 9;
      }
      if (cell === "BRITE_NTZ") {
        return Number.isInteger(val) && val >= 50 && val <= 100;
      }
      if (cell === "BRITE_AMZ" || cell === "BRITE_RWY" || cell === "BRITE_REF") {
        return Number.isInteger(val) && (val === 0 || (val >= 5 && val <= 100));
      }
      if (cell.startsWith("BRITE_")) {
        return Number.isInteger(val) && val >= 0 && val <= 100;
      }
      if (cell.startsWith("CHAR_")) {
        return Number.isInteger(val) && val >= 0 && val < charSpinnerValues(cell).length;
      }
      return true;
  }
}

function restoreDcbSpinnerCoupledState(host: DcbMenuHost): void {
  const h = host as unknown as SpinnerHostCandidate;
  if (host.dcbSpinner.initialShowRings !== undefined && "showRings" in h) {
    h.showRings = host.dcbSpinner.initialShowRings;
  }
  if (host.dcbSpinner.initialMapCache !== undefined && "mapCache" in h) {
    h.mapCache = host.dcbSpinner.initialMapCache;
  }
  if (host.dcbSpinner.initialPtlOn !== undefined && "ptlOn" in h) {
    h.ptlOn = host.dcbSpinner.initialPtlOn;
  }
  host.dcbSpinner.onCancel?.();
}

export function cancelDcbSpinner(host: DcbMenuHost): boolean {
  if (!host.dcbSpinner.armed) {
    return false;
  }
  const h = host as unknown as SpinnerHostCandidate;
  if ("lastWarning" in h && h.lastWarning !== "NO PREF SET FOUND") {
    h.lastWarning = null;
  }
  if (host.dcbSpinner.cell && host.dcbSpinner.initialValue !== null) {
    setSpinnerCellValue(host, host.dcbSpinner.cell, host.dcbSpinner.initialValue);
  }
  restoreDcbSpinnerCoupledState(host);
  host.dcbSpinner.armed = false;
  host.dcbSpinner.cell = null;
  host.dcbSpinner.buffer = "";
  host.dcbSpinner.initialValue = null;
  host.dcbSpinner.initialShowRings = undefined;
  host.dcbSpinner.initialMapCache = undefined;
  host.dcbSpinner.initialPtlOn = undefined;
  host.dcbSpinner.onCancel = undefined;
  host.dcbSpinner.onCommit = undefined;
  return true;
}

export function armDcbSpinner(
  host: DcbMenuHost,
  cell: DcbSpinnerCell,
  options?: DcbSpinnerArmOptions,
): void {
  const h = host as unknown as SpinnerHostCandidate;
  if ("minSep" in h && h.minSep && typeof h.minSep === "object") {
    const minSep = h.minSep as { pendingFirstId: string | null; lastError: string | null };
    minSep.pendingFirstId = null;
    minSep.lastError = null;
    const preview = (h as { preview?: { armed?: { type: string } | null; phase: string } }).preview;
    if (preview?.armed?.type === "minSep") {
      preview.phase = "idle";
      preview.armed = null;
    }
  }
  host.dcbSpinner.armed = true;
  host.dcbSpinner.cell = cell;
  host.dcbSpinner.buffer = "";
  host.dcbSpinner.initialValue = getSpinnerCellValue(host, cell);
  host.dcbSpinner.initialShowRings = "showRings" in h ? h.showRings : undefined;
  host.dcbSpinner.initialMapCache = "mapCache" in h ? h.mapCache : undefined;
  host.dcbSpinner.initialPtlOn = "ptlOn" in h ? h.ptlOn : undefined;
  host.dcbSpinner.onCancel = options?.onCancel;
  host.dcbSpinner.onCommit = options?.onCommit;
}

export function inputDcbSpinnerKey(host: DcbMenuHost, key: string): boolean {
  if (!host.dcbSpinner.armed || !host.dcbSpinner.cell) {
    return false;
  }
  const cell = host.dcbSpinner.cell;
  if (cell === "FMA_AMZ") {
    if (/^[A-Za-z0-9_-]+$/.test(key)) {
      host.dcbSpinner.buffer += key.toUpperCase();
      return true;
    }
    return false;
  }
  if (/^[0-9]+$/.test(key)) {
    host.dcbSpinner.buffer += key;
    return true;
  }
  if (key === ".") {
    if (!host.dcbSpinner.buffer.includes(".")) {
      host.dcbSpinner.buffer += key;
    }
    return true;
  }
  if (/^[A-Za-z]+$/.test(key) && isFmaDcbSpinnerCell(cell)) {
    // Retain malformed alphabetic characters in numeric FMA spinner buffer so commit rejects with FORMAT
    host.dcbSpinner.buffer += key;
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
  const h = host as unknown as SpinnerHostCandidate;
  const cell = host.dcbSpinner.cell;
  const buffer = host.dcbSpinner.buffer.trim();
  let success = true;
  let committedValue: SpinnerCommittedValue = null;

  if (cell === "FMA_AMZ") {
    if (buffer.length > 0) {
      const matches =
        h.fmaAmzs?.filter((a) => {
          const idMatches = a.id.toUpperCase() === buffer.toUpperCase();
          const labelMatches = a.label && a.label.toUpperCase() === buffer.toUpperCase();
          return idMatches || labelMatches;
        }) ?? [];
      if (matches.length === 1) {
        committedValue = matches[0]!.id;
        success = true;
        if ("lastWarning" in h) h.lastWarning = null;
      } else {
        if ("lastWarning" in h) h.lastWarning = "FORMAT";
        restoreDcbSpinnerCoupledState(host);
        success = false;
      }
    } else {
      success = true;
      if ("lastWarning" in h) h.lastWarning = null;
    }
  } else if (buffer.length > 0) {
    const isStrictInteger = /^-?\d+$/.test(buffer);
    const isStrictFloat = /^-?\d+(\.\d+)?$/.test(buffer);
    const isFma =
      cell === "MAG" ||
      cell === "FMA_PTL" ||
      cell === "FMA_VOICE" ||
      cell.startsWith("FMA_LDR_") ||
      cell === "BRITE_NTZ" ||
      cell === "BRITE_AMZ" ||
      cell === "BRITE_RWY" ||
      cell === "BRITE_REF";

    const isRunwayLeaderMultiChar = cell.startsWith("FMA_LDR_") && buffer.length !== 1;
    if (
      !isStrictFloat ||
      (isFma && cell !== "PTL" && !isStrictInteger) ||
      isRunwayLeaderMultiChar
    ) {
      if (isFma && "lastWarning" in h) {
        h.lastWarning = "FORMAT";
      }
      if (host.dcbSpinner.initialValue !== null) {
        setSpinnerCellValue(host, cell, host.dcbSpinner.initialValue);
      }
      restoreDcbSpinnerCoupledState(host);
      success = false;
    } else {
      const num = Number(buffer);
      const valid = validateDcbSpinnerValue(
        cell,
        num,
        getFmaMaximumPtlSeconds(h.fmaAmzs ?? [], h.fmaSurveillance?.selectedAmzId),
      );
      if (!isNaN(num) && valid) {
        setSpinnerCellValue(host, cell, num);
        committedValue = num;
        success = true;
        if (isFma && "lastWarning" in h) h.lastWarning = null;
      } else {
        if (isFma && "lastWarning" in h) {
          h.lastWarning = "ILL VALUE";
        }
        if (host.dcbSpinner.initialValue !== null) {
          setSpinnerCellValue(host, cell, host.dcbSpinner.initialValue);
        }
        restoreDcbSpinnerCoupledState(host);
        success = false;
      }
    }
  } else {
    success = true;
    if (
      "lastWarning" in h &&
      (cell === "MAG" || cell === "FMA_PTL" || cell === "FMA_VOICE" || cell.startsWith("FMA_LDR_"))
    ) {
      h.lastWarning = null;
    }
  }

  host.dcbSpinner.armed = false;
  host.dcbSpinner.cell = null;
  host.dcbSpinner.buffer = "";
  host.dcbSpinner.initialValue = null;
  host.dcbSpinner.initialShowRings = undefined;
  host.dcbSpinner.initialMapCache = undefined;
  host.dcbSpinner.initialPtlOn = undefined;
  host.dcbSpinner.onCancel = undefined;
  const onCommit = host.dcbSpinner.onCommit;
  host.dcbSpinner.onCommit = undefined;
  if (success && committedValue !== null) onCommit?.(cell, committedValue);
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
  if (host.dcbSpinner.cell === "FMA_AMZ") {
    return true;
  }
  if (host.dcbSpinner.cell) {
    const current = getSpinnerCellValue(host, host.dcbSpinner.cell);
    if (current !== null) {
      if (!isFmaDcbSpinnerCell(host.dcbSpinner.cell)) {
        host.dcbSpinner.initialValue = current;
      }
      host.dcbSpinner.buffer = String(current);
    } else {
      host.dcbSpinner.buffer = "";
    }
  }
  return true;
}

/** Stage an eligible FMA AMZ candidate without applying its preference or runtime state. */
export function stageFmaAmzSpinnerCandidate(
  host: DcbMenuHost,
  amzs: readonly { id: string; label?: string }[],
  selectedAmzId: string | null,
  delta: -1 | 1,
): string | null {
  if (!host.dcbSpinner.armed || host.dcbSpinner.cell !== "FMA_AMZ" || amzs.length === 0) {
    return null;
  }
  const raw = host.dcbSpinner.buffer.trim().toUpperCase();
  const matches = raw
    ? amzs.filter((amz) => amz.id.toUpperCase() === raw || amz.label?.toUpperCase() === raw)
    : [];
  if (raw && matches.length !== 1) return null;
  const ids = amzs.map((amz) => amz.id);
  const current = matches[0]?.id ?? (raw || selectedAmzId || ids[0]!);
  const index = ids.indexOf(current);
  if (index < 0) return null;
  const candidate = amzs[Math.max(0, Math.min(amzs.length - 1, index + delta))]!;
  host.dcbSpinner.buffer = candidate.label || candidate.id;
  return candidate.id;
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
  if (host.dcbMenu === "MAIN" || host.dcbMenu === "AUX") {
    host.dcbMenuParent = host.dcbMenu;
  }
  host.dcbMenu = menu;
}

export function toggleDcbMenu(host: DcbMenuHost, menu: "MAPS" | "LDR"): void {
  cancelDcbSpinner(host);
  if (host.dcbMenu === menu) {
    closeDcbMenu(host);
  } else {
    openDcbMenu(host, menu);
  }
}

/** DONE returns a submenu to its opening menu; AUX returns to MAIN. */
export function closeDcbMenu(host: DcbMenuHost): void {
  cancelDcbSpinner(host);
  if ("fmaCandidateMode" in host) {
    (host as unknown as { fmaCandidateMode: boolean }).fmaCandidateMode = false;
  }
  host.dcbMenu = isDcbSubmenu(host.dcbMenu) ? (host.dcbMenuParent ?? "MAIN") : "MAIN";
}

/**
 * Esc: if a spinner is armed, disarm with no extra mutation.
 * Else if a submenu is open, return to its opening menu.
 */
export function handleDcbEscape(host: DcbMenuHost): boolean {
  if (cancelDcbSpinner(host)) {
    return true;
  }
  let handled = false;
  if (
    "fmaCandidateMode" in host &&
    (host as unknown as { fmaCandidateMode: boolean }).fmaCandidateMode
  ) {
    (host as unknown as { fmaCandidateMode: boolean }).fmaCandidateMode = false;
    handled = true;
  }
  if (isDcbSubmenu(host.dcbMenu)) {
    closeDcbMenu(host);
    return true;
  }
  return handled;
}
