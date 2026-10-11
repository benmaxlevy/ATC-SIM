# T02-224 FMA Browser Speech Queue

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** M\
**Depends on:** T02-222, T02-223\
**Blocks:** T02-225 through T02-228\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-224-fma-browser-speech-queue`\
**Launch:** Implement this ticket only when its prerequisites are merged on the configured feature target. Planning does not authorize execution.

## Mission

Speak FMA onset alarms exclusively through browser SpeechSynthesis, with an application-owned queue, local voice availability, selective episode cancellation and deterministic test injection.

## Research and authority

Authoritative source: Raytheon STARS TCW/TDW Operator's Manual, TI 6191.409, Revision 30, supplied at `/home/ben/Documents/stars refs/full_manual.pdf`.

- Section 2.16.4 pp. 2-107–108 (PDF 163–164): ACID WARNING/COAST/WRONG RUNWAY/CAUTION once at onset; carrier telephony or phonetic letters; no NOM speech.
- Sections 6.16.6–7 pp. 6-135–136 (PDF 665–666): volume 1–10; changing volume and VOICE TEST utter Test.
- Web Speech API specification, https://webaudio.github.io/web-speech-api/ : localService, voiceschanged, utterance volume and global cancel queue semantics.
Explicit user override: browser SpeechSynthesis is the sole FMA backend. This exception does not change pilot STT/TTS defaults or authorize cloud SDKs.

Read `AGENTS.md`, the active FMA section of `phases/SWARM.md`, current phase README/AGENT, shared references/glossary/architecture/non-goals and the predecessor ticket contracts. Historical FMA exclusions are lifted only for this approved trainer feature. The user-authorized SpeechSynthesis exception is FMA-only; no radio/Command IR/Path C change is approved. Source-backed behavior and explicit trainer decisions must stay distinguishable.

## Command, state and lifecycle contract

1. Consume T02-222 onset/clear/condition-change episodes and T02-223 acknowledge/silence/inhibit events. Never generate alarms on every sweep/frame, on PREF persistence, or by reading World truth directly. No NOM utterance.
2. Utterance suffixes are exactly WARNING, COAST, WRONG RUNWAY, CAUTION. Use existing carrier telephony mapping for known carriers and standard phonetic letters/spoken digits otherwise. Do not create a facility-specific callsign table or utterance alias.
3. Use browser SpeechSynthesis only, with an injectable adapter for tests. Select an installed English localService=true voice; asynchronous voice discovery must handle voiceschanged and initially empty lists. Missing API/local voice surfaces an audio-unavailable status while alerts remain visually active. No alternate backend, self-hosted FMA TTS, Web Audio PCM synthesis, cloud service or robotic formant-filter claim.
4. Maintain a local application queue of canonical track/episode/condition items rather than placing all items into the browser's global queue. Deduplicate each episode, prioritize queued warnings over queued cautions, and retain unrelated pending items when an active utterance is canceled. Do not interrupt unrelated active speech merely because a new report repeats a warning.
5. Warning acknowledgment and caution silence-only delete pending items for the addressed episode and stop its active utterance. Mode exit, clear, inhibition, AMZ/session changes remove obsolete items. A new episode may speak once again. Guard late browser callbacks after disposal/cancel; they must not restart canceled speech or consume the next unrelated item.
6. Browser cancel() is global. Coordinate with any existing browser-speech user so canceling FMA cannot lose unrelated pending utterances; do not alter the self-hosted pilot readback backend. Application queue owns at most its currently dispatched FMA utterance. DOM cleanup unregisters voice callbacks and releases the queue.
7. VOICE levels 1 through 10 map linearly to utterance volume level/10. Volume commit queues Test at the new level; VOICE TEST queues Test at current level. These are actions, not alert episodes or a test tone. Public controls are wired in T02-226; this ticket exposes scope/app actions only.
8. No operator grammar/key is added here. The app status surface reports unsupported/unavailable synthesis without throwing through simulation tick or falsely claiming the alert was spoken. Voice selection identity remains a browser detail, not a new controller preference/menu. Offline/browser behavior requires actual manual evidence.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| New NTZ warning / CST / RWY / caution episode | ACID plus exact suffix once | FMA application queue only | Repeated reports do not repeat speech; NOM silent | §2.16.4 |
| Acknowledge active warning / silence active caution | Cancel that episode's utterance | Keep unrelated queued alerts | Global cancel must not silently discard app queue | §2.16.4; user caution decision; Web Speech API |
| Caution queued, then warning queued | Warning selected before queued caution | Queue order only | No duplicate or obsolete episodes | Explicit approved queue priority |
| Volume action level 6 / Test action | Test at volume 0.6 / current volume | No alert qualification changes | Only levels 1–10 accepted by control owner | §§6.16.6–7 |
| Empty voice list then voiceschanged / no local English voice | Discover available local voice / audio unavailable status | Visual monitoring continues | No alternate backend or exception through tick | User backend override; Web Speech API |
| AMZ change/session teardown, late onend callback | No old utterance restarts | Queue and callbacks disposed | Unrelated current backend is not canceled | Explicit lifecycle |

## Files and ownership

new src/app/fma-speech.ts; src/app/create-app.ts; src/app/event-sounds.ts only for necessary central sound coordination; scope action/event adapter; shared feature acceptance with injected synthesis adapter; existing telephony helpers.

Keep `DisplayControlBar.tsx` and `renderScope.ts` thin, preserve their shipped splits and public re-exports, route DCB actions through `@scope`, and do not split `scopeKeys.ts` or the spoken pattern matcher. Use generic catalog/scenario loading and synthetic fixtures, never live airport branches.

## Acceptance criteria and tests

- [ ] **AC1 — Automated: exact text, onset deduplication, warning-before-queued-caution ordering and clear/rearm use injected synthesis events.**
- [ ] **AC2 — Automated: selective active/pending cancellation, delayed callbacks, voiceschanged, unavailable API/voice and disposal are covered without requiring OS speech in CI.**
- [ ] **AC3 — Automated: level/10 volume and both Test actions have no alert/World mutations; NOM never enters queue.**
- [ ] **AC4 — Inspection: this feature has exactly one backend, no PCM/AudioNode filtering claim, no new metered call or pilot STT/TTS fallback.**
- [ ] **AC5 — Manual: installed local voice says all four phrases and Test, volume changes audibly, cancellation works, offline state and unavailable-voice status are recorded.**
- [ ] **Gate —** Focused checks, `npm run ci`, `git diff --check` and independent supplied-manual review pass before captain starts the next wave. If `speech-api/` changes despite this feature's exclusions, stop for scope review rather than silently expanding the contract; approved speech-api changes additionally require `SPEECH_API_MOCK=1 pytest`.

Use the single synthetic `src/scope/test/fmaFidelity.integration.test.ts` across the feature. Keep additional pure units minimal (one happy path plus 2–3 meaningful edges or a parameterized numeric table); share `src/scope/test/mockCanvas.ts`. Browser/audio/manual checks are labeled manual and are never inferred from CI mocks.

## User surfaces and documentation

Document the user-authorized FMA-only SpeechSynthesis exception in docs/USER.md, phases/02-scope/README.md and a narrowly scoped note in phases/_shared/speech-port.md. Explain local voice requirement, unavailable status and no filter/authentic-vendor-voice promise; radio speech restrictions remain intact.

## Manual-review checklist

- [ ] Check the exact printed sections/pages/tables above and any relevant actual raster figure.
- [ ] Walk every contract row through entry/routing, qualification or parsing, state/effects, rejection, test evidence and named user surfaces.
- [ ] Verify trainer defaults, unavailable behavior and user overrides are not presented as published STARS algorithms.
- [ ] Confirm no unintended radio, World intent, ownership, association or geographic-measurement mutation.

## Non-goals and handoff

No self-hosted FMA TTS, alternate synthesis backend, SpeechRecognition, voice picker UI, new pilot speech service, cloud provider or formant filter.

Use one isolated ticket branch/worktree from current `feature/fma` after captain verifies prerequisites. Preserve unrelated `.worktrees/`, `:memory:.ses` and `speech-api/:memory:.ses`; never reset/clean unclear work. Commit explicit ticket paths progressively after required gates. Do not merge, spawn, push or begin another ticket. Return exactly `READY TO MERGE` or `BLOCKED`, followed by AC/test/manual evidence and actual unrun browser/audio checks. Captain owns merges and the phase STATUS entry.
