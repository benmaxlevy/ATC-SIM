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
      /**
       * Parsed Command when resolve/validate failed. `null` when parse failed
       * before a Command existed (T01-07); then `sourceText` carries the line.
       */
      command: Command | null;
      reason: string;
      /** Required when `command` is null (parse miss). */
      sourceText?: string;
    };
