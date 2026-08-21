/**
 * Analog: CRC STARS RANGE / CENTER / HISTORY / FDB-LDB (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: PageUp/Down + wheel instead of DCB RANGE; Home/End instead of
 * CENTER-then-click; extra CRC presets 6/8/12/16/24 omitted. F8 always-on
 * history toggle; H only when the PPI is focused (radio H270 stays heading).
 * Scope-focus `T` toggles full ↔ limited datablock; `M` toggles Mode C on full
 * blocks. F7 (PTL) is T02-07 — do not bind it here. Never produce a Command,
 * readback, or intent. Wheel steps discrete range presets — no zoom-to-cursor
 * (R12). Not NAS STARS.
 */

import type { World } from "@core";
import { applyRangeIn, applyRangeOut } from "./camera";
import { PpiPlaceholderId } from "./ppi-placeholder";
import {
  centerOnAirport,
  centerOnLastClick,
  toggleHistoryEnabled,
  toggleModeCVisible,
  type ScopeView,
} from "./scopeView";
import { toggleDatablockModeForSelection } from "./trackDisplay";

export const ALWAYS_ON_SCOPE_KEYS = ["PageUp", "PageDown", "Home", "End", "F8"] as const;

export type ScopeFocus = "scope" | "radio";

export interface ScopeKeyEvent {
  key: string;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface ScopeWheelEvent {
  deltaY: number;
  preventDefault(): void;
}

export function isAlwaysOnScopeKey(key: string): boolean {
  return (ALWAYS_ON_SCOPE_KEYS as readonly string[]).includes(key);
}

export function isHistoryToggleKey(key: string): boolean {
  return key === "H" || key === "h";
}

export function isDatablockToggleKey(key: string): boolean {
  return key === "T" || key === "t";
}

export function isModeCToggleKey(key: string): boolean {
  return key === "M" || key === "m";
}

/** PPI canvas focused → scope; otherwise radio so H270 still types. */
export function scopeFocusFromDocument(doc: { activeElement: Element | null }): ScopeFocus {
  const el = doc.activeElement;
  if (
    typeof HTMLElement !== "undefined" &&
    el instanceof HTMLElement &&
    el.id === PpiPlaceholderId
  ) {
    return "scope";
  }
  return "radio";
}

/** Mutates camera / history / datablock display. Returns true when consumed. */
export function handleScopeKeyDown(
  event: ScopeKeyEvent,
  view: ScopeView,
  focus: ScopeFocus = "radio",
  world?: World,
): boolean {
  if (isHistoryToggleKey(event.key)) {
    if (focus !== "scope") {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    toggleHistoryEnabled(view);
    return true;
  }
  if (isDatablockToggleKey(event.key)) {
    if (focus !== "scope" || !world) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    toggleDatablockModeForSelection(view.tracks, world);
    return true;
  }
  if (isModeCToggleKey(event.key)) {
    if (focus !== "scope") {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    toggleModeCVisible(view);
    return true;
  }
  if (!isAlwaysOnScopeKey(event.key)) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "F8") {
    toggleHistoryEnabled(view);
    return true;
  }
  if (event.key === "PageUp") {
    applyRangeIn(view.camera);
    return true;
  }
  if (event.key === "PageDown") {
    applyRangeOut(view.camera);
    return true;
  }
  if (event.key === "Home") {
    centerOnAirport(view);
    return true;
  }
  centerOnLastClick(view);
  return true;
}

/**
 * Wheel over the PPI: same presets as PageUp/Down.
 * Cursor position is intentionally unused so range cannot track the pointer.
 */
export function handleScopeWheel(event: ScopeWheelEvent, view: ScopeView): boolean {
  if (event.deltaY === 0) {
    return false;
  }
  event.preventDefault();
  if (event.deltaY < 0) {
    applyRangeIn(view.camera);
  } else {
    applyRangeOut(view.camera);
  }
  return true;
}

export function installAlwaysOnScopeKeys(view: ScopeView, world: World): () => void {
  function onKeyDown(event: KeyboardEvent): void {
    const focus = typeof document !== "undefined" ? scopeFocusFromDocument(document) : "radio";
    handleScopeKeyDown(event, view, focus, world);
  }
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
