/**
 * Analog: CRC STARS **TPA J-Rings and Cones** and ATPA Monitor / Warning /
 * Alert Cone (docs.virtualnas.net/crc/stars — R07).
 *
 * The cone is a narrow unfilled wedge: vertex on the trailing target, axis
 * toward the leader, length = the pair's `requiredNm` (basic radar minimum
 * from T02-44; not a wake matrix). Stroke only — never fill. Mileage digits
 * alongside the body are T02-46; this module is geometry, color, and the
 * paint gate only.
 *
 * **Supersession (R07 prose):** Alert supersedes all other ATPA and TPA cones.
 * Warning supersedes a manual TPA cone and the Monitor cone, but is not shown
 * when an Alert cone is shown. Monitor is the base state. This module paints
 * **one ATPA cone per trailing track — the highest status only.** Alert status
 * itself is actual in-trail loss only (T02-44 trainer delta vs R07 24 s).
 *
 * **Fig 39 discrepancy (known, not implemented):** the Alert Cone figure
 * appears to show a blue cone and an orange cone anchored at the same target
 * pointing opposite ways, which reads against the prose rule that an Alert
 * cone "will supersede all other ATPA and TPA Cones." We follow the prose,
 * not a second-cone rule invented to match the screenshot.
 *
 * Trainer delta: single TCP (every painted pair is visible); no TDW white
 * monitor variant; no aural ATPA tone. Not NAS STARS. Not a CA halo.
 */

import type { AtpaPair, AtpaStatus } from "@core";
import { PALETTE } from "./palette";

/**
 * Reference half-angle used to derive the fixed end-cap height. R07 Fig 36–39
 * show a few degrees of wedge, not a pie slice. The 5 NM reference keeps the
 * existing 3° shape while shorter and longer cones use the same end-cap size.
 */
export const ATPA_CONE_HALF_ANGLE_DEG = 3;
export const ATPA_CONE_REFERENCE_LENGTH_NM = 5;

const ATPA_CONE_REFERENCE_HALF_ANGLE_RAD = (ATPA_CONE_HALF_ANGLE_DEG * Math.PI) / 180;

/** World-NM height of the cone's flat end cap, fixed for every cone length. */
export const ATPA_CONE_END_HEIGHT_NM =
  2 * ATPA_CONE_REFERENCE_LENGTH_NM * Math.tan(ATPA_CONE_REFERENCE_HALF_ANGLE_RAD);

/** Half-angle required to reach the fixed end-cap height at `lengthNm`. */
export function atpaConeHalfAngleDeg(lengthNm: number): number {
  if (!Number.isFinite(lengthNm) || lengthNm <= 0) {
    return 0;
  }
  return (Math.atan(ATPA_CONE_END_HEIGHT_NM / 2 / lengthNm) * 180) / Math.PI;
}

const STATUS_RANK: Record<AtpaStatus, number> = {
  monitor: 0,
  warning: 1,
  alert: 2,
};

export interface AtpaNmPoint {
  eastNm: number;
  northNm: number;
}

/**
 * Per-track ATPA cone enable/inhibit plus DCB cone latches. Defaults **on**
 * when omitted. T02-49 (`*AE`/`*AI` warning+alert, `*BE`/`*BI` monitor) wires
 * the track flags on `TrackDisplay`. T02-47 wires `alertCones` / `monitorCones`
 * on `AtpaState`. Alert Cones covers warning (R07 has no Warning Cones cell).
 */
export interface AtpaConePaintFlags {
  atpaMonitorEnabled?: boolean;
  atpaWarningAlertEnabled?: boolean;
  /** DCB Alert Cones. False drops alert **and** warning. */
  alertCones?: boolean;
  /** DCB Monitor Cones. False drops monitor only. */
  monitorCones?: boolean;
}

