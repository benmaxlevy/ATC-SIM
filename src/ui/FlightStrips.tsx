/**
 * Analog: CRC STARS flight-plan / SSA-adjacent list on the PPI (R07);
 * FAA PCG flight progress strip (R02); vice flight-strip window (R08).
 * Trainer delta: on-PPI list of assigned H/A/S — not a labeled right dock,
 * not FDIO/vStrips/ERAM. Callsign tint follows T02-08 ownership color
 * (unowned green FDB / owned white FDB). Click selects (T01-11). Altitude filter
 * does not remove rows (T02-11). Never a Command. Not NAS STARS.
 *
 * List clicks select a track (shared World.selectedAircraftId) and focus the
 * PPI. pointer-events stay on rows so empty PPI clicks still deselect.
 */

import type { World } from "@core";
import { applyBrite, PALETTE, PpiPlaceholderId, trackPaintColor, type TrackDisplay } from "@scope";
import {
  STRIP_BAY_EMPTY,
  STRIP_BAY_HEADING,
  selectTrackFromStrip,
  stripsFromWorld,
} from "./flightStripModel";

export interface FlightStripsProps {
  world: World;
  tracks: Map<string, TrackDisplay>;
  onSelectionChange: () => void;
  /** CHAR SIZE LISTS. Default CSS 11 px if omitted. */
  listFontPx?: number;
  /** BRITE LST 0–100. Default 100. */
  listBrite?: number;
}

/** After a list click, scope focus so the next L-chord is a leader, not radio. */
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
  onSelectionChange,
  listFontPx,
  listBrite = 100,
}: FlightStripsProps) {
  const strips = stripsFromWorld(world);
  const listColor = applyBrite(PALETTE.ssa, listBrite);

  return (
    <div
      className="strip-list"
      aria-label={STRIP_BAY_HEADING}
      style={{
        fontSize: listFontPx,
        color: listColor,
      }}
    >
      <div className="strip-list-rows">
        {strips.length === 0 ? (
          <p className="strip-list-empty">{STRIP_BAY_EMPTY}</p>
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
                  color: applyBrite(
                    trackPaintColor(tracks.get(strip.aircraftId)?.ownership ?? "unowned"),
                    listBrite,
                  ),
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
    </div>
  );
}
