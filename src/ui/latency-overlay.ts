/**
 * Voice latency overlay copy (T03-09). HTML overlay, not PPI canvas.
 * Shows last PTT-up → transcript / audio-start plus session p50. Wall clock only.
 * T03-10 may persist the show/hide toggle; default on so T03-12 can read numbers.
 */

import type { VoiceSessionSnapshot } from "@speech";

export const LATENCY_OVERLAY_ID = "voice-latency-overlay";

/** Default on for phase 3. Settings (T03-10) may persist a user choice. */
export const LATENCY_OVERLAY_DEFAULT_VISIBLE = true;

const MISSING = "—";

export function formatLatencyMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) {
    return MISSING;
  }
  if (Number.isInteger(ms)) {
    return String(ms);
  }
  return String(Math.round(ms * 10) / 10);
}

/**
 * Compact last-utterance + session p50 line. Does not claim a 1.5 s pass/fail.
 * Example: `http  STT 40  AUD 180  p50 180 n=1`
 */
export function formatLatencyOverlay(snapshot: VoiceSessionSnapshot): string {
  const p50 =
    snapshot.sampleCount < 1
      ? `p50 ${MISSING} n=0`
      : `p50 ${formatLatencyMs(snapshot.p50AudioStartMs)} n=${snapshot.sampleCount}`;
  return [
    snapshot.backendId,
    `STT ${formatLatencyMs(snapshot.lastTranscriptMs)}`,
    `AUD ${formatLatencyMs(snapshot.lastAudioStartMs)}`,
    p50,
  ].join("  ");
}

/** Informational color for http p50 only. Not a phase gate. */
export type HttpP50Band = "ok" | "warn" | "slow";

export function httpP50Band(backendId: string, p50Ms: number | null): HttpP50Band | null {
  if (backendId !== "http" || p50Ms === null || !Number.isFinite(p50Ms)) {
    return null;
  }
  if (p50Ms < 1500) {
    return "ok";
  }
  if (p50Ms < 2500) {
    return "warn";
  }
  return "slow";
}

export function latencyOverlayClassName(backendId: string, p50Ms: number | null): string {
  const band = httpP50Band(backendId, p50Ms);
  return band ? `latency-overlay latency-overlay--${band}` : "latency-overlay";
}
