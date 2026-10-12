/**
 * Analog: CRC STARS RANGE / CENTER / HISTORY / FDB-LDB / PTL / L1–L9 **leader** /
 * altitude filter (docs.virtualnas.net/crc/stars — R07; FOA STARS display data — R05).
 * Trainer delta: PageUp/Down + wheel share `stepRange`; DCB RANGE is a spinner
 * that steps the same 17 presets (5–512 NM). Esc closes a DCB submenu / disarms a spinner
 * (`preventDefault` so it does not type into the command line). Home/End instead of
 * CENTER-then-click; extra CRC presets 6/8/12/16/24 omitted. F8 enters
 * FMA/TSAS Preview; H toggles history only when PPI-focused (radio H270 stays heading).
 * Scope-focus `T` toggles full ↔ limited datablock; tap `M` toggles Mode C on
 * full blocks. `M` then a map token (`M DEM1_27`) continues a Preview Area
 * buffer and undoes that Mode C tap. F10 always-on predicted track line (PTL)
 * toggle — even with the command line focused. F7 starts MULTI FUNC Preview entry. F1 is INIT CNTL and F3 is
 * reserved for Track Suspend (not implemented yet); help uses `?` or the Help button;
 * Tab cycles radio ↔ PPI; `/` when scope-focused buffers into the Preview Area
 * (slew/drop prefix, not radio focus). Leader direction stays on the DCB or
 * explicit `*L` Preview commands; bare `L` is Preview text. Radio `L090` stays
 * FLY_HEADING left. Scope-focus `F` then hundreds is
 * the altitude filter (never always-on — radio `F` stays a command-line
 * character). Scope-focus `*` is TPA/ATPA slew chords (R07 Table 36) via the
 * unified Preview Area buffer; radio `*`
 * is a literal command-line character. Scope-focus `B` then digits is Table 30
 * beacon-code select (never always-on — radio `B` stays a command-line
 * character). Never produce a Command, readback, or intent. Wheel steps
 * discrete range presets — no zoom-to-cursor (R12). Not NAS STARS.
 */

import {
  beaconPoolFor,
  createFlightPlan,
  deleteFlightPlanFromWorld,
  flightPlanForAircraft,
  isFlightPlanOperational,
  modifyFlightPlan,
  releaseAssignedBeacon,
  synchronizeFlightPlanRoute,
  withAllocatedBeacon,
  type FlightPlan,
  type World,
} from "@core";
import {
  cancelFilterEntry,
  formatFilterReadout,
  handleFilterEntryKey,
  idleFilterEntry,
  tryApplyAltitudeFilter,
} from "./altitudeFilter";
import { stepRange } from "./camera";
import {
  beginScopeChord,
  isBeaconSelectKey,
  isCycleFocusKey,
  isHelpToggleKey,
  isRadioFocusSlashKey,
  isScopeChordLive,
  isStarsChordPrefixKey,
  isHandoffKey,
} from "./keymap";
import {
  beginStarsChordEntry,
  cancelStarsChordEntry,
  armOrApplyStarsChordAction,
  commitStarsChord,
  handleStarsChordEntryKey,
  rejectStarsChordEntry,
} from "./starsChord";
import {
  applyPreviewBeaconAction,
  applyPreviewWxAction,
  armPreviewCntl,
  armPreviewMinSep,
  beginPreviewMultiFuncEntry,
  armPreviewRelocateList,
  armPreviewSlewAction,
  beginPreviewBeaconEntry,
  beginPreviewBufferEntry,
  beginPreviewFltDataEntry,
  beginPreviewVfrEntry,
  cancelPreviewArea,
  handlePreviewBufferKey,
  handlePreviewEscape,
  handlePreviewFlidKey,
  isPreviewBufferStartChar,
  previewAreaIsLive,
  previewTrackingSlew,
  previewBufferCharFromKey,
  rejectPreviewArea,
  rejectPreviewAreaWithReason,
  executeCaSingleTrackInhibit,
  executeCaPairToggle,
  executeCaControllerPairs,
  executeCaPairSlew,
  type PreviewArmedAction,
  type PreviewKeyOutcome,
} from "./previewArea";
import {
  beginMinSepSelection,
  cancelMinSepPending,
  cancelPendingMinSepIfArmed,
  clearMinSepState,
  isMinSepPending,
} from "./minimumSeparation";
import {
  cancelRblPending,
  clearRangeBearingLines,
  insertRangeBearingLine,
  removeRangeBearingLine,
  resolveRblFirstEndpoint,
  resolveRblSecondEndpoint,
} from "./rangeBearingLines";
import { retainFullDatablocksOutsideAltitudeFilter } from "./trackDisplay";
import { browserDcbPrefStorage, cancelDcbPrefSaveAs, commitDcbPrefSaveAs } from "./dcb/dcbPref";
import {
  applyDcbShift,
  armDcbSpinner,
  backspaceDcbSpinner,
  cancelDcbSpinner,
  commitDcbSpinner,
  handleDcbEscape,
  inputDcbSpinnerKey,
  isFmaDcbSpinnerCell,
  openDcbMenu,
} from "./dcb/dcbMenu";

function vfrCreationPool(world: World): readonly string[] {
  return beaconPoolFor(world.beaconPools, "vfr");
}

import {
  applyDcbLeaderDir,
  applyRrCenter,
  armPlaceCenter,
  armPlaceRangeRing,
  loadedCatalogMaps,
  resolveVideoMapToken,
  setAllVideoMaps,
  setRangeRingInterval,
  toggleVideoMap,
  videoMapTokenLayout,
  FMA_RUNWAY_KEYPAD_TO_DIR,
  setFmaRunwayLeader,
  type RrIntervalNm,
} from "./dcb/dcbFunctions";
import { PpiPlaceholderId } from "./ppi-placeholder";
import {
  centerOnAirport,
  centerOnLastClick,
  setHistoryDotCount,
  setPtlMinutes,
  toggleDcbVisible,
  toggleHelpOverlay,
  toggleHistoryEnabled,
  toggleModeCVisible,
  togglePtlOn,
  toggleWxLevels,
  type HistoryDotCount,
  type ScopeView,
} from "./scopeView";
import {
  ensureTrackDisplay,
  setLeaderDirForId,
  setLeaderLengthForId,
  setLeaderDirAndLengthForId,
  setLeaderDirForScope,
  toggleDatablockModeForSelection,
  applyInitiateTrackToId,
  applyInitiateTrackToSelection,
  selectedTrackId,
  terminateTrackWithPlan,
} from "./trackDisplay";
import { applyHandoffToSelection } from "./ownership";
import {
  DEFAULT_LEADER_DIR,
  leaderDirFromStarsClock,
  type LeaderDir,
  type LeaderLengthPx,
} from "./leader";
import { resolveScopeFlid } from "./previewArea";
import {
  canonicalSystemListId,
  cancelListDrag,
  deleteFlightPlanEntry,
  getFlightPlanEntries,
  getVfrListCallsigns,
  isSystemListMultiPage,
  pointInsideRect,
  relocateSystemList,
  resetSystemListToDefault,
  scrollSystemList,
  setSystemListMaxLines,
  toggleSystemList,
} from "./systemLists";

export const ALWAYS_ON_SCOPE_KEYS = [
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "Insert",
  "Ins",
  "?",
] as const;

/** Command line input id (owned by `@ui`; duplicated so `@scope` does not import `@ui`). */
export const RADIO_COMMAND_LINE_ID = "command-line-input";

export const HELP_OVERLAY_ID = "scope-help-overlay";

export type ScopeFocus = "scope" | "radio";

export interface ScopeKeyEvent {
  key: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
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
  /** UI-only filed flight-plan dialog request; scope never imports React. */
  onOpenFlightPlanModal?: (request: {
    acid?: string;
    index?: number;
    targetAircraftId?: string;
  }) => void;
}

