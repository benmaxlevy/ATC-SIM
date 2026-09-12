---
name: atc-sim-plan-tickets
description: Turn an approved ATC-SIM feature plan into ticket files and a phases/SWARM.md addendum while preserving swarm history and repository constraints. Use only after explicit user approval or requested adjustments are settled.
---

# Create ATC-SIM tickets and SWARM plan

This skill performs the approved planning mutation. It does not implement
application code, spawn workers, create worktrees, merge, push, or run the
swarm. The user must explicitly approve the research plan or provide the
equivalent ticket/SWARM instructions before edits begin.

## Preconditions

Read `AGENTS.md`, `phases/SWARM.md`, `phases/SWARM-STATUS.md` if present, the
target phase README and AGENT prompt, shared references required by that phase,
and all related tickets. Inspect status, branch, diff, recent log, and existing
ticket numbering. If approval, target phase, ticket IDs, dependencies, or merge
target remain materially ambiguous, stop and ask one concise question.

The approved plan must contain enough information to write a command/state
contract. If exact forms, focus/modifier routing, parser precedence,
transitions, side effects, rejection behavior, help/docs surfaces, tests,
manual citations, trainer deltas, or non-goals are missing, do not invent them;
stop and identify the missing decision.

## Workflow

1. Convert the approved plan into one ticket file per coherent ownership slice
   under the target phase’s `tickets/` directory. Use the repository’s existing
   ticket structure and include mission, research, dependencies, files,
   acceptance criteria, tests, non-goals, and handoff requirements. Every
   command ticket must also include:

   - exact entry/routing forms, modifier conflicts, grammar, optional-field
     order, token precedence, incomplete handling, and exact rejection strings;
   - preview/mode states, action payload, lifecycle/cancellation transitions,
     list/association rules, and allowed versus forbidden side effects;
   - help modal/reference and README/`docs/USER.md` obligations;
   - positive, incomplete, malformed, duplicate/capacity, ambiguous,
     modifier-conflict, and ordering test cases where applicable;
   - a manual-review checklist with printed section/page/table citations.

   Put this table in each ticket:

   | Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
   | --- | --- | --- | --- | --- |
   | concrete example | observable result | allowed mutations/prohibitions | exact failure | section/page/table |

   Never use only “support F9 creation” for an overloaded key or optional-field
   grammar.
2. Add one new dated configuration section to `phases/SWARM.md`, preserving all
   prior history. Include goal, include/skip, stop, worker limit, merge lock,
   model, product law, waves, ownership, ticket paths/branches, and captain
   return format. Do not rewrite or delete older sections.
3. Use the approved IDs and branch target exactly. Do not create branches,
   worktrees, commits, or code changes. Do not update STATUS unless the
   approved plan explicitly includes a planning-status entry.
4. Review the diff for scope leakage, duplicate IDs, broken paths, missing
   dependencies, contradictory phase rules, unsupported claims, and incomplete
   contract tables. Check that every acceptance criterion has an automated or
   manual verification path and every help/docs requirement names a file.
   Report all changed paths and unresolved manual decisions.

## Safety and quality

- Ticket acceptance criteria must be observable and testable; label visual or
  external-source checks as manual when they cannot be automated.
- Before requesting approval, perform a ticket simulation: walk each contract
  row through routing, parsing, state/effects, rejection, tests, and user
  surfaces. Flag any row that requires inventing behavior.
- Preserve data-first extensibility, generic synthetic tests, self-hosted speech
  constraints, phase boundaries, and thin-module ownership from `AGENTS.md`.
- Keep research citations and trainer deltas in the ticket Research sections.
- Never silently broaden the approved feature, add future backlog items, or
  turn a proposed implementation detail into a requirement.

## Completion

Return the created ticket paths, SWARM section summary, dependency/wave map,
validation performed, and any remaining approval needed before `run-swarm`.
