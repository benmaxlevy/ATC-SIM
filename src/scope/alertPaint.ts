/**
 * Analog: CRC STARS STCA (R07) — blinking `CA` in the datablock + aural tone.
 * FOA STARS / 7110.65 name the alert (R01, R05). MSAW still uses caution
 * yellow then alert red. Not certified. Do not label “STARS CA” or “MSAW
 * certified.” UI word is **MSAW**, not GPWS / TAWS.
 *
 * Trainer delta: scope reads `world.alerts` and `datablockAlertTint`. It does
 * not compute pair distance or MVA floors. Predicted CA (caution) does not
 * recolor the FDB; current CA (alert) paints red with blinking `CA`.
 */

import {
  caSeverityForCallsign,
  datablockAlertTint,
  msawSeverityForCallsign,
  type AlertTint,
  type World,
} from "@core";
import { PALETTE } from "./palette";
import { trackPaintColor, type TrackOwnership } from "./ownership";

/** CRC-like half-period for the datablock `CA` blink (sim time). */
export const CA_BLINK_HALF_MS = 500;

export function trackAlertTint(world: World, callsign: string): AlertTint {
  return datablockAlertTint({
    ca: caSeverityForCallsign(world.alerts.ca, callsign),
    msaw: msawSeverityForCallsign(world.alerts.msaw, callsign),
  });
}

/** Paint: current CA red, MSAW yellow/red. Predicted CA is blink-only (no yellow). */
export function trackPaintAlertTint(world: World, callsign: string): AlertTint {
  const ca = caSeverityForCallsign(world.alerts.ca, callsign);
  return datablockAlertTint({
    ca: ca === "alert" ? "alert" : null,
    msaw: msawSeverityForCallsign(world.alerts.msaw, callsign),
  });
}

export function alertTintPaintColor(tint: AlertTint): string | null {
  if (tint === "ca-caution") {
    return null;
  }
  if (tint === "ca-alert" || tint === "msaw-alert") {
    return PALETTE.alert;
  }
  if (tint === "msaw-caution") {
    return PALETTE.caution;
  }
  return null;
}

/** Datablock / leader color: MSAW tint wins over ownership white/green. */
export function alertOrOwnershipColor(ownership: TrackOwnership, tint: AlertTint): string {
  return alertTintPaintColor(tint) ?? trackPaintColor(ownership);
}

export function caDatablockTagVisible(simTimeMs: number): boolean {
  return Math.floor(simTimeMs / CA_BLINK_HALF_MS) % 2 === 0;
}

export function withCaDatablockTag(line1: string, tint: AlertTint, simTimeMs = 0): string {
  if (tint === "ca-alert" || tint === "ca-caution") {
    return caDatablockTagVisible(simTimeMs) ? `${line1} CA` : `${line1}   `;
  }
  if (tint === "msaw-alert" || tint === "msaw-caution") {
    return `${line1} MSAW`;
  }
  return line1;
}