function eventOwnedByNativeModal(target: EventTarget | null | undefined): boolean {
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) {
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    ) {
      return true;
    }
    return target.closest('[role="dialog"][aria-modal="true"]') !== null;
  }
  if (target && typeof target === "object") {
    const candidate = target as {
      tagName?: string;
      isContentEditable?: boolean;
      closest?: (selector: string) => unknown;
    };
    if (
      candidate.tagName === "INPUT" ||
      candidate.tagName === "TEXTAREA" ||
      candidate.isContentEditable === true
    ) {
      return true;
    }
    if (typeof candidate.closest === "function") {
      return candidate.closest('[role="dialog"][aria-modal="true"]') !== null;
    }
  }
  return false;
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

function isReservedScopeLetterShortcut(key: string): boolean {
  return (
    isDatablockToggleKey(key) ||
    isModeCToggleKey(key) ||
    isHistoryToggleKey(key) ||
    isBeaconSelectKey(key)
  );
}

/**
 * Dedicated unmodified Delete key, scope focus only.
 * Requires event.key === "Delete", dedicated keyboard code "Delete" when code supplied,
 * no Shift/Ctrl/Alt/Meta. Rejects NumpadDecimal.
 */
export function isMinSepDeleteKey(event: ScopeKeyEvent): boolean {
  if (event.key !== "Delete") {
    return false;
  }
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }
  if (event.code && event.code !== "Delete") {
    return false;
  }
  return true;
}

function isCompetingTargetingKey(event: ScopeKeyEvent): boolean {
  if (event.ctrlKey) {
    return /^F[1-9]|F10|F11$/.test(event.key);
  }
  return (
    event.key === "F1" ||
    event.key === "F3" ||
    event.key === "F4" ||
    event.key === "F5" ||
    event.key === "F6" ||
    event.key === "F7" ||
    event.key === "F9" ||
    event.key === "F10" ||
    event.key === "F11" ||
    event.key === "Insert" ||
    event.key === "Ins" ||
    event.key === "FPL" ||
    event.code === "FPL" ||
    event.key === "VFR" ||
    event.code === "VFR"
  );
}

/** Keep T02-49 `*` chords on starsChordEntry so slew-click and *J tests stay green. */
function syncStarsChordMirror(view: ScopeView, nowMs: number): void {
  if (
    view.preview.phase === "entry" &&
    view.preview.entryOrigin === "literalSplat" &&
    view.preview.buffer.startsWith("*")
  ) {
    view.starsChordEntry.phase = "entry";
    view.starsChordEntry.buffer = view.preview.buffer;
    view.starsChordEntry.lastKeyAtMs = nowMs;
    view.starsChordEntry.rejection = null;
  }
}

function startPreviewBuffer(view: ScopeView, ch: string, nowMs: number): void {
  cancelFilterEntry(view.filterEntry, view.altitudeFilter);
  cancelDcbPrefSaveAs(view);
  cancelPendingMinSepIfArmed(view);
  cancelRblPending(view.rbl);
  view.pendingChord = null;
  beginPreviewBufferEntry(view.preview, ch, nowMs);
  if (ch === "*") {
    view.starsChordArmed = null;
    beginStarsChordEntry(view.starsChordEntry, nowMs);
  } else if (view.starsChordEntry.phase === "entry") {
    cancelStarsChordEntry(view.starsChordEntry);
  }
}

function startMultiFuncEntry(view: ScopeView, nowMs: number): void {
  if (view.dcbSpinner.armed) {
    cancelDcbSpinner(view);
  }
  cancelFilterEntry(view.filterEntry, view.altitudeFilter);
  cancelDcbPrefSaveAs(view);
  cancelPendingMinSepIfArmed(view);
  cancelRblPending(view.rbl);
  view.pendingChord = null;
  view.starsChordArmed = null;
  cancelStarsChordEntry(view.starsChordEntry);
  beginPreviewMultiFuncEntry(view.preview, nowMs);
}

function startFltDataEntry(view: ScopeView, nowMs: number): void {
  cancelFilterEntry(view.filterEntry, view.altitudeFilter);
  cancelDcbPrefSaveAs(view);
  cancelPendingMinSepIfArmed(view);
  cancelRblPending(view.rbl);
  view.pendingChord = null;
  view.starsChordArmed = null;
  cancelStarsChordEntry(view.starsChordEntry);
  beginPreviewFltDataEntry(view.preview, nowMs);
}

function startVfrEntry(view: ScopeView, nowMs: number): void {
  cancelFilterEntry(view.filterEntry, view.altitudeFilter);
  cancelDcbPrefSaveAs(view);
  cancelPendingMinSepIfArmed(view);
  cancelRblPending(view.rbl);
  view.pendingChord = null;
  view.starsChordArmed = null;
  cancelStarsChordEntry(view.starsChordEntry);
  beginPreviewVfrEntry(view.preview, nowMs);
}

