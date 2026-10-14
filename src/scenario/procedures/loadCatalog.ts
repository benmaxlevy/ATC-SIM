/**
 * Load a facility procedure catalog from `src/scenario/data/<dir>/`.
 * Directory path, not a KDEM-only function: a later importer can write
 * `data/<ICAO>/` in this same shape without a rewrite.
 *
 * Video maps are a separate MAPS catalog. This loader never joins STAR JSON
 * to `video-maps/` (AC5b).
 */

import type {
  AltConstraint,
  ApproachProcedure,
  ApproachType,
  AtpaWakeAdaptation,
  AtpaWakeMatrix,
  AtpaVolume,
  FmaAdaptation,
  FmaGroupAdaptation,
  MissedApproach,
  Navaid,
  NavaidKind,
  NavFix,
  NavFixKind,
  ProcedureCatalog,
  SidEnrouteTransition,
  SidLeg,
  SidProcedure,
  SidRunwayTransition,
  SpeedConstraint,
  StarLeg,
  StarProcedure,
  StarTransition,
} from "./types";
import {
  DEFAULT_GS_BEAM_FULL_WIDTH_DEG,
  DEFAULT_LOC_FULL_SCALE_HALF_WIDTH_FT_AT_THRESHOLD,
} from "./types";
import { magneticToTrueDeg } from "../../core/nav/headingFrames";
import {
  assertArray as assertArrayVal,
  assertNumber as assertNumberVal,
  assertString as assertStringVal,
  isRecord,
} from "../assertions";

const DATA_JSON = import.meta.glob<unknown>("../data/*/*.json", {
  eager: true,
  import: "default",
});

const NAVAID_KINDS = new Set<NavaidKind>([
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

const FIX_KINDS = new Set<NavFixKind>(["WAYPOINT", "INTERSECTION", "FAF", "MAPT", "THRESHOLD"]);

const APPROACH_TYPES = new Set<ApproachType>(["ILS", "LOC", "RNAV", "VOR", "NDB"]);

const ALT_TYPES = new Set(["AT", "AT_OR_ABOVE", "AT_OR_BELOW"]);

const NAVAID_CLASSES = new Set(["T", "L", "H"]);
const FMA_GROUP_ID_RE = /^[A-Z0-9]{1,7}$/;

function isSimpleFmaPolygon(points: readonly { xNm: number; yNm: number }[]): boolean {
  if (points.length < 3 || points.some((p) => !Number.isFinite(p.xNm) || !Number.isFinite(p.yNm)))
    return false;
  const cross = (
    a: (typeof points)[number],
    b: (typeof points)[number],
    c: (typeof points)[number],
  ) => (b.xNm - a.xNm) * (c.yNm - a.yNm) - (b.yNm - a.yNm) * (c.xNm - a.xNm);
  const onSegment = (
    a: (typeof points)[number],
    b: (typeof points)[number],
    p: (typeof points)[number],
  ) =>
    Math.abs(cross(a, b, p)) <= 1e-12 &&
    p.xNm >= Math.min(a.xNm, b.xNm) - 1e-12 &&
    p.xNm <= Math.max(a.xNm, b.xNm) + 1e-12 &&
    p.yNm >= Math.min(a.yNm, b.yNm) - 1e-12 &&
    p.yNm <= Math.max(a.yNm, b.yNm) + 1e-12;
  const intersects = (
    a: (typeof points)[number],
    b: (typeof points)[number],
    c: (typeof points)[number],
    d: (typeof points)[number],
  ) => {
    const abC = cross(a, b, c),
      abD = cross(a, b, d),
      cdA = cross(c, d, a),
      cdB = cross(c, d, b);
    if (abC * abD < -1e-12 && cdA * cdB < -1e-12) return true;
    return (
      (Math.abs(abC) <= 1e-12 && onSegment(a, b, c)) ||
      (Math.abs(abD) <= 1e-12 && onSegment(a, b, d)) ||
      (Math.abs(cdA) <= 1e-12 && onSegment(c, d, a)) ||
      (Math.abs(cdB) <= 1e-12 && onSegment(c, d, b))
    );
  };
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    if (Math.hypot(a.xNm - b.xNm, a.yNm - b.yNm) <= 1e-12) return false;
  }
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p.xNm * q.yNm - q.xNm * p.yNm;
  }, 0);
  if (Math.abs(area) <= 1e-9) return false;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      if (j === i || j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (
        intersects(
          points[i]!,
          points[(i + 1) % points.length]!,
          points[j]!,
          points[(j + 1) % points.length]!,
        )
      )
        return false;
    }
  return true;
}

function containsInPolygon(
  point: { xNm: number; yNm: number },
  polygon: readonly { xNm: number; yNm: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!,
      b = polygon[i]!;
    const cross = (b.xNm - a.xNm) * (point.yNm - a.yNm) - (b.yNm - a.yNm) * (point.xNm - a.xNm);
    if (
      Math.abs(cross) <= 1e-10 &&
      point.xNm >= Math.min(a.xNm, b.xNm) - 1e-10 &&
      point.xNm <= Math.max(a.xNm, b.xNm) + 1e-10 &&
      point.yNm >= Math.min(a.yNm, b.yNm) - 1e-10 &&
      point.yNm <= Math.max(a.yNm, b.yNm) + 1e-10
    )
      return true;
    if (
      a.yNm > point.yNm !== b.yNm > point.yNm &&
      point.xNm < ((b.xNm - a.xNm) * (point.yNm - a.yNm)) / (b.yNm - a.yNm) + a.xNm
    )
      inside = !inside;
  }
  return inside;
}

/** ILS DME ids (IDEMDME, IDEMDME09) are up to 9 chars; keep the ceiling at 10. */
const ID_RE = /^[A-Z0-9]{2,10}$/;

const REQUIRED_FILES = ["vors", "ndbs", "ils", "fixes", "procedures", "sids"] as const;

export type CatalogFileSet = {
  catalog: unknown;
  vors: unknown;
  ndbs: unknown;
  ils: unknown;
  fixes: unknown;
  procedures: unknown;
  sids: unknown;
  /** Present only when `catalog.files.atpaVolumes` lists a file. */
  atpaVolumes?: unknown;
};

const assertNumber = (value: unknown, path: string): number =>
  assertNumberVal(value, path, "Catalog");
const assertString = (value: unknown, path: string): string =>
  assertStringVal(value, path, "Catalog");
const assertArray = (value: unknown, path: string): unknown[] =>
  assertArrayVal(value, path, "Catalog");

function optionalNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertNumber(value, path);
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertString(value, path);
}

