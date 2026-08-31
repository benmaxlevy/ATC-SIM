/**
 * Session controls (pause / sim rate 1|2). Not radio commands — no readback,
 * no intent writes. Trainer delta, not a CRC/STARS analog (T01-12).
 *
 * Analog: CRC/vNAS STARS has no pause / sim-rate strip on the TCW (R07).
 * Trainer delta: small map-green corner readout for pause / 1× / 2× / clock.
 * Not a game HUD. Not NAS STARS.
 */

import { useEffect } from "react";
import type { World } from "@core";

export const SIM_HUD_ID = "sim-hud";

/** Playable-slice one-liner (T01-14). Not a tutorial system. */
export const PLAY_HINT = "type DAL123 H270 or click then H270";

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

export interface SimControlsProps {
  world: World;
}

function isCommandLineTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest(".command-line") !== null;
}

/**
 * Accessible source of truth for pause / 1× / 2×. Keys are accelerators with
 * command-line focus rules so digits stay available for callsigns (`H270`).
 */
export function SimControls({ world }: SimControlsProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.repeat && (event.key === " " || event.key === "Pause")) {
        return;
      }
      if (event.key === " " && event.target instanceof HTMLButtonElement) {
        return;
      }
      const consumed = applySimControlKey(world, {
        key: event.key,
        commandLineFocused: isCommandLineTarget(event.target),
      });
      if (consumed) {
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [world]);

  return (
    <div className="sim-controls" aria-label="Sim rate">
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setPaused(world, !world.paused)}
      >
        Pause
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setSimRate(world, 1)}
      >
        1×
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setSimRate(world, 2)}
      >
        2×
      </button>
      <span id={SIM_HUD_ID} className="sim-status">
        {formatSimHud(world)}
      </span>
    </div>
  );
}
