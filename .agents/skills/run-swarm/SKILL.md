---
name: run-swarm
description: Execute this repository's ticket-based swarm workflow as the invoking agent-captain, with isolated workers, progressive commits, merge locks, and phase handoffs. Use when the user asks to execute, start, resume, or coordinate a phases/SWARM.md swarm.
---

# Run ATC-SIM swarm

The agent that invokes this skill is the swarm captain. Follow
`phases/SWARM.md` as the swarm contract and `AGENTS.md` as the repository-wide
Codex rules. Do not spawn or delegate to a captain.

## First action

Before any git inspection, agent spawn, worktree creation, or application edit:

1. Read `phases/SWARM.md` as captain.
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

- Invoking agent-captain: spawns workers directly, owns the merge lock,
  squash-merges one commit per ticket onto the configured merge target, tests
  after every merge, updates STATUS, and reports the phase.
- Worker: implements exactly one ticket in its own ticket branch/worktree,
  commits progressively, never merges or spawns children, and reports changed
  paths, commits, tests, and exactly `READY TO MERGE` or `BLOCKED`.

Never exceed configured worker count or leave workers running. Rebase or
respawn stale work after merges; never force conflicts. The invoking captain reports merged
tickets, tests, manual leftovers, notes, and exactly `PHASE EXIT GREEN` or
`PHASE EXIT BLOCKED`. The invoking captain verifies the configured merge target,
runs final required tests, appends STATUS, and stops at the configured phase
boundary. No separate orchestrator is spawned.

## References

- `phases/SWARM.md` — contract and first-action requirement
- `phases/SWARM-STATUS.md` — swarm history/status
- `AGENTS.md` — Codex ticket, CI, commit, and merge rules
