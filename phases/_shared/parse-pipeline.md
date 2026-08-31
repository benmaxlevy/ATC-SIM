# Parse pipeline (v1)

One ordered list for **typed command line and PTT**. First stage that returns a complete **grounded** `ParseResult` (`ok: true`, no leftover junk, identifier tokens uniquely snapped) wins. Record **`parseStage`**. The pilot does not care which stage won except for logs and scoring.

`source` (`"text"` | `"voice"`) is the **channel**, not the compiler. Do not keep a voice-only chain and a text-only chain.

Shared files win over phase READMEs. This file wins over older “text = tokenizer only” / “voice = A then B” wording.

## Stages (fixed order)

| # | Stage | `parseStage` | What it is |
| --- | --- | --- | --- |
| 0 | Normalize | — | Always. Cheap. Tokens like `H270` survive. See phase 3 README §3.3. |
| 1 | Typed tokenizer | `typed` | Phase 1 `parseRadioText` (`H270`, `D30`, …). |
| 2 | Path A | `spoken_a` | 7110.65-shaped English → `Instruction[]` (phase 3 grammar). |
| 3 | Path B | `spoken_b` | Conservative rewrite of English fragments → tokens → tokenizer. Island patterns also `spoken_b`. |
| 4 | Path C | `llm_c` | Required local `POST` on **our** `speech-api` after local stages miss. |

```
raw string  (command line or transcript.text)
    │
    ▼
normalizeSpoken
    │
    ├─ typed tokenizer ok and grounded? ─────────────► done  parseStage=typed
    ├─ Path A ok and grounded? ──────────────────────► done  parseStage=spoken_a
    ├─ Path B / island ok and grounded? ─────────────► done  parseStage=spoken_b
    ├─ Path C ready and /parse ok + schema check? ───► done  parseStage=llm_c
    └─ miss (no throw)
```

An **ungrounded or tied** catalog token on `DIRECT` / `CROSS` / `DESCEND_VIA` / `CLIMB_VIA` / `JOIN_PROCEDURE` / `CLEARED_APPROACH` / `INTERCEPT_LOCALIZER` / `EXPECT_APPROACH` converts a would-be local hit into a **miss**. Unique T03-17 floor+margin snap still counts as grounded and wins at that stage. Heading / altitude / speed / ident / say-\* / go-around hits are unchanged: they stay a local win and do not fetch Path C.

**First local grounded hit still wins.** Path C is **miss-only**: it never overrides a unique snap (`spoken_a` / `spoken_b` / `typed`).

Why this is the smallest design:

- **Typed English** (`turn left heading two seven zero` in the box) is just tokenizer miss → A. No new front-end.
- **Voice tokens** (ASR emits `H270`) are tokenizer hit. No special case.
- **Path B** stays a local salvage for messy English; not text-specific, not voice-specific.
- **Path C** is the same HTTP call for both channels, **only after a local miss**, so the 1.5 s PTT budget is unchanged on Path A hits.
- One `parseCommand`. No second radio loop. No LLM executor.

## Typed `DCT` unknown id vs spoken ungrounded miss

Typed `DCT NOPE` (a catalog-shaped token the student typed) with `pathC: false` remains an **ok-parse**. The pilot still returns `UNKNOWN_FIX` (`src/pilot/direct.test.ts`). Same idea for typed `VIA NOPE` / `X ZZZZ` / `APP ILS99`. Do not turn that into a parse miss.

Spoken / island “proceed direct Haynes” with an ungrounded or tied catalog token is a **parse miss** (`PARSE_MISS`) when Path C is off or also misses. Command line and voice share that miss: `handleRadioText` maps it to `formatRejectReadback({ reason: "PARSE" })` (“Unable, say again”). Spoken Haynes is the Path C problem, not `DCT NOPE`.

## API

Phase 1 may keep sync `parseRadioText`. From phase 3:

```ts
parseCommand(
  sourceText: string,
  opts: {
    source: "text" | "voice";
    selectedCallsign?: string | null;
    /** Explicit caller opt-in; product wiring enables it after health is ready. */
    pathC?: boolean;
  },
): Promise<ParseResult>;
```

`ParseResult` ok branch includes `parseStage` and `callsignToken` / `instructions` as today. Preserve original `sourceText` (pre-normalize) for the `Command`.

