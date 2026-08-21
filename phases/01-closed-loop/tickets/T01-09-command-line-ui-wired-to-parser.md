# T01-09 Command line UI wired to parser

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** M
**Depends on:** T01-07, T00-10 (shell + echoing command line)
**Blocks:** T01-11, T01-14
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The Phase 0 command line no longer echoes raw text as the product. Enter runs `handleRadioText` on the live `World` and shows the **readback** (or unable) as text in a status line. `Command.source` is `"text"`. SpeechPort is not called.

## Context

`phases/_shared/speech-port.md`: “`text-only` — Not a SpeechPort; the command line bypasses speech.”

`phases/_shared/architecture.md`: PTT / command line → parser → Command IR. Phase 1 has no PTT.

Phase 0 `T00-10` already has a bottom command line that echoes. Replace the echo path only. Keep the dark full-viewport shell and disclaimer.

## Scope

- On Enter (or equivalent submit): take the input string, call `handleRadioText(world, text, log)`, display `PilotResult.readback` in a **readback / status** region (above the command line or in a dedicated line).
- Clear the input after submit (including rejects) so the next command is easy.
- Show the last readback until the next submit. Empty submit (user hits Enter on blank) may no-op **or** show say-again — match T01-07 empty-line behavior; do not crash.
- Do **not** call `speech.transcribe` or `speech.synthesize`.
- Keep keyboard focus in the command line after submit.
- Optional: prefix the status line with `RW` or `UNABLE` for glanceability — not required if the template already starts with callsign / `unable`.
- Wire this to the same `World` instance the future PPI will use (module-level store, tiny store, or lifted state — match Phase 0). If spawn exists (T01-04), commands should address those aircraft even before T01-10 draws them (you can verify via tests or a temporary debug; PPI is next).
- Display sim time or rate is T01-12; not required here.

## Out of scope

- Voice, PTT, TTS playback of the readback.
- STARS preview area / history strip chrome (a single text line is enough; a short scrollback of last **5** readbacks is allowed, not required).
- Click-to-select (T01-11).
- Parsing English phraseology (phase 3 `parseCommand` / Path A after tokenizer miss — T03-03). This ticket is tokens only.

## Implementation notes

If Phase 0 used vanilla DOM:

```ts
input.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const result = handleRadioText(world, input.value, sessionLog);
  readbackEl.textContent = result.readback;
  input.value = "";
});
```

If React, same data flow: submit handler, no speech hooks.

Do not run physics in the submit handler. Intent updates in `world`; rAF (T01-10) will draw.

Accessibility: `aria-live="polite"` on the readback node so screen readers get the template (nice; **AC optional** — mark if you do it).

Keep `src/ui` importing `src/pilot`, not the other way around.

## Acceptance criteria

- [x] **AC1 —** Typing `DAL123 H270` and Enter (with DAL123 in world) shows a readback containing heading two seven zero (case-insensitive) and does **not** show the raw token string as the only output.
- [x] **AC2 —** Input field is empty after Enter.
- [x] **AC3 —** A bad command (`XYZ H270` or ambiguous fixture if present) shows an `unable` readback; aircraft that existed still have prior intent.
- [x] **AC4 —** Network tab / code search: submit path does not call `SpeechPort` methods.
- [x] **AC5 —** Phase 0 disclaimer still visible; command line still at the bottom.
- [ ] **AC6 —** **Manual:** focus remains in the command line after Enter.
- [x] **AC7 —** Automated: a thin UI test **or** a store-level test that the submit function used by the UI calls `handleRadioText` is acceptable if full DOM tests are painful. Prefer Vitest + happy-dom/jsdom **only if Phase 0 already uses it**; otherwise a `submitCommand(world, text)` in `src/ui` that is unit-tested without canvas is enough, and the shell must call that function (grep AC).

## Test plan

- Unit: `submitCommand` delegates to pilot and returns readback (DOM-free module).
- Integration: none (T01-13)
- Manual: AC1, AC2, AC6 in `npm run dev` once spawn exists

## Suggested files

- `src/ui/commandLine.ts` (or Phase 0 equivalent)
- `src/ui/submitCommand.ts`
- `src/ui/submitCommand.test.ts`
- `src/main.ts` / shell component — replace echo
