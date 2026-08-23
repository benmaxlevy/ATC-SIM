/**
 * Analog: AIM initial contact (facility ID, then aircraft ID, then the message)
 * plus JO 7110.65 / AIM descend-via altitude report (R01, R03).
 * Trainer delta: frozen template; facility is the literal word `approach`;
 * altitude is always `through` + present Mode C (hundreds; FL at 18,000+);
 * catalog spoken STAR `name` (never coded id); no ATIS, squawk, or “with you”.
 * Unsolicited pilot radio — not a Command IR readback.
 */

import type { Aircraft } from "@core";
import { formatAltitude } from "./digits";
import { formatCallsignSpeech } from "./telephony";

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
