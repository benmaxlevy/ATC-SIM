import * as React from "react";
import { useRef, useState } from "react";
import type { World } from "@core";
import { setSelectedAircraft } from "@core";
import { ArrivalStrip } from "./ArrivalStrip";
import { DepartureStrip } from "./DepartureStrip";
import type { ArrivalStripData, DepartureStripData, FlightStrip } from "./types";
import "./strips.css";

export const DEFAULT_FACILITY_TITLE = "ATL — Flight Progress Strips";

export interface DraggedStripState {
  id: string;
  section: "departures" | "arrivals";
  sourceIndex: number;
}

export interface DropIndicatorState {
  section: "departures" | "arrivals";
  targetIndex: number;
}

/**
 * Selects an aircraft in World when it matches the given strip's callsign (ACID) or id.
 * Shared selection state with PPI and flight strips list.
 *
 * @returns true if an aircraft was matched and selected, false otherwise.
 */
export function selectTrackFromFlightStrip(world: World, strip: FlightStrip): boolean {
  const normAcid = strip.acid ? strip.acid.trim().toUpperCase() : "";
  const normId = strip.id ? strip.id.trim().toUpperCase() : "";
  const match = world.aircraft.find((ac) => {
    const acId = ac.id ? ac.id.trim().toUpperCase() : "";
    const acCallsign = ac.callsign ? ac.callsign.trim().toUpperCase() : "";
    return (
      (acId !== "" && (acId === normId || acId === normAcid)) ||
      (acCallsign !== "" && (acCallsign === normAcid || acCallsign === normId))
    );
  });
  if (match) {
    setSelectedAircraft(world, match.id);
    return true;
  }
  return false;
}

/**
 * Creates an onSelectStrip callback that synchronizes the clicked strip to World.selectedAircraftId.
 */
export function createStripSelectionHandler(
  world: World,
  onSelect?: (strip: FlightStrip) => void,
): (strip: FlightStrip) => void {
  return (strip: FlightStrip) => {
    selectTrackFromFlightStrip(world, strip);
    onSelect?.(strip);
  };
}

export interface StripsBoardProps {
  /** Array of departure flight strips (defaults to empty array). */
  departures?: DepartureStripData[];
  /** Array of arrival flight strips (defaults to empty array). */
  arrivals?: ArrivalStripData[];
  /** Facility header title (defaults to ATL — Flight Progress Strips). */
  facilityTitle?: string;
  /** Selection callback fired when a strip is clicked or activated. */
  onSelectStrip?: (strip: FlightStrip) => void;
  /** Optional ID or ACID of currently selected strip. */
  selectedStripId?: string;
  /** Optional custom CSS class name for outer container. */
  className?: string;
  /** Layout orientation mode ("horizontal" | "vertical"). Defaults to "horizontal". */
  layoutMode?: "horizontal" | "vertical";
  /** Initial layout mode when uncontrolled (defaults to "horizontal"). */
  defaultLayout?: "horizontal" | "vertical";
  /** Collapsed state for departures rack. */
  departuresCollapsed?: boolean;
  /** Initial collapsed state for departures rack when uncontrolled (defaults to false). */
  defaultDeparturesCollapsed?: boolean;
  /** Collapsed state for arrivals rack. */
  arrivalsCollapsed?: boolean;
  /** Initial collapsed state for arrivals rack when uncontrolled (defaults to false). */
  defaultArrivalsCollapsed?: boolean;
  /** Callback fired when layout mode changes. */
  onLayoutModeChange?: (mode: "horizontal" | "vertical") => void;
  /** Callback fired when departures collapsed state changes. */
  onDeparturesCollapsedChange?: (collapsed: boolean) => void;
  /** Callback fired when arrivals collapsed state changes. */
  onArrivalsCollapsedChange?: (collapsed: boolean) => void;
  /** Set of strip IDs that are indented (controlled mode). */
  indentedStripIds?: Set<string>;
  /** Initial set of indented strip IDs when uncontrolled. */
  defaultIndentedStripIds?: Set<string>;
  /** Callback fired when a strip's indentation state changes. */
  onToggleIndent?: (stripId: string, indented: boolean) => void;
  /** Controlled ordered strip IDs for departures. */
  departureOrder?: string[];
  /** Initial ordered strip IDs for departures when uncontrolled. */
  defaultDepartureOrder?: string[];
  /** Controlled ordered strip IDs for arrivals. */
  arrivalOrder?: string[];
  /** Initial ordered strip IDs for arrivals when uncontrolled. */
  defaultArrivalOrder?: string[];
  /** Callback fired when strips within a rack section are reordered. */
  onReorderStrips?: (section: "departures" | "arrivals", orderedStrips: FlightStrip[]) => void;
  /** Controlled dragged strip state. */
  draggedStrip?: DraggedStripState | null;
  /** Initial dragged strip state when uncontrolled. */
  defaultDraggedStrip?: DraggedStripState | null;
  /** Controlled drop indicator state. */
  dropIndicator?: DropIndicatorState | null;
  /** Initial drop indicator state when uncontrolled. */
  defaultDropIndicator?: DropIndicatorState | null;
}

