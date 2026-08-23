import { DEFAULT_SPAWN_SEED, type Scenario } from "@scenario";
import type { AppHandles } from "./create-app";

/** Append session.started. Call after createApp + loadKdem; tests pass a fake wall clock. */
export function bootSession(
  handles: AppHandles,
  scenario: Scenario,
  wallMs: number,
  seed: number = DEFAULT_SPAWN_SEED,
): void {
  handles.log.append({
    type: "session.started",
    atSimMs: 0,
    atWallMs: wallMs,
    scenarioId: scenario.id,
    seed,
  });
}
