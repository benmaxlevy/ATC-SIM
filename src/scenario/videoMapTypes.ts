/**
 * Trainer video maps (CRC STARS MAPS analog, R07).
 * Files live under `src/scenario/video-maps/<ICAO>/`.
 * Coordinates are NM east/north of that airport's ARP (T00-04). Not OSM / tiles.
 */

export type VideoMapColor = "map" | "mapDim";

export type VideoMapRole = "runway" | "localizer" | "coastline";

export type VideoMapFeature =
  | {
      type: "polyline";
      closed: boolean;
      pointsNm: [number, number][];
    }
  | {
      type: "text";
      text: string;
      atNm: [number, number];
    }
  | {
      type: "runway";
      id: string;
      thresholdNm: [number, number];
      lengthNm: number;
      headingTrueDeg: number;
      widthNm: number;
      label: string;
    }
  | {
      type: "localizerFeather";
      runwayId: string;
      courseTrueDeg: number;
      featherLengthNm: number;
      halfWidthDeg: number;
    };

export interface VideoMapFile {
  id: string;
  name: string;
  note?: string;
  features: VideoMapFeature[];
}

export interface VideoMapCatalogEntry {
  id: string;
  file: string;
  dcbNumber: number;
  dcbLabel: string;
  role?: VideoMapRole;
  defaultOn: boolean;
  color: VideoMapColor;
}

export interface VideoMapCatalog {
  icao: string;
  frame: "arp-enu-nm";
  note?: string;
  maps: VideoMapCatalogEntry[];
}

export interface LoadedVideoMap extends VideoMapCatalogEntry {
  name: string;
  note?: string;
  features: VideoMapFeature[];
}
