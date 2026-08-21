import type { Command } from "../command/types";

/**
 * Append-only session events for phases 0–1.
 * Extra types (speech, spawn) stay out so phase 1 can switch on a stable union.
 */
export type SessionEvent =
  | {
      type: "session.started";
      atSimMs: number;
      atWallMs: number;
      scenarioId: string;
    }
  | {
      type: "command.accepted";
      atSimMs: number;
      atWallMs: number;
      command: Command;
    }
  | {
      type: "command.rejected";
      atSimMs: number;
      atWallMs: number;
      command: Command;
      reason: string;
    };
