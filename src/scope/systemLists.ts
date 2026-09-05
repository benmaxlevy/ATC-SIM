/**
 * Analog: CRC STARS System Lists Window Manager / Vice stars/lists.go.
 * Manages in-scope system lists, normalized [x, y] coordinates, middle-click
 * drag-and-drop lifecycle, collision overlap detection, and show-all-frames preview.
 */

import { MSAW_DATABLOCK_TAG, type Aircraft, type ScheduledDeparture, type World } from "@core";
import { formatAltitudeHundreds } from "./datablock";
import { buildSystemListLines, rewriteFixForList, type ListFormatter } from "./listFormatter";
import type { ScopeView } from "./scopeView";
import { applyInitiateTrackToId, ensureTrackDisplay, type TrackDisplay } from "./trackDisplay";
import { datablockLineHeightPx } from "./fonts";

export interface SystemListPlacement {
  id: string;
  frameTitle: string;
  /** Normalized X position [0, 1] relative to viewport width. */
  x: number;
  /** Normalized Y position [0, 1] relative to viewport height. */
  y: number;
  visible: boolean;
  maxLines: number;
}

export interface ListRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ListDragState {
  movingListId: string | null;
  movingAnchorRect: ListRect | null;
  movingCurrentPos: { x: number; y: number } | null;
  movingOffset: { x: number; y: number } | null;
  showAllFrames: boolean;
}

export function idleListDragState(): ListDragState {
  return {
    movingListId: null,
    movingAnchorRect: null,
    movingCurrentPos: null,
    movingOffset: null,
    showAllFrames: false,
  };
}

export const DEFAULT_ADAPTATION_ANCHORS: Readonly<
  Record<string, { x: number; y: number; maxLines: number }>
> = {
  FL: { x: 0.02, y: 0.4, maxLines: 10 },
  TL: { x: 0.75, y: 0.02, maxLines: 10 },
  VL: { x: 0.02, y: 0.7, maxLines: 10 },
  ML: { x: 0.25, y: 0.02, maxLines: 20 },
  AL: { x: 0.75, y: 0.7, maxLines: 50 },
  SSA: { x: 0.02, y: 0.02, maxLines: 15 },
  PREVIEW: { x: 0.02, y: 0.28, maxLines: 10 },
  SIGN_ON: { x: 0.02, y: 0.22, maxLines: 10 },
  COAST: { x: 0.4, y: 0.75, maxLines: 10 },
  CRDA: { x: 0.4, y: 0.02, maxLines: 10 },
  COORD: { x: 0.5, y: 0.02, maxLines: 10 },
  TOWER_1: { x: 0.75, y: 0.02, maxLines: 10 },
  TOWER_2: { x: 0.75, y: 0.25, maxLines: 10 },
  TOWER_3: { x: 0.75, y: 0.48, maxLines: 10 },
};

export const DEFAULT_SYSTEM_LIST_PLACEMENTS: Record<string, SystemListPlacement> = {
  SSA: {
    id: "SSA",
    frameTitle: "SYSTEM STATUS AREA (S)",
    x: 0.02,
    y: 0.02,
    visible: true,
    maxLines: 15,
  },
  SIGN_ON: {
    id: "SIGN_ON",
    frameTitle: "SIGN-ON (SO)",
    x: 0.02,
    y: 0.22,
    visible: false,
    maxLines: 10,
  },
  PREVIEW: {
    id: "PREVIEW",
    frameTitle: "PREVIEW AREA (P)",
    x: 0.02,
    y: 0.28,
    visible: true,
    maxLines: 10,
  },
  FL: {
    id: "FL",
    frameTitle: "FLIGHT PLAN (FL)",
    x: 0.02,
    y: 0.4,
    visible: false,
    maxLines: 10,
  },
  VL: {
    id: "VL",
    frameTitle: "VFR LIST (VL)",
    x: 0.02,
    y: 0.7,
    visible: false,
    maxLines: 10,
  },
  TL: {
    id: "TL",
    frameTitle: "TOWER (TL)",
    x: 0.75,
    y: 0.02,
    visible: false,
    maxLines: 10,
  },
  TOWER_2: {
    id: "TOWER_2",
    frameTitle: "TOWER 2 (P2)",
    x: 0.75,
    y: 0.25,
    visible: false,
    maxLines: 10,
  },
  TOWER_3: {
    id: "TOWER_3",
    frameTitle: "TOWER 3 (P3)",
    x: 0.75,
    y: 0.48,
    visible: false,
    maxLines: 10,
  },
  AL: {
    id: "AL",
    frameTitle: "LA/CA/MCI (AL)",
    x: 0.75,
    y: 0.7,
    visible: true,
    maxLines: 50,
  },
  COAST: {
    id: "COAST",
    frameTitle: "COAST/SUSPEND (TC)",
    x: 0.4,
    y: 0.75,
    visible: false,
    maxLines: 10,
  },
  CRDA: {
    id: "CRDA",
    frameTitle: "CRDA STATUS (CR)",
    x: 0.4,
    y: 0.02,
    visible: false,
    maxLines: 10,
  },
  COORD: {
    id: "COORD",
    frameTitle: "COORDINATION (F13)",
    x: 0.5,
    y: 0.02,
    visible: false,
    maxLines: 10,
  },
  ML: {
    id: "ML",
    frameTitle: "VIDEO MAPS (ML)",
    x: 0.25,
    y: 0.02,
    visible: false,
    maxLines: 20,
  },
};

