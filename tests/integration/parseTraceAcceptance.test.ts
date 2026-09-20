/**
 * End-to-end trace acceptance and diagnostic integration test (T03-30).
 *
 * Validates:
 * 1. End-to-end trace collection flow from caller-side parseCommand to SQLite sink.
 * 2. Unaltered parse outputs: instrumentation enabled vs disabled yields bit-for-bit identical results.
 * 3. Realistic utterance flow: typed hit, spoken A hit, spoken B rescue,
 *    ungrounded catalog miss, Path C hit, Path C guard rejection.
 * 4. Zero raw audio (pcm16, wav, byte arrays, base64) stored in any column.
 * 5. Generic handling of current, future, or synthetic command types without schema failure.
 * 6. Non-blocking error handling: network drop or sink failure during flush does not crash the caller.
 * 7. Verification that query_traces.py can query the generated SQLite database.
 */

// @ts-expect-error tsconfig has no @types/node
import { execFileSync } from "node:child_process";
// @ts-expect-error tsconfig has no @types/node
import { randomUUID } from "node:crypto";
// @ts-expect-error tsconfig has no @types/node
import fs from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import os from "node:os";
// @ts-expect-error tsconfig has no @types/node
import path from "node:path";
// @ts-expect-error tsconfig has no @types/node
import process from "node:process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { parseCommand } from "../../src/parse/parse-command";
import { TraceCollector } from "../../src/parse/trace";
import type { TraceBatchPayload } from "../../src/parse/trace/types";
import { createVoiceLoop } from "../../src/speech/voice-loop";
import type { AudioClip, SpeechPort, Transcript } from "../../src/speech";