Command line submit and the voice loop **await** this. If `pathC` is false, skip the network; the function may still be `async`.

`src/parse` stays DOM-free: Path C is `fetch` injected (`parsePathC?: (req) => Promise<PathCResponse>`), not a SpeechPort method. Do not put `/parse` on `SpeechPort`.

## Path C (`speech-api`)

Same origin as STT/TTS (`http://127.0.0.1:8090`). **Not** a SpeechPort. **Not** a paid LLM API. Same `POST /parse`. No `/ground` endpoint.

```
POST /parse
Content-Type: application/json

{ "text": string, "source": "text" | "voice", "schemaVersion": "command-ir-v0", "context"? }
```

Optional `context` is prompt grounding, **not** a vector DB, **not** kinematics, n-best STT, or confidence:

- `callsigns` / `selectedCallsign` — live strip roster (`onFrequency=`). Unchanged on non-identifier misses.
- `fixes` / `approaches` / `procedures` — **retrieved candidates for this transcript** (tied cluster ∪ next-best), cap **8–16** (`MAX_PATH_C_FIXES = 16`). Never `fixRegistry.ids().slice(0, 64)` file-order padding. Empty retrieve on an identifier miss omits `fixes` (or sends `[]`); do not pad with unrelated catalog ids. A non-identifier miss (`"pizza the runway"`) still runs Path C as T03-14 without dumping file-order 64.

The browser snaps unique noisy `fixId` values onto the **listed** Path C candidates after salvage, the same way it snaps flight-number suffixes onto the roster. An id that is not in `context.fixes` / `approaches` / `procedures` is not dispatched.

Success:

```json
{
  "ok": true,
  "callsignToken": "DAL123",
  "instructions": [{ "type": "FLY_HEADING", "headingDeg": 270, "turn": "LEFT" }]
}
```

Failure / disabled: `{ "ok": false, "error": "UNAVAILABLE" | "PARSE_MISS" | "SCHEMA" }` with HTTP 200 or 503. Never 500-with-stack into the tick.

| Rule | Why |
| --- | --- |
| Default **on** after `/health.parse === "ready"` | Every local miss gets constrained local salvage; users may opt out. |
| `PARSE_MODEL_ID` absent/empty → default Qwen3 4B GGUF | Speech service downloads required local weights at setup. |
| Browser **schema-checks** `instructions` against the frozen `Instruction` union | Model must not invent types or apply intent. |
| Unknown `type` (e.g. `CHAT`), extra keys that break the union, or empty list → treat as miss | Closed schema. |
| Timeout / network / 503 → miss, status line, typed still works | Same as speech-api down. |
| Hub (or other public) **weight download once**; inference on this process | Same self-host rule as Whisper. No OpenAI/Groq/HF Inference. |
| Prompt: listed ids only | Model must not pick an unlisted fix / procedure / approach. |

Constrained decoding (JSON / GBNF matching the union) is required. Default is Qwen3 4B Q4_K_M; it must fit available local GPU/CPU resources.

## Analog vs trainer (R01)

**R01** JO 7110.65 radio communications: official terms include **readback**, **cleared approach**, **direct**, **via**. Unique local snap (`spoken_a` / `spoken_b` / `typed`) remains the analog phraseology path — Haynes → `HAINZ` when retrieve finds a unique winner with margin.

**Trainer delta:** Path C is **nonstandard salvage** after a local miss (`parseStage: "llm_c"`). It is not 7110.65-complete NLU. Grade it as nonstandard in the scoring table. Do not treat an LLM guess as phraseology compliance.

## Scoring (phase 5)

Grade **`parseStage`**, not a second parse:

| `parseStage` | Phraseology |
| --- | --- |
| `typed` and `source === "text"` | `canonical` / `typed` |
| `typed` and `source === "voice"` | `nonstandard` / `tokens_on_voice` |
| `spoken_a` | `canonical` / `spoken_a` (including English **typed** in the command line) |
| `spoken_b` | `nonstandard` / `spoken_b` |
| `llm_c` | `nonstandard` / `llm_c` |

The checker must not call `/parse`.

## Non-goals

- LLM as pilot, chat, or intent applier (`non-goals.md`).
- Replacing A with a model.
- Path C in the Vite bundle or as the default quality path.
- Teaching the **tokenizer** English (A already owns English).
- A second `/ground` LLM that only rewrites names. Always-on LLM after STT.
