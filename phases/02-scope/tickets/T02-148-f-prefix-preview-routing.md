# T02-148 F-prefix Preview routing

**Depends on:** T02-147

**Goal:** Preserve numeric altitude-filter entry while allowing an F-prefixed
ACID such as `FFT123` to reach the Preview Area after the initial filter chord
is cancelled by the next non-numeric key.

**Manual anchor:** TI 6191.409 Rev. 30 §4.11.2, pp. 4-78–4-79.

## Scope

- Keep the existing `F` plus numeric altitude-filter behavior.
- When an active filter entry receives a non-numeric continuation, restore the
  prior filter and reprocess that key through Preview routing.
- Add focused regression coverage for `FFT123` and both filter limits.

## Non-goals

- No new filter grammar.
- No flight-plan semantic changes.
- No radio, pilot execution, or unrelated shortcut changes.

## Acceptance criteria

- `F` followed by six numeric digits, with the existing field-entry behavior,
  still commits the altitude filter.
- An optional space and the associated-track six digits remain supported by the
  existing command path.
- Typing `FFT123` in scope focus produces Preview text rather than reopening
  altitude-filter entry.
- Cancelled filter entry restores its previous limits.
