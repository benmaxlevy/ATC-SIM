/** Immutable performance data produced by the build-time profile generator. */

export type PerformanceRegime =
  "initialClimb" | "climb" | "enroute" | "arrival" | "approach" | "missedApproach" | "landing";

export type PerformanceValueOrigin =
  "openap-prop" | "openap-wrap" | "simulator-policy" | "derived" | "mapping" | "unresolved";

export interface PerformanceProvenance {
  readonly kind: PerformanceValueOrigin;
  readonly note?: string;
  readonly reason?: string;
}

export interface PerformanceSource {
  readonly source: string;
  readonly url?: string;
  readonly revisionDate?: string;
  readonly sectionOrPage?: string;
  readonly confidence?: string;
  readonly notes?: string;
}

export interface PerformanceRegimeLimits {
  readonly minSpeedKt: number;
  readonly maxSpeedKt: number;
  readonly nominalClimbFpm: number;
  readonly nominalDescentFpm: number;
  readonly accelKtPerS: number;
  readonly decelKtPerS: number;
  readonly maxBankDeg: number;
  /** Optional legacy equivalent used by DEFAULT_PROFILE until T04-53. */
  readonly turnRateDegPerS?: number;
}

export interface AircraftPerformanceProfile {
  readonly icaoType: string;
  readonly representativeVariant: string;
  readonly representativeEngine: string;
  readonly openapType?: string;
  readonly status: "SUPPORTED" | "UNRESOLVED";
  readonly sources?: readonly PerformanceSource[];
  readonly limits: Readonly<{
    readonly minControlledSpeedKt: number;
    readonly maxControlledSpeedKt: number;
    readonly serviceCeilingFt?: number;
  }> | null;
  readonly regimes: Readonly<Record<PerformanceRegime, PerformanceRegimeLimits>> | null;
  readonly provenance?: Readonly<Record<string, PerformanceProvenance>>;
}

export interface AircraftProfileDataset {
  readonly schemaVersion: number;
  readonly generator: Readonly<Record<string, string>>;
  readonly profiles: readonly AircraftPerformanceProfile[];
}