// Aliases mapped to the same placement instances for backward compatibility
DEFAULT_SYSTEM_LIST_PLACEMENTS.TAB = DEFAULT_SYSTEM_LIST_PLACEMENTS.FL!;
DEFAULT_SYSTEM_LIST_PLACEMENTS.VFR = DEFAULT_SYSTEM_LIST_PLACEMENTS.VL!;
DEFAULT_SYSTEM_LIST_PLACEMENTS.TOWER_1 = DEFAULT_SYSTEM_LIST_PLACEMENTS.TL!;
DEFAULT_SYSTEM_LIST_PLACEMENTS.ALERT = DEFAULT_SYSTEM_LIST_PLACEMENTS.AL!;
DEFAULT_SYSTEM_LIST_PLACEMENTS.MAPS = DEFAULT_SYSTEM_LIST_PLACEMENTS.ML!;
DEFAULT_SYSTEM_LIST_PLACEMENTS.SO = DEFAULT_SYSTEM_LIST_PLACEMENTS.SIGN_ON!;
DEFAULT_SYSTEM_LIST_PLACEMENTS.CS = DEFAULT_SYSTEM_LIST_PLACEMENTS.COAST!;
DEFAULT_SYSTEM_LIST_PLACEMENTS.CR = DEFAULT_SYSTEM_LIST_PLACEMENTS.CRDA!;

export function canonicalSystemListId(listId: string): string {
  const upper = listId.toUpperCase();
  switch (upper) {
    case "TAB":
    case "T":
      return "FL";
    case "VFR":
    case "TV":
      return "VL";
    case "TOWER":
    case "TOWER_1":
    case "P1":
      return "TL";
    case "TOWER_2":
    case "P2":
      return "TOWER_2";
    case "TOWER_3":
    case "P3":
      return "TOWER_3";
    case "ALERT":
    case "TM":
      return "AL";
    case "MAPS":
    case "TX":
      return "ML";
    case "SIGN_ON":
    case "TS":
      return "SIGN_ON";
    case "SO":
      return "SIGN_ON";
    case "COAST":
    case "TC":
      return "COAST";
    case "CS":
      return "COAST";
    case "CRDA":
    case "TN":
      return "CRDA";
    case "CR":
      return "CRDA";
    default:
      return upper;
  }
}

const ALIAS_MAP: Record<string, string[]> = {
  FL: ["TAB"],
  TL: ["TOWER_1"],
  VL: ["VFR"],
  ML: ["MAPS"],
  AL: ["ALERT"],
  SIGN_ON: ["SO"],
  COAST: ["CS"],
  CRDA: ["CR"],
};

function assignPlacementToView(
  view: ScopeView,
  canonical: string,
  placement: SystemListPlacement,
): void {
  view.systemLists[canonical] = placement;
  const aliases = ALIAS_MAP[canonical];
  if (aliases) {
    for (const a of aliases) {
      view.systemLists[a] = placement;
    }
  }
}

export function cloneSystemListPlacements(): Record<string, SystemListPlacement> {
  const out: Record<string, SystemListPlacement> = {};
  for (const [id, placement] of Object.entries(DEFAULT_SYSTEM_LIST_PLACEMENTS)) {
    out[id] = { ...placement };
  }
  // Setup shared references for aliases so mutations reflect in both keys
  if (out.FL) out.TAB = out.FL;
  if (out.TL) out.TOWER_1 = out.TL;
  if (out.VL) out.VFR = out.VL;
  if (out.ML) out.MAPS = out.ML;
  if (out.AL) out.ALERT = out.AL;
  if (out.SIGN_ON) out.SO = out.SIGN_ON;
  if (out.COAST) out.CS = out.COAST;
  if (out.CRDA) out.CR = out.CRDA;
  return out;
}

export function ensureSystemListPlacement(
  view: ScopeView,
  listId: string,
): SystemListPlacement | undefined {
  if (!view.systemLists) {
    view.systemLists = cloneSystemListPlacements();
  }
  const canonical = canonicalSystemListId(listId);
  let existing = view.systemLists[canonical] ?? view.systemLists[listId];
  if (!existing && (canonical.startsWith("TL_") || listId.startsWith("TL_"))) {
    const idKey = canonical.startsWith("TL_") ? canonical : listId;
    const satId = idKey.slice(3).toUpperCase();
    const placement: SystemListPlacement = {
      id: idKey,
      frameTitle: `TOWER (${satId})`,
      x: DEFAULT_ADAPTATION_ANCHORS.TL.x,
      y: 0.25,
      visible: false,
      maxLines: 10,
    };
    view.systemLists[idKey] = placement;
    return placement;
  }
  if (!existing) {
    return undefined;
  }
  const shared = DEFAULT_SYSTEM_LIST_PLACEMENTS[canonical] ?? DEFAULT_SYSTEM_LIST_PLACEMENTS[listId];
  if (shared && existing === shared) {
    const copy = { ...existing };
    assignPlacementToView(view, canonical, copy);
    view.systemLists[listId] = copy;
    return copy;
  }
  assignPlacementToView(view, canonical, existing);
  view.systemLists[listId] = existing;
  return existing;
}

export function resetSystemListToDefault(view: ScopeView, listId: string): boolean {
  const placement = ensureSystemListPlacement(view, listId);
  if (!placement) return false;
  const canonical = canonicalSystemListId(listId);
  const def =
    DEFAULT_ADAPTATION_ANCHORS[canonical] ??
    DEFAULT_ADAPTATION_ANCHORS[listId] ??
    (canonical.startsWith("TL_") || listId.startsWith("TL_")
      ? { x: DEFAULT_ADAPTATION_ANCHORS.TL.x, y: 0.25, maxLines: 10 }
      : undefined);
  if (!def) return false;
  placement.x = def.x;
  placement.y = def.y;
  return true;
}

