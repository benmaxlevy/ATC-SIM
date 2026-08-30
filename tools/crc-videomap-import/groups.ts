/**
 * CRC STARS map-group extraction and DCB layout (T04-38).
 *
 * Tool-only. Runtime `src/` must not import this module. Browser never reads CRC.
 * Group `mapIds` are CRC `starsId` (or `null` empty slots), not ULIDs and not
 * DCB slot indexes. Resolve against the facility's assigned inventory.
 */

import {
  assignedVideoMaps,
  crcDcbPositionFromSlotIndex,
  mapsAbsentFromGroups,
} from "./identity.ts";
import { starsFacilityById } from "./parse.ts";
import {
  CRC_DCB_MAIN_COUNT,
  CRC_DCB_SLOT_COUNT,
  CRC_DCB_SUBMENU_COUNT,
  type CrcDcbGroupPosition,
  type CrcMapGroupSource,
  type CrcVideoMapId,
  type NormalizedCrcArtccMaps,
  type NormalizedCrcVideoMap,
} from "./types.ts";

export type CrcMapGroupDiagnosticCode =
  "MISSING_STARS_ID" | "AMBIGUOUS_STARS_ID" | "SLOT_OUT_OF_RANGE";

export interface CrcMapGroupDiagnostic {
  code: CrcMapGroupDiagnosticCode;
  groupId: string;
  groupIndex: number;
  slotIndex: number;
  starsId?: number;
  mapIds?: CrcVideoMapId[];
  message: string;
}

/** One DCB layout cell. `starsId` is CRC identity-facing ID; position is layout only. */
export interface CrcDcbSlot {
  position: CrcDcbGroupPosition;
  starsId: number | null;
  /** Set only when `starsId` resolves to exactly one assigned map. */
  map?: NormalizedCrcVideoMap;
}

export interface ExtractedCrcMapGroup {
  id: string;
  /** Index in `starsConfiguration.mapGroups` (source order). */
  sourceIndex: number;
  tcps: string[];
  /** Always length 6. Trailing omitted MAIN cells are empty, not densified. */
  main: CrcDcbSlot[];
  /** Length 0..32. Preserves source nulls, duplicates, and omitted trailing slots. */
  submenu: CrcDcbSlot[];
}

export interface ExtractedCrcFacilityGroups {
  facilityId: string;
  facilityName: string;
  /** Complete assigned inventory in `videoMapIds` order. Independent of DCB groups. */
  inventory: NormalizedCrcVideoMap[];
  groups: ExtractedCrcMapGroup[];
  mapsAbsentFromGroups: NormalizedCrcVideoMap[];
  diagnostics: CrcMapGroupDiagnostic[];
}

function assignedByStarsId(
  maps: readonly NormalizedCrcVideoMap[],
): Map<number, NormalizedCrcVideoMap[]> {
  const byStars = new Map<number, NormalizedCrcVideoMap[]>();
  for (const map of maps) {
    if (map.starsId === undefined) {
      continue;
    }
    const list = byStars.get(map.starsId);
    if (list === undefined) {
      byStars.set(map.starsId, [map]);
    } else {
      list.push(map);
    }
  }
  return byStars;
}

function slotLabel(slotIndex: number): string {
  if (slotIndex < CRC_DCB_MAIN_COUNT) {
    return `MAIN[${slotIndex}]`;
  }
  return `submenu[${slotIndex - CRC_DCB_MAIN_COUNT}]`;
}

function emptyMainSlot(groupId: string, mainIndex: number): CrcDcbSlot {
  return {
    position: crcDcbPositionFromSlotIndex(groupId, mainIndex),
    starsId: null,
  };
}

