/**
 * Analog: CRC STARS track display state (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: per-track history buffer, full/limited datablock mode,
 * L1–L9 **leader** direction (no length menu), ownership color stub (T02-08
 * F3/F4), trainer **scratchpad** (0–4 A–Z0–9, not NAS FP), and display-only
 * IDENT flash live here, keyed by aircraft id — never on Aircraft kinematics
 * or intent. Not NAS STARS.
 */

import type { Aircraft, World } from "@core";
import { sanitizeScratchpad, type DatablockMode } from "./datablock";
import { createHistoryBuf, maybeSampleHistory, type HistoryBuf } from "./history";
import { DEFAULT_LEADER_DIR, type LeaderDir } from "./leader";
import { applyDropTrack, applyInitiateTrack, NO_SEL_HINT, type TrackOwnership } from "./ownership";

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
  /** Numpad compass L1–L9. Default L8 (north). */
  leaderDir: LeaderDir;
  /** Spawn unowned (white). F3 → owned (green). F4 → unowned. Color only. */
  ownership: TrackOwnership;
  /**
   * Trainer scratchpad on the full datablock (0–4 A–Z0–9). Default empty.
   * Display state only — never Aircraft.intent / kinematics.
   */
  scratchpad: string;
}

export function createTrackDisplay(): TrackDisplay {
  return {
    history: createHistoryBuf(),
    identUntilSimMs: 0,
    lastAircraftIdentDeadlineMs: 0,
    datablockMode: "full",
    leaderDir: DEFAULT_LEADER_DIR,
    ownership: "unowned",
    scratchpad: "",
  };
}

/**
 * Set the trainer scratchpad for a track id. Sanitizes to 0–4 A–Z0–9.
 * Does not create a Command, readback, or intent change.
 */
export function setScratchpad(tracks: Map<string, TrackDisplay>, id: string, raw: string): void {
  const td = ensureTrackDisplay(tracks, id);
  td.scratchpad = sanitizeScratchpad(raw);
}

function ensureTrackDisplay(tracks: Map<string, TrackDisplay>, id: string): TrackDisplay {
  let td = tracks.get(id);
  if (!td) {
    td = createTrackDisplay();
    tracks.set(id, td);
  }
  return td;
}

function selectedTrackId(world: World): string | null {
  const id = world.selectedAircraftId;
  if (!id || !world.aircraft.some((ac) => ac.id === id)) {
    return null;
  }
  return id;
}

/**
 * F3 always-on: selected unowned → owned; already owned stays owned.
 * No selection: no-op. Display state only — never a Command.
 */
export function applyInitiateTrackToSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): { applied: boolean; hint: string | null } {
  const id = selectedTrackId(world);
  if (!id) {
    return { applied: false, hint: NO_SEL_HINT };
  }
  const td = ensureTrackDisplay(tracks, id);
  td.ownership = applyInitiateTrack(td.ownership);
  return { applied: true, hint: null };
}

/**
 * F4 always-on: selected owned → unowned. Unowned stays unowned.
 * Trainer sugar, not CRC terminate. Display state only — never a Command.
 */
export function applyDropTrackToSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): { applied: boolean; hint: string | null } {
  const id = selectedTrackId(world);
  if (!id) {
    return { applied: false, hint: NO_SEL_HINT };
  }
  const td = ensureTrackDisplay(tracks, id);
  td.ownership = applyDropTrack(td.ownership);
  return { applied: true, hint: null };
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

/**
 * Scope-focus `L` then 1–9: selected track leader direction; no selection → all.
 * Display state only — never a Command.
 */
export function setLeaderDirForSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
  dir: LeaderDir,
): void {
  const selected = world.selectedAircraftId;
  if (selected && world.aircraft.some((ac) => ac.id === selected)) {
    const td = ensureTrackDisplay(tracks, selected);
    td.leaderDir = dir;
    return;
  }
  for (const ac of world.aircraft) {
    const td = ensureTrackDisplay(tracks, ac.id);
    td.leaderDir = dir;
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