export function toggleSystemList(view: ScopeView, listId: string): void {
  const placement = ensureSystemListPlacement(view, listId);
  if (placement) {
    placement.visible = !placement.visible;
  }
}

/** Clamp to [1, 100]. Returns false when `listId` is unknown. */
export function setSystemListMaxLines(view: ScopeView, listId: string, maxLines: number): boolean {
  const placement = ensureSystemListPlacement(view, listId);
  if (!placement) {
    return false;
  }
  placement.maxLines = Math.max(1, Math.min(100, Math.trunc(maxLines)));
  return true;
}

/** Normalized canvas click → list anchor in [0, 1]. */
export function normalizedClickAnchor(
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
): { x: number; y: number } {
  const w = cssWidth > 0 ? cssWidth : 1;
  const h = cssHeight > 0 ? cssHeight : 1;
  return {
    x: Math.max(0, Math.min(1, cssX / w)),
    y: Math.max(0, Math.min(1, cssY / h)),
  };
}

/** Relocate a list (or SSA) anchor. Returns false when `listId` is unknown. */
export function relocateSystemList(view: ScopeView, listId: string, x: number, y: number): boolean {
  const placement = ensureSystemListPlacement(view, listId);
  if (!placement) {
    return false;
  }
  placement.x = Math.max(0, Math.min(1, x));
  placement.y = Math.max(0, Math.min(1, y));
  return true;
}

export function areAllSystemListsVisible(view: ScopeView): boolean {
  if (!view.systemLists) return false;
  const placements = Object.values(view.systemLists) as SystemListPlacement[];
  return placements.length > 0 && placements.every((p) => p.visible);
}

export function setAllSystemListsVisible(view: ScopeView, visible: boolean): void {
  if (!view.systemLists) {
    view.systemLists = { ...DEFAULT_SYSTEM_LIST_PLACEMENTS };
  }
  const placements = Object.values(view.systemLists) as SystemListPlacement[];
  for (const placement of placements) {
    placement.visible = visible;
  }
}

export function toggleAllSystemLists(view: ScopeView): void {
  const current = areAllSystemListsVisible(view);
  setAllSystemListsVisible(view, !current);
}

function isVfr(ac: Aircraft): boolean {
  return ac.squawk === "1200" || ac.assignedSquawk === "1200";
}

/* =========================================================================
 * 2. Sign-On List
 * Format: 1D  0311
 * ========================================================================= */

export interface SignOnState {
  subset?: number | string;
  sectorId?: string;
  signOnSimMs?: number;
}

export function buildSignOnList(state?: SignOnState, _maxLines: number = 10): string[] {
  const subset = state?.subset ?? 1;
  const sector = state?.sectorId ?? "D";
  const ms = state?.signOnSimMs ?? 11_460_000; // default 03:11 (3 * 3600 + 11 * 60) * 1000
  const totalSec = Math.floor(ms / 1000);
  const totalMin = Math.floor(totalSec / 60);
  const mm = String(totalMin % 60).padStart(2, "0");
  const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, "0");
  const signOnTime = `${hh}${mm}`;

  return [`${subset}${sector}  ${signOnTime}`];
}

/* =========================================================================
 * 3. Flight Plan List (FL / TAB List)
 * Format:
 * FLIGHT PLAN
 * MORE: X/Y
 *  1 AAL123  7022
 * ========================================================================= */

export interface FlightPlanEntry {
  index: number;
  callsign: string;
  squawk: string;
  aircraftId?: string;
  departureRef?: ScheduledDeparture;
}

export interface FlightPlanListState {
  offset: number;
  purgedKeys: Set<string>;
  assignedIndices: Map<string, number>;
}

export function idleFlightPlanListState(): FlightPlanListState {
  return {
    offset: 0,
    purgedKeys: new Set<string>(),
    assignedIndices: new Map<string, number>(),
  };
}

export function ensureFlightPlanListState(view?: ScopeView): FlightPlanListState {
  if (!view) {
    return idleFlightPlanListState();
  }
  if (!view.flightPlanList) {
    view.flightPlanList = idleFlightPlanListState();
  }
  return view.flightPlanList;
}

export function defaultDiscreteSquawk(callsign: string, salt: number = 0): string {
  let hash = 0;
  for (let i = 0; i < callsign.length; i++) {
    hash = (hash * 31 + callsign.charCodeAt(i)) & 0xffff;
  }
  const d1 = (Math.floor(hash / 512) % 7) + 1;
  const d2 = Math.floor(hash / 64) % 8;
  const d3 = Math.floor(hash / 8) % 8;
  const d4 = (hash + salt) % 8;
  return `${d1}${d2}${d3}${d4}`;
}

