/**
 * Analog: FOA STARS / 7110.65 conflict alert (CA) color language (R01, R05):
 * yellow caution then red alert. Not a certified CA. Do not label “STARS CA.”
 *
 * Trainer delta: scope reads `world.alerts` and `datablockAlertTint`. It does
 * not compute pair distance.
 */

import { caSeverityForCallsign, datablockAlertTint, type AlertTint, type World } from "@core";
import { PALETTE } from "./palette";
import { trackPaintColor, type TrackOwnership } from "./ownership";

export function trackAlertTint(world: World, callsign: string): AlertTint {
  return datablockAlertTint({
    ca: caSeverityForCallsign(world.alerts.ca, callsign),
  });
}

export function alertTintPaintColor(tint: AlertTint): string | null {
  if (tint === "ca-alert" || tint === "msaw-alert") {
    return PALETTE.alert;
  }
  if (tint === "ca-caution" || tint === "msaw-caution") {
    return PALETTE.caution;
  }
  return null;
}

/** Datablock / leader color: CA/MSAW tint wins over ownership white/green. */
export function alertOrOwnershipColor(ownership: TrackOwnership, tint: AlertTint): string {
  return alertTintPaintColor(tint) ?? trackPaintColor(ownership);
}

export function withCaDatablockTag(line1: string, tint: AlertTint): string {
  if (tint === "ca-alert" || tint === "ca-caution") {
    return `${line1} CA`;
  }
  return line1;
}