/**
 * Closed world-NM polyline for an ATPA cone. Vertex at the trailing target,
 * axis along the bearing to the leader (`atan2(dEast, dNorth)` — sin east,
 * cos north, same as `tpaRingPoints` / PTL). Flat end cap. First point is
 * repeated at the end. Empty when the axis or length is degenerate.
 */
export function atpaConePoints(
  trailingEastNm: number,
  trailingNorthNm: number,
  leadingEastNm: number,
  leadingNorthNm: number,
  lengthNm: number,
): AtpaNmPoint[] {
  if (!Number.isFinite(lengthNm) || lengthNm <= 0) {
    return [];
  }
  const dEast = leadingEastNm - trailingEastNm;
  const dNorth = leadingNorthNm - trailingNorthNm;
  if (!Number.isFinite(dEast) || !Number.isFinite(dNorth) || (dEast === 0 && dNorth === 0)) {
    return [];
  }
  const headingRad = Math.atan2(dEast, dNorth);
  const axisEast = Math.sin(headingRad);
  const axisNorth = Math.cos(headingRad);
  const halfAngleRad = (atpaConeHalfAngleDeg(lengthNm) * Math.PI) / 180;
  const halfWidthNm = lengthNm * Math.tan(halfAngleRad);
  const midEast = trailingEastNm + lengthNm * axisEast;
  const midNorth = trailingNorthNm + lengthNm * axisNorth;
  const perpEast = -axisNorth;
  const perpNorth = axisEast;
  const left: AtpaNmPoint = {
    eastNm: midEast + halfWidthNm * perpEast,
    northNm: midNorth + halfWidthNm * perpNorth,
  };
  const right: AtpaNmPoint = {
    eastNm: midEast - halfWidthNm * perpEast,
    northNm: midNorth - halfWidthNm * perpNorth,
  };
  const vertex: AtpaNmPoint = { eastNm: trailingEastNm, northNm: trailingNorthNm };
  return [vertex, left, right, vertex];
}

/** Monitor → TPA tools blue; warning → ATPA yellow; alert → ATPA red. Never CA red. */
export function atpaConeColor(status: AtpaStatus): string {
  if (status === "alert") {
    return PALETTE.atpaAlert;
  }
  if (status === "warning") {
    return PALETTE.atpaWarning;
  }
  return PALETTE.tools;
}

/**
 * Warning and alert cones suppress a manual TPA (`*P`) cone on that track.
 * Monitor does not. J-rings are not cones and are never suppressed. T02-48
 * consults this; this ticket owns the predicate.
 */
export function atpaSuppressesManualTpaCone(status: AtpaStatus): boolean {
  return status === "warning" || status === "alert";
}

/**
 * DCB cone latches plus per-track enable/inhibit. Flags default on.
 * No system-wide ATPA master — R07 TPA ATPA submenu is per-feature.
 * Monitor Cones gates monitor only; Alert Cones gates alert **and** warning
 * (R07: no separate Warning cell).
 */
export function shouldPaintAtpaGeometry(
  status: AtpaStatus,
  flags: AtpaConePaintFlags = {},
): boolean {
  if (status === "monitor") {
    if ((flags.monitorCones ?? true) === false) {
      return false;
    }
    return flags.atpaMonitorEnabled ?? true;
  }
  if ((flags.alertCones ?? true) === false) {
    return false;
  }
  return flags.atpaWarningAlertEnabled ?? true;
}

/**
 * One ATPA cone per trailing track: keep the highest status only
 * (alert > warning > monitor). Does not invent a second cone to match Fig 39.
 */
export function selectAtpaConesToPaint(pairs: readonly AtpaPair[]): AtpaPair[] {
  const best = new Map<string, AtpaPair>();
  for (const pair of pairs) {
    const prev = best.get(pair.trailingCallsign);
    if (!prev || STATUS_RANK[pair.status] > STATUS_RANK[prev.status]) {
      best.set(pair.trailingCallsign, pair);
    }
  }
  return [...best.values()];
}
