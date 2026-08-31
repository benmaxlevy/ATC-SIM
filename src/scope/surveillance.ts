/**
 * Analog: CRC / vNAS STARS SITE FUSED / MULTI / single-site display
 * (docs.virtualnas.net/crc/stars — R07). FOA STARS display-data / radar
 * coverage (R05).
 *
 * Trainer delta (frozen): FUSED reports every 1000 ms and keeps the existing
 * blue circle puck (`TARGET_PUCK_BG`). Single-site and MULTI use the covering
 * site `periodMs` (airport/ASR fixtures 4800 ms). MULTI paints a small filled
 * blue rectangle centered on the glyph, long axis perpendicular to PTL /
 * history (ground track, not leader). Single-site paints a filled blue
 * rectangle facing the selected antenna: long axis perpendicular to the site
 * radial, size grows with range (uncertainty), green far-side line ~30%
 * longer than the blue block. Very far from the site (90% of `rangeNm`) is outline
 * only. Out of coverage: no paint, no 30 s coast. Empty `radarSites` is
 * implicit FUSED. BRITE PRI tints the position mark.
 *
 * World / FMS / CA / MSAW stay 20 Hz truth. Display consumers (PPI symbol,
 * datablock, PTL, ATPA cones) use last report pose only. History dots record
 * on report arrival. Not a live sensor. Not NAS STARS.
 *
 * T02-76 DCB/SSA: CRC R07 SITE is disabled in its FUSION-only analog. This
 * trainer lifts SITE to FUSED / MULTI / one adapted site id. SSA radar word
 * follows that live mode. Network health stays the `OK/OK/NA` stub — not live
 * sensors (R05 display-data wording; FOA STARS chapter).
 */

import { isImplicitFusedSurveillance } from "@scenario";
import type { RadarSite } from "@scenario";
import { PALETTE } from "./palette";

/** Frozen FUSED report period. Single-site / MULTI use authored `periodMs`. */
export const FUSED_PERIOD_MS = 1000;

/** Same CSS px as `TARGET_SIZE_PX` — kept local so this module cannot cycle. */
const SYMBOL_LENGTH_PX = 8;

/** MULTI mark: small filled rect, long axis ⊥ PTL / history. */
export const MULTI_RECT_LENGTH_PX = SYMBOL_LENGTH_PX + 2;
export const MULTI_RECT_THICKNESS_PX = 5;

/** Single-site rect: grows with range-to-site. Long axis faces the antenna. */
export const SITE_RECT_MIN_LENGTH_PX = SYMBOL_LENGTH_PX + 2;
export const SITE_RECT_MAX_LENGTH_PX = 28;
export const SITE_RECT_MIN_THICKNESS_PX = 6;
export const SITE_RECT_MAX_THICKNESS_PX = 16;
/** Filled below this fraction of site `rangeNm`; outline at/above (50 NM of 60 stays filled). */
export const SITE_RECT_OUTLINE_RANGE_FRACTION = 0.9;
export const SITE_FAR_LINE_GAP_PX = 1;
/** Green far-side line is ~30% longer than the blue block’s long axis. */
export const SITE_FAR_LINE_LENGTH_SCALE = 1.3;
export const SITE_FAR_LINE_STROKE_PX = 1;
export const SITE_FAR_LINE_COLOR = PALETTE.unowned;
/** Same frozen blue as `TARGET_PUCK_BG`. */
export const MULTI_RECT_COLOR = "#175dc7";

export type SurveillanceMode = "FUSED" | "MULTI" | { siteId: string };
export type SurveillancePaint = "fused-puck" | "multi-rect" | "site-rect";

export type SurveillanceClock = () => number;

export interface SurveillanceWorldPose {
  id: string;
  xNm: number;
  yNm: number;
  headingDeg: number;
  speedKt: number;
  altitudeFt: number;
}

export interface SurveillanceReport {
  aircraftId: string;
  xNm: number;
  yNm: number;
  headingDeg: number;
  speedKt: number;
  altitudeFt: number;
  reportedAtSimMs: number;
  sourceSiteId: string | null;
  paint: SurveillancePaint;
}

export interface SurveillanceSampler {
  mode: SurveillanceMode;
  sites: readonly RadarSite[];
  nowMs: SurveillanceClock;
  reports: Map<string, SurveillanceReport>;
}

