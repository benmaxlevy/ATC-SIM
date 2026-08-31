/**
 * Analog: CRC / vNAS STARS SITE FUSED / MULTI / single-site display
 * (docs.virtualnas.net/crc/stars — R07). FOA STARS display-data / radar
 * coverage (R05).
 *
 * Trainer delta (frozen): FUSED reports every 1000 ms and keeps the existing
 * blue circle puck (`TARGET_PUCK_BG`). Single-site and MULTI use the covering
 * site `periodMs` (airport/ASR fixtures 4800 ms). MULTI paints a thick blue
 * rectangle centered on the glyph, perpendicular to PTL ground track (not
 * leader). Single-site paints a thin green slash through the glyph aimed at
 * that site’s antenna — no blue block. Out of coverage: no paint, no 30 s
 * coast. Empty `radarSites` is implicit FUSED.
 *
 * World / FMS / CA / MSAW stay 20 Hz truth. Display consumers (PPI symbol,
 * datablock, PTL, ATPA cones) use last report pose only. History dots record
 * on report arrival. Not a live sensor. Not NAS STARS.
 */

import { isImplicitFusedSurveillance } from "@scenario";
import type { RadarSite } from "@scenario";
import { PALETTE } from "./palette";

/** Frozen FUSED report period. Single-site / MULTI use authored `periodMs`. */
export const FUSED_PERIOD_MS = 1000;

/** Same CSS px as `TARGET_SIZE_PX` — kept local so this module cannot cycle. */
const SYMBOL_LENGTH_PX = 8;

/** MULTI mark: long axis ≈ symbol, thick fill, ⊥ ground track. */
export const MULTI_RECT_LENGTH_PX = SYMBOL_LENGTH_PX + 2;
export const MULTI_RECT_THICKNESS_PX = 4;

/** Single-site slash: ≈ symbol length, thin green, aimed at antenna. */
export const SITE_SLASH_LENGTH_PX = SYMBOL_LENGTH_PX;
export const SITE_SLASH_STROKE_PX = 1;
export const SITE_SLASH_COLOR = PALETTE.unowned;
/** Same frozen blue as `TARGET_PUCK_BG`. */
export const MULTI_RECT_COLOR = "#175dc7";

export type SurveillanceMode = "FUSED" | "MULTI" | { siteId: string };
export type SurveillancePaint = "fused-puck" | "multi-rect" | "site-slash";

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
  return "site-slash";
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

/**
 * MULTI rectangle corners in screen px. Long axis is perpendicular to PTL
 * ground-track heading (0° = north / up). Not leader direction.
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
  const perpX = -trackY;
  const perpY = trackX;
  const halfLen = lengthPx / 2;
  const halfTh = thicknessPx / 2;
  return [
    { x: cx + perpX * halfLen + trackX * halfTh, y: cy + perpY * halfLen + trackY * halfTh },
    { x: cx - perpX * halfLen + trackX * halfTh, y: cy - perpY * halfLen + trackY * halfTh },
    { x: cx - perpX * halfLen - trackX * halfTh, y: cy - perpY * halfLen - trackY * halfTh },
    { x: cx + perpX * halfLen - trackX * halfTh, y: cy + perpY * halfLen - trackY * halfTh },
  ];
}

/**
 * Thin slash through the glyph. Screen vector aims from report pose toward
 * the site antenna (ENU). Length is approximately the position symbol.
 */
export function siteSlashEndpoints(
  cx: number,
  cy: number,
  reportXNm: number,
  reportYNm: number,
  antennaXNm: number,
  antennaYNm: number,
  lengthPx: number = SITE_SLASH_LENGTH_PX,
): { x1: number; y1: number; x2: number; y2: number } {
  const dxNm = antennaXNm - reportXNm;
  const dyNm = antennaYNm - reportYNm;
  const range = Math.hypot(dxNm, dyNm);
  const half = lengthPx / 2;
  if (range < 1e-9) {
    return { x1: cx, y1: cy - half, x2: cx, y2: cy + half };
  }
  const sx = (dxNm / range) * half;
  const sy = (-dyNm / range) * half;
  return { x1: cx - sx, y1: cy - sy, x2: cx + sx, y2: cy + sy };
}
