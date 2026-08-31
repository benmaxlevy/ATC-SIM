/**
 * Tiny STT prompt prior: procedure-referenced fix ids only.
 *
 * Analog ATC has no X-ATC-Fixes. Haynes (HAINZ) / AJ (AJAAY) transcribed
 * without being in the first 64 file-order registry ids.
 * R11 CIFP ids are catalog lookup, not STT vocabulary; T03-19 does not require
 * the spoken fix in X-ATC-Fixes.
 *
 * STT runs before a transcript exists — do not retrieve or rank from audio.
 */

export const MAX_STT_FIX_PRIOR = 16;

interface ProcedureLeg {
  fixId?: string;
}

interface HighValueFixCatalog {
  stars?: ReadonlyArray<{
    transitions?: ReadonlyArray<{ legs?: readonly ProcedureLeg[] }>;
    common?: readonly ProcedureLeg[];
  }>;
  sids?: ReadonlyArray<{
    runwayTransitions?: ReadonlyArray<{ legs?: readonly ProcedureLeg[] }>;
    common?: readonly ProcedureLeg[];
    enrouteTransitions?: ReadonlyArray<{
      legs?: readonly ProcedureLeg[];
      runwayTransitions?: ReadonlyArray<{ legs?: readonly ProcedureLeg[] }>;
    }>;
    legs?: readonly ProcedureLeg[];
  }>;
  approaches?: ReadonlyArray<{
    locNavaidId?: string;
    gsNavaidId?: string;
    fafFixId?: string;
    thresholdFixId?: string;
    missed?: { directFixId?: string };
  }>;
}

function addId(out: Set<string>, raw: string | undefined): void {
  if (typeof raw !== "string") {
    return;
  }
  const up = raw.trim().toUpperCase();
  if (up !== "") {
    out.add(up);
  }
}

function addLegs(out: Set<string>, legs: readonly ProcedureLeg[] | undefined): void {
  for (const leg of legs ?? []) {
    addId(out, leg.fixId);
  }
}

/**
 * Unique STAR/SID/approach referenced ids, sorted by id, capped at 16.
 * Skips `navaids[]` / `fixes[]` file-order dumps. Empty catalog → [].
 */
export function highValueFixIds(catalog?: HighValueFixCatalog | null): string[] {
  if (!catalog) {
    return [];
  }
  const out = new Set<string>();
  for (const star of catalog.stars ?? []) {
    addLegs(out, star.common);
    for (const transition of star.transitions ?? []) {
      addLegs(out, transition.legs);
    }
  }
  for (const sid of catalog.sids ?? []) {
    addLegs(out, sid.common);
    addLegs(out, sid.legs);
    for (const runway of sid.runwayTransitions ?? []) {
      addLegs(out, runway.legs);
    }
    for (const enroute of sid.enrouteTransitions ?? []) {
      addLegs(out, enroute.legs);
      for (const runway of enroute.runwayTransitions ?? []) {
        addLegs(out, runway.legs);
      }
    }
  }
  for (const approach of catalog.approaches ?? []) {
    addId(out, approach.locNavaidId);
    addId(out, approach.gsNavaidId);
    addId(out, approach.fafFixId);
    addId(out, approach.thresholdFixId);
    addId(out, approach.missed?.directFixId);
  }
  return [...out].sort().slice(0, MAX_STT_FIX_PRIOR);
}
