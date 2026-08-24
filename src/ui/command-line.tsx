/**
 * Analog: vice / CRC command line at the bottom of the TCW (R07, R08).
 * Trainer delta: narrow map-green token strip, not a lime web input block.
 * Submit runs the shared radio pipeline (typed tokens or Path A English). Not NAS STARS.
 */

import { type FormEvent, useState } from "react";
import type { SessionLog, World } from "@core";
import { handleRadioText, type PilotResult } from "@pilot";
import { displayCommandLineStatus } from "./voice-status";

export type { PilotResult };

export const COMMAND_LINE_INPUT_ID = "command-line-input";

/**
 * Trim typed command-line text. Does not parse or apply a Command.
 * Product submit is `submitCommand` (T01-09); this helper is the Phase 0 echo path.
 */
export function echoCommandLine(input: string): string {
  return input.trim();
}

/**
 * Echo reducer for the command line. Whitespace-only submit is ignored so the
 * last echoed line stays put.
 */
export function submitCommandLine(currentEcho: string, input: string): string {
  const next = echoCommandLine(input);
  if (next === "") {
    return currentEcho;
  }
  return next;
}

/**
 * Run the radio pipeline on a typed line. Does not call SpeechPort, does not
 * step the world — intent updates wait for the next physics tick (T01-10 rAF).
 */
export async function submitCommand(
  world: World,
  text: string,
  log: SessionLog,
  opts?: { pathC?: boolean },
): Promise<PilotResult> {
  return handleRadioText(world, text, log, 0, { source: "text", pathC: opts?.pathC ?? false });
}

export interface CommandLineProps {
  readback: string;
  /** Voice error/status copy; wins over `readback` while set. */
  voiceStatus?: string | null;
  onSubmit: (value: string) => void | Promise<void>;
  onPttPress?: () => void | Promise<void>;
  onPttRelease?: () => void;
}

/** Return key focus after a PPI click so the next keys are a radio command. */
export function focusCommandLine(): void {
  const el = globalThis.document?.getElementById(COMMAND_LINE_INPUT_ID);
  if (el instanceof HTMLInputElement) {
    el.focus();
  }
}

export function CommandLine({
  readback,
  voiceStatus = null,
  onSubmit,
  onPttPress,
  onPttRelease,
}: CommandLineProps) {
  const [value, setValue] = useState("");
  const [pttHeld, setPttHeld] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value);
    setValue("");
  }

  function releasePtt(): void {
    if (!pttHeld) {
      return;
    }
    setPttHeld(false);
    onPttRelease?.();
  }

  return (
    <form className="command-line" onSubmit={handleSubmit}>
      <div className="command-readback" aria-live="polite">
        {displayCommandLineStatus(readback, voiceStatus)}
      </div>
      <input
        id={COMMAND_LINE_INPUT_ID}
        type="text"
        autoFocus
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Command line"
        placeholder="DAL123 H270"
        value={value}
        onKeyDown={(event) => {
          if (
            event.key === "PageUp" ||
            event.key === "PageDown" ||
            event.key === "Home" ||
            event.key === "End" ||
            event.key === "F1" ||
            event.key === "F3" ||
            event.key === "F4" ||
            event.key === "F7" ||
            event.key === "F8" ||
            (event.shiftKey && (event.key === "H" || event.key === "h"))
          ) {
            event.preventDefault();
          }
        }}
        onChange={(event) => setValue(event.target.value)}
      />
      {onPttPress && onPttRelease ? (
        <button
          type="button"
          className="command-ptt"
          aria-label="Push to talk"
          aria-pressed={pttHeld}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setPttHeld(true);
            void onPttPress();
          }}
          onPointerUp={releasePtt}
          onPointerCancel={releasePtt}
        >
          PTT
        </button>
      ) : null}
    </form>
  );
}