function applyPreviewArmedAction(
  view: ScopeView,
  action: PreviewArmedAction,
  nowMs: number,
  world?: World,
  ui?: ScopeKeyUi,
): void {
  if (applyPreviewBeaconAction(view.beaconSelectCodes, action)) {
    return;
  }
  const wxLevels = applyPreviewWxAction(view.wxLevels, action);
  if (wxLevels) {
    view.wxLevels = wxLevels;
    return;
  }
  switch (action.type) {
    case "createFlightPlan": {
      if (!world) return;
      if (action.creationMode === "vfr") {
        const existing = world.flightPlans.find(
          (plan) =>
            isFlightPlanOperational(plan) &&
            plan.flightRules === "VFR" &&
            plan.acid === action.acid,
        );
        if (existing) {
          if (!existing.assignedBeacon) {
            const allocated = withAllocatedBeacon(
              existing,
              vfrCreationPool(world),
              world.flightPlans,
              world.aircraft,
            );
            if (!allocated.ok || !allocated.value.assignedBeacon) {
              view.preview.rejection = "CAPACITY — BCN";
              return;
            }
            existing.assignedBeacon = allocated.value.assignedBeacon;
          }
          const edits: Array<
            [
              (
                | "fixes"
                | "aircraftType"
                | "equipment"
                | "requestedAltitudeFt"
                | "tcp"
                | "scratchpads"
              ),
              string | number | string[] | undefined,
            ]
          > = [
            ["fixes", action.fixes],
            ["aircraftType", action.aircraftType],
            ["equipment", action.equipment],
            ["requestedAltitudeFt", action.requestedAltitudeFt],
            ["tcp", action.tcp],
          ];
          if (action.scratchpads.length > 0) {
            edits.push(["scratchpads", action.scratchpads]);
          }
          for (const [field, value] of edits) {
            if (value !== undefined) {
              const edited = modifyFlightPlan(world, existing.id, field, value);
              if (!edited.ok) {
                view.preview.rejection = "FORMAT";
                return;
              }
            }
          }
          if (action.departureAirport !== undefined) {
            existing.departureAirport = action.departureAirport;
          }
          if (action.airportId !== undefined) {
            existing.airportId = action.airportId;
          }
          if (action.route !== undefined) {
            existing.route = action.route;
            existing.filedRoute = undefined;
            existing.routeRecord = undefined;
            const synchronized = synchronizeFlightPlanRoute(existing);
            Object.assign(existing, synchronized);
          }
          if (action.fixes?.length) {
            existing.vfrRetransmit = {
              amendedFix: action.fixes[0]!,
              requestedAtMs: world.simTimeMs,
            };
          }
          return;
        }
      }
      if (world.flightPlans.filter((plan) => isFlightPlanOperational(plan)).length >= 100) {
        view.preview.rejection = "CAPACITY — FP";
        return;
      }
      const result = createFlightPlan(
        {
          id: `fp-${world.simTimeMs}-${world.flightPlans.length}`,
          status: "pending",
          acid: action.acid,
          assignedBeacon: action.assignedBeacon,
          tcp: action.tcp,
          departureAirport: action.departureAirport,
          airportId: action.airportId,
          route: action.route,
          scratchpads: action.scratchpads,
          aircraftType: action.aircraftType,
          aircraftCount: action.aircraftCount,
          equipment: action.equipment,
          fixes: action.fixes ?? [],
          requestedAltitudeFt: action.requestedAltitudeFt,
          flightRules: action.flightRules,
          eta: action.eta,
          ptd: action.ptd,
          flightType:
            action.flightType === "A"
              ? "IFR"
              : action.flightType === "P"
                ? "IFR"
                : action.creationMode === "fltData"
                  ? "IFR"
                  : undefined,
        },
        world.flightPlans,
      );
      if (!result.ok) {
        view.preview.rejection =
          result.error.code === "DUPLICATE_ACID"
            ? "DUP ID"
            : result.error.code === "DUPLICATE_BEACON"
              ? "DUP BCN"
              : "FORMAT";
        return;
      }
      let plan: FlightPlan = result.value;
      const beaconSpec = action.beacon;
      if (beaconSpec.kind === "pool") {
        const pool =
          action.creationMode === "vfr" && beaconSpec.pool === "vfr"
            ? vfrCreationPool(world)
            : beaconPoolFor(world.beaconPools, beaconSpec.pool);
        const allocated = withAllocatedBeacon(plan, pool, world.flightPlans, world.aircraft);
        if (!allocated.ok || !allocated.value.assignedBeacon) {
          view.preview.rejection = "CAPACITY — BCN";
          return;
        }
        plan = allocated.value;
      } else if (beaconSpec.kind === "default" && world.beaconPools.defaultPool !== "none") {
        const allocated = withAllocatedBeacon(
          plan,
          beaconPoolFor(world.beaconPools, world.beaconPools.defaultPool),
          world.flightPlans,
          world.aircraft,
        );
        if (!allocated.ok || !allocated.value.assignedBeacon) {
          view.preview.rejection = "CAPACITY — BCN";
          return;
        }
        plan = allocated.value;
      }
      world.flightPlans.push(plan);
      return;
    }
    case "deleteVfrFlightPlan": {
      if (!world) return;
      const id = action.flid.toUpperCase();
      const callsigns = getVfrListCallsigns(world, view);
      const callsign = /^\d{1,2}$/.test(id) ? callsigns[Number(id) - 1] : id;
      const plans = world.flightPlans.filter(
        (plan) =>
          isFlightPlanOperational(plan) && plan.flightRules === "VFR" && plan.acid === callsign,
      );
      if (plans.length !== 1) {
        view.preview.rejection = plans.length === 0 ? "NO FLIGHT" : "FORMAT";
        return;
      }
      const plan = plans[0]!;
      const correlatedAircraft = world.aircraft.find(
        (aircraft) => flightPlanForAircraft(world, aircraft.id)?.id === plan.id,
      );
      if (correlatedAircraft) {
        terminateTrackWithPlan(view.tracks, world, correlatedAircraft.id, view);
      } else {
        deleteFlightPlanFromWorld(world, plan.id);
      }
      return;
    }
    case "createVfrActiveTrack":
      armPreviewSlewAction(view.preview, action, nowMs);
      return;
    case "toggleList":
      toggleSystemList(view, action.listId);
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      return;
    case "resizeList":
      setSystemListMaxLines(view, action.listId, action.maxLines);
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      return;
    case "deleteFlightPlanEntry":
      if (world) {
        deleteFlightPlanEntry(world, view, action.index);
      }
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      return;
    case "modifyFlightPlan": {
      if (!world) return;
      const plans = world.flightPlans.filter(
        (plan) =>
          isFlightPlanOperational(plan) &&
          (plan.acid === action.flid || plan.assignedBeacon === action.flid),
      );
      if (/^\d{1,2}$/.test(action.flid)) {
        const entry = getFlightPlanEntries(world, view).find(
          (item) => item.index === Number(action.flid),
        );
        const plan = entry?.planId
          ? world.flightPlans.find((item) => item.id === entry.planId)
          : undefined;
        if (plan && isFlightPlanOperational(plan)) plans.push(plan);
      }
      const uniquePlans = [...new Map(plans.map((plan) => [plan.id, plan])).values()];
      if (uniquePlans.length !== 1) {
        view.preview.rejection = uniquePlans.length === 0 ? "NO FLIGHT" : "FORMAT";
        return;
      }
      let value: string | number | string[] | undefined = action.value;
      if (action.field === "scratchpads") {
        const scratchpads = [...(uniquePlans[0]!.scratchpads ?? [])];
        const slot = (action.scratchpadSlot ?? (action.value.startsWith("Δ") ? 1 : 2)) - 1;
        scratchpads[slot] = action.value.slice(1);
        value = scratchpads;
      }
      if (action.field === "requestedAltitudeFt" || action.field === "assignedAltitudeFt")
        value = /^A?000$/.test(action.value)
          ? undefined
          : Number(action.value.replace(/^A/, "")) * 100;
      if (action.field === "fixes") value = action.value;
      if (action.field === "assignedBeacon" && /^(?:\+|\/|\/[1-4])$/.test(action.value)) {
        const poolKey =
          action.value === "+"
            ? "ifr"
            : action.value === "/"
              ? "vfr"
              : `general${action.value.slice(1)}`;
        const allocated = withAllocatedBeacon(
          uniquePlans[0]!,
          beaconPoolFor(world.beaconPools, poolKey as Parameters<typeof beaconPoolFor>[1]),
          world.flightPlans,
          world.aircraft,
        );
        if (!allocated.ok || !allocated.value.assignedBeacon) {
          view.preview.rejection = "CAPACITY — BCN";
          return;
        }
        value = allocated.value.assignedBeacon;
      }
      const result = modifyFlightPlan(world, uniquePlans[0]!.id, action.field, value);
      if (!result.ok) {
        view.preview.rejection =
          result.error.code === "DUPLICATE_ACID"
            ? "DUP ID"
            : result.error.code === "DUPLICATE_BEACON"
              ? "DUP BCN"
              : result.error.code === "NO_FLIGHT"
                ? "NO FLIGHT"
                : "FORMAT";
      }
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      return;
    }
    case "releaseAssignedBeacon": {
      if (!world) return;
      const plans = world.flightPlans.filter(
        (plan) =>
          isFlightPlanOperational(plan) &&
          (plan.acid === action.flid || plan.assignedBeacon === action.flid),
      );
      if (/^\d{1,2}$/.test(action.flid)) {
        const entry = getFlightPlanEntries(world, view).find(
          (item) => item.index === Number(action.flid),
        );
        const plan = entry?.planId
          ? world.flightPlans.find((item) => item.id === entry.planId)
          : undefined;
        if (plan && isFlightPlanOperational(plan)) plans.push(plan);
      }
      if (plans.length !== 1) {
        view.preview.rejection = plans.length === 0 ? "NO FLIGHT" : "DUP ID";
        return;
      }
      const plan = plans[0]!;
      const correlatedAircraft = world.aircraft.find(
        (aircraft) => flightPlanForAircraft(world, aircraft.id)?.id === plan.id,
      );
      const result = releaseAssignedBeacon(world, plan.id);
      if (result.ok && correlatedAircraft && plan.status === "suspended") {
        const td = ensureTrackDisplay(view.tracks, correlatedAircraft.id);
        delete td.squawk;
        td.unassociated = true;
        td.datablockMode = "partial";
      }
      if (!result.ok)
        view.preview.rejection = result.error.code === "INVALID_FIELD" ? "ILL TRK" : "FORMAT";
      return;
    }
    case "armRelocateList":
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      armPreviewRelocateList(view.preview, action.listId, nowMs);
      return;
    case "resetListPosition":
      resetSystemListToDefault(view, action.listId);
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      return;
    case "armRecenterScope":
      if (!view.placeCenterArmed) {
        armPlaceCenter(view);
      } else {
        view.placeRangeRingArmed = false;
      }
      return;
    case "resetScopeCenter":
      centerOnAirport(view);
      view.placeCenterArmed = false;
      return;
    case "setRangeRingInterval":
      setRangeRingInterval(view, action.intervalNm as RrIntervalNm);
      return;
    case "armRecenterRangeRings":
      if (!view.placeRangeRingArmed) {
        armPlaceRangeRing(view);
      } else {
        view.placeCenterArmed = false;
      }
      return;
    case "resetRangeRingsCenter":
      applyRrCenter(view);
      view.placeRangeRingArmed = false;
      return;
    case "setPtlMinutes":
      setPtlMinutes(view, action.minutes);
      return;
    case "setHistoryDots":
      setHistoryDotCount(view, action.count as HistoryDotCount);
      return;
    case "toggleVideoMap": {
      const map = resolveVideoMapToken(
        loadedCatalogMaps(view),
        action.mapId,
        videoMapTokenLayout(view),
      );
      if (map) {
        toggleVideoMap(view, map.id, action.explicitState);
      } else {
        toggleVideoMap(view, action.mapId, action.explicitState);
      }
      return;
    }
    case "setAllVideoMaps":
      setAllVideoMaps(view, action.enabled);
      return;
    case "displayFilters":
      view.preview.rejection = `FILTER ${formatFilterReadout(view.altitudeFilter, idleFilterEntry(view.altitudeFilter)).replace("FILTER ", "")} U ${formatFilterReadout(view.associatedAltitudeFilter, idleFilterEntry(view.associatedAltitudeFilter)).replace("FILTER ", "")} A`;
      view.preview.lastKeyAtMs = nowMs;
      return;
    case "setAltitudeFilterLimits":
      if (action.associatedOnly) {
        tryApplyAltitudeFilter(
          view.associatedAltitudeFilter,
          action.floorHundreds,
          action.ceilingHundreds,
        );
        retainFullDatablocksOutsideAltitudeFilter(view.tracks);
      } else if (
        tryApplyAltitudeFilter(view.altitudeFilter, action.floorHundreds, action.ceilingHundreds)
      ) {
        if (
          action.associatedFloorHundreds !== undefined &&
          action.associatedCeilingHundreds !== undefined
        ) {
          tryApplyAltitudeFilter(
            view.associatedAltitudeFilter,
            action.associatedFloorHundreds,
            action.associatedCeilingHundreds,
          );
        }
        retainFullDatablocksOutsideAltitudeFilter(view.tracks);
      }
      return;
    case "setDefaultLeaderLength":
      view.leaderLengthPx = action.lengthPx as LeaderLengthPx;
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      return;
    case "setLeaderDir": {
      const dir =
        action.dir ??
        (action.starsDir ? leaderDirFromStarsClock(action.starsDir) : DEFAULT_LEADER_DIR);
      if (action.flid && world) {
        const resolved = resolveScopeFlid(action.flid, world);
        if (resolved.ok) {
          setLeaderDirForId(view.tracks, world, resolved.aircraftId, dir);
          cancelStarsChordEntry(view.starsChordEntry);
          view.starsChordArmed = null;
          return;
        }
        rejectPreviewArea(view.preview, nowMs);
        return;
      }
      if (action.scope && action.scope !== "single" && world) {
        setLeaderDirForScope(view.tracks, world, dir, action.scope);
        cancelStarsChordEntry(view.starsChordEntry);
        view.starsChordArmed = null;
        return;
      }
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      armPreviewSlewAction(view.preview, action, nowMs);
      return;
    }
    case "setLeaderLength":
      if (action.flid && world) {
        const resolved = resolveScopeFlid(action.flid, world);
        if (resolved.ok) {
          setLeaderLengthForId(view.tracks, world, resolved.aircraftId, action.lengthPx);
          cancelStarsChordEntry(view.starsChordEntry);
          view.starsChordArmed = null;
          return;
        }
        rejectPreviewArea(view.preview, nowMs);
        return;
      }
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      armPreviewSlewAction(view.preview, action, nowMs);
      return;
    case "setLeaderDirAndLength":
      if (action.flid && world) {
        const resolved = resolveScopeFlid(action.flid, world);
        if (resolved.ok) {
          setLeaderDirAndLengthForId(
            view.tracks,
            world,
            resolved.aircraftId,
            action.dir,
            action.lengthPx,
          );
          cancelStarsChordEntry(view.starsChordEntry);
          view.starsChordArmed = null;
          return;
        }
        rejectPreviewArea(view.preview, nowMs);
        return;
      }
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      armPreviewSlewAction(view.preview, action, nowMs);
      return;
    case "clearAllForcedFdb":
      for (const td of view.tracks.values()) {
        td.forcedFdb = false;
      }
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      return;
    case "forceFdb":
      if (action.flid && world) {
        const resolved = resolveScopeFlid(action.flid, world);
        if (resolved.ok) {
          const td = ensureTrackDisplay(view.tracks, resolved.aircraftId);
          td.forcedFdb = !td.forcedFdb;
          cancelStarsChordEntry(view.starsChordEntry);
          view.starsChordArmed = null;
          return;
        }
        rejectPreviewArea(view.preview, nowMs);
        return;
      }
      if (world) {
        const slewedId = selectedTrackId(world);
        if (slewedId) {
          const td = ensureTrackDisplay(view.tracks, slewedId);
          td.forcedFdb = !td.forcedFdb;
          cancelStarsChordEntry(view.starsChordEntry);
          view.starsChordArmed = null;
          return;
        }
      }
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      armPreviewSlewAction(view.preview, action, nowMs);
      return;
    case "initCntl":
    case "termCntl":
    case "ackPointout":
    case "resetLeaderDir":
    case "beaconatorSlew":
    case "armPerTrackPtl":
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      armPreviewSlewAction(view.preview, action, nowMs);
      return;
    case "caSingleTrackInhibit":
      executeCaSingleTrackInhibit(view, action.trk, world, nowMs);
      return;
    case "caPairToggle":
      executeCaPairToggle(view, action.trk1, action.trk2, world, nowMs);
      return;
    case "caControllerPairs":
      executeCaControllerPairs(view, action.mode, world);
      return;
    case "caPairSlew":
      executeCaPairSlew(view, nowMs);
      return;
    case "msawCurrentAlertInhibit":
    case "toggleMsawProcessing":
      // Q/V always require a target slew/click; never dispatch Command IR.
      armPreviewSlewAction(view.preview, action, nowMs);
      return;
    case "openFlightPlanModal":
      if (action.targetSlew) {
        armPreviewSlewAction(view.preview, action, nowMs);
      } else {
        ui?.onOpenFlightPlanModal?.({ acid: action.acid, index: action.index });
      }
      return;
    case "toggleMci":
      view.mciEnabled = !view.mciEnabled;
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      return;
    case "saveAsPref":
      if (action.name) {
        commitDcbPrefSaveAs(view, action.name, browserDcbPrefStorage() ?? undefined);
      }
      return;
    case "rblDelete": {
      if (action.id !== undefined) {
        const removed = removeRangeBearingLine(view.rbl, action.id);
        if (!removed) {
          rejectPreviewAreaWithReason(view.preview, nowMs, "RBL ID");
          return;
        }
      } else {
        clearRangeBearingLines(view.rbl);
      }
      cancelRblPending(view.rbl);
      cancelPreviewArea(view.preview);
      return;
    }
    case "rblEndpoint1": {
      if (!world) return;
      const res1 = resolveRblFirstEndpoint(action.operand, world, view.tracks);
      if (res1.kind === "error") {
        cancelRblPending(view.rbl);
        rejectPreviewAreaWithReason(view.preview, nowMs, res1.reason);
        return;
      }
      // Staged first endpoint
      view.rbl.pendingFirstEndpoint = res1.endpoint;
      view.preview.phase = "entry";
      view.preview.buffer = "";
      view.preview.entryOrigin = "literalSplat";
      view.preview.mnemonic = "RBL";
      view.preview.flid = null;
      view.preview.rejection = null;
      return;
    }
    case "rblCreate":
    case "rblEndpoint2": {
      if (!world) return;
      const secondOperand = action.type === "rblCreate" ? action.secondOperand : action.operand;
      // Second endpoint entered: check if buffer was empty
      if (secondOperand.trim().length === 0) {
        cancelRblPending(view.rbl);
        rejectPreviewAreaWithReason(view.preview, nowMs, "FORMAT");
        return;
      }
      let firstEp = view.rbl.pendingFirstEndpoint;
      if (action.type === "rblCreate") {
        const first = resolveRblFirstEndpoint(action.firstOperand, world, view.tracks);
        if (first.kind === "error") {
          cancelRblPending(view.rbl);
          rejectPreviewAreaWithReason(view.preview, nowMs, first.reason);
          return;
        }
        firstEp = first.endpoint;
      }
      if (!firstEp) {
        cancelRblPending(view.rbl);
        rejectPreviewAreaWithReason(view.preview, nowMs, "FORMAT");
        return;
      }
      const res2 = resolveRblSecondEndpoint(secondOperand, world, view.tracks);
      if (res2.kind === "error") {
        cancelRblPending(view.rbl);
        rejectPreviewAreaWithReason(view.preview, nowMs, res2.reason);
        return;
      }
      // Revalidate first endpoint if it was a track
      if (firstEp.kind === "track") {
        const rep = view.tracks.get(firstEp.aircraftId)?.lastReport;
        if (
          !world.aircraft.some((aircraft) => aircraft.id === firstEp.aircraftId) ||
          !rep ||
          !Number.isFinite(rep.xNm) ||
          !Number.isFinite(rep.yNm) ||
          !Number.isFinite(rep.reportedAtSimMs)
        ) {
          cancelRblPending(view.rbl);
          rejectPreviewAreaWithReason(view.preview, nowMs, "NO FLIGHT");
          return;
        }
      }
      // Capacity check: max 9 lines, after confirming both endpoints remain valid.
      if (view.rbl.lines.size >= 9) {
        cancelRblPending(view.rbl);
        rejectPreviewAreaWithReason(view.preview, nowMs, "CAPACITY");
        return;
      }
      const created = insertRangeBearingLine(
        view.rbl,
        firstEp,
        res2.endpoint,
        view.tracks,
        world.simTimeMs,
      );
      if (!created) {
        cancelRblPending(view.rbl);
        rejectPreviewAreaWithReason(view.preview, nowMs, "CAPACITY");
        return;
      }
      view.rbl.pendingFirstEndpoint = null;
      cancelPreviewArea(view.preview);
      return;
    }
    default:
      return;
  }
}

