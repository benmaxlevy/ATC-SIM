/**
 * Final Monitor Aid (FMA) lateral display projection.
 *
 * TI 6191.409 Section 6.16.3 p. 6-131 (PDF 661):
 * Magnification ratio 1–8 expands cross-track spacing about the common runway axis
 * while keeping camera center stationary. When MAG=1 or FMA is disabled, the projection
 * is identity apart from normal camera mapping.
 *
 * Coordinates and formulas:
 * Let p = worldPoint - cameraCenter
 * u = dot(p, along)
 * v = dot(p, cross)
 * Forward maps u unchanged and v * MAG.
 * Inverse divides cross component by MAG.
 * Common basis comes from selected AMZ true course.
 */

import { nmToScreen, pxPerNm, screenToNm, type ScopeCamera, type ScopeViewSize } from "./camera";

export interface ScopeProjectionOptions {
  enabled?: boolean;
  mag?: number;
  courseTrueDeg?: number;
}

export interface ScopeProjection {
  readonly enabled: boolean;
  readonly mag: number;
  readonly courseTrueDeg: number;
  readonly isMagnified: boolean;

  /** Convert true world NM coordinate to rendered screen CSS pixels. */
  toScreen(eastNm: number, northNm: number): { x: number; y: number };

  /** Convert rendered screen CSS pixels to true world NM coordinate. */
  toWorld(x: number, y: number): { eastNm: number; northNm: number };

  /** Project true world NM coordinate into magnified display NM coordinate. */
  projectWorld(eastNm: number, northNm: number): { eastNm: number; northNm: number };

  /** Unproject magnified display NM coordinate back to true world NM coordinate. */
  unprojectWorld(eastNm: number, northNm: number): { eastNm: number; northNm: number };
}

/** Pure forward geographic projection from world coordinate to magnified coordinate about camera center. */
export function projectWorldPoint(
  eastNm: number,
  northNm: number,
  cameraCenterEastNm: number,
  cameraCenterNorthNm: number,
  mag: number,
  courseTrueDeg: number,
): { eastNm: number; northNm: number } {
  if (mag <= 1 || !Number.isFinite(mag) || !Number.isFinite(courseTrueDeg)) {
    return { eastNm, northNm };
  }
  const courseRad = (courseTrueDeg * Math.PI) / 180;
  const alongEast = Math.sin(courseRad);
  const alongNorth = Math.cos(courseRad);
  const crossEast = Math.cos(courseRad);
  const crossNorth = -Math.sin(courseRad);

  const pEast = eastNm - cameraCenterEastNm;
  const pNorth = northNm - cameraCenterNorthNm;

  const u = pEast * alongEast + pNorth * alongNorth;
  const v = pEast * crossEast + pNorth * crossNorth;

  const uProj = u;
  const vProj = v * mag;

  return {
    eastNm: cameraCenterEastNm + uProj * alongEast + vProj * crossEast,
    northNm: cameraCenterNorthNm + uProj * alongNorth + vProj * crossNorth,
  };
}

/** Pure inverse geographic unprojection from magnified coordinate back to true world coordinate. */
export function unprojectWorldPoint(
  projEastNm: number,
  projNorthNm: number,
  cameraCenterEastNm: number,
  cameraCenterNorthNm: number,
  mag: number,
  courseTrueDeg: number,
): { eastNm: number; northNm: number } {
  if (mag <= 1 || !Number.isFinite(mag) || !Number.isFinite(courseTrueDeg)) {
    return { eastNm: projEastNm, northNm: projNorthNm };
  }
  const courseRad = (courseTrueDeg * Math.PI) / 180;
  const alongEast = Math.sin(courseRad);
  const alongNorth = Math.cos(courseRad);
  const crossEast = Math.cos(courseRad);
  const crossNorth = -Math.sin(courseRad);

  const pEast = projEastNm - cameraCenterEastNm;
  const pNorth = projNorthNm - cameraCenterNorthNm;

  const uProj = pEast * alongEast + pNorth * alongNorth;
  const vProj = pEast * crossEast + pNorth * crossNorth;

  const u = uProj;
  const v = vProj / mag;

  return {
    eastNm: cameraCenterEastNm + u * alongEast + v * crossEast,
    northNm: cameraCenterNorthNm + u * alongNorth + v * crossNorth,
  };
}

