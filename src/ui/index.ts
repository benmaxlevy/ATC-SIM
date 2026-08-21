/**
 * Public API for `@ui`.
 *
 * Legal now: Scope shell (DCB cell grid on the PPI, F1 help overlay with T00-01 disclaimer,
 * first-run disclaimer, on-PPI flight-strip list, command strip, pause / 1× / 2× corner
 * readout). Canvas click selects a track and focuses the PPI (scope keys).
 * DCB clicks call the same `src/scope` functions as the keyboard and
 * never emit Command IR. List click selects the same track and focuses the PPI. Enter awaits
 * `submitCommand` → `handleRadioText` / `parseCommand` and shows the template readback. Text
 * submit bypasses SpeechPort (`Command.source` is `"text"`). Selection is a
 * scope action and does not emit a readback. Session controls (`setPaused` /
 * `setSimRate`) do not touch intent.
 *
 * Speech settings (T03-10) switch the SpeechPort backend without a reload.
 * Voice latency overlay (T03-09) is HTML, not PPI canvas; T03-10 may persist show/hide.
 * The sim tick must never wait on React render.
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
export { displayCommandLineStatus, formatVoiceStatus } from "./voice-status";
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
export { LatencyOverlay } from "./LatencyOverlay";
export {
  LATENCY_OVERLAY_DEFAULT_VISIBLE,
  LATENCY_OVERLAY_ID,
  formatLatencyMs,
  formatLatencyOverlay,
  httpP50Band,
  latencyOverlayClassName,
} from "./latency-overlay";
export {
  DEFAULT_BACKEND_HELP,
  DEFAULT_HEALTH_URL,
  HTTP_URLS_MISSING,
  PATH_C_HELP,
  PATH_C_LABEL,
  PATH_C_UNAVAILABLE_HELP,
  PTT_BIND_HELP,
  PTT_BIND_OPTIONS,
  SPEECH_PREFS_KEY,
  SPEECH_SETTINGS_WAIT,
  VOICE_DISABLED_HINT,
  WEB_SPEECH_VENDOR_WARNING,
  SpeechSettingsPanel,
  createSpeechSettingsController,
  defaultSpeechPrefs,
  healthUrlFromStt,
  loadAndResolveSpeechBoot,
  loadSpeechPrefs,
  saveSpeechPrefs,
} from "./settings-speech";
export type {
  SpeechBoot,
  SpeechPrefs,
  SpeechSettingsController,
  SpeechSettingsHost,
  SpeechSettingsPanelProps,
} from "./settings-speech";