function parseFmaAdaptation(raw: unknown): FmaAdaptation | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error("Catalog fmaOverrides must be an object");
  const groups =
    raw.groups === undefined
      ? undefined
      : assertArray(raw.groups, "fmaOverrides.groups").map((item, i): FmaGroupAdaptation => {
          const path = `fmaOverrides.groups[${i}]`;
          if (!isRecord(item)) throw new Error(`Catalog ${path} must be an object`);
          const strings = (value: unknown, field: string): string[] | undefined =>
            value === undefined
              ? undefined
              : assertArray(value, `${path}.${field}`).map((v, j) =>
                  assertString(v, `${path}.${field}[${j}]`).toUpperCase(),
                );
          const positive = (value: unknown, field: string): number | undefined => {
            if (value === undefined) return undefined;
            const n = assertNumber(value, `${path}.${field}`);
            if (n <= 0) throw new Error(`Catalog ${path}.${field} must be positive`);
            return n;
          };
          let geometry: FmaGroupAdaptation["geometry"];
          if (item.geometry !== undefined) {
            if (!isRecord(item.geometry))
              throw new Error(`Catalog ${path}.geometry must be an object`);
            const pointList = (value: unknown, field: string) =>
              assertArray(value, `${path}.geometry.${field}`).map((p, j) => {
                if (!isRecord(p))
                  throw new Error(`Catalog ${path}.geometry.${field}[${j}] must be an object`);
                return {
                  xNm: assertNumber(p.xNm, `${path}.geometry.${field}[${j}].xNm`),
                  yNm: assertNumber(p.yNm, `${path}.geometry.${field}[${j}].yNm`),
                };
              });
            geometry = {
              amzBoundary: pointList(item.geometry.amzBoundary, "amzBoundary"),
              runways: assertArray(item.geometry.runways, `${path}.geometry.runways`).map(
                (r, j) => {
                  if (!isRecord(r))
                    throw new Error(`Catalog ${path}.geometry.runways[${j}] must be an object`);
                  return {
                    runwayId: assertString(
                      r.runwayId,
                      `${path}.geometry.runways[${j}].runwayId`,
                    ).toUpperCase(),
                    noz: pointList(r.noz, `runways[${j}].noz`),
                    ...(r.departureEnd !== undefined
                      ? {
                          departureEnd: pointList(
                            [r.departureEnd],
                            `runways[${j}].departureEnd`,
                          )[0]!,
                        }
                      : {}),
                  };
                },
              ),
              ntzs: assertArray(item.geometry.ntzs, `${path}.geometry.ntzs`).map((z, j) => {
                if (!isRecord(z))
                  throw new Error(`Catalog ${path}.geometry.ntzs[${j}] must be an object`);
                return {
                  id: assertString(z.id, `${path}.geometry.ntzs[${j}].id`),
                  leftRunwayId: assertString(
                    z.leftRunwayId,
                    `${path}.geometry.ntzs[${j}].leftRunwayId`,
                  ).toUpperCase(),
                  rightRunwayId: assertString(
                    z.rightRunwayId,
                    `${path}.geometry.ntzs[${j}].rightRunwayId`,
                  ).toUpperCase(),
                  polygon: pointList(z.polygon, `ntzs[${j}].polygon`),
                };
              }),
              ...(item.geometry.courseLines !== undefined
                ? {
                    courseLines: assertArray(
                      item.geometry.courseLines,
                      `${path}.geometry.courseLines`,
                    ).map((line, j) => {
                      if (!isRecord(line))
                        throw new Error(
                          `Catalog ${path}.geometry.courseLines[${j}] must be an object`,
                        );
                      const approach = pointList(
                        [
                          ...assertArray(
                            line.approach,
                            `${path}.geometry.courseLines[${j}].approach`,
                          ),
                        ],
                        `courseLines[${j}].approach`,
                      );
                      const departure = pointList(
                        [
                          ...assertArray(
                            line.departure,
                            `${path}.geometry.courseLines[${j}].departure`,
                          ),
                        ],
                        `courseLines[${j}].departure`,
                      );
                      if (approach.length !== 2 || departure.length !== 2)
                        throw new Error(
                          `Catalog ${path}.geometry.courseLines[${j}] endpoints must have two points`,
                        );
                      return {
                        runwayId: assertString(
                          line.runwayId,
                          `${path}.geometry.courseLines[${j}].runwayId`,
                        ).toUpperCase(),
                        approach: [approach[0]!, approach[1]!] as [
                          (typeof approach)[number],
                          (typeof approach)[number],
                        ],
                        departure: [departure[0]!, departure[1]!] as [
                          (typeof departure)[number],
                          (typeof departure)[number],
                        ],
                      };
                    }),
                  }
                : {}),
              ...(item.geometry.referenceLines !== undefined
                ? {
                    referenceLines: assertArray(
                      item.geometry.referenceLines,
                      `${path}.geometry.referenceLines`,
                    ).map((line, j) => {
                      const points = pointList(line, `referenceLines[${j}]`);
                      if (points.length !== 2)
                        throw new Error(
                          `Catalog ${path}.geometry.referenceLines[${j}] must have two endpoints`,
                        );
                      return [points[0]!, points[1]!] as [
                        (typeof points)[number],
                        (typeof points)[number],
                      ];
                    }),
                  }
                : {}),
              ...(item.geometry.fixBars !== undefined
                ? {
                    fixBars: assertArray(item.geometry.fixBars, `${path}.geometry.fixBars`).map(
                      (bar, j) => {
                        if (!isRecord(bar))
                          throw new Error(
                            `Catalog ${path}.geometry.fixBars[${j}] must be an object`,
                          );
                        const segment = pointList(bar.segment, `fixBars[${j}].segment`);
                        if (segment.length !== 2)
                          throw new Error(
                            `Catalog ${path}.geometry.fixBars[${j}].segment must have two endpoints`,
                          );
                        return {
                          fixId: assertString(
                            bar.fixId,
                            `${path}.geometry.fixBars[${j}].fixId`,
                          ).toUpperCase(),
                          runwayId: assertString(
                            bar.runwayId,
                            `${path}.geometry.fixBars[${j}].runwayId`,
                          ).toUpperCase(),
                          point: pointList([bar.point], `fixBars[${j}].point`)[0]!,
                          segment: [segment[0]!, segment[1]!] as [
                            (typeof segment)[number],
                            (typeof segment)[number],
                          ],
                        };
                      },
                    ),
                  }
                : {}),
            };
          }
          let verticalLimits: FmaGroupAdaptation["verticalLimits"];
          if (item.verticalLimits !== undefined) {
            if (!isRecord(item.verticalLimits))
              throw new Error(`Catalog ${path}.verticalLimits must be an object`);
            const floorFt = assertNumber(
              item.verticalLimits.floorFt,
              `${path}.verticalLimits.floorFt`,
            );
            const ceilingFt = assertNumber(
              item.verticalLimits.ceilingFt,
              `${path}.verticalLimits.ceilingFt`,
            );
            if (floorFt >= ceilingFt)
              throw new Error(`Catalog ${path}.verticalLimits must be ordered`);
            verticalLimits = { floorFt, ceilingFt };
          }
          let monitoring: FmaGroupAdaptation["monitoring"];
          if (item.monitoring !== undefined) {
            if (!isRecord(item.monitoring))
              throw new Error(`Catalog ${path}.monitoring must be an object`);
            monitoring = {};
            for (const field of [
              "cautionHorizonS",
              "surveillanceLossS",
              "coastOutS",
              "stabilizationS",
              "courseToleranceDeg",
              "alignmentHalfWidthNm",
              "maximumPtlS",
            ] as const) {
              if (item.monitoring[field] !== undefined) {
                const value = assertNumber(item.monitoring[field], `${path}.monitoring.${field}`);
                if (value <= 0)
                  throw new Error(`Catalog ${path}.monitoring.${field} must be positive`);
                monitoring[field] = value;
              }
            }
          }
          let runwayAliases: FmaGroupAdaptation["runwayAliases"];
          if (item.runwayAliases !== undefined) {
            if (!isRecord(item.runwayAliases))
              throw new Error(`Catalog ${path}.runwayAliases must be an object`);
            runwayAliases = {};
            for (const [runwayId, values] of Object.entries(item.runwayAliases)) {
              runwayAliases[runwayId.toUpperCase()] = assertArray(
                values,
                `${path}.runwayAliases.${runwayId}`,
              ).map((value, j) =>
                assertString(value, `${path}.runwayAliases.${runwayId}[${j}]`).trim().toUpperCase(),
              );
            }
          }
          const groupId = assertString(item.id, `${path}.id`);
          if (!FMA_GROUP_ID_RE.test(groupId.toUpperCase()))
            throw new Error(`Catalog ${path}.id must match [A-Z0-9]{1,7}`);
          return {
            id: groupId.toUpperCase(),
            ...(item.label !== undefined
              ? { label: assertString(item.label, `${path}.label`) }
              : {}),
            ...(strings(item.approachIds, "approachIds")
              ? { approachIds: strings(item.approachIds, "approachIds") }
              : {}),
            ...(strings(item.runwayIds, "runwayIds")
              ? { runwayIds: strings(item.runwayIds, "runwayIds") }
              : {}),
            ...(runwayAliases ? { runwayAliases } : {}),
            ...(positive(item.captureLengthNm, "captureLengthNm") !== undefined
              ? { captureLengthNm: positive(item.captureLengthNm, "captureLengthNm") }
              : {}),
            ...(positive(item.ntzWidthFt, "ntzWidthFt") !== undefined
              ? { ntzWidthFt: positive(item.ntzWidthFt, "ntzWidthFt") }
              : {}),
            ...(positive(item.outerMarginNm, "outerMarginNm") !== undefined
              ? { outerMarginNm: positive(item.outerMarginNm, "outerMarginNm") }
              : {}),
            ...(positive(item.departureExtensionNm, "departureExtensionNm") !== undefined
              ? {
                  departureExtensionNm: positive(item.departureExtensionNm, "departureExtensionNm"),
                }
              : {}),
            ...(geometry ? { geometry } : {}),
            ...(verticalLimits ? { verticalLimits } : {}),
            ...(monitoring ? { monitoring } : {}),
          };
        });
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean")
    throw new Error("Catalog fmaOverrides.enabled must be boolean");
  if (raw.source !== undefined && raw.source !== "TRAINER_AUTHORED")
    throw new Error("Catalog fmaOverrides.source must be TRAINER_AUTHORED");
  const sourceNote =
    raw.sourceNote === undefined
      ? undefined
      : assertString(raw.sourceNote, "fmaOverrides.sourceNote").trim();
  if (raw.source !== undefined && !sourceNote)
    throw new Error("Catalog fmaOverrides.sourceNote is required for trainer-authored adaptation");
  if (raw.source === "TRAINER_AUTHORED") {
    const seen = new Set<string>();
    for (const [i, group] of (groups ?? []).entries()) {
      const path = `fmaOverrides.groups[${i}]`;
      if (seen.has(group.id.toUpperCase()))
        throw new Error(`Catalog ${path}.id duplicates ${group.id}`);
      seen.add(group.id.toUpperCase());
      if (!group.geometry || (!group.approachIds?.length && !group.runwayIds?.length))
        throw new Error(`Catalog ${path} requires complete geometry and approachIds or runwayIds`);
      if (!isSimpleFmaPolygon(group.geometry.amzBoundary))
        throw new Error(
          `Catalog ${path}.geometry.amzBoundary must be finite, simple and nondegenerate`,
        );
      for (const [j, runway] of group.geometry.runways.entries())
        if (!isSimpleFmaPolygon(runway.noz))
          throw new Error(
            `Catalog ${path}.geometry.runways[${j}].noz must be finite, simple and nondegenerate`,
          );
      for (const [j, ntz] of group.geometry.ntzs.entries())
        if (!isSimpleFmaPolygon(ntz.polygon))
          throw new Error(
            `Catalog ${path}.geometry.ntzs[${j}].polygon must be finite, simple and nondegenerate`,
          );
      const ntzIds = new Set<string>();
      for (const [j, ntz] of group.geometry.ntzs.entries()) {
        if (ntzIds.has(ntz.id))
          throw new Error(`Catalog ${path}.geometry.ntzs[${j}].id duplicates ${ntz.id}`);
        ntzIds.add(ntz.id);
      }
    }
  }
  return {
    ...(raw.enabled !== undefined ? { enabled: raw.enabled } : {}),
    ...(raw.source !== undefined ? { source: "TRAINER_AUTHORED" as const, sourceNote } : {}),
    ...(groups ? { groups } : {}),
  };
}

