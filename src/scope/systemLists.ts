/**
 * Analog: CRC STARS System Lists Window Manager / Vice stars/lists.go.
 * Manages in-scope system lists, normalized [x, y] coordinates, middle-click
 * drag-and-drop lifecycle, collision overlap detection, and show-all-frames preview.
 */

import type { World, Aircraft } from "@core";
import { formatAltitudeHundreds } from "./datablock";
import { buildSystemListLines, rewriteFixForList, type ListFormatter } from "./listFormatter";
import type { ScopeView } from "./scopeView";

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
  TAB: {
    id: "TAB",
    frameTitle: "FLIGHT PLAN (T)",
    x: 0.02,
    y: 0.45,
    visible: false,
    maxLines: 10,
  },
  VFR: {
    id: "VFR",
    frameTitle: "VFR LIST (TV)",
    x: 0.02,
    y: 0.7,
    visible: false,
    maxLines: 10,
  },
  TOWER_1: {
    id: "TOWER_1",
    frameTitle: "TOWER 1 (P1)",
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
  ALERT: {
    id: "ALERT",
    frameTitle: "LA/CA/MCI (TM)",
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
  MAPS: {
    id: "MAPS",
    frameTitle: "GEOGRAPHIC MAPS (TX)",
    x: 0.25,
    y: 0.02,
    visible: false,
    maxLines: 20,
  },
};

function cloneSystemListPlacements(): Record<string, SystemListPlacement> {
  const out: Record<string, SystemListPlacement> = {};
  for (const [id, placement] of Object.entries(DEFAULT_SYSTEM_LIST_PLACEMENTS)) {
    out[id] = { ...placement };
  }
  return out;
}

function ensureSystemListPlacement(view: ScopeView, listId: string): SystemListPlacement | undefined {
  if (!view.systemLists) {
    view.systemLists = cloneSystemListPlacements();
  }
  const existing = view.systemLists[listId];
  if (!existing) {
    return undefined;
  }
  const shared = DEFAULT_SYSTEM_LIST_PLACEMENTS[listId];
  if (shared && existing === shared) {
    const copy = { ...existing };
    view.systemLists[listId] = copy;
    return copy;
  }
  return existing;
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
 * 3. Flight Plan List (TAB List)
 * Format: [Index] [Callsign] [Assigned Squawk] [Type / Dest / Route Info]
 * ========================================================================= */

export function buildTabFlightPlanList(world: World, maxLines: number = 10): string[] {
  const flights = world.aircraft.filter((ac) => !isVfr(ac));
  const formatter: ListFormatter = {
    title: "FLIGHT PLAN",
    frameTitle: "FLIGHT PLAN (T)",
    maxLines,
    entries: flights.length,
    formatLine: (idx) => {
      const ac = flights[idx]!;
      const indexStr = String(idx + 1).padStart(2, "0");
      const acid = ac.callsign.padEnd(7, " ");
      const bcn = (ac.assignedSquawk || ac.squawk || "1200").padStart(4, "0");
      const type = (ac.aircraftType || "B738").padEnd(4, " ");
      const alt = formatAltitudeHundreds(
        ac.intent.requestedAltitudeFt ?? ac.intent.assignedAltitudeFt,
      );
      const fix = rewriteFixForList(
        ac.intent.expectedApproachId ?? ac.intent.clearedApproachId ?? "",
      );
      return `${indexStr} ${acid} ${bcn} ${type} ${alt} ${fix}`.trimEnd();
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

export function buildTowerArrivalList(
  world: World,
  airportCode: string = "BOS",
  airportXNm: number = 0,
  airportYNm: number = 0,
  maxLines: number = 10,
): string[] {
  const arrivals = world.aircraft
    .map((ac) => {
      const distNm = Math.hypot(ac.xNm - airportXNm, ac.yNm - airportYNm);
      return { ac, distNm };
    })
    .sort((a, b) => a.distNm - b.distNm);

  const formatter: ListFormatter = {
    title: `${airportCode.toUpperCase()} TOWER`,
    frameTitle: `TOWER (${airportCode.toUpperCase()})`,
    maxLines,
    entries: arrivals.length,
    formatLine: (idx) => {
      const { ac } = arrivals[idx]!;
      const acid = ac.callsign.padEnd(9, " ");
      const type = (ac.aircraftType || "B738").padEnd(4, " ");
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
 * 14  *N925RC    0263
 * ========================================================================= */

export function buildVfrList(world: World, maxLines: number = 10): string[] {
  const vfrFlights = world.aircraft.filter(isVfr);
  const formatter: ListFormatter = {
    title: "VFR LIST",
    frameTitle: "VFR LIST (TV)",
    maxLines,
    entries: vfrFlights.length,
    formatLine: (idx) => {
      const ac = vfrFlights[idx]!;
      const indexStr = String(idx + 14).padStart(2, "0");
      const acid = `*${ac.callsign}`.padEnd(10, " ");
      const bcn = (ac.assignedSquawk || ac.squawk || "1200").padStart(4, "0");
      return `${indexStr}  ${acid} ${bcn}`;
    },
  };
  return buildSystemListLines(formatter);
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
        lines.push(`${callsign} LA`);
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
 * Cancels active list dragging.
 */
export function cancelListDrag(_state: ListDragState): ListDragState {
  return idleListDragState();
}
