/**
 * Debug-only FPS HUD (`?debug=fps`). Default UI stays clean.
 * Bench chrome says TRACKS, not planes/sprites (R12).
 */

export const FPS_DEBUG_ID = "fps-debug";

export function isFpsDebugEnabled(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("debug") === "fps";
}

/** `30 TRACKS  FPS 59` — track count, never planes/sprites. */
export function formatFpsDebug(trackCount: number, fps: number): string {
  const shown = Number.isFinite(fps) ? Math.round(fps) : 0;
  return `${trackCount} TRACKS  FPS ${shown}`;
}

/**
 * Tiny corner readout for `?debug=fps`. rAF writes `N TRACKS  FPS nn`.
 * Not a DCB. Default UI omits this node entirely.
 */
export function FpsDebug() {
  return <div id={FPS_DEBUG_ID} className="fps-debug" aria-label="FPS debug" />;
}
