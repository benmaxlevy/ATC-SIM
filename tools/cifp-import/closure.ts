/**
 * Procedure-reference closure (T04-33).
 *
 * Radius seed is geographic only. Selected SID / STAR / approach records and
 * every supported reference are walked until the set is stable. Missing refs
 * are looked up in the full `NormalizedCifpSource`, never only `seed.selected`.
 * Required references are never silently dropped.
 *
 * T04-32 owns great-circle radius selection (`spatialIndex.ts`). This module
 * accepts a duck-typed seed so that later seed object is assignable here.
 */

import {
  type CifpDiagnostic,
  type NormalizedAirport,
  type NormalizedApproach,
  type NormalizedCifpSource,
  type NormalizedFix,
  type NormalizedNavaid,
  type NormalizedNavaidKind,
  type NormalizedProcedureLeg,
  type NormalizedRunway,
  type NormalizedSid,
  type NormalizedStar,
} from "./types.ts";

export interface ClosureSelected {
  airports: NormalizedAirport[];
  runways: NormalizedRunway[];
  navaids: NormalizedNavaid[];
  fixes: NormalizedFix[];
  stars: NormalizedStar[];
  sids: NormalizedSid[];
  approaches: NormalizedApproach[];
}

/**
 * Duck-typed pack seed. T04-32's radius-selection object should be assignable
 * to this shape; do not import a spatial-index module that ticket owns.
 */
export interface ClosureSeed {
  airportId: string;
  radiusNm?: number;
  selected: ClosureSelected;
}

export type ClosurePolicyKind = "airport-all" | "explicit";

export type ClosureErrorMode = "fail" | "report";

export interface ClosurePolicy {
  kind: ClosurePolicyKind;
  /** Used when `kind === "explicit"`. */
  sidIds?: readonly string[];
  starIds?: readonly string[];
  approachIds?: readonly string[];
  /** Default `fail`: throw after collecting error diagnostics. */
  onError?: ClosureErrorMode;
}

export type ClosureDiagnosticCode =
  | "MISSING_REFERENCE"
  | "AMBIGUOUS_REFERENCE"
  | "CROSS_AIRPORT_LEAKAGE"
  | "UNSUPPORTED_ELEMENT"
  | "UNKNOWN_PROCEDURE"
  | "MISSING_AIRPORT";

export type ClosureProcedureKind = "SID" | "STAR" | "APPROACH";

export interface ClosureDiagnostic {
  severity: "error" | "warning";
  code: ClosureDiagnosticCode;
  message: string;
  procedureKind?: ClosureProcedureKind;
  procedureId?: string;
  sourceRecord?: string;
  refId?: string;
  airportId?: string;
}

export interface ClosureCounts {
  airports: number;
  runways: number;
  navaids: number;
  fixes: number;
  stars: number;
  sids: number;
  approaches: number;
}

export interface ClosureResult {
  airportId: string;
  radiusNm?: number;
  closed: NormalizedCifpSource;
  diagnostics: ClosureDiagnostic[];
  seedCounts: ClosureCounts;
  closedCounts: ClosureCounts;
  addedCounts: ClosureCounts;
}

export function emptyClosureSelected(): ClosureSelected {
  return {
    airports: [],
    runways: [],
    navaids: [],
    fixes: [],
    stars: [],
    sids: [],
    approaches: [],
  };
}

