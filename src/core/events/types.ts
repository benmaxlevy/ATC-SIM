import type { Command } from "../command/types";

/**
 * Append-only session events.
 * Phase 1 union is session.started / command.accepted / command.rejected.
 * T03-09 adds voice.latency (wall-clock PTT metrics; not sim time).
 * T04-09 adds alert.ca.caution / alert.ca.alert / alert.ca.clear (edges only).
 */
export type SessionEvent =
  | {
      type: "session.started";
      atSimMs: number;
      atWallMs: number;
      scenarioId: string;
    }
  | {
      type: "command.accepted";
      atSimMs: number;
      atWallMs: number;
      command: Command;
    }
  | {
      type: "command.rejected";
      atSimMs: number;
      atWallMs: number;
      /**
       * Parsed Command when resolve/validate failed. `null` when parse failed
       * before a Command existed (T01-07); then `sourceText` carries the line.
       */
      command: Command | null;
      reason: string;
      /** Required when `command` is null (parse miss). */
      sourceText?: string;
    }
  | {
      type: "voice.latency";
      atSimMs: number;
      atWallMs: number;
      /** PTT-up → transcript (wall ms). null if STT never finished. */
      pttUpToTranscriptMs: number | null;
      /** PTT-up → first audible readback start. null if TTS never started. */
      pttUpToAudioStartMs: number | null;
      backendId: string;
      /** ASR score when STT returned a transcript (T03-15). Omit/null if none. */
      sttConfidence?: number | null;
    }
  | {
      type: "alert.ca.caution";
      atSimMs: number;
      atWallMs: number;
      callsignA: string;
      callsignB: string;
      distNm: number;
      deltaAltFt: number;
    }
  | {
      type: "alert.ca.alert";
      atSimMs: number;
      atWallMs: number;
      callsignA: string;
      callsignB: string;
      distNm: number;
      deltaAltFt: number;
    }
  | {
      type: "alert.ca.clear";
      atSimMs: number;
      atWallMs: number;
      callsignA: string;
      callsignB: string;
      distNm: number;
      deltaAltFt: number;
    };
