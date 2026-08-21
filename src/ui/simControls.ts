import type { World } from "@core";

/**
 * Session controls (pause / sim rate 1|2). Not radio commands — no readback,
 * no intent writes. Trainer delta, not a CRC/STARS analog (T01-12).
 */

export const SIM_HUD_ID = "sim-hud";

/** Pause or resume kinematics and sim time. Does not touch accumulator or intent. */
export function setPaused(world: World, paused: boolean): void {
  world.paused = paused;
}

/** Sim rate is 1 or 2 only. Does not unpause and does not touch intent. */
export function setSimRate(world: World, rate: 1 | 2): void {
  world.simRate = rate;
}

export function formatSimTimeMmSs(simTimeMs: number): string {
  const totalSec = Math.floor(Math.max(0, simTimeMs) / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** `PAUSE` or `1x` / `2x` plus sim time mm:ss. */
export function formatSimHud(world: World): string {
  const clock = formatSimTimeMmSs(world.simTimeMs);
  if (world.paused) {
    return `PAUSE ${clock}`;
  }
  return `${world.simRate}x ${clock}`;
}

export interface SimControlKey {
  key: string;
  /** True when the command line input (or its form) has focus. */
  commandLineFocused: boolean;
}

/**
 * Apply a key as a session control. Digits and Space are ignored while the
 * command line is focused so `DAL123` / `H270` can be typed. Pause/Break always
 * toggles pause. Returns true when the caller should preventDefault.
 */
export function applySimControlKey(world: World, event: SimControlKey): boolean {
  if (event.key === "Pause") {
    setPaused(world, !world.paused);
    return true;
  }
  if (event.commandLineFocused) {
    return false;
  }
  if (event.key === " " || event.key === "Spacebar") {
    setPaused(world, !world.paused);
    return true;
  }
  if (event.key === "1") {
    setSimRate(world, 1);
    return true;
  }
  if (event.key === "2") {
    setSimRate(world, 2);
    return true;
  }
  return false;
}
