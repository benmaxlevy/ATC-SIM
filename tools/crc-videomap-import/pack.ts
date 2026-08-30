/**
 * CRC facility video-map pack (T04-39).
 *
 * Filters ARTCC conversion to assigned facility inventory UNION maps tagged
 * for that facility + STARS. Writes trainer catalog + map files + manifest +
 * groups sidecar. Empty-feature maps are recorded, not emitted.
 *
 * Tool-only. Runtime `src/` must not import this module. Browser never reads CRC.
 * Catalog `id` is the CRC ULID. Do not densify to 1–30.
 */

import {
  convertCrcArtccMaps,
  trainerVideoMapJson,
  type ConvertArp,
  type ConvertBatchResult,
  type ConvertedVideoMap,
  type ConvertSkipReason,
  type GeojsonByMapId,
  type SkippedMap,
} from "./convert.ts";
import { extractCrcFacilityGroups, type ExtractedCrcFacilityGroups } from "./groups.ts";
import { crcGeojsonFilename, mapHasAllTags } from "./identity.ts";
import { parseCrcArtccMaps } from "./parse.ts";
import { CRC_A80_FACILITY_ID, CRC_A80_STARS_TAGS } from "./paths.ts";
import type {
  CrcDcbGroupPosition,
  NormalizedCrcArtccMaps,
  NormalizedCrcVideoMap,
} from "./types.ts";
// @ts-expect-error tsconfig has no @types/node
import { join } from "node:path";

export const PACK_CATALOG_FILE = "catalog.json";
export const PACK_GROUPS_FILE = "groups.json";
export const PACK_MANIFEST_FILE = "manifest.json";
export const PACK_ATTRIBUTION_FILE = "ATTRIBUTION.md";

export const DEFAULT_PACK_ICAO = "KATL";

export interface PackIo {
  readFile: (path: string) => string;
  writeFile: (path: string, body: string) => void;
  stdout: (body: string) => void;
  stderr: (body: string) => void;
}

export interface PackCliArgs {
  metadataPath: string;
  mapsDir: string;
  arpLat: number;
  arpLon: number;
  outDir: string | null;
  dryRun: boolean;
  icao: string;
  facilityId: string;
}

export interface FacilityStarsInventory {
  facilityId: string;
  facilityName: string;
  assigned: NormalizedCrcVideoMap[];
  taggedExtras: NormalizedCrcVideoMap[];
  inventory: NormalizedCrcVideoMap[];
  groups: ExtractedCrcFacilityGroups;
}

export interface PackCatalogEntry {
  id: string;
  file: string;
  dcbLabel: string;
  defaultOn: boolean;
  color: "map" | "mapDim";
}

export interface PackCatalog {
  icao: string;
  frame: "arp-enu-nm";
  note: string;
  maps: PackCatalogEntry[];
}

export interface PackedDcbSlot {
  position: CrcDcbGroupPosition;
  starsId: number | null;
  mapId?: string;
}

export interface PackedMapGroup {
  id: string;
  sourceIndex: number;
  tcps: string[];
  main: PackedDcbSlot[];
  submenu: PackedDcbSlot[];
}

export interface PackedFacilityGroups {
  facilityId: string;
  facilityName: string;
  mapsAbsentFromGroups: string[];
  groups: PackedMapGroup[];
}

export interface PackManifest {
  facilityId: string;
  facilityName: string;
  icao: string;
  frame: "arp-enu-nm";
  arp: ConvertArp;
  sourceCount: number;
  assignedCount: number;
  taggedUnionExtraCount: number;
  outputCount: number;
  skippedMaps: number;
  skippedFeatures: number;
  skippedByReason: Partial<Record<ConvertSkipReason, number>>;
  mapsAbsentFromGroups: string[];
  outputIds: string[];
  failures: Array<{ mapId: string; reason: ConvertSkipReason; detail: string }>;
}

