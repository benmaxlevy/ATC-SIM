/**
 * Identity helpers for CRC video-map metadata (T04-36).
 *
 * Internal id stays the CRC ULID. `starsId` and DCB slot indexes never
 * replace it. T04-38 extracts groups into `CrcDcbGroupPosition`; T04-37
 * maps brightness A/B onto existing `map` / `mapDim` channels.
 */

import {
  CRC_DCB_MAIN_COUNT,
  CRC_DCB_SLOT_COUNT,
  type CrcBrightnessCategory,
  type CrcDcbGroupPosition,
  type CrcMapGroupSource,
  type CrcVideoMapId,
  type NormalizedCrcVideoMap,
} from "./types.ts";

export function crcInternalMapId(map: Pick<NormalizedCrcVideoMap, "id">): CrcVideoMapId {
  return map.id;
}

export function crcGeojsonFilename(mapId: CrcVideoMapId): string {
  return `${mapId}.geojson`;
}

/** A → `map`; B → `mapDim`. BRITE later changes intensity, not availability. */
export function crcBrightnessToVideoMapColor(brightness: CrcBrightnessCategory): "map" | "mapDim" {
  return brightness === "B" ? "mapDim" : "map";
}

/**
 * Convert a CRC group `mapIds` index into MAIN/submenu layout coordinates.
 * The index is a slot, not a map id — never densify identity to 1–30.
 */
export function crcDcbPositionFromSlotIndex(
  groupId: string,
  slotIndex: number,
): CrcDcbGroupPosition {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= CRC_DCB_SLOT_COUNT) {
    throw new Error(`CRC DCB slot index ${slotIndex} is out of range 0..${CRC_DCB_SLOT_COUNT - 1}`);
  }
  if (slotIndex < CRC_DCB_MAIN_COUNT) {
    return { groupId, mainIndex: slotIndex };
  }
  return { groupId, submenuIndex: slotIndex - CRC_DCB_MAIN_COUNT };
}

export function starsIdsReferencedInGroups(groups: readonly CrcMapGroupSource[]): Set<number> {
  const ids = new Set<number>();
  for (const group of groups) {
    for (const starsId of group.mapIds) {
      if (starsId !== null) {
        ids.add(starsId);
      }
    }
  }
  return ids;
}

/**
 * Assigned maps whose `starsId` is absent from every group slot.
 * Inventory stays complete even when DCB layout omits a map.
 */
export function mapsAbsentFromGroups(
  maps: readonly NormalizedCrcVideoMap[],
  groups: readonly CrcMapGroupSource[],
): NormalizedCrcVideoMap[] {
  const referenced = starsIdsReferencedInGroups(groups);
  return maps.filter((map) => map.starsId === undefined || !referenced.has(map.starsId));
}

export function assignedVideoMaps(
  maps: readonly NormalizedCrcVideoMap[],
  videoMapIds: readonly CrcVideoMapId[],
): NormalizedCrcVideoMap[] {
  const byId = new Map(maps.map((map) => [map.id, map]));
  const assigned: NormalizedCrcVideoMap[] = [];
  for (const id of videoMapIds) {
    const map = byId.get(id);
    if (map === undefined) {
      throw new Error(`CRC facility videoMapIds references unknown ULID ${id}`);
    }
    assigned.push(map);
  }
  return assigned;
}

export function mapHasAllTags(
  map: Pick<NormalizedCrcVideoMap, "tags">,
  tags: readonly string[],
): boolean {
  return tags.every((tag) => map.tags.includes(tag));
}
