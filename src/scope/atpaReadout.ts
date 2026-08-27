/**
 * Analog: CRC STARS ATPA in-trail distance and A/TPA Mileage
 * (docs.virtualnas.net/crc/stars — R07 Warning Cone, Alert Cone, Intrail
 * Distance, A/TPA Mileage).
 *
 * Two formatters on purpose — they are not interchangeable:
 * - Datablock Intrail Distance uses **two decimal places**, matching Fig 38/39
 *   (`9.88`, `3.97`; a value that used to be shown as `"2.4"` is `"2.40"`).
 * - Cone mileage uses **tenths for non-whole values** (`3` → `"3"`, `2.5` → `"2.5"`).
 *
 * R07 colors the in-trail datablock readout with the cone: warning → ATPA
 * yellow, alert → ATPA red. Monitor pairs add no datablock field (the
 * readout is displayed together with the warning / alert cone). Cone mileage
 * digits sit alongside the cone in the cone’s color for every pair status,
 * including monitor blue.
 *
 * Scope reads `world.alerts.atpa` (T02-44). This module never recomputes pair
 * geometry and never touches conflict alert. Minima stay on the pair as
 * `requiredNm`.
 *
 * Cone mileage placement takes a small pose `{ trailing, leading, requiredNm,
 * status }` so T02-45 can wire it to wedge geometry at merge time. This file
 * does not emit a wedge polyline.
 */

import type { AtpaPair, AtpaStatus } from "@core";
import { PALETTE } from "./palette";

/** Along-axis fraction of `requiredNm` from the trailer toward the leader. */
export const ATPA_CONE_MILEAGE_ALONG_FRAC = 0.55;
/** Perpendicular offset (NM) so digits sit alongside the needle, not on it. */
export const ATPA_CONE_MILEAGE_OFFSET_NM = 0.22;

export interface AtpaNmPose {
  xNm: number;
  yNm: number;
}

/**
 * Local pose input for cone-mileage digits. T02-45 owns the wedge; captain
 * wires this to `atpaConePoints` with a trivial edit at merge time.
 */
export interface AtpaConeMileagePose {
  trailing: AtpaNmPose;
  leading: AtpaNmPose;
  requiredNm: number;
  status: AtpaStatus;
}

export interface AtpaConeMileagePlacement {
  eastNm: number;
  northNm: number;
  text: string;
  status: AtpaStatus;
}

export interface AtpaReadoutGate {
  /** Master ATPA DCB latch (`view.atpa.on`). */
  atpaOn: boolean;
  /** Global Intrail Distance or A/TPA Mileage flag. */
  globalEnabled: boolean;
  /** Per-track inhibit; missing / undefined counts as enabled. */
  trackEnabled: boolean;
}

export interface AtpaInTrailReadout {
  text: string;
  status: "warning" | "alert";
}

/** Fig 38/39 datablock distance — always two decimal places. */
export function formatAtpaInTrailDistance(distanceNm: number): string {
  if (!Number.isFinite(distanceNm)) {
    return "0.00";
  }
  return Math.max(0, distanceNm).toFixed(2);
}

/** R07 cone mileage — whole numbers unadorned; non-whole in tenths. */
export function formatAtpaConeMileage(requiredNm: number): string {
  if (!Number.isFinite(requiredNm)) {
    return "0";
  }
  const tenths = Math.round(Math.max(0, requiredNm) * 10) / 10;
  if (Math.abs(tenths - Math.round(tenths)) < 1e-9) {
    return String(Math.round(tenths));
  }
  return tenths.toFixed(1);
}

/**
 * Monitor → TPA/tools blue; warning → ATPA yellow; alert → ATPA red.
 * Never CA/MSAW red (`PALETTE.alert`) or caution yellow.
 */
export function atpaReadoutColor(status: AtpaStatus): string {
  if (status === "alert") {
    return PALETTE.atpaAlert;
  }
  if (status === "warning") {
    return PALETTE.atpaWarning;
  }
  return PALETTE.tools;
}

/** Both the global flag and the per-track latch, under the ATPA master. */
export function atpaReadoutEnabled(gate: AtpaReadoutGate): boolean {
  return gate.atpaOn && gate.globalEnabled && gate.trackEnabled;
}

/** Trailing pair for this callsign, or `undefined` for the frontmost track. */
export function atpaPairForTrailing(
  pairs: readonly AtpaPair[],
  trailingCallsign: string,
): AtpaPair | undefined {
  return pairs.find((pair) => pair.trailingCallsign === trailingCallsign);
}

/**
 * FDB in-trail field for a trailing track. Monitor pairs and inhibited /
 * unpaired tracks return `null` so the next frame has no residue.
 */
export function atpaInTrailDatablockReadout(
  pairs: readonly AtpaPair[],
  trailingCallsign: string,
  gate: AtpaReadoutGate,
): AtpaInTrailReadout | null {
  if (!atpaReadoutEnabled(gate)) {
    return null;
  }
  const pair = atpaPairForTrailing(pairs, trailingCallsign);
  if (pair === undefined || pair.status === "monitor") {
    return null;
  }
  return {
    text: formatAtpaInTrailDistance(pair.distanceNm),
    status: pair.status,
  };
}

/**
 * Place cone-mileage digits alongside the T02-45 wedge using only the pose
 * (vertex at the trailer, length = `requiredNm`, axis toward the leader).
 */
export function atpaConeMileagePlacement(
  pose: AtpaConeMileagePose,
): AtpaConeMileagePlacement | null {
  if (!Number.isFinite(pose.requiredNm) || pose.requiredNm <= 0) {
    return null;
  }
  const dx = pose.leading.xNm - pose.trailing.xNm;
  const dy = pose.leading.yNm - pose.trailing.yNm;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || !Number.isFinite(dist)) {
    return null;
  }
  const ux = dx / dist;
  const uy = dy / dist;
  const along = pose.requiredNm * ATPA_CONE_MILEAGE_ALONG_FRAC;
  return {
    eastNm: pose.trailing.xNm + ux * along - uy * ATPA_CONE_MILEAGE_OFFSET_NM,
    northNm: pose.trailing.yNm + uy * along + ux * ATPA_CONE_MILEAGE_OFFSET_NM,
    text: formatAtpaConeMileage(pose.requiredNm),
    status: pose.status,
  };
}

export function atpaConeMileageReadout(
  pairs: readonly AtpaPair[],
  trailingCallsign: string,
  trailing: AtpaNmPose,
  leading: AtpaNmPose,
  gate: AtpaReadoutGate,
): AtpaConeMileagePlacement | null {
  if (!atpaReadoutEnabled(gate)) {
    return null;
  }
  const pair = atpaPairForTrailing(pairs, trailingCallsign);
  if (pair === undefined) {
    return null;
  }
  return atpaConeMileagePlacement({
    trailing,
    leading,
    requiredNm: pair.requiredNm,
    status: pair.status,
  });
}