export interface VideoMapPack {
  catalog: PackCatalog;
  groups: PackedFacilityGroups;
  manifest: PackManifest;
  attribution: string;
  maps: ConvertedVideoMap[];
  skippedMaps: SkippedMap[];
  batch: ConvertBatchResult;
  inventory: FacilityStarsInventory;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseNumber(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} must be a finite number`);
  }
  return value;
}

function parseArpPair(raw: string): { lat: number; lon: number } {
  const parts = raw.split(",");
  if (parts.length !== 2) {
    throw new Error("--arp must be LAT,LON");
  }
  return {
    lat: parseNumber(parts[0]!.trim(), "--arp lat"),
    lon: parseNumber(parts[1]!.trim(), "--arp lon"),
  };
}

export function parsePackCliArgs(args: string[]): PackCliArgs {
  let metadataPath: string | undefined;
  let mapsDir: string | undefined;
  let arpLat: number | undefined;
  let arpLon: number | undefined;
  let outDir: string | null = null;
  let dryRun = false;
  let icao = DEFAULT_PACK_ICAO;
  let facilityId = CRC_A80_FACILITY_ID;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--metadata") {
      metadataPath = requireValue(args, ++i, "--metadata");
      continue;
    }
    if (arg.startsWith("--metadata=")) {
      metadataPath = arg.slice("--metadata=".length);
      continue;
    }
    if (arg === "--maps") {
      mapsDir = requireValue(args, ++i, "--maps");
      continue;
    }
    if (arg.startsWith("--maps=")) {
      mapsDir = arg.slice("--maps=".length);
      continue;
    }
    if (arg === "--arp-lat") {
      arpLat = parseNumber(requireValue(args, ++i, "--arp-lat"), "--arp-lat");
      continue;
    }
    if (arg.startsWith("--arp-lat=")) {
      arpLat = parseNumber(arg.slice("--arp-lat=".length), "--arp-lat");
      continue;
    }
    if (arg === "--arp-lon") {
      arpLon = parseNumber(requireValue(args, ++i, "--arp-lon"), "--arp-lon");
      continue;
    }
    if (arg.startsWith("--arp-lon=")) {
      arpLon = parseNumber(arg.slice("--arp-lon=".length), "--arp-lon");
      continue;
    }
    if (arg === "--arp") {
      const pair = parseArpPair(requireValue(args, ++i, "--arp"));
      arpLat = pair.lat;
      arpLon = pair.lon;
      continue;
    }
    if (arg.startsWith("--arp=")) {
      const pair = parseArpPair(arg.slice("--arp=".length));
      arpLat = pair.lat;
      arpLon = pair.lon;
      continue;
    }
    if (arg === "--out") {
      outDir = requireValue(args, ++i, "--out");
      continue;
    }
    if (arg.startsWith("--out=")) {
      outDir = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--icao") {
      icao = requireValue(args, ++i, "--icao");
      continue;
    }
    if (arg.startsWith("--icao=")) {
      icao = arg.slice("--icao=".length);
      continue;
    }
    if (arg === "--facility") {
      facilityId = requireValue(args, ++i, "--facility");
      continue;
    }
    if (arg.startsWith("--facility=")) {
      facilityId = arg.slice("--facility=".length);
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (metadataPath === undefined || metadataPath.length === 0) {
    throw new Error("Missing --metadata <path>");
  }
  if (mapsDir === undefined || mapsDir.length === 0) {
    throw new Error("Missing --maps <dir>");
  }
  if (arpLat === undefined || arpLon === undefined) {
    throw new Error("Missing --arp-lat/--arp-lon or --arp LAT,LON (scenario ARP)");
  }
  if (!dryRun && (outDir === null || outDir.length === 0)) {
    throw new Error("Missing --out <dir> (or pass --dry-run)");
  }
  if (icao.trim() === "") {
    throw new Error("--icao must be a non-empty ICAO folder id");
  }
  if (facilityId.trim() === "") {
    throw new Error("--facility must be a non-empty CRC facility id");
  }
  return { metadataPath, mapsDir, arpLat, arpLon, outDir, dryRun, icao, facilityId };
}

export function loadGeojsonByMapId(
  mapsDir: string,
  mapIds: readonly string[],
  io: PackIo,
): Map<string, unknown> {
  const loaded = new Map<string, unknown>();
  for (const id of mapIds) {
    const path = join(mapsDir, crcGeojsonFilename(id));
    let text: string;
    try {
      text = io.readFile(path);
    } catch {
      continue;
    }
    try {
      loaded.set(id, JSON.parse(text) as unknown);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      loaded.set(id, { type: "InvalidJson", error: message });
    }
  }
  return loaded;
}

/**
 * Assigned `videoMapIds` UNION maps tagged for the facility and STARS.
 * DCB group membership does not filter inventory.
 */
export function selectFacilityStarsInventory(
  artcc: NormalizedCrcArtccMaps,
  facilityId: string,
  tags: readonly string[] = CRC_A80_STARS_TAGS,
): FacilityStarsInventory {
  const groups = extractCrcFacilityGroups(artcc, facilityId);
  const assignedIds = new Set(groups.inventory.map((map) => map.id));
  const taggedExtras: NormalizedCrcVideoMap[] = [];
  for (const map of artcc.videoMaps) {
    if (assignedIds.has(map.id)) {
      continue;
    }
    if (mapHasAllTags(map, tags)) {
      taggedExtras.push(map);
    }
  }
  return {
    facilityId: groups.facilityId,
    facilityName: groups.facilityName,
    assigned: groups.inventory,
    taggedExtras,
    inventory: [...groups.inventory, ...taggedExtras],
    groups,
  };
}

function catalogDcbLabel(map: NormalizedCrcVideoMap): string {
  if (map.shortName !== undefined) {
    return map.shortName;
  }
  if (map.starsId !== undefined) {
    return String(map.starsId);
  }
  return map.title;
}

function catalogEntryFrom(
  map: NormalizedCrcVideoMap,
  converted: ConvertedVideoMap,
): PackCatalogEntry {
  return {
    id: map.id,
    file: `${map.id}.json`,
    dcbLabel: catalogDcbLabel(map),
    defaultOn: map.alwaysVisible === true,
    color: converted.color,
  };
}

function packSlot(
  slot: ExtractedCrcFacilityGroups["groups"][number]["main"][number],
): PackedDcbSlot {
  return {
    position: slot.position,
    starsId: slot.starsId,
    ...(slot.map !== undefined ? { mapId: slot.map.id } : {}),
  };
}

export function packedFacilityGroups(extracted: ExtractedCrcFacilityGroups): PackedFacilityGroups {
  return {
    facilityId: extracted.facilityId,
    facilityName: extracted.facilityName,
    mapsAbsentFromGroups: extracted.mapsAbsentFromGroups.map((map) => map.id),
    groups: extracted.groups.map((group) => ({
      id: group.id,
      sourceIndex: group.sourceIndex,
      tcps: [...group.tcps],
      main: group.main.map(packSlot),
      submenu: group.submenu.map(packSlot),
    })),
  };
}

export function packAttributionMarkdown(icao: string, facilityId: string): string {
  return [
    `# ${icao} ${facilityId} video maps — attribution`,
    "",
    "Converted from permitted local CRC/vNAS STARS A80 videomaps.",
    "",
    "- Source: ZTL ARTCC metadata plus ULID-named GeoJSON under the local CRC VideoMaps tree.",
    "- Projection origin (ARP) is the playable scenario ARP; conversion is ARP-parameterized.",
    "- For training and entertainment only. Not NAS-certified.",
    "- The trainer runtime does not read CRC files, does not call vNAS, and does not parse a national source pack.",
    "",
    "Do not commit local CRC cache JSON/GeoJSON (`ARTCCs/ZTL.json`, `VideoMaps/ZTL/*.geojson`).",
    "",
  ].join("\n");
}