function applyPreviewBufferOutcome(
  view: ScopeView,
  world: World | undefined,
  nowMs: number,
  outcome: PreviewKeyOutcome,
  ui?: ScopeKeyUi,
): void {
  if (outcome.action) {
    if (view.stagedListAnchor && outcome.action.type === "toggleList") {
      const staged = view.stagedListAnchor;
      view.stagedListAnchor = null;
      relocateSystemList(view, staged.listId, staged.x, staged.y);
      cancelPreviewArea(view.preview);
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      return;
    }
    applyPreviewArmedAction(view, outcome.action, nowMs, world, ui);
  }
  if (outcome.starsBuffer) {
    const stars = commitStarsChord(outcome.starsBuffer);
    if (stars.kind === "action") {
      cancelPreviewArea(view.preview);
      cancelStarsChordEntry(view.starsChordEntry);
      armOrApplyStarsChordAction(view, world, stars.action);
      return;
    }
    rejectPreviewArea(view.preview, nowMs);
    rejectStarsChordEntry(view.starsChordEntry, nowMs);
    return;
  }
  if (
    view.preview.phase === "entry" &&
    view.preview.entryOrigin === "literalSplat" &&
    /^\*\s*T$/i.test(view.preview.buffer)
  ) {
    beginRblInput(view);
  }
  if (
    view.preview.phase === "entry" &&
    view.preview.entryOrigin === "literalSplat" &&
    view.preview.buffer.startsWith("*") &&
    !/^\*\s*T/i.test(view.preview.buffer)
  ) {
    syncStarsChordMirror(view, nowMs);
    return;
  }
  if (view.preview.phase === "idle" && view.starsChordEntry.phase === "entry") {
    cancelStarsChordEntry(view.starsChordEntry);
  }
}