function useSafeState<T>(initialValue: T | (() => T)): [T, (action: T | ((prev: T) => T)) => void] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatcher = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    ?.ReactCurrentDispatcher?.current;
  if (!dispatcher) {
    const val = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    return [val, () => {}];
  }
  return useState(initialValue);
}

function useSafeRef<T>(initialValue: T): { current: T } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatcher = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    ?.ReactCurrentDispatcher?.current;
  if (!dispatcher) {
    return { current: initialValue };
  }
  return useRef(initialValue);
}

function applyOrder<T extends FlightStrip>(strips: T[], order: string[]): T[] {
  if (!order || order.length === 0) return strips;
  const stripMap = new Map(strips.map((s) => [s.id, s]));
  const ordered: T[] = [];
  for (const id of order) {
    const strip = stripMap.get(id);
    if (strip) {
      ordered.push(strip);
      stripMap.delete(id);
    }
  }
  for (const strip of stripMap.values()) {
    ordered.push(strip);
  }
  return ordered;
}

/**
 * StripsBoard: Terminal flight progress strips board with dark controller cab backdrop,
 * facility title header, layout orientation toggle, and collapsible rack columns
 * (Departures and Arrivals).
 */
export function StripsBoard({
  departures = [],
  arrivals = [],
  facilityTitle: _facilityTitle = DEFAULT_FACILITY_TITLE,
  onSelectStrip,
  selectedStripId,
  className,
  layoutMode: layoutModeProp,
  defaultLayout,
  departuresCollapsed: departuresCollapsedProp,
  defaultDeparturesCollapsed,
  arrivalsCollapsed: arrivalsCollapsedProp,
  defaultArrivalsCollapsed,
  indentedStripIds: indentedStripIdsProp,
  defaultIndentedStripIds,
  departureOrder: departureOrderProp,
  defaultDepartureOrder,
  arrivalOrder: arrivalOrderProp,
  defaultArrivalOrder,
  onReorderStrips,
  draggedStrip: draggedStripProp,
  defaultDraggedStrip,
  dropIndicator: dropIndicatorProp,
  defaultDropIndicator,
  onLayoutModeChange,
  onDeparturesCollapsedChange,
  onArrivalsCollapsedChange,
  onToggleIndent,
}: StripsBoardProps) {
  const [internalDepOrder, setInternalDepOrder] = useSafeState<string[]>(
    () => defaultDepartureOrder ?? departures.map((d) => d.id),
  );
  const [internalArrOrder, setInternalArrOrder] = useSafeState<string[]>(
    () => defaultArrivalOrder ?? arrivals.map((a) => a.id),
  );

  const [internalDraggedStrip, setInternalDraggedStrip] = useSafeState<DraggedStripState | null>(
    defaultDraggedStrip ?? null,
  );
  const [internalDropIndicator, setInternalDropIndicator] = useSafeState<DropIndicatorState | null>(
    defaultDropIndicator ?? null,
  );

  const dragRef = useSafeRef<{
    draggedStrip: DraggedStripState | null;
    dropIndicator: DropIndicatorState | null;
    departureOrder: string[] | null;
    arrivalOrder: string[] | null;
  }>({
    draggedStrip: defaultDraggedStrip ?? null,
    dropIndicator: defaultDropIndicator ?? null,
    departureOrder: defaultDepartureOrder ?? null,
    arrivalOrder: defaultArrivalOrder ?? null,
  });

  const effectiveDepOrder =
    departureOrderProp ?? dragRef.current.departureOrder ?? internalDepOrder;
  const effectiveArrOrder = arrivalOrderProp ?? dragRef.current.arrivalOrder ?? internalArrOrder;

  const orderedDepartures = applyOrder(departures, effectiveDepOrder);
  const orderedArrivals = applyOrder(arrivals, effectiveArrOrder);

  const draggedStrip =
    draggedStripProp !== undefined
      ? draggedStripProp
      : (dragRef.current.draggedStrip ?? internalDraggedStrip);
  const dropIndicator =
    dropIndicatorProp !== undefined
      ? dropIndicatorProp
      : (dragRef.current.dropIndicator ?? internalDropIndicator);

  const setDraggedStrip = (
    next: DraggedStripState | null | ((prev: DraggedStripState | null) => DraggedStripState | null),
  ) => {
    const resolved = typeof next === "function" ? next(dragRef.current.draggedStrip) : next;
    dragRef.current.draggedStrip = resolved;
    if (draggedStripProp === undefined) {
      setInternalDraggedStrip(resolved);
    }
  };

  const setDropIndicator = (
    next:
      DropIndicatorState | null | ((prev: DropIndicatorState | null) => DropIndicatorState | null),
  ) => {
    const resolved = typeof next === "function" ? next(dragRef.current.dropIndicator) : next;
    dragRef.current.dropIndicator = resolved;
    if (dropIndicatorProp === undefined) {
      setInternalDropIndicator(resolved);
    }
  };

  const handleDragStart = (
    e: React.DragEvent,
    strip: FlightStrip,
    section: "departures" | "arrivals",
    index: number,
  ) => {
    if (e.dataTransfer) {
      e.dataTransfer.setData?.("text/plain", strip.id);
      e.dataTransfer.effectAllowed = "move";
    }
    setDraggedStrip({
      id: strip.id,
      section,
      sourceIndex: index,
    });
  };

  const handleDragOver = (
    e: React.DragEvent,
    section: "departures" | "arrivals",
    hoverIndex: number,
    targetElement?: HTMLElement,
  ) => {
    const currentDragged =
      draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
    if (!currentDragged || currentDragged.section !== section) {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "none";
      }
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    e.stopPropagation?.();

    const el =
      targetElement ??
      (e.currentTarget as HTMLElement | undefined) ??
      (e.target as HTMLElement | undefined);
    let isUpper = true;

    const customEvent = e as unknown as { isLowerHalf?: boolean; isUpperHalf?: boolean };
    if (el && typeof el.getBoundingClientRect === "function") {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) {
        const midY = rect.top + rect.height / 2;
        isUpper = e.clientY < midY;
      } else if (customEvent.isLowerHalf !== undefined) {
        isUpper = !customEvent.isLowerHalf;
      } else if (customEvent.isUpperHalf !== undefined) {
        isUpper = !!customEvent.isUpperHalf;
      } else if (typeof e.clientY === "number") {
        isUpper = e.clientY < 48;
      }
    } else if (customEvent.isLowerHalf !== undefined) {
      isUpper = !customEvent.isLowerHalf;
    } else if (customEvent.isUpperHalf !== undefined) {
      isUpper = !!customEvent.isUpperHalf;
    } else if (typeof e.clientY === "number") {
      isUpper = e.clientY < 48;
    }

    const targetIndex = isUpper ? hoverIndex : hoverIndex + 1;
    setDropIndicator({ section, targetIndex });
  };

  const handleDragLeave = (e: React.DragEvent, section: "departures" | "arrivals") => {
    const related = e.relatedTarget as Node | null;
    const current = e.currentTarget as HTMLElement | null;
    if (current && related && typeof current.contains === "function" && current.contains(related)) {
      return;
    }
    const currentIndicator =
      dropIndicatorProp !== undefined ? dropIndicatorProp : dragRef.current.dropIndicator;
    if (currentIndicator?.section === section) {
      setDropIndicator(null);
    }
  };

  const handleDragEnd = (_e?: React.DragEvent) => {
    setDraggedStrip(null);
    setDropIndicator(null);
  };

  const handleDrop = (e: React.DragEvent, section: "departures" | "arrivals") => {
    const currentDragged =
      draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
    if (!currentDragged || currentDragged.section !== section) {
      return;
    }
    e.preventDefault();

    const currentIndicator =
      dropIndicatorProp !== undefined ? dropIndicatorProp : dragRef.current.dropIndicator;
    if (!currentIndicator || currentIndicator.section !== section) {
      setDraggedStrip(null);
      setDropIndicator(null);
      return;
    }

    const sourceIndex = currentDragged.sourceIndex;
    const targetIndex = currentIndicator.targetIndex;

    if (section === "departures") {
      const currentList = [...orderedDepartures];
      if (sourceIndex >= 0 && sourceIndex < currentList.length) {
        const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        const [movedStrip] = currentList.splice(sourceIndex, 1);
        currentList.splice(insertIndex, 0, movedStrip);
        const newOrder = currentList.map((s) => s.id);
        dragRef.current.departureOrder = newOrder;
        if (departureOrderProp === undefined) {
          setInternalDepOrder(newOrder);
        }
        onReorderStrips?.("departures", currentList);
      }
    } else {
      const currentList = [...orderedArrivals];
      if (sourceIndex >= 0 && sourceIndex < currentList.length) {
        const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        const [movedStrip] = currentList.splice(sourceIndex, 1);
        currentList.splice(insertIndex, 0, movedStrip);
        const newOrder = currentList.map((s) => s.id);
        dragRef.current.arrivalOrder = newOrder;
        if (arrivalOrderProp === undefined) {
          setInternalArrOrder(newOrder);
        }
        onReorderStrips?.("arrivals", currentList);
      }
    }

    setDraggedStrip(null);
    setDropIndicator(null);
  };

  const renderStripList = (section: "departures" | "arrivals", strips: FlightStrip[]) => {
    if (strips.length === 0) {
      return (
        <div className="rack-empty" data-testid={`rack-empty-${section}`}>
          {section === "departures" ? "No departure strips" : "No arrival strips"}
        </div>
      );
    }

    const elements: React.ReactNode[] = [];
    const showIndicator = dropIndicator?.section === section;
    const targetIdx = dropIndicator?.targetIndex ?? -1;

    strips.forEach((strip, index) => {
      if (showIndicator && targetIdx === index) {
        elements.push(
          <div
            className="strip-drop-indicator"
            data-testid="strip-drop-indicator"
            key="drop-indicator"
          />,
        );
      }

      if (section === "departures") {
        const depStrip = strip as DepartureStripData;
        elements.push(
          <DepartureStrip
            key={depStrip.id}
            strip={depStrip}
            selected={isStripSelected(depStrip)}
            indented={indentedStripIds.has(depStrip.id)}
            isDragging={draggedStrip?.id === depStrip.id}
            onSelect={() => onSelectStrip?.(depStrip)}
            onToggleIndent={handleToggleIndent}
            onDragStart={(e) => handleDragStart(e, depStrip, "departures", index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, "departures", index)}
            onDrop={(e) => handleDrop(e, "departures")}
          />,
        );
      } else {
        const arrStrip = strip as ArrivalStripData;
        elements.push(
          <ArrivalStrip
            key={arrStrip.id}
            strip={arrStrip}
            selected={isStripSelected(arrStrip)}
            indented={indentedStripIds.has(arrStrip.id)}
            isDragging={draggedStrip?.id === arrStrip.id}
            onSelect={() => onSelectStrip?.(arrStrip)}
            onToggleIndent={handleToggleIndent}
            onDragStart={(e) => handleDragStart(e, arrStrip, "arrivals", index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, "arrivals", index)}
            onDrop={(e) => handleDrop(e, "arrivals")}
          />,
        );
      }
    });

    if (showIndicator && targetIdx >= strips.length) {
      elements.push(
        <div
          className="strip-drop-indicator"
          data-testid="strip-drop-indicator"
          key="drop-indicator"
        />,
      );
    }

    return elements;
  };

  const [internalLayout, setInternalLayout] = useSafeState<"horizontal" | "vertical">(
    layoutModeProp ?? defaultLayout ?? "horizontal",
  );
  const layoutMode = layoutModeProp ?? internalLayout;

  const setLayoutMode = (
    next:
      "horizontal" | "vertical" | ((prev: "horizontal" | "vertical") => "horizontal" | "vertical"),
  ) => {
    const resolved = typeof next === "function" ? next(layoutMode) : next;
    if (layoutModeProp === undefined) {
      setInternalLayout(resolved);
    }
    onLayoutModeChange?.(resolved);
  };

  const [internalDepCollapsed, setInternalDepCollapsed] = useSafeState<boolean>(
    departuresCollapsedProp ?? defaultDeparturesCollapsed ?? false,
  );
  const departuresCollapsed = departuresCollapsedProp ?? internalDepCollapsed;

  const setDeparturesCollapsed = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(departuresCollapsed) : next;
    if (departuresCollapsedProp === undefined) {
      setInternalDepCollapsed(resolved);
    }
    onDeparturesCollapsedChange?.(resolved);
  };

  const [internalArrCollapsed, setInternalArrCollapsed] = useSafeState<boolean>(
    arrivalsCollapsedProp ?? defaultArrivalsCollapsed ?? false,
  );
  const arrivalsCollapsed = arrivalsCollapsedProp ?? internalArrCollapsed;

  const setArrivalsCollapsed = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(arrivalsCollapsed) : next;
    if (arrivalsCollapsedProp === undefined) {
      setInternalArrCollapsed(resolved);
    }
    onArrivalsCollapsedChange?.(resolved);
  };

  const [internalIndentedStripIds, setInternalIndentedStripIds] = useSafeState<Set<string>>(() => {
    const initial = new Set<string>(defaultIndentedStripIds);
    for (const dep of departures) {
      if (dep.indented) {
        initial.add(dep.id);
      }
    }
    for (const arr of arrivals) {
      if (arr.indented) {
        initial.add(arr.id);
      }
    }
    return initial;
  });
  const indentedStripIds = indentedStripIdsProp ?? internalIndentedStripIds;

  const handleToggleIndent = (stripId: string) => {
    const isCurrentlyIndented = indentedStripIds.has(stripId);
    const nextIndented = !isCurrentlyIndented;
    if (indentedStripIdsProp === undefined) {
      setInternalIndentedStripIds((prev) => {
        const next = new Set(prev);
        if (nextIndented) {
          next.add(stripId);
        } else {
          next.delete(stripId);
        }
        return next;
      });
    }
    onToggleIndent?.(stripId, nextIndented);
  };

  const isStripSelected = (strip: FlightStrip): boolean => {
    if (!selectedStripId) {
      return false;
    }
    const normSelected = selectedStripId.trim().toUpperCase();
    const normId = strip.id ? strip.id.trim().toUpperCase() : "";
    const normAcid = strip.acid ? strip.acid.trim().toUpperCase() : "";
    return (
      selectedStripId === strip.id ||
      selectedStripId === strip.acid ||
      normSelected === normId ||
      normSelected === normAcid
    );
  };

  const depIndicator =
    layoutMode === "horizontal"
      ? departuresCollapsed
        ? "▶"
        : "◀"
      : departuresCollapsed
        ? "▼"
        : "▲";

  const arrIndicator =
    layoutMode === "horizontal" ? (arrivalsCollapsed ? "◀" : "▶") : arrivalsCollapsed ? "▼" : "▲";

  return (
    <div className={`strips-board ${className ?? ""}`.trim()} data-testid="strips-board">
      {/* Two-Column / Two-Row Rack Bay Container */}
      <div
        className={`bay-container ${layoutMode === "vertical" ? "bay-vertical" : "bay-horizontal"}`}
        data-testid="bay-container"
      >
        {/* Left / Top Rack Column: Departures */}
        <section
          className={`rack-column rack-departures ${departuresCollapsed ? "collapsed" : ""}`.trim()}
          data-testid="rack-departures"
          data-rack="departures"
          aria-label="Departures rack"
          onClick={() => {
            if (departuresCollapsed) {
              setDeparturesCollapsed(false);
            }
          }}
          onDragOver={(e) => {
            const current =
              draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
            if (current && current.section !== "departures") {
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "none";
              }
            }
          }}
        >
          <div
            className="rack-header"
            data-testid="rack-header-departures"
            onClick={() => {
              setDeparturesCollapsed((c) => !c);
            }}
          >
            <span className="rack-title">Departures</span>
            <div className="rack-header-actions" data-testid="rack-header-actions-departures">
              <button
                type="button"
                className="rack-collapse-btn"
                data-testid="collapse-departures-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeparturesCollapsed((c) => !c);
                }}
                title={departuresCollapsed ? "Expand departures rack" : "Collapse departures rack"}
                aria-label={
                  departuresCollapsed ? "Expand departures rack" : "Collapse departures rack"
                }
              >
                {depIndicator}
              </button>
            </div>
          </div>
          <div
            className="rack-strip-list"
            data-testid="rack-strip-list-departures"
            role="region"
            aria-label="Departures strip list"
            onDragOver={(e) => {
              const current =
                draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
              if (!current || current.section !== "departures") {
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = "none";
                }
                return;
              }
              if (e.target === e.currentTarget) {
                e.preventDefault();
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = "move";
                }
                const nextIndicator: DropIndicatorState = {
                  section: "departures",
                  targetIndex: orderedDepartures.length,
                };
                dragRef.current.dropIndicator = nextIndicator;
                setDropIndicator(nextIndicator);
              }
            }}
            onDragLeave={(e) => handleDragLeave(e, "departures")}
            onDrop={(e) => handleDrop(e, "departures")}
          >
            {renderStripList("departures", orderedDepartures)}
          </div>
        </section>

        {/* Right / Bottom Rack Column: Arrivals */}
        <section
          className={`rack-column rack-arrivals ${arrivalsCollapsed ? "collapsed" : ""}`.trim()}
          data-testid="rack-arrivals"
          data-rack="arrivals"
          aria-label="Arrivals rack"
          onClick={() => {
            if (arrivalsCollapsed) {
              setArrivalsCollapsed(false);
            }
          }}
          onDragOver={(e) => {
            const current =
              draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
            if (current && current.section !== "arrivals") {
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "none";
              }
            }
          }}
        >
          <div
            className="rack-header"
            data-testid="rack-header-arrivals"
            onClick={() => {
              setArrivalsCollapsed((c) => !c);
            }}
          >
            <span className="rack-title">Arrivals</span>
            <div className="rack-header-actions" data-testid="rack-header-actions-arrivals">
              <button
                type="button"
                className="rack-collapse-btn"
                data-testid="collapse-arrivals-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setArrivalsCollapsed((c) => !c);
                }}
                title={arrivalsCollapsed ? "Expand arrivals rack" : "Collapse arrivals rack"}
                aria-label={arrivalsCollapsed ? "Expand arrivals rack" : "Collapse arrivals rack"}
              >
                {arrIndicator}
              </button>
            </div>
          </div>
          <div
            className="rack-strip-list"
            data-testid="rack-strip-list-arrivals"
            role="region"
            aria-label="Arrivals strip list"
            onDragOver={(e) => {
              const current =
                draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
              if (!current || current.section !== "arrivals") {
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = "none";
                }
                return;
              }
              if (e.target === e.currentTarget) {
                e.preventDefault();
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = "move";
                }
                const nextIndicator: DropIndicatorState = {
                  section: "arrivals",
                  targetIndex: orderedArrivals.length,
                };
                dragRef.current.dropIndicator = nextIndicator;
                setDropIndicator(nextIndicator);
              }
            }}
            onDragLeave={(e) => handleDragLeave(e, "arrivals")}
            onDrop={(e) => handleDrop(e, "arrivals")}
          >
            {renderStripList("arrivals", orderedArrivals)}
          </div>
        </section>
      </div>

      {/* Strips Board Footer with Minimal Layout Toggle Button */}
      <footer className="strips-board-footer" data-testid="strips-board-footer">
        <button
          type="button"
          className="strips-layout-toggle-btn"
          data-testid="strips-layout-toggle-btn"
          onClick={() => setLayoutMode((m) => (m === "horizontal" ? "vertical" : "horizontal"))}
          title={
            layoutMode === "horizontal"
              ? "Switch to stacked vertical layout"
              : "Switch to side-by-side columns layout"
          }
        >
          {layoutMode === "horizontal" ? "Stacked" : "Columns"}
        </button>
      </footer>
    </div>
  );
}