export function closeProcedureReferences(
  source: NormalizedCifpSource,
  seed: ClosureSeed,
  policy: ClosurePolicy,
): ClosureResult {
  const airportId = seed.airportId;
  const diagnostics: ClosureDiagnostic[] = [];
  const onError: ClosureErrorMode = policy.onError ?? "fail";

  const airports = new Map<string, NormalizedAirport>();
  const runways = new Map<string, NormalizedRunway>();
  const navaids = new Map<string, NormalizedNavaid>();
  const fixes = new Map<string, NormalizedFix>();

  const seedAirportKeys = new Set<string>();
  const seedRunwayKeys = new Set<string>();
  const seedNavaidKeys = new Set<string>();
  const seedFixKeys = new Set<string>();

  for (const row of seed.selected.airports) {
    if (row.airportId !== airportId) {
      continue;
    }
    airports.set(row.identity.key, row);
    seedAirportKeys.add(row.identity.key);
  }
  const airport = source.airports.find((row) => row.airportId === airportId);
  if (airport === undefined) {
    diagnostics.push({
      severity: "error",
      code: "MISSING_AIRPORT",
      message: `CIFP closure: airport ${airportId} is missing from the normalized source`,
      airportId,
    });
  } else {
    airports.set(airport.identity.key, airport);
  }

  for (const row of seed.selected.runways) {
    if (row.airportId !== airportId) {
      continue;
    }
    runways.set(row.identity.key, row);
    seedRunwayKeys.add(row.identity.key);
  }
  for (const row of seed.selected.navaids) {
    if (row.airportId !== undefined && row.airportId !== airportId) {
      continue;
    }
    navaids.set(row.identity.key, row);
    seedNavaidKeys.add(row.identity.key);
  }
  for (const row of seed.selected.fixes) {
    if (row.airportId !== undefined && row.airportId !== airportId) {
      continue;
    }
    fixes.set(row.identity.key, row);
    seedFixKeys.add(row.identity.key);
  }

  const selected = selectProcedures(source, airportId, policy, diagnostics);

  const seedCounts: ClosureCounts = {
    airports: seedAirportKeys.size,
    runways: seedRunwayKeys.size,
    navaids: seedNavaidKeys.size,
    fixes: seedFixKeys.size,
    stars: seed.selected.stars.filter((row) => row.airportId === airportId).length,
    sids: seed.selected.sids.filter((row) => row.airportId === airportId).length,
    approaches: seed.selected.approaches.filter((row) => row.airportId === airportId).length,
  };

  const seenWork = new Set<string>();
  const queue: WorkItem[] = [];

  const enqueue = (item: WorkItem): void => {
    if (seenWork.has(item.key)) {
      return;
    }
    seenWork.add(item.key);
    queue.push(item);
  };

  for (const sid of selected.sids) {
    enqueue({
      key: `proc:${sid.identity.key}`,
      kind: "sid",
      sid,
    });
  }
  for (const star of selected.stars) {
    enqueue({
      key: `proc:${star.identity.key}`,
      kind: "star",
      star,
    });
  }
  for (const approach of selected.approaches) {
    enqueue({
      key: `proc:${approach.identity.key}`,
      kind: "approach",
      approach,
    });
  }
  for (const nav of sortByKey([...navaids.values()])) {
    enqueue({
      key: `walk-navaid:${nav.identity.key}`,
      kind: "walk-navaid",
      navaid: nav,
    });
  }

  const ctx = {
    source,
    airportId,
    diagnostics,
    airports,
    runways,
    navaids,
    fixes,
    enqueue,
  };

  while (queue.length > 0) {
    const item = queue.shift();
    if (item === undefined) {
      break;
    }
    processWork(item, ctx);
  }

  const closedAirports = sortByKey([...airports.values()]);
  const closedRunways = sortByKey([...runways.values()]);
  const closedNavaids = sortByKey([...navaids.values()]);
  const closedFixes = sortByKey([...fixes.values()]);
  const closedStars = selected.stars;
  const closedSids = selected.sids;
  const closedApproaches = selected.approaches;

  const closedCounts: ClosureCounts = {
    airports: closedAirports.length,
    runways: closedRunways.length,
    navaids: closedNavaids.length,
    fixes: closedFixes.length,
    stars: closedStars.length,
    sids: closedSids.length,
    approaches: closedApproaches.length,
  };
  const addedCounts: ClosureCounts = {
    airports: countAdded(closedAirports, seedAirportKeys),
    runways: countAdded(closedRunways, seedRunwayKeys),
    navaids: countAdded(closedNavaids, seedNavaidKeys),
    fixes: countAdded(closedFixes, seedFixKeys),
    stars: Math.max(0, closedStars.length - seedCounts.stars),
    sids: Math.max(0, closedSids.length - seedCounts.sids),
    approaches: Math.max(0, closedApproaches.length - seedCounts.approaches),
  };

  const closed: NormalizedCifpSource = {
    dialect: source.dialect,
    airports: closedAirports,
    runways: closedRunways,
    navaids: closedNavaids,
    fixes: closedFixes,
    stars: closedStars,
    sids: closedSids,
    approaches: closedApproaches,
    diagnostics: copyDiagnostics(source.diagnostics),
    skippedByType: { ...source.skippedByType },
  };

  const errors = diagnostics.filter((row) => row.severity === "error");
  if (onError === "fail" && errors.length > 0) {
    throw new Error(`CIFP closure: ${errors.map((row) => row.message).join("; ")}`);
  }

  const result: ClosureResult = {
    airportId,
    closed,
    diagnostics,
    seedCounts,
    closedCounts,
    addedCounts,
  };
  if (seed.radiusNm !== undefined) {
    result.radiusNm = seed.radiusNm;
  }
  return result;
}

