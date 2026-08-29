/**
 * Analog: CRC STARS **TPA J-Rings and Cones** (`*J` / `*P`) / ATPA DCB
 * (docs.virtualnas.net/crc/stars — R07 "TPA ATPA Submenu"). Trainer delta: DCB
 * TPA draws a mileage circle 2 / 3 / 5 / 10 NM about the **selected** track
 * (if none selected: all F3-**owned** tracks). Default off, 5 NM. Stroke uses
 * TLS/tools color (`PALETTE.tools`), not CA red.
 *
 * J-rings are circles of commanded radius; TPA cones project along the
 * target's calculated **ground track** (velocity heading, not assigned heading,
 * not leader bearing). Allowable chord range is **1–30 NM** with tenths
 * (`*J(#.#)` / `*P(#.#)`). `**J` / `**P` clear every ring / cone. Size-readout inhibit
 * (`*D+` / `*D+E` / `*D+I`) hides the radius / length digits and keeps
 * the stroke.
 *
 * DCB TPA_MI spinner stays frozen at 2 / 3 / 5 / 10 NM (T02-28 trainer analog);
 * the chord range is the full R07 1–30. **The two ranges are deliberately
 * different** — do not expand the spinner; do not clamp a parsed `*J7.5`.
 * Per-track ring/cone/inhibit graphics are **session state, not PREF** — they
 * never round-trip through `serializeDcbPref`. `ScopeView.tpa.on` /
 * `ScopeView.tpa.radiusNm` remain the DCB toggle and spinner (PREF-backed).
 * Chord-entered rings and cones are per-track and independent of the DCB
 * toggle. ATPA warning/alert cones suppress that track's manual `*P` cone via
 * `atpaSuppressesManualTpaCone`; monitor does not; J-rings are never suppressed.
 *
 * Four live ATPA cells (R07 meanings, quoted) — no system-wide ATPA on/off:
 * - A/TPA Mileage — "displays mileage in the A/TPA cone"
 * - Intrail Distance — "displays intrail distance in the datablock"
 * - Alert Cones — "displays alert cones at this TCP"
 * - Monitor Cones — "displays monitor cones at this TCP"
 * The reference has no separate Warning Cones cell. Positions "adapted to
 * display ATPA Alert and Warning Cones" are one capability, so Alert Cones
 * gates both alert and warning (`*AE` / `*AI`) while Monitor Cones is
 * monitor-only (`*BE` / `*BI`). Single TCP: "at this TCP" is this scope.
 *
 * A feature paints when its own latch is on: `effective(feature) = atpa[feature]`.
 * CA remains T04-09 datablock text — not a 3 NM circle (circles here are TPA
 * J-rings or ERAM DRI, not CA). Not NAS STARS.
 *
 * Scope display only. Never a Command, readback, or intent.
 */

import type { Aircraft, AtpaPair } from "@core";
import {
  atpaConePoints,
  atpaSuppressesManualTpaCone,
  selectAtpaConesToPaint,
  shouldPaintAtpaGeometry,
} from "./atpaCone";
import { atpaConeMileagePlacement, formatAtpaConeMileage } from "./atpaReadout";
import { pxPerNm, type ScopeCamera, type ScopeViewSize } from "./camera";
import { PALETTE } from "./palette";
import type { TrackOwnership } from "./ownership";
import type { TrackDisplay } from "./trackDisplay";

/**
 * DCB TPA_MI spinner (T02-28 freeze): 2 / 3 / 5 / 10 NM only.
 * Chord `*J(#.#)` / `*P(#.#)` accept the full R07 range 1–30 NM with tenths
 * (already validated by T02-49 — out of range is `invalid`, never clamped here).
 * The two ranges are deliberately different.
 */
export const TPA_RADIUS_NM = [2, 3, 5, 10] as const;
export type TpaRadiusNm = (typeof TPA_RADIUS_NM)[number];
/** Documented session default: 5 NM, off. */
export const DEFAULT_TPA_RADIUS_NM: TpaRadiusNm = 5;
export const TPA_RING_SEGMENTS = 64;
export const TPA_STROKE_PX = 1;
/** TLS/tools analog. Never CA/MSAW red. */
export const TPA_STROKE_COLOR = PALETTE.tools;

/**
 * Fig 36: radius digit sits inside the ring at lower-left (~7–8 o'clock).
 * 225° is 7:30 — southwest in the sin-east / cos-north convention.
 */
export const TPA_RING_DIGIT_CLOCK_DEG = 225;
/** Fraction of ring radius so the digit stays inside the circle. */
export const TPA_RING_DIGIT_RADIUS_FRAC = 0.72;

export interface TpaState {
  on: boolean;
  radiusNm: TpaRadiusNm;
}

export type AtpaFeature = "coneMileage" | "inTrailDistance" | "alertCones" | "monitorCones";

