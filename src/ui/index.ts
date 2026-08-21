/**
 * Public API for `@ui`.
 *
 * Legal now: Scope shell (DCB cell grid on the PPI, F1 help overlay with T00-01 disclaimer,
 * first-run disclaimer, on-PPI flight-strip list, command strip, pause / 1× / 2× corner
 * readout). Canvas click selects a track and focuses the PPI (scope keys).
 * DCB clicks call the same `src/scope` functions as the keyboard and
 * never emit Command IR. List click selects the same track and focuses the PPI. Enter runs
 * `submitCommand` → `handleRadioText` and shows the template readback. Text
 * submit bypasses SpeechPort (`Command.source` is `"text"`). Selection is a
 * scope action and does not emit a readback. Session controls (`setPaused` /
 * `setSimRate`) do not touch intent.
 *
 * Later: settings. The sim tick must never wait on React render.
 *
 * Import rule: `@ui` may import all other `src/*` packages. `@pilot` must not
 * import `@ui`.
 */
export { Shell, Shell as App } from "./shell";
export { ScopeHelpOverlay } from "./ScopeHelpOverlay";
export {
  DCB_FONT_PX,
  DCB_HEIGHT_PX,
  DCB_LITE_FONT_PX,
  DCB_LITE_HEIGHT_PX,
  DisplayControlBar,
  syncDisplayControlBar,
} from "./DisplayControlBar";
export { ScopeCanvas } from "./ScopeCanvas";
export { FlightStrips, focusPpi, syncStripCallsignColors } from "./FlightStrips";
export {
  STRIP_BAY_EMPTY,
  STRIP_BAY_HEADING,
  selectTrackFromStrip,
  stripsFromWorld,
} from "./flightStripModel";
export {
  DISCLAIMER_COPY,
  DISCLAIMER_DISMISSED_KEY,
  dismissDisclaimer,
  isDisclaimerDismissed,
} from "./disclaimer-copy";
export { echoCommandLine, submitCommandLine } from "./echo-command-line";
export { submitCommand } from "./submitCommand";
export type { PilotResult } from "./submitCommand";
export {
  PLAY_HINT,
  SIM_HUD_ID,
  applySimControlKey,
  formatSimHud,
  formatSimTimeMmSs,
  setPaused,
  setSimRate,
} from "./simControls";
export type { SimControlKey } from "./simControls";
export { FpsDebug } from "./FpsDebug";
export { FPS_DEBUG_ID, formatFpsDebug, isFpsDebugEnabled } from "./fpsHud";
