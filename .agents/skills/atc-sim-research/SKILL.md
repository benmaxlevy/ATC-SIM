---
name: atc-sim-research
description: Research a proposed ATC-SIM feature and produce a read-only, evidence-backed implementation plan with ticket boundaries and a draft SWARM configuration. Use before approval when the user describes a feature they may want to build.
---

# Research an ATC-SIM feature

Research the requested capability in the repository first, then consult the
authoritative sources named by the relevant phase. This skill is planning-only:
do not edit files, create tickets, update `phases/SWARM.md`, create branches,
commit, or implement code.

## Workflow

1. Read `AGENTS.md`, the current `phases/SWARM.md`, the target phase README and
   AGENT prompt, shared references/glossary/non-goals, and relevant existing
   tickets. Inspect status, branch, recent log, and relevant source paths.
2. Map the requested feature to existing architecture, shipped behavior,
   frozen decisions, dependencies, and likely acceptance-test seams. Reuse
   generic/data-first extension points; flag any proposed schema or API change.
3. Build a feature contract before proposing tickets. For every user-visible
   command, shortcut, or state transition, record entry/routing, exact grammar,
   optional-field order, ambiguous-token precedence, state transitions,
   allowed/forbidden side effects, exact errors, help/docs surfaces, tests, and
   manual evidence. Include valid, incomplete, malformed, ambiguous, and
   meaningful field-order examples. Separate inherited behavior that must stay
   unchanged from new behavior.
4. Research domain behavior using the phase’s required references. Prefer
   primary sources and record URLs, terminology, constraints, and any
   trainer-vs-real-system delta. Do not invent fidelity requirements from a
   screenshot or unsupported source.
5. Propose the smallest coherent ticket set. Split tickets when ownership,
   lifecycle/state boundaries, or manual evidence differ. Do not put multiple
   overloaded command families into one ticket merely because they share a key
   prefix. For each ticket give an ID placeholder, title, ownership,
   dependencies/wave, affected files, the complete contract slice, acceptance
   criteria, tests, citations, and explicit non-goals.
6. Draft the exact addendum shape for `phases/SWARM.md`: goal, include/skip,
   stop boundary, worker limit, merge target, product law, waves, ownership,
   and captain return string. State unresolved choices and ask for approval or
   adjustment.

## Output contract

Return, in order: findings; repository impact; proposed tickets; proposed
SWARM addendum; risks/open decisions; approval request. Clearly label facts,
source-backed inferences, and proposals. The output must be usable by
`atc-sim-plan-tickets` after the user approves or edits it.

For every proposed ticket include a compact table with columns `Input`,
`Expected result`, `State/side effect`, `Error/negative case`, and `Evidence`.
A ticket is not ready if any command form, overloaded-key conflict, required
user surface, or manual citation is left undetermined.

## Boundaries

- Never perform mutations, even if the request says “research and plan.”
- Never assume a ticket number, branch, phase, worker count, or merge target;
  propose values from repository conventions and mark them for approval.
- Preserve self-hosted speech restrictions, generic tests, data-first loading,
  shipped file splits, and phase non-goals.
- If browsing is unavailable, distinguish repository evidence from unverified
  domain assumptions and list the missing sources.
