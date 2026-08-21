import type { SessionEvent } from "./types";

/**
 * Append-only in-memory session event log.
 * No max size in v1; phase 5 may truncate when scoring.
 * Callers pass atSimMs and atWallMs; this class does not read Date.now().
 */
export class SessionLog {
  private readonly events: SessionEvent[] = [];

  append(event: SessionEvent): void {
    this.events.push(event);
  }

  /** Copy of insertion order. Mutating the returned array does not change the log. */
  all(): readonly SessionEvent[] {
    return this.events.slice();
  }

  byType<T extends SessionEvent["type"]>(type: T): Extract<SessionEvent, { type: T }>[] {
    return this.events.filter(
      (event): event is Extract<SessionEvent, { type: T }> => event.type === type,
    );
  }
}
