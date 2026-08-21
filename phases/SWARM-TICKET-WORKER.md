# Swarm ticket worker (leaf)

You implement **exactly one ticket**. You do **not** merge to `master`. You do **not** start a second ticket. You do **not** spawn subagents.

Workspace: `c:\Users\Ben\Documents\ATC-SIM`

## Inputs (orchestrator / captain fills these)

- **Ticket ID:** `Txx-yy`
- **Ticket file:** `phases/NN-name/tickets/Txx-yy-….md`
- **Base:** current `master` (fast-forward if needed: `git checkout master` then `git pull` only if a remote is in use; local-only is fine)
- **Branch:** `ticket/<filename-without-.md>` e.g. `ticket/T00-04-coordinate-system-and-unit-tests`

## Read first (do not edit `_shared` unless the ticket says to patch `command-ir.md` in the same PR)

- The ticket file (Research section if present)
- `phases/_shared/glossary.md`
- `phases/_shared/references.md` (scope / phraseology tickets)
- `phases/_shared/architecture.md`
- `phases/_shared/command-ir.md`
- `phases/_shared/speech-port.md`
- `phases/_shared/non-goals.md`
- The parent phase `README.md` frozen decisions

Shared files win. Do not reopen Command IR / SpeechPort / parser tokens. **TCW polish tickets (T02-14–21)** may amend *named* rows in `phases/02-scope/README.md` when that ticket says so (palette, FDB lines, DCB). Do not implement a later phase “while you are here.” No OSM, no STARS font, no WX mosaic. Scope/DCB never emit Command IR.

## Git

```text
git checkout master
git checkout -b ticket/Txx-yy-short-slug
```

Progressive commits (ticket id in every message). No secrets. No `--no-verify`. No commit on `master`. **Do not merge.** When ACs are done:

```text
git status   # clean, on ticket branch
npm test     # or the ticket’s test command; must be green
```

## Return (mandatory last message)

```
READY TO MERGE
Branch: ticket/…
Ticket: Txx-yy
ACs: N/M checked (list any Manual left unchecked)
Tests: <command> exit 0
Files: <short list>
Notes: <blockers / README deltas>
```

If blocked (missing phase 0 files, failing tests you did not cause): **do not merge**, return `BLOCKED` with the reason. Leave the branch as-is.
