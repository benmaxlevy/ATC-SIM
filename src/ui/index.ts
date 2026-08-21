/**
 * Public API for `@ui`.
 *
 * Legal now: Scope shell (disclaimer, PPI, command line). Canvas click selects
 * a track then focuses the command line. Enter runs `submitCommand` →
 * `handleRadioText` and shows the template readback. Text submit bypasses
 * SpeechPort (`Command.source` is `"text"`). Selection is a scope action and
 * does not emit a readback.
 *
 * Later: strips, settings. The sim tick must never wait on React render.
 *
 * Import rule: `@ui` may import all other `src/*` packages. `@pilot` must not
 * import `@ui`.
 */
export { Shell, Shell as App } from "./shell";
export { DISCLAIMER_COPY } from "./disclaimer-copy";
export { echoCommandLine, submitCommandLine } from "./echo-command-line";
export { submitCommand } from "./submitCommand";
export type { PilotResult } from "./submitCommand";