/** Create a ScopeProjection instance binding camera, view size, and optional FMA parameters. */
export function createScopeProjection(
  camera: ScopeCamera,
  viewSize: ScopeViewSize,
  options?: ScopeProjectionOptions,
): ScopeProjection {
  const enabled = Boolean(options?.enabled);
  const rawMag = options?.mag ?? 1;
  const mag = Math.max(1, Math.min(8, Number.isFinite(rawMag) ? rawMag : 1));
  const courseTrueDeg = options?.courseTrueDeg ?? 0;
  const isMagnified = enabled && mag > 1 && Number.isFinite(courseTrueDeg);

  return {
    enabled,
    mag,
    courseTrueDeg,
    isMagnified,

    toScreen(eastNm: number, northNm: number): { x: number; y: number } {
      if (!isMagnified) {
        return nmToScreen(eastNm, northNm, camera, viewSize);
      }
      const proj = projectWorldPoint(
        eastNm,
        northNm,
        camera.centerEastNm,
        camera.centerNorthNm,
        mag,
        courseTrueDeg,
      );
      return nmToScreen(proj.eastNm, proj.northNm, camera, viewSize);
    },

    toWorld(x: number, y: number): { eastNm: number; northNm: number } {
      const screenNm = screenToNm(x, y, camera, viewSize);
      if (!isMagnified) {
        return screenNm;
      }
      return unprojectWorldPoint(
        screenNm.eastNm,
        screenNm.northNm,
        camera.centerEastNm,
        camera.centerNorthNm,
        mag,
        courseTrueDeg,
      );
    },

    projectWorld(eastNm: number, northNm: number): { eastNm: number; northNm: number } {
      if (!isMagnified) {
        return { eastNm, northNm };
      }
      return projectWorldPoint(
        eastNm,
        northNm,
        camera.centerEastNm,
        camera.centerNorthNm,
        mag,
        courseTrueDeg,
      );
    },

    unprojectWorld(projEastNm: number, projNorthNm: number): { eastNm: number; northNm: number } {
      if (!isMagnified) {
        return { eastNm: projEastNm, northNm: projNorthNm };
      }
      return unprojectWorldPoint(
        projEastNm,
        projNorthNm,
        camera.centerEastNm,
        camera.centerNorthNm,
        mag,
        courseTrueDeg,
      );
    },
  };
}

/** Convenience helper: resolve projection from ScopeView and ViewSize. */
export function scopeProjectionFromView(
  view: {
    camera: ScopeCamera;
    fmaSurveillance: { enabled: boolean; selectedAmzId: string | null };
    fmaAmzs: Array<{ id: string; courseTrueDeg: number }>;
    fmaMag: number;
  },
  viewSize: ScopeViewSize,
): ScopeProjection {
  const enabled = view.fmaSurveillance.enabled;
  const activeAmz = enabled
    ? view.fmaAmzs.find((amz) => amz.id === view.fmaSurveillance.selectedAmzId)
    : undefined;
  return createScopeProjection(view.camera, viewSize, {
    enabled: Boolean(enabled && activeAmz),
    mag: view.fmaMag,
    courseTrueDeg: activeAmz?.courseTrueDeg ?? 0,
  });
}

/** Convenience standalone forward projection helper. */
export function projectNmToScreen(
  eastNm: number,
  northNm: number,
  camera: ScopeCamera,
  viewSize: ScopeViewSize,
  fma?: ScopeProjectionOptions,
): { x: number; y: number } {
  const proj = createScopeProjection(camera, viewSize, fma);
  return proj.toScreen(eastNm, northNm);
}

/** Convenience standalone inverse projection helper. */
export function screenToProjectedNm(
  x: number,
  y: number,
  camera: ScopeCamera,
  viewSize: ScopeViewSize,
  fma?: ScopeProjectionOptions,
): { eastNm: number; northNm: number } {
  const proj = createScopeProjection(camera, viewSize, fma);
  return proj.toWorld(x, y);
}

/**
 * Apply pan delta in screen coordinates to camera center, respecting magnified cross-track scale.
 * When MAG=1, reduces to the standard camera pan formula.
 */
export function applyProjectedPanDelta(
  target:
    | ScopeCamera
    | {
        camera: ScopeCamera;
        fmaSurveillance: { enabled: boolean; selectedAmzId: string | null };
        fmaAmzs: Array<{ id: string; courseTrueDeg: number }>;
        fmaMag: number;
      },
  dxPx: number,
  dyPx: number,
  viewSize: ScopeViewSize,
  fma?: ScopeProjectionOptions,
): void {
  const isView = "camera" in target && "fmaSurveillance" in target;
  const camera = isView ? target.camera : target;
  const scale = pxPerNm(camera, viewSize);
  if (scale === 0) {
    return;
  }
  const fmaOpts: ScopeProjectionOptions | undefined = isView
    ? {
        enabled: Boolean(
          target.fmaSurveillance.enabled &&
          target.fmaAmzs?.some((a) => a.id === target.fmaSurveillance.selectedAmzId),
        ),
        mag: target.fmaMag,
        courseTrueDeg:
          target.fmaAmzs?.find((a) => a.id === target.fmaSurveillance.selectedAmzId)
            ?.courseTrueDeg ?? 0,
      }
    : fma;

  const proj = createScopeProjection(camera, viewSize, fmaOpts);
  if (!proj.isMagnified) {
    camera.centerEastNm -= dxPx / scale;
    camera.centerNorthNm += dyPx / scale;
    return;
  }
  const cx = viewSize.widthPx / 2;
  const cy = viewSize.heightPx / 2;
  const targetWorld = proj.toWorld(cx - dxPx, cy - dyPx);
  camera.centerEastNm = targetWorld.eastNm;
  camera.centerNorthNm = targetWorld.northNm;
}