export function getFlightPlanEntries(world: World, view?: ScopeView): FlightPlanEntry[] {
  const state = ensureFlightPlanListState(view);
  const rawItems: {
    callsign: string;
    squawk: string;
    departureRef?: ScheduledDeparture;
    aircraftId?: string;
    requestedIndex?: number;
  }[] = [];

  const seenCallsigns = new Set<string>();

  // 1. Pending/proposed departures: world.scheduledDepartures where !spawned
  if (world.scheduledDepartures) {
    for (let i = 0; i < world.scheduledDepartures.length; i++) {
      const dep = world.scheduledDepartures[i]!;
      if (dep.spawned) continue;
      const cleanCallsign = dep.callsign.toUpperCase();
      if (state.purgedKeys.has(cleanCallsign)) continue;
      if (seenCallsigns.has(cleanCallsign)) continue;
      seenCallsigns.add(cleanCallsign);

      const squawk = (
        dep.assignedSquawk ||
        dep.squawk ||
        defaultDiscreteSquawk(cleanCallsign, i)
      ).padStart(4, "0");

      rawItems.push({
        callsign: cleanCallsign,
        squawk,
        departureRef: dep,
        requestedIndex: dep.index,
      });
    }
  }

  // 2. Unassociated tracks: td.unassociated === true or untracked non-VFR aircraft
  if (world.aircraft) {
    for (let i = 0; i < world.aircraft.length; i++) {
      const ac = world.aircraft[i]!;
      const cleanCallsign = ac.callsign.toUpperCase();
      if (state.purgedKeys.has(cleanCallsign) || state.purgedKeys.has(ac.id)) continue;
      if (isVfr(ac)) continue;

      const td = view?.tracks?.get(ac.id);
      if (td) {
        if (td.unassociated === true) {
          if (!seenCallsigns.has(cleanCallsign)) {
            seenCallsigns.add(cleanCallsign);
            const squawk = (ac.assignedSquawk || ac.squawk || td.squawk || "1200").padStart(4, "0");
            rawItems.push({
              callsign: cleanCallsign,
              squawk,
              aircraftId: ac.id,
            });
          }
        } else if (
          td.ownership === "owned" ||
          td.tracked === true ||
          (td.datablockMode === "full" && !td.unassociated)
        ) {
          // Correlated owned/tracked flight -> excluded from FL!
          continue;
        } else {
          // Unowned / untracked / partial datablock
          if (!seenCallsigns.has(cleanCallsign)) {
            seenCallsigns.add(cleanCallsign);
            const squawk = (ac.assignedSquawk || ac.squawk || td.squawk || "1200").padStart(4, "0");
            rawItems.push({
              callsign: cleanCallsign,
              squawk,
              aircraftId: ac.id,
            });
          }
        }
      } else {
        // No track display yet (e.g. initial world state)
        if (!seenCallsigns.has(cleanCallsign)) {
          seenCallsigns.add(cleanCallsign);
          const squawk = (ac.assignedSquawk || ac.squawk || "1200").padStart(4, "0");
          rawItems.push({
            callsign: cleanCallsign,
            squawk,
            aircraftId: ac.id,
          });
        }
      }
    }
  }

  // 3. Assign stable quick-action indices
  const usedIndices = new Set<number>();
  for (const item of rawItems) {
    if (item.requestedIndex !== undefined) {
      usedIndices.add(item.requestedIndex);
    }
  }

  const entries: FlightPlanEntry[] = [];
  const assigned = state.assignedIndices;

  for (const item of rawItems) {
    let idx: number;
    if (item.requestedIndex !== undefined) {
      idx = item.requestedIndex;
      assigned.set(item.callsign, idx);
    } else if (assigned.has(item.callsign) && !usedIndices.has(assigned.get(item.callsign)!)) {
      idx = assigned.get(item.callsign)!;
      usedIndices.add(idx);
    } else {
      let candidate = 1;
      while (usedIndices.has(candidate)) {
        candidate++;
      }
      idx = candidate;
      usedIndices.add(idx);
      assigned.set(item.callsign, idx);
    }

    entries.push({
      index: idx,
      callsign: item.callsign,
      squawk: item.squawk,
      aircraftId: item.aircraftId,
      departureRef: item.departureRef,
    });
  }

  return entries;
}

export function purgeFlightPlanEntry(
  _world: World,
  view: ScopeView | undefined,
  entry: FlightPlanEntry,
): void {
  const state = ensureFlightPlanListState(view);
  state.purgedKeys.add(entry.callsign);
  if (entry.aircraftId) {
    state.purgedKeys.add(entry.aircraftId);
  }
  if (entry.departureRef) {
    entry.departureRef.spawned = true;
  }
}

export function correlateFlightPlans(
  world: World,
  view: ScopeView,
): FlightPlanEntry[] {
  const entries = getFlightPlanEntries(world, view);
  const correlated: FlightPlanEntry[] = [];

  for (const entry of entries) {
    for (const ac of world.aircraft) {
      const td = ensureTrackDisplay(view.tracks, ac.id);
      const isUncorrelated =
        td.unassociated === true ||
        (td.ownership !== "owned" && td.datablockMode !== "full");
      if (!isUncorrelated) {
        continue;
      }

      const acSquawk = (ac.squawk || td.squawk || "1200").padStart(4, "0");
      const isDiscreteSquawk = acSquawk !== "1200";
      const squawkMatches = isDiscreteSquawk && acSquawk === entry.squawk;
      const callsignMatches = ac.callsign.toUpperCase() === entry.callsign.toUpperCase();

      if (squawkMatches || (callsignMatches && isDiscreteSquawk)) {
        // Upgrade target data block to Full Data Block (FDB) / associate
        ac.callsign = entry.callsign;
        ac.assignedSquawk = entry.squawk;
        ac.squawk = entry.squawk;

        td.unassociated = false;
        td.datablockMode = "full";
        td.ownership = "owned";
        td.tracked = true;

        purgeFlightPlanEntry(world, view, entry);
        correlated.push(entry);
        break;
      }
    }
  }

  return correlated;
}