const pythonCandidates = [
  process.env.PYTHON,
  path.join(process.cwd(), "speech-api/.venv/bin/python"),
  "python3",
  "python",
].filter(
  (p): p is string =>
    typeof p === "string" && (p === "python3" || p === "python" || fs.existsSync(p)),
);
const PYTHON_BIN = pythonCandidates[0] ?? "python3";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    app_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS utterances (
    utterance_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    source TEXT NOT NULL,
    stt_json TEXT,
    final_stage TEXT,
    final_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stage_attempts (
    attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
    utterance_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    elapsed_ms REAL NOT NULL,
    result_json TEXT,
    FOREIGN KEY (utterance_id) REFERENCES utterances(utterance_id) ON DELETE CASCADE
);
`;

function initSqliteSink(dbPath: string): void {
  const pyCode = `
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
conn.execute("PRAGMA journal_mode = WAL;")
conn.execute("PRAGMA foreign_keys = ON;")
conn.executescript(sys.stdin.read())
conn.close()
`;
  execFileSync(PYTHON_BIN, ["-c", pyCode, dbPath], {
    input: SCHEMA_SQL,
    encoding: "utf-8",
  });
}

function insertTraceBatch(dbPath: string, payload: TraceBatchPayload): void {
  const pyCode = `
import json, sqlite3, sys
db_path = sys.argv[1]
payload = json.loads(sys.stdin.read())
conn = sqlite3.connect(db_path)
conn.execute("PRAGMA foreign_keys = ON;")
with conn:
    session = payload['session']
    conn.execute(
        "INSERT OR IGNORE INTO sessions (session_id, started_at, app_version) VALUES (?, ?, ?)",
        (session['sessionId'], session['startedAt'], session['appVersion'])
    )
    for entry in payload.get('utterances', []):
        u = entry['utterance']
        session_id = u.get('sessionId') or session['sessionId']
        stt_json = u.get('sttJson')
        stt_str = stt_json if isinstance(stt_json, str) else (json.dumps(stt_json) if stt_json is not None else None)
        conn.execute("""
            INSERT INTO utterances (
                utterance_id, session_id, source, stt_json, final_stage, final_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(utterance_id) DO UPDATE SET
                session_id=excluded.session_id,
                source=excluded.source,
                stt_json=excluded.stt_json,
                final_stage=excluded.final_stage,
                final_status=excluded.final_status,
                created_at=excluded.created_at
        """, (u['utteranceId'], session_id, u['source'], stt_str, u.get('finalStage'), u['finalStatus'], u['createdAt']))
        conn.execute("DELETE FROM stage_attempts WHERE utterance_id = ?", (u['utteranceId'],))
        for sa in entry.get('stageAttempts', []):
            res_json = sa.get('resultJson')
            res_str = res_json if isinstance(res_json, str) else (json.dumps(res_json) if res_json is not None else None)
            conn.execute("""
                INSERT INTO stage_attempts (
                    utterance_id, stage, status, reason, elapsed_ms, result_json
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (u['utteranceId'], sa['stage'], sa['status'], sa.get('reason'), sa['elapsedMs'], res_str))
conn.close()
`;
  execFileSync(PYTHON_BIN, ["-c", pyCode, dbPath], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });
}

function querySqlite<T>(dbPath: string, sql: string, params: unknown[] = []): T[] {
  const pyCode = `
import json, sqlite3, sys
db_path = sys.argv[1]
sql = sys.argv[2]
params = json.loads(sys.argv[3]) if len(sys.argv) > 3 else []
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute(sql, params)
rows = [dict(r) for r in cur.fetchall()]
conn.close()
print(json.dumps(rows))
`;
  const stdout = execFileSync(PYTHON_BIN, ["-c", pyCode, dbPath, sql, JSON.stringify(params)], {
    encoding: "utf-8",
  });
  return JSON.parse(stdout) as T[];
}

function sampleAudioClip(): AudioClip {
  return {
    sampleRate: 16000,
    channels: 1,
    pcm16: new Int16Array(1600), // 100ms
  };
}

describe("Parse trace acceptance and diagnostic integration (T03-30)", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atc-trace-acceptance-"));
    dbPath = path.join(tempDir, "acceptance-traces.sqlite");
    initSqliteSink(dbPath);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  test("AC1 & AC2: End-to-end trace collection flow with bit-for-bit parse fidelity", async () => {
    // 1. Setup mock fetch to simulate POST /debug/traces sink
    const customFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as TraceBatchPayload;
      insertTraceBatch(dbPath, body);
      return new Response(JSON.stringify({ ok: true, count: body.utterances.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const collector = new TraceCollector({
      enabled: true,
      fetch: customFetch,
      flushIntervalMs: -1, // manual flush
      sessionId: "acceptance-session-1",
    });

    // Verify bit-for-bit identical parse output with tracing enabled vs disabled
    const testCases = [
      "H270",
      "DAL123 turn left heading 270",
      "heading two seven zero descend and maintain three thousand delta one two three",
      "DAL123 proceed direct UNLISTEDFIX99",
      "pizza the runway heading two seven zero climb to five thousand",
    ];

    for (const cmd of testCases) {
      const disabledRes = await parseCommand(cmd, {
        source: "voice",
        selectedCallsign: "DAL123",
        callsigns: ["DAL123"],
        fixes: [{ id: "SEMAX", kind: "FIX" }],
        traceCollector: new TraceCollector({ enabled: false }),
      });
      const enabledRes = await parseCommand(cmd, {
        source: "voice",
        selectedCallsign: "DAL123",
        callsigns: ["DAL123"],
        fixes: [{ id: "SEMAX", kind: "FIX" }],
        traceCollector: collector,
      });
      expect(enabledRes).toEqual(disabledRes);
    }
  });

  test("AC2 & AC3: Runs realistic utterances and validates SQLite storage", async () => {
    const customFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as TraceBatchPayload;
      insertTraceBatch(dbPath, body);
      return new Response(JSON.stringify({ ok: true, count: body.utterances.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const collector = new TraceCollector({
      enabled: true,
      fetch: customFetch,
      flushIntervalMs: -1,
      sessionId: "acceptance-session-2",
    });

    // 1. Typed hit
    const resTyped = await parseCommand("H270", {
      source: "text",
      selectedCallsign: "DAL123",
      traceCollector: collector,
    });
    expect(resTyped.ok).toBe(true);

    // 2. Spoken A hit
    const resSpokenA = await parseCommand("Delta 123 turn left heading 270", {
      source: "voice",
      selectedCallsign: "DAL123",
      callsigns: ["DAL123"],
      traceCollector: collector,
    });
    expect(resSpokenA.ok).toBe(true);

    // 3. Spoken B rescue (trailing callsign misses spoken_a, hits spoken_b)
    const resSpokenB = await parseCommand(
      "heading two seven zero descend and maintain three thousand delta one two three",
      {
        source: "voice",
        selectedCallsign: "DAL123",
        callsigns: ["DAL123"],
        traceCollector: collector,
      },
    );
    expect(resSpokenB.ok).toBe(true);

    // 4. Ungrounded catalog miss
    const resUngrounded = await parseCommand("DAL123 proceed direct UNLISTEDFIX99", {
      source: "voice",
      selectedCallsign: "DAL123",
      callsigns: ["DAL123"],
      fixes: [{ id: "SEMAX", kind: "FIX" }],
      pathC: false,
      traceCollector: collector,
    });
    expect(resUngrounded.ok).toBe(false);

    // 5. Path C hit
    const mockParsePathCHit = vi.fn().mockResolvedValue({
      ok: true,
      callsignToken: "DAL123",
      instructions: [{ type: "DIRECT", fixId: "SEMAX" }],
    });
    const resPathCHit = await parseCommand("DAL123 could we please head directly over to SEMAX", {
      source: "voice",
      selectedCallsign: "DAL123",
      callsigns: ["DAL123"],
      fixes: [{ id: "SEMAX", kind: "FIX" }],
      pathC: true,
      parsePathC: mockParsePathCHit,
      traceCollector: collector,
    });
    expect(resPathCHit.ok).toBe(true);

    // 6. Path C guard rejection (schema rejection)
    const mockParsePathCRej = vi.fn().mockResolvedValue({
      ok: true,
      callsignToken: "DAL123",
      instructions: [], // Empty instructions -> schema_rejection
    });
    const resPathCRej = await parseCommand("radio check pizza the runway", {
      source: "voice",
      selectedCallsign: "DAL123",
      callsigns: ["DAL123"],
      fixes: [{ id: "SEMAX", kind: "FIX" }],
      pathC: true,
      parsePathC: mockParsePathCRej,
      traceCollector: collector,
    });
    expect(resPathCRej.ok).toBe(false);

    // Flush to SQLite sink
    const flushed = await collector.flush();
    expect(flushed).toBe(true);
    expect(customFetch).toHaveBeenCalledTimes(1);

    // Verify SQLite tables
    const utterances = querySqlite<{
      utterance_id: string;
      source: string;
      final_stage: string;
      final_status: string;
      stt_json: string | null;
    }>(dbPath, "SELECT * FROM utterances ORDER BY created_at ASC");

    expect(utterances).toHaveLength(6);

    // Verify final stages & statuses
    expect(utterances[0]!.final_stage).toBe("typed");
    expect(utterances[0]!.final_status).toBe("hit");

    expect(utterances[1]!.final_stage).toBe("spoken_a");
    expect(utterances[1]!.final_status).toBe("hit");

    expect(utterances[2]!.final_stage).toBe("spoken_b");
    expect(utterances[2]!.final_status).toBe("hit");

    expect(utterances[3]!.final_stage).toBe("none");
    expect(utterances[3]!.final_status).toBe("miss");

    expect(utterances[4]!.final_stage).toBe("llm_c");
    expect(utterances[4]!.final_status).toBe("hit");

    expect(utterances[5]!.final_stage).toBe("none");
    expect(utterances[5]!.final_status).toBe("rejected");

    // Verify stage_attempts table
    const attempts = querySqlite<{
      stage: string;
      status: string;
      reason: string | null;
      elapsed_ms: number;
    }>(dbPath, "SELECT * FROM stage_attempts");
    expect(attempts.length).toBeGreaterThanOrEqual(18);

    // Verify Spoken B rescue: utterance 3 had spoken_a = miss, spoken_b = hit
    const u3Attempts = querySqlite<{ stage: string; status: string }>(
      dbPath,
      "SELECT stage, status FROM stage_attempts WHERE utterance_id = ?",
      [utterances[2]!.utterance_id],
    );
    const aAttempt = u3Attempts.find((s) => s.stage === "spoken_a");
    const bAttempt = u3Attempts.find((s) => s.stage === "spoken_b");
    expect(aAttempt?.status).toBe("miss");
    expect(bAttempt?.status).toBe("hit");

    // Verify Path C schema rejection recorded
    const u6Attempts = querySqlite<{ stage: string; status: string; reason: string }>(
      dbPath,
      "SELECT stage, status, reason FROM stage_attempts WHERE utterance_id = ? AND stage = 'llm_c'",
      [utterances[5]!.utterance_id],
    );
    expect(u6Attempts[0]?.status).toBe("rejected");
    expect(u6Attempts[0]?.reason).toBe("schema_rejection");
  });

  test("AC4: Proves no raw audio saved in any column", async () => {
    const customFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as TraceBatchPayload;
      insertTraceBatch(dbPath, body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const collector = new TraceCollector({
      enabled: true,
      fetch: customFetch,
      flushIntervalMs: -1,
    });

    // Simulate voice loop PTT recording with audio clip
    const fakePort: SpeechPort = {
      id: "fake-whisper-test",
      async transcribe(): Promise<Transcript> {
        return {
          text: "turn left heading two seven zero",
          latencyMs: 150,
          metadata: {
            model: "whisper-base-en",
            audioDurationMs: 1200,
          },
        };
      },
      async synthesize(): Promise<AudioClip> {
        return sampleAudioClip();
      },
    };

    const loop = createVoiceLoop({
      speechPort: fakePort,
      parseCommand,
      dispatchCommand: () => ({ accepted: true }),
      getSelectedCallsign: () => "DAL123",
      traceCollector: collector,
    });

    const clip = sampleAudioClip();
    await loop.handlePttEvent({ type: "ptt-down" });
    await loop.handlePttEvent({ type: "ptt-up", result: { kind: "clip", clip } });

    await collector.flush();

    // Inspect all SQLite rows and columns across utterances and stage_attempts
    const allUtterances = querySqlite<Record<string, unknown>>(dbPath, "SELECT * FROM utterances");
    const allAttempts = querySqlite<Record<string, unknown>>(
      dbPath,
      "SELECT * FROM stage_attempts",
    );

    const forbiddenAudioSubstrings = [
      "pcm16",
      'audioDurationMs" : [',
      "base64",
      "audioBytes",
      "audio_data",
      "raw_audio",
      "wave",
      "wav",
    ];

    for (const row of allUtterances) {
      for (const [, val] of Object.entries(row)) {
        if (typeof val === "string") {
          for (const forbidden of forbiddenAudioSubstrings) {
            expect(val.toLowerCase()).not.toContain(forbidden.toLowerCase());
          }
        }
      }
      // Explicitly check stt_json
      if (typeof row.stt_json === "string") {
        const parsed = JSON.parse(row.stt_json as string) as Record<string, unknown>;
        expect(parsed).not.toHaveProperty("pcm16");
        expect(parsed).not.toHaveProperty("audio");
        expect(parsed).not.toHaveProperty("clip");
        expect(parsed.text).toBe("turn left heading two seven zero");
        expect(parsed.latencyMs).toBe(150);
        expect(parsed.audioDurationMs).toBe(100); // 1600 samples @ 16kHz
      }
    }

    for (const row of allAttempts) {
      for (const [, val] of Object.entries(row)) {
        if (typeof val === "string") {
          for (const forbidden of forbiddenAudioSubstrings) {
            expect(val.toLowerCase()).not.toContain(forbidden.toLowerCase());
          }
        }
      }
    }
  });

  test("AC4: Generic storage of future or synthetic command types without schema failure", async () => {
    const customFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as TraceBatchPayload;
      insertTraceBatch(dbPath, body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const collector = new TraceCollector({
      enabled: true,
      fetch: customFetch,
      flushIntervalMs: -1,
    });

    // Manually record an utterance with synthetic future command types
    collector.recordUtteranceTrace(
      {
        utteranceId: `future-${randomUUID()}`,
        source: "voice",
        finalStage: "llm_c",
        finalStatus: "hit",
        createdAt: new Date().toISOString(),
      },
      [
        {
          stage: "llm_c",
          status: "hit",
          elapsedMs: 250,
          resultJson: {
            instructionCount: 1,
            instructionTypes: ["FUTURE_SYNTHETIC_CMD_V99"],
            callsignToken: "DAL123",
          },
        },
      ],
    );

    await collector.flush();

    // Verify row was inserted and retrieved without schema violation
    const attempts = querySqlite<{ result_json: string }>(
      dbPath,
      "SELECT result_json FROM stage_attempts WHERE stage = 'llm_c'",
    );
    const attempt = attempts[0];
    expect(attempt).toBeDefined();

    const parsed = JSON.parse(attempt!.result_json) as { instructionTypes: string[] };
    expect(parsed.instructionTypes).toEqual(["FUTURE_SYNTHETIC_CMD_V99"]);
  });

  test("Non-blocking flush resilience on network drop", async () => {
    const networkDropFetch = vi
      .fn()
      .mockRejectedValue(new Error("Connection refused or network drop"));

    const collector = new TraceCollector({
      enabled: true,
      fetch: networkDropFetch,
      flushIntervalMs: -1,
    });

    collector.recordUtteranceTrace(
      {
        utteranceId: "u_drop",
        source: "text",
        finalStage: "typed",
        finalStatus: "hit",
        createdAt: new Date().toISOString(),
      },
      [],
    );

    // Must not throw or crash on network drop; returns false on failed send
    await expect(collector.flush()).resolves.toBe(false);
  });

  test("Interoperability: query_traces.py executes cleanly against acceptance SQLite database", async () => {
    // Populate database with representative test records
    const session = {
      sessionId: "acceptance-session-interop",
      startedAt: "2026-09-20T00:00:00Z",
      appVersion: "1.0.0",
    };

    const payload: TraceBatchPayload = {
      session,
      utterances: [
        // Spoken B rescue
        {
          utterance: {
            utteranceId: "u_rescue",
            source: "voice",
            finalStage: "spoken_b",
            finalStatus: "hit",
            createdAt: "2026-09-20T00:01:00Z",
          },
          stageAttempts: [
            { stage: "spoken_a", status: "miss", reason: "syntax_miss", elapsedMs: 1.5 },
            {
              stage: "spoken_b",
              status: "hit",
              elapsedMs: 2.5,
              resultJson: { instructionTypes: ["FLY_HEADING", "ALTITUDE"] },
            },
          ],
        },
        // Path C rejection
        {
          utterance: {
            utteranceId: "u_c_rej",
            source: "voice",
            finalStage: "none",
            finalStatus: "rejected",
            createdAt: "2026-09-20T00:02:00Z",
          },
          stageAttempts: [
            { stage: "spoken_a", status: "miss", reason: "syntax_miss", elapsedMs: 1.0 },
            { stage: "spoken_b", status: "miss", reason: "syntax_miss", elapsedMs: 1.0 },
            {
              stage: "llm_c",
              status: "rejected",
              reason: "catalog_grounding_rejection",
              elapsedMs: 150.0,
            },
          ],
        },
        // Synthetic future command hit
        {
          utterance: {
            utteranceId: "u_synthetic",
            source: "text",
            finalStage: "typed",
            finalStatus: "hit",
            createdAt: "2026-09-20T00:03:00Z",
          },
          stageAttempts: [
            {
              stage: "typed",
              status: "hit",
              elapsedMs: 0.8,
              resultJson: { instructionTypes: ["GENERIC_FUTURE_COMMAND"] },
            },
          ],
        },
      ],
    };

    insertTraceBatch(dbPath, payload);

    // Run speech-api/query_traces.py via python
    const scriptPath = path.join(process.cwd(), "speech-api/query_traces.py");

    const stdout = execFileSync(PYTHON_BIN, [scriptPath, "--summary", "--json", "--db", dbPath], {
      encoding: "utf-8",
    });

    const summary = JSON.parse(stdout) as {
      failure_root_causes: Record<string, number>;
      path_b_rescue_rate: {
        spoken_a_misses: number;
        spoken_b_rescues: number;
        rescue_rate: number;
      };
      path_c_guard_rejections: Record<string, number>;
      command_miss_rates: Array<{ command: string; total: number; misses: number }>;
      latencies: Record<string, { count: number; p50: number }>;
    };

    expect(summary.path_b_rescue_rate.spoken_a_misses).toBe(2);
    expect(summary.path_b_rescue_rate.spoken_b_rescues).toBe(1);
    expect(summary.path_b_rescue_rate.rescue_rate).toBe(0.5);

    expect(summary.path_c_guard_rejections.catalog_grounding_rejection).toBe(1);

    const commands = summary.command_miss_rates.map((c) => c.command);
    expect(commands).toContain("FLY_HEADING");
    expect(commands).toContain("ALTITUDE");
    expect(commands).toContain("GENERIC_FUTURE_COMMAND");

    expect(summary.latencies.typed.count).toBe(1);
    expect(summary.latencies.spoken_a.count).toBe(2);
    expect(summary.latencies.spoken_b.count).toBe(2);
    expect(summary.latencies.llm_c.count).toBe(1);
  });
});
