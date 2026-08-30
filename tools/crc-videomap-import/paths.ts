/**
 * Frozen local CRC cache paths for this swarm (T04-36).
 *
 * Developer tooling may read these paths. The browser/runtime never does.
 * CLI flags in later tickets override. Do not commit files from these paths.
 */

/** Local CRC ARTCC metadata (ZTL). Contains `videoMaps[]` and facility STARS config. */
export const CRC_LOCAL_ARTCC_METADATA_PATH =
  "C:\\Users\\Ben\\AppData\\Local\\CRC\\ARTCCs\\ZTL.json";

/** Local CRC video-map GeoJSON directory. Files are named `<ULID>.geojson`. */
export const CRC_LOCAL_VIDEOMAP_DIR = "C:\\Users\\Ben\\AppData\\Local\\CRC\\VideoMaps\\ZTL";

/** Atlanta TRACON facility id in ZTL `facility.childFacilities[]`. */
export const CRC_A80_FACILITY_ID = "A80";

/** Tag pair used with facility `videoMapIds` when selecting A80 STARS maps. */
export const CRC_A80_STARS_TAGS = ["A80", "STARS"] as const;
