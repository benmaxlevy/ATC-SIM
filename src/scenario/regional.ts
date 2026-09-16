/**
 * Generic runtime regional facility model and loader (T04-70).
 *
 * Exposes center and satellite airport inventory, runway/approach geometry,
 * destination eligibility (towered + public-use + valid runways + catalog),
 * and Class B/C/D controlled airspace volumes projected to the scenario ARP.
 *
 * No KATL or facility-specific condition in live logic.
 */

import { latLonToNm } from "@core";
import type { LatLon, NmEastNorth } from "@core";
import { assertArray, assertNumber, assertString, isRecord } from "./load";

const DATA_JSON = import.meta.glob<unknown>("./data/**/*.json", {
  eager: true,
  import: "default",
});

export interface RegionalRunwayGeometry {
  id: string;
  threshold: LatLon;
  thresholdNm: NmEastNorth;
  headingTrueDeg: number;
  headingMagDeg: number;
  lengthFt: number;
}

export interface RegionalAirport {
  icao: string;
  name: string;
  arp: LatLon;
  arpNm: NmEastNorth;
  fieldElevFt: number;
  magVarDeg: number;
  publicUse: boolean;
  towered: boolean;
  eligible: boolean;
  exclusionReason?: string;
  serviceMetadata?: {
    publicUse?: boolean;
    towered?: boolean;
    sourceFile?: string;
    sourceRecordId?: string;
    effectiveDate?: string;
    cycle?: string;
  };
  runways: RegionalRunwayGeometry[];
  hasPublishedApproaches: boolean;
  catalogRef?: string;
}

export interface RegionalAirspaceAltitude {
  altitudeFt?: number;
  unit: string;
  reference: string;
  rawAltitude?: string;
  rawUnit?: string;
}

export interface RegionalAirspaceSegment {
  sequence: number;
  boundaryVia: string;
  boundaryViaType: string;
  position: LatLon;
  positionNm: NmEastNorth;
  arcOrigin?: LatLon;
  arcOriginNm?: NmEastNorth;
  arcDistanceNm?: number;
  arcBearingDeg?: number;
}

export interface RegionalAirspaceVolume {
  id: string;
  name: string;
  type: "CONTROLLED" | "SPECIAL_USE";
  class?: string;
  specialUseKind?: string;
  centerAirportId?: string;
  lowerLimit: RegionalAirspaceAltitude;
  upperLimit: RegionalAirspaceAltitude;
  lowerLimitFt: number;
  upperLimitFt: number;
  segments: RegionalAirspaceSegment[];
}

export interface RegionalSourceProvenance {
  effectiveCycle?: string;
  families: string[];
  command?: string;
}

export interface RegionalFacility {
  schemaVersion: 1;
  centerAirportId: string;
  radiusNm: number;
  arp: LatLon;
  source: RegionalSourceProvenance;
  airports: RegionalAirport[];
  airspaces: RegionalAirspaceVolume[];
  getAirport(icao: string): RegionalAirport | undefined;
  hasAirport(icao: string): boolean;
  getEligibleDestinations(): RegionalAirport[];
  getEligibleDestination(icao: string): RegionalAirport;
  getAirspaces(): RegionalAirspaceVolume[];
}

function parseLatLon(raw: unknown, path: string): LatLon {
  if (!isRecord(raw)) {
    throw new Error(`${path} must be an object`);
  }
  return {
    latDeg: assertNumber(raw.latDeg, `${path}.latDeg`),
    lonDeg: assertNumber(raw.lonDeg, `${path}.lonDeg`),
  };
}

const SUPPORTED_BOUNDARY_VIAS = new Set([
  "CIRCLE",
  "GREAT_CIRCLE",
  "RHUMB_LINE",
  "COUNTER_CLOCKWISE_ARC",
  "CLOCKWISE_ARC",
  "END",
]);

/**
 * Parse raw regional JSON files into a validated RegionalFacility.
 * Atomic validation: invalid geometry or vertical limits throw immediately;
 * no fallback polygon or partial state is returned.
 */
