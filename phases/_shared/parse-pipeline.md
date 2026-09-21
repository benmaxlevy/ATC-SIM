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

An **ungrounded or tied** catalog token on `DIRECT` / `CROSS` / `DESCEND_VIA` / `CLIMB_VIA` / `JOIN_PROCEDURE` / `CLEARED_APPROACH` / `INTERCEPT_LOCALIZER` / `EXPECT_APPROACH` converts a would-be local hit into a **miss**. Tactical fix grounding and IFR route-window grounding share one ranked catalog matcher: exact, spoken-alias, folded, then unique Levenshtein-distance-1 candidates are deterministic; distance-2 candidates are retrieval-only Path C evidence. Unique T03-17 floor+margin snap still counts as grounded and wins at that stage. Heading / altitude / speed / delete speed restrictions / ident / say-* / go-around hits are unchanged: they stay a local win and do not fetch Path C.

`CAPP` and spoken `cancel approach clearance` emit the zero-argument
`CANCEL_APPROACH` instruction. It must be the first instruction and may occur
only once. Later ordinary heading/altitude/speed instructions retain source
order; a later approach expectation, clearance, localizer intercept, or
`GO_AROUND` is `BAD_CLEARANCE`. `CAPP` never consumes an approach ID, and
`cancel approach` without `clearance` remains `PARSE_MISS`. Path C uses the
same closed-union and transcript-evidence rules.

## IFR clearance route windows

After an IFR clearance `VIA`, deterministic parsing scans one route window until
the next known clearance section (`ALT` / `MAINTAIN`, `CVIA`, `FREQ`, or `SQ`,
plus recognized section starters). The scanner preserves token order and
accepts arbitrarily many catalog-grounded fixes, navaids, and procedures using
the same matcher as tactical `DIRECT`.
`DIRECT` is an optional connector before a fix/navaid; without it, the matched
fix/navaid is an implicit direct segment. A terminal `DIRECT` means direct to
the separately grounded clearance limit. `AS FILED` and `RADAR VECTORS` remain
exclusive access modes. Unknown, ambiguous, malformed, incomplete, or
airport-only route tokens are a `PARSE_MISS`; the parser never mutates world
state.

Examples:

```text
VIA DIRECT
VIA SWEPT HOUND ALT 50
VIA DIRECT SWEPT DIRECT HOUND DIRECT
VIA SID1 NORTH TRANSITION HOUND
```

The first form has an empty explicit route. The next two forms produce direct
segments in order. The last form produces a catalog-grounded procedure and a
direct segment. This implicit-direct grammar is an ATC-SIM trainer extension;
it is not claimed as complete FAA phraseology.

If deterministic route parsing cannot form one unique complete chain, Path C
receives the full transcript plus only the route-window transcript spans and
per-span `fixMatches` alternatives (`span` plus canonical `id`, `kind`, score,
and method) and valid procedure transitions. A fix candidate is scoped to the
row containing its transcript span; overlapping rows are alternatives, not a
global candidate pool. Clearance-limit airport candidates are sent separately
and cannot become route segments. Path C may repair segmentation, but every
returned ID and every segment must select one listed candidate from one
transcript-supported span; selected spans must cover every non-connector token
in order. Unknown, ambiguous, malformed, invented, concatenated, omitted,
out-of-order, or airport route output is `PARSE_MISS`. `DIRECT` is optional
syntax: absent `DIRECT`, a supplied fix/navaid is still an implicit direct
segment. This is nonstandard trainer salvage (`parseStage: "llm_c"`), not
7110.65-complete NLU; the deterministic grounded path remains the phraseology
path.

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
- `airports` — separately retrieved ICAO/name/alias candidates for an
  `IFR_CLEARANCE` limit. An airport may ground `limitId`, but is never a
  `DIRECT`/`CROSS` fix and must not be merged into `fixes`.
- `routeWindow` — route-only transcript plus `fixMatches`, where each
  transcript span has only its shared-matcher candidate alternatives (`id`,
  `kind`, `score`, `method`), and catalog procedure/transition candidates. It
  is sent only for IFR route fallback and never exposes facility-wide search
  results. Airports never enter `fixMatches`.
