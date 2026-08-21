/**
 * Typed command-line submit. Bypasses SpeechPort (`text-only` is not a
 * SpeechPort — `phases/_shared/speech-port.md`). `Command.source` is `"text"`.
 *
 * Analog: vice command line → virtual-pilot readback (R08). Trainer delta:
 * tokens only (no Path A/B/C), no TTS, no physics in this handler. Not NAS STARS.
 */

import type { SessionLog, World } from "@core";
import { handleRadioText, type PilotResult } from "@pilot";

export type { PilotResult };

/**
 * Run the radio pipeline on a typed line. Does not call SpeechPort, does not
 * step the world — intent updates wait for the next physics tick (T01-10 rAF).
 */
export function submitCommand(world: World, text: string, log: SessionLog): PilotResult {
  return handleRadioText(world, text, log);
}