export function defaultSurveillanceMode(): SurveillanceMode {
  return "FUSED";
}

export function createSurveillanceSampler(options?: {
  mode?: SurveillanceMode;
  sites?: readonly RadarSite[];
  nowMs?: SurveillanceClock;
}): SurveillanceSampler {
  return {
    mode: options?.mode ?? defaultSurveillanceMode(),
    sites: options?.sites ?? [],
    nowMs: options?.nowMs ?? (() => 0),
    reports: new Map(),
  };
}

export function isFusedMode(mode: SurveillanceMode): boolean {
  return mode === "FUSED";
}

export function selectedSiteId(mode: SurveillanceMode): string | null {
  return typeof mode === "object" ? mode.siteId : null;
}

/** SSA / MAIN second word: `FUSED`, `MULTI`, or the selected site id. */
export function surveillanceModeWord(mode: SurveillanceMode): string {
  return typeof mode === "object" ? mode.siteId : mode;
}

/** MAIN SITE text. Exactly `SITE FUSED`, `SITE MULTI`, or `SITE <id>`. */
export function formatDcbSiteLabel(mode: SurveillanceMode): string {
  return `SITE ${surveillanceModeWord(mode)}`;
}

export function surveillanceModesEqual(a: SurveillanceMode, b: SurveillanceMode): boolean {
  const aId = selectedSiteId(a);
  const bId = selectedSiteId(b);
  if (aId != null || bId != null) {
    return aId != null && aId === bId;
  }
  return a === b;
}

/**
 * SITE submenu choices. Empty / missing sites keep FUSED only and hide
 * MULTI plus every site-specific cap.
 */
export function siteDcbChoices(sites: readonly RadarSite[]): SurveillanceMode[] {
  if (isImplicitFusedSurveillance(sites)) {
    return ["FUSED"];
  }
  return ["FUSED", "MULTI", ...sites.map((site) => ({ siteId: site.id }))];
}

export function parseSurveillanceMode(value: unknown): SurveillanceMode {
  if (value === "FUSED" || value === "MULTI") {
    return value;
  }
  if (value !== null && typeof value === "object") {
    const siteId = (value as { siteId?: unknown }).siteId;
    if (typeof siteId === "string" && siteId.length > 0) {
      return { siteId };
    }
  }
  return "FUSED";
}

/** PREF restore: unknown / unavailable site id falls back to FUSED. */
export function resolveSurveillancePref(
  value: unknown,
  sites: readonly RadarSite[],
): SurveillanceMode {
  return effectiveSurveillanceMode(parseSurveillanceMode(value), sites);
}

/**
 * Empty catalog is implicit FUSED. Unknown `{ siteId }` also falls back so
 * the sampler cannot crash on a missing SITE row.
 */
export function effectiveSurveillanceMode(
  mode: SurveillanceMode,
  sites: readonly RadarSite[],
): SurveillanceMode {
  if (isImplicitFusedSurveillance(sites)) {
    return "FUSED";
  }
  const siteId = selectedSiteId(mode);
  if (siteId != null && !sites.some((site) => site.id === siteId)) {
    return "FUSED";
  }
  return mode;
}

export function horizontalRangeNm(
  eastNm: number,
  northNm: number,
  site: Pick<RadarSite, "xNm" | "yNm">,
): number {
  return Math.hypot(eastNm - site.xNm, northNm - site.yNm);
}

export function siteCovers(
  site: Pick<RadarSite, "xNm" | "yNm" | "rangeNm">,
  eastNm: number,
  northNm: number,
): boolean {
  return horizontalRangeNm(eastNm, northNm, site) <= site.rangeNm;
}

export function coveringSites(
  sites: readonly RadarSite[],
  eastNm: number,
  northNm: number,
): RadarSite[] {
  return sites.filter((site) => siteCovers(site, eastNm, northNm));
}

/**
 * Nearest covering site only. Equal range keeps catalog order (first wins).
 */
export function nearestCoveringSite(
  sites: readonly RadarSite[],
  eastNm: number,
  northNm: number,
): RadarSite | null {
  let best: RadarSite | null = null;
  let bestRange = Infinity;
  for (const site of sites) {
    if (!siteCovers(site, eastNm, northNm)) {
      continue;
    }
    const range = horizontalRangeNm(eastNm, northNm, site);
    if (range < bestRange) {
      best = site;
      bestRange = range;
    }
  }
  return best;
}

