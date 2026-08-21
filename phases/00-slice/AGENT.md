# Phase 0 implementation agent

Copy everything below this line into a **new** implementation agent as the full prompt.

---

You are implementing **Phase 0 (Slice)** of ATC-SIM, an in-browser STARS-like ATC trainer (visual analog only — not the Raytheon product).

Workspace: the ATC-SIM repo root. You write **application code and repo config**. You do **not** rewrite phase plans except to check off acceptance-criteria boxes in `phases/00-slice/tickets/*.md` as you complete each ticket.

## Read first (do not edit)

Obey these contracts. If a ticket and a shared file disagree, **the shared file wins**. Do not reopen frozen decisions.

1. `phases/_shared/glossary.md` — terms and units. Do not invent synonyms (Scope, PPI, Command IR, SpeechPort, Pilot agent, Intent, Kinematics, Readback, Scenario, Facility, Track, Datablock, PTT).
1b. `phases/_shared/references.md` — STARS-like vs STARS; PCG terms.
2. `phases/_shared/architecture.md` — browser-first, packages, KDEM, tick/state rules (tick is not required until a later phase).
3. `phases/_shared/command-ir.md` — radio `Command` / `Instruction` schema. Phase 0 types only; do not implement the parser.
4. `phases/_shared/speech-port.md` — `SpeechPort` interface. Phase 0 is `null` only.
5. `phases/_shared/non-goals.md` — do not “while you are here” any of this.
6. `phases/00-slice/README.md` — phase narrative, frozen decisions, exit checklist.
7. `phases/_shared/ticket-template.md` — how tickets are shaped.

Then implement **only** the tickets in `phases/00-slice/tickets/`.

## Frozen decisions (closed)

- Browser-first **Vite + TypeScript strict + Vitest**. One SPA. **No server tick.**
- **Single Vite app** (not a monorepo). Folders: `src/core`, `src/parse`, `src/pilot`, `src/scope`, `src/speech`, `src/scenario`, `src/ui`.
- React 18 for `src/ui` chrome. PPI is a Canvas2D host; phase 0 is a blank placeholder.
- Demo airport **KDEM**, runway **27**, mag var **0**, field elev **0**, ARP **0°N, 0°E**.
- Coordinate system is chosen in T00-04 (local ENU NM). Document it and test it. Do not pick lat/lon as the runtime world position.
- Training/entertainment disclaimer: exact copy from T00-01, visible in the UI in T00-10.
- `NullSpeechPort` exists so the app boots. Vendor SDKs only ever under `src/speech/` — and **not in this phase**.
- Command IR TypeScript types **match** `_shared/command-ir.md` (do not rename fields).
- Command line in phase 0 **echoes**; it does not parse.

## Execution protocol

1. Work **one ticket at a time**, in the order below. Do not start downstream tickets early.
2. Read the ticket fully. Implement **Scope**. Honor **Out of scope**.
3. Run the tests/commands the ticket names. Check off every AC in the ticket file (`- [x]`). Mark Manual ACs only after you have actually verified them or, if you cannot open a browser, leave them unchecked and report them in your summary.
4. Commit only if the user asks. Do not `git push`.
5. After **T00-10** and the phase exit checklist, **STOP**. Do not open `phases/01-closed-loop/` or implement the parser, Pilot agent, or kinematics.

## Ticket order (mandatory)

| Order | ID | File |
| --- | --- | --- |
| 1 | T00-01 | `phases/00-slice/tickets/T00-01-product-freeze-and-disclaimer.md` |
| 2 | T00-02 | `phases/00-slice/tickets/T00-02-repo-skeleton-vite-typescript-vitest.md` |
| 3 | T00-03 | `phases/00-slice/tickets/T00-03-folder-layout-and-public-apis.md` |
| 4 | T00-04 | `phases/00-slice/tickets/T00-04-coordinate-system-and-unit-tests.md` |
| 5 | T00-05 | `phases/00-slice/tickets/T00-05-kdem-scenario-json-stub.md` |
| 6 | T00-06 | `phases/00-slice/tickets/T00-06-command-ir-typescript-types-and-fixtures.md` |
| 7 | T00-07 | `phases/00-slice/tickets/T00-07-null-speech-port-and-di-hook.md` |
| 8 | T00-08 | `phases/00-slice/tickets/T00-08-session-event-log-schema.md` |
| 9 | T00-09 | `phases/00-slice/tickets/T00-09-tooling-lint-format-ci.md` |
| 10 | T00-10 | `phases/00-slice/tickets/T00-10-phase-0-demo-boot.md` |

## Phase exit — stop here

Green when:

- `npm test` passes.
- `npm run ci` passes (typecheck + lint + test).
- `npm run dev` shows a **dark full-viewport** shell with the **frozen disclaimer**, a command line **at the bottom** that **echoes**, an **empty PPI placeholder**, and **no console errors**.

Then stop. Phase 1 is a different agent / prompt.

## Hard stops (do not implement)

- Parser tokens (`H270`, etc.), Pilot agent, Intent, Kinematics, `stepWorld`, rAF physics loop
- Maps, Datablocks, Tracks, CRC keys, strips, CA/MSAW
- `web-speech`, `http`, or `whisper-wasm` SpeechPort
- PTT, getUserMedia, Web Audio radio FX
- Real CIFP / extra airports / wind
- Redux, backend, monorepo workspaces, LLM anything

If a ticket is ambiguous, choose the option that **keeps the slice smaller** and note it in the ticket’s implementation notes — do not expand scope.
