---
name: run-swarm
description: Execute this repository's ticket-based swarm workflow with correct planning, roles, isolated worktrees, progressive commits, merge locks, and phase handoffs. Use when the user asks to execute, start, resume, or coordinate a phases/SWARM.md swarm.
---

# Run ATC-SIM swarm

Follow `phases/SWARM.md` as the swarm contract and `AGENTS.md` as the
repository-wide Codex rules.

## First action

Before any git inspection, agent spawn, worktree creation, or application edit:

1. Read `phases/SWARM.md`.
2. Append a start/configuration section for the requested swarm, preserving all
   prior sections.
3. Resolve materially incomplete or ambiguous configuration with the user.
4. Commit this planning update before creating branches or worktrees.

`phases/SWARM-STATUS.md` records history and completion; it does not replace
the required SWARM update.

## Preflight and roles

Read STATUS, the phase README, role prompt, and relevant tickets. Verify
`master`, ancestry, prerequisites, dependencies, skipped tickets, model,
worker limit, and stop phase. Preserve unrelated dirty files, branches,
worktrees, and untracked QA artifacts. If another swarm is active or ownership
of application changes is unclear, report `BLOCKED`.

- Orchestrator: coordinates one captain; writes only swarm planning/status.
- Captain: spawns workers, owns merge lock, squash-merges one commit per ticket
  onto `master`, tests after every merge, updates STATUS, and reports the phase.
- Worker: implements exactly one ticket in its own ticket branch/worktree,
  commits progressively, never merges or spawns children, and reports changed
  paths, commits, tests, and exactly `READY TO MERGE` or `BLOCKED`.

Never exceed configured worker count or leave workers running. Rebase or
respawn stale work after merges; never force conflicts. Captains report merged
tickets, tests, manual leftovers, notes, and exactly `PHASE EXIT GREEN` or
`PHASE EXIT BLOCKED`. Orchestrators verify `master`, run final required tests,
append STATUS, and stop at the configured phase boundary.

## References

- `phases/SWARM.md` — contract and first-action requirement
- `phases/SWARM-STATUS.md` — swarm history/status
- `AGENTS.md` — Codex ticket, CI, commit, and merge rules
