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

export interface AircraftProfileDefaultsLimits {
  readonly minControlledSpeedKt: number;
  readonly maxControlledSpeedKt: number;
  readonly serviceCeilingFt?: number;
}

export interface AircraftProfileDefaultsRegime {
  readonly nominalClimbFpm: number;
  readonly nominalDescentFpm: number;
  readonly maxBankDeg: number;
  readonly accelKtPerS: number;
  readonly decelKtPerS: number;
  readonly minSpeedKt?: number;
  readonly maxSpeedKt?: number;
  readonly turnRateDegPerS?: number;
}

export interface AircraftProfileDefaults {
  readonly limits: AircraftProfileDefaultsLimits;
  readonly regimes: Readonly<Record<PerformanceRegime, AircraftProfileDefaultsRegime>>;
}

export interface AircraftProfileOverride {
  readonly source?: string;
  readonly representativeVariant?: string;
  readonly representativeEngine?: string;
  readonly limits?: Readonly<Partial<AircraftProfileDefaultsLimits>>;
  readonly regimes?: Readonly<Partial<Record<PerformanceRegime, Partial<PerformanceRegimeLimits>>>>;
}

export interface AircraftProfileDataset {
  readonly defaults: AircraftProfileDefaults;
  readonly aircraft: Readonly<Record<string, AircraftProfileOverride>>;
  /**
   * General-aviation catalog, separate from airliner `aircraft` so IFR arrival
   * fleet selection (which walks airline lists, never profile keys) cannot
   * spawn GA types. VFR traffic mixes reference this object only.
   */
  readonly generalAviation?: Readonly<Record<string, AircraftProfileOverride>>;
}
