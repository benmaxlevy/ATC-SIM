/**
 * CRC analog: ClipCursor on an armed spinner cell or an open DCB submenu.
 * Browser trainer: clamp a software cursor; do not call Pointer Lock.
 *
 * Scope display only. Never a Command.
 */

import { isDcbSubmenu, type DcbMenuHost } from "./dcbMenu";

export type DcbCursorTrapKind = "none" | "cell" | "submenu";

export interface DcbTrapRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DcbTrapPoint {
  x: number;
  y: number;
}

/** Armed spinner wins so BRITE/CHAR channel cells trap tighter than the submenu bar. */
export function dcbCursorTrapKind(host: DcbMenuHost): DcbCursorTrapKind {
  if (host.dcbSpinner.armed) {
    return "cell";
  }
  if (isDcbSubmenu(host.dcbMenu)) {
    return "submenu";
  }
  return "none";
}

export const DCB_CURSOR_TRAP_CELL_SELECTOR =
  'button.dcb-cell[data-dcb-kind="spinner"][aria-pressed="true"]';

/** Inclusive left/top, exclusive right/bottom — last drawable pixel stays inside. */
export function pointInTrapRect(x: number, y: number, rect: DcbTrapRect): boolean {
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

export function clampPointToRect(x: number, y: number, rect: DcbTrapRect): DcbTrapPoint {
  const maxX = rect.right <= rect.left ? rect.left : rect.right - 1;
  const maxY = rect.bottom <= rect.top ? rect.top : rect.bottom - 1;
  return {
    x: Math.min(maxX, Math.max(rect.left, x)),
    y: Math.min(maxY, Math.max(rect.top, y)),
  };
}

/**
 * Captured drags (target still the DCB cell) must keep flowing.
 * Only block when the OS pointer is outside and the event is not owned by the trap host.
 */
export function dcbTrapShouldBlockPointer(
  clientX: number,
  clientY: number,
  rect: DcbTrapRect,
  targetIsInsideTrap: boolean,
): boolean {
  if (targetIsInsideTrap) {
    return false;
  }
  return !pointInTrapRect(clientX, clientY, rect);
}