function assertId(value: unknown, path: string): string {
  const id = assertString(value, path).toUpperCase();
  if (!ID_RE.test(id)) {
    throw new Error(
      `Catalog ${path} must be uppercase [A-Z0-9]{2,8} (got ${JSON.stringify(value)})`,
    );
  }
  return id;
}

function assertLatLon(value: unknown, path: string): { latDeg: number; lonDeg: number } {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  return {
    latDeg: assertNumber(value.latDeg, `${path}.latDeg`),
    lonDeg: assertNumber(value.lonDeg, `${path}.lonDeg`),
  };
}

function optionalLatLon(
  raw: Record<string, unknown>,
  path: string,
): { latDeg?: number; lonDeg?: number } {
  const latDeg = optionalNumber(raw.latDeg, `${path}.latDeg`);
  const lonDeg = optionalNumber(raw.lonDeg, `${path}.lonDeg`);
  return {
    ...(latDeg !== undefined ? { latDeg } : {}),
    ...(lonDeg !== undefined ? { lonDeg } : {}),
  };
}

function parseAltConstraint(value: unknown, path: string): AltConstraint {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const type = assertString(value.type, `${path}.type`);
  if (!ALT_TYPES.has(type)) {
    throw new Error(`Catalog ${path}.type is unknown: ${type}`);
  }
  return {
    type: type as AltConstraint["type"],
    altitudeFt: assertNumber(value.altitudeFt, `${path}.altitudeFt`),
  };
}

function parseSpeedConstraint(value: unknown, path: string): SpeedConstraint {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const type = assertString(value.type, `${path}.type`);
  if (!ALT_TYPES.has(type)) {
    throw new Error(`Catalog ${path}.type is unknown: ${type}`);
  }
  return {
    type: type as SpeedConstraint["type"],
    speedKt: assertNumber(value.speedKt, `${path}.speedKt`),
  };
}

function parseStarLeg(value: unknown, path: string): StarLeg {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const leg: StarLeg = { fixId: assertId(value.fixId, `${path}.fixId`) };
  if (value.altConstraint !== undefined) {
    leg.altConstraint = parseAltConstraint(value.altConstraint, `${path}.altConstraint`);
  }
  if (value.speedConstraint !== undefined) {
    leg.speedConstraint = parseSpeedConstraint(value.speedConstraint, `${path}.speedConstraint`);
  }
  return leg;
}

