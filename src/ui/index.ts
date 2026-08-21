/**
 * Public API for `@ui`.
 *
 * Legal now: re-export `App` (T00-02 shell). Command line echo and disclaimer land in T00-10.
 *
 * Later: shell, command line, strips, settings.
 *
 * Import rule: `@ui` may import all other `src/*` packages.
 * The sim tick must never wait on React render.
 */
export { App } from "../App";
