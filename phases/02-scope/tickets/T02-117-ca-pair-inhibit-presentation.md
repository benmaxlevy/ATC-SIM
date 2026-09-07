# T02-117 — CA Pair-Inhibit Presentation

## Goal

Make a CA pair inhibit behave as an alert disable for that pair throughout the
scope presentation.

## Acceptance

1. `CA` two-slew and `CA P` pair inhibits suppress red Line 0 `CA`, CA audio,
   and that pair's LA/CA/MCI-list row for both member tracks.
2. Pair suppression has no datablock inhibit glyph; upright `Δ` remains only
   for `CA K` track-level alert disable.
3. A shared track's separate active pair remains visible, listed, and audible.
4. `CA E` or toggling the pair off restores CA presentation if the alert still
   exists.
5. Add focused regression coverage using synthetic pair alerts. Update user
   and phase documentation if observable behavior changes.

## Constraints

- Preserve single-track `CA K` behavior.
- No CA detection/threshold changes; no MSAW/MCI changes.
- Keep CA list form `CA <ACID>*<ACID>` and stable green list rows.
- Worker commits only on the ticket branch and reports `READY TO MERGE` or
  `BLOCKED`.
