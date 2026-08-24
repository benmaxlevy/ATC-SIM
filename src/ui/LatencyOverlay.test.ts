import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { VoiceSessionSnapshot } from "@speech";
import {
  LATENCY_OVERLAY_DEFAULT_VISIBLE,
  LATENCY_OVERLAY_ID,
  LatencyOverlay,
  formatLatencyMs,
  formatLatencyOverlay,
  httpP50Band,
  latencyOverlayClassName,
} from "./LatencyOverlay";

const empty: VoiceSessionSnapshot = {
  backendId: "http",
  lastTranscriptMs: null,
  lastAudioStartMs: null,
  p50AudioStartMs: null,
  sampleCount: 0,
};

const last: VoiceSessionSnapshot = {
  backendId: "http",
  lastTranscriptMs: 40,
  lastAudioStartMs: 180,
  p50AudioStartMs: 180,
  sampleCount: 1,
};

test("AC4 — overlay text shows last STT, last audio-start, p50, n=, and backend", () => {
  expect(formatLatencyOverlay(last)).toBe("http  STT 40  AUD 180  p50 180 n=1");
  expect(formatLatencyOverlay(empty)).toBe("http  STT —  AUD —  p50 — n=0");
  expect(formatLatencyMs(null)).toBe("—");
  expect(formatLatencyMs(2.5)).toBe("2.5");
  expect(
    formatLatencyOverlay({
      ...last,
      lastAudioStartMs: null,
      p50AudioStartMs: null,
      sampleCount: 0,
    }),
  ).toBe("http  STT 40  AUD —  p50 — n=0");
});

test("show/hide is exposed and defaults on (T03-10 owns settings persistence)", () => {
  expect(LATENCY_OVERLAY_DEFAULT_VISIBLE).toBe(true);
  const shown = renderToStaticMarkup(
    createElement(LatencyOverlay, { snapshot: last, visible: true }),
  );
  expect(shown).toContain(LATENCY_OVERLAY_ID);
  expect(shown).toContain("http  STT 40  AUD 180  p50 180 n=1");
  expect(shown).toContain('aria-label="Voice latency"');
  expect(
    renderToStaticMarkup(createElement(LatencyOverlay, { snapshot: last, visible: false })),
  ).toBe("");
  const hiddenToggle = renderToStaticMarkup(
    createElement(LatencyOverlay, { snapshot: last, visible: false, onToggle: () => {} }),
  );
  expect(hiddenToggle).toContain("LAT");
  expect(hiddenToggle).toContain("Show voice latency");
});

test("http p50 color is informational only (green / yellow / red thresholds)", () => {
  expect(httpP50Band("http", 1499)).toBe("ok");
  expect(httpP50Band("http", 1500)).toBe("warn");
  expect(httpP50Band("http", 2499)).toBe("warn");
  expect(httpP50Band("http", 2500)).toBe("slow");
  expect(httpP50Band("web-speech", 200)).toBeNull();
  expect(httpP50Band("http", null)).toBeNull();
  expect(latencyOverlayClassName("http", 200)).toBe("latency-overlay latency-overlay--ok");
  expect(latencyOverlayClassName("null", 200)).toBe("latency-overlay");
});

test("shell mounts LatencyOverlay as HTML (not PPI canvas drawing)", () => {
  const sources = import.meta.glob("./shell.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = sources["./shell.tsx"]!;
  expect(shell).toMatch(/<LatencyOverlay/);
  expect(shell).not.toMatch(/paintPpi.*latency/i);
});
