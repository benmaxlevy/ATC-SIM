/**
 * Typed command-line submit. Does not call SpeechPort (`text-only` is not a
 * SpeechPort — STT still bypasses speech). `Command.source` is `"text"`.
 * The shell plays TTS via `voiceLoop.playReadback` after an accepted result.
 *
 * Analog: vice command line → virtual-pilot readback (R08). Trainer delta:
 * tokens and English share the radio pipeline. No physics. Not NAS STARS.
 */

import type { SessionLog, World } from "@core";
import { handleRadioText, type PilotResult } from "@pilot";

export type { PilotResult };

/**
 * Run the radio pipeline on a typed line. Does not call SpeechPort, does not
 * step the world — intent updates wait for the next physics tick (T01-10 rAF).
 */
export async function submitCommand(
  world: World,
  text: string,
  log: SessionLog,
): Promise<PilotResult> {
  return handleRadioText(world, text, log);
}
