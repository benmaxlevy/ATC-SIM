/**
 * Analog: CRC STARS track display state (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: per-track history buffer, full/limited datablock mode, and
 * display-only IDENT flash live here, keyed by aircraft id — never on Aircraft
 * kinematics. Not NAS STARS.
 */

import type { Aircraft, World } from "@core";
import type { DatablockMode } from "./datablock";
import { createHistoryBuf, maybeSampleHistory, type HistoryBuf } from "./history";

/** Display IDENT stroke pulse (~2 s sim). Aircraft flag may last longer (phase 1). */
export const IDENT_DISPLAY_FLASH_MS = 2000;

export interface TrackDisplay {
  history: HistoryBuf;
  /** Sim time when the yellow IDENT stroke ends; 0 = inactive. */
  identUntilSimMs: number;
  /** Last seen `Aircraft.identUntilSimMs` so a new IDENT retriggers the pulse. */
  lastAircraftIdentDeadlineMs: number;
  /** Full datablock by default; scope-focus `T` toggles. */
  datablockMode: DatablockMode;
}

export function createTrackDisplay(): TrackDisplay {
  return {
    history: createHistoryBuf(),
    identUntilSimMs: 0,
    lastAircraftIdentDeadlineMs: 0,
    datablockMode: "full",
  };
}

function ensureTrackDisplay(tracks: Map<string, TrackDisplay>, id: string): TrackDisplay {
  let td = tracks.get(id);
  if (!td) {
    td = createTrackDisplay();
    tracks.set(id, td);
  }
  return td;
}

function flipDatablockMode(mode: DatablockMode): DatablockMode {
  return mode === "full" ? "limited" : "full";
}

/**
 * Scope-focus `T`: selected track full ↔ limited; no selection → all tracks.
 * Display state only — never a Command.
 */
export function toggleDatablockModeForSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): void {
  const selected = world.selectedAircraftId;
  if (selected && world.aircraft.some((ac) => ac.id === selected)) {
    const td = ensureTrackDisplay(tracks, selected);
    td.datablockMode = flipDatablockMode(td.datablockMode);
    return;
  }
  for (const ac of world.aircraft) {
    const td = ensureTrackDisplay(tracks, ac.id);
    td.datablockMode = flipDatablockMode(td.datablockMode);
  }
}

export function isIdentFlashing(td: TrackDisplay, simTimeMs: number): boolean {
  return td.identUntilSimMs > simTimeMs;
}

/**
 * When the pilot agent accepts IDENT, `Aircraft.identUntilSimMs` jumps forward.
 * Start a ~2 s display flash. Do not re-validate and do not emit a readback.
 */
export function noteIdentAccepted(td: TrackDisplay, ac: Aircraft, simTimeMs: number): void {
  if (ac.identUntilSimMs > td.lastAircraftIdentDeadlineMs) {
    td.lastAircraftIdentDeadlineMs = ac.identUntilSimMs;
    td.identUntilSimMs = simTimeMs + IDENT_DISPLAY_FLASH_MS;
  }
}

/**
 * Display sampler: drop despawned tracks, sample history, arm IDENT flash.
 * Call from the render path, never from `stepWorld`.
 */
export function syncTrackDisplays(tracks: Map<string, TrackDisplay>, world: World): void {
  const living = new Set(world.aircraft.map((ac) => ac.id));
  for (const id of [...tracks.keys()]) {
    if (!living.has(id)) {
      tracks.delete(id);
    }
  }
  for (const ac of world.aircraft) {
    let td = tracks.get(ac.id);
    if (!td) {
      td = createTrackDisplay();
      tracks.set(ac.id, td);
    }
    maybeSampleHistory(td.history, world.simTimeMs, ac.xNm, ac.yNm);
    noteIdentAccepted(td, ac, world.simTimeMs);
  }
}
