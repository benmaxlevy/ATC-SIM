/**
 * Analog: CRC STARS flight-plan / SSA-adjacent list on the PPI (R07);
 * FAA PCG flight progress strip (R02) / 7110.65 ch. 2 §3 strip posting;
 * vice (R08) flight-strip window.
 * Trainer delta: on-PPI list of assigned H/A/S — not a labeled right dock,
 * not FDIO/vStrips/ERAM. Callsign tint follows T02-08 ownership color
 * (unowned green FDB / owned white FDB). Click selects (T01-11). Altitude filter
 * does not remove rows (T02-11). Never a Command. Not NAS STARS.
 *
 * List clicks select a track (shared World.selectedAircraftId) and focus the
 * PPI. pointer-events stay on rows so empty PPI clicks still deselect.
 * Strips are a view of World intent. They never emit Command IR.
 */

import { normalizeHeading, setSelectedAircraft, type Aircraft, type World } from "@core";
import { applyBrite, PALETTE, PpiPlaceholderId, trackPaintColor, type TrackDisplay } from "@scope";

/** Window heading — glossary **flight strip** / **strip bay**. */
export const STRIP_BAY_HEADING = "Flight strips";

export const STRIP_BAY_EMPTY = "Strip bay empty";

export interface FlightStripView {
  aircraftId: string;
  callsign: string;
  /** `H270` or `H---` when assigned heading is missing/non-finite. */
  headingField: string;
  /** Assigned altitude in hundreds, e.g. `A030` — not Mode C. */
  altitudeField: string;
  /** Assigned speed, e.g. `S210` — not ground speed. */
  speedField: string;
  selected: boolean;
}

/**
 * Callsign lexicographic (ASCII code units). Sort key is callsign only so
 * moving targets do not reshuffle the bay every frame.
 */
export function compareCallsigns(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function sortStripsByCallsign<T extends { callsign: string }>(items: readonly T[]): T[] {
  return items.slice().sort((left, right) => compareCallsigns(left.callsign, right.callsign));
}

export function formatAssignedHeading(headingDeg: number | null | undefined): string {
  if (headingDeg == null || !Number.isFinite(headingDeg)) {
    return "H---";
  }
  const deg = normalizeHeading(Math.round(headingDeg));
  return `H${String(deg).padStart(3, "0")}`;
}

/** Hundreds of feet, zero-padded to 3 — same contract as datablocks (`A030`). */
export function formatAssignedAltitudeHundreds(altitudeFt: number): string {
  if (!Number.isFinite(altitudeFt)) {
    return "A---";
  }
  const hundreds = Math.max(0, Math.round(altitudeFt / 100));
  return `A${String(hundreds).padStart(3, "0")}`;
}

export function formatAssignedSpeed(speedKt: number): string {
  if (!Number.isFinite(speedKt)) {
    return "S---";
  }
  const kt = Math.max(0, Math.round(speedKt));
  return `S${String(kt).padStart(3, "0")}`;
}

function stripFromAircraft(ac: Aircraft, selectedAircraftId: string | null): FlightStripView {
  return {
    aircraftId: ac.id,
    callsign: ac.callsign,
    headingField: formatAssignedHeading(ac.intent.assignedHeadingDeg),
    altitudeField: formatAssignedAltitudeHundreds(ac.intent.assignedAltitudeFt),
    speedField: formatAssignedSpeed(ac.intent.assignedSpeedKt),
    selected: ac.id === selectedAircraftId,
  };
}

/**
 * One strip per aircraft, top-to-bottom by callsign.
 * Altitude filter (when present) must not hide strips — this list ignores Mode C.
 * Reads intent at call time; do not copy into long-lived strip-local state.
 */
export function stripsFromWorld(world: World): FlightStripView[] {
  const sorted = sortStripsByCallsign(world.aircraft);
  return sorted.map((ac) => stripFromAircraft(ac, world.selectedAircraftId));
}

/**
 * Shared selection id with the PPI. Scope action only: no parser, no readback,
 * no intent write.
 */
export function selectTrackFromStrip(world: World, aircraftId: string): void {
  setSelectedAircraft(world, aircraftId);
}

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
