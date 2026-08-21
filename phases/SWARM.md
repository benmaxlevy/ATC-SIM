# ATC-SIM swarm orchestrator — Phase 3 voice

Paste **this entire file** into a new agent. That agent is the **orchestrator**. It may run for hours. It writes almost no application code.

Workspace: `c:\Users\Ben\Documents\ATC-SIM`  
Shell: **Windows PowerShell** (not bash). Ticket commits use here-strings, not `cat <<'EOF'`.

This is the **third swarm**. Phases **0 → 1 → 2 (T02-01–13)** are already green on `master`. Do **not** redo them. Do **not** implement T02-14–21 polish in this run. Do **not** start phase 4 or 5.

---

## Config (frozen for this run)

| Key | Value |
| --- | --- |
| Goal | Implement **phase 3 voice** until `phases/03-voice/README.md` **Phase exit** is green (E1–E14). PTT → `SpeechPort` → same `parseCommand` as typed → existing pilot → TTS → radio FX |
| Quality path | **`http` → our `speech-api/`** (HF weights downloaded once, inference on our machine). Target PTT-up → audio-start **p50 < 1.5 s** on localhost/LAN |
| Skip | **T03-11** (whisper-wasm) and **T03-14** (Path C `/parse`) unless the human later names them. Not required to exit |
| Include | **T03-04** (Web Speech) as **opt-in prototype** so settings can switch `null` / `web-speech` / `http`. **Never** the default. Quality must **not** fail the phase |
| Stop | **Do not start phase 4 or 5.** No procedures, scoring, or training-session tickets |
| Do not redo | T00-*, T01-*, T02-01–T02-13. If STATUS says first swarm complete, **start phase 3**, do not replay 0→2 |
| Max ticket workers in flight | **3** |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** Every Task spawn sets `model: "cursor-grok-4.6-high"`. No `composer-2.5-fast`, no omitting `model` |
| Paid STT/TTS/LLM | **Forbidden.** No OpenAI, Deepgram, Groq, ElevenLabs, HF Inference API/Endpoints, Chrome-as-default, etc. Hub = **weight download only** (T03-13) |

If `phases/SWARM-STATUS.md` already lists phase 3 exit green with T03-* merged, **stop**. Do not redo merged tickets.

Phase 2 **polish** (T02-14–21) is **out of this swarm**. If a local video-map / DCB branch exists, leave it; do not merge it as part of voice. Voice attaches to current `master` (original T02-01–13 is enough; SpeechPort is isolated).

---

## Roles (do not collapse them)

```
YOU (orchestrator)
  └── at most ONE phase captain at a time
        └── up to 3 ticket workers
              └── no children
```

| Role | Writes app code? | Merges `master`? | Spawns |
| --- | --- | --- | --- |
| **Orchestrator** | No (except `SWARM-STATUS.md`) | No | One phase captain |
| **Phase captain** | No | **Yes** | ≤3 ticket workers |
| **Ticket worker** | Yes, **one ticket** | **No** | Nobody |

Do **not** paste `phases/03-voice/AGENT.md` into one agent. Swarm mode uses **one worker per ticket**.

Prompts to give children (read the file, then add the line):

- Captain: full `phases/SWARM-CAPTAIN.md` + **`Phase folder: phases/03-voice/`** + **`Tickets: T03-01 … T03-10, T03-12, T03-13 only (waves in SWARM.md). Skip T03-11 and T03-14`** + **`model: cursor-grok-4.6-high` on every worker**
- Worker: full `phases/SWARM-TICKET-WORKER.md` + ticket id/path + PowerShell commit here-strings + **this run’s product law** (below)

Workers **must not** end the captain’s turn. Captain **must not** `run_in_background: true` on a worker and then exit. Wait for `READY TO MERGE` / `BLOCKED`. Isolated **git worktrees** for parallel tickets (do not share one working tree). T03-01 / T03-03 / T03-13 in wave A **must** use separate worktrees.

---

## Product law (every descendant)

CRC/vNAS STARS and vice are **references for feel**. Training/entertainment only. Not a Raytheon clone. Not NAS-certified.

**Voice loop (this swarm):**

