/**
 * Arrival-airport approach context resolver and satellite ILS parity (T04-81).
 *
 * Resolves approach procedures and localizer/glidepath geometry against the
 * aircraft's authoritative arrival airport rather than the center facility alone.
 *
 * Generic: walks catalog and regional facilities without facility-specific branches.
 */

import type { Aircraft } from "../aircraft";
import { flightPlanForAircraft } from "../flightPlan";
import type { World } from "../world";
import { buildFixRegistry, type FixRegistry } from "./fixRegistry";
import { latLonToNm, type LatLon } from "./geometry";
import type { Navaid, NavFix, ProcedureCatalog } from "../../scenario/procedures/types";
import { loadRegionalAirportCatalog } from "../../scenario/regionalCatalogs";
import type { RegionalAirport, RegionalFacility } from "../../scenario/regional";
import type { CatalogApproach } from "../../parse/spoken/catalog-ground";

export interface ApproachContext {
  readonly airportIcao: string;
  readonly catalog?: ProcedureCatalog | null;
  readonly fixRegistry?: FixRegistry | null;
  readonly ilsComponents?: ReadonlyArray<Navaid>;
}

const approachContextCache = new Map<string, ApproachContext>();
const regionalSatelliteIlsCache = new Map<string, CatalogApproach[]>();

/** Clear cached regional approach contexts (for tests and session restarts). */
export function clearApproachContextCache(): void {
  approachContextCache.clear();
  regionalSatelliteIlsCache.clear();
}