type WorkItem =
  | { key: string; kind: "sid"; sid: NormalizedSid }
  | { key: string; kind: "star"; star: NormalizedStar }
  | { key: string; kind: "approach"; approach: NormalizedApproach }
  | { key: string; kind: "walk-navaid"; navaid: NormalizedNavaid }
  | {
      key: string;
      kind: "fix-ref";
      id: string;
      path: string;
      procedure: ProcedureRef;
    }
  | {
      key: string;
      kind: "navaid-ref";
      id: string;
      path: string;
      procedure: ProcedureRef;
      expectKind?: NormalizedNavaidKind;
    }
  | {
      key: string;
      kind: "runway-ref";
      id: string;
      path: string;
      procedure: ProcedureRef;
    };

interface ProcedureRef {
  kind: ClosureProcedureKind;
  id: string;
  sourceRecord: string;
}

interface ClosureCtx {
  source: NormalizedCifpSource;
  airportId: string;
  diagnostics: ClosureDiagnostic[];
  airports: Map<string, NormalizedAirport>;
  runways: Map<string, NormalizedRunway>;
  navaids: Map<string, NormalizedNavaid>;
  fixes: Map<string, NormalizedFix>;
  enqueue: (item: WorkItem) => void;
}

function selectProcedures(
  source: NormalizedCifpSource,
  airportId: string,
  policy: ClosurePolicy,
  diagnostics: ClosureDiagnostic[],
): {
  stars: NormalizedStar[];
  sids: NormalizedSid[];
  approaches: NormalizedApproach[];
} {
  if (policy.kind === "airport-all") {
    return {
      stars: sortByKey(source.stars.filter((row) => row.airportId === airportId)),
      sids: sortByKey(source.sids.filter((row) => row.airportId === airportId)),
      approaches: sortByKey(source.approaches.filter((row) => row.airportId === airportId)),
    };
  }

  return {
    sids: pickExplicit(source.sids, policy.sidIds ?? [], airportId, "SID", diagnostics),
    stars: pickExplicit(source.stars, policy.starIds ?? [], airportId, "STAR", diagnostics),
    approaches: pickExplicit(
      source.approaches,
      policy.approachIds ?? [],
      airportId,
      "APPROACH",
      diagnostics,
    ),
  };
}

function pickExplicit<T extends { id: string; airportId: string; identity: { key: string } }>(
  rows: readonly T[],
  ids: readonly string[],
  airportId: string,
  kind: ClosureProcedureKind,
  diagnostics: ClosureDiagnostic[],
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  const ordered = [...ids].map((id) => id.toUpperCase()).sort();
  for (const id of ordered) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const hits = rows.filter((row) => row.id === id);
    const local = hits.filter((row) => row.airportId === airportId);
    if (local.length === 1) {
      const row = local[0]!;
      out.push(row);
      continue;
    }
    if (local.length > 1) {
      diagnostics.push({
        severity: "error",
        code: "AMBIGUOUS_REFERENCE",
        message: `CIFP closure: ${kind} ${id} is ambiguous (${local.length} records at ${airportId})`,
        procedureKind: kind,
        procedureId: id,
        sourceRecord: local.map((row) => row.identity.key).join(","),
        refId: id,
        airportId,
      });
      continue;
    }
    if (hits.length > 0) {
      const other = hits.map((row) => row.airportId).join(",");
      diagnostics.push({
        severity: "error",
        code: "CROSS_AIRPORT_LEAKAGE",
        message: `CIFP closure: ${kind} ${id} is not at ${airportId} (found at ${other})`,
        procedureKind: kind,
        procedureId: id,
        sourceRecord: hits.map((row) => row.identity.key).join(","),
        refId: id,
        airportId,
      });
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "UNKNOWN_PROCEDURE",
      message: `CIFP closure: ${kind} ${id} is not in the normalized source`,
      procedureKind: kind,
      procedureId: id,
      refId: id,
      airportId,
    });
  }
  return sortByKey(out);
}

