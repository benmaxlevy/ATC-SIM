---
name: run-swarm
description: Execute this repository's ticket-based swarm workflow with correct planning, roles, isolated worktrees, progressive commits, merge locks, and phase handoffs. Use when the user asks to execute, start, resume, or coordinate a phases/SWARM.md swarm.
---

# Run ATC-SIM swarm

## Non-negotiable first action

Before any git inspection, agent spawn, worktree creation, or application edit:

1. Read `phases/SWARM.md`.
2. Update `phases/SWARM.md` for the requested swarm by appending a new start/configuration section. Preserve every prior swarm section.
3. If the configuration is incomplete or materially ambiguous, ask the user now.
4. Commit the planning update before creating ticket branches or worktrees.

`phases/SWARM.md` is the swarm contract. `phases/SWARM-STATUS.md` records history and completion; do not use STATUS as a substitute for updating SWARM first.

## Preflight after planning

- Read `SWARM-STATUS.md`, the phase README, role prompt, and relevant ticket files.
- Verify `master`, ancestry, prerequisites, skipped tickets, dependencies, model, worker limit, and stop phase.
- Preserve unrelated dirty files, branches, worktrees, and untracked QA artifacts. Do not reset, clean, delete, or stage them.
- If another swarm is in flight or the working tree contains unclear application changes, stop and report `BLOCKED`.

## Role rules

- **Orchestrator:** coordinates one captain; writes planning/STATUS only; never edits `src/` or `tools/`.
- **Captain:** spawns workers, owns the merge lock, merges with `--no-ff`, tests after each merge, updates STATUS, and returns the phase result.
- **Worker:** implements exactly one ticket in its own ticket branch/worktree, commits progressively, never merges, never spawns children, and returns `READY TO MERGE` or `BLOCKED`.

Never exceed the configured worker count. Same-wave workers use separate worktrees from current `master`. Do not end a captain/orchestrator turn while workers are still running. Rebase or respawn stale work after a merge; do not merge conflicts by force.

## Completion

Workers report changed paths, commits, tests, and one terminal status. Captains report merged tickets, tests, manual leftovers, notes, and exactly `PHASE EXIT GREEN` or `PHASE EXIT BLOCKED`. The orchestrator verifies `master`, runs the final required test, appends STATUS, and stops at the configured phase boundary. Do not start a later phase without a new swarm configuration in `phases/SWARM.md`.

Use PowerShell here-strings for commits and merges. Do not push, force-push, skip hooks, stage secrets/caches/screenshots, or invent manual/visual acceptance.

## References

- `phases/SWARM.md` — current swarm contract and first-action requirement
- `phases/SWARM-STATUS.md` — immutable swarm history and status
- `.cursor/rules/ticket-execution-guardrails.mdc` — ticket branch and commit policy
- `.cursor/rules/swarm-operating-protocol.mdc` — always-on role and merge constraints
