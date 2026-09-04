import { ArrivalStrip } from "./ArrivalStrip";
import { DepartureStrip } from "./DepartureStrip";
import { mockArrivals, mockDepartures } from "./mockFixture";
import type { ArrivalStripData, DepartureStripData, FlightStrip } from "./types";
import "./strips.css";

export const DEFAULT_FACILITY_TITLE = "KATL_TWR — Flight Progress Strips";

export interface StripsBoardProps {
  /** Array of departure flight strips (defaults to mockDepartures). */
  departures?: DepartureStripData[];
  /** Array of arrival flight strips (defaults to mockArrivals). */
  arrivals?: ArrivalStripData[];
  /** Facility header title (defaults to KATL_TWR — Flight Progress Strips). */
  facilityTitle?: string;
  /** Selection callback fired when a strip is clicked or activated. */
  onSelectStrip?: (strip: FlightStrip) => void;
  /** Optional ID of currently selected strip. */
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
  departures,
  arrivals,
  facilityTitle = DEFAULT_FACILITY_TITLE,
  onSelectStrip,
  selectedStripId,
  className,
}: StripsBoardProps) {
  const departuresList = departures ?? mockDepartures;
  const arrivalsList = arrivals ?? mockArrivals;

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
            <span
              className="rack-badge rack-count"
              data-testid="departures-count"
              aria-label={`${departuresList.length} departures`}
            >
              {departuresList.length}
            </span>
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
                  selected={selectedStripId === strip.id}
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
            <span
              className="rack-badge rack-count"
              data-testid="arrivals-count"
              aria-label={`${arrivalsList.length} arrivals`}
            >
              {arrivalsList.length}
            </span>
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
                  selected={selectedStripId === strip.id}
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
