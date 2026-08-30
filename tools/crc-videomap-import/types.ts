/**
 * CRC / vNAS STARS video-map source metadata (T04-36).
 *
 * Tool-only IR. Runtime `src/` must not import this module. Browser never
 * reads CRC files. Geometry conversion is T04-37; group extraction is T04-38.
 *
 * Identity split (product law):
 * - Internal map id = CRC ULID (`id`). Geometry files are named by this ULID.
 * - `starsId` is the CRC STARS map ID shown to controllers. Sparse. Not identity.
 * - DCB MAIN/submenu slots are optional layout metadata. Never replacement IDs.
 *   Do not densify to 1–30.
 */

/** CRC STARS DCB MAIN row length. Layout only, not map identity. */
export const CRC_DCB_MAIN_COUNT = 6;

/** CRC STARS DCB submenu capacity. Layout only, not map identity. */
export const CRC_DCB_SUBMENU_COUNT = 32;

export const CRC_DCB_SLOT_COUNT = CRC_DCB_MAIN_COUNT + CRC_DCB_SUBMENU_COUNT;

/** CRC `starsBrightnessCategory`. A → later `map`; B → later `mapDim`. */
export type CrcBrightnessCategory = "A" | "B";

/**
 * Stable internal map identity: CRC `videoMaps[].id` ULID.
 * Distinct from `starsId` and from any DCB slot index.
 */
export type CrcVideoMapId = string;

/**
 * Normalized CRC video-map metadata. One record per source map.
 * DCB placement is not stored here.
 */
export interface NormalizedCrcVideoMap {
  /** CRC ULID. Stable internal identity and GeoJSON filename stem. */
  id: CrcVideoMapId;
  /**
   * CRC STARS map ID (`videoMaps[].starsId`). Sparse; may duplicate across
   * facilities; may be omitted. Never used as `id`.
   */
  starsId?: number;
  /** CRC `name`. */
  title: string;
  /** CRC `shortName`. Duplicate short names are allowed. */
  shortName?: string;
  /** CRC `sourceFileName`. Geometry is still resolved by ULID. */
  sourceFilename?: string;
  /** CRC `starsBrightnessCategory`. */
  brightness?: CrcBrightnessCategory;
  /** CRC `tdmOnly`. */
  tdm: boolean;
  /** CRC `tags` (e.g. STARS, A80, TDM). */
  tags: string[];
  /** CRC `starsAlwaysVisible`. */
  alwaysVisible?: boolean;
  /** CRC `lastUpdatedAt` when present. */
  lastUpdatedAt?: string;
}

/**
 * Optional DCB group layout position. Not identity.
 * MAIN uses `mainIndex` 0..5; submenu uses `submenuIndex` 0..31.
 * Omit both only when representing an unknown/unplaced slot object.
 */
export interface CrcDcbGroupPosition {
  groupId: string;
  mainIndex?: number;
  submenuIndex?: number;
}

/**
 * One CRC `starsConfiguration.mapGroups[]` row as source data for T04-38.
 * `mapIds` are CRC `starsId` values (or `null` empty slots), not ULIDs.
 */
export interface CrcMapGroupSource {
  id: string;
  mapIds: Array<number | null>;
  tcps: string[];
}

/**
 * One STARS child facility's assigned inventory and group layout source.
 * Assigned `videoMapIds` are ULIDs (complete inventory). Groups stay separate.
 */
export interface NormalizedCrcStarsFacility {
  facilityId: string;
  facilityName: string;
  facilityType?: string;
  videoMapIds: CrcVideoMapId[];
  mapGroups: CrcMapGroupSource[];
}

export interface NormalizedCrcArtccMaps {
  artccId?: string;
  videoMaps: NormalizedCrcVideoMap[];
  starsFacilities: NormalizedCrcStarsFacility[];
}
