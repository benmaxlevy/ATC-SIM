/**
 * Analog: CRC STARS RANGE / CENTER / HISTORY / FDB-LDB / PTL / L1–L9 **leader** /
 * altitude filter (docs.virtualnas.net/crc/stars — R07; FOA STARS display data — R05).
 * Trainer delta: PageUp/Down + wheel share `stepRange`; DCB RANGE is a spinner
 * that steps the same 8 presets. Esc closes a DCB submenu / disarms a spinner
 * (`preventDefault` so it does not type into the command line). Home/End instead of
 * CENTER-then-click; extra CRC presets 6/8/12/16/24 omitted. F8 always-on
 * history toggle; H only when the PPI is focused (radio H270 stays heading).
 * Scope-focus `T` toggles full ↔ limited datablock; `M` toggles Mode C on full
 * blocks. F7 always-on predicted track line (PTL) toggle — even with the
 * command line focused. F1 always-on help overlay (not CRC F1 / beaconator);
 * Tab cycles radio ↔ PPI; `/` when scope-focused focuses the command line.
 * Scope-focus `L` then 1–9 is leader direction (no length
 * menu); radio `L090` stays FLY_HEADING left. Scope-focus `F` then hundreds is
 * the altitude filter (never always-on — radio `F` stays a command-line
 * character). Never produce a Command, readback, or intent. Wheel steps
 * discrete range presets — no zoom-to-cursor (R12). Not NAS STARS.
 */

import type { World } from "@core";
import { beginFilterEntry, cancelFilterEntry, handleFilterEntryKey } from "./altitudeFilter";
import { stepRange } from "./camera";
import {
  beginScopeChord,
  isArrowKey,
  isCycleFocusKey,
  isFilterChordKey,
  isLeaderPrefixKey,
  isRadioFocusSlashKey,
  isScopeChordLive,
  isHandoffKey,
  leaderDigitFromKey,
} from "./keymap";
import { handleDcbEscape } from "./dcbMenu";
import { hideMapLists } from "./dcbFunctions";
import { PpiPlaceholderId } from "./ppi-placeholder";
import {
  centerOnAirport,
  centerOnLastClick,
  toggleHistoryEnabled,
  toggleModeCVisible,
  togglePtlOn,
  type ScopeView,
} from "./scopeView";
import {
  setLeaderDirForSelection,
  toggleDatablockModeForSelection,
  applyDropTrackToSelection,
  applyInitiateTrackToSelection,
} from "./trackDisplay";
import { applyHandoffToSelection } from "./ownership";

export const ALWAYS_ON_SCOPE_KEYS = [
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "F1",
  "F3",
  "F4",
  "F7",
  "F8",
] as const;

/** Command line input id (owned by `@ui`; duplicated so `@scope` does not import `@ui`). */
export const RADIO_COMMAND_LINE_ID = "command-line-input";

export const HELP_OVERLAY_ID = "scope-help-overlay";

export type ScopeFocus = "scope" | "radio";

