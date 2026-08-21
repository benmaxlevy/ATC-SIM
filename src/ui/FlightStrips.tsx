/**
 * Analog: FAA PCG flight progress strip (R02); vice flight-strip window (R08).
 * Trainer delta: trainer bay of assigned H/A/S — not FDIO/vStrips/ERAM.
 * Not NAS STARS.
 *
 * Strip clicks select a track (shared World.selectedAircraftId) and focus the
 * PPI. They never construct a Command, call the parser, or write intent.
 */

import type { World } from "@core";
import { PpiPlaceholderId } from "@scope";
import {
  STRIP_BAY_EMPTY,
  STRIP_BAY_HEADING,
  selectTrackFromStrip,
  stripsFromWorld,
} from "./flightStripModel";

export interface FlightStripsProps {
  world: World;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectionChange: () => void;
}

/** After a strip click, scope focus so the next L-chord is a leader, not radio. */
export function focusPpi(): void {
  const el = globalThis.document?.getElementById(PpiPlaceholderId);
  if (el instanceof HTMLElement) {
    el.focus();
  }
}

export function FlightStrips({
  world,
  collapsed,
  onToggleCollapsed,
  onSelectionChange,
}: FlightStripsProps) {
  const strips = stripsFromWorld(world);

  return (
    <aside
      className={collapsed ? "strip-bay strip-bay-is-collapsed" : "strip-bay"}
      aria-label={STRIP_BAY_HEADING}
    >
      <header className="strip-bay-header">
        {collapsed ? null : <h2 className="strip-bay-title">{STRIP_BAY_HEADING}</h2>}
        <button
          type="button"
          className="strip-bay-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand flight strips" : "Collapse flight strips"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleCollapsed}
        >
          [ STRIPS ]
        </button>
      </header>
      {collapsed ? null : (
        <div className="strip-bay-list">
          {strips.length === 0 ? (
            <p className="strip-bay-empty">{STRIP_BAY_EMPTY}</p>
          ) : (
            strips.map((strip) => (
              <button
                key={strip.aircraftId}
                type="button"
                className={strip.selected ? "flight-strip flight-strip-selected" : "flight-strip"}
                aria-pressed={strip.selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  selectTrackFromStrip(world, strip.aircraftId);
                  onSelectionChange();
                  focusPpi();
                }}
              >
                <span className="flight-strip-callsign">{strip.callsign}</span>
                <span className="flight-strip-fields">
                  {`${strip.headingField}  ${strip.altitudeField}  ${strip.speedField}`}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
