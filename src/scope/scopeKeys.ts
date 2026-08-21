/**
 * Analog: CRC STARS RANGE / CENTER / HISTORY / FDB-LDB / PTL / L1–L9 **leader** /
 * altitude filter (docs.virtualnas.net/crc/stars — R07; FOA STARS display data — R05).
 * Trainer delta: PageUp/Down + wheel instead of DCB RANGE; Home/End instead of
 * CENTER-then-click; extra CRC presets 6/8/12/16/24 omitted. F8 always-on
 * history toggle; H only when the PPI is focused (radio H270 stays heading).
 * Scope-focus `T` toggles full ↔ limited datablock; `M` toggles Mode C on full
 * blocks. F7 always-on predicted track line (PTL) toggle — even with the
 * command line focused. Scope-focus `L` then 1–9 is leader direction (no length
 * menu); radio `L090` stays FLY_HEADING left. Scope-focus `F` then hundreds is
 * the altitude filter (never always-on — radio `F` stays a command-line
 * character). Never produce a Command, readback, or intent. Wheel steps
 * discrete range presets — no zoom-to-cursor (R12). Not NAS STARS.
 */

import type { World } from "@core";
import { beginFilterEntry, cancelFilterEntry, handleFilterEntryKey } from "./altitudeFilter";
import { applyRangeIn, applyRangeOut } from "./camera";
import {
  beginScopeChord,
  isArrowKey,
  isFilterChordKey,
  isLeaderPrefixKey,
  isScopeChordLive,
  leaderDigitFromKey,
} from "./keymap";
import { PpiPlaceholderId } from "./ppi-placeholder";
import {
  centerOnAirport,
  centerOnLastClick,
  toggleHistoryEnabled,
  toggleModeCVisible,
  togglePtlOn,
  type ScopeView,
} from "./scopeView";
import { setLeaderDirForSelection, toggleDatablockModeForSelection, applyDropTrackToSelection, applyInitiateTrackToSelection } from "./trackDisplay";

export const ALWAYS_ON_SCOPE_KEYS = ["PageUp", "PageDown", "Home", "End", "F3", "F4", "F7", "F8"] as const;

export type ScopeFocus = "scope" | "radio";

export interface ScopeKeyEvent {
  key: string;
  code?: string;
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

function consume(event: ScopeKeyEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function liveLeaderChord(view: ScopeView, nowMs: number) {
  if (!isScopeChordLive(view.pendingChord, nowMs) || view.pendingChord?.prefix !== "L") {
    if (view.pendingChord && !isScopeChordLive(view.pendingChord, nowMs)) {
      view.pendingChord = null;
    }
    return null;
  }
  return view.pendingChord;
}

/** Mutates camera / history / datablock / PTL / leader / altitude filter. Returns true when consumed. */
export function handleScopeKeyDown(
  event: ScopeKeyEvent,
  view: ScopeView,
  focus: ScopeFocus = "radio",
  world?: World,
  nowMs: number = Date.now(),
): boolean {
  if (focus === "scope") {
    if (isFilterChordKey(event.key)) {
      consume(event);
      beginFilterEntry(view.filterEntry, view.altitudeFilter, nowMs);
      return true;
    }
    if (handleFilterEntryKey(view.filterEntry, view.altitudeFilter, event.key, nowMs)) {
      consume(event);
      return true;
    }
    const chord = liveLeaderChord(view, nowMs);
    if (chord) {
      if (event.key === "Escape") {
        consume(event);
        view.pendingChord = null;
        return true;
      }
      const digit = leaderDigitFromKey(event.key, event.code);
      if (digit != null) {
        consume(event);
        view.pendingChord = null;
        if (world) {
          setLeaderDirForSelection(view.tracks, world, digit);
        }
        return true;
      }
      if (isArrowKey(event.key)) {
        consume(event);
        return true;
      }
      view.pendingChord = null;
    }
    if (isLeaderPrefixKey(event.key)) {
      consume(event);
      view.pendingChord = beginScopeChord("L", nowMs, "L_");
      return true;
    }
  } else if (view.filterEntry.phase !== "idle") {
    cancelFilterEntry(view.filterEntry, view.altitudeFilter);
  }

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
  if (event.key === "F3") {
    if (world) {
      applyInitiateTrackToSelection(view.tracks, world);
    }
    return true;
  }
  if (event.key === "F4") {
    if (world) {
      applyDropTrackToSelection(view.tracks, world);
    }
    return true;
  }
  if (event.key === "F7") {
    togglePtlOn(view);
    return true;
  }
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
    handleScopeKeyDown(event, view, focus, world, Date.now());
  }
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
