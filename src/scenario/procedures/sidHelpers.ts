/**
 * Analog: JO 7110.65 Standard Instrument Departures (SIDs) / AIM 5-2-8.
 * Facility-generic SID helpers: resolve ordered sequence of fix IDs
 * across runway transitions, common route, and enroute transitions.
 */

import type { ProcedureCatalog, SidProcedure } from "./types";

export function findSidProcedure(catalog: ProcedureCatalog, sidId: string): SidProcedure {
  const wantSid = sidId.trim().toUpperCase();
  const sid = catalog.sids.find((item) => item.id.trim().toUpperCase() === wantSid);
  if (!sid) {
    throw new Error(`Unknown SID ${sidId}`);
  }
  return sid;
}

/**
 * Returns the complete ordered fix sequence for a SID, optionally including
 * runway transition legs and enroute transition legs.
 * Consecutive duplicate fix IDs (e.g. at transition join boundaries) are deduplicated.
 */
export function sidRouteFixIds(
  catalog: ProcedureCatalog,
  sidId: string,
  runwayId?: string,
  transitionId?: string,
): string[] {
  const sid = findSidProcedure(catalog, sidId);
  const fixIds: string[] = [];

  if (runwayId !== undefined) {
    const wantRwy = runwayId.trim().toUpperCase();
    const rt = sid.runwayTransitions?.find(
      (item) => item.runwayId.trim().toUpperCase() === wantRwy,
    );
    if (!rt) {
      throw new Error(`Unknown runway transition ${runwayId} on SID ${sidId}`);
    }
    for (const leg of rt.legs) {
      fixIds.push(leg.fixId);
    }
  }

  for (const leg of sid.common) {
    if (fixIds.length === 0 || fixIds[fixIds.length - 1] !== leg.fixId) {
      fixIds.push(leg.fixId);
    }
  }

  if (transitionId !== undefined) {
    const wantTrans = transitionId.trim().toUpperCase();
    const et = sid.enrouteTransitions?.find((item) => item.id.trim().toUpperCase() === wantTrans);
    if (!et) {
      throw new Error(`Unknown enroute transition ${transitionId} on SID ${sidId}`);
    }
    for (const leg of et.legs) {
      if (fixIds.length === 0 || fixIds[fixIds.length - 1] !== leg.fixId) {
        fixIds.push(leg.fixId);
      }
    }
  }

  return fixIds;
}

export interface SidNameCatalog {
  sids?: ReadonlyArray<{ id: string; name?: string }>;
}

/**
 * Resolves spoken procedure name for a SID id from catalog metadata.
 * Strips trailing " DEPARTURE" if present (e.g. "DEMO ONE DEPARTURE" -> "DEMO ONE").
 * Falls back to sidId if not found.
 */
export function sidSpokenName(catalog: SidNameCatalog | null | undefined, sidId: string): string {
  const want = sidId.trim().toUpperCase();
  const sid = catalog?.sids?.find((item) => item.id.trim().toUpperCase() === want);
  const name = sid?.name?.trim();
  if (!name) {
    return sidId;
  }
  const clean = name.replace(/\s+departure$/i, "").trim();
  return clean.length > 0 ? clean : name;
}