- `clearanceLimits` — separately scoped non-airport limit candidates. Together
  with `airports`, these may ground `IFR_CLEARANCE.limitId` only.

**STT header is not the search index (T03-19).** `X-ATC-Fixes` is omitted or a tiny high-value prior (published STAR/SID words). It is not `ids().slice(0, 64)` and not the retrieve cluster. Retrieval from the transcript is Path C `context`, not the STT prompt.

The browser snaps unique noisy `fixId` values onto the **listed** Path C
candidates after salvage, the same way it snaps flight-number suffixes onto the
roster. For an IFR route, an ID must also be listed in the selected
`fixMatches` row. An id that is not in `context.fixes` / `approaches` /
`procedures` is not dispatched.

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

## Diagnostic trace architecture and telemetry

Local-only diagnostic observability for parser and STT stages operates with zero parse behavior alterations, caller-originated logging, and generic instruction representation.

```
Caller (JS / TS)                                       speech-api (Python)
┌──────────────────────────────┐
│  parseCommand / voiceLoop    │
│  - Stage attempt timings     │
│  - STT latency / metadata    │
│  - Generic instructionTypes  │
└──────────────┬───────────────┘
               │ recordUtteranceTrace
               ▼
┌──────────────────────────────┐                       ┌──────────────────────────────┐
│        TraceCollector        │  POST /debug/traces   │         FastAPI Sink         │
│  - In-memory FIFO queue      ├──────────────────────►│  - Atomic batch insert      │
│  - Debounced async flush     │  (non-blocking async) │  - SQLite WAL persistence    │
└──────────────────────────────┘                       └──────────────┬───────────────┘
                                                                      │
                                                                      ▼
                                                       ┌──────────────────────────────┐
                                                       │ .local/parse-traces.sqlite   │
                                                       │ - sessions                   │
                                                       │ - utterances                 │
                                                       │ - stage_attempts             │
                                                       └──────────────┬───────────────┘
                                                                      │
                                                                      ▼
                                                       ┌──────────────────────────────┐
                                                       │       query_traces.py        │
                                                       │ - 5 diagnostic questions     │
                                                       │ - prune_traces.py retention  │
                                                       └──────────────────────────────┘
```

### 1. Caller-side logging contract

- **Caller, not callee:** All telemetry originates from the caller (the browser / JS client in `src/parse/parse-command.ts` and `src/speech/voice-loop.ts`). The `speech-api` provides only a passive SQLite ingestion sink (`POST /debug/traces`).
- **Zero parse alterations:** Tracing is read-only observability. Outputs from `parseCommand` are bit-for-bit identical whether instrumentation is enabled or disabled.
- **Non-blocking failure safety:** Trace recording and transport failures are safely absorbed and never throw into the caller, pause sim loops, or drop aircraft commands.
- **Disabled by default:** Enabled explicitly via `TraceCollectorOptions.enabled`, `localStorage.getItem("atc_parse_traces") === "1"`, or `VITE_ENABLE_PARSE_TRACES === "1"`.
- **Zero raw audio persistence:** No PCM16 samples, WAV files, base64 audio, or audio byte buffers are stored in any column. STT metadata retains only text, duration, model name, and latency.

### 2. SQLite schema

Persisted to `.local/parse-traces.sqlite` (gitignored, WAL mode):

```sql
CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    app_version TEXT NOT NULL
);

CREATE TABLE utterances (
    utterance_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    source TEXT NOT NULL,          -- 'text' | 'voice'
    stt_json TEXT,                 -- {"text": "...", "latencyMs": 142, ...}
    final_stage TEXT,              -- 'typed' | 'spoken_a' | 'spoken_b' | 'llm_c' | 'none'
    final_status TEXT NOT NULL,    -- 'hit' | 'miss' | 'rejected' | 'timeout'
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE stage_attempts (
    attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
    utterance_id TEXT NOT NULL,
    stage TEXT NOT NULL,           -- 'typed' | 'spoken_a' | 'spoken_b' | 'llm_c' | 'stt'
    status TEXT NOT NULL,          -- 'hit' | 'miss' | 'rejected' | 'skipped'
    reason TEXT,                   -- 'prior_hit' | 'not_eligible' | 'syntax_miss' | 'ungrounded_tokens' | 'schema_rejection' | ...
    elapsed_ms REAL NOT NULL,
    result_json TEXT,              -- {"instructionTypes": [...], ...}
    FOREIGN KEY (utterance_id) REFERENCES utterances(utterance_id) ON DELETE CASCADE
);
```