export interface ScopeKeyEvent {
  key: string;
  code?: string;
  shiftKey?: boolean;
  target?: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface ScopeWheelEvent {
  deltaY: number;
  preventDefault(): void;
}

/** Optional UI hooks so Tab / `/` can move focus without `@scope` importing `@ui`. */
export interface ScopeKeyUi {
  cycleFocus?: () => void;
  focusRadio?: () => void;
  /** True when Tab should stay with help overlay inputs / selectable copy. */
  helpOverlayHasFocus?: boolean;
  /** React/DOM refresh after display-only mutations (F1 overlay). */
  onHandled?: () => void;
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

export function helpOverlayHasKeyboardFocus(
  target: EventTarget | null | undefined,
  doc?: { getElementById(id: string): Element | null },
): boolean {
  const root =
    doc?.getElementById(HELP_OVERLAY_ID) ??
    (typeof document !== "undefined" ? document.getElementById(HELP_OVERLAY_ID) : null);
  return root != null && target instanceof Node && root.contains(target);
}

export function focusRadioCommandLine(
  doc: { getElementById(id: string): Element | null } = document,
): void {
  const el = doc.getElementById(RADIO_COMMAND_LINE_ID);
  if (typeof HTMLElement !== "undefined" && el instanceof HTMLElement) {
    el.focus();
  }
}

export function cycleScopeRadioFocus(
  doc: {
    activeElement: Element | null;
    getElementById(id: string): Element | null;
  } = document,
): void {
  if (scopeFocusFromDocument(doc) === "scope") {
    focusRadioCommandLine(doc);
    return;
  }
  const ppi = doc.getElementById(PpiPlaceholderId);
  if (typeof HTMLElement !== "undefined" && ppi instanceof HTMLElement) {
    ppi.focus();
  }
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

/** Mutates camera / history / datablock / PTL / leader / altitude filter / help. Returns true when consumed. */
export function handleScopeKeyDown(
  event: ScopeKeyEvent,
  view: ScopeView,
  focus: ScopeFocus = "radio",
  world?: World,
  nowMs: number = Date.now(),
  ui?: ScopeKeyUi,
): boolean {
  if (event.key === "F1") {
    consume(event);
    view.beaconatorActive = true;
    ui?.onHandled?.();
    return true;
  }
  if (isCycleFocusKey(event.key)) {
    if (ui?.helpOverlayHasFocus || helpOverlayHasKeyboardFocus(event.target)) {
      return false;
    }
    consume(event);
    if (ui?.cycleFocus) {
      ui.cycleFocus();
    } else if (typeof document !== "undefined") {
      cycleScopeRadioFocus(document);
    }
    ui?.onHandled?.();
    return true;
  }

  if (event.key === "Escape") {
    const filterBusy = focus === "scope" && view.filterEntry.phase !== "idle";
    const leaderBusy = focus === "scope" && liveLeaderChord(view, nowMs) != null;
    if (!filterBusy && !leaderBusy && handleDcbEscape(view)) {
      hideMapLists(view);
      consume(event);
      ui?.onHandled?.();
      return true;
    }
  }

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
    if (isRadioFocusSlashKey(event.key)) {
      consume(event);
      if (ui?.focusRadio) {
        ui.focusRadio();
      } else if (typeof document !== "undefined") {
        focusRadioCommandLine(document);
      }
      ui?.onHandled?.();
      return true;
    }
  } else if (view.filterEntry.phase !== "idle") {
    cancelFilterEntry(view.filterEntry, view.altitudeFilter);
  }

  if (isHandoffKey(event)) {
    consume(event);
    if (world) {
      applyHandoffToSelection(view.tracks, world);
    }
    ui?.onHandled?.();
    return true;
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
    stepRange(view.camera, -1);
    return true;
  }
  if (event.key === "PageDown") {
    stepRange(view.camera, 1);
    return true;
  }
  if (event.key === "Home") {
    centerOnAirport(view);
    return true;
  }
  if (event.key === "End") {
    centerOnLastClick(view);
    return true;
  }
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
    stepRange(view.camera, -1);
  } else {
    stepRange(view.camera, 1);
  }
  return true;
}

/**
 * Scope keyup handler: deactivates momentary actions like F1 Beaconator.
 */
export function handleScopeKeyUp(event: ScopeKeyEvent, view: ScopeView, ui?: ScopeKeyUi): boolean {
  if (event.key === "F1") {
    consume(event);
    view.beaconatorActive = false;
    ui?.onHandled?.();
    return true;
  }
  return false;
}

export function installAlwaysOnScopeKeys(
  view: ScopeView,
  world: World,
  ui?: ScopeKeyUi,
): () => void {
  function onKeyDown(event: KeyboardEvent): void {
    const focus = typeof document !== "undefined" ? scopeFocusFromDocument(document) : "radio";
    handleScopeKeyDown(event, view, focus, world, Date.now(), {
      ...ui,
      helpOverlayHasFocus: ui?.helpOverlayHasFocus ?? helpOverlayHasKeyboardFocus(event.target),
    });
  }
  function onKeyUp(event: KeyboardEvent): void {
    handleScopeKeyUp(event, view, ui);
  }
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
  };
}
