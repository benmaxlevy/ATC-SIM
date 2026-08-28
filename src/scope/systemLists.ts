/**
 * Analog: CRC STARS System Lists Window Manager / Vice stars/lists.go.
 * Manages in-scope system lists, normalized [x, y] coordinates, middle-click
 * drag-and-drop lifecycle, collision overlap detection, and show-all-frames preview.
 */

import type { World, Aircraft } from "@core";
import { formatAltitudeHundreds } from "./datablock";
import {
  buildSystemListLines,
  formatListEntry,
  rewriteFixForList,
  type ListFormatter,
} from "./listFormatter";
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
    y: 0.70,
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
    frameTitle: "ALERT LIST (TM)",
    x: 0.75,
    y: 0.70,
    visible: true,
    maxLines: 50,
  },
  COAST: {
    id: "COAST",
    frameTitle: "COAST/SUSPEND (TC)",
    x: 0.40,
    y: 0.75,
    visible: false,
    maxLines: 10,
  },
  COORD: {
    id: "COORD",
    frameTitle: "COORDINATION (F13)",
    x: 0.50,
    y: 0.02,
    visible: false,
    maxLines: 10,
  },
  MAPS: {
    id: "MAPS",
    frameTitle: "VIDEO MAPS (TX)",
    x: 0.25,
    y: 0.02,
    visible: false,
    maxLines: 20,
  },
};

/**
 * Builds TAB Flight Plan list lines.
 */
export function buildTabFlightPlanList(world: World, maxLines: number = 10): string[] {
  const flights = world.aircraft.filter((ac) => ac.flightRules !== "VFR");
  const formatter: ListFormatter = {
    title: "FLIGHT PLAN",
    frameTitle: "FLIGHT PLAN (T)",
    maxLines,
    entries: flights.length,
    formatLine: (idx) => {
      const ac = flights[idx]!;
      const indexStr = String(idx + 1).padStart(2, "0");
      const acid = ac.callsign.padEnd(7, " ");
      const bcn = (ac.assignedSquawk || "1200").padStart(4, "0");
      const alt = formatAltitudeHundreds(ac.intent.assignedAltitudeFt);
      const fix = rewriteFixForList(ac.intent.exitFix || ac.intent.entryFix);
      return `${indexStr} ${acid} ${bcn} ${alt} ${fix}`;
    },
  };
  return buildSystemListLines(formatter);
}

/**
 * Builds VFR list lines.
 */
export function buildVfrList(world: World, maxLines: number = 10): string[] {
  const vfrFlights = world.aircraft.filter((ac) => ac.flightRules === "VFR");
  const formatter: ListFormatter = {
    title: "VFR LIST",
    frameTitle: "VFR LIST (TV)",
    maxLines,
    entries: vfrFlights.length,
    formatLine: (idx) => {
      const ac = vfrFlights[idx]!;
      const indexStr = String(idx + 1).padStart(2, "0");
      const acid = ac.callsign.padEnd(7, " ");
      const bcn = (ac.assignedSquawk || "1200").padStart(4, "0");
      return `${indexStr} ${acid} ${bcn}`;
    },
  };
  return buildSystemListLines(formatter);
}

/**
 * Builds Tower arrival sequence list lines (sorted ascending by distance to airport).
 */
export function buildTowerArrivalList(
  world: World,
  airportCode: string = "KDEM",
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
    title: airportCode.toUpperCase(),
    frameTitle: `TOWER (${airportCode.toUpperCase()})`,
    maxLines,
    entries: arrivals.length,
    formatLine: (idx) => {
      const { ac, distNm } = arrivals[idx]!;
      const indexStr = String(idx + 1).padStart(2, "0");
      const acid = ac.callsign.padEnd(7, " ");
      const type = (ac.aircraftType || "B738").padEnd(4, " ");
      const gs = String(Math.round(ac.groundSpeedKt)).padStart(3, "0");
      const distStr = distNm.toFixed(1).padStart(4, " ");
      return `${indexStr} ${acid} ${type} ${gs} ${distStr}`;
    },
  };
  return buildSystemListLines(formatter);
}

/**
 * Builds Alert list lines (active MSAW and CA alerts).
 */
export function buildAlertList(world: World, maxLines: number = 50): string[] {
  const lines: string[] = [];
  if (world.alerts) {
    if (world.alerts.msaw) {
      for (const alert of world.alerts.msaw) {
        const ac = world.aircraft.find((a) => a.id === alert.aircraftId);
        if (ac) {
          lines.push(`LA ${ac.callsign.padEnd(7, " ")} ${formatAltitudeHundreds(ac.altitudeFt)}`);
        }
      }
    }
    if (world.alerts.ca) {
      for (const alert of world.alerts.ca) {
        const ac1 = world.aircraft.find((a) => a.id === alert.aircraft1Id);
        const ac2 = world.aircraft.find((a) => a.id === alert.aircraft2Id);
        if (ac1 && ac2) {
          lines.push(`CA ${ac1.callsign.padEnd(7, " ")} ${ac2.callsign.padEnd(7, " ")}`);
        }
      }
    }
  }
  if (lines.length === 0) return [];
  const formatter: ListFormatter = {
    title: "ALERT LIST",
    frameTitle: "ALERT LIST (TM)",
    maxLines,
    entries: lines.length,
    formatLine: (idx) => lines[idx]!,
  };
  return buildSystemListLines(formatter);
}

/**
 * Builds Coast / Suspend list lines.
 */
export function buildCoastSuspendList(suspendedAc: Aircraft[], maxLines: number = 10): string[] {
  const formatter: ListFormatter = {
    title: "COAST/SUSPEND",
    frameTitle: "COAST/SUSPEND (TC)",
    maxLines,
    entries: suspendedAc.length,
    formatLine: (idx) => {
      const ac = suspendedAc[idx]!;
      const indexStr = String(idx + 1).padStart(2, "0");
      const acid = ac.callsign.padEnd(7, " ");
      const bcn = (ac.assignedSquawk || "1200").padStart(4, "0");
      return `${indexStr} ${acid} ${bcn} SUSP`;
    },
  };
  return buildSystemListLines(formatter);
}

/**
 * Checks if two bounding rectangles overlap on the screen.
 */
export function rectsOverlap(a: ListRect, b: ListRect): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Checks if a point (px, py) is inside a bounding rectangle.
 */
export function pointInsideRect(px: number, py: number, rect: ListRect): boolean {
  return (
    px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
  );
}

/**
 * Finds all pairs of overlapping list IDs.
 */
export function findOverlappingLists(
  lists: { id: string; bounds: ListRect }[],
): Set<string> {
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
export function cancelListDrag(state: ListDragState): ListDragState {
  return idleListDragState();
}
