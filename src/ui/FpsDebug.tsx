import { FPS_DEBUG_ID } from "./fpsHud";

/**
 * Tiny corner readout for `?debug=fps`. rAF writes `N TRACKS  FPS nn`.
 * Not a DCB. Default UI omits this node entirely.
 */
export function FpsDebug() {
  return <div id={FPS_DEBUG_ID} className="fps-debug" aria-label="FPS debug" />;
}
