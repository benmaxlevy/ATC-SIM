---
name: check-stars-manual
description: Review an ATC-SIM ticket and its changes against a user-supplied Raytheon STARS manual. Requires ticket and manual paths plus an independent subagent verification pass.
---

# Check ATC-SIM ticket against STARS manual

Use only when the user provides both paths for the current invocation:

- ticket file or ticket directory
- Raytheon STARS manual PDF

If either path is missing, ask for it before inspecting repository changes.

The user-supplied manual is authoritative for STARS behavior. Do not substitute CRC,
vSTARS, screenshots, VATSIM documentation, or memory. If the manual cannot be
read, report `BLOCKED` with the missing path or extraction error.

This skill is read-only. Do not edit application code, tickets, phase files,
tests, git state, or the manual.

## Workflow

1. Validate both user-supplied paths. Resolve the ticket path to one ticket
   file or a ticket directory containing the relevant ticket. Read its goal,
   scope, acceptance criteria, research references, non-goals, and suggested
   files.
2. Inspect repository status, branch, recent commits, the ticket's referenced
   source/tests, and the diff or committed changes associated with the ticket.
   Preserve unrelated work and do not reset, clean, checkout, or commit.
3. Extract the user-supplied manual with `pdftotext -layout` into a temporary
   location.
   Use the manual's printed section, figure, table, and page numbers as
   citations. For visual/layout questions, inspect the corresponding PDF page
   directly when text extraction is insufficient.
4. Identify only manual sections relevant to the ticket's actual scope. Compare
   each implemented behavior and acceptance criterion against those sections.
   Separate manual facts, repository facts, supported trainer deltas, and
   unsupported assumptions. Build an evidence matrix before writing findings:

   | Ticket contract row | Manual requirement | Implementation/test evidence | Result |
   | --- | --- | --- | --- |
   | exact input/form | printed section/page/table | file/line and test | PASS/FAIL/CONCERN/BLOCKED |

   Include positive, incomplete, malformed, ambiguous, modifier-conflict, and
   optional-field-order cases named by the ticket. Inspect the help modal,
   command reference, and user docs whenever syntax changes. Do not infer that
   one happy-path parser test covers an overloaded command.
5. Delegate one independent, read-only verification pass to a subagent. Give it
   the user-supplied ticket path, the manual path, the relevant source/test
   paths, and the instruction to independently verify functionality against the
   relevant manual sections. Do not give it the primary review's conclusions.
   Use only subagent capabilities available in the current Codex session; do
   not request speculative model names. The delegated reviewer performs one
   independent pass and is not expected to spawn another reviewer. Wait for its
   terminal result.
6. Reconcile both reviews. Report disagreements explicitly, resolve them from
   the manual or repository evidence, and do not silently choose one result.

If the delegated reviewer returns valid PASS/FAIL findings but says it could
not spawn a child reviewer, use that result as the required independent pass
and note the limitation. Do not convert a valid review into BLOCKED merely due
to unavailable recursive delegation. Use BLOCKED only when the supplied manual
cannot be read, the ticket/change cannot be inspected, or the captain’s
delegated review returns no result.

## Scope rules

- Check behavior actually covered by the ticket and its changes.
- Do not report unrelated future work merely because the manual describes it.
- Honor explicit ATC-SIM trainer deltas and phase non-goals when they are
  documented in the ticket, phase README, or repository instructions.
- Do not require functionality that the ticket explicitly marks out of scope.
- Flag a deviation only when the manual supports it directly or when the
  implementation contradicts an explicit documented trainer delta.
- Treat absent runtime state as absent; do not infer operational behavior from
  formatter-only inputs, names, screenshots, or test fixtures.

## Required report

Return:

- Ticket path and change scope reviewed.
- Manual sections consulted, with printed page/figure/table citations.
- Findings ordered by severity: `FAIL`, `CONCERN`, `PASS`, `BLOCKED`.
- For every finding: repository file and line, manual citation, observed
  behavior, and required action or rationale.
- Acceptance criteria status.
- Subagent verification result and any disagreement.
- Explicit statement that no files or git state were changed.

For every `FAIL` or `CONCERN`, state the exact input, observed result, manual
expectation, repository file/line, and required action. For every `PASS`, cite
the contract row and test or inspection evidence; avoid broad “looks aligned”
claims.

Do not claim full STARS or NAS compatibility. Use `STARS-like` or `manual
alignment` unless the user explicitly asks for a narrower quotation.

## Subagent handoff

Use this prompt shape, filling in paths and relevant manual sections:

```text
Independently review ticket <ticket-path> and its associated implementation
against manual <manual-path>. Read the ticket, inspect the named source/tests and
current diff read-only, extract only relevant manual sections, and verify
functional behavior against those sections. Do not edit files or git state.
Return PASS/FAIL/BLOCKED findings with repository file/line evidence and
manual printed page/figure/table citations. Do not review unrelated future
features. This is an independent pass; do not assume another review's result.
```