export interface AtpaState {
  /**
   * PREF v2 leftover. Not a DCB cell. Paint and readouts use the four
   * feature latches only.
   */
  on: boolean;
  /**
   * Intrail Distance — "displays intrail distance in the datablock" (R07).
   * Default on — this TCP is adapted to display it. Independent of `coneMileage`.
   */
  inTrailDistance: boolean;
  /**
   * A/TPA Mileage — "displays mileage in the A/TPA cone" (R07). Default on.
   * Independent of `inTrailDistance`. T02-45 owns the wedge.
   */
  coneMileage: boolean;
  /**
   * Alert Cones — "displays alert cones at this TCP" (R07). Default on.
   * Gates **alert and warning** cones; there is no separate Warning cell.
   */
  alertCones: boolean;
  /**
   * Monitor Cones — "displays monitor cones at this TCP" (R07). Default on.
   * Monitor only; does not affect warning/alert.
   */
  monitorCones: boolean;
}

export const DEFAULT_TPA_STATE: TpaState = {
  on: false,
  radiusNm: DEFAULT_TPA_RADIUS_NM,
};

export const DEFAULT_ATPA_STATE: AtpaState = {
  on: false,
  inTrailDistance: true,
  coneMileage: true,
  alertCones: true,
  monitorCones: true,
};

/**
 * R07 TPA ATPA submenu is per-feature. `effective(feature) = atpa[feature]`.
 */
export function atpaFeatureEffective(atpa: AtpaState, feature: AtpaFeature): boolean {
  return atpa[feature];
}

/**
 * World-NM polyline for a TPA J-ring about a track. Closed (first point
 * repeated at the end). Not a sprite. Not a CA halo.
 */
export function tpaRingPoints(
  eastNm: number,
  northNm: number,
  radiusNm: number,
  segments: number = TPA_RING_SEGMENTS,
): { eastNm: number; northNm: number }[] {
  const n = Math.max(8, segments);
  const pts: { eastNm: number; northNm: number }[] = [];
  for (let i = 0; i <= n; i += 1) {
    const theta = (i / n) * Math.PI * 2;
    pts.push({
      eastNm: eastNm + radiusNm * Math.sin(theta),
      northNm: northNm + radiusNm * Math.cos(theta),
    });
  }
  return pts;
}

/** Screen radius of a TPA ring: `radiusNm * pxPerNm` (same camera scale as maps). */
export function tpaScreenRadiusPx(
  radiusNm: number,
  camera: ScopeCamera,
  view: ScopeViewSize,
): number {
  return radiusNm * pxPerNm(camera, view);
}

export function stepTpaRadiusNm(current: TpaRadiusNm, delta: -1 | 1): TpaRadiusNm {
  const i = TPA_RADIUS_NM.indexOf(current);
  const next = i + delta;
  if (next < 0 || next >= TPA_RADIUS_NM.length) {
    return current;
  }
  return TPA_RADIUS_NM[next]!;
}

export function formatDcbTpaMiReadout(radiusNm: TpaRadiusNm): string {
  return String(radiusNm);
}

/** R07 J-ring / cone size digits — tenths only when non-whole (`3`, `2.5`). */
export function formatTpaSizeReadout(nm: number): string {
  return formatAtpaConeMileage(nm);
}

/**
 * Point one `lengthNm` along ground track (heading 0 = north; +x east, +y north).
 * Same sin-east / cos-north convention as `tpaRingPoints` / PTL.
 */
export function groundTrackPointNm(
  eastNm: number,
  northNm: number,
  headingDeg: number,
  lengthNm: number,
): { eastNm: number; northNm: number } {
  const rad = (headingDeg * Math.PI) / 180;
  return {
    eastNm: eastNm + lengthNm * Math.sin(rad),
    northNm: northNm + lengthNm * Math.cos(rad),
  };
}

/**
 * Manual `*P` cone along ground track. Projects a point along velocity heading
 * and reuses T02-45 `atpaConePoints` — same named half-angle
 * (`ATPA_CONE_HALF_ANGLE_DEG`) and flat end cap. Not a second wedge.
 */
export function manualTpaConePoints(
  eastNm: number,
  northNm: number,
  headingDeg: number,
  lengthNm: number,
): { eastNm: number; northNm: number }[] {
  const tip = groundTrackPointNm(eastNm, northNm, headingDeg, lengthNm);
  return atpaConePoints(eastNm, northNm, tip.eastNm, tip.northNm, lengthNm);
}

export interface TpaSizeDigitPlacement {
  eastNm: number;
  northNm: number;
  text: string;
}

/** Fig 36: radius digit inside the ring at lower-left (~7–8 o'clock). */
export function tpaRingDigitPlacement(
  eastNm: number,
  northNm: number,
  radiusNm: number,
): TpaSizeDigitPlacement {
  const rad = (TPA_RING_DIGIT_CLOCK_DEG * Math.PI) / 180;
  const r = radiusNm * TPA_RING_DIGIT_RADIUS_FRAC;
  return {
    eastNm: eastNm + r * Math.sin(rad),
    northNm: northNm + r * Math.cos(rad),
    text: formatTpaSizeReadout(radiusNm),
  };
}

/**
 * Fig 37: length digits inside the cone body, on the axis at mid-length. Same
 * placement as T02-46 ATPA cone mileage, axis along ground track.
 */
