/**
 * Public API for `@ui`.
 *
 * Legal now: Scope shell (disclaimer, empty PPI, command line that echoes).
 * Text submit bypasses SpeechPort and does not call the parser or Pilot agent.
 *
 * Later: strips, settings. The sim tick must never wait on React render.
 *
 * Import rule: `@ui` may import all other `src/*` packages.
 */
export { Shell, Shell as App } from "./shell";
export { DISCLAIMER_COPY } from "./disclaimer-copy";
export { echoCommandLine, submitCommandLine } from "./echo-command-line";