function catalogNote(icao: string, facilityId: string, arp: ConvertArp): string {
  return (
    `Converted CRC/vNAS STARS ${facilityId} videomaps for ${icao}. ` +
    "Internal id is the CRC ULID; dcbNumber omitted (DCB layout is groups.json). " +
    `ARP ${arp.latDeg},${arp.lonDeg}. Training/entertainment only. Not NAS-certified.`
  );
}

export function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildFacilityVideoMapPack(
  artcc: NormalizedCrcArtccMaps,
  geojsonByMapId: GeojsonByMapId,
  options: {
    facilityId: string;
    icao: string;
    arp: ConvertArp;
    tags?: readonly string[];
  },
): VideoMapPack {
  const inventory = selectFacilityStarsInventory(
    artcc,
    options.facilityId,
    options.tags ?? CRC_A80_STARS_TAGS,
  );
  const batch = convertCrcArtccMaps(
    {
      ...artcc,
      videoMaps: inventory.inventory,
    },
    geojsonByMapId,
    options.arp,
  );
  const byId = new Map(inventory.inventory.map((map) => [map.id, map]));
  const catalogMaps: PackCatalogEntry[] = [];
  for (const converted of batch.maps) {
    const source = byId.get(converted.file.id);
    if (source === undefined) {
      throw new Error(`Converted map ${converted.file.id} is missing from pack inventory`);
    }
    catalogMaps.push(catalogEntryFrom(source, converted));
  }
  const manifest: PackManifest = {
    facilityId: inventory.facilityId,
    facilityName: inventory.facilityName,
    icao: options.icao,
    frame: "arp-enu-nm",
    arp: options.arp,
    sourceCount: inventory.inventory.length,
    assignedCount: inventory.assigned.length,
    taggedUnionExtraCount: inventory.taggedExtras.length,
    outputCount: batch.maps.length,
    skippedMaps: batch.skippedMaps.length,
    skippedFeatures: batch.totals.skippedFeatures,
    skippedByReason: { ...batch.totals.skippedByReason },
    mapsAbsentFromGroups: inventory.groups.mapsAbsentFromGroups.map((map) => map.id),
    outputIds: batch.maps.map((converted) => converted.file.id),
    failures: batch.skippedMaps.map((row) => ({
      mapId: row.mapId,
      reason: row.reason,
      detail: row.detail,
    })),
  };
  return {
    catalog: {
      icao: options.icao,
      frame: "arp-enu-nm",
      note: catalogNote(options.icao, inventory.facilityId, options.arp),
      maps: catalogMaps,
    },
    groups: packedFacilityGroups(inventory.groups),
    manifest,
    attribution: packAttributionMarkdown(options.icao, inventory.facilityId),
    maps: batch.maps,
    skippedMaps: batch.skippedMaps,
    batch,
    inventory,
  };
}