export function tpaConeDigitPlacement(
  eastNm: number,
  northNm: number,
  headingDeg: number,
  lengthNm: number,
): TpaSizeDigitPlacement {
  const tip = groundTrackPointNm(eastNm, northNm, headingDeg, lengthNm);
  const placed = atpaConeMileagePlacement({
    trailing: { xNm: eastNm, yNm: northNm },
    leading: { xNm: tip.eastNm, yNm: tip.northNm },
    requiredNm: lengthNm,
    status: "monitor",
  });
  if (!placed) {
    return { eastNm, northNm, text: formatTpaSizeReadout(lengthNm) };
  }
  return { eastNm: placed.eastNm, northNm: placed.northNm, text: placed.text };
}

/**
 * Tracks that get a J-ring when TPA is on: the selected aircraft if any,
 * otherwise every F3-owned track. Unowned tracks are skipped when none is
 * selected. Display only. Chord-entered per-track rings are **not** this
 * list — see `tpaRingsToPaint`.
 */
export function aircraftForTpaRings(
  tpaOn: boolean,
  selectedId: string | null,
  aircraft: readonly Aircraft[],
  tracks: Map<string, { ownership: TrackOwnership }>,
): Aircraft[] {
  if (!tpaOn) {
    return [];
  }
  if (selectedId) {
    const selected = aircraft.find((ac) => ac.id === selectedId);
    return selected ? [selected] : [];
  }
  return aircraft.filter((ac) => tracks.get(ac.id)?.ownership === "owned");
}

export interface TpaRingPaint {
  aircraft: Aircraft;
  radiusNm: number;
}

export interface TpaConePaint {
  aircraft: Aircraft;
  lengthNm: number;
}

function chordRingNm(td: TrackDisplay | undefined): number | undefined {
  const nm = td?.tpaRingNm;
  if (nm == null || !Number.isFinite(nm) || nm <= 0) {
    return undefined;
  }
  return nm;
}

function chordConeNm(td: TrackDisplay | undefined): number | undefined {
  const nm = td?.tpaConeNm;
  if (nm == null || !Number.isFinite(nm) || nm <= 0) {
    return undefined;
  }
  return nm;
}

/**
 * Union of DCB selected-else-owned rings (spinner radius) with per-track
 * chord rings. A chord `ringNm` on a track wins over the DCB overlay so two
 * tracks can carry 3 NM and 5 NM at once. DCB TPA off still paints chord rings.
 */
export function tpaRingsToPaint(
  tpaOn: boolean,
  selectedId: string | null,
  aircraft: readonly Aircraft[],
  tracks: Map<string, TrackDisplay>,
  dcbRadiusNm: number,
): TpaRingPaint[] {
  const dcbIds = new Set(
    aircraftForTpaRings(tpaOn, selectedId, aircraft, tracks).map((ac) => ac.id),
  );
  const out: TpaRingPaint[] = [];
  for (const ac of aircraft) {
    const chordNm = chordRingNm(tracks.get(ac.id));
    if (chordNm !== undefined) {
      out.push({ aircraft: ac, radiusNm: chordNm });
      continue;
    }
    if (dcbIds.has(ac.id)) {
      out.push({ aircraft: ac, radiusNm: dcbRadiusNm });
    }
  }
  return out;
}

/**
 * Per-track `*P` cones. Warning/alert ATPA cones that actually paint suppress
 * the manual cone (`atpaSuppressesManualTpaCone`). Monitor does not. An
 * inhibited ATPA cone (DCB or per-track) leaves the manual cone up.
 */
export function tpaConesToPaint(
  aircraft: readonly Aircraft[],
  tracks: Map<string, TrackDisplay>,
  atpaPairs: readonly AtpaPair[],
  atpa: Pick<AtpaState, "alertCones" | "monitorCones"> = {
    alertCones: true,
    monitorCones: true,
  },
): TpaConePaint[] {
  const best = selectAtpaConesToPaint(atpaPairs);
  const byCallsign = new Map(best.map((pair) => [pair.trailingCallsign, pair]));
  const out: TpaConePaint[] = [];
  for (const ac of aircraft) {
    const td = tracks.get(ac.id);
    const lengthNm = chordConeNm(td);
    if (lengthNm === undefined) {
      continue;
    }
    const pair = byCallsign.get(ac.callsign);
    if (pair) {
      const paintsAtpa = shouldPaintAtpaGeometry(pair.status, {
        atpaMonitorEnabled: td?.atpaMonitorEnabled,
        atpaWarningAlertEnabled: td?.atpaWarningAlertEnabled,
        alertCones: atpa.alertCones,
        monitorCones: atpa.monitorCones,
      });
      if (paintsAtpa && atpaSuppressesManualTpaCone(pair.status)) {
        continue;
      }
    }
    out.push({ aircraft: ac, lengthNm });
  }
  return out;
}

/** Size-readout digits paint unless the per-track inhibit flag is false. */
export function tpaSizeReadoutEnabled(td: TrackDisplay | undefined): boolean {
  return td?.tpaSizeReadoutEnabled !== false;
}

export { shouldPaintAtpaGeometry };