export function associateFlightPlanToTrack(
  world: World,
  view: ScopeView,
  index: number,
  aircraftId: string,
): boolean {
  const td = ensureTrackDisplay(view.tracks, aircraftId);
  const isUncorrelated =
    td.unassociated === true ||
    (td.ownership !== "owned" && td.datablockMode !== "full");
  if (!isUncorrelated) {
    return false;
  }

  const entries = getFlightPlanEntries(world, view);
  const entry = entries.find((e) => e.index === index);
  if (!entry) {
    return false;
  }

  const ac = world.aircraft.find((a) => a.id === aircraftId);
  if (!ac) {
    return false;
  }

  ac.callsign = entry.callsign;
  ac.assignedSquawk = entry.squawk;
  ac.squawk = entry.squawk;

  td.unassociated = false;
  td.datablockMode = "full";
  td.ownership = "owned";
  td.tracked = true;

  purgeFlightPlanEntry(world, view, entry);
  return true;
}

export function deleteFlightPlanEntry(
  world: World,
  view: ScopeView,
  index: number,
): boolean {
  const entries = getFlightPlanEntries(world, view);
  const entry = entries.find((e) => e.index === index);
  if (!entry) {
    return false;
  }
  purgeFlightPlanEntry(world, view, entry);
  return true;
}

export function scrollFlightPlanList(
  view: ScopeView,
  direction: 1 | -1,
  world?: World,
): boolean {
  const state = ensureFlightPlanListState(view);
  const maxLines = view.systemLists?.FL?.maxLines ?? 10;
  const entriesCount = world ? getFlightPlanEntries(world, view).length : 0;
  if (entriesCount <= maxLines) {
    return false;
  }

  if (direction === 1) {
    state.offset = state.offset + maxLines >= entriesCount ? 0 : state.offset + maxLines;
  } else {
    state.offset = Math.max(0, state.offset - maxLines);
  }
  return true;
}

export function handleFlightPlanListClick(
  view: ScopeView,
  world: World,
  clickedLine: number,
): boolean {
  if (clickedLine < 0) return false;
  if (clickedLine === 0) return true;

  const maxLines = view.systemLists?.FL?.maxLines ?? 10;
  const entries = getFlightPlanEntries(world, view);
  const hasMoreHeader = entries.length > maxLines;

  if (hasMoreHeader && clickedLine === 1) {
    scrollFlightPlanList(view, 1, world);
    return true;
  }

  const visibleRow = hasMoreHeader ? clickedLine - 2 : clickedLine - 1;
  const state = ensureFlightPlanListState(view);
  const targetIdx = state.offset + visibleRow;

  if (targetIdx >= 0 && targetIdx < entries.length) {
    const entry = entries[targetIdx]!;
    if (view.beaconatorActive) {
      purgeFlightPlanEntry(world, view, entry);
      return true;
    }
    return true;
  }

  return true;
}

export function buildTabFlightPlanList(
  world: World,
  maxLines: number = 10,
  view?: ScopeView,
): string[] {
  if (view) {
    correlateFlightPlans(world, view);
  }
  const entries = getFlightPlanEntries(world, view);
  const state = ensureFlightPlanListState(view);
  if (state.offset >= entries.length && entries.length > 0) {
    state.offset = 0;
  }

  const formatter: ListFormatter = {
    title: "FLIGHT PLAN",
    frameTitle: "FLIGHT PLAN (FL)",
    maxLines,
    offset: state.offset,
    entries: entries.length,
    formatLine: (idx) => {
      const entry = entries[idx]!;
      const indexStr = String(entry.index).padStart(2, " ");
      const acid = entry.callsign.padEnd(7, " ");
      const bcn = String(entry.squawk).padStart(4, "0");
      return `${indexStr} ${acid} ${bcn}`;
    },
  };
  return buildSystemListLines(formatter);
}

/* =========================================================================
 * 4. Tower List
 * Format:
 * BOS TOWER
 * AAL100    CRJ7
 * ========================================================================= */

export interface TowerListEntryItem {
  callsign: string;
  aircraftType: string;
  distNm: number;
}