function parseStarTransition(value: unknown, path: string): StarTransition {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const runwayId = optionalString(value.runwayId, `${path}.runwayId`);
  const runways =
    value.runways !== undefined
      ? assertArray(value.runways, `${path}.runways`).map((r, i) =>
          assertString(r, `${path}.runways[${i}]`),
        )
      : undefined;
  return {
    id: assertString(value.id, `${path}.id`),
    name: assertString(value.name, `${path}.name`),
    ...(runwayId !== undefined ? { runwayId } : {}),
    ...(runways !== undefined ? { runways } : {}),
    legs: assertArray(value.legs, `${path}.legs`).map((leg, i) =>
      parseStarLeg(leg, `${path}.legs[${i}]`),
    ),
  };
}

function parseStar(value: unknown, index: number): StarProcedure {
  const path = `stars[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const transitions = assertArray(value.transitions, `${path}.transitions`).map((item, i) =>
    parseStarTransition(item, `${path}.transitions[${i}]`),
  );
  const common = assertArray(value.common, `${path}.common`).map((leg, i) =>
    parseStarLeg(leg, `${path}.common[${i}]`),
  );
  const termination = assertString(value.termination, `${path}.termination`);
  if (termination !== "VECTORS") {
    throw new Error(`Catalog ${path}.termination must be VECTORS`);
  }
  const star: StarProcedure = {
    id: assertString(value.id, `${path}.id`),
    name: assertString(value.name, `${path}.name`),
    transitions,
    common,
    termination: "VECTORS",
  };
  const legCount = common.length + transitions.reduce((sum, t) => sum + t.legs.length, 0);
  if (legCount === 0) {
    throw new Error(`Catalog ${path} is empty (no transition or common legs)`);
  }
  return star;
}

function parseSidLeg(value: unknown, path: string): SidLeg {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const leg: SidLeg = { fixId: assertId(value.fixId, `${path}.fixId`) };
  if (value.altConstraint !== undefined) {
    leg.altConstraint = parseAltConstraint(value.altConstraint, `${path}.altConstraint`);
  }
  if (value.speedConstraint !== undefined) {
    leg.speedConstraint = parseSpeedConstraint(value.speedConstraint, `${path}.speedConstraint`);
  }
  return leg;
}

function parseSidRunwayTransition(value: unknown, path: string): SidRunwayTransition {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  return {
    runwayId: assertString(value.runwayId, `${path}.runwayId`),
    initialHeadingDeg: optionalNumber(value.initialHeadingDeg, `${path}.initialHeadingDeg`),
    initialClimbFt: optionalNumber(value.initialClimbFt, `${path}.initialClimbFt`),
    legs: assertArray(value.legs, `${path}.legs`).map((leg, i) =>
      parseSidLeg(leg, `${path}.legs[${i}]`),
    ),
  };
}

function parseSidEnrouteTransition(value: unknown, path: string): SidEnrouteTransition {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const id = assertString(value.id, `${path}.id`);
  const name = assertString(value.name, `${path}.name`);
  const legs =
    value.legs !== undefined
      ? assertArray(value.legs, `${path}.legs`).map((leg, i) =>
          parseSidLeg(leg, `${path}.legs[${i}]`),
        )
      : undefined;
  const runwayTransitions =
    value.runwayTransitions !== undefined
      ? assertArray(value.runwayTransitions, `${path}.runwayTransitions`).map((item, i) =>
          parseSidRunwayTransition(item, `${path}.runwayTransitions[${i}]`),
        )
      : undefined;
  if (!legs && !runwayTransitions) {
    throw new Error(`Catalog ${path} must have legs or runwayTransitions`);
  }
  return {
    id,
    name,
    ...(legs !== undefined ? { legs } : {}),
    ...(runwayTransitions !== undefined ? { runwayTransitions } : {}),
  };
}

function parseSid(value: unknown, index: number): SidProcedure {
  const path = `sids[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const runwayTransitions =
    value.runwayTransitions !== undefined
      ? assertArray(value.runwayTransitions, `${path}.runwayTransitions`).map((item, i) =>
          parseSidRunwayTransition(item, `${path}.runwayTransitions[${i}]`),
        )
      : undefined;
  const common = assertArray(value.common, `${path}.common`).map((leg, i) =>
    parseSidLeg(leg, `${path}.common[${i}]`),
  );
  const enrouteTransitions =
    value.enrouteTransitions !== undefined
      ? assertArray(value.enrouteTransitions, `${path}.enrouteTransitions`).map((item, i) =>
          parseSidEnrouteTransition(item, `${path}.enrouteTransitions[${i}]`),
        )
      : undefined;
  const initialClimbFt = optionalNumber(value.initialClimbFt, `${path}.initialClimbFt`);

  const sid: SidProcedure = {
    id: assertString(value.id, `${path}.id`),
    name: assertString(value.name, `${path}.name`),
    ...(runwayTransitions !== undefined ? { runwayTransitions } : {}),
    common,
    ...(enrouteTransitions !== undefined ? { enrouteTransitions } : {}),
    ...(initialClimbFt !== undefined ? { initialClimbFt } : {}),
  };

  const legCount =
    common.length +
    (runwayTransitions?.reduce((sum, t) => sum + t.legs.length, 0) ?? 0) +
    (enrouteTransitions?.reduce(
      (sum, t) =>
        sum +
        (t.legs?.length ?? 0) +
        (t.runwayTransitions?.reduce((rtSum, rt) => rtSum + rt.legs.length, 0) ?? 0),
      0,
    ) ?? 0);
  if (legCount === 0) {
    throw new Error(
      `Catalog ${path} is empty (no runway transition, common, or enroute transition legs)`,
    );
  }
  return sid;
}

function parseMissed(value: unknown, path: string): MissedApproach {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const directFixId = optionalString(value.directFixId, `${path}.directFixId`);
  return {
    headingDeg: assertNumber(value.headingDeg, `${path}.headingDeg`),
    climbToFt: assertNumber(value.climbToFt, `${path}.climbToFt`),
    ...(directFixId !== undefined ? { directFixId: directFixId.toUpperCase() } : {}),
  };
}

function parseApproach(value: unknown, index: number): ApproachProcedure {
  const path = `approaches[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const type = assertString(value.type, `${path}.type`);
  if (!APPROACH_TYPES.has(type as ApproachType)) {
    throw new Error(`Catalog ${path}.type is unknown: ${type}`);
  }
  const approach: ApproachProcedure = {
    id: assertString(value.id, `${path}.id`),
    type: type as ApproachType,
    runway: assertString(value.runway, `${path}.runway`).toUpperCase(),
    name: assertString(value.name, `${path}.name`),
    locFullScaleHalfWidthFtAtThreshold:
      optionalNumber(
        value.locFullScaleHalfWidthFtAtThreshold,
        `${path}.locFullScaleHalfWidthFtAtThreshold`,
      ) ?? DEFAULT_LOC_FULL_SCALE_HALF_WIDTH_FT_AT_THRESHOLD,
    gsBeamFullWidthDeg:
      optionalNumber(value.gsBeamFullWidthDeg, `${path}.gsBeamFullWidthDeg`) ??
      DEFAULT_GS_BEAM_FULL_WIDTH_DEG,
  };
  const locNavaidId = optionalString(value.locNavaidId, `${path}.locNavaidId`);
  const gsNavaidId = optionalString(value.gsNavaidId, `${path}.gsNavaidId`);
  const fafFixId = optionalString(value.fafFixId, `${path}.fafFixId`);
  const thresholdFixId = optionalString(value.thresholdFixId, `${path}.thresholdFixId`);
  if (locNavaidId !== undefined) {
    approach.locNavaidId = locNavaidId.toUpperCase();
  }
  if (gsNavaidId !== undefined) {
    approach.gsNavaidId = gsNavaidId.toUpperCase();
  }
  if (fafFixId !== undefined) {
    approach.fafFixId = fafFixId.toUpperCase();
  }
  if (thresholdFixId !== undefined) {
    approach.thresholdFixId = thresholdFixId.toUpperCase();
  }
  const courseDeg = optionalNumber(value.courseDeg, `${path}.courseDeg`);
  const lengthNm = optionalNumber(value.lengthNm, `${path}.lengthNm`);
  const beamHalfWidthDeg = optionalNumber(value.beamHalfWidthDeg, `${path}.beamHalfWidthDeg`);
  const gsAngleDeg = optionalNumber(value.gsAngleDeg, `${path}.gsAngleDeg`);
  const tchFt = optionalNumber(value.tchFt, `${path}.tchFt`);
  const fafDistanceNm = optionalNumber(value.fafDistanceNm, `${path}.fafDistanceNm`);
  const gsInterceptAltFt = optionalNumber(value.gsInterceptAltFt, `${path}.gsInterceptAltFt`);
  const daFt = optionalNumber(value.daFt, `${path}.daFt`);
  if (courseDeg !== undefined) {
    approach.courseDeg = courseDeg;
    approach.publishedCourseMagneticDeg =
      courseDeg as ApproachProcedure["publishedCourseMagneticDeg"];
  }
  if (lengthNm !== undefined) {
    approach.lengthNm = lengthNm;
  }
  if (beamHalfWidthDeg !== undefined) {
    approach.beamHalfWidthDeg = beamHalfWidthDeg;
  }
  if (gsAngleDeg !== undefined) {
    approach.gsAngleDeg = gsAngleDeg;
  }
  if (tchFt !== undefined) {
    approach.tchFt = tchFt;
  }
  if (fafDistanceNm !== undefined) {
    approach.fafDistanceNm = fafDistanceNm;
  }
  if (gsInterceptAltFt !== undefined) {
    approach.gsInterceptAltFt = gsInterceptAltFt;
  }
  if (daFt !== undefined) {
    approach.daFt = daFt;
  }
  if (value.missed !== undefined) {
    approach.missed = parseMissed(value.missed, `${path}.missed`);
  }
  return approach;
}

/** Schema defaults when JSON omits minima. Live pairing must read the parsed fields. */
const DEFAULT_BASIC_SEPARATION_NM = 3;
const DEFAULT_REDUCED_SEPARATION_NM = 2.5;
const DEFAULT_REDUCED_WITHIN_NM = 10;

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Catalog ${path} must be a boolean`);
  }
  return value;
}

