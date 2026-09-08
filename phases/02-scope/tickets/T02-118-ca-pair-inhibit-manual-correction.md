# T02-118 — CA Pair-Inhibit Manual Correction

## Goal

Correct T02-117 to the TI 6191.409 §7.10–7.11 pair-inhibit presentation.

## Acceptance

1. `CA` plus one slew toggles the selected track's existing current or
   pairwise-inhibited CA pair.
2. `CA P` supports two slews: select/slew first track, then slew second track.
3. Both commands suppress only that pair's CA Line 0, CA AL-list row, and tone;
   both member datablocks show normal inline upright `Δ` immediately after the
   ACID.
4. A separate active pair sharing either track remains visible, listed, and
   audible; its uninhibited member must not gain `Δ` from the other pair.
5. `CA E` restores CA presentation for the enabled pair when conflict persists.
6. Update user/phase docs and regression tests.

## Manual evidence

- §7.10 pp. 7-19–7-20: `CA` then slew one track toggles a current/pairwise
  inhibit; both involved tracks lose CA and show `Δ`.
- §7.11 p. 7-21: `CA P`, then select two tracks (each by ACID or slew), inhibits
  CA system-wide for the pair; both involved tracks show `Δ`.

## Constraints

- Preserve `CA K` track-level disable and existing MSAW/MCI behavior.
- No detection/threshold changes.
- Keep CA rows `CA <ACID>*<ACID>` and stable green.