export function buildTowerArrivalList(
  world: World,
  airportCode: string = "BOS",
  airportXNm: number = 0,
  airportYNm: number = 0,
  maxLines: number = 10,
  droppedCallsigns?: Set<string> | string[],
): string[] {
  const droppedSet =
    droppedCallsigns instanceof Set ? droppedCallsigns : new Set(droppedCallsigns ?? []);

  const items: TowerListEntryItem[] = [];
  const seenCallsigns = new Set<string>();

  // 1. Staged departures (from world.scheduledDepartures, not yet spawned)
  if (world.scheduledDepartures) {
    for (const dep of world.scheduledDepartures) {
      if (dep.spawned) continue;
      const cleanCallsign = dep.callsign.trim().toUpperCase();
      if (droppedSet.has(cleanCallsign) || seenCallsigns.has(cleanCallsign)) continue;

      const matchesAirport =
        !dep.runwayId ||
        dep.runwayId.toUpperCase().startsWith(airportCode.toUpperCase()) ||
        airportCode.toUpperCase() === "BOS" ||
        (dep as any).airportId?.toUpperCase() === airportCode.toUpperCase();

      if (matchesAirport) {
        seenCallsigns.add(cleanCallsign);
        items.push({
          callsign: cleanCallsign,
          aircraftType: dep.aircraftType || "B738",
          distNm: 0,
        });
      }
    }
  }

  // 2. Active world aircraft (departures under tower or arrivals handed off / inbound)
  for (const ac of world.aircraft) {
    const cleanCallsign = ac.callsign.trim().toUpperCase();
    if (droppedSet.has(cleanCallsign) || seenCallsigns.has(cleanCallsign)) continue;

    const handoff = world.handoffs?.get(ac.id);
    const distNm = Math.hypot(ac.xNm - airportXNm, ac.yNm - airportYNm);

    // Departure roll-out / climbout: if handoff accepted to radar (handoff.kind === "none") and altitude > 2500, cleared
    const isDepartureHandoff =
      handoff?.kind === "departure" || (ac.intent as any)?.departure === true;
    if (isDepartureHandoff) {
      seenCallsigns.add(cleanCallsign);
      items.push({
        callsign: cleanCallsign,
        aircraftType: ac.aircraftType || "B738",
        distNm: 0,
      });
      continue;
    }

    // Handed off arrivals or aircraft inbound within 30 NM
    // Clears on touchdown / landed (altitude <= 50 or landed intent)
    const isLanded = ac.altitudeFt <= 50 || (ac.intent?.lateral as any)?.type === "LANDED";
    if (isLanded) {
      continue;
    }

    const isRelevantArrival =
      distNm <= 30 ||
      ac.intent?.landingCleared === true ||
      ac.intent?.lateral?.type === "LANDING";

    if (isRelevantArrival) {
      seenCallsigns.add(cleanCallsign);
      items.push({
        callsign: cleanCallsign,
        aircraftType: ac.aircraftType || "B738",
        distNm,
      });
    }
  }

  // Sort by distance (departures with distNm 0 first, then nearest arrivals)
  items.sort((a, b) => a.distNm - b.distNm);

  const formatter: ListFormatter = {
    title: `${airportCode.toUpperCase()} TOWER`,
    frameTitle: `TOWER (${airportCode.toUpperCase()})`,
    maxLines,
    entries: items.length,
    formatLine: (idx) => {
      const item = items[idx]!;
      const acid = item.callsign.padEnd(8, " ");
      const type = (item.aircraftType || "B738").padEnd(4, " ");
      return `${acid} ${type}`;
    },
  };
  return buildSystemListLines(formatter);
}

/* =========================================================================
 * 5. Coast/Suspend List
 * Format:
 * COAST/SUSPEND
 * 12  AAL506    C 3553 015
 * ========================================================================= */

export interface CoastTrackEntry {
  id?: string;
  callsign: string;
  status?: "C" | "S";
  squawk?: string;
  lastAltitudeHundreds?: number | string;
}

export const DEFAULT_COAST_ENTRIES: CoastTrackEntry[] = [
  { callsign: "AAL506", status: "C", squawk: "3553", lastAltitudeHundreds: "015" },
  { callsign: "JBU389", status: "C", squawk: "3746", lastAltitudeHundreds: "030" },
];

export function buildCoastSuspendList(
  suspendedAc?: (CoastTrackEntry | Aircraft)[],
  maxLines: number = 10,
): string[] {
  const items = suspendedAc && suspendedAc.length > 0 ? suspendedAc : DEFAULT_COAST_ENTRIES;

  const formatter: ListFormatter = {
    title: "COAST/SUSPEND",
    frameTitle: "COAST/SUSPEND (TC)",
    maxLines,
    entries: items.length,
    formatLine: (idx) => {
      const item = items[idx]!;
      const indexStr = String(idx + 12).padStart(2, "0");
      const acid = item.callsign.padEnd(9, " ");
      const status = ("status" in item && item.status) || "C";
      const bcn =
        ("squawk" in item && item.squawk) ||
        ("assignedSquawk" in item && item.assignedSquawk) ||
        "1200";
      const bcnStr = String(bcn).padStart(4, "0");
      let altStr = "015";
      if ("lastAltitudeHundreds" in item && item.lastAltitudeHundreds !== undefined) {
        altStr = String(item.lastAltitudeHundreds).padStart(3, "0");
      } else if ("altitudeFt" in item && typeof item.altitudeFt === "number") {
        altStr = formatAltitudeHundreds(item.altitudeFt);
      }
      return `${indexStr}  ${acid} ${status} ${bcnStr} ${altStr}`;
    },
  };
  return buildSystemListLines(formatter);
}

/* =========================================================================
 * 6. VFR List
 * Format:
 * VFR LIST
 * N12345  1200  045
 * N982B   4215  025
 * ========================================================================= */

export function isVfrAircraft(ac: Aircraft, tracks?: Map<string, TrackDisplay>): boolean {
  if (ac.squawk === "1200" || ac.assignedSquawk === "1200") {
    return true;
  }
  if ((ac as any).flightRules === "VFR" || ac.flightPlan?.rules === "VFR") {
    return true;
  }
  const track = tracks?.get(ac.id);
  if (track?.flightRules === "VFR") {
    return true;
  }
  return false;
}