function processWork(item: WorkItem, ctx: ClosureCtx): void {
  switch (item.kind) {
    case "sid":
      walkSid(item.sid, ctx);
      return;
    case "star":
      walkStar(item.star, ctx);
      return;
    case "approach":
      walkApproach(item.approach, ctx);
      return;
    case "walk-navaid":
      walkNavaid(item.navaid, ctx);
      return;
    case "fix-ref":
      resolveFixRef(item.id, item.path, item.procedure, ctx);
      return;
    case "navaid-ref":
      resolveNavaidRef(item.id, item.path, item.procedure, item.expectKind, ctx);
      return;
    case "runway-ref":
      resolveRunwayRef(item.id, item.path, item.procedure, ctx);
      return;
  }
}

function walkSid(sid: NormalizedSid, ctx: ClosureCtx): void {
  const procedure: ProcedureRef = {
    kind: "SID",
    id: sid.id,
    sourceRecord: sid.identity.key,
  };
  for (const transition of sid.runwayTransitions) {
    const path = `SID ${sid.id} (${sid.identity.key}) runway ${transition.runwayId}`;
    enqueueRunway(transition.runwayId, `${path} runwayId`, procedure, ctx);
    walkLegs(transition.legs, `${path} legs`, procedure, ctx);
  }
  walkLegs(sid.common, `SID ${sid.id} (${sid.identity.key}) common`, procedure, ctx);
  for (const transition of sid.enrouteTransitions) {
    walkLegs(
      transition.legs,
      `SID ${sid.id} (${sid.identity.key}) enroute ${transition.id} legs`,
      procedure,
      ctx,
    );
  }
}

function walkStar(star: NormalizedStar, ctx: ClosureCtx): void {
  const procedure: ProcedureRef = {
    kind: "STAR",
    id: star.id,
    sourceRecord: star.identity.key,
  };
  for (const transition of star.transitions) {
    walkLegs(
      transition.legs,
      `STAR ${star.id} (${star.identity.key}) transition ${transition.id} legs`,
      procedure,
      ctx,
    );
  }
  walkLegs(star.common, `STAR ${star.id} (${star.identity.key}) common`, procedure, ctx);
}

function walkApproach(approach: NormalizedApproach, ctx: ClosureCtx): void {
  const procedure: ProcedureRef = {
    kind: "APPROACH",
    id: approach.id,
    sourceRecord: approach.identity.key,
  };
  const prefix = `approach ${approach.id} (${approach.identity.key})`;
  enqueueRunway(approach.runway, `${prefix} runway`, procedure, ctx);
  enqueueNavaid(approach.locNavaidId, `${prefix} locNavaidId`, procedure, ctx, "LOC");
  enqueueNavaid(approach.gsNavaidId, `${prefix} gsNavaidId`, procedure, ctx, "GS");
  enqueueFix(approach.fafFixId, `${prefix} fafFixId`, procedure, ctx);
  enqueueFix(approach.thresholdFixId, `${prefix} thresholdFixId`, procedure, ctx);
  enqueueFix(approach.missedFixId, `${prefix} missedFixId`, procedure, ctx);
  walkLegs(approach.legs, `${prefix} legs`, procedure, ctx);
}

function walkLegs(
  legs: readonly NormalizedProcedureLeg[],
  path: string,
  procedure: ProcedureRef,
  ctx: ClosureCtx,
): void {
  const ordered = [...legs].sort((a, b) => a.sequence - b.sequence || a.lineNo - b.lineNo);
  for (const [i, leg] of ordered.entries()) {
    const legPath = `${path}[${i}]`;
    if (!leg.supported) {
      ctx.diagnostics.push({
        severity: "warning",
        code: "UNSUPPORTED_ELEMENT",
        message: `${legPath} pathTerminator ${leg.pathTerminator} is unsupported`,
        procedureKind: procedure.kind,
        procedureId: procedure.id,
        sourceRecord: procedure.sourceRecord,
        airportId: ctx.airportId,
      });
    }
    enqueueFix(leg.fixId, `${legPath}.fixId`, procedure, ctx);
  }
}

