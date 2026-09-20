import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parseCommand } from "../parse-command";
import { TraceCollector, setTraceCollector } from "../trace";
import { createVoiceLoop } from "../../speech/voice-loop";
import type { AudioClip, SpeechPort, Transcript } from "../../speech";

function createMockCollector(): TraceCollector {
  return new TraceCollector({ enabled: true });
}

function sampleClip(): AudioClip {
  return {
    sampleRate: 16000,
    channels: 1,
    pcm16: new Int16Array(1600), // 100ms
  };
}

describe("Caller parse pipeline and voice loop stage instrumentation (T03-29)", () => {
  beforeEach(() => {
    setTraceCollector(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("AC1 — Parse outputs are bit-for-bit identical with instrumentation enabled vs disabled", async () => {
    const commands = [
      "H270",
      "A050",
      "Delta 123 turn left heading 270",
      "Speedbird 456 climb and maintain 5000",
      "NOT A VALID COMMAND AT ALL",
    ];

    const collector = createMockCollector();

    for (const cmd of commands) {
      const disabledResult = await parseCommand(cmd, {
        source: "voice",
        selectedCallsign: "DAL123",
        traceCollector: new TraceCollector({ enabled: false }),
      });

      const enabledResult = await parseCommand(cmd, {
        source: "voice",
        selectedCallsign: "DAL123",
        traceCollector: collector,
      });

      expect(enabledResult).toEqual(disabledResult);
    }
  });

  test("AC2 — All stages recorded with timing and prior-hit skips recorded explicitly for typed stage hit", async () => {
    const collector = createMockCollector();
    const result = await parseCommand("H270", {
      source: "text",
      selectedCallsign: "DAL123",
      traceCollector: collector,
    });

    expect(result.ok).toBe(true);
    const queue = collector.getQueue();
    expect(queue).toHaveLength(1);

    const entry = queue[0]!;
    expect(entry.utterance.finalStage).toBe("typed");
    expect(entry.utterance.finalStatus).toBe("hit");
    expect(entry.utterance.source).toBe("text");

    const stages = entry.stageAttempts;
    expect(stages).toHaveLength(4);

    // typed hit
    expect(stages[0]!.stage).toBe("typed");
    expect(stages[0]!.status).toBe("hit");
    expect(stages[0]!.reason).toBeNull();
    expect(stages[0]!.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(stages[0]!.resultJson).toMatchObject({
      instructionCount: 1,
      instructionTypes: ["FLY_HEADING"],
      callsignToken: "DAL123",
    });

    // spoken_a skipped
    expect(stages[1]!.stage).toBe("spoken_a");
    expect(stages[1]!.status).toBe("skipped");
    expect(stages[1]!.reason).toBe("prior_hit");
    expect(stages[1]!.elapsedMs).toBe(0);

    // spoken_b skipped
    expect(stages[2]!.stage).toBe("spoken_b");
    expect(stages[2]!.status).toBe("skipped");
    expect(stages[2]!.reason).toBe("prior_hit");
    expect(stages[2]!.elapsedMs).toBe(0);

    // llm_c skipped
    expect(stages[3]!.stage).toBe("llm_c");
    expect(stages[3]!.status).toBe("skipped");
    expect(stages[3]!.reason).toBe("prior_hit");
    expect(stages[3]!.elapsedMs).toBe(0);
  });

  test("AC2 — Spoken A hit records typed: miss and skips spoken_b and llm_c with prior_hit", async () => {
    const collector = createMockCollector();
    const result = await parseCommand("Delta 123 turn left heading 270", {
      source: "voice",
      selectedCallsign: "DAL123",
      callsigns: ["DAL123"],
      traceCollector: collector,
    });

    expect(result.ok).toBe(true);
    const queue = collector.getQueue();
    expect(queue).toHaveLength(1);

    const entry = queue[0]!;
    expect(entry.utterance.finalStage).toBe("spoken_a");
    expect(entry.utterance.finalStatus).toBe("hit");

    const stages = entry.stageAttempts;
    expect(stages).toHaveLength(4);

    expect(stages[0]!.stage).toBe("typed");
    expect(stages[0]!.status).toBe("miss");
    expect(stages[0]!.elapsedMs).toBeGreaterThanOrEqual(0);

    expect(stages[1]!.stage).toBe("spoken_a");
    expect(stages[1]!.status).toBe("hit");
    expect(stages[1]!.reason).toBeNull();
    expect(stages[1]!.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(stages[1]!.resultJson).toMatchObject({
      instructionCount: 1,
      instructionTypes: ["FLY_HEADING"],
      callsignToken: "DAL123",
    });

    expect(stages[2]!.stage).toBe("spoken_b");
    expect(stages[2]!.status).toBe("skipped");
    expect(stages[2]!.reason).toBe("prior_hit");
    expect(stages[2]!.elapsedMs).toBe(0);

    expect(stages[3]!.stage).toBe("llm_c");
    expect(stages[3]!.status).toBe("skipped");
    expect(stages[3]!.reason).toBe("prior_hit");
    expect(stages[3]!.elapsedMs).toBe(0);
  });

  test("AC2 — Path C not-eligible skipped stage recorded explicitly when pathC is disabled", async () => {
    const collector = createMockCollector();
    const result = await parseCommand("completely unrecognizable babble 999", {
      source: "voice",
      selectedCallsign: "DAL123",
      pathC: false,
      traceCollector: collector,
    });

    expect(result.ok).toBe(false);
    const queue = collector.getQueue();
    expect(queue).toHaveLength(1);

    const entry = queue[0]!;
    expect(entry.utterance.finalStage).toBe("none");
    expect(entry.utterance.finalStatus).toBe("miss");

    const stages = entry.stageAttempts;
    expect(stages).toHaveLength(4);

    expect(stages[0]!.stage).toBe("typed");
    expect(stages[0]!.status).toBe("miss");

    expect(stages[1]!.stage).toBe("spoken_a");
    expect(stages[1]!.status).toBe("miss");

    expect(stages[2]!.stage).toBe("spoken_b");
    expect(stages[2]!.status).toBe("miss");

    expect(stages[3]!.stage).toBe("llm_c");
    expect(stages[3]!.status).toBe("skipped");
    expect(stages[3]!.reason).toBe("not_eligible");
    expect(stages[3]!.elapsedMs).toBe(0);
  });

  test("AC3 — Path C timeout recorded as rejected with candidate counts", async () => {
    const collector = createMockCollector();
    const mockParsePathC = vi.fn().mockImplementation(async () => {
      const err = new Error("Request timed out after 3000ms");
      err.name = "TimeoutError";
      throw err;
    });

    const result = await parseCommand("radio check pizza the runway", {
      source: "voice",
      selectedCallsign: "DAL123",
      callsigns: ["DAL123"],
      fixes: [
        { id: "FOO", kind: "FIX" },
        { id: "BAR", kind: "FIX" },
      ],
      pathC: true,
      parsePathC: mockParsePathC,
      traceCollector: collector,
    });

    expect(result.ok).toBe(false);
    const queue = collector.getQueue();
    expect(queue).toHaveLength(1);

    const entry = queue[0]!;
    expect(entry.utterance.finalStage).toBe("none");
    expect(entry.utterance.finalStatus).toBe("timeout");

    const llmAttempt = entry.stageAttempts.find((s) => s.stage === "llm_c")!;
    expect(llmAttempt).toBeDefined();
    expect(llmAttempt.status).toBe("rejected");
    expect(llmAttempt.reason).toBe("timeout");
    expect(llmAttempt.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(llmAttempt.resultJson).toMatchObject({
      fixesCount: expect.any(Number),
      proceduresCount: expect.any(Number),
      approachesCount: expect.any(Number),
      airportsCount: expect.any(Number),
      candidateCounts: {
        fixesCount: expect.any(Number),
        proceduresCount: expect.any(Number),
        approachesCount: expect.any(Number),
        airportsCount: expect.any(Number),
      },
      reason: "timeout",
    });
  });

  test("AC3 — Path C schema rejection recorded with candidate counts", async () => {
    const collector = createMockCollector();
    // Return empty / invalid schema output
    const mockParsePathC = vi.fn().mockResolvedValue({
      ok: true,
      callsignToken: "DAL123",
      instructions: [],
    });

    const result = await parseCommand("radio check pizza the runway", {
      source: "voice",
      selectedCallsign: "DAL123",
      callsigns: ["DAL123"],
      fixes: [{ id: "FOO", kind: "FIX" }],
      pathC: true,
      parsePathC: mockParsePathC,
      traceCollector: collector,
    });

    expect(result.ok).toBe(false);
    const queue = collector.getQueue();
    expect(queue).toHaveLength(1);

    const entry = queue[0]!;
    expect(entry.utterance.finalStage).toBe("none");
    expect(entry.utterance.finalStatus).toBe("rejected");

    const llmAttempt = entry.stageAttempts.find((s) => s.stage === "llm_c")!;
    expect(llmAttempt.status).toBe("rejected");
    expect(llmAttempt.reason).toBe("schema_rejection");
    expect((llmAttempt.resultJson as Record<string, unknown>).candidateCounts).toBeDefined();
  });

  test("AC3 — Path C transcript-evidence rejection recorded with candidate counts", async () => {
    const collector = createMockCollector();
    // Path C returns instruction tokens missing required cues from transcript (drops required altitude cue)
    const mockParsePathC = vi.fn().mockResolvedValue({
      ok: true,
      callsignToken: "DAL123",
      instructions: [{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }],
    });

    const result = await parseCommand("pizza the approach", {
      source: "voice",
      selectedCallsign: "DAL123",
      callsigns: ["DAL123"],
      pathC: true,
      parsePathC: mockParsePathC,
      traceCollector: collector,
    });

    expect(result.ok).toBe(false);
    const queue = collector.getQueue();
    expect(queue).toHaveLength(1);

    const entry = queue[0]!;
    expect(entry.utterance.finalStage).toBe("none");
    expect(entry.utterance.finalStatus).toBe("rejected");

    const llmAttempt = entry.stageAttempts.find((s) => s.stage === "llm_c")!;
    expect(llmAttempt.status).toBe("rejected");
    expect(llmAttempt.reason).toBe("evidence_rejection");
    expect((llmAttempt.resultJson as Record<string, unknown>).candidateCounts).toBeDefined();
  });

  test("AC3 — Path C catalog grounding rejection recorded with candidate counts", async () => {
    const collector = createMockCollector();
    // Return fix not in the grounded catalog context
    const mockParsePathC = vi.fn().mockResolvedValue({
      ok: true,
      callsignToken: "DAL123",
      instructions: [{ type: "DIRECT", fixId: "UNLISTEDFIX" }],
    });

    const result = await parseCommand("radio check pizza the runway", {
      source: "voice",
      selectedCallsign: "DAL123",
      callsigns: ["DAL123"],
      fixes: [{ id: "FOO", kind: "FIX" }],
      pathC: true,
      parsePathC: mockParsePathC,
      traceCollector: collector,
    });

    expect(result.ok).toBe(false);
    const queue = collector.getQueue();
    expect(queue).toHaveLength(1);

    const entry = queue[0]!;
    expect(entry.utterance.finalStage).toBe("none");
    expect(entry.utterance.finalStatus).toBe("rejected");

    const llmAttempt = entry.stageAttempts.find((s) => s.stage === "llm_c")!;
    expect(llmAttempt.status).toBe("rejected");
    expect(llmAttempt.reason).toBe("catalog_grounding_rejection");
    expect((llmAttempt.resultJson as Record<string, unknown>).candidateCounts).toBeDefined();
  });

  test("AC3 & AC4 — Path C accepted hit records instruction types generically", async () => {
    const collector = createMockCollector();
    const mockParsePathC = vi.fn().mockResolvedValue({
      ok: true,
      callsignToken: "DAL123",
      instructions: [
        { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
        { type: "ALTITUDE", altitudeFt: 5000 },
      ],
    });

    const result = await parseCommand(
      "pizza the runway heading two seven zero climb to five thousand",
      {
        source: "voice",
        selectedCallsign: "DAL123",
        callsigns: ["DAL123"],
        pathC: true,
        parsePathC: mockParsePathC,
        traceCollector: collector,
      },
    );

    expect(result.ok).toBe(true);
    const queue = collector.getQueue();
    expect(queue).toHaveLength(1);

    const entry = queue[0]!;
    const winning = entry.stageAttempts.find((s) => s.status === "hit")!;
    expect(winning).toBeDefined();
    expect(winning.resultJson).toMatchObject({
      instructionCount: 2,
      instructionTypes: ["FLY_HEADING", "ALTITUDE"],
    });
  });

  test("AC4 — Generic extraction of arbitrary instruction types without hardcoding", async () => {
    const collector = createMockCollector();

    // SQUAWK
    await parseCommand("DAL123 SQ 4201", {
      source: "text",
      traceCollector: collector,
    });

    // CLEARED_APPROACH
    await parseCommand("DAL123 APP ILS27", {
      source: "text",
      approaches: [{ id: "ILS27", name: "ILS 27", runway: "27" }],
      traceCollector: collector,
    });

    const queue = collector.getQueue();
    expect(queue).toHaveLength(2);

    const squawkAttempt = queue[0]!.stageAttempts[0]!;
    expect((squawkAttempt.resultJson as Record<string, unknown>).instructionTypes).toEqual([
      "ASSIGN_SQUAWK",
    ]);

    const approachAttempt = queue[1]!.stageAttempts[0]!;
    expect((approachAttempt.resultJson as Record<string, unknown>).instructionTypes).toEqual([
      "CLEARED_APPROACH",
    ]);
  });

  test("Instrumentation failure does not alter parse result", async () => {
    const throwingCollector = new TraceCollector({ enabled: true });
    vi.spyOn(throwingCollector, "recordUtteranceTrace").mockImplementation(() => {
      throw new Error("Disk full or logger exploded");
    });

    // Valid command still returns valid parse
    const result = await parseCommand("H270", {
      source: "text",
      selectedCallsign: "DAL123",
      traceCollector: throwingCollector,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.instructions).toEqual([
        { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
      ]);
    }
  });

  test("AC5 — Voice loop attaches STT metadata, latency, duration, model to trace context", async () => {
    const collector = createMockCollector();

    const fakePort: SpeechPort = {
      id: "fake-whisper",
      async transcribe(): Promise<Transcript> {
        return {
          text: "turn left heading two seven zero",
          latencyMs: 142,
          metadata: {
            model: "whisper-base-en",
            audioDurationMs: 1200,
            inferenceLatencyMs: 130,
          },
        };
      },
      async synthesize(): Promise<AudioClip> {
        return sampleClip();
      },
    };

    const loop = createVoiceLoop({
      speechPort: fakePort,
      parseCommand,
      dispatchCommand: () => ({ accepted: true, readback: "Turning left heading 270" }),
      getSelectedCallsign: () => "DAL123",
      traceCollector: collector,
    });

    await loop.handlePttEvent({ type: "ptt-down" });
    await loop.handlePttEvent({
      type: "ptt-up",
      result: { kind: "clip", clip: sampleClip() },
    });

    const queue = collector.getQueue();
    expect(queue).toHaveLength(1);

    const entry = queue[0]!;
    expect(entry.utterance.source).toBe("voice");
    expect(entry.utterance.utteranceId).toBeDefined();
    expect(entry.utterance.finalStage).toBe("spoken_a");
    expect(entry.utterance.finalStatus).toBe("hit");

    const stt = entry.utterance.sttJson as Record<string, unknown>;
    expect(stt).toBeDefined();
    expect(stt.text).toBe("turn left heading two seven zero");
    expect(stt.latencyMs).toBe(142);
    expect(stt.audioDurationMs).toBeGreaterThan(0);
    expect(stt.model).toBe("whisper-base-en");
    expect(stt.metadata).toMatchObject({
      model: "whisper-base-en",
      inferenceLatencyMs: 130,
    });
  });
});
