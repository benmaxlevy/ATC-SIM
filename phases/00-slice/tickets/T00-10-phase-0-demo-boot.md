# T00-10 Phase 0 demo boot (blank scope shell + command line that echoes)

**Phase:** 00 Slice
**Priority:** P0
**Size:** M
**Depends on:** T00-01, T00-05, T00-07, T00-08, T00-09
**Blocks:** phase exit
**Launch:** Implement this ticket only. Do not start downstream tickets. After ACs pass, stop — do not begin phase 1.

## Goal

`npm run dev` shows a dark full-viewport **Scope** shell: frozen disclaimer, empty **PPI** placeholder, command line at the bottom that **echoes** submitted text. `createApp` injects `NullSpeechPort`, loads KDEM, appends `session.started`. No console errors. Parser and Pilot agent are not called.

## Context

Phase exit (README): `npm test` green; `npm run dev` shows dark full-viewport shell with disclaimer, command line at bottom, empty PPI placeholder, no console errors.

Disclaimer copy is **exactly** the paragraph in `docs/DISCLAIMER.md` (T00-01). PPI is not radar yet — a labeled empty region. Command line is **text-only** and bypasses SpeechPort (`phases/_shared/speech-port.md`: text-only is not a SpeechPort).

## Scope

- Dark theme CSS: `html/body/#root` 100% width/height, `overflow: hidden`, background near-black (e.g. `#07090c`), light-on-dark text.
- Layout:
  - **Top (or a non-scrolling strip always visible):** disclaimer text (full frozen paragraph). May be small (`12px`) but readable and not clipped.
  - **Center:** empty PPI placeholder (`id` = `ppi-placeholder` from T00-03), flex-grow, distinct from chrome (e.g. inner border / CRT-green `#7cff6b` at low opacity, centered label `PPI`).
  - **Bottom:** command line — a text input spanning the width, submit on Enter.
- Echo: last submitted line appears in an echo/status line (above the input or in a one-line strip). Do **not** call `parseCommand` or `applyCommand`.
- Boot: `createApp({ speech: new NullSpeechPort() })`, `loadKdem()`, `log.append({ type: "session.started", scenarioId: kdem.id, atSimMs: 0, atWallMs })`.
- `document.title` = `ATC-SIM — KDEM`.
- Remove any remaining Vite scaffolding.
- Vitest: echo reducer / `submitCommandLine` pure function tested without DOM if possible; `session.started` on boot tested via `createApp` + a `bootSession(app, scenario)` helper.
- Manual pass of the visual exit criteria.

## Out of scope

- Parsing `H270`, callsign matching, Readbacks, TTS, PTT.
- Drawing maps, range rings, Datablocks, Tracks, aircraft.
- Scope keys (CRC), altitude filters, strips, settings pages.
- `stepWorld`, rAF, sim clock ticking.
- Calling `speech.transcribe` or `speech.synthesize`.
- Replacing disclaimer wording.

## Implementation notes

### Pure echo helper (test this)

```ts
export function echoCommandLine(input: string): string {
  return input.trim();
}
```

Empty/whitespace submit: do not change the last echo (or set echo to `""` — pick **ignore empty submit** and test it).

### `bootSession`

```ts
export function bootSession(
  handles: AppHandles,
  scenario: Scenario,
  wallMs: number,
): void {
  handles.log.append({
    type: "session.started",
    atSimMs: 0,
    atWallMs: wallMs,
    scenarioId: scenario.id,
  });
}
```

Call from `main.tsx` after `createApp` + `loadKdem()`. Tests call `bootSession` with a fake clock.

### React structure (suggested)

```
src/main.tsx          createApp, loadKdem, bootSession, createRoot
src/ui/shell.tsx      layout
src/ui/disclaimer.tsx reads DISCLAIMER_COPY constant
src/ui/command-line.tsx
src/ui/disclaimer-copy.ts  exact T00-01 string
src/scope/ppi-placeholder.tsx  empty region
src/index.css         full viewport dark
```

`disclaimer-copy.ts` must export the T00-01 paragraph with identical characters. A Vitest test can read `docs/DISCLAIMER.md` and assert the TS constant is contained in that file (strip fences) **or** duplicate the string in the test — prefer asserting `DISCLAIMER_COPY ===` the frozen string literal from T00-01 in this ticket.

### Accessibility / focus

On load, focus the command line (`autoFocus`). Tab order: input is reachable.

### Console errors

No React key warnings, no failed `GET` of missing assets, no “NullSpeechPort cannot transcribe” (because nothing calls it).

### `createApp` mount

Either:

- `main.tsx` mounts `<Shell app={handles} scenario={kdem} />`, or
- `createApp` grows a `mount(root: HTMLElement)` method.

Prefer **main mounts React**; `createApp` stays DI (speech + log) so core tests stay DOM-free.

## Acceptance criteria

- [ ] **AC1 —** `npm test` exits 0.
- [ ] **AC2 —** `npm run ci` exits 0.
- [ ] **AC3 —** `DISCLAIMER_COPY` equals the T00-01 frozen paragraph character-for-character (Vitest).
- [ ] **AC4 —** `bootSession` appends exactly one `session.started` with `scenarioId === "KDEM"` (Vitest).
- [ ] **AC5 —** `echoCommandLine("  H270  ") === "H270"` and `echoCommandLine("   ")` does not throw; empty trim is ignored by the submit handler (Vitest).
- [ ] **AC6 —** Command-line submit path does not import or call `parseCommand` / `applyCommand` (implementation review; grep `src/ui` for `parseCommand`).
- [ ] **AC7 —** **Manual:** `npm run dev` — full-viewport dark UI; disclaimer visible without scrolling the PPI; PPI placeholder empty and labeled; command line at the **bottom**; typing `hello` + Enter shows `hello` echoed; DevTools console has no errors on load.
- [ ] **AC8 —** **Manual:** boot does not prompt for microphone and does not play audio.

## Test plan

- Unit: `src/ui/disclaimer-copy.test.ts`, `src/ui/echo-command-line.test.ts`, `src/app/boot-session.test.ts`.
- Integration: `npm run ci`.
- Manual: AC7, AC8 (phase exit UI).

## Suggested files

- `src/main.tsx`
- `src/app/boot-session.ts`
- `src/app/boot-session.test.ts`
- `src/ui/shell.tsx`
- `src/ui/disclaimer.tsx`
- `src/ui/disclaimer-copy.ts`
- `src/ui/disclaimer-copy.test.ts`
- `src/ui/command-line.tsx`
- `src/ui/echo-command-line.ts`
- `src/ui/echo-command-line.test.ts`
- `src/scope/ppi-placeholder.tsx`
- `src/index.css`
- `index.html`
