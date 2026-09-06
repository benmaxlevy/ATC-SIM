# ATC-SIM Codex rules

These are the Codex equivalents of the repository's Cursor rules. The original
`.cursor/` files remain unchanged.

## Chat style

Use caveman ultra for chat replies: keep technical substance, state each fact
once, and remove filler. Switch with `/caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra|off`; `stop caveman` and `normal mode` revert. Never omit `not`, `never`, `no`, `only`, or `except`; keep code, API names, commands, commit keywords, error strings, numbers, and units exact. Use normal prose for code, comments, commits, docs, tickets, issues, PRs, and third-party messages. Drop ultra mode for security warnings, irreversible confirmations, ambiguous multi-step sequences, or clarification requests.

## CI and commits

Before committing application, test, or tool changes, run `npm run ci` (typecheck, lint, format check, test). If `speech-api/` changed, also run `cd speech-api && SPEECH_API_MOCK=1 pytest`, installing CI requirements if needed. Fix failures; never use `--no-verify`. Rules/docs/STATUS-only commits may skip these checks when runtime, tests, tools, speech API, and relevant configuration are untouched.

The repository expects commits for requested implementation work. Commit each coherent slice after its gate passes. Use the existing ticket or `fix/` branch; do not mix unrelated work. Stage explicit paths only; never stage secrets, `.env`, caches, generated artifacts, or QA screenshots. Do not push, force-push, or amend commits not just created on this branch.

## Ticket git workflow

Before code changes, identify ticket id and acceptance criteria; inspect status,
diff, branch, and recent log. Preserve unrelated dirty files and untracked
artifacts. Start each ticket from current `master` on a dedicated
`ticket/<ticket-id>-<short-slug>` branch. Never commit ticket work directly on
`master` or reuse a branch for another ticket. When complete, squash it into
one commit on `master`, verify status, and delete the local branch. Stop on
conflicts; never force or skip hooks. In a swarm, workers never merge.

## Feature research and planning skills

Use the two user skills in order for a new feature:

1. `atc-sim-research` is read-only. Given a request such as “implement VOR
   approaches,” it researches repository architecture and authoritative domain
   references, then proposes tickets, dependencies, acceptance criteria, and a
   draft `phases/SWARM.md` addendum. It must not edit files, create branches,
   or commit.
2. After the user approves or adjusts that proposal, `atc-sim-plan-tickets`
   creates the approved ticket files and appends the new SWARM configuration.
   It must not implement code or start the swarm.
3. Invoke `run-swarm` only after ticket/SWARM planning is approved and written.

Planning skills must preserve SWARM history, use the target phase’s existing
ticket format, keep IDs/dependencies/merge target explicit, and never infer
approval for mutations from a research request.

## Data-first extensibility

KDEM / DEMO ONE / ILS 27 are shipped fixtures, not the type system. A second
STAR, SID, approach, or airport with an existing schema shape must work from
JSON without a facility-specific branch. Add existing-shape data under
`src/scenario/data/<icao>/` and related scenario/video-map JSON. Register new
airports through generic catalog/scenario/MAPS/MVA loading; never add
`loadKdem3()` or another facility switch. New behavior belongs in schema fields
and generic walkers. Walk catalog procedures/fixes by id; parser tokens stay
generic. KDEM names are allowed in tests, F1 examples, and comments, but not on
live paths except documented last-resort fallbacks. For ambiguous fixes prefer
current `PROCEDURE` / `VIA`, then first catalog hit; never special-case DEM1.

## Generic tests

Use synthetic, minimal, parameterized fixtures for reusable behavior. Keep
airport/scenario acceptance tests out of unit/component suites. Validate
committed facility data only when needed to prove its contract. Do not encode
production map counts, IDs, ordering, or geometry into generic tests. Keep one
acceptance/fidelity/integration file per shipped feature; leftover units are
one happy path plus 2–3 real edges. Share `src/scope/test/mockCanvas.ts`.
When a cut breaks CI, restore that feature's acceptance test, not the old unit
pile.

## Preserve shipped file splits

When editing these paths, keep the thin orchestrator modules thin:

| File | Owns |
| --- | --- |
| `src/ui/dcb/DisplayControlBar.tsx` | Public bar, MAIN grid, sync re-exports |
| `src/ui/dcb/dcbLayouts.ts` | MAIN cell data |
| `src/ui/dcb/dcbChrome.tsx` | `DcbCell`, shared caps, SITE |
| `src/ui/dcb/DisplayControlBarMenus.tsx` | AUX and MAPS/PREF/CHAR/BRITE menus |
| `src/scope/render/renderScope.ts` | Draw order only |
| `src/scope/render/renderScopePaint.ts` | Paint stages |
| `src/scope/previewArea.ts` | Idle/entry/armed, slew apply, keys |
| `src/scope/previewParse.ts` | Buffer grammar and preview parsing |

DCB clicks call `@scope` only; never Command IR from the bar. Re-export
`MAIN_DCB_LAYOUT` from `DisplayControlBar`. Do not split
`src/parse/spoken/pattern-matcher.ts` or `src/scope/scopeKeys.ts` unless a
later ticket explicitly requires it.

## Later implementation backlog

If something that should work ships without real behavior, document it in
`phases/LATER-IMPLEMENTATION-BACKLOG.md` in the same change: what is visible or
callable, what is missing, and constraints later work must preserve. Extend an
existing subsection instead of duplicating it. Untouched future work is not a
backlog item.

## Self-hosted speech

STT/TTS run through `speech-api/`; model weights may download to our machine
from a public source. The browser calls only that API or in-tab
`whisper-wasm` / `null`. Do not add metered speech SDKs, REST calls, or env
keys (including OpenAI, Deepgram, AssemblyAI, Groq, Together, Fireworks,
ElevenLabs, Google Cloud Speech, Azure Speech, Amazon Transcribe/Polly, or
Hugging Face inference services). Hugging Face is allowed only for one-time
weight downloads. Chrome Web Speech is optional prototype code, never default
or required. See `phases/_shared/speech-port.md`.

## Subagents and swarm protocol

Use only models/subagent capabilities available in this Codex session; do not
request speculative named slugs. If spawn fails for unavailable model, work in
this session rather than retrying. A swarm requiring unavailable model is
blocked until configuration changes.

When `phases/SWARM.md` or a swarm prompt is active, roles are: orchestrator
(planning/status only), captain (workers, merge lock, squash merges, tests,
STATUS), and worker (exactly one ticket, own branch/worktree, progressive
commits, no merge/spawn). Before any swarm git inspection, spawn, worktree, or
edit: read `phases/SWARM.md`, append its start/configuration section preserving
history, resolve material ambiguity, and commit that planning update. Then read
`SWARM-STATUS.md`, phase README, role prompt, and tickets. Verify ancestry,
prerequisites, dependencies, skipped tickets, model, worker limit, and stop
phase. Preserve unclear existing work; never reset, clean, or delete it.

Obey configured worker limits and wave order; same-wave workers use separate
worktrees. Wait for terminal worker results. After each merge run required
tests; stop new waves on failure and use one narrowly scoped fix worker. Rebase
or respawn stale work after merges. On conflicts report `BLOCKED`. At phase
completion run final CI on `master`, append STATUS without deleting history,
record manual leftovers, and stop at the configured boundary. Do not start a
later phase without new SWARM configuration. Worker handoff is exactly
`READY TO MERGE` or `BLOCKED`; captain handoff is exactly `PHASE EXIT GREEN`
or `PHASE EXIT BLOCKED`.