function walkNavaid(navaid: NormalizedNavaid, ctx: ClosureCtx): void {
  const procedure: ProcedureRef = {
    kind: "APPROACH",
    id: navaid.id,
    sourceRecord: navaid.identity.key,
  };
  enqueueNavaid(
    navaid.pairedLocId,
    `navaid ${navaid.id} (${navaid.identity.key}) pairedLocId`,
    procedure,
    ctx,
  );
  const paired = ctx.source.navaids
    .filter((row) => row.pairedLocId === navaid.id)
    .sort((a, b) => compareKey(a.identity.key, b.identity.key));
  for (const row of paired) {
    enqueueNavaid(
      row.id,
      `navaid ${row.id} (${row.identity.key}) paired to ${navaid.id}`,
      procedure,
      ctx,
    );
  }
}

function enqueueFix(
  id: string | undefined,
  path: string,
  procedure: ProcedureRef,
  ctx: ClosureCtx,
): void {
  if (id === undefined || id.length === 0) {
    return;
  }
  ctx.enqueue({
    key: `fix-ref:${procedure.sourceRecord}:${path}:${id}`,
    kind: "fix-ref",
    id,
    path,
    procedure,
  });
}

function enqueueNavaid(
  id: string | undefined,
  path: string,
  procedure: ProcedureRef,
  ctx: ClosureCtx,
  expectKind?: NormalizedNavaidKind,
): void {
  if (id === undefined || id.length === 0) {
    return;
  }
  ctx.enqueue({
    key: `navaid-ref:${procedure.sourceRecord}:${path}:${id}`,
    kind: "navaid-ref",
    id,
    path,
    procedure,
    ...(expectKind !== undefined ? { expectKind } : {}),
  });
}

function enqueueRunway(
  id: string | undefined,
  path: string,
  procedure: ProcedureRef,
  ctx: ClosureCtx,
): void {
  if (id === undefined || id.length === 0) {
    return;
  }
  ctx.enqueue({
    key: `runway-ref:${procedure.sourceRecord}:${path}:${id}`,
    kind: "runway-ref",
    id,
    path,
    procedure,
  });
}

function resolveFixRef(id: string, path: string, procedure: ProcedureRef, ctx: ClosureCtx): void {
  const fixHits = ctx.source.fixes.filter((row) => row.id === id);
  const pickedFix = pickOwned(fixHits, ctx.airportId, id, path, procedure, ctx.diagnostics, {
    allowEmpty: true,
  });
  if (pickedFix !== undefined) {
    includeRecord(pickedFix, ctx);
    return;
  }
  if (fixHits.length > 0) {
    return;
  }
  const runwayHits = ctx.source.runways.filter(
    (row) => row.runwayId === id || row.runwayId === stripRwPrefix(id),
  );
  const pickedRunway = pickOwned(runwayHits, ctx.airportId, id, path, procedure, ctx.diagnostics, {
    allowEmpty: true,
  });
  if (pickedRunway !== undefined) {
    includeRecord(pickedRunway, ctx);
    return;
  }
  if (runwayHits.length > 0) {
    return;
  }
  const navaidHits = ctx.source.navaids.filter((row) => row.id === id);
  const pickedNavaid = pickOwned(navaidHits, ctx.airportId, id, path, procedure, ctx.diagnostics);
  if (pickedNavaid === undefined) {
    return;
  }
  includeRecord(pickedNavaid, ctx);
}

function resolveNavaidRef(
  id: string,
  path: string,
  procedure: ProcedureRef,
  expectKind: NormalizedNavaidKind | undefined,
  ctx: ClosureCtx,
): void {
  const hits = ctx.source.navaids.filter(
    (row) => row.id === id && (expectKind === undefined || row.kind === expectKind),
  );
  const picked = pickOwned(hits, ctx.airportId, id, path, procedure, ctx.diagnostics);
  if (picked === undefined) {
    return;
  }
  includeRecord(picked, ctx);
}

