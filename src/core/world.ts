/** Minimal world snapshot. `stepWorld` is phase 1; `aircraft` stays empty until then. */
export interface World {
  simTimeMs: number;
  simRate: 1 | 2;
  aircraft: readonly [];
}