export function surveillancePaintFor(
  mode: SurveillanceMode,
  sites: readonly RadarSite[],
): SurveillancePaint {
  const effective = effectiveSurveillanceMode(mode, sites);
  if (effective === "FUSED") {
    return "fused-puck";
  }
  if (effective === "MULTI") {
    return "multi-rect";
  }
  return "site-rect";
}

export function sourceSiteFor(
  mode: SurveillanceMode,
  sites: readonly RadarSite[],
  eastNm: number,
  northNm: number,
): RadarSite | null {
  const effective = effectiveSurveillanceMode(mode, sites);
  if (effective === "FUSED") {
    return null;
  }
  if (effective === "MULTI") {
    return nearestCoveringSite(sites, eastNm, northNm);
  }
  return sites.find((site) => site.id === effective.siteId) ?? null;
}

export function isInSurveillanceCoverage(
  mode: SurveillanceMode,
  sites: readonly RadarSite[],
  eastNm: number,
  northNm: number,
): boolean {
  const effective = effectiveSurveillanceMode(mode, sites);
  if (effective === "FUSED") {
    return isImplicitFusedSurveillance(sites) || coveringSites(sites, eastNm, northNm).length > 0;
  }
  if (effective === "MULTI") {
    return nearestCoveringSite(sites, eastNm, northNm) != null;
  }
  const site = sites.find((row) => row.id === effective.siteId);
  return site != null && siteCovers(site, eastNm, northNm);
}

export function reportPeriodMs(
  mode: SurveillanceMode,
  sites: readonly RadarSite[],
  eastNm: number,
  northNm: number,
): number | null {
  if (!isInSurveillanceCoverage(mode, sites, eastNm, northNm)) {
    return null;
  }
  const effective = effectiveSurveillanceMode(mode, sites);
  if (effective === "FUSED") {
    return FUSED_PERIOD_MS;
  }
  const site = sourceSiteFor(effective, sites, eastNm, northNm);
  return site?.periodMs ?? FUSED_PERIOD_MS;
}

function captureReport(
  ac: SurveillanceWorldPose,
  nowMs: number,
  mode: SurveillanceMode,
  sites: readonly RadarSite[],
): SurveillanceReport {
  const source = sourceSiteFor(mode, sites, ac.xNm, ac.yNm);
  return {
    aircraftId: ac.id,
    xNm: ac.xNm,
    yNm: ac.yNm,
    headingDeg: ac.headingDeg,
    speedKt: ac.speedKt,
    altitudeFt: ac.altitudeFt,
    reportedAtSimMs: nowMs,
    sourceSiteId: source?.id ?? null,
    paint: surveillancePaintFor(mode, sites),
  };
}

/**
 * Advance the sampler to `nowMs` (injectable clock / sim time). Issues a
 * report when coverage holds and the mode period has elapsed. Drops the last
 * report immediately when the current world pose is uncovered — no coast.
 */
export function stepSurveillanceSampler(
  sampler: SurveillanceSampler,
  aircraft: readonly SurveillanceWorldPose[],
  nowMs: number = sampler.nowMs(),
): SurveillanceReport[] {
  const living = new Set(aircraft.map((ac) => ac.id));
  for (const id of [...sampler.reports.keys()]) {
    if (!living.has(id)) {
      sampler.reports.delete(id);
    }
  }

  const issued: SurveillanceReport[] = [];
  for (const ac of aircraft) {
    const covered = isInSurveillanceCoverage(sampler.mode, sampler.sites, ac.xNm, ac.yNm);
    if (!covered) {
      sampler.reports.delete(ac.id);
      continue;
    }
    const period = reportPeriodMs(sampler.mode, sampler.sites, ac.xNm, ac.yNm);
    if (period == null) {
      sampler.reports.delete(ac.id);
      continue;
    }
    const prev = sampler.reports.get(ac.id);
    if (prev != null && nowMs - prev.reportedAtSimMs < period) {
      continue;
    }
    const report = captureReport(ac, nowMs, sampler.mode, sampler.sites);
    sampler.reports.set(ac.id, report);
    issued.push(report);
  }
  return issued;
}

export function displayReportFor(
  sampler: Pick<SurveillanceSampler, "reports">,
  aircraftId: string,
): SurveillanceReport | null {
  return sampler.reports.get(aircraftId) ?? null;
}