function resolveRunwayRef(
  id: string,
  path: string,
  procedure: ProcedureRef,
  ctx: ClosureCtx,
): void {
  const want = stripRwPrefix(id);
  const hits = ctx.source.runways.filter((row) => row.runwayId === want || row.runwayId === id);
  const picked = pickOwned(hits, ctx.airportId, id, path, procedure, ctx.diagnostics);
  if (picked === undefined) {
    return;
  }
  includeRecord(picked, ctx);
}

function pickOwned<T extends { airportId?: string; identity: { key: string } }>(
  hits: readonly T[],
  airportId: string,
  refId: string,
  path: string,
  procedure: ProcedureRef,
  diagnostics: ClosureDiagnostic[],
  options: { allowEmpty?: boolean } = {},
): T | undefined {
  if (hits.length === 0) {
    if (options.allowEmpty === true) {
      return undefined;
    }
    diagnostics.push({
      severity: "error",
      code: "MISSING_REFERENCE",
      message: `${path} ${refId}: missing reference`,
      procedureKind: procedure.kind,
      procedureId: procedure.id,
      sourceRecord: procedure.sourceRecord,
      refId,
      airportId,
    });
    return undefined;
  }
  const local = hits.filter((row) => row.airportId === airportId);
  const enroute = hits.filter((row) => row.airportId === undefined);
  const preferred = local.length > 0 ? local : enroute;
  if (preferred.length === 1) {
    return preferred[0];
  }
  if (preferred.length > 1) {
    diagnostics.push({
      severity: "error",
      code: "AMBIGUOUS_REFERENCE",
      message: `${path} ${refId}: ambiguous (${preferred.length} records)`,
      procedureKind: procedure.kind,
      procedureId: procedure.id,
      sourceRecord: procedure.sourceRecord,
      refId,
      airportId,
    });
    return undefined;
  }
  const other = [
    ...new Set(hits.map((row) => row.airportId).filter((id) => id !== undefined)),
  ].join(",");
  diagnostics.push({
    severity: "error",
    code: "CROSS_AIRPORT_LEAKAGE",
    message: `${path} ${refId}: cross-airport leakage (${other})`,
    procedureKind: procedure.kind,
    procedureId: procedure.id,
    sourceRecord: procedure.sourceRecord,
    refId,
    airportId,
  });
  return undefined;
}

function includeRecord(
  row: NormalizedFix | NormalizedNavaid | NormalizedRunway | NormalizedAirport,
  ctx: ClosureCtx,
): void {
  if ("kind" in row && "position" in row && isNavaidKind(row.kind)) {
    const navaid = row as NormalizedNavaid;
    ctx.navaids.set(navaid.identity.key, navaid);
    ctx.enqueue({
      key: `walk-navaid:${navaid.identity.key}`,
      kind: "walk-navaid",
      navaid,
    });
    return;
  }
  if ("kind" in row && "position" in row) {
    const fix = row as NormalizedFix;
    ctx.fixes.set(fix.identity.key, fix);
    return;
  }
  if ("runwayId" in row) {
    const runway = row as NormalizedRunway;
    ctx.runways.set(runway.identity.key, runway);
    return;
  }
  const airport = row as NormalizedAirport;
  ctx.airports.set(airport.identity.key, airport);
}

const NAVAID_KINDS = new Set<NormalizedNavaidKind>([
  "VOR",
  "VORDME",
  "NDB",
  "DME",
  "LOC",
  "GS",
  "OM",
  "MM",
  "IM",
]);

function isNavaidKind(kind: string): kind is NormalizedNavaidKind {
  return NAVAID_KINDS.has(kind as NormalizedNavaidKind);
}

function stripRwPrefix(id: string): string {
  return id.startsWith("RW") ? id.slice(2) : id;
}

function sortByKey<T extends { identity: { key: string } }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareKey(a.identity.key, b.identity.key));
}

function compareKey(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function countAdded(rows: readonly { identity: { key: string } }[], seedKeys: Set<string>): number {
  return rows.filter((row) => !seedKeys.has(row.identity.key)).length;
}

function copyDiagnostics(rows: readonly CifpDiagnostic[]): CifpDiagnostic[] {
  return rows.map((row) => ({ ...row }));
}