/** Roll back competing pending input when literal `*T` becomes the active family. */
function beginRblInput(view: ScopeView): void {
  if (view.dcbSpinner.armed) cancelDcbSpinner(view);
  cancelFilterEntry(view.filterEntry, view.altitudeFilter);
  cancelDcbPrefSaveAs(view);
  cancelPendingMinSepIfArmed(view);
  view.pendingChord = null;
  view.placeCenterArmed = false;
  view.placeRangeRingArmed = false;
  view.f1DropArmed = false;
  view.stagedListAnchor = null;
  view.listDrag = cancelListDrag(view.listDrag);
  view.starsChordArmed = null;
  cancelStarsChordEntry(view.starsChordEntry);
}

function isVideoMapPreviewContinueKey(key: string, code?: string): boolean {
  if (isReservedScopeLetterShortcut(key)) {
    return false;
  }
  const ch = previewBufferCharFromKey(key, code);
  return ch !== null && (ch === " " || ch === "_" || /^[A-Z0-9]$/.test(ch));
}

function applyPreviewCntl(
  view: ScopeView,
  world: World,
  apply: { type: "initCntl" | "termCntl"; aircraftId: string; planId?: string },
): void {
  if (apply.type === "initCntl") {
    applyInitiateTrackToId(view.tracks, world, apply.aircraftId);
  } else {
    if (apply.aircraftId) {
      terminateTrackWithPlan(view.tracks, world, apply.aircraftId, view);
    } else if (apply.planId) {
      // Plan-only TERM remains a plan deletion; there is no radar target to
      // mark unassociated.
      deleteFlightPlanFromWorld(world, apply.planId);
    }
  }
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
  const spinnerOwnsRadioInput =
    view.dcbSpinner.armed &&
    typeof HTMLElement !== "undefined" &&
    event.target instanceof HTMLElement &&
    event.target.id === "command-line-input" &&
    event.target.closest('[role="dialog"][aria-modal="true"]') === null;
  const candidate =
    event.target && typeof event.target === "object"
      ? (event.target as { id?: string; closest?: (selector: string) => unknown })
      : null;
  const commandLineInput =
    candidate?.id === RADIO_COMMAND_LINE_ID &&
    typeof candidate.closest === "function" &&
    candidate.closest('[role="dialog"][aria-modal="true"]') === null;
  const hasNoControlModifiers = !event.ctrlKey && !event.altKey && !event.metaKey;
  const radioPreviewKey =
    commandLineInput &&
    (((event.key === "F7" || event.key === "F8") &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey) ||
      (previewTrackingSlew(view.preview)?.type === "fmaTrackInhibit" &&
        hasNoControlModifiers &&
        (previewBufferCharFromKey(event.key, event.code) !== null ||
          event.key === "Backspace" ||
          event.key === "Enter" ||
          event.key === "Escape")) ||
      (view.preview.phase === "entry" &&
        view.preview.entryOrigin === "multiFunc" &&
        hasNoControlModifiers &&
        (previewBufferCharFromKey(event.key, event.code) !== null ||
          event.key === "Backspace" ||
          event.key === "Enter" ||
          event.key === "Escape")));
  if (eventOwnedByNativeModal(event.target) && !spinnerOwnsRadioInput && !radioPreviewKey) {
    cancelRblOnFocusTakeover(view, "radio");
    return false;
  }
  if (
    event.key === "F7" &&
    view.helpOpen &&
    (ui?.helpOverlayHasFocus || helpOverlayHasKeyboardFocus(event.target))
  ) {
    return false;
  }
  if (
    event.key === "F8" &&
    view.helpOpen &&
    (ui?.helpOverlayHasFocus || helpOverlayHasKeyboardFocus(event.target))
  ) {
    return false;
  }
  if (isHelpToggleKey(event)) {
    cancelRblOnFocusTakeover(view, "radio");
    consume(event);
    toggleHelpOverlay(view);
    ui?.onHandled?.();
    return true;
  }
  if (event.key === "Escape" && view.helpOpen) {
    cancelRblOnFocusTakeover(view, "radio");
    consume(event);
    view.helpOpen = false;
    ui?.onHandled?.();
    return true;
  }

  // Endpoint 1 can arrive through the global Preview route without canvas
  // focus. Keep endpoint 2 on that same route after Enter clears the prefix.
  // Native text/modal ownership is handled above; actual focus takeover cancels
  // pending entry through the installed focus listener.
  if (view.rbl.pendingFirstEndpoint !== null) {
    if (event.key === "Escape") {
      cancelRblPending(view.rbl);
      cancelPreviewArea(view.preview);
      consume(event);
      ui?.onHandled?.();
      return true;
    }
    if (event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter") {
      consume(event);
      applyPreviewArmedAction(
        view,
        { type: "rblEndpoint2", operand: view.preview.buffer },
        nowMs,
        world,
        ui,
      );
      ui?.onHandled?.();
      return true;
    }
    if (event.key === "Backspace") {
      consume(event);
      view.preview.buffer = view.preview.buffer.slice(0, -1);
      view.preview.lastKeyAtMs = nowMs;
      ui?.onHandled?.();
      return true;
    }
    const ch = previewBufferCharFromKey(event.key, event.code);
    if (ch === "*" && hasNoControlModifiers) {
      cancelRblPending(view.rbl);
      startPreviewBuffer(view, "*", nowMs);
      consume(event);
      ui?.onHandled?.();
      return true;
    }
    if (ch !== null && hasNoControlModifiers) {
      consume(event);
      view.preview.phase = "entry";
      view.preview.entryOrigin = "literalSplat";
      view.preview.mnemonic = "RBL";
      view.preview.buffer += ch;
      view.preview.lastKeyAtMs = nowMs;
      ui?.onHandled?.();
      return true;
    }
  }

  if (focus === "scope" && isMinSepPending(view)) {
    if (isMinSepDeleteKey(event)) {
      consume(event);
      beginMinSepSelection(view.minSep);
      armPreviewMinSep(view.preview, nowMs);
      ui?.onHandled?.();
      return true;
    }
    if (event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter") {
      consume(event);
      clearMinSepState(view.minSep);
      cancelPreviewArea(view.preview);
      ui?.onHandled?.();
      return true;
    }
    if (event.key === "Escape") {
      consume(event);
      cancelMinSepPending(view.minSep);
      cancelPreviewArea(view.preview);
      ui?.onHandled?.();
      return true;
    }
    if (event.key === "Backspace") {
      consume(event);
      ui?.onHandled?.();
      return true;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      // Allow camera range preset step below without cancelling pending MIN
    } else if (
      event.key === "Home" ||
      (event.key === "End" && !event.shiftKey && !event.ctrlKey && !event.altKey)
    ) {
      // Allow centering below without cancelling pending MIN
    } else if (isCycleFocusKey(event.key)) {
      cancelPendingMinSepIfArmed(view);
    } else if (isHelpToggleKey(event)) {
      // Help
    } else if (event.key === "*" && hasNoControlModifiers) {
      // Let a fresh literal-splat operation below roll back pending MIN.
    } else if (isCompetingTargetingKey(event)) {
      cancelPendingMinSepIfArmed(view);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      consume(event);
      cancelMinSepPending(view.minSep);
      rejectPreviewAreaWithReason(view.preview, nowMs, "FORMAT");
      ui?.onHandled?.();
      return true;
    }
  }

  // A fresh literal star replaces an in-progress RBL entry. Keep star text
  // inside F7 MULTI FUNC and other Preview families owned by their origin.
  if (
    focus === "scope" &&
    event.key === "*" &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    view.preview.phase === "entry" &&
    view.preview.entryOrigin === "literalSplat" &&
    (/^\*\s*T/i.test(view.preview.buffer) || view.rbl.pendingFirstEndpoint !== null)
  ) {
    consume(event);
    startPreviewBuffer(view, "*", nowMs);
    ui?.onHandled?.();
    return true;
  }

  if (focus === "scope" && isMinSepDeleteKey(event)) {
    consume(event);
    if (view.dcbSpinner.armed) {
      cancelDcbSpinner(view);
    }
    cancelFilterEntry(view.filterEntry, view.altitudeFilter);
    cancelDcbPrefSaveAs(view);
    view.pendingChord = null;
    cancelStarsChordEntry(view.starsChordEntry);
    view.starsChordArmed = null;
    view.placeCenterArmed = false;
    view.placeRangeRingArmed = false;
    view.f1DropArmed = false;
    view.stagedListAnchor = null;
    cancelPreviewArea(view.preview);
    cancelRblPending(view.rbl);
    beginMinSepSelection(view.minSep);
    armPreviewMinSep(view.preview, nowMs);
    ui?.onHandled?.();
    return true;
  }

  if (view.dcbSpinner.armed) {
    if (event.key === "Escape" || event.code === "Escape" || event.key === "Clear") {
      consume(event);
      cancelDcbSpinner(view);
      ui?.onHandled?.();
      return true;
    }
    if (event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter") {
      consume(event);
      const cell = view.dcbSpinner.cell;
      const buffer = view.dcbSpinner.buffer;
      commitDcbSpinner(view);
      if (cell === "LDR_DIR" && world && buffer.trim().length > 0) {
        const dir = Number(buffer);
        if (Number.isInteger(dir) && dir !== 5) {
          applyDcbLeaderDir(view, world, dir as LeaderDir);
        }
      } else if (cell?.startsWith("FMA_LDR_") && buffer.trim().length > 0) {
        const keypadDigit = Number(buffer.trim());
        const mapped = FMA_RUNWAY_KEYPAD_TO_DIR[keypadDigit];
        if (mapped !== undefined) {
          const rwy = cell.slice(8);
          setFmaRunwayLeader(view, rwy, mapped);
        }
      }
      ui?.onHandled?.();
      return true;
    }
    if (event.key === "Backspace" || event.code === "Backspace") {
      consume(event);
      backspaceDcbSpinner(view);
      ui?.onHandled?.();
      return true;
    }
    const numericSpinnerKey =
      /^[0-9]$/.test(event.key) ||
      event.key === "." ||
      /^Numpad[0-9]$/.test(event.code ?? "") ||
      event.code === "NumpadDecimal";
    if (numericSpinnerKey && (event.shiftKey || event.ctrlKey || event.altKey)) {
      consume(event);
      ui?.onHandled?.();
      return true;
    }
    if (numericSpinnerKey) {
      consume(event);
      const ch =
        event.key === "." || event.code === "NumpadDecimal"
          ? "."
          : /^Numpad[0-9]$/.test(event.code ?? "")
            ? event.code!.slice(6)
            : event.key;
      inputDcbSpinnerKey(view, ch);
      ui?.onHandled?.();
      return true;
    }
    // Consume printable letter/alphanumeric characters while a DCB spinner is armed
    // (for AMZ label entry, or to capture malformed alphabetic inputs for numeric format rejection)
    if (
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      /^[A-Za-z_-]$/.test(event.key) &&
      isFmaDcbSpinnerCell(view.dcbSpinner.cell)
    ) {
      consume(event);
      inputDcbSpinnerKey(view, event.key);
      ui?.onHandled?.();
      return true;
    }
  }

  // STARS Key Mappings (Table 18): Ctrl+F1 to Ctrl+F11
  if (event.ctrlKey) {
    switch (event.key) {
      case "F1":
        consume(event);
        centerOnAirport(view);
        ui?.onHandled?.();
        return true;
      case "F2":
        consume(event);
        openDcbMenu(view, "MAPS");
        ui?.onHandled?.();
        return true;
      case "F3":
        consume(event);
        openDcbMenu(view, "BRITE");
        ui?.onHandled?.();
        return true;
      case "F4":
        consume(event);
        openDcbMenu(view, "LDR");
        ui?.onHandled?.();
        return true;
      case "F5":
        consume(event);
        openDcbMenu(view, "CHAR_SIZE");
        ui?.onHandled?.();
        return true;
      case "F7":
        consume(event);
        applyDcbShift(view);
        ui?.onHandled?.();
        return true;
      case "F8":
        consume(event);
        toggleDcbVisible(view);
        ui?.onHandled?.();
        return true;
      case "F9":
        consume(event);
        armDcbSpinner(view, "RR");
        ui?.onHandled?.();
        return true;
      case "F10":
        consume(event);
        armDcbSpinner(view, "RANGE");
        ui?.onHandled?.();
        return true;
      case "F11":
        consume(event);
        toggleWxLevels(view);
        ui?.onHandled?.();
        return true;
    }
  }

  // Modified F7 combinations retain native modifier ownership; plain F7 starts MULTI FUNC.
  if (event.key === "F7" && (event.shiftKey || event.altKey || event.metaKey)) {
    return false;
  }
  if (event.key === "F8" && (event.shiftKey || event.altKey || event.metaKey)) return false;

  // STARS Table 18: Ins / Insert -> <PREF SET>
  if (event.key === "Insert" || event.key === "Ins") {
    consume(event);
    openDcbMenu(view, "PREF");
    ui?.onHandled?.();
    return true;
  }

  // Manual Appendix D Table D-1: F6 -> FLT DATA. Always-on and scope-only;
  // never enters the radio parser.
  if (event.key === "F6" && !event.ctrlKey && !event.altKey) {
    consume(event);
    startFltDataEntry(view, nowMs);
    ui?.onHandled?.();
    return true;
  }

  // Manual Appendix D Table D-1: F9 -> VFR. Ctrl+F9 remains DCB RR.
  if (event.key === "F9" && !event.ctrlKey && !event.altKey) {
    consume(event);
    startVfrEntry(view, nowMs);
    ui?.onHandled?.();
    return true;
  }

  // Manual Appendix D Table D-1: F1 -> INIT CNTL.
  if (event.key === "F1" && !event.ctrlKey && !event.altKey) {
    consume(event);
    if (world && selectedTrackId(world)) {
      applyInitiateTrackToSelection(view.tracks, world);
      cancelPreviewArea(view.preview);
    } else {
      armPreviewCntl(view.preview, "initCntl", nowMs);
    }
    ui?.onHandled?.();
    return true;
  }

  // STARS Table 18: F5 -> <HND OFF>
  if (event.key === "F5" && !event.ctrlKey) {
    consume(event);
    if (world) {
      applyHandoffToSelection(view.tracks, world);
    }
    ui?.onHandled?.();
    return true;
  }

  // STARS Table 18: F7 -> <MULTI FUNC>
  if (event.key === "F7" && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    consume(event);
    startMultiFuncEntry(view, nowMs);
    ui?.onHandled?.();
    return true;
  }

  // Appendix D Table D-1: FMA/TSAS owns one Preview slew arm, whether enabled or not.
  if (event.key === "F8" && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    consume(event);
    cancelRblPending(view.rbl);
    cancelPreviewArea(view.preview);
    cancelStarsChordEntry(view.starsChordEntry);
    view.starsChordArmed = null;
    cancelDcbSpinner(view);
    cancelPendingMinSepIfArmed(view);
    view.placeCenterArmed = false;
    view.placeRangeRingArmed = false;
    view.f1DropArmed = false;
    view.beaconatorActive = false;
    armPreviewSlewAction(view.preview, { type: "fmaTrackInhibit" }, nowMs);
    ui?.onHandled?.();
    return true;
  }

  // STARS Table 18: F10 -> <PTL>
  if (event.key === "F10" && !event.ctrlKey) {
    consume(event);
    togglePtlOn(view);
    ui?.onHandled?.();
    return true;
  }

  // STARS Table 18: F11 -> <CA>
  if (event.key === "F11" && !event.ctrlKey) {
    consume(event);
    if (view.preview.phase === "entry") {
      view.preview.buffer += "CA ";
      view.preview.lastKeyAtMs = nowMs;
    } else {
      startPreviewBuffer(view, "CA ", nowMs);
    }
    ui?.onHandled?.();
    return true;
  }
  if (event.key === "FPL" || event.code === "FPL") {
    consume(event);
    toggleSystemList(view, "FL");
    ui?.onHandled?.();
    return true;
  }
  if (event.key === "VFR" || event.code === "VFR") {
    consume(event);
    toggleSystemList(view, "VL");
    ui?.onHandled?.();
    return true;
  }
  if (isCycleFocusKey(event.key)) {
    if (ui?.helpOverlayHasFocus || helpOverlayHasKeyboardFocus(event.target)) {
      return false;
    }
    cancelPendingMinSepIfArmed(view);
    cancelRblOnFocusTakeover(view, "radio");
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
    view.f1DropArmed = false;
    view.stagedListAnchor = null;
    cancelRblPending(view.rbl);
    const previewStar =
      view.preview.entryOrigin === "literalSplat" && view.preview.buffer.startsWith("*");
    if (handlePreviewEscape(view.preview)) {
      cancelDcbPrefSaveAs(view);
      if (previewStar) {
        cancelStarsChordEntry(view.starsChordEntry);
        view.starsChordArmed = null;
      }
      consume(event);
      ui?.onHandled?.();
      return true;
    }
    const filterBusy = focus === "scope" && view.filterEntry.phase !== "idle";
    const starsBusy =
      focus === "scope" && (view.starsChordEntry.phase !== "idle" || view.starsChordArmed != null);
    if (!filterBusy && !starsBusy && handleDcbEscape(view)) {
      consume(event);
      ui?.onHandled?.();
      return true;
    }
  }

  const fmaPending = previewTrackingSlew(view.preview)?.type === "fmaTrackInhibit";
  if (fmaPending && !event.ctrlKey && !event.altKey && !event.metaKey) {
    if (event.key === "Enter") {
      if (view.preview.buffer.trim().length > 0)
        rejectPreviewAreaWithReason(view.preview, nowMs, "FORMAT");
      consume(event);
      ui?.onHandled?.();
      return true;
    }
    if (event.key === "Backspace") {
      view.preview.buffer = view.preview.buffer.slice(0, -1);
      consume(event);
      ui?.onHandled?.();
      return true;
    }
    const ch = previewBufferCharFromKey(event.key, event.code);
    if (ch !== null) {
      view.preview.buffer += ch;
      consume(event);
      ui?.onHandled?.();
      return true;
    }
  }

  const previewFlid = handlePreviewFlidKey(view.preview, event.key, nowMs, world, view);
  if (previewFlid.consumed) {
    consume(event);
    if (previewFlid.apply && world) {
      applyPreviewCntl(view, world, previewFlid.apply);
    }
    ui?.onHandled?.();
    return true;
  }

  // `*` is an always-on Preview prefix, including while the radio input has
  // focus. This keeps `*FP`, `*F`, `*TV`, and other existing Preview forms out
  // of the radio parser. Native modal controls return above and own their keys.
  if (
    focus !== "scope" &&
    view.preview.phase === "entry" &&
    (view.preview.entryOrigin === "multiFunc" ||
      (ui?.onOpenFlightPlanModal && view.preview.buffer.startsWith("*")))
  ) {
    const preview = handlePreviewBufferKey(
      view.preview,
      event.key,
      nowMs,
      event.code,
      loadedCatalogMaps(view),
      videoMapTokenLayout(view),
    );
    if (preview.consumed) {
      consume(event);
      applyPreviewBufferOutcome(view, world, nowMs, preview, ui);
      ui?.onHandled?.();
      return true;
    }
  }
  if (focus !== "scope" && ui?.onOpenFlightPlanModal && event.key === "*") {
    consume(event);
    startPreviewBuffer(view, "*", nowMs);
    ui?.onHandled?.();
    return true;
  }

  if (focus === "scope") {
    if (view.preview.phase === "entry") {
      const preview = handlePreviewBufferKey(
        view.preview,
        event.key,
        nowMs,
        event.code,
        loadedCatalogMaps(view),
        videoMapTokenLayout(view),
      );
      if (preview.consumed) {
        consume(event);
        applyPreviewBufferOutcome(view, world, nowMs, preview, ui);
        ui?.onHandled?.();
        return true;
      }
    } else {
      if (
        view.pendingChord?.prefix === "M" &&
        isScopeChordLive(view.pendingChord, nowMs) &&
        isVideoMapPreviewContinueKey(event.key, event.code)
      ) {
        consume(event);
        toggleModeCVisible(view);
        view.pendingChord = null;
        startPreviewBuffer(view, "M", nowMs);
        const preview = handlePreviewBufferKey(
          view.preview,
          event.key,
          nowMs,
          event.code,
          loadedCatalogMaps(view),
          videoMapTokenLayout(view),
        );
        applyPreviewBufferOutcome(view, world, nowMs, preview, ui);
        ui?.onHandled?.();
        return true;
      }
      if (view.pendingChord?.prefix === "M") {
        view.pendingChord = null;
      }
      const stars = handleStarsChordEntryKey(view.starsChordEntry, event.key, nowMs, event.code);
      if (stars.consumed) {
        consume(event);
        if (event.key === "Escape") {
          view.starsChordArmed = null;
        }
        if (stars.action) {
          armOrApplyStarsChordAction(view, world, stars.action);
        }
        return true;
      }
    }
    if (event.key === "Escape" && view.listDrag?.movingListId) {
      consume(event);
      view.listDrag = cancelListDrag(view.listDrag);
      ui?.onHandled?.();
      return true;
    }
    if (event.key === "Escape" && view.starsChordArmed) {
      consume(event);
      view.starsChordArmed = null;
      return true;
    }
    if (isStarsChordPrefixKey(event.key)) {
      consume(event);
      startPreviewBuffer(view, "*", nowMs);
      ui?.onHandled?.();
      return true;
    }
    if (isRadioFocusSlashKey(event.key)) {
      consume(event);
      startPreviewBuffer(view, "/", nowMs);
      ui?.onHandled?.();
      return true;
    }
    if (isBeaconSelectKey(event.key) && !previewAreaIsLive(view.preview)) {
      consume(event);
      cancelFilterEntry(view.filterEntry, view.altitudeFilter);
      view.pendingChord = null;
      view.starsChordArmed = null;
      beginPreviewBeaconEntry(view.preview, nowMs);
      ui?.onHandled?.();
      return true;
    }
    if (
      handleFilterEntryKey(view.filterEntry, view.altitudeFilter, event.key, nowMs, () =>
        retainFullDatablocksOutsideAltitudeFilter(view.tracks),
      )
    ) {
      consume(event);
      return true;
    }
    if (!event.shiftKey && !isReservedScopeLetterShortcut(event.key)) {
      const ch = previewBufferCharFromKey(event.key, event.code);
      if (ch !== null && isPreviewBufferStartChar(ch)) {
        consume(event);
        startPreviewBuffer(view, ch, nowMs);
        ui?.onHandled?.();
        return true;
      }
    }
  } else {
    if (
      (view.preview.creationMode === "fltData" || view.preview.creationMode === "vfr") &&
      view.preview.phase === "entry"
    ) {
      const preview = handlePreviewBufferKey(view.preview, event.key, nowMs, event.code);
      if (preview.consumed) {
        consume(event);
        applyPreviewBufferOutcome(view, world, nowMs, preview, ui);
        ui?.onHandled?.();
        return true;
      }
    }
    if (view.preview.phase === "entry" && view.preview.creationMode !== "fltData") {
      cancelPreviewArea(view.preview);
      cancelDcbPrefSaveAs(view);
    }
    if (view.filterEntry.phase !== "idle") {
      cancelFilterEntry(view.filterEntry, view.altitudeFilter);
    }
    if (view.starsChordEntry.phase !== "idle") {
      cancelStarsChordEntry(view.starsChordEntry);
    }
    cancelPendingMinSepIfArmed(view);
    cancelRblPending(view.rbl);
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
    view.pendingChord = beginScopeChord("M", nowMs, "");
    return true;
  }
  if (!isAlwaysOnScopeKey(event.key)) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "F3") {
    // Manual Appendix D Table D-1 reserves F3 for Track Suspend. The
    // lifecycle is not implemented yet, so consume it without mutation.
    ui?.onHandled?.();
    return true;
  }
  if (event.key === "F1") {
    if (world && selectedTrackId(world)) {
      applyInitiateTrackToSelection(view.tracks, world);
      cancelPreviewArea(view.preview);
    } else {
      armPreviewCntl(view.preview, "initCntl", nowMs);
    }
    return true;
  }
  if (event.key === "F4") {
    if (world && selectedTrackId(world)) {
      const aircraftId = selectedTrackId(world)!;
      terminateTrackWithPlan(view.tracks, world, aircraftId, view);
      cancelPreviewArea(view.preview);
    } else {
      armPreviewCntl(view.preview, "termCntl", nowMs);
    }
    return true;
  }
  if (event.key === "F10") {
    togglePtlOn(view);
    return true;
  }
  if (event.key === "PageUp" || event.key === "PageDown") {
    const direction: 1 | -1 = event.key === "PageDown" ? 1 : -1;
    if (focus === "scope") {
      // 1. Check if cursor is over a list displaying MORE: X/Y
      if (view.cursorHoverPos && view.activeListRects) {
        const hovered = view.activeListRects.find((r) =>
          pointInsideRect(view.cursorHoverPos!.x, view.cursorHoverPos!.y, r.bounds),
        );
        if (hovered && isSystemListMultiPage(view, hovered.id, world)) {
          if (scrollSystemList(view, hovered.id, direction, world)) {
            ui?.onHandled?.();
            return true;
          }
        }
      }

      // 2. If cursor is not hovering over a specific paged list, check if any visible list has multiple pages
      const flPlacement = view.systemLists?.FL;
      if (flPlacement?.visible && isSystemListMultiPage(view, "FL", world)) {
        if (scrollSystemList(view, "FL", direction, world)) {
          ui?.onHandled?.();
          return true;
        }
      }

      if (view.systemLists) {
        const seenCanonical = new Set<string>(["FL"]);
        for (const [id, placement] of Object.entries(view.systemLists)) {
          const canonical = canonicalSystemListId(id);
          if (seenCanonical.has(canonical)) continue;
          seenCanonical.add(canonical);
          if (placement.visible && isSystemListMultiPage(view, id, world)) {
            if (scrollSystemList(view, id, direction, world)) {
              ui?.onHandled?.();
              return true;
            }
          }
        }
      }
    }

    // 3. If NO visible list has multiple pages, fall back to stepRange
    stepRange(view.camera, direction);
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
  if (view.dcbSpinner.armed && view.dcbSpinner.cell === "RANGE") {
    commitDcbSpinner(view);
  }
  if (event.deltaY < 0) {
    stepRange(view.camera, -1);
  } else {
    stepRange(view.camera, 1);
  }
  return true;
}

