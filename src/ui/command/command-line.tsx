/**
 * Analog: vice / CRC command line at the bottom of the TCW (R07, R08).
 * Trainer delta: narrow map-green token strip, not a lime web input block.
 * Submit runs shared radio pipeline (typed, Path A/B, then health-gated Path C). Not NAS STARS.
 */

import { type FormEvent, useEffect, useRef, useState } from "react";
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
  /** Callsign of currently selected aircraft, if any. Sets input value on selection. */
  selectedCallsign?: string | null;
  /** Incrementing token/nonce to re-trigger populating callsign on repeated selection. */
  selectionToken?: number;
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
  selectedCallsign = null,
  selectionToken = 0,
}: CommandLineProps) {
  const [value, setValue] = useState(selectedCallsign ?? "");
  const [pttHeld, setPttHeld] = useState(false);
  const [showingReadback, setShowingReadback] = useState(Boolean(voiceStatus));
  const prevCallsignRef = useRef<string | null>(selectedCallsign ?? null);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      if (selectedCallsign) {
        setValue(selectedCallsign);
        prevCallsignRef.current = selectedCallsign;
      }
      return;
    }

    if (selectedCallsign) {
      setValue(selectedCallsign);
      prevCallsignRef.current = selectedCallsign;
      setShowingReadback(false);
    } else if (selectedCallsign === null && prevCallsignRef.current !== null) {
      setValue((current) => (current === prevCallsignRef.current ? "" : current));
      prevCallsignRef.current = null;
    }
  }, [selectedCallsign, selectionToken]);

  useEffect(() => {
    if (voiceStatus) {
      setShowingReadback(true);
    }
  }, [voiceStatus]);

  useEffect(() => {
    if (!showingReadback) {
      const el = globalThis.document?.getElementById(COMMAND_LINE_INPUT_ID);
      const active = globalThis.document?.activeElement;
      if (
        el instanceof HTMLInputElement &&
        active?.getAttribute("id") !== "ppi-placeholder" &&
        active !== el
      ) {
        el.focus();
      }
      return;
    }
    const timer = setTimeout(() => {
      setShowingReadback(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [showingReadback, readback, voiceStatus]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value);
    setValue("");
    setShowingReadback(true);
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
      {showingReadback ? (
        <div
          className="command-readback"
          aria-live="polite"
          tabIndex={0}
          role="status"
          title="Click to enter command"
          onClick={() => setShowingReadback(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setShowingReadback(false);
            } else if (
              event.key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            ) {
              setShowingReadback(false);
              setValue(event.key.toUpperCase());
            }
          }}
        >
          {displayCommandLineStatus(readback, voiceStatus)}
        </div>
      ) : (
        <input
          id={COMMAND_LINE_INPUT_ID}
          type="text"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Command line"
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
      )}
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
