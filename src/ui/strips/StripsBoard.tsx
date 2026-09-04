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
}

/**
 * StripsBoard: Terminal flight progress strips board with dark controller cab backdrop,
 * facility title header, and two independent vertically scrollable rack columns
 * (Departures on the left, Arrivals on the right).
 */
export function StripsBoard({
  departures = [],
  arrivals = [],
  facilityTitle = DEFAULT_FACILITY_TITLE,
  onSelectStrip,
  selectedStripId,
  className,
}: StripsBoardProps) {
  const departuresList = departures;
  const arrivalsList = arrivals;

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

  return (
    <div className={`strips-board ${className ?? ""}`.trim()} data-testid="strips-board">
      {/* Facility Header Bar */}
      <header className="board-header" data-testid="board-header">
        <h1 className="board-title" data-testid="board-title">
          {facilityTitle}
        </h1>
        <div className="board-header-meta" data-testid="board-header-meta">
          <span className="board-meta-item" data-testid="board-meta-departures">
            DEP: {departuresList.length}
          </span>
          <span className="board-meta-item" data-testid="board-meta-arrivals">
            ARR: {arrivalsList.length}
          </span>
        </div>
      </header>

      {/* Two-Column Rack Bay Container */}
      <div className="bay-container" data-testid="bay-container">
        {/* Left Rack Column: Departures */}
        <section
          className="rack-column rack-departures"
          data-testid="rack-departures"
          data-rack="departures"
          aria-label="Departures rack"
        >
          <div className="rack-header" data-testid="rack-header-departures">
            <span className="rack-title">Departures</span>
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
                  onSelect={() => onSelectStrip?.(strip)}
                />
              ))
            )}
          </div>
        </section>

        {/* Right Rack Column: Arrivals */}
        <section
          className="rack-column rack-arrivals"
          data-testid="rack-arrivals"
          data-rack="arrivals"
          aria-label="Arrivals rack"
        >
          <div className="rack-header" data-testid="rack-header-arrivals">
            <span className="rack-title">Arrivals</span>
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
                  onSelect={() => onSelectStrip?.(strip)}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