const SKIP_REASON_ORDER: ConvertSkipReason[] = [
  "null-geometry",
  "empty-geometry",
  "default-feature",
  "zero-coordinates",
  "malformed",
  "unsupported-geometry",
  "point-without-text",
  "too-few-vertices",
  "missing-geojson",
  "invalid-geojson",
  "no-valid-features",
];

export function formatPackReport(pack: VideoMapPack): string {
  const { manifest } = pack;
  const skipParts = SKIP_REASON_ORDER.filter(
    (reason) => (manifest.skippedByReason[reason] ?? 0) > 0,
  )
    .map((reason) => `${reason}=${manifest.skippedByReason[reason]}`)
    .join(" ");
  const skipLine =
    skipParts.length > 0
      ? `crc-videomaps pack: skipped ${skipParts}`
      : "crc-videomaps pack: skipped (none)";
  return [
    `crc-videomaps pack: facility ${manifest.facilityId} icao ${manifest.icao}`,
    `crc-videomaps pack: source=${manifest.sourceCount} assigned=${manifest.assignedCount} taggedExtra=${manifest.taggedUnionExtraCount} output=${manifest.outputCount} skippedMaps=${manifest.skippedMaps}`,
    `crc-videomaps pack: features converted=${pack.batch.totals.convertedFeatures} skipped=${manifest.skippedFeatures}`,
    skipLine,
    `crc-videomaps pack: mapsAbsentFromGroups=${manifest.mapsAbsentFromGroups.length} failures=${manifest.failures.length}`,
  ].join("\n");
}

export function writeFacilityVideoMapPack(pack: VideoMapPack, outDir: string, io: PackIo): void {
  io.writeFile(join(outDir, PACK_CATALOG_FILE), prettyJson(pack.catalog));
  io.writeFile(join(outDir, PACK_GROUPS_FILE), prettyJson(pack.groups));
  io.writeFile(join(outDir, PACK_MANIFEST_FILE), prettyJson(pack.manifest));
  io.writeFile(join(outDir, PACK_ATTRIBUTION_FILE), pack.attribution);
  for (const converted of pack.maps) {
    io.writeFile(join(outDir, `${converted.file.id}.json`), trainerVideoMapJson(converted.file));
  }
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${path}: ${message}`);
  }
}

export function runPackCli(args: string[], io: PackIo): void {
  const parsed = parsePackCliArgs(args);
  const metadata = parseJson(io.readFile(parsed.metadataPath), parsed.metadataPath);
  const artcc = parseCrcArtccMaps(metadata);
  const selected = selectFacilityStarsInventory(artcc, parsed.facilityId);
  const geojsonByMapId = loadGeojsonByMapId(
    parsed.mapsDir,
    selected.inventory.map((row) => row.id),
    io,
  );
  const pack = buildFacilityVideoMapPack(artcc, geojsonByMapId, {
    facilityId: parsed.facilityId,
    icao: parsed.icao,
    arp: { latDeg: parsed.arpLat, lonDeg: parsed.arpLon },
  });
  io.stderr(`${formatPackReport(pack)}\n`);
  if (parsed.dryRun || parsed.outDir === null) {
    return;
  }
  writeFacilityVideoMapPack(pack, parsed.outDir, io);
}
