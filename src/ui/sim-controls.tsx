/**
 * Analog: CRC/vNAS STARS has no pause / sim-rate strip on the TCW (R07).
 * Trainer delta: small map-green corner readout for pause / 1× / 2× / clock.
 * Not a game HUD. Not NAS STARS.
 */

import { useEffect } from "react";
import type { World } from "@core";
import { SIM_HUD_ID, applySimControlKey, formatSimHud, setPaused, setSimRate } from "./simControls";

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
