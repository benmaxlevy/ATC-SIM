import * as React from "react";
import { useState } from "react";
import type { World } from "@core";
import { setSelectedAircraft } from "@core";
import { ArrivalStrip } from "./ArrivalStrip";
import { DepartureStrip } from "./DepartureStrip";
import type { ArrivalStripData, DepartureStripData, FlightStrip } from "./types";
import "./strips.css";

export const DEFAULT_FACILITY_TITLE = "ATL — Flight Progress Strips";

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
  onLayoutModeChange,
  onDeparturesCollapsedChange,
  onArrivalsCollapsedChange,
  onToggleIndent,
}: StripsBoardProps) {
  const departuresList = departures;
  const arrivalsList = arrivals;

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

  const [internalIndentedStripIds, setInternalIndentedStripIds] = useSafeState<Set<string>>(
    () => {
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
    },
  );
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
          >
            {departuresList.length === 0 ? (
              <div className="rack-empty" data-testid="rack-empty-departures">
                No departure strips
              </div>
            ) : (
              departuresList.map((strip) => (
                <DepartureStrip
                  key={strip.id}
                  strip={strip}
                  selected={isStripSelected(strip)}
                  indented={indentedStripIds.has(strip.id)}
                  onSelect={() => onSelectStrip?.(strip)}
                  onToggleIndent={handleToggleIndent}
                />
              ))
            )}
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
          >
            {arrivalsList.length === 0 ? (
              <div className="rack-empty" data-testid="rack-empty-arrivals">
                No arrival strips
              </div>
            ) : (
              arrivalsList.map((strip) => (
                <ArrivalStrip
                  key={strip.id}
                  strip={strip}
                  selected={isStripSelected(strip)}
                  indented={indentedStripIds.has(strip.id)}
                  onSelect={() => onSelectStrip?.(strip)}
                  onToggleIndent={handleToggleIndent}
                />
              ))
            )}
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
