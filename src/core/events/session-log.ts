import type { Command } from "../command/types";

/**
 * Append-only session events.
 * Phase 1 union is session.started / command.accepted / command.rejected.
 * T03-09 adds voice.latency (wall-clock PTT metrics; not sim time).
 * T04-09 adds alert.ca.caution / alert.ca.alert / alert.ca.clear (edges only).
 * T04-10 adds alert.msaw.caution / alert.msaw.alert / alert.msaw.clear (edges only).
 * T04-03 adds nav.direct.sequenced / nav.star.vectors.
 * T04-04 adds optional nav.constraint.met.
 * T04-05 adds nav.loc.captured (INTERCEPT_LOC → LOC).
 * T04-06 adds nav.gs.captured (vertical → GS after loc, from below).
 * T04-07 adds nav.missed.started (DA or GO_AROUND).
 * T04-12 adds handoff.tower (scope stub) and nav.landed (threshold despawn).
 * T04-15 adds radio.checkin (unsolicited STAR descend-via contact).
 * T04-16 adds handoff.inbound.offered / handoff.inbound.accepted (spawn/accept;
 * scope action later, not a Command; phase 5 must not score).
 */
export type SessionEvent =
  | {
      type: "session.started";
      atSimMs: number;
      atWallMs: number;
      scenarioId: string;
      /** Spawn mix seed (`?seed=`). T05-07 may record this; no replay player here. */
      seed: number;
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
    }
  | {
      type: "alert.msaw.caution";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      altFt: number;
      floorFt: number;
    }
  | {
      type: "alert.msaw.alert";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      altFt: number;
      floorFt: number;
    }
  | {
      type: "alert.msaw.clear";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      altFt: number;
      floorFt: number;
    }
  | {
      type: "nav.direct.sequenced";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      fixId: string;
    }
  | {
      type: "nav.star.vectors";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      starId: string;
    }
  | {
      type: "nav.constraint.met";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      fixId: string;
    }
  | {
      type: "nav.loc.captured";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      approachId: string;
    }
  | {
      type: "nav.gs.captured";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      approachId: string;
    }
  | {
      type: "nav.missed.started";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      approachId: string;
    }
  | {
      type: "handoff.tower";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      approachId: string;
    }
  | {
      type: "nav.landed";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      approachId: string;
    }
  | {
      /**
       * Pilot-initiated; not a Command. Phase 5 phraseology scoring must not
       * treat this as controller input.
       */
      type: "radio.checkin";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      starId: string;
      starName: string;
      altitudeFt: number;
      text: string;
    }
  | {
      /**
       * Spawned pending inbound HO. Scope action later; not a Command.
       * Phase 5 scoring must ignore this.
       */
      type: "handoff.inbound.offered";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      fromSectorId: string;
    }
  | {
      /**
       * Accept inbound HO (F3 take-track / T04-17 click). Not a Command.
       * Phase 5 scoring must ignore this.
       */
      type: "handoff.inbound.accepted";
      atSimMs: number;
      atWallMs: number;
      callsign: string;
      fromSectorId: string;
    };

/**
 * Append-only in-memory session event log.
 * No max size in v1; phase 5 may truncate when scoring.
 * Callers pass atSimMs and atWallMs; this class does not read Date.now().
 */
export class SessionLog {
  private readonly events: SessionEvent[] = [];

  append(event: SessionEvent): void {
    this.events.push(event);
  }

  /** Copy of insertion order. Mutating the returned array does not change the log. */
  all(): readonly SessionEvent[] {
    return this.events.slice();
  }

  byType<T extends SessionEvent["type"]>(type: T): Extract<SessionEvent, { type: T }>[] {
    return this.events.filter(
      (event): event is Extract<SessionEvent, { type: T }> => event.type === type,
    );
  }
}