export function buildVfrList(
  world: World,
  maxLines: number = 10,
  droppedCallsigns?: Set<string> | string[],
  tracks?: Map<string, TrackDisplay>,
): string[] {
  const droppedSet =
    droppedCallsigns instanceof Set ? droppedCallsigns : new Set(droppedCallsigns ?? []);
  const vfrFlights = world.aircraft.filter(
    (ac) => isVfrAircraft(ac, tracks) && !droppedSet.has(ac.callsign.trim().toUpperCase()),
  );

  const formatter: ListFormatter = {
    title: "VFR LIST",
    frameTitle: "VFR LIST (VL)",
    maxLines,
    entries: vfrFlights.length,
    formatLine: (idx) => {
      const ac = vfrFlights[idx]!;
      const acid = ac.callsign.padEnd(8, " ");
      const bcn = (ac.assignedSquawk || ac.squawk || "1200").padStart(4, "0");
      const alt = formatAltitudeHundreds(ac.altitudeFt);
      return `${acid}${bcn}  ${alt}`;
    },
  };
  return buildSystemListLines(formatter);
}

export function dropTowerListEntry(view: ScopeView, callsign: string): boolean {
  if (!view.towerListDroppedCallsigns) {
    view.towerListDroppedCallsigns = new Set();
  }
  view.towerListDroppedCallsigns.add(callsign.trim().toUpperCase());
  return true;
}

export function dropVfrListEntry(view: ScopeView, callsign: string): boolean {
  if (!view.vfrListDroppedCallsigns) {
    view.vfrListDroppedCallsigns = new Set();
  }
  view.vfrListDroppedCallsigns.add(callsign.trim().toUpperCase());
  return true;
}

export function promoteVfrListEntry(
  view: ScopeView,
  world: World,
  index: number,
  targetAircraftId: string,
): boolean {
  const droppedSet = view.vfrListDroppedCallsigns ?? new Set();
  const vfrFlights = world.aircraft.filter(
    (ac) => isVfrAircraft(ac, view.tracks) && !droppedSet.has(ac.callsign.trim().toUpperCase()),
  );
  const idx = index >= 14 ? index - 14 : index - 1;
  const entry = vfrFlights[idx];
  if (!entry) return false;

  const target = world.aircraft.find((a) => a.id === targetAircraftId);
  if (target) {
    target.callsign = entry.callsign;
    target.squawk = entry.squawk;
    target.assignedSquawk = entry.assignedSquawk;
  }
  applyInitiateTrackToId(view.tracks, world, targetAircraftId);
  const track = view.tracks.get(targetAircraftId);
  if (track) {
    track.datablockMode = "full";
    track.ownership = "owned";
    track.unassociated = false;
    track.tracked = true;
    track.flightRules = "VFR";
  }
  dropVfrListEntry(view, entry.callsign);
  return true;
}

export interface ActiveListEntryHit {
  listId: string;
  rowIndex: number;
  callsign: string;
  bounds: ListRect;
}

export function hitTestSystemListEntry(
  view: ScopeView,
  cssX: number,
  cssY: number,
): ActiveListEntryHit | null {
  if (view.activeListEntries && view.activeListEntries.length > 0) {
    for (const entry of view.activeListEntries) {
      if (pointInsideRect(cssX, cssY, entry.bounds)) {
        return entry;
      }
    }
  }
  return null;
}

/* =========================================================================
 * 7. LA/CA/MCI List
 * Format:
 * LA/CA/MCI
 * DAL111*UAE124    CA
 * ========================================================================= */

export function buildAlertList(world: World, maxLines: number = 50): string[] {
  const lines: string[] = [];
  if (world.alerts) {
    if (world.alerts.ca) {
      for (const alert of world.alerts.ca) {
        const pair = `${alert.callsignA}*${alert.callsignB}`.padEnd(16, " ");
        lines.push(`${pair} CA`);
      }
    }
    if (world.alerts.msaw) {
      for (const alert of world.alerts.msaw) {
        const callsign = alert.callsign.padEnd(16, " ");
        lines.push(`${callsign} ${MSAW_DATABLOCK_TAG}`);
      }
    }
  }
  if (lines.length === 0) return [];
  const formatter: ListFormatter = {
    title: "LA/CA/MCI",
    frameTitle: "LA/CA/MCI (TM)",
    maxLines,
    entries: lines.length,
    formatLine: (idx) => lines[idx]!,
  };
  return buildSystemListLines(formatter);
}

/* =========================================================================
 * 9. CRDA Status List
 * Format:
 * CRDA STATUS
 * 1  BOS 27/22L
 * ========================================================================= */

export interface CrdaRpcConfig {
  index: number;
  airport: string;
  pairing: string;
}

export const DEFAULT_CRDA_CONFIGS: CrdaRpcConfig[] = [
  { index: 1, airport: "BOS", pairing: "27/22L" },
  { index: 2, airport: "BOS", pairing: "27/33L" },
  { index: 3, airport: "BOS", pairing: "4L/15R" },
  { index: 4, airport: "BOS", pairing: "4R/15R" },
  { index: 5, airport: "BOS", pairing: "27/32" },
  { index: 6, airport: "BOS", pairing: "4L/33L" },
];

export function defaultCrdaConfigsForAirport(airportCode: string = "BOS"): CrdaRpcConfig[] {
  if (airportCode === "BOS") {
    return DEFAULT_CRDA_CONFIGS;
  }
  return [
    { index: 1, airport: airportCode, pairing: "27/09" },
    { index: 2, airport: airportCode, pairing: "09/27" },
    { index: 3, airport: airportCode, pairing: "27/27" },
  ];
}

export function buildCrdaStatusList(
  configs?: CrdaRpcConfig[],
  maxLines: number = 10,
  airportCode: string = "BOS",
): string[] {
  const items = configs && configs.length > 0 ? configs : defaultCrdaConfigsForAirport(airportCode);
  const formatter: ListFormatter = {
    title: "CRDA STATUS",
    frameTitle: "CRDA STATUS (CR)",
    maxLines,
    entries: items.length,
    formatLine: (idx) => {
      const cfg = items[idx]!;
      return `${cfg.index}  ${cfg.airport} ${cfg.pairing}`;
    },
  };
  return buildSystemListLines(formatter);
}

