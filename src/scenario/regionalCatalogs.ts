/**
 * Regional airport procedure catalog loader (T04-70).
 *
 * Loads and validates generic procedure catalogs for center and satellite
 * airports using the generic `parseCatalogFiles` validation pipeline.
 *
 * Generic: walks airport by ICAO without facility-specific branches.
 */

import { isRecord } from "./load";
import { parseCatalogFiles, type CatalogFileSet } from "./procedures/loadCatalog";
import type { ProcedureCatalog } from "./procedures/types";
import type { RegionalFacility } from "./regional";

const DATA_JSON = import.meta.glob<unknown>("./data/**/*.json", {
  eager: true,
  import: "default",
});

const REQUIRED_CATALOG_FILES = ["vors", "ndbs", "ils", "fixes", "procedures", "sids"] as const;

export interface LoadRegionalAirportCatalogOptions {
  dataJson?: Record<string, unknown>;
  fileReader?: (path: string) => unknown;
}

/**
 * Load and validate a procedure catalog for any airport in a regional facility.
 * Throws deterministically if the ICAO is unknown, lacks a catalog reference,
 * has mismatched airport ID, or contains invalid/dangling procedure references.
 */
export function loadRegionalAirportCatalog(
  facility: RegionalFacility,
  icao: string,
  options?: LoadRegionalAirportCatalogOptions,
): ProcedureCatalog {
  const normalizedIcao = icao.trim().toUpperCase();
  const apt = facility.getAirport(normalizedIcao);

  if (!apt) {
    throw new Error(
      `CIFP regional catalog load: unknown airport '${normalizedIcao}' in region '${facility.centerAirportId}'`,
    );
  }

  if (!apt.catalogRef) {
    throw new Error(
      `CIFP regional catalog load: airport '${normalizedIcao}' has no procedure catalog reference`,
    );
  }

  const read = (path: string): unknown => {
    if (options?.fileReader) {
      return options.fileReader(path);
    }
    const data = options?.dataJson ?? DATA_JSON;
    if (path in data) {
      return data[path];
    }
    throw new Error(`Missing regional catalog file: ${path}`);
  };

  const centerKey = facility.centerAirportId.toLowerCase();
  const prefix =
    apt.catalogRef === "."
      ? `./data/${centerKey}`
      : `./data/${centerKey}/${apt.catalogRef.replace(/^[\\/]+/, "")}`;

  const catalogJson = read(`${prefix}/catalog.json`);
  if (!isRecord(catalogJson) || !isRecord(catalogJson.files)) {
    throw new Error(`CIFP regional catalog load: '${prefix}/catalog.json' must declare files map`);
  }

  const fileMap = catalogJson.files;
  for (const key of REQUIRED_CATALOG_FILES) {
    const filename = fileMap[key];
    if (typeof filename !== "string" || filename.length === 0) {
      throw new Error(`Catalog files.${key} must be a non-empty string`);
    }
  }

  const readListed = (key: (typeof REQUIRED_CATALOG_FILES)[number]): unknown => {
    const filename = fileMap[key] as string;
    if (typeof filename !== "string" || filename.length === 0) {
      throw new Error(`Catalog files.${key} must be a non-empty string`);
    }
    return read(`${prefix}/${filename}`);
  };

  const atpaVolumesFile =
    typeof fileMap.atpaVolumes === "string" && fileMap.atpaVolumes.length > 0
      ? read(`${prefix}/${fileMap.atpaVolumes}`)
      : undefined;

  const fileSet: CatalogFileSet = {
    catalog: catalogJson,
    vors: readListed("vors"),
    ndbs: readListed("ndbs"),
    ils: readListed("ils"),
    fixes: readListed("fixes"),
    procedures: readListed("procedures"),
    sids: readListed("sids"),
    ...(atpaVolumesFile !== undefined ? { atpaVolumes: atpaVolumesFile } : {}),
  };

  const catalog = parseCatalogFiles(fileSet);

  if (catalog.airportId.toUpperCase() !== normalizedIcao) {
    throw new Error(
      `CIFP regional catalog load: airportId mismatch: expected '${normalizedIcao}' but catalog declares '${catalog.airportId}'`,
    );
  }

  return catalog;
}