/** Overlay last report pose on a world aircraft. Never use world xy between reports. */
export function aircraftAtReport<T extends SurveillanceWorldPose>(
  ac: T,
  report: SurveillanceReport,
): T {
  return {
    ...ac,
    xNm: report.xNm,
    yNm: report.yNm,
    headingDeg: report.headingDeg,
    speedKt: report.speedKt,
    altitudeFt: report.altitudeFt,
  };
}

function orientedRectCorners(
  cx: number,
  cy: number,
  axisX: number,
  axisY: number,
  lengthPx: number,
  thicknessPx: number,
): [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] {
  const perpX = -axisY;
  const perpY = axisX;
  const halfLen = lengthPx / 2;
  const halfTh = thicknessPx / 2;
  return [
    { x: cx + axisX * halfLen + perpX * halfTh, y: cy + axisY * halfLen + perpY * halfTh },
    { x: cx - axisX * halfLen + perpX * halfTh, y: cy - axisY * halfLen + perpY * halfTh },
    { x: cx - axisX * halfLen - perpX * halfTh, y: cy - axisY * halfLen - perpY * halfTh },
    { x: cx + axisX * halfLen - perpX * halfTh, y: cy + axisY * halfLen - perpY * halfTh },
  ];
}

/**
 * MULTI rectangle corners in screen px. Long axis is perpendicular to PTL
 * / history (ground-track heading, 0° = north / up). Not leader. Analog: CRC MULTI.
 */
export function multiRectCorners(
  cx: number,
  cy: number,
  headingDeg: number,
  lengthPx: number = MULTI_RECT_LENGTH_PX,
  thicknessPx: number = MULTI_RECT_THICKNESS_PX,
): [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] {
  const rad = (headingDeg * Math.PI) / 180;
  const trackX = Math.sin(rad);
  const trackY = -Math.cos(rad);
  return orientedRectCorners(cx, cy, -trackY, trackX, lengthPx, thicknessPx);
}

export interface SiteRectMark {
  corners: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  farLine: { x1: number; y1: number; x2: number; y2: number };
  outlineOnly: boolean;
  rangeNm: number;
  lengthPx: number;
  thicknessPx: number;
}

function lerpPx(minPx: number, maxPx: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return minPx + (maxPx - minPx) * u;
}

/**
 * Single-site position mark. Long axis is perpendicular to the site radial
 * (rectangle faces the antenna). Size grows with range. Green far-side line
 * sits opposite the antenna. Outline-only when very far.
 */
export function siteRectMark(
  cx: number,
  cy: number,
  reportXNm: number,
  reportYNm: number,
  antennaXNm: number,
  antennaYNm: number,
  siteRangeNm: number,
): SiteRectMark {
  const dxNm = antennaXNm - reportXNm;
  const dyNm = antennaYNm - reportYNm;
  const rangeNm = Math.hypot(dxNm, dyNm);
  const coverage = siteRangeNm > 0 ? siteRangeNm : 60;
  let towardX = 0;
  let towardY = -1;
  if (rangeNm >= 1e-9) {
    towardX = dxNm / rangeNm;
    towardY = -dyNm / rangeNm;
  }
  const t = Math.max(0, Math.min(1, rangeNm / coverage));
  const lengthPx = lerpPx(SITE_RECT_MIN_LENGTH_PX, SITE_RECT_MAX_LENGTH_PX, t);
  const thicknessPx = lerpPx(SITE_RECT_MIN_THICKNESS_PX, SITE_RECT_MAX_THICKNESS_PX, t);
  const longX = -towardY;
  const longY = towardX;
  const corners = orientedRectCorners(cx, cy, longX, longY, lengthPx, thicknessPx);
  const farOff = thicknessPx / 2 + SITE_FAR_LINE_GAP_PX;
  const fx = cx - towardX * farOff;
  const fy = cy - towardY * farOff;
  const halfLen = (lengthPx * SITE_FAR_LINE_LENGTH_SCALE) / 2;
  return {
    corners,
    farLine: {
      x1: fx - longX * halfLen,
      y1: fy - longY * halfLen,
      x2: fx + longX * halfLen,
      y2: fy + longY * halfLen,
    },
    outlineOnly: rangeNm >= coverage * SITE_RECT_OUTLINE_RANGE_FRACTION,
    rangeNm,
    lengthPx,
    thicknessPx,
  };
}