/* =========================================================================
 * Window Manager & Drag Handlers
 * ========================================================================= */

/**
 * Checks if two bounding rectangles overlap on the screen.
 */
export function rectsOverlap(a: ListRect, b: ListRect): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Checks if a point (px, py) is inside a bounding rectangle.
 */
export function pointInsideRect(px: number, py: number, rect: ListRect): boolean {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

/**
 * Finds all pairs of overlapping list IDs.
 */
export function findOverlappingLists(lists: { id: string; bounds: ListRect }[]): Set<string> {
  const overlappingIds = new Set<string>();
  for (let i = 0; i < lists.length; i++) {
    for (let j = i + 1; j < lists.length; j++) {
      if (rectsOverlap(lists[i]!.bounds, lists[j]!.bounds)) {
        overlappingIds.add(lists[i]!.id);
        overlappingIds.add(lists[j]!.id);
      }
    }
  }
  return overlappingIds;
}

/**
 * Handles middle-click mouse down on the radar scope.
 */
export function handleListMiddleClick(
  state: ListDragState,
  clickPos: { x: number; y: number },
  activeLists: { id: string; bounds: ListRect }[],
  paneExtent: { width: number; height: number },
): { nextState: ListDragState; updatedPlacement?: { id: string; x: number; y: number } } {
  // If actively dragging, clicking drops and commits the new position
  if (state.movingListId && state.movingOffset) {
    const listId = state.movingListId;
    const newX = Math.max(0, Math.min(1, (clickPos.x - state.movingOffset.x) / paneExtent.width));
    const newY = Math.max(0, Math.min(1, (clickPos.y - state.movingOffset.y) / paneExtent.height));
    return {
      nextState: idleListDragState(),
      updatedPlacement: { id: listId, x: newX, y: newY },
    };
  }

  // Check if click is inside any list to start dragging
  for (const list of activeLists) {
    if (pointInsideRect(clickPos.x, clickPos.y, list.bounds)) {
      return {
        nextState: {
          movingListId: list.id,
          movingAnchorRect: { ...list.bounds },
          movingCurrentPos: { ...clickPos },
          movingOffset: {
            x: clickPos.x - list.bounds.x,
            y: clickPos.y - list.bounds.y,
          },
          showAllFrames: false,
        },
      };
    }
  }

  // Clicked empty area
  return { nextState: state };
}

/**
 * Handles mouse movement during drag.
 */
export function handleListMouseMove(
  state: ListDragState,
  mousePos: { x: number; y: number },
): ListDragState {
  if (!state.movingListId) return state;
  return {
    ...state,
    movingCurrentPos: { ...mousePos },
  };
}

/**
 * Checks if a click pos is within the title header of a system list (the top line of the bounding rect).
 */
export function hitTestSystemListTitle(
  clickPos: { x: number; y: number },
  activeLists: { id: string; bounds: ListRect }[],
  headerHeightPx: number = 16,
): string | null {
  for (const list of activeLists) {
    const headerRect: ListRect = {
      x: list.bounds.x,
      y: list.bounds.y,
      width: list.bounds.width,
      height: headerHeightPx,
    };
    if (pointInsideRect(clickPos.x, clickPos.y, headerRect)) {
      return list.id;
    }
  }
  return null;
}

/**
 * Initiates drag directly from title header click (left-click or middle-click).
 */
export function handleListTitleDragStart(
  state: ListDragState,
  clickPos: { x: number; y: number },
  activeLists: { id: string; bounds: ListRect }[],
  headerHeightPx: number = 16,
): { nextState: ListDragState; started: boolean } {
  for (const list of activeLists) {
    const headerRect: ListRect = {
      x: list.bounds.x,
      y: list.bounds.y,
      width: list.bounds.width,
      height: headerHeightPx,
    };
    if (pointInsideRect(clickPos.x, clickPos.y, headerRect)) {
      return {
        started: true,
        nextState: {
          movingListId: list.id,
          movingAnchorRect: { ...list.bounds },
          movingCurrentPos: { ...clickPos },
          movingOffset: {
            x: clickPos.x - list.bounds.x,
            y: clickPos.y - list.bounds.y,
          },
          showAllFrames: false,
        },
      };
    }
  }
  return { nextState: state, started: false };
}

/**
 * Commits an active list drag to final normalized coordinates [0, 1].
 */
export function commitListDrag(
  state: ListDragState,
  currentPos: { x: number; y: number },
  paneExtent: { width: number; height: number },
): { nextState: ListDragState; updatedPlacement?: { id: string; x: number; y: number } } {
  if (!state.movingListId || !state.movingOffset) {
    return { nextState: state };
  }
  const listId = state.movingListId;
  const newX = Math.max(0, Math.min(1, (currentPos.x - state.movingOffset.x) / paneExtent.width));
  const newY = Math.max(0, Math.min(1, (currentPos.y - state.movingOffset.y) / paneExtent.height));
  return {
    nextState: idleListDragState(),
    updatedPlacement: { id: listId, x: newX, y: newY },
  };
}

/**
 * Cancels active list dragging.
 */
export function cancelListDrag(_state: ListDragState): ListDragState {
  return idleListDragState();
}

