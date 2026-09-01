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

export type DcbSpinnerCell =
  | "RANGE"
  | "RR"
  | "LDR_DIR"
  | "LDR_LENGTH"
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
}

/** Structural host so this module stays DOM-free and does not import scopeView. */
export interface DcbMenuHost {
  dcbMenu: DcbMenu;
  dcbSpinner: DcbSpinnerState;
}

export function idleDcbSpinner(): DcbSpinnerState {
  return { armed: false, cell: null };
}

export function isDcbSubmenu(menu: DcbMenu): boolean {
  return menu !== "MAIN" && menu !== "AUX";
}

export function cancelDcbSpinner(host: DcbMenuHost): boolean {
  if (!host.dcbSpinner.armed) {
    return false;
  }
  host.dcbSpinner.armed = false;
  host.dcbSpinner.cell = null;
  return true;
}

export function armDcbSpinner(host: DcbMenuHost, cell: DcbSpinnerCell): void {
  host.dcbSpinner.armed = true;
  host.dcbSpinner.cell = cell;
}

export function commitDcbSpinner(host: DcbMenuHost): void {
  host.dcbSpinner.armed = false;
  host.dcbSpinner.cell = null;
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