- One `parseCommand` for text **and** voice (`phases/_shared/parse-pipeline.md`). Order: **normalize → typed tokenizer → Path A → Path B**. Path C is **off** (T03-14 skipped).
- `source` is the channel (`"voice"` vs typed). `parseStage` is which compiler won. Speech must **not** construct `Instruction` objects.
- Typed tokens (`DAL123 H270`) still win at `"typed"`. After T03-03, typed English in the command line is tokenizer miss then Path A.
- **No barge-in:** ignore PTT while a readback is playing. Do not queue.
- Default PTT is backtick `` ` ``, configurable. **Do not default Caps Lock.** Ignore PTT when a text field is focused.
- Failures (mic deny, timeout, low confidence, speech-api down) → status/readback. **Never throw through the sim tick.**
- Log **PTT-up → transcript** and **PTT-up → audio-start** every utterance.
- App still boots with `NullSpeechPort`. Missing speech-api → typed commands still work. **Do not** silently fall back to a paid cloud or to Web Speech as default.

**Do (speech):**

- Quality default = `HttpSpeechPort` → **this repo’s** `speech-api/` (`VITE_STT_URL` / `VITE_TTS_URL`, default `http://127.0.0.1:8090/...`).
- Hugging Face Hub = **one-time weight download** onto disk. Inference on **our** process (CPU/GPU we control).
- Web Speech = opt-in prototype (browser vendor may transcribe in the cloud). Not default. Inaccuracy is **not** an exit fail.
- Radio FX (bandpass + light noise + compressor) on **http PCM**. `speechSynthesis` is a black box — no FX on that path.
- `src/parse` and `src/core` / `src/pilot` stay **DOM-free**. Capture/adapters/graph live in `src/speech` (and UI wiring).

**Do not:**

- Import vendor STT/TTS/LLM SDKs or point `HttpSpeechPort` at OpenAI, Deepgram, Groq, ElevenLabs, HF Inference API, Workers AI, etc.
- Always-on listen, barge-in, PTT queue, Whisper fine-tune, 500 MB model in the Vite bundle.
- Change kinematics, Command IR types, or phase 1/2 radio tokens except as a ticket requires for `source` / `parseStage`.
- Pixel-clone STARS or start phase 4 instruction types.

Research: `phases/_shared/speech-port.md`, `parse-pipeline.md`, `command-ir.md`, `references.md` **R01/R03** (7110.65). Do not use ICAO Doc 4444 as v1 grammar.

---

## Your loop (orchestrator)

1. `git checkout master` && `git status`. If dirty and it is not yours, **stop**.
2. Read `phases/SWARM-STATUS.md`. Append a **third swarm started** heading with this config table. Do not delete first-swarm (or polish) notes.
3. Confirm T01-* and T02-01–13 are on `master` (typed radio + scope). If phase 1 is missing, **BLOCKED**. Phase 2 polish (T02-14–21) is **not** required.
4. Spawn **one** captain for `phases/03-voice/` with the skip list above. Wait until `PHASE EXIT GREEN` or `BLOCKED`.
5. If `BLOCKED`: copy the note into STATUS, **stop**, tell the human. Do not start phase 4.
6. If green: tick phase 3 in STATUS, `npm test` yourself once. Write STATUS **THIRD SWARM COMPLETE — phase 3 voice**. Record speech-api p50 if measured; list leftover Chrome/mic steps; list remaining work (phases 4–5). **Stop.**

Keep STATUS updated after the phase run (not after every ticket — the captain does ticket notes).

Manual UI ACs (mic, PTT, real speech-api): captain/workers do what they can; leftover Chrome steps go in STATUS. Automated `npm test` / `npm run ci` must be green to declare the phase green. Do not invent a 1.5 s p50 pass — **measure or list as leftover**. If p50 ≥ 1.5 s, document the number; still ship the loop (README E10).

---

## Git law (overrides whole-phase AGENT.md)

- Default branch: `master`.
- Worker: `ticket/<ticket-filename-without-.md>` off **current** `master`, progressive commits, **never merge**.
- Captain: `git merge --no-ff` then delete local ticket branch, then `npm test`.
- No `--force` on `master`. No `--no-verify`. No push unless the human asked (they have not).
- After a merge, rebase or re-spawn stale in-flight workers. Isolated worktrees for same-wave tickets.
- Ignore junk branches named `list` or `ls`. Do not merge them.
- You do not merge from here unless the captain died mid-merge — then finish that one merge and stop.

PowerShell commit:

```text
git commit -m @"
T03-01: message why.

Second paragraph why.
"@
```

---

## Waves (captain must follow)

Dependencies on the ticket still win if a wave disagrees.

