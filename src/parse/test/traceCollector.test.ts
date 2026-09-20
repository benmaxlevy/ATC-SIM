import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_APP_VERSION,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_MAX_QUEUE_SIZE,
  DEFAULT_TRACE_URL,
  TRACE_STORAGE_KEY,
  TraceCollector,
  getTraceCollector,
  setTraceCollector,
  type StageAttemptTrace,
  type TraceBatchPayload,
  type UtteranceTrace,
} from "../trace";

describe("TraceCollector", () => {
  beforeEach(() => {
    vi.useRealTimers();
    setTraceCollector(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const SAMPLE_UTTERANCE: UtteranceTrace = {
    utteranceId: "utt-001",
    source: "voice",
    sttJson: { text: "turn left heading 270", confidence: 0.94 },
    finalStage: "spoken_a",
    finalStatus: "hit",
    createdAt: "2026-09-20T04:00:00.000Z",
  };

  const SAMPLE_STAGES: StageAttemptTrace[] = [
    {
      stage: "typed",
      status: "miss",
      reason: "syntax_miss",
      elapsedMs: 0.25,
      resultJson: null,
    },
    {
      stage: "spoken_a",
      status: "hit",
      reason: null,
      elapsedMs: 2.1,
      resultJson: { instructionCount: 1 },
    },
  ];

  test("AC1 — collector is disabled by default and record is a zero-allocation no-op", () => {
    const collector = new TraceCollector();
    expect(collector.isEnabled()).toBe(false);

    collector.recordUtteranceTrace(SAMPLE_UTTERANCE, SAMPLE_STAGES);
    expect(collector.getQueueDepth()).toBe(0);
    expect(collector.getQueue()).toHaveLength(0);

    // Alias also no-ops
    collector.record({ utterance: SAMPLE_UTTERANCE, stageAttempts: SAMPLE_STAGES });
    expect(collector.getQueueDepth()).toBe(0);
  });

  test("enablement resolution via options, programmatic calls, and storage flag", () => {
    const colExplicit = new TraceCollector({ enabled: true });
    expect(colExplicit.isEnabled()).toBe(true);
    colExplicit.disable();
    expect(colExplicit.isEnabled()).toBe(false);
    colExplicit.enable();
    expect(colExplicit.isEnabled()).toBe(true);
    colExplicit.setEnabled(false);
    expect(colExplicit.isEnabled()).toBe(false);

    // Test storage flag when explicit option is unset
    const storageMap = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, v),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear(),
      length: 0,
      key: () => null,
    };
    vi.stubGlobal("localStorage", mockStorage);

    const colStorage = new TraceCollector();
    expect(colStorage.isEnabled()).toBe(false);

    mockStorage.setItem(TRACE_STORAGE_KEY, "1");
    expect(colStorage.isEnabled()).toBe(true);

    mockStorage.setItem(TRACE_STORAGE_KEY, "0");
    expect(colStorage.isEnabled()).toBe(false);

    vi.unstubAllGlobals();
  });

  test("enablement resolution via VITE_ENABLE_PARSE_TRACES env", () => {
    const nodeEnv = (
      globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
    ).process?.env;
    if (!nodeEnv) return;

    const originalEnv = nodeEnv.VITE_ENABLE_PARSE_TRACES;
    try {
      nodeEnv.VITE_ENABLE_PARSE_TRACES = "1";
      const collector = new TraceCollector();
      expect(collector.isEnabled()).toBe(true);
    } finally {
      if (originalEnv !== undefined) {
        nodeEnv.VITE_ENABLE_PARSE_TRACES = originalEnv;
      } else {
        delete nodeEnv.VITE_ENABLE_PARSE_TRACES;
      }
    }
  });

  test("AC2 — bounded queue and FIFO eviction when exceeding max capacity", () => {
    const collector = new TraceCollector({
      enabled: true,
      maxQueueSize: 5,
      flushIntervalMs: 0, // disable auto-flush timer
    });

    for (let i = 0; i < 7; i++) {
      collector.recordUtteranceTrace({
        utteranceId: `utt-${i}`,
        source: "voice",
        finalStatus: "hit",
        createdAt: `2026-09-20T04:00:0${i}.000Z`,
      });
    }

    expect(collector.getQueueDepth()).toBe(5);
    const queue = collector.getQueue();
    // Earliest two (utt-0 and utt-1) were evicted FIFO
    expect(queue.map((e) => e.utterance.utteranceId)).toEqual([
      "utt-2",
      "utt-3",
      "utt-4",
      "utt-5",
      "utt-6",
    ]);
  });

  test("AC2 — default 100 capacity queue bounds overflow correctly", () => {
    const collector = new TraceCollector({
      enabled: true,
      flushIntervalMs: 0,
    });
    expect(collector.maxQueueSize).toBe(DEFAULT_MAX_QUEUE_SIZE);

    for (let i = 0; i < 110; i++) {
      collector.recordUtteranceTrace({
        utteranceId: `utt-${i}`,
        source: "voice",
        finalStatus: "hit",
        createdAt: "2026-09-20T04:00:00.000Z",
      });
    }

    expect(collector.getQueueDepth()).toBe(100);
    const queue = collector.getQueue();
    expect(queue[0].utterance.utteranceId).toBe("utt-10");
    expect(queue[99].utterance.utteranceId).toBe("utt-109");
  });

  test("AC3 — flush() batches enqueued traces and issues POST to endpoint matching speech-api Pydantic model", async () => {
    let sentUrl: string | undefined;
    let sentMethod: string | undefined;
    let sentHeaders: Record<string, string> | undefined;
    let sentBody: string | undefined;

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sentUrl = String(input);
      sentMethod = init?.method;
      sentHeaders = init?.headers as Record<string, string>;
      sentBody = typeof init?.body === "string" ? init.body : undefined;
      return new Response(JSON.stringify({ ok: true, inserted: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const collector = new TraceCollector({
      enabled: true,
      flushIntervalMs: 0,
      fetch: mockFetch,
      sessionId: "test-session-123",
      startedAt: "2026-09-20T00:00:00.000Z",
      appVersion: "1.2.3",
    });

    collector.recordUtteranceTrace(SAMPLE_UTTERANCE, SAMPLE_STAGES);
    expect(collector.getQueueDepth()).toBe(1);

    const success = await collector.flush();
    expect(success).toBe(true);
    expect(collector.getQueueDepth()).toBe(0);

    expect(sentUrl).toBe(DEFAULT_TRACE_URL);
    expect(sentMethod).toBe("POST");
    expect(sentHeaders?.["Content-Type"]).toBe("application/json");

    expect(sentBody).toBeDefined();
    const payload = JSON.parse(sentBody!) as TraceBatchPayload;

    // Verify session matches Pydantic SessionTrace model
    expect(payload.session).toEqual({
      sessionId: "test-session-123",
      startedAt: "2026-09-20T00:00:00.000Z",
      appVersion: "1.2.3",
    });

    // Verify utterances match Pydantic UtteranceEntry model
    expect(payload.utterances).toHaveLength(1);
    const entry = payload.utterances[0];
    expect(entry.utterance).toEqual({
      utteranceId: "utt-001",
      sessionId: "test-session-123", // populated from collector session if omitted
      source: "voice",
      sttJson: { text: "turn left heading 270", confidence: 0.94 },
      finalStage: "spoken_a",
      finalStatus: "hit",
      createdAt: "2026-09-20T04:00:00.000Z",
    });
    expect(entry.stageAttempts).toHaveLength(2);
    expect(entry.stageAttempts[0]).toEqual(SAMPLE_STAGES[0]);
    expect(entry.stageAttempts[1]).toEqual(SAMPLE_STAGES[1]);
  });

  test("AC3 — empty flush is a no-op that returns false without calling fetch", async () => {
    const mockFetch = vi.fn();
    const collector = new TraceCollector({
      enabled: true,
      fetch: mockFetch,
    });

    const result = await collector.flush();
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("AC4 — network timeout, HTTP 503, or connection refusal drops traces safely without throwing", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    // 1. HTTP 503 response
    const mock503 = vi.fn(async () => new Response("Service Unavailable", { status: 503 }));
    const col503 = new TraceCollector({
      enabled: true,
      fetch: mock503,
      flushIntervalMs: 0,
    });
    col503.record(SAMPLE_UTTERANCE);
    expect(col503.getQueueDepth()).toBe(1);

    const res503 = await col503.flush();
    expect(res503).toBe(false);
    // Dropped failed batch gracefully:
    expect(col503.getQueueDepth()).toBe(0);
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining("HTTP 503"));

    debugSpy.mockClear();

    // 2. Network connection failure / TypeError: Failed to fetch
    const mockNetError = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const colNet = new TraceCollector({
      enabled: true,
      fetch: mockNetError,
      flushIntervalMs: 0,
    });
    colNet.record(SAMPLE_UTTERANCE);

    let threw = false;
    let resNet = false;
    try {
      resNet = await colNet.flush();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(resNet).toBe(false);
    expect(colNet.getQueueDepth()).toBe(0);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("flush network error"),
      expect.any(TypeError),
    );

    debugSpy.mockClear();

    // 3. Network error with Error("ECONNREFUSED")
    const mockConnRefused = vi.fn(async () => {
      const err = new Error("connect ECONNREFUSED 127.0.0.1:8090");
      (err as unknown as { code: string }).code = "ECONNREFUSED";
      throw err;
    });
    const colConn = new TraceCollector({
      enabled: true,
      fetch: mockConnRefused,
      flushIntervalMs: 0,
    });
    colConn.record(SAMPLE_UTTERANCE);

    const resConn = await colConn.flush();
    expect(resConn).toBe(false);
    expect(colConn.getQueueDepth()).toBe(0);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("flush network error"),
      expect.any(Error),
    );
  });

  test("concurrent flush calls safely serialize and do not duplicate batches", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response("{}", { status: 200 });
    });

    const collector = new TraceCollector({
      enabled: true,
      fetch: mockFetch,
      flushIntervalMs: 0,
    });

    collector.record(SAMPLE_UTTERANCE);

    const [flush1, flush2] = await Promise.all([collector.flush(), collector.flush()]);

    expect(callCount).toBe(1);
    expect(flush1).toBe(true);
    expect(flush2).toBe(false);
    expect(collector.getQueueDepth()).toBe(0);
  });

  test("items enqueued while a flush is in-flight are retained for the next flush", async () => {
    let resolveFirstFetch!: (r: Response) => void;
    const firstFetchPromise = new Promise<Response>((res) => {
      resolveFirstFetch = res;
    });

    const mockFetch = vi
      .fn()
      .mockReturnValueOnce(firstFetchPromise)
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const collector = new TraceCollector({
      enabled: true,
      fetch: mockFetch,
      flushIntervalMs: 0,
    });

    collector.record({
      utteranceId: "utt-first",
      source: "voice",
      finalStatus: "hit",
      createdAt: "2026-09-20T04:00:00.000Z",
    });

    // Start first flush (in flight)
    const p1 = collector.flush();

    // Enqueue second item while first is in flight
    collector.record({
      utteranceId: "utt-second",
      source: "voice",
      finalStatus: "hit",
      createdAt: "2026-09-20T04:00:01.000Z",
    });

    expect(collector.getQueueDepth()).toBe(1);

    // Finish first fetch
    resolveFirstFetch(new Response("{}", { status: 200 }));
    const res1 = await p1;
    expect(res1).toBe(true);

    // Second item should still be queued
    expect(collector.getQueueDepth()).toBe(1);
    expect(collector.getQueue()[0].utterance.utteranceId).toBe("utt-second");

    // Flush second item
    const res2 = await collector.flush();
    expect(res2).toBe(true);
    expect(collector.getQueueDepth()).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("manual reset clears queue and cancels pending timers", () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn();

    const collector = new TraceCollector({
      enabled: true,
      fetch: mockFetch,
      flushIntervalMs: 1000,
    });

    collector.record(SAMPLE_UTTERANCE);
    expect(collector.getQueueDepth()).toBe(1);

    collector.reset();
    expect(collector.getQueueDepth()).toBe(0);

    // Advancing past timer should not trigger fetch
    vi.advanceTimersByTime(2000);
    expect(mockFetch).not.toHaveBeenCalled();

    collector.destroy();
  });

  test("auto-flush debounced / scheduled timer triggers flush", async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn(async () => new Response("{}", { status: 200 }));

    const collector = new TraceCollector({
      enabled: true,
      fetch: mockFetch,
      flushIntervalMs: 500,
    });

    collector.record(SAMPLE_UTTERANCE);
    expect(collector.getQueueDepth()).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();

    // Advance time to trigger timer
    await vi.advanceTimersByTimeAsync(500);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(collector.getQueueDepth()).toBe(0);

    collector.destroy();
  });

  test("global singleton accessor functions getTraceCollector and setTraceCollector", () => {
    const c1 = getTraceCollector();
    expect(c1).toBeInstanceOf(TraceCollector);
    const c2 = getTraceCollector();
    expect(c1).toBe(c2);

    const custom = new TraceCollector({ enabled: true });
    setTraceCollector(custom);
    expect(getTraceCollector()).toBe(custom);

    setTraceCollector(null);
    expect(getTraceCollector()).not.toBe(custom);
  });

  test("defaults verify constants", () => {
    const c = new TraceCollector();
    expect(c.endpointUrl).toBe(DEFAULT_TRACE_URL);
    expect(c.maxQueueSize).toBe(DEFAULT_MAX_QUEUE_SIZE);
    expect(c.flushIntervalMs).toBe(DEFAULT_FLUSH_INTERVAL_MS);
    expect(c.getSession().appVersion).toBe(DEFAULT_APP_VERSION);
    expect(c.getSession().sessionId).toMatch(/^sess-|[0-9a-f-]{36}/);
  });
});
