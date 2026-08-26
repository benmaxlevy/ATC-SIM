/**
 * Seeded STAR descend-via check-in scheduler.
 *
 * Analog: AIM initial contact (facility ID, then aircraft ID, then the message)
 * plus JO 7110.65 / AIM descend-via altitude report (R01, R03).
 * Trainer delta: frozen template; facility is the literal word `approach`;
 * altitude is always `through` + present Mode C (hundreds; FL at 18,000+);
 * catalog spoken STAR `name` (never coded id); no ATIS, squawk, or “with you”.
 * Unsolicited pilot radio — not a Command IR readback.
 *
 * Stagger stream is local mulberry32 (T04-14 owns `src/core/rng.ts` if present)
 * so check-in draws do not consume spawn-assignment RNG. Seeded only — no
 * unseeded draws. Drain from the app tick after physics; do not import SpeechPort.
 */

import { handoffFor, type Aircraft, type SessionLog, type World } from "@core";
import { formatAltitude, formatCallsignSpeech } from "./telephony";

export interface FormatCheckInArgs {
  callsign: string;
  starName: string;
  altitudeFt: number;
}

export interface StarNameCatalog {
  stars?: ReadonlyArray<{ id: string; name?: string }>;
}

/**
 * Frozen spawn check-in. Commas after `approach` and the spoken callsign.
 * `starName` is the catalog spoken name (`DEMO ONE`), never `DEM1`.
 */
export function formatCheckIn(args: FormatCheckInArgs): string {
  const callsignSpeech = formatCallsignSpeech(args.callsign);
  const altitudeSpeech = formatAltitude(args.altitudeFt);
  return `Approach, ${callsignSpeech}, descending via ${args.starName} arrival through ${altitudeSpeech}`;
}

/** Catalog `name` for a STAR id. Walks `catalog.stars`; no facility switch. */
export function starSpokenName(
  catalog: StarNameCatalog | null | undefined,
  starId: string,
): string {
  const want = starId.trim().toUpperCase();
  const star = catalog?.stars?.find((item) => item.id.trim().toUpperCase() === want);
  const name = star?.name?.trim();
  return name && name.length > 0 ? name : starId;
}

/** Spawn-eligible: published lateral path and descend-via, same STAR id. */
export function isStarViaArrival(aircraft: Aircraft): boolean {
  const lateral = aircraft.intent.lateral;
  const vertical = aircraft.intent.vertical;
  if (lateral?.type !== "PROCEDURE" || vertical?.type !== "VIA_STAR") {
    return false;
  }
  return lateral.starId.trim().toUpperCase() === vertical.starId.trim().toUpperCase();
}

export const CHECKIN_STAGGER_MIN_MS = 3000;
export const CHECKIN_STAGGER_MAX_MS = 8000;
export const CHECKIN_STAGGER_QUANT_MS = 50;
export const CHECKIN_IDLE_GAP_MS = 500;
export const DEFAULT_CHECKIN_SEED = 1;
/** Independent stream from spawn assignment. */
export const CHECKIN_STREAM_XOR = 0xc0ffee;

export type CheckInEntryState = "pending" | "done" | "skipped";

export interface ScheduledCheckIn {
  aircraftId: string;
  callsign: string;
  starId: string;
  spawnSimMs: number;
  staggerMs: number;
  dueSimMs: number;
  spawnOrder: number;
  state: CheckInEntryState;
}

export interface CheckInRadio {
  isBusy(): boolean;
  play(text: string, callsign: string): void | Promise<void>;
}

export interface DrainCheckInsArgs {
  world: World;
  log: SessionLog;
  radio: CheckInRadio;
  setStatus(text: string): void;
  nowWallMs(): number;
}

interface CheckInQueueOptions {
  seed?: number;
}