function resolveOccupiedSlot(
  groupId: string,
  groupIndex: number,
  slotIndex: number,
  starsId: number,
  facilityId: string,
  byStars: Map<number, NormalizedCrcVideoMap[]>,
  diagnostics: CrcMapGroupDiagnostic[],
): CrcDcbSlot {
  const position = crcDcbPositionFromSlotIndex(groupId, slotIndex);
  const hits = byStars.get(starsId) ?? [];
  if (hits.length === 0) {
    diagnostics.push({
      code: "MISSING_STARS_ID",
      groupId,
      groupIndex,
      slotIndex,
      starsId,
      message:
        `CRC map group ${groupId} facility ${facilityId} ${slotLabel(slotIndex)} ` +
        `starsId ${starsId} is not in assigned inventory`,
    });
    return { position, starsId };
  }
  if (hits.length > 1) {
    const mapIds = hits.map((row) => row.id);
    diagnostics.push({
      code: "AMBIGUOUS_STARS_ID",
      groupId,
      groupIndex,
      slotIndex,
      starsId,
      mapIds,
      message:
        `CRC map group ${groupId} facility ${facilityId} ${slotLabel(slotIndex)} ` +
        `starsId ${starsId} is ambiguous across ULIDs ${mapIds.join(", ")}`,
    });
    return { position, starsId };
  }
  return { position, starsId, map: hits[0] };
}

function extractOneGroup(
  group: CrcMapGroupSource,
  groupIndex: number,
  facilityId: string,
  byStars: Map<number, NormalizedCrcVideoMap[]>,
  diagnostics: CrcMapGroupDiagnostic[],
): ExtractedCrcMapGroup {
  const main: CrcDcbSlot[] = [];
  const submenu: CrcDcbSlot[] = [];
  for (const [slotIndex, starsId] of group.mapIds.entries()) {
    if (slotIndex >= CRC_DCB_SLOT_COUNT) {
      diagnostics.push({
        code: "SLOT_OUT_OF_RANGE",
        groupId: group.id,
        groupIndex,
        slotIndex,
        ...(starsId !== null ? { starsId } : {}),
        message:
          `CRC map group ${group.id} facility ${facilityId} source mapIds[${slotIndex}] ` +
          `exceeds DCB layout (${CRC_DCB_MAIN_COUNT} MAIN + ${CRC_DCB_SUBMENU_COUNT} submenu); ` +
          `ignored (not map identity)`,
      });
      continue;
    }
    const slot: CrcDcbSlot =
      starsId === null
        ? { position: crcDcbPositionFromSlotIndex(group.id, slotIndex), starsId: null }
        : resolveOccupiedSlot(
            group.id,
            groupIndex,
            slotIndex,
            starsId,
            facilityId,
            byStars,
            diagnostics,
          );
    if (slotIndex < CRC_DCB_MAIN_COUNT) {
      main.push(slot);
    } else {
      submenu.push(slot);
    }
  }
  while (main.length < CRC_DCB_MAIN_COUNT) {
    main.push(emptyMainSlot(group.id, main.length));
  }
  return {
    id: group.id,
    sourceIndex: groupIndex,
    tcps: [...group.tcps],
    main,
    submenu,
  };
}

/**
 * Extract position-specific DCB groups from a parsed ARTCC document.
 * Inventory stays the full assigned ULID list; DCB slots never replace `starsId`.
 */
export function extractCrcFacilityGroups(
  artcc: NormalizedCrcArtccMaps,
  facilityId: string,
): ExtractedCrcFacilityGroups {
  const facility = starsFacilityById(artcc, facilityId);
  const inventory = assignedVideoMaps(artcc.videoMaps, facility.videoMapIds);
  const byStars = assignedByStarsId(inventory);
  const diagnostics: CrcMapGroupDiagnostic[] = [];
  const groups = facility.mapGroups.map((group, groupIndex) =>
    extractOneGroup(group, groupIndex, facility.facilityId, byStars, diagnostics),
  );
  return {
    facilityId: facility.facilityId,
    facilityName: facility.facilityName,
    inventory,
    groups,
    mapsAbsentFromGroups: mapsAbsentFromGroups(inventory, facility.mapGroups),
    diagnostics,
  };
}