const CWT_WAKE_CATEGORIES = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);

export function parseAtpaWakeAdaptation(
  value: unknown,
  path: string,
  prefix = "Catalog",
): AtpaWakeAdaptation {
  if (!isRecord(value)) {
    throw new Error(`${prefix} ${path} must be an object`);
  }
  const matrixValue = value.matrix;
  if (!isRecord(matrixValue)) {
    throw new Error(`${prefix} ${path}.matrix must be an object`);
  }
  const matrix: Record<string, Record<string, number>> = {};
  for (const [leader, rowValue] of Object.entries(matrixValue)) {
    if (!CWT_WAKE_CATEGORIES.has(leader)) {
      throw new Error(`${prefix} ${path}.matrix has invalid leader category ${leader}`);
    }
    if (!isRecord(rowValue)) {
      throw new Error(`${prefix} ${path}.matrix.${leader} must be an object`);
    }
    const row: Record<string, number> = {};
    for (const [follower, minimum] of Object.entries(rowValue)) {
      if (!CWT_WAKE_CATEGORIES.has(follower)) {
        throw new Error(
          `${prefix} ${path}.matrix.${leader} has invalid follower category ${follower}`,
        );
      }
      const separationNm = assertNumber(minimum, `${path}.matrix.${leader}.${follower}`);
      if (separationNm <= 0) {
        throw new Error(`${prefix} ${path}.matrix.${leader}.${follower} must be positive`);
      }
      row[follower] = separationNm;
    }
    matrix[leader] = row;
  }
  const nowgtSeparationNm = assertNumber(value.nowgtSeparationNm, `${path}.nowgtSeparationNm`);
  if (nowgtSeparationNm <= 0) {
    throw new Error(`${prefix} ${path}.nowgtSeparationNm must be positive`);
  }
  return {
    enabled: assertBoolean(value.enabled, `${path}.enabled`),
    nowgtSeparationNm,
    matrix: matrix as AtpaWakeMatrix,
  };
}

