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
 * Speech settings persist PTT, TTS voice, radio FX, and Path C. Voice is
 * HttpSpeechPort against this repo’s speech-api (typed commands still work if
 * the API URLs are missing). The sim tick must never wait on React render.
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
export {
  FlightStrips,
  STRIP_BAY_EMPTY,
  STRIP_BAY_HEADING,
  compareCallsigns,
  focusPpi,
  formatAssignedAltitudeHundreds,
  formatAssignedHeading,
  formatAssignedSpeed,
  selectTrackFromStrip,
  sortStripsByCallsign,
  stripsFromWorld,
  syncStripCallsignColors,
} from "./FlightStrips";
export type { FlightStripView, FlightStripsProps } from "./FlightStrips";
export {
  DISCLAIMER_COPY,
  DISCLAIMER_DISMISSED_KEY,
  Disclaimer,
  dismissDisclaimer,
  isDisclaimerDismissed,
} from "./disclaimer";
export {
  COMMAND_LINE_INPUT_ID,
  CommandLine,
  echoCommandLine,
  focusCommandLine,
  submitCommand,
  submitCommandLine,
} from "./command-line";
export type { CommandLineProps, PilotResult } from "./command-line";
export { displayCommandLineStatus, formatVoiceStatus } from "./voice-status";
export {
  PLAY_HINT,
  SIM_HUD_ID,
  SimControls,
  applySimControlKey,
  formatSimHud,
  formatSimTimeMmSs,
  setPaused,
  setSimRate,
} from "./sim-controls";
export type { SimControlKey, SimControlsProps } from "./sim-controls";
export { SessionSetup, loadSessionSetupDefaults, sessionSetupDefaults } from "./session-setup";
export type { SessionSetupProps } from "./session-setup";
export { FPS_DEBUG_ID, FpsDebug, formatFpsDebug, isFpsDebugEnabled } from "./FpsDebug";
export {
  DEFAULT_BACKEND_HELP,
  DEFAULT_HEALTH_URL,
  PATH_C_HELP,
  PATH_C_LABEL,
  PATH_C_UNAVAILABLE_HELP,
  PTT_BIND_HELP,
  PTT_BIND_OPTIONS,
  SPEECH_PREFS_KEY,
  VOICE_DISABLED_HINT,
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
