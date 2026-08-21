# Parse pipeline (v1)

One ordered list for **typed command line and PTT**. First stage that returns a complete `ParseResult` (`ok: true`, no leftover junk) wins. Record **`parseStage`**. The pilot does not care which stage won except for logs and scoring.

`source` (`"text"` | `"voice"`) is the **channel**, not the compiler. Do not keep a voice-only chain and a text-only chain.

Shared files win over phase READMEs. This file wins over older “text = tokenizer only” / “voice = A then B” wording.

## Stages (fixed order)

| # | Stage | `parseStage` | What it is |
| --- | --- | --- | --- |
| 0 | Normalize | — | Always. Cheap. Tokens like `H270` survive. See phase 3 README §3.3. |
| 1 | Typed tokenizer | `typed` | Phase 1 `parseRadioText` (`H270`, `D30`, …). |
| 2 | Path A | `spoken_a` | 7110.65-shaped English → `Instruction[]` (phase 3 grammar). |
| 3 | Path B | `spoken_b` | Conservative rewrite of English fragments → tokens → tokenizer. |
| 4 | Path C | `llm_c` | Optional `POST` on **our** `speech-api`. Off by default. |

```
raw string  (command line or transcript.text)
    │
    ▼
normalizeSpoken
    │
    ├─ typed tokenizer ok? ──────────────────────────► done  parseStage=typed
    ├─ Path A ok? ───────────────────────────────────► done  parseStage=spoken_a
    ├─ Path B ok? ───────────────────────────────────► done  parseStage=spoken_b
    ├─ Path C enabled and /parse ok + schema check? ─► done  parseStage=llm_c
    └─ miss (no throw)
```

Why this is the smallest design:

- **Typed English** (`turn left heading two seven zero` in the box) is just tokenizer miss → A. No new front-end.
- **Voice tokens** (ASR emits `H270`) are tokenizer hit. No special case.
- **Path B** stays a local salvage for messy English; not text-specific, not voice-specific.
- **Path C** is the same HTTP call for both channels, **only after a local miss**, so the 1.5 s PTT budget is unchanged on Path A hits.
- One `parseCommand`. No second radio loop. No LLM executor.

## API

Phase 1 may keep sync `parseRadioText`. From phase 3:

```ts
parseCommand(
  sourceText: string,
  opts: {
    source: "text" | "voice";
    selectedCallsign?: string | null;
    /** Default false. When true, stage 4 may fetch. */
    pathC?: boolean;
  },
): Promise<ParseResult>;
```

`ParseResult` ok branch includes `parseStage` and `callsignToken` / `instructions` as today. Preserve original `sourceText` (pre-normalize) for the `Command`.

Command line submit and the voice loop **await** this. If `pathC` is false, skip the network; the function may still be `async`.

`src/parse` stays DOM-free: Path C is `fetch` injected (`parsePathC?: (req) => Promise<PathCResponse>`), not a SpeechPort method.

## Path C (`speech-api`)

Same origin as STT/TTS (`http://127.0.0.1:8090`). **Not** a SpeechPort. **Not** a paid LLM API.

```
POST /parse
Content-Type: application/json

{ "text": string, "source": "text" | "voice", "schemaVersion": "command-ir-v0" }
```

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
| Default **off** in settings | Happy-path voice must not wait on a 7B. |
| `PARSE_MODEL_ID` unset → `/parse` is `UNAVAILABLE` (T03-13 stub OK) | Phase 3 exits without a GGUF. |
| Browser **schema-checks** `instructions` against the frozen `Instruction` union | Model must not invent types or apply intent. |
| Unknown `type`, extra keys that break the union, or empty list → treat as miss | Closed schema. |
| Timeout / network / 503 → miss, status line, typed still works | Same as speech-api down. |
| Hub (or other public) **weight download once**; inference on this process | Same self-host rule as Whisper. No OpenAI/Groq/HF Inference. |

Constrained decoding (JSON / GBNF matching the union) is preferred. A 1–3B instruct is enough; 7B is allowed if it fits GPU/CPU, not required.

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