/**
 * uint32 mulberry32. Same recipe T04-14 uses for spawn; kept local so this
 * ticket can land without `src/core/rng.ts`.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawStaggerMs(rng: () => number): number {
  const slots = (CHECKIN_STAGGER_MAX_MS - CHECKIN_STAGGER_MIN_MS) / CHECKIN_STAGGER_QUANT_MS;
  const slot = Math.min(Math.floor(rng() * (slots + 1)), slots);
  return CHECKIN_STAGGER_MIN_MS + slot * CHECKIN_STAGGER_QUANT_MS;
}

function vectorsAlreadyFired(log: SessionLog, callsign: string): boolean {
  return log.byType("nav.star.vectors").some((event) => event.callsign === callsign);
}

function alreadyDelivered(log: SessionLog, callsign: string): boolean {
  return log.byType("radio.checkin").some((event) => event.callsign === callsign);
}

export class CheckInQueue {
  private readonly rng: () => number;
  private readonly entries: ScheduledCheckIn[] = [];
  private spawnCounter = 0;
  private playInFlight = false;
  private lastUtteranceEndSimMs: number | null = null;
  private worldRef: World | null = null;

  constructor(options?: CheckInQueueOptions) {
    const seed = options?.seed ?? DEFAULT_CHECKIN_SEED;
    this.rng = mulberry32((seed >>> 0) ^ CHECKIN_STREAM_XOR);
  }

  scheduled(): readonly ScheduledCheckIn[] {
    return this.entries.slice();
  }

  /**
   * One pending check-in per eligible PROCEDURE+VIA_STAR arrival.
   * Downwind / bench traffic without VIA is ignored.
   */
  scheduleFromWorld(world: World, spawnSimMs: number = world.simTimeMs): void {
    for (const aircraft of world.aircraft) {
      this.scheduleAircraft(aircraft, spawnSimMs);
    }
  }

  scheduleAircraft(aircraft: Aircraft, spawnSimMs: number): void {
    if (this.entries.some((entry) => entry.aircraftId === aircraft.id)) {
      return;
    }
    if (!isStarViaArrival(aircraft)) {
      return;
    }
    const lateral = aircraft.intent.lateral;
    const starId = lateral?.type === "PROCEDURE" ? lateral.starId : "";
    const staggerMs = drawStaggerMs(this.rng);
    this.spawnCounter += 1;
    this.entries.push({
      aircraftId: aircraft.id,
      callsign: aircraft.callsign,
      starId,
      spawnSimMs,
      staggerMs,
      dueSimMs: spawnSimMs + staggerMs,
      spawnOrder: this.spawnCounter,
      state: "pending",
    });
  }

  drain(args: DrainCheckInsArgs): void {
    const { world, log, radio, setStatus, nowWallMs } = args;
    this.worldRef = world;
    for (;;) {
      const busy = radio.isBusy() || this.playInFlight;
      if (!this.canStart(world.simTimeMs, busy)) {
        return;
      }
      const next = this.nextDue(world.simTimeMs, world);
      if (!next) {
        return;
      }
      const aircraft = world.aircraft.find((item) => item.id === next.aircraftId);
      if (
        !aircraft ||
        !isStarViaArrival(aircraft) ||
        vectorsAlreadyFired(log, aircraft.callsign) ||
        alreadyDelivered(log, aircraft.callsign)
      ) {
        next.state = "skipped";
        continue;
      }
      const lateral = aircraft.intent.lateral;
      const starId = lateral?.type === "PROCEDURE" ? lateral.starId : next.starId;
      const starName = starSpokenName(world.catalog, starId);
      const text = formatCheckIn({
        callsign: aircraft.callsign,
        starName,
        altitudeFt: aircraft.altitudeFt,
      });
      next.state = "done";
      setStatus(text);
      log.append({
        type: "radio.checkin",
        atSimMs: world.simTimeMs,
        atWallMs: nowWallMs(),
        callsign: aircraft.callsign,
        starId,
        starName,
        altitudeFt: aircraft.altitudeFt,
        text,
      });
      this.playInFlight = true;
      this.beginPlay(radio, text, aircraft.callsign);
      return;
    }
  }

  /**
   * Pending inbound HO holds check-in (keep due time). Fire on the first drain
   * after accept even if due is in the past. Heading-cancel skip is unchanged.
   */
  private nextDue(simTimeMs: number, world: World): ScheduledCheckIn | undefined {
    return this.entries
      .filter((entry) => {
        if (entry.state !== "pending" || simTimeMs < entry.dueSimMs) {
          return false;
        }
        if (handoffFor(world, entry.aircraftId).kind === "inbound") {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.dueSimMs - b.dueSimMs || a.spawnOrder - b.spawnOrder)[0];
  }

  private beginPlay(radio: CheckInRadio, text: string, callsign: string): void {
    try {
      const result = radio.play(text, callsign);
      if (result !== undefined && typeof result.then === "function") {
        void result.then(
          () => {
            this.onPlayEnded();
          },
          () => {
            this.onPlayEnded();
          },
        );
        return;
      }
      this.onPlayEnded();
    } catch {
      this.onPlayEnded();
    }
  }

  private onPlayEnded(): void {
    this.playInFlight = false;
    this.lastUtteranceEndSimMs = this.worldRef?.simTimeMs ?? 0;
  }

  private canStart(simTimeMs: number, busy: boolean): boolean {
    if (busy) {
      return false;
    }
    if (
      this.lastUtteranceEndSimMs !== null &&
      simTimeMs < this.lastUtteranceEndSimMs + CHECKIN_IDLE_GAP_MS
    ) {
      return false;
    }
    return true;
  }
}

export function createCheckInQueue(options?: CheckInQueueOptions): CheckInQueue {
  return new CheckInQueue(options);
}