function parseAtpaVolume(value: unknown, index: number): AtpaVolume {
  const path = `atpaVolumes[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const lengthNm = assertNumber(value.lengthNm, `${path}.lengthNm`);
  if (lengthNm <= 0) {
    throw new Error(`Catalog ${path}.lengthNm must be positive`);
  }
  const halfWidthNm = assertNumber(value.halfWidthNm, `${path}.halfWidthNm`);
  if (halfWidthNm <= 0) {
    throw new Error(`Catalog ${path}.halfWidthNm must be positive`);
  }
  const basicSeparationNm =
    value.basicSeparationNm === undefined
      ? DEFAULT_BASIC_SEPARATION_NM
      : assertNumber(value.basicSeparationNm, `${path}.basicSeparationNm`);
  const reducedSeparationNm =
    value.reducedSeparationNm === undefined
      ? DEFAULT_REDUCED_SEPARATION_NM
      : assertNumber(value.reducedSeparationNm, `${path}.reducedSeparationNm`);
  if (reducedSeparationNm > basicSeparationNm) {
    throw new Error(
      `Catalog ${path}.reducedSeparationNm must be <= basicSeparationNm (${basicSeparationNm})`,
    );
  }
  const reducedWithinNm =
    value.reducedWithinNm === undefined
      ? DEFAULT_REDUCED_WITHIN_NM
      : assertNumber(value.reducedWithinNm, `${path}.reducedWithinNm`);
  const note = optionalString(value.note, `${path}.note`);
  const wakeAdaptation =
    value.wakeAdaptation === undefined
      ? undefined
      : parseAtpaWakeAdaptation(value.wakeAdaptation, `${path}.wakeAdaptation`);
  const volume: AtpaVolume = {
    id: assertId(value.id, `${path}.id`),
    approachId: assertString(value.approachId, `${path}.approachId`).toUpperCase(),
    enabled: assertBoolean(value.enabled, `${path}.enabled`),
    lengthNm,
    halfWidthNm,
    floorFt: assertNumber(value.floorFt, `${path}.floorFt`),
    ceilingFt: assertNumber(value.ceilingFt, `${path}.ceilingFt`),
    courseToleranceDeg: assertNumber(value.courseToleranceDeg, `${path}.courseToleranceDeg`),
    basicSeparationNm,
    reducedSeparationNm,
    reducedWithinNm,
    ...(wakeAdaptation !== undefined ? { wakeAdaptation } : {}),
  };
  if (note !== undefined) {
    volume.note = note;
  }
  return volume;
}

function parseNavaid(value: unknown, path: string): Navaid {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const kind = assertString(value.kind, `${path}.kind`);
  if (!NAVAID_KINDS.has(kind as NavaidKind)) {
    throw new Error(`Catalog ${path}.kind is unknown: ${kind}`);
  }
  const navaid: Navaid = {
    id: assertId(value.id, `${path}.id`),
    kind: kind as NavaidKind,
    xNm: assertNumber(value.xNm, `${path}.xNm`),
    yNm: assertNumber(value.yNm, `${path}.yNm`),
    ...optionalLatLon(value, path),
  };
  const name = optionalString(value.name, `${path}.name`);
  if (name !== undefined) {
    navaid.name = name;
  }
  const freqMhz = optionalNumber(value.freqMhz, `${path}.freqMhz`);
  const freqKhz = optionalNumber(value.freqKhz, `${path}.freqKhz`);
  if (freqMhz !== undefined) {
    navaid.freqMhz = freqMhz;
  }
  if (freqKhz !== undefined) {
    navaid.freqKhz = freqKhz;
  }
  if (value.class !== undefined) {
    const navaidClass = assertString(value.class, `${path}.class`);
    if (!NAVAID_CLASSES.has(navaidClass)) {
      throw new Error(`Catalog ${path}.class must be T, L, or H`);
    }
    navaid.class = navaidClass as "T" | "L" | "H";
  }
  const courseDeg = optionalNumber(value.courseDeg, `${path}.courseDeg`);
  const lengthNm = optionalNumber(value.lengthNm, `${path}.lengthNm`);
  const beamHalfWidthDeg = optionalNumber(value.beamHalfWidthDeg, `${path}.beamHalfWidthDeg`);
  const gsAngleDeg = optionalNumber(value.gsAngleDeg, `${path}.gsAngleDeg`);
  const tchFt = optionalNumber(value.tchFt, `${path}.tchFt`);
  const pairedWith = optionalString(value.pairedWith, `${path}.pairedWith`);
  const note = optionalString(value.note, `${path}.note`);
  if (courseDeg !== undefined) {
    navaid.courseDeg = courseDeg;
  }
  if (lengthNm !== undefined) {
    navaid.lengthNm = lengthNm;
  }
  if (beamHalfWidthDeg !== undefined) {
    navaid.beamHalfWidthDeg = beamHalfWidthDeg;
  }
  if (gsAngleDeg !== undefined) {
    navaid.gsAngleDeg = gsAngleDeg;
  }
  if (tchFt !== undefined) {
    navaid.tchFt = tchFt;
  }
  if (pairedWith !== undefined) {
    navaid.pairedWith = pairedWith.toUpperCase();
  }
  if (note !== undefined) {
    navaid.note = note;
  }
  return navaid;
}

function parseFix(value: unknown, path: string): NavFix {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const kind = assertString(value.kind, `${path}.kind`);
  if (!FIX_KINDS.has(kind as NavFixKind)) {
    throw new Error(`Catalog ${path}.kind is unknown: ${kind}`);
  }
  const fix: NavFix = {
    id: assertId(value.id, `${path}.id`),
    kind: kind as NavFixKind,
    xNm: assertNumber(value.xNm, `${path}.xNm`),
    yNm: assertNumber(value.yNm, `${path}.yNm`),
    ...optionalLatLon(value, path),
  };
  const formedBy = optionalString(value.formedBy, `${path}.formedBy`);
  const note = optionalString(value.note, `${path}.note`);
  if (formedBy !== undefined) {
    fix.formedBy = formedBy;
  }
  if (note !== undefined) {
    fix.note = note;
  }
  return fix;
}

function assertAirportId(value: unknown, path: string, expected: string): void {
  const airportId = assertString(value, path);
  if (airportId !== expected) {
    throw new Error(`Catalog ${path} ${airportId} does not match catalog.airportId ${expected}`);
  }
}

function collectResolveIds(navaids: Navaid[], fixes: NavFix[]): Set<string> {
  const ids = new Set<string>();
  const add = (id: string, path: string): void => {
    if (ids.has(id)) {
      throw new Error(`Catalog duplicate id ${id} (${path})`);
    }
    ids.add(id);
  };
  for (const navaid of navaids) {
    add(navaid.id, `navaid ${navaid.kind}`);
  }
  for (const fix of fixes) {
    add(fix.id, "fix");
  }
  return ids;
}

function requireRef(ids: Set<string>, id: string | undefined, path: string): void {
  if (id === undefined) {
    return;
  }
  if (!ids.has(id)) {
    throw new Error(`Catalog ${path} references unknown id ${id}`);
  }
}

function validateRefs(catalog: ProcedureCatalog, ids: Set<string>): void {
  for (const navaid of catalog.navaids) {
    requireRef(ids, navaid.pairedWith, `navaid ${navaid.id}.pairedWith`);
  }
  for (const star of catalog.stars) {
    for (const transition of star.transitions) {
      for (const [i, leg] of transition.legs.entries()) {
        requireRef(ids, leg.fixId, `STAR ${star.id} transition ${transition.id} legs[${i}].fixId`);
      }
    }
    for (const [i, leg] of star.common.entries()) {
      requireRef(ids, leg.fixId, `STAR ${star.id} common[${i}].fixId`);
    }
  }
  for (const sid of catalog.sids) {
    if (sid.runwayTransitions) {
      for (const rt of sid.runwayTransitions) {
        for (const [i, leg] of rt.legs.entries()) {
          requireRef(
            ids,
            leg.fixId,
            `SID ${sid.id} runwayTransition ${rt.runwayId} legs[${i}].fixId`,
          );
        }
      }
    }
    for (const [i, leg] of sid.common.entries()) {
      requireRef(ids, leg.fixId, `SID ${sid.id} common[${i}].fixId`);
    }
    if (sid.enrouteTransitions) {
      for (const et of sid.enrouteTransitions) {
        if (et.legs) {
          for (const [i, leg] of et.legs.entries()) {
            requireRef(ids, leg.fixId, `SID ${sid.id} enrouteTransition ${et.id} legs[${i}].fixId`);
          }
        }
        if (et.runwayTransitions) {
          for (const rt of et.runwayTransitions) {
            for (const [i, leg] of rt.legs.entries()) {
              requireRef(
                ids,
                leg.fixId,
                `SID ${sid.id} enrouteTransition ${et.id} runwayTransition ${rt.runwayId} legs[${i}].fixId`,
              );
            }
          }
        }
      }
    }
  }
  for (const approach of catalog.approaches) {
    requireRef(ids, approach.locNavaidId, `approach ${approach.id}.locNavaidId`);
    requireRef(ids, approach.gsNavaidId, `approach ${approach.id}.gsNavaidId`);
    requireRef(ids, approach.fafFixId, `approach ${approach.id}.fafFixId`);
    requireRef(ids, approach.thresholdFixId, `approach ${approach.id}.thresholdFixId`);
    requireRef(ids, approach.missed?.directFixId, `approach ${approach.id}.missed.directFixId`);
  }
  const approachIds = new Set(catalog.approaches.map((approach) => approach.id));
  const volumeIds = new Set<string>();
  for (const volume of catalog.atpaVolumes) {
    if (volumeIds.has(volume.id)) {
      throw new Error(`Catalog duplicate id ${volume.id} (atpaVolume)`);
    }
    volumeIds.add(volume.id);
    if (!approachIds.has(volume.approachId)) {
      throw new Error(
        `Catalog atpaVolume ${volume.id}.approachId references unknown id ${volume.approachId}`,
      );
    }
  }
}

/**
 * Assemble a catalog from already-read JSON objects. Used by `loadCatalog`
 * and by tests that mutate a copy to prove schema failures.
 */
export function parseCatalogFiles(files: CatalogFileSet): ProcedureCatalog {
  if (!isRecord(files.catalog)) {
    throw new Error("Catalog catalog.json must be an object");
  }
  const schemaVersion = assertNumber(files.catalog.schemaVersion, "schemaVersion");
  if (schemaVersion !== 1) {
    throw new Error("Catalog schemaVersion must be 1");
  }
  const airportId = assertString(files.catalog.airportId, "airportId").trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(airportId)) {
    throw new Error(`Catalog airportId must be a four-letter ICAO code (got ${airportId})`);
  }
  const fileMap = files.catalog.files;
  if (!isRecord(fileMap)) {
    throw new Error("Catalog files must be an object");
  }
  for (const key of REQUIRED_FILES) {
    if (typeof fileMap[key] !== "string" || fileMap[key].length === 0) {
      throw new Error(`Catalog files.${key} must be a non-empty string`);
    }
  }

  if (!isRecord(files.vors)) {
    throw new Error("Catalog vors.json must be an object");
  }
  if (!isRecord(files.ndbs)) {
    throw new Error("Catalog ndbs.json must be an object");
  }
  if (!isRecord(files.ils)) {
    throw new Error("Catalog ils.json must be an object");
  }
  if (!isRecord(files.fixes)) {
    throw new Error("Catalog fixes.json must be an object");
  }
  if (!isRecord(files.procedures)) {
    throw new Error("Catalog procedures.json must be an object");
  }
  if (!isRecord(files.sids)) {
    throw new Error("Catalog sids.json must be an object");
  }

  assertAirportId(files.vors.airportId, "vors.airportId", airportId);
  assertAirportId(files.ndbs.airportId, "ndbs.airportId", airportId);
  assertAirportId(files.ils.airportId, "ils.airportId", airportId);
  assertAirportId(files.fixes.airportId, "fixes.airportId", airportId);
  assertAirportId(files.procedures.airportId, "procedures.airportId", airportId);
  assertAirportId(files.sids.airportId, "sids.airportId", airportId);

  const vors = assertArray(files.vors.vors, "vors").map((item, i) =>
    parseNavaid(item, `vors[${i}]`),
  );
  const ndbs = assertArray(files.ndbs.ndbs, "ndbs").map((item, i) =>
    parseNavaid(item, `ndbs[${i}]`),
  );
  const ilsComponents = assertArray(files.ils.components, "ils.components").map((item, i) =>
    parseNavaid(item, `ils.components[${i}]`),
  );
  const navaids = [...vors, ...ndbs, ...ilsComponents];
  const fixes = assertArray(files.fixes.fixes, "fixes").map((item, i) =>
    parseFix(item, `fixes[${i}]`),
  );
  const stars = assertArray(files.procedures.stars, "stars").map(parseStar);
  const approaches = assertArray(files.procedures.approaches, "approaches").map(parseApproach);
  const sids = assertArray(files.sids.sids, "sids").map(parseSid);

  let atpaVolumes: AtpaVolume[] = [];
  if (fileMap.atpaVolumes !== undefined) {
    if (typeof fileMap.atpaVolumes !== "string" || fileMap.atpaVolumes.length === 0) {
      throw new Error("Catalog files.atpaVolumes must be a non-empty string");
    }
    if (files.atpaVolumes === undefined) {
      throw new Error(`Missing catalog file ${fileMap.atpaVolumes}`);
    }
    if (!isRecord(files.atpaVolumes)) {
      throw new Error("Catalog atpa-volumes.json must be an object");
    }
    assertAirportId(files.atpaVolumes.airportId, "atpaVolumes.airportId", airportId);
    atpaVolumes = assertArray(files.atpaVolumes.atpaVolumes, "atpaVolumes").map(parseAtpaVolume);
  }

  const originNote = optionalString(files.catalog.originNote, "originNote");
  const name = assertString(files.catalog.name, "name").trim();
  if (name.length < 2) {
    throw new Error("Catalog name must be at least 2 characters");
  }
  const spokenAliases = assertArray(files.catalog.spokenAliases, "spokenAliases").map((item, i) => {
    const alias = assertString(item, `spokenAliases[${i}]`).trim();
    if (alias.length < 2) {
      throw new Error(`Catalog spokenAliases[${i}] must be at least 2 characters`);
    }
    return alias;
  });
  if (spokenAliases.length === 0) {
    throw new Error("Catalog spokenAliases must contain at least one alias");
  }
  const fmaOverrides = parseFmaAdaptation(files.catalog.fmaOverrides);
  const catalog: ProcedureCatalog = {
    schemaVersion: 1,
    airportId,
    name,
    spokenAliases,
    magVarDeg: assertNumber(files.catalog.magVarDeg, "magVarDeg"),
    fieldElevFt: assertNumber(files.catalog.fieldElevFt, "fieldElevFt"),
    arp: assertLatLon(files.catalog.arp, "arp"),
    ...(originNote !== undefined ? { originNote } : {}),
    navaids,
    fixes,
    stars,
    approaches,
    sids,
    atpaVolumes,
    ...(fmaOverrides ? { fmaOverrides } : {}),
  };
  const ids = collectResolveIds(navaids, fixes);
  if (ids.has(airportId)) {
    throw new Error(`Catalog airportId ${airportId} must not also be a fix or navaid`);
  }
  validateRefs(catalog, ids);
  validateFmaReferences(catalog);
  return catalog;
}

function validateFmaReferences(catalog: ProcedureCatalog): void {
  const adaptation = catalog.fmaOverrides;
  if (adaptation?.source !== "TRAINER_AUTHORED") return;
  const approaches = new Map(catalog.approaches.map((approach) => [approach.id, approach]));
  for (const [i, group] of (adaptation.groups ?? []).entries()) {
    const path = `fmaOverrides.groups[${i}]`;
    const selected = group.approachIds?.length
      ? group.approachIds.map((id) => approaches.get(id))
      : (group.runwayIds ?? []).map((runwayId) =>
          catalog.approaches.find((approach) => approach.runway.toUpperCase() === runwayId),
        );
    if (selected.length < 2 || selected.length > 4)
      throw new Error(`Catalog ${path} must reference 2–4 runway approaches`);
    if (
      selected.length < 2 ||
      selected.some(
        (approach) =>
          !approach?.thresholdFixId ||
          approach.publishedCourseMagneticDeg === undefined ||
          !catalog.fixes.some((fix) => fix.id === approach.thresholdFixId),
      )
    )
      throw new Error(`Catalog ${path} has unresolved approach/runway references`);
    const runwayIds = selected.map((approach) => approach!.runway.toUpperCase());
    if (
      group.approachIds?.length &&
      group.runwayIds?.length &&
      (new Set(group.runwayIds.map((id) => id.toUpperCase())).size !== runwayIds.length ||
        runwayIds.some((id) => !group.runwayIds!.some((runwayId) => runwayId.toUpperCase() === id)))
    )
      throw new Error(`Catalog ${path}.runwayIds must match its approachIds runway set`);
    if (new Set(runwayIds).size !== runwayIds.length)
      throw new Error(`Catalog ${path} references a runway more than once`);
    const geometry = group.geometry!;
    if (!isSimpleFmaPolygon(geometry.amzBoundary))
      throw new Error(
        `Catalog ${path}.geometry.amzBoundary must be finite, simple and nondegenerate`,
      );
    for (const [j, runway] of geometry.runways.entries())
      if (!isSimpleFmaPolygon(runway.noz))
        throw new Error(
          `Catalog ${path}.geometry.runways[${j}].noz must be finite, simple and nondegenerate`,
        );
    for (const [j, ntz] of geometry.ntzs.entries())
      if (!isSimpleFmaPolygon(ntz.polygon))
        throw new Error(
          `Catalog ${path}.geometry.ntzs[${j}].polygon must be finite, simple and nondegenerate`,
        );
    const geometryRunways = geometry.runways.map((runway) => runway.runwayId.toUpperCase());
    if (
      geometryRunways.length !== runwayIds.length ||
      new Set(geometryRunways).size !== geometryRunways.length ||
      runwayIds.some((id) => !geometryRunways.includes(id))
    )
      throw new Error(`Catalog ${path}.geometry.runways must match referenced runways`);
    if (geometry.ntzs.length !== runwayIds.length - 1)
      throw new Error(`Catalog ${path}.geometry.ntzs must define each adjacent runway pair`);
    const runwayAxis = selected
      .map((approach) => {
        const fix = catalog.fixes.find((candidate) => candidate.id === approach!.thresholdFixId)!;
        const course =
          magneticToTrueDeg(approach!.publishedCourseMagneticDeg!, catalog.magVarDeg) *
          (Math.PI / 180);
        return {
          id: approach!.runway.toUpperCase(),
          cross: fix.xNm * Math.cos(course) - fix.yNm * Math.sin(course),
        };
      })
      .sort((a, b) => a.cross - b.cross || a.id.localeCompare(b.id));
    const expectedPairs = new Set(
      runwayAxis.slice(0, -1).map((row, j) => `${row.id}/${runwayAxis[j + 1]!.id}`),
    );
    const actualPairs = new Set<string>();
    const ntzIds = new Set<string>();
    for (const [j, ntz] of geometry.ntzs.entries()) {
      if (ntzIds.has(ntz.id))
        throw new Error(`Catalog ${path}.geometry.ntzs[${j}].id duplicates ${ntz.id}`);
      ntzIds.add(ntz.id);
      const left = ntz.leftRunwayId.toUpperCase(),
        right = ntz.rightRunwayId.toUpperCase();
      if (left === right || !expectedPairs.has(`${left}/${right}`))
        throw new Error(
          `Catalog ${path}.geometry.ntzs[${j}] must reference an adjacent runway pair in lateral order (${left}/${right}; expected ${[...expectedPairs].join(", ")})`,
        );
      const key = `${left}/${right}`;
      if (actualPairs.has(key))
        throw new Error(`Catalog ${path}.geometry.ntzs[${j}] duplicates an adjacent pair`);
      actualPairs.add(key);
      if (ntz.polygon.some((point) => !containsInPolygon(point, geometry.amzBoundary)))
        throw new Error(`Catalog ${path}.geometry.ntzs[${j}].polygon extends outside AMZ boundary`);
    }
    if (actualPairs.size !== expectedPairs.size)
      throw new Error(`Catalog ${path}.geometry.ntzs must define every adjacent runway pair`);
    for (const [j, runway] of geometry.runways.entries())
      if (runway.noz.some((point) => !containsInPolygon(point, geometry.amzBoundary)))
        throw new Error(`Catalog ${path}.geometry.runways[${j}].noz extends outside AMZ boundary`);
    const checkGraphicalRunways = (
      items: Array<{ runwayId: string }> | undefined,
      name: string,
    ) => {
      for (const [j, item] of (items ?? []).entries())
        if (!runwayIds.includes(item.runwayId.toUpperCase()))
          throw new Error(
            `Catalog ${path}.geometry.${name}[${j}].runwayId is not a referenced runway`,
          );
    };
    checkGraphicalRunways(geometry.courseLines, "courseLines");
    checkGraphicalRunways(geometry.fixBars, "fixBars");
    if (
      geometry.courseLines &&
      (geometry.courseLines.length !== runwayIds.length ||
        new Set(geometry.courseLines.map((line) => line.runwayId.toUpperCase())).size !==
          geometry.courseLines.length)
    )
      throw new Error(`Catalog ${path}.geometry.courseLines must include every referenced runway`);
    for (const [j, bar] of (geometry.fixBars ?? []).entries())
      if (!catalog.fixes.some((fix) => fix.id === bar.fixId))
        throw new Error(`Catalog ${path}.geometry.fixBars[${j}].fixId is unresolved`);
  }
}

/** Last path segment, so `kdem` and `src/scenario/data/kdem` both work. */
export function catalogDirName(dir: string): string {
  const trimmed = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = trimmed.split("/").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  if (last === undefined || last === "." || last === "..") {
    throw new Error(`Catalog directory is empty: ${JSON.stringify(dir)}`);
  }
  return last;
}

function readDataJson(dir: string, file: string): unknown {
  const path = `../data/${dir}/${file}`;
  if (!(path in DATA_JSON)) {
    throw new Error(`Missing catalog file ${path}`);
  }
  return DATA_JSON[path];
}

/**
 * Load `catalog.json` plus every file it lists from `src/scenario/data/<dir>/`.
 * Duplicate ids and dangling procedure refs throw; nothing partial is returned.
 */
export function loadCatalog(dir: string): ProcedureCatalog {
  const folder = catalogDirName(dir);
  const catalogJson = readDataJson(folder, "catalog.json");
  if (!isRecord(catalogJson) || !isRecord(catalogJson.files)) {
    throw new Error(`Catalog ${folder}/catalog.json must list files`);
  }
  const files = catalogJson.files;
  const readListed = (key: (typeof REQUIRED_FILES)[number]): unknown => {
    const name = files[key];
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`Catalog files.${key} must be a non-empty string`);
    }
    return readDataJson(folder, name);
  };
  const atpaVolumesName = files.atpaVolumes;
  const atpaVolumes =
    typeof atpaVolumesName === "string" && atpaVolumesName.length > 0
      ? readDataJson(folder, atpaVolumesName)
      : undefined;
  return parseCatalogFiles({
    catalog: catalogJson,
    vors: readListed("vors"),
    ndbs: readListed("ndbs"),
    ils: readListed("ils"),
    fixes: readListed("fixes"),
    procedures: readListed("procedures"),
    sids: readListed("sids"),
    ...(atpaVolumes !== undefined ? { atpaVolumes } : {}),
  });
}

export { findSidProcedure, sidRouteFixIds } from "./sidHelpers";
