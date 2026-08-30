/**
 * Emit the existing ICAO catalog `files` layout (T04-33).
 *
 * Video-map ids and authored spawn routes stay metadata references — this
 * writer copies procedure catalog geometry only. Reuses
 * `emitCatalogFromSource` after `closeProcedureReferences` assembles a closed
 * `NormalizedCifpSource`. Source lat/lon is already on catalog points.
 */

import type { CatalogFileSet } from "../../src/scenario/procedures/loadCatalog.ts";
import type { Navaid, ProcedureCatalog } from "../../src/scenario/procedures/types.ts";
import {
  closeProcedureReferences,
  type ClosurePolicy,
  type ClosureResult,
  type ClosureSeed,
} from "./closure.ts";
import { emitCatalogFromSource } from "./normalize.ts";
import type { NormalizedCifpSource } from "./types.ts";

const VOR_KINDS = new Set<Navaid["kind"]>(["VOR", "VORDME"]);
const NDB_KINDS = new Set<Navaid["kind"]>(["NDB"]);

export interface CatalogPackSerialized {
  "catalog.json": string;
  "vors.json": string;
  "ndbs.json": string;
  "ils.json": string;
  "fixes.json": string;
  "procedures.json": string;
  "sids.json": string;
  "atpa-volumes.json"?: string;
}

export interface ClosedCatalogPack {
  closure: ClosureResult;
  catalog: ProcedureCatalog;
  files: CatalogFileSet;
  serialized: CatalogPackSerialized;
}

export function catalogToFileSet(catalog: ProcedureCatalog): CatalogFileSet {
  const vors = catalog.navaids.filter((row) => VOR_KINDS.has(row.kind));
  const ndbs = catalog.navaids.filter((row) => NDB_KINDS.has(row.kind));
  const ils = catalog.navaids.filter((row) => !VOR_KINDS.has(row.kind) && !NDB_KINDS.has(row.kind));
  const includeAtpa = catalog.atpaVolumes.length > 0;
  const filesMap: Record<string, string> = {
    vors: "vors.json",
    ndbs: "ndbs.json",
    ils: "ils.json",
    fixes: "fixes.json",
    procedures: "procedures.json",
    sids: "sids.json",
  };
  if (includeAtpa) {
    filesMap.atpaVolumes = "atpa-volumes.json";
  }

  const catalogJson: Record<string, unknown> = {
    schemaVersion: catalog.schemaVersion,
    airportId: catalog.airportId,
    name: catalog.name,
    magVarDeg: catalog.magVarDeg,
    fieldElevFt: catalog.fieldElevFt,
    arp: catalog.arp,
    files: filesMap,
  };
  if (catalog.originNote !== undefined) {
    catalogJson.originNote = catalog.originNote;
  }

  const ilsJson: Record<string, unknown> = {
    airportId: catalog.airportId,
    components: ils,
  };
  if (catalog.approaches.length === 1) {
    const only = catalog.approaches[0]!;
    ilsJson.runwayId = only.runway;
    ilsJson.approachId = only.id;
  }

  const files: CatalogFileSet = {
    catalog: catalogJson,
    vors: { airportId: catalog.airportId, vors },
    ndbs: { airportId: catalog.airportId, ndbs },
    ils: ilsJson,
    fixes: { airportId: catalog.airportId, fixes: catalog.fixes },
    procedures: {
      airportId: catalog.airportId,
      stars: catalog.stars,
      approaches: catalog.approaches,
    },
    sids: { airportId: catalog.airportId, sids: catalog.sids },
  };
  if (includeAtpa) {
    files.atpaVolumes = {
      airportId: catalog.airportId,
      atpaVolumes: catalog.atpaVolumes,
    };
  }
  return files;
}

export function serializeCatalogFiles(files: CatalogFileSet): CatalogPackSerialized {
  const serialized: CatalogPackSerialized = {
    "catalog.json": toPrettyJson(files.catalog),
    "vors.json": toPrettyJson(files.vors),
    "ndbs.json": toPrettyJson(files.ndbs),
    "ils.json": toPrettyJson(files.ils),
    "fixes.json": toPrettyJson(files.fixes),
    "procedures.json": toPrettyJson(files.procedures),
    "sids.json": toPrettyJson(files.sids),
  };
  if (files.atpaVolumes !== undefined) {
    serialized["atpa-volumes.json"] = toPrettyJson(files.atpaVolumes);
  }
  return serialized;
}

export function emitClosedCatalogPack(
  source: NormalizedCifpSource,
  seed: ClosureSeed,
  policy: ClosurePolicy,
): ClosedCatalogPack {
  const closure = closeProcedureReferences(source, seed, policy);
  const { catalog } = emitCatalogFromSource(closure.closed, { airportId: seed.airportId });
  const files = catalogToFileSet(catalog);
  return {
    closure,
    catalog,
    files,
    serialized: serializeCatalogFiles(files),
  };
}

function toPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