/**
 * Scope keyup handler. F1 is not momentary; it initiates INIT CNTL.
 */
export function handleScopeKeyUp(event: ScopeKeyEvent, view: ScopeView, ui?: ScopeKeyUi): boolean {
  void event;
  void view;
  void ui;
  return false;
}

/** Cancel a staged RBL as soon as focus leaves the PPI, including focus changes without a key. */
export function cancelRblOnFocusTakeover(view: ScopeView, focus: ScopeFocus): void {
  if (focus === "scope") return;
  const hasPendingRbl = view.rbl.pendingFirstEndpoint !== null;
  const hasRblEntry =
    view.preview.phase === "entry" &&
    view.preview.entryOrigin === "literalSplat" &&
    /^\*\s*T/i.test(view.preview.buffer);
  const hasFmaEntry = previewTrackingSlew(view.preview)?.type === "fmaTrackInhibit";
  if (!hasPendingRbl && !hasRblEntry && !hasFmaEntry) return;
  cancelRblPending(view.rbl);
  cancelPreviewArea(view.preview);
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
  function onFocusIn(): void {
    const focus = typeof document !== "undefined" ? scopeFocusFromDocument(document) : "radio";
    cancelRblOnFocusTakeover(view, focus);
  }
  function onWindowBlur(): void {
    cancelRblOnFocusTakeover(view, "radio");
  }
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("focusin", onFocusIn, true);
  window.addEventListener("blur", onWindowBlur, true);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    document.removeEventListener("focusin", onFocusIn, true);
    window.removeEventListener("blur", onWindowBlur, true);
  };
}