export function parseRegionalPack(
  manifestJson: unknown,
  airportsJson: unknown,
  airspaceJson: unknown,
  fallbackCenterArp?: LatLon,
): RegionalFacility {
  if (!isRecord(manifestJson)) {
    throw new Error("Regional manifest must be an object");
  }
  const schemaVersion = assertNumber(manifestJson.schemaVersion, "manifest.schemaVersion");
  if (schemaVersion !== 1) {
    throw new Error(`Regional manifest unsupported schemaVersion: ${schemaVersion}`);
  }

  const centerAirportId = assertString(
    manifestJson.centerAirportId,
    "manifest.centerAirportId",
    "Regional",
    true,
  ).toUpperCase();
  const radiusNm = assertNumber(manifestJson.radiusNm, "manifest.radiusNm");
  if (!Number.isFinite(radiusNm) || radiusNm <= 0) {
    throw new Error(`Regional radiusNm must be a positive number (got ${radiusNm})`);
  }

  const rawSource = manifestJson.source;
  const source: RegionalSourceProvenance = {
    families:
      isRecord(rawSource) && Array.isArray(rawSource.families)
        ? rawSource.families.map((f, i) => assertString(f, `source.families[${i}]`))
        : ["CIFP", "NASR_APT"],
    effectiveCycle:
      isRecord(rawSource) && typeof rawSource.effectiveCycle === "string"
        ? rawSource.effectiveCycle
        : undefined,
    command:
      isRecord(rawSource) && typeof rawSource.command === "string" ? rawSource.command : undefined,
  };

  // Parse airports
  const rawAirportsList =
    isRecord(airportsJson) && Array.isArray(airportsJson.airports)
      ? airportsJson.airports
      : Array.isArray(airportsJson)
        ? airportsJson
        : null;

  if (!rawAirportsList) {
    throw new Error("Regional airports file must contain an airports array");
  }

  // Locate center airport ARP
  let centerArp = fallbackCenterArp;
  for (const raw of rawAirportsList) {
    if (
      isRecord(raw) &&
      typeof raw.icao === "string" &&
      raw.icao.toUpperCase() === centerAirportId
    ) {
      centerArp = parseLatLon(raw.arp, `airports[${centerAirportId}].arp`);
      break;
    }
  }

  if (!centerArp) {
    throw new Error(`Regional pack center airport '${centerAirportId}' not found in airports list`);
  }

  const airportMap = new Map<string, RegionalAirport>();
  const airports: RegionalAirport[] = [];

  for (let i = 0; i < rawAirportsList.length; i++) {
    const raw = rawAirportsList[i];
    if (!isRecord(raw)) {
      throw new Error(`Regional airports[${i}] must be an object`);
    }

    const icao = assertString(raw.icao, `airports[${i}].icao`, "Regional", true).toUpperCase();
    if (airportMap.has(icao)) {
      throw new Error(`Duplicate airport ICAO in regional pack: ${icao}`);
    }

    const name = assertString(raw.name, `airports[${i}].name`, "Regional");
    const arp = parseLatLon(raw.arp, `airports[${i}].arp`);
    const arpNm = latLonToNm(arp, centerArp);
    const fieldElevFt = assertNumber(raw.fieldElevFt, `airports[${i}].fieldElevFt`);
    const magVarDeg = assertNumber(raw.magVarDeg, `airports[${i}].magVarDeg`);
    const publicUse = raw.publicUse === true;
    const towered = raw.towered === true;
    const eligible = raw.eligible === true;
    const exclusionReason =
      typeof raw.exclusionReason === "string" ? raw.exclusionReason : undefined;
    const hasPublishedApproaches = raw.hasPublishedApproaches === true;
    const catalogRef = typeof raw.catalogRef === "string" ? raw.catalogRef : undefined;

    const rawRunways = assertArray(raw.runways ?? [], `airports[${i}].runways`);
    const runways: RegionalRunwayGeometry[] = [];

    for (let j = 0; j < rawRunways.length; j++) {
      const rw = rawRunways[j];
      if (!isRecord(rw)) {
        throw new Error(`airports[${i}].runways[${j}] must be an object`);
      }
      const id = assertString(rw.id, `airports[${i}].runways[${j}].id`, "Regional", true);
      const threshold = parseLatLon(rw.threshold, `airports[${i}].runways[${j}].threshold`);
      const thresholdNm = latLonToNm(threshold, centerArp);
      const headingTrueDeg = assertNumber(
        rw.headingTrueDeg,
        `airports[${i}].runways[${j}].headingTrueDeg`,
      );
      const headingMagDeg = assertNumber(
        rw.headingMagDeg,
        `airports[${i}].runways[${j}].headingMagDeg`,
      );
      const lengthFt = assertNumber(rw.lengthFt, `airports[${i}].runways[${j}].lengthFt`);

      if (lengthFt <= 0) {
        throw new Error(`airports[${i}].runways[${j}].lengthFt must be positive`);
      }

      runways.push({
        id,
        threshold,
        thresholdNm,
        headingTrueDeg,
        headingMagDeg,
        lengthFt,
      });
    }

    const airport: RegionalAirport = {
      icao,
      name,
      arp,
      arpNm,
      fieldElevFt,
      magVarDeg,
      publicUse,
      towered,
      eligible,
      ...(exclusionReason ? { exclusionReason } : {}),
      ...(isRecord(raw.serviceMetadata)
        ? {
            serviceMetadata: {
              publicUse:
                typeof raw.serviceMetadata.publicUse === "boolean"
                  ? raw.serviceMetadata.publicUse
                  : undefined,
              towered:
                typeof raw.serviceMetadata.towered === "boolean"
                  ? raw.serviceMetadata.towered
                  : undefined,
              sourceFile:
                typeof raw.serviceMetadata.sourceFile === "string"
                  ? raw.serviceMetadata.sourceFile
                  : undefined,
              sourceRecordId:
                typeof raw.serviceMetadata.sourceRecordId === "string"
                  ? raw.serviceMetadata.sourceRecordId
                  : undefined,
              effectiveDate:
                typeof raw.serviceMetadata.effectiveDate === "string"
                  ? raw.serviceMetadata.effectiveDate
                  : undefined,
              cycle:
                typeof raw.serviceMetadata.cycle === "string"
                  ? raw.serviceMetadata.cycle
                  : undefined,
            },
          }
        : {}),
      runways,
      hasPublishedApproaches,
      ...(catalogRef ? { catalogRef } : {}),
    };

    airportMap.set(icao, airport);
    airports.push(airport);
  }

  // Parse airspaces
  const rawAirspaceList =
    isRecord(airspaceJson) && Array.isArray(airspaceJson.airspaces)
      ? airspaceJson.airspaces
      : Array.isArray(airspaceJson)
        ? airspaceJson
        : null;

  if (!rawAirspaceList) {
    throw new Error("Regional airspace file must contain an airspaces array");
  }

  const airspaceIds = new Set<string>();
  const airspaces: RegionalAirspaceVolume[] = [];

  for (let i = 0; i < rawAirspaceList.length; i++) {
    const raw = rawAirspaceList[i];
    if (!isRecord(raw)) {
      throw new Error(`Regional airspaces[${i}] must be an object`);
    }

    const id = assertString(raw.id, `airspaces[${i}].id`, "Regional", true);
    if (airspaceIds.has(id)) {
      throw new Error(`Duplicate airspace ID in regional pack: ${id}`);
    }
    airspaceIds.add(id);

    const name = assertString(raw.name, `airspaces[${i}].name`, "Regional");
    const type = assertString(raw.type, `airspaces[${i}].type`, "Regional") as
      "CONTROLLED" | "SPECIAL_USE";
    const airspaceClass = typeof raw.class === "string" ? raw.class : undefined;
    const specialUseKind = typeof raw.specialUseKind === "string" ? raw.specialUseKind : undefined;
    const centerAirport = typeof raw.centerAirportId === "string" ? raw.centerAirportId : undefined;

    // Validate vertical limits
    if (!isRecord(raw.lowerLimit) || !isRecord(raw.upperLimit)) {
      throw new Error(`Airspace ${id} must specify lowerLimit and upperLimit`);
    }

    const lowerUnit = assertString(raw.lowerLimit.unit, `airspaces[${i}].lowerLimit.unit`);
    const upperUnit = assertString(raw.upperLimit.unit, `airspaces[${i}].upperLimit.unit`);

    if (
      lowerUnit === "UNKNOWN" ||
      lowerUnit === "NOT_SPECIFIED" ||
      upperUnit === "UNKNOWN" ||
      upperUnit === "NOT_SPECIFIED"
    ) {
      throw new Error(`Airspace ${id} has invalid or unspecified altitude unit`);
    }

    const rawLowerAlt = raw.lowerLimit.altitudeFt;
    const rawUpperAlt = raw.upperLimit.altitudeFt;

    const isSurface =
      raw.lowerLimit.unit === "GND" ||
      raw.lowerLimit.reference === "SURFACE" ||
      raw.lowerLimit.rawAltitude === "SFC" ||
      raw.lowerLimit.rawAltitude === "GND";

    if (!isSurface && (typeof rawLowerAlt !== "number" || !Number.isFinite(rawLowerAlt))) {
      throw new Error(`Airspace ${id} has non-surface lower limit with missing altitude value`);
    }

    if (typeof rawUpperAlt !== "number" || !Number.isFinite(rawUpperAlt)) {
      throw new Error(`Airspace ${id} has missing upper altitude value`);
    }

    const lowerLimitFt: number = isSurface ? 0 : (rawLowerAlt as number);
    const upperLimitFt: number = rawUpperAlt as number;

    if (lowerLimitFt > upperLimitFt) {
      throw new Error(
        `Invalid airspace vertical limits: lower limit ${lowerLimitFt} exceeds upper limit ${upperLimitFt} for airspace ${id}`,
      );
    }

    // Validate segments
    const rawSegments = assertArray(raw.segments, `airspaces[${i}].segments`);
    if (rawSegments.length === 0) {
      throw new Error(`Airspace ${id} has no boundary segments`);
    }

    const segments: RegionalAirspaceSegment[] = [];
    for (let j = 0; j < rawSegments.length; j++) {
      const seg = rawSegments[j];
      if (!isRecord(seg)) {
        throw new Error(`airspaces[${i}].segments[${j}] must be an object`);
      }

      const boundaryViaType = assertString(
        seg.boundaryViaType,
        `airspaces[${i}].segments[${j}].boundaryViaType`,
      );
      if (!SUPPORTED_BOUNDARY_VIAS.has(boundaryViaType) || boundaryViaType === "UNSUPPORTED") {
        throw new Error(`Airspace ${id} contains unsupported boundary via: ${boundaryViaType}`);
      }

      const position = parseLatLon(seg.position, `airspaces[${i}].segments[${j}].position`);
      const positionNm = latLonToNm(position, centerArp);

      let arcOrigin: LatLon | undefined;
      let arcOriginNm: NmEastNorth | undefined;
      let arcDistanceNm: number | undefined;

      if (
        boundaryViaType === "CIRCLE" ||
        boundaryViaType === "CLOCKWISE_ARC" ||
        boundaryViaType === "COUNTER_CLOCKWISE_ARC"
      ) {
        if (!isRecord(seg.arcOrigin)) {
          throw new Error(`Airspace ${id} arc segment ${j} requires arcOrigin coordinates`);
        }
        arcOrigin = parseLatLon(seg.arcOrigin, `airspaces[${i}].segments[${j}].arcOrigin`);
        arcOriginNm = latLonToNm(arcOrigin, centerArp);
        arcDistanceNm = assertNumber(
          seg.arcDistanceNm,
          `airspaces[${i}].segments[${j}].arcDistanceNm`,
        );
        if (arcDistanceNm <= 0) {
          throw new Error(`Airspace ${id} arc segment ${j} arcDistanceNm must be positive`);
        }
      }

      segments.push({
        sequence: assertNumber(seg.sequence, `airspaces[${i}].segments[${j}].sequence`),
        boundaryVia: assertString(seg.boundaryVia, `airspaces[${i}].segments[${j}].boundaryVia`),
        boundaryViaType,
        position,
        positionNm,
        ...(arcOrigin ? { arcOrigin, arcOriginNm } : {}),
        ...(arcDistanceNm !== undefined ? { arcDistanceNm } : {}),
        ...(typeof seg.arcBearingDeg === "number" ? { arcBearingDeg: seg.arcBearingDeg } : {}),
      });
    }

    airspaces.push({
      id,
      name,
      type,
      ...(airspaceClass ? { class: airspaceClass } : {}),
      ...(specialUseKind ? { specialUseKind } : {}),
      ...(centerAirport ? { centerAirportId: centerAirport } : {}),
      lowerLimit: {
        altitudeFt:
          typeof raw.lowerLimit.altitudeFt === "number" ? raw.lowerLimit.altitudeFt : undefined,
        unit: lowerUnit,
        reference: assertString(raw.lowerLimit.reference, "lowerLimit.reference"),
        rawAltitude:
          typeof raw.lowerLimit.rawAltitude === "string" ? raw.lowerLimit.rawAltitude : undefined,
        rawUnit: typeof raw.lowerLimit.rawUnit === "string" ? raw.lowerLimit.rawUnit : undefined,
      },
      upperLimit: {
        altitudeFt: upperLimitFt,
        unit: upperUnit,
        reference: assertString(raw.upperLimit.reference, "upperLimit.reference"),
        rawAltitude:
          typeof raw.upperLimit.rawAltitude === "string" ? raw.upperLimit.rawAltitude : undefined,
        rawUnit: typeof raw.upperLimit.rawUnit === "string" ? raw.upperLimit.rawUnit : undefined,
      },
      lowerLimitFt,
      upperLimitFt,
      segments,
    });
  }

  return {
    schemaVersion: 1,
    centerAirportId,
    radiusNm,
    arp: centerArp,
    source,
    airports,
    airspaces,
    getAirport: (icao: string) => airportMap.get(icao.toUpperCase()),
    hasAirport: (icao: string) => airportMap.has(icao.toUpperCase()),
    getEligibleDestinations: () => airports.filter((a) => a.eligible),
    getEligibleDestination: (icao: string) => {
      const apt = airportMap.get(icao.toUpperCase());
      if (!apt) {
        throw new Error(`Unknown regional destination airport: ${icao}`);
      }
      if (!apt.eligible) {
        throw new Error(
          `Airport ${icao} is not an eligible destination (${apt.exclusionReason ?? "ineligible"})`,
        );
      }
      return apt;
    },
    getAirspaces: () => [...airspaces],
  };
}

