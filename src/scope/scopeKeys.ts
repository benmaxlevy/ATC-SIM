/**
 * Analog: CRC STARS RANGE / CENTER (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: PageUp/Down + wheel instead of DCB RANGE; Home/End instead of
 * CENTER-then-click; extra CRC presets 6/8/12/16/24 omitted. Not NAS STARS.
 *
 * Always-on scope keys. Never produce a Command, readback, or intent.
 * Wheel steps discrete range presets — no zoom-to-cursor (R12).
 */

import { applyRangeIn, applyRangeOut } from "./camera";
import { centerOnAirport, centerOnLastClick, type ScopeView } from "./scopeView";

export const ALWAYS_ON_SCOPE_KEYS = ["PageUp", "PageDown", "Home", "End"] as const;

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

/** Mutates camera / center. Returns true when the event was consumed. */
export function handleScopeKeyDown(event: ScopeKeyEvent, view: ScopeView): boolean {
  if (!isAlwaysOnScopeKey(event.key)) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
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

export function installAlwaysOnScopeKeys(view: ScopeView): () => void {
  function onKeyDown(event: KeyboardEvent): void {
    handleScopeKeyDown(event, view);
  }
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
