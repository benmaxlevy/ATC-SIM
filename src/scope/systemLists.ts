/**
 * Analog: CRC STARS System Lists Window Manager / Vice stars/lists.go.
 * Manages in-scope system lists, normalized [x, y] coordinates, middle-click
 * drag-and-drop lifecycle, collision overlap detection, and show-all-frames preview.
 */

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