/** Check whether an identifier matches a known airport in regional or center catalog. */
function isKnownAirport(icao: string, world: World): boolean {
  const norm = icao.trim().toUpperCase();
  if (norm.length === 0) return false;
  if (world.catalog?.airportId?.trim().toUpperCase() === norm) return true;
  const regional = world.regional as RegionalFacility | undefined;
  if (regional) {
    if (typeof regional.hasAirport === "function" && regional.hasAirport(norm)) {
      return true;
    }
    if (typeof regional.getAirport === "function" && regional.getAirport(norm) !== undefined) {
      return true;
    }
    if (
      Array.isArray(regional.airports) &&
      regional.airports.some((a) => a?.icao?.trim().toUpperCase() === norm)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve target destination ICAO according to deterministic precedence:
 * 1. activeClearance.limitId (ONLY if matching a known airport). Fix limits fall through.
 * 2. Correlated flight plan destination: flightPlan.airportId or flightPlan.destination.
 * 3. Ambient VFR destination: ambientVfr.destinationAirportId.
 * 4. Authored destination fields: destination or destinationAirport.
 * 5. Center default: world.catalog.airportId.
 */
export function resolveDestinationAirportIcao(aircraft: Aircraft, world: World): string {
  // 1. activeClearance.limitId (ONLY if matching known airport)
  const limit = aircraft.activeClearance?.limitId?.trim().toUpperCase();
  if (limit && isKnownAirport(limit, world)) {
    return limit;
  }

  // 2. Correlated flight plan destination
  let fpDest: string | undefined;
  const correlatedPlan =
    (world.aircraft?.some((a) => a.id === aircraft.id)
      ? flightPlanForAircraft(world, aircraft.id)
      : undefined) ??
    world.flightPlans?.find(
      (fp) =>
        (aircraft.callsign && fp.acid.toUpperCase() === aircraft.callsign.toUpperCase()) ||
        (aircraft.reportedSquawk && fp.assignedBeacon === aircraft.reportedSquawk) ||
        (aircraft.squawk && fp.assignedBeacon === aircraft.squawk),
    );
  if (correlatedPlan) {
    fpDest = correlatedPlan.airportId ?? (correlatedPlan as { destination?: string }).destination;
  }
  if (!fpDest) {
    fpDest =
      (aircraft.flightPlan as { airportId?: string; destination?: string } | undefined)
        ?.airportId ??
      aircraft.flightPlan?.destination ??
      (aircraft.fp as { airportId?: string; destination?: string } | undefined)?.airportId ??
      aircraft.fp?.destination;
  }
  if (fpDest?.trim()) {
    return fpDest.trim().toUpperCase();
  }

  // 3. Ambient VFR destination
  const ambDest = aircraft.ambientVfr?.destinationAirportId;
  if (ambDest?.trim()) {
    return ambDest.trim().toUpperCase();
  }

  // 4. Authored destination fields
  const authoredDest = aircraft.destination ?? aircraft.destinationAirport;
  if (authoredDest?.trim()) {
    return authoredDest.trim().toUpperCase();
  }

  // 5. Center default
  const centerIcao = world.catalog?.airportId?.trim().toUpperCase();
  if (centerIcao) {
    return centerIcao;
  }

  return "";
}

const ILS_COMPONENT_KINDS = new Set(["LOC", "GS", "DME", "OM", "MM", "IM"]);

/**
 * Resolve the approach context (catalog, fixRegistry, ilsComponents) for an aircraft.
 * Center destination returns world.catalog and world.fixRegistry directly.
 * Satellite destination loads and projects catalog/fixRegistry once per session.
 */
export function resolveApproachContext(aircraft: Aircraft, world: World): ApproachContext {
  const targetIcao = resolveDestinationAirportIcao(aircraft, world);
  const centerIcao = world.catalog?.airportId?.trim().toUpperCase() ?? "";

  // If matches center default, return world.catalog and world.fixRegistry byte-identically
  if (targetIcao === centerIcao || targetIcao === "") {
    const navaids = world.catalog?.navaids ?? [];
    return {
      airportIcao: targetIcao || centerIcao,
      catalog: (world.catalog as ProcedureCatalog) ?? null,
      fixRegistry: world.fixRegistry ?? null,
      ilsComponents: navaids.filter(
        (n): n is Navaid => typeof n.kind === "string" && ILS_COMPONENT_KINDS.has(n.kind),
      ),
    };
  }

  // Satellite airport lookup
  const regional = world.regional as RegionalFacility | undefined;
  const centerKey = regional?.centerAirportId ?? centerIcao ?? "DEFAULT";
  const cacheKey = `${centerKey.toUpperCase()}:${targetIcao}`;

  const cached = approachContextCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (!regional || typeof regional.getAirport !== "function") {
    const fallback: ApproachContext = {
      airportIcao: targetIcao,
      catalog: null,
      fixRegistry: null,
      ilsComponents: [],
    };
    approachContextCache.set(cacheKey, fallback);
    return fallback;
  }

  const satAirport = regional.getAirport(targetIcao);
  if (!satAirport || !satAirport.catalogRef) {
    const fallback: ApproachContext = {
      airportIcao: targetIcao,
      catalog: null,
      fixRegistry: null,
      ilsComponents: [],
    };
    approachContextCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const rawCatalog = loadRegionalAirportCatalog(regional, targetIcao);
    const centerArp = (regional.arp ?? (world.catalog as unknown as { arp?: LatLon })?.arp) as
      LatLon | undefined;
    const satArpNm =
      satAirport.arpNm ??
      (satAirport.arp && centerArp ? latLonToNm(satAirport.arp, centerArp) : { xNm: 0, yNm: 0 });

    const projectedNavaids: Navaid[] = rawCatalog.navaids.map((n) => {
      const pos =
        n.latDeg !== undefined && n.lonDeg !== undefined && centerArp
          ? latLonToNm({ latDeg: n.latDeg, lonDeg: n.lonDeg }, centerArp)
          : { xNm: n.xNm + satArpNm.xNm, yNm: n.yNm + satArpNm.yNm };
      return { ...n, xNm: pos.xNm, yNm: pos.yNm };
    });

    const projectedFixes: NavFix[] = rawCatalog.fixes.map((f) => {
      const pos =
        f.latDeg !== undefined && f.lonDeg !== undefined && centerArp
          ? latLonToNm({ latDeg: f.latDeg, lonDeg: f.lonDeg }, centerArp)
          : { xNm: f.xNm + satArpNm.xNm, yNm: f.yNm + satArpNm.yNm };
      return { ...f, xNm: pos.xNm, yNm: pos.yNm };
    });

    // Ensure runway threshold fixes from regional geometry exist in projectedFixes
    if (Array.isArray(satAirport.runways)) {
      const fixIdSet = new Set(projectedFixes.map((f) => f.id.toUpperCase()));
      for (const rwy of satAirport.runways) {
        const rwyFixId = `RW${rwy.id.toUpperCase()}`;
        if (!fixIdSet.has(rwyFixId)) {
          projectedFixes.push({
            id: rwyFixId,
            kind: "THRESHOLD",
            xNm: rwy.thresholdNm.xNm,
            yNm: rwy.thresholdNm.yNm,
            latDeg: rwy.threshold.latDeg,
            lonDeg: rwy.threshold.lonDeg,
          });
          fixIdSet.add(rwyFixId);
        }
      }
    }

    const fixRegistry = buildFixRegistry({ navaids: projectedNavaids, fixes: projectedFixes });
    const catalog: ProcedureCatalog = {
      ...rawCatalog,
      navaids: projectedNavaids,
      fixes: projectedFixes,
    };
    const ilsComponents = projectedNavaids.filter((n) => ILS_COMPONENT_KINDS.has(n.kind));

    const ctx: ApproachContext = {
      airportIcao: targetIcao,
      catalog,
      fixRegistry,
      ilsComponents,
    };
    approachContextCache.set(cacheKey, ctx);
    return ctx;
  } catch {
    const fallback: ApproachContext = {
      airportIcao: targetIcao,
      catalog: null,
      fixRegistry: null,
      ilsComponents: [],
    };
    approachContextCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Retrieve all satellite ILS approaches across regional airports for Path C candidate lists.
 * Cached per regional facility center airport so it is built at most once per session.
 */
export function regionalSatelliteIlsApproaches(regional: unknown): CatalogApproach[] {
  const facility = regional as RegionalFacility | undefined;
  if (!facility || typeof facility.getAirport !== "function" || !Array.isArray(facility.airports)) {
    return [];
  }

  const cacheKey = facility.centerAirportId.toUpperCase();
  const cached = regionalSatelliteIlsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const approaches: CatalogApproach[] = [];
  const seenIds = new Set<string>();

  for (const apt of facility.airports) {
    if (
      apt.icao.toUpperCase() === facility.centerAirportId.toUpperCase() ||
      !apt.catalogRef ||
      !apt.hasPublishedApproaches
    ) {
      continue;
    }
    try {
      const catalog = loadRegionalAirportCatalog(facility, apt.icao);
      for (const app of catalog.approaches) {
        if (app.type?.toUpperCase() === "ILS" && !seenIds.has(app.id.toUpperCase())) {
          seenIds.add(app.id.toUpperCase());
          approaches.push({
            id: app.id,
            name: app.name,
            runway: app.runway,
          });
        }
      }
    } catch {
      // Ignore unparseable or incomplete satellite catalogs
    }
  }

  regionalSatelliteIlsCache.set(cacheKey, approaches);
  return approaches;
}

export interface VisualRunwayGeometry {
  runwayId: string;
  threshold: { xNm: number; yNm: number };
  headingDeg: number;
  fieldElevFt: number;
  lengthFt?: number;
}

export function normalizeRunwayId(raw: string): string {
  const clean = raw.replace(/^RW/i, "").trim().toUpperCase();
  const m = clean.match(/^0?(\d{1,2})([LRC]?)$/);
  if (m) {
    return `${Number(m[1])}${m[2]}`;
  }
  return clean;
}

export function matchesRunway(a: string, b: string): boolean {
  return normalizeRunwayId(a) === normalizeRunwayId(b);
}

/** Resolve only complete regional runway geometry used by visual application/validation. */
export function resolveRegionalRunwayGeometry(
  airport: Pick<RegionalAirport, "fieldElevFt" | "runways">,
  runwayId: string,
): VisualRunwayGeometry | null {
  if (!Array.isArray(airport.runways)) return null;
  const rwy = airport.runways.find((candidate) => matchesRunway(candidate.id, runwayId));
  if (
    !rwy ||
    !Number.isFinite(rwy.thresholdNm?.xNm) ||
    !Number.isFinite(rwy.thresholdNm?.yNm) ||
    !Number.isFinite(rwy.headingMagDeg) ||
    rwy.headingMagDeg < 0 ||
    rwy.headingMagDeg >= 360 ||
    !Number.isFinite(rwy.lengthFt) ||
    rwy.lengthFt <= 0 ||
    !Number.isFinite(airport.fieldElevFt)
  ) {
    return null;
  }
  return {
    runwayId: rwy.id,
    threshold: { xNm: rwy.thresholdNm.xNm, yNm: rwy.thresholdNm.yNm },
    headingDeg: rwy.headingMagDeg,
    fieldElevFt: airport.fieldElevFt,
    lengthFt: rwy.lengthFt,
  };
}

function regionalAirportForDestination(
  regional: RegionalFacility,
  destinationIcao: string,
): RegionalAirport | undefined {
  return typeof regional.getAirport === "function"
    ? regional.getAirport(destinationIcao)
    : regional.airports?.find((airport) => airport?.icao?.toUpperCase() === destinationIcao);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function resolveRegionalRunwayGeometryForAircraft(
  aircraft: Aircraft,
  runwayId: string,
  regional: RegionalFacility,
  destinationIcao?: string | null,
): VisualRunwayGeometry | null {
  const knownAirport = (icao: string) =>
    typeof regional.hasAirport === "function"
      ? regional.hasAirport(icao)
      : Boolean(regionalAirportForDestination(regional, icao));
  const activeLimit = aircraft.activeClearance?.limitId?.trim().toUpperCase();
  const flightPlanDestination =
    (aircraft.flightPlan as { airportId?: string; destination?: string } | undefined)?.airportId ??
    aircraft.flightPlan?.destination ??
    (aircraft.fp as { airportId?: string; destination?: string } | undefined)?.airportId ??
    aircraft.fp?.destination;
  const destination =
    (activeLimit && knownAirport(activeLimit) ? activeLimit : undefined) ??
    flightPlanDestination?.trim().toUpperCase() ??
    aircraft.ambientVfr?.destinationAirportId?.trim().toUpperCase() ??
    destinationIcao?.trim().toUpperCase() ??
    aircraft.destination?.trim().toUpperCase() ??
    aircraft.destinationAirport?.trim().toUpperCase();
  if (!destination) return null;
  const airport = regionalAirportForDestination(regional, destination);
  return airport ? resolveRegionalRunwayGeometry(airport, runwayId) : null;
}

type CatalogRunwaySource = {
  fieldElevFt?: number;
  approaches?: ReadonlyArray<{
    id: string;
    runway?: string;
    thresholdFixId?: string;
    publishedCourseMagneticDeg?: number;
    courseDeg?: number;
  }>;
  fixes?: ReadonlyArray<{ id: string; xNm?: number; yNm?: number }>;
};

function resolveCatalogRunwayGeometry(
  cat: CatalogRunwaySource,
  runwayId: string,
): VisualRunwayGeometry | null {
  const fieldElevFt = cat.fieldElevFt;
  const app = cat.approaches?.find((a) => matchesRunway(a.runway ?? a.id, runwayId));
  if (!isFiniteNumber(fieldElevFt) || !app?.thresholdFixId) return null;
  const fix = cat.fixes?.find((f) => f.id === app.thresholdFixId);
  const xNm = fix?.xNm;
  const yNm = fix?.yNm;
  const headingCandidate = app.publishedCourseMagneticDeg ?? app.courseDeg;
  if (!isFiniteNumber(xNm) || !isFiniteNumber(yNm) || !isFiniteNumber(headingCandidate)) {
    return null;
  }
  if (headingCandidate < 0 || headingCandidate >= 360) return null;
  const headingDeg = headingCandidate;
  return {
    runwayId: app.runway ?? runwayId.replace(/^RW/i, "").toUpperCase(),
    threshold: { xNm, yNm },
    headingDeg,
    fieldElevFt,
  };
}

/**
 * Resolve visual runway geometry (threshold, heading, field elevation)
 * against the aircraft's resolved arrival airport.
 */
export function resolveRunwayGeometry(
  aircraft: Aircraft,
  runwayId: string,
  world: World,
): VisualRunwayGeometry | null {
  const destIcao = resolveDestinationAirportIcao(aircraft, world);
  const regional = world.regional as RegionalFacility | undefined;

  if (regional) {
    const geometry = resolveRegionalRunwayGeometryForAircraft(
      aircraft,
      runwayId,
      regional,
      destIcao,
    );
    if (geometry) return geometry;
    if (destIcao !== (world.catalog?.airportId?.trim().toUpperCase() ?? "")) return null;
  }

  const appCtx = resolveApproachContext(aircraft, world);
  const centerIcao = world.catalog?.airportId?.trim().toUpperCase() ?? "";
  const cat = appCtx.catalog ?? (destIcao === centerIcao ? world.catalog : undefined);
  if (cat) {
    const geometry = resolveCatalogRunwayGeometry(cat, runwayId);
    if (geometry) return geometry;
  }

  return null;
}