Phase folder: `phases/03-voice/`  
Tickets: **T03-01–10, T03-12, T03-13**. **Skip T03-11 and T03-14.**

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T03-01, T03-03, T03-13 | Phase 1 on `master` (first swarm). Three different trees: capture / parser / `speech-api/` |
| B | T03-02, T03-04, T03-05 | A. 02 needs 01+03; 04 needs 01; 05 needs 01+13 |
| C | T03-08, T03-06 | B. 08 needs 02; 06 needs 02+05 (PCM). Slot 3 empty — do **not** pull 07 early |
| D | T03-07, T03-09, T03-10 | C for 07/09 (need 06); 10 needs 05 (04 already in B). Rebase if they touch the same settings/UI files |
| E | T03-12 | D (and all P0/P1 in this run). Acceptance script + whatever CI can prove |

Do **not** skip T03-13 to “just mock STT.” `http` must talk to **our** API. Do **not** skip T03-03 and teach the tokenizer English. Do **not** make Web Speech the default in T03-10.

Ticket files / branches:

- `ticket/T03-01-capture-audioworklet-ptt` ← `phases/03-voice/tickets/T03-01-capture-audioworklet-ptt.md`
- `ticket/T03-02-transcript-to-parser` ← `phases/03-voice/tickets/T03-02-transcript-to-parser.md`
- `ticket/T03-03-spoken-phraseology-grammar` ← `phases/03-voice/tickets/T03-03-spoken-phraseology-grammar.md`
- `ticket/T03-04-web-speech-adapter` ← `phases/03-voice/tickets/T03-04-web-speech-adapter.md`
- `ticket/T03-05-http-stt-tts-adapter` ← `phases/03-voice/tickets/T03-05-http-stt-tts-adapter.md`
- `ticket/T03-06-readback-tts-playback` ← `phases/03-voice/tickets/T03-06-readback-tts-playback.md`
- `ticket/T03-07-radio-fx-graph` ← `phases/03-voice/tickets/T03-07-radio-fx-graph.md`
- `ticket/T03-08-low-confidence-error-ux` ← `phases/03-voice/tickets/T03-08-low-confidence-error-ux.md`
- `ticket/T03-09-latency-metrics-overlay` ← `phases/03-voice/tickets/T03-09-latency-metrics-overlay.md`
- `ticket/T03-10-settings-speech-backend` ← `phases/03-voice/tickets/T03-10-settings-speech-backend.md`
- `ticket/T03-12-voice-acceptance-script` ← `phases/03-voice/tickets/T03-12-voice-acceptance-script.md`
- `ticket/T03-13-self-hosted-speech-api` ← `phases/03-voice/tickets/T03-13-self-hosted-speech-api.md`

**Not this run:** `T03-11-whisper-wasm-spike`, `T03-14-optional-path-c-parse-api`.

Exit: `phases/03-voice/README.md` **Phase exit** (E1–E14). Typed `DAL123 H270` still works. Path A English works in the command line. `npm test` / `npm run ci` green. T03-12 manual leftovers (mic, real API p50) listed, not faked. E11/E12/E14: Web Speech quality, missing wasm, and Path C off are **not** failures.

---

## Burden limits

- Orchestrator: no `src/` or `speech-api/` edits except STATUS. No “I’ll just do T03-13 myself.”
- Captain: if a worker `BLOCKED` twice on the same ticket, escalate — do not become the implementer.
- Worker: one ticket, even if Size L (T03-01, T03-03, T03-05, T03-13). No bonus tickets. No T03-11/14 “while you are here.”
- Do not spawn reviewers unless `npm test` failed after merge (then one **fix** worker on `ticket/Txx-yy-fix`, still one merge lock).

Size L this run: **T03-01, T03-03, T03-05, T03-13**.

---

## Captain return (mandatory)

```
PHASE EXIT GREEN
Phase: 3 Voice (T03-01–10, 12, 13; skipped 11 and 14)
Merged: T03-01 … (list)
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome / mic / speech-api p50 or none>
Notes: <http default; Web Speech opt-in; Path C off; radio tokens still work>
```

or `PHASE EXIT BLOCKED` with reason. Do not return “wave A is running” as done.

---

## Done when

Phase 3 exit can be argued green, `npm test` green on `master`, STATUS says **third swarm complete**, `speech-api/` exists and is the **http** default, **no** paid vendor speech, T03-11/14 **not** implemented unless the human asked, and typed + spoken Path A share one parser.

Then stop. Procedures / training wait on a new paste of this file with config changed.