export interface LoadRegionalPackOptions {
  centerIcao?: string;
  centerArp?: LatLon;
  optional?: boolean;
  dataJson?: Record<string, unknown>;
}

export function hasRegionalPack(packId: string, dataJson = DATA_JSON): boolean {
  const normalized = packId.toLowerCase();
  const manifestPath = `./data/${normalized}/regional.json`;
  return manifestPath in dataJson;
}

export function loadRegionalPack(
  packId: string,
  options?: LoadRegionalPackOptions,
): RegionalFacility | undefined {
  const data = options?.dataJson ?? DATA_JSON;
  const normalized = packId.toLowerCase();
  const manifestPath = `./data/${normalized}/regional.json`;

  if (!(manifestPath in data)) {
    if (options?.optional) {
      return undefined;
    }
    throw new Error(`Missing regional pack manifest: ${manifestPath}`);
  }

  const manifest = data[manifestPath];
  if (!isRecord(manifest) || !isRecord(manifest.files)) {
    throw new Error(`Regional pack ${manifestPath} is invalid (missing files declaration)`);
  }

  const airportsFileName =
    typeof manifest.files.airports === "string"
      ? manifest.files.airports
      : "regional-airports.json";
  const airspaceFileName =
    typeof manifest.files.airspace === "string"
      ? manifest.files.airspace
      : "regional-airspace.json";

  const airportsPath = `./data/${normalized}/${airportsFileName}`;
  const airspacePath = `./data/${normalized}/${airspaceFileName}`;

  if (!(airportsPath in data)) {
    throw new Error(`Missing regional airports file: ${airportsPath}`);
  }
  if (!(airspacePath in data)) {
    throw new Error(`Missing regional airspace file: ${airspacePath}`);
  }

  const facility = parseRegionalPack(
    manifest,
    data[airportsPath],
    data[airspacePath],
    options?.centerArp,
  );

  if (options?.centerIcao) {
    if (facility.centerAirportId.toUpperCase() !== options.centerIcao.toUpperCase()) {
      throw new Error(
        `Regional pack center airport mismatch: expected ${options.centerIcao} but got ${facility.centerAirportId}`,
      );
    }
  }

  return facility;
}
