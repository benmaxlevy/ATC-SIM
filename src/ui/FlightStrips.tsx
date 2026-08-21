/**
 * Analog: FAA PCG flight progress strip (R02); vice flight-strip window (R08).
 * Trainer delta: trainer bay of assigned H/A/S — not FDIO/vStrips/ERAM.
 * Callsign tint follows T02-08 ownership color (unowned white / owned green).
 * Not NAS STARS.
 *
 * Strip clicks select a track (shared World.selectedAircraftId) and focus the
 * PPI. They never construct a Command, call the parser, or write intent.
 */

import type { World } from "@core";
import { PpiPlaceholderId, trackPaintColor, type TrackDisplay } from "@scope";
import {
  STRIP_BAY_EMPTY,
  STRIP_BAY_HEADING,
  selectTrackFromStrip,
  stripsFromWorld,
} from "./flightStripModel";

export interface FlightStripsProps {
  world: World;
  tracks: Map<string, TrackDisplay>;
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

/**
 * Keep callsign tint in sync with F3/F4 when React has not re-rendered
 * (PPI paints from rAF). Display telemetry only.
 */
export function syncStripCallsignColors(tracks: Map<string, TrackDisplay>): void {
  const doc = globalThis.document;
  if (!doc) {
    return;
  }
  const nodes = doc.querySelectorAll<HTMLElement>("[data-strip-aircraft-id]");
  for (const el of nodes) {
    const id = el.dataset.stripAircraftId;
    if (!id) {
      continue;
    }
    el.style.color = trackPaintColor(tracks.get(id)?.ownership ?? "unowned");
  }
}

export function FlightStrips({
  world,
  tracks,
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
                <span
                  className="flight-strip-callsign"
                  data-strip-aircraft-id={strip.aircraftId}
                  style={{
                    color: trackPaintColor(tracks.get(strip.aircraftId)?.ownership ?? "unowned"),
                  }}
                >
                  {strip.callsign}
                </span>
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