### 3. Retention policy

Retention is managed via `speech-api/prune_traces.py`:

```bash
# Keep at most 30 days of traces and prune excess beyond 50,000 utterances
python -m prune_traces --days 30 --max-utterances 50000
```

### 4. Diagnostic queries (`speech-api/query_traces.py`)

Answers the 5 core diagnostic questions against `.local/parse-traces.sqlite`:

1. **Failure root cause breakdown:** Groups failed utterances into primary failure stages (`stt_empty_or_low_prob`, `typed_syntax`, `spoken_a_grammar`, `ungrounded_catalog_token`, `path_b_rewrite_miss`, `path_c_rejection`).
2. **Path B rescue rate:** Ratio of utterances where `spoken_a` was a `miss` and `spoken_b` was a `hit`.
3. **Path C guard rejections:** Counts grouped by `schema_rejection`, `evidence_rejection`, `catalog_grounding_rejection`, and `timeout`.
4. **Command miss rate ranking:** Utterances grouped by generic instruction type (`FLY_HEADING`, `ALTITUDE`, etc., dynamically extracted via `json_each`) showing hit vs miss percentages without hardcoded command discriminants.
5. **Latency distribution:** p50, p90, and p99 elapsed milliseconds broken down by stage (`stt`, `typed`, `spoken_a`, `spoken_b`, `llm_c`), excluding skipped attempts.

```bash
# Full human-readable summary
python -m query_traces --summary

# Machine-readable JSON output
python -m query_traces --summary --json

# Specific questions
python -m query_traces --failure-root-causes
python -m query_traces --rescue-rate
python -m query_traces --guard-rejections
python -m query_traces --command-miss-rates
python -m query_traces --latencies
```

### 5. Enabling trace collection

Trace collection is **disabled by default** to avoid unexpected disk I/O and telemetry overhead. You can enable it via browser storage, environment variables, or programmatically:

#### A. Browser console (immediate runtime toggle)

Open your browser's Developer Tools (F12) console on the simulator page and run:

```javascript
// Enable trace recording and async flushing
localStorage.setItem("atc_parse_traces", "1");

// Disable trace recording
localStorage.removeItem("atc_parse_traces");
```

Traces start recording on the next command or voice transmission immediately; no server restart required.

#### B. Build-time / environment variable

When launching the Vite development server:

```bash
# Enable in .env or shell
VITE_ENABLE_PARSE_TRACES=1 npm run dev

# Optional: customize trace sink endpoint (defaults to http://127.0.0.1:8090/debug/traces)
VITE_TRACE_URL=http://127.0.0.1:8090/debug/traces
```

#### C. Programmatic toggle

```typescript
import { getTraceCollector } from "@/parse/trace";

// Enable or disable at runtime
getTraceCollector().enable();
getTraceCollector().disable();
getTraceCollector().setEnabled(true);
```

#### D. Verifying active trace collection

1. **Browser Network tab**: Filter by `/debug/traces` to see debounced batch `POST` requests returning `{ "ok": true, "count": N }`.
2. **Database inspection**: Run the CLI query tool to inspect collected traces:
   ```bash
   python3 speech-api/query_traces.py --summary
   ```

## Non-goals

- LLM as pilot, chat, or intent applier (`non-goals.md`).
- Replacing A with a model.
- Path C in the Vite bundle or as the default quality path.
- Teaching the **tokenizer** English (A already owns English).
- A second `/ground` LLM that only rewrites names. Always-on LLM after STT.
- Streaming telemetry to third-party cloud analytics or unhosted services.

