# Launch an implementation agent

## Swarm (preferred for a long unattended run)

Paste [`SWARM.md`](SWARM.md) into a **new** agent. That agent only orchestrates. Captains spawn ticket workers (max 3). **Current swarm config is T02-14–21 TCW polish** (STARS-like glass). Phases 0–2 original exit are already done; do not start voice. Leaf prompt: [`SWARM-TICKET-WORKER.md`](SWARM-TICKET-WORKER.md). Captain: [`SWARM-CAPTAIN.md`](SWARM-CAPTAIN.md). Status: [`SWARM-STATUS.md`](SWARM-STATUS.md).

## Solo one phase


Each phase is a self-contained briefing. Do not start phase N until the previous phase README **Phase exit** checklist is green (exception: phase 3 may start after phase 1; phase 2 preferred).

## Whole phase

1. Open `phases/NN-name/AGENT.md`.
2. Copy the entire file.
3. Paste into a **new** agent as the full prompt.
4. The agent implements tickets **in the order listed in that AGENT.md**, checks off ACs in the ticket files, and **stops at phase exit**.
5. Git: branch `ticket/<id>-<slug>` off `master`, commit in slices, merge `--no-ff` into `master` when that ticket’s ACs are done, then start the next ticket from `master`. See `.cursor/rules/ticket-git-workflow.mdc`.

| Start here | Paste this |
| --- | --- |
| First code | [`00-slice/AGENT.md`](00-slice/AGENT.md) |
| First playable | [`01-closed-loop/AGENT.md`](01-closed-loop/AGENT.md) |
| STARS-like look | [`02-scope/AGENT.md`](02-scope/AGENT.md) |
| Microphone | [`03-voice/AGENT.md`](03-voice/AGENT.md) |
| ILS / STAR / alerts | [`04-procedures/AGENT.md`](04-procedures/AGENT.md) |
| Scoring / replay | [`05-training/AGENT.md`](05-training/AGENT.md) |

Phase 3 AGENT.md skips `T03-11` (whisper-wasm) and `T03-14` (Path C) unless you ask. `T03-04` (Web Speech) is opt-in. Voice STT/TTS is **our** `speech-api` (T03-13), not a paid vendor. Phase 4 wind (`T04-11`) is optional for exit.

## Single ticket

Paste the ticket file plus:

```
Implement only this ticket. Obey phases/_shared/ (shared files win).
Read phases/_shared/references.md and this ticket's Research section before naming UI strings.
Check off ACs in the ticket file. Do not start downstream tickets.
Do not commit unless I ask.
```

Ticket paths: `phases/NN-name/tickets/TNN-xx-….md`.

## Contracts the agent must read

Always include (or tell the agent to read):

- `phases/_shared/glossary.md`
- `phases/_shared/references.md` — **especially phase 2 (scope) and any phraseology ticket.** Open the linked 7110.65 / CRC / vice docs or use the Search fallbacks. Use official words (range, datablock, leader, Mode C). Never zoom/nametag/sprite in UI.
- `phases/_shared/architecture.md`
- `phases/_shared/command-ir.md`
- `phases/_shared/parse-pipeline.md`
- `phases/_shared/speech-port.md`
- `phases/_shared/non-goals.md`
- The phase `README.md`

## Parallelism

| Safe in parallel | Not parallel |
| --- | --- |
| Phase 2 (scope) and phase 3 (voice) after phase 1 exits | Two agents on the same ticket |
| T00-04 coords and T00-06 IR types after T00-03 (if you split phase 0) | Phase 5 before 3 **and** 4 |
| | Parser work in phase 1 while phase 0 is unfinished |

Prefer **one agent per phase**, sequential. Split only when a phase AGENT.md says two tickets have no file overlap.
