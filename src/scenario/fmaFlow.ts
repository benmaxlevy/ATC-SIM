import { deriveFmaAmzs, FMA_PARALLEL_COURSE_TOLERANCE_DEG } from "../core/alerts/fmaGeometry";
import { magneticToTrueDeg } from "../core/nav/headingFrames";
import type { FmaAmz } from "../core/alerts/fmaGeometry";
import type { ProcedureCatalog } from "./procedures/types";

const angleDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

export interface FmaFlowResolution {
  amzs: FmaAmz[];
  selectedAmzId: string | null;
  diagnostics: string[];
}

/**
 * Resolve AMZ display context from the scenario's active runway. Geometry is
 * derived first so catalog adaptation remains intact; only the display choices
 * are flow-filtered. Flow filtering is an approved trainer policy, not a
 * published STARS AMZ selection algorithm.
 */
export function resolveFmaFlow(
  catalog: ProcedureCatalog,
  activeRunwayId: string,
  options: {
    initialAmzId?: string;
    preferredAmzId?: string | null;
    excludeDerived?: boolean;
  } = {},
): FmaFlowResolution {
  const derived = deriveFmaAmzs(catalog, { excludeDerived: options.excludeDerived });
  const diagnostics = derived.diagnostics.map((item) => `${item.path}: ${item.message}`);
  const runway = activeRunwayId.trim().toUpperCase();
  const courseForApproach = new Map(
    catalog.approaches.flatMap((approach) =>
      approach.publishedCourseMagneticDeg === undefined
        ? []
        : [
            [
              approach.id,
              magneticToTrueDeg(approach.publishedCourseMagneticDeg, catalog.magVarDeg),
            ] as const,
          ],
    ),
  );
  const runwayCourses = [
    ...new Map(
      catalog.approaches
        .filter((approach) => approach.runway.trim().toUpperCase() === runway)
        .flatMap((approach) => {
          const course = courseForApproach.get(approach.id);
          return course === undefined ? [] : [[approach.id, course] as const];
        }),
    ),
  ].map(([approachId, course]) => ({ approachId, course }));
  const runwayCoursesAmbiguous = runwayCourses.some(({ course }, index) =>
    runwayCourses
      .slice(index + 1)
      .some(
        ({ course: other }) => angleDistance(course, other) > FMA_PARALLEL_COURSE_TOLERANCE_DEG,
      ),
  );

  const adaptationForSelection = [options.initialAmzId, options.preferredAmzId]
    .filter((id): id is string => Boolean(id))
    .map((id) => derived.amzs.find((amz) => amz.id === id && amz.provenance === "CATALOG_ADAPTED"))
    .find((amz) => amz?.members.some((member) => member.runwayId.trim().toUpperCase() === runway));
  const selectedActiveMember = adaptationForSelection?.members.find(
    (member) => member.runwayId.trim().toUpperCase() === runway,
  );
  const selectedActiveCourse =
    runwayCoursesAmbiguous && selectedActiveMember
      ? courseForApproach.get(selectedActiveMember.approachId)
      : undefined;

  if (runwayCourses.length === 0) {
    diagnostics.push(`active runway ${activeRunwayId} has no inbound approach course`);
    return { amzs: [], selectedAmzId: null, diagnostics };
  }
  const ambiguous = runwayCoursesAmbiguous && selectedActiveCourse === undefined;
  if (ambiguous) {
    diagnostics.push(`active runway ${activeRunwayId} has ambiguous inbound approach courses`);
    return { amzs: [], selectedAmzId: null, diagnostics };
  }
  const referenceCourses =
    selectedActiveCourse === undefined
      ? runwayCourses.map(({ course }) => course)
      : [selectedActiveCourse];
  const meanSin = referenceCourses.reduce(
    (sum, course) => sum + Math.sin((course * Math.PI) / 180),
    0,
  );
  const meanCos = referenceCourses.reduce(
    (sum, course) => sum + Math.cos((course * Math.PI) / 180),
    0,
  );
  const referenceCourse = ((Math.atan2(meanSin, meanCos) * 180) / Math.PI + 360) % 360;

  const eligible = derived.amzs
    .filter((amz) => {
      if (amz.provenance !== "CATALOG_ADAPTED")
        return (
          angleDistance(amz.courseTrueDeg, referenceCourse) <= FMA_PARALLEL_COURSE_TOLERANCE_DEG
        );
      const memberCourses = amz.members.flatMap((member) => {
        const course = courseForApproach.get(member.approachId);
        return course === undefined ? [] : [course];
      });
      const hasSameFlowSource = memberCourses.some(
        (course) => angleDistance(course, referenceCourse) <= FMA_PARALLEL_COURSE_TOLERANCE_DEG,
      );
      const hasReciprocalSource = memberCourses.some(
        (course) =>
          angleDistance(course, (referenceCourse + 180) % 360) <= FMA_PARALLEL_COURSE_TOLERANCE_DEG,
      );
      return hasSameFlowSource && !hasReciprocalSource;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (eligible.length === 0) {
    diagnostics.push(`no AMZ geometry matches active runway ${activeRunwayId} inbound course`);
    return { amzs: [], selectedAmzId: null, diagnostics };
  }

  const initial = options.initialAmzId;
  const preferred = options.preferredAmzId;
  const initialMatch = initial ? eligible.find((amz) => amz.id === initial) : undefined;
  const preferredMatch = preferred ? eligible.find((amz) => amz.id === preferred) : undefined;
  if (initial && !initialMatch)
    diagnostics.push(`scenario initial AMZ ${initial} is stale or opposite-flow`);
  const containsActiveRunway = eligible.find((amz) =>
    amz.members.some((member) => member.runwayId.trim().toUpperCase() === runway),
  );
  const selected = initialMatch ?? preferredMatch ?? containsActiveRunway ?? eligible[0]!;
  return { amzs: eligible, selectedAmzId: selected.id, diagnostics };
}
