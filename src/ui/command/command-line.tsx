/**
 * Analog: vice / CRC command line at the bottom of the TCW (R07, R08).
 * Trainer delta: narrow map-green token strip, not a lime web input block.
 * Submit runs shared radio pipeline (typed, Path A/B, then health-gated Path C). Not NAS STARS.
 */

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { SessionLog, World } from "@core";
import { handleRadioText, type PilotResult } from "@pilot";
import { isAlwaysOnScopeKey, isHandoffKey } from "@scope";
import { displayCommandLineStatus, isTransientVoiceStatus } from "./voice-status";

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
  /**
   * Last pilot transmission (a/c callup, VFR request, or pilot readback) kept
   * on the line after its TTS stream ends. Cleared only by a new transmission,
   * a PTT press (`TX`), or an explicit dismiss (click/keys on the line).
   */
  const [sticky, setStickyState] = useState("");
  const prevCallsignRef = useRef<string | null>(selectedCallsign ?? null);
  const isFirstMount = useRef(true);
  const readbackMountedRef = useRef(false);
  // Text the user explicitly dismissed. While the live props still hold it,
  // stay on the input until a genuinely new transmission arrives.
  const hiddenForRef = useRef<string | null>(null);
  const stickyRef = useRef("");
  const setSticky = useCallback((next: string): void => {
    stickyRef.current = next;
    setStickyState(next);
  }, []);
  // Latest props without re-running the selection effect on every change; a
  // live pilot callup owns the line until its TTS stream ends and voiceStatus
  // clears — then `sticky` keeps it visible until dismissed.
  const voiceStatusRef = useRef(voiceStatus);
  voiceStatusRef.current = voiceStatus;
  const readbackRef = useRef(readback);
  readbackRef.current = readback;
  /** Set to true when readback is dismissed by an a/c click — prevents focus-stealing. */
  const skipNextFocusRef = useRef(false);

  /** Dismiss the persisted line to the input. New transmissions still replace it. */
  const dismissToInput = useCallback((): void => {
    const live = displayCommandLineStatus(readbackRef.current, voiceStatusRef.current);
    hiddenForRef.current = live !== "" ? live : stickyRef.current !== "" ? stickyRef.current : null;
    stickyRef.current = "";
    setStickyState("");
    setShowingReadback(false);
  }, []);

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
      // Don't steal focus from the PPI when filling the callsign via a/c click.
      skipNextFocusRef.current = true;
      // A live pilot callup owns the line until its TTS stream ends; stage
      // the callsign in the input underneath instead of cutting the callup
      // text off mid-stream. It is revealed when voiceStatus clears.
      // A persisted (post-stream) callup is dismissed so the staged callsign
      // is immediately usable.
      if (!voiceStatusRef.current) {
        const live = displayCommandLineStatus(readbackRef.current, voiceStatusRef.current);
        hiddenForRef.current =
          live !== "" ? live : stickyRef.current !== "" ? stickyRef.current : null;
        setSticky("");
        setShowingReadback(false);
      }
    } else if (selectedCallsign === null && prevCallsignRef.current !== null) {
      setValue((current) => (current === prevCallsignRef.current ? "" : current));
      prevCallsignRef.current = null;
    }
  }, [selectedCallsign, selectionToken]);

  useEffect(() => {
    const live = displayCommandLineStatus(readback, voiceStatus);
    if (live !== "") {
      if (live === hiddenForRef.current) {
        // Dismissed by click/keys, PTT release, or selection; wait for a new
        // transmission instead of re-showing the same text.
        return;
      }
      hiddenForRef.current = null;
      if (isTransientVoiceStatus(live)) {
        // PTT hit clears a persisted a/c call; TX itself never persists.
        if (live === "TX") {
          setSticky("");
        }
        setShowingReadback(true);
        if (live !== "TX") {
          const timer = setTimeout(() => {
            hiddenForRef.current = live;
            setShowingReadback(false);
          }, 3000);
          return () => clearTimeout(timer);
        }
        return;
      }
      if (!readbackMountedRef.current && !voiceStatus) {
        // First render with only a typed readback prop: stage it for later
        // persistence without popping the readback box over the input.
        readbackMountedRef.current = true;
        setSticky(live);
        return;
      }
      readbackMountedRef.current = true;
      // New a/c transmission replaces the persisted line.
      setSticky(live);
      setShowingReadback(true);
      return;
    }
    readbackMountedRef.current = true;
    // Live line cleared (TTS stream ended): keep the last a/c transmission
    // visible until PTT, a new transmission, or a click dismisses it.
    if (stickyRef.current !== "" && stickyRef.current !== hiddenForRef.current) {
      setShowingReadback(true);
      return;
    }
    setShowingReadback(false);
  }, [readback, voiceStatus, setSticky]);

  useEffect(() => {
    if (!showingReadback) {
      if (skipNextFocusRef.current) {
        skipNextFocusRef.current = false;
        return;
      }
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
  }, [showingReadback]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    hiddenForRef.current = null;
    onSubmit(value);
    setValue("");
    setShowingReadback(true);
  }

  function releasePtt(): void {
    if (!pttHeld) {
      return;
    }
    setPttHeld(false);
    dismissToInput();
    onPttRelease?.();
  }

  const liveText = displayCommandLineStatus(readback, voiceStatus);
  const visibleText = liveText !== "" ? liveText : sticky;

  return (
    <form className="command-line" onSubmit={handleSubmit}>
      {showingReadback ? (
        <div
          className="command-readback"
          aria-live="polite"
          tabIndex={0}
          role="status"
          title="Click to enter command"
          onClick={() => dismissToInput()}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              dismissToInput();
            } else if (
              event.key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            ) {
              dismissToInput();
              setValue(event.key.toUpperCase());
            }
          }}
        >
          {visibleText}
        </div>
      ) : (
        <input
          id={COMMAND_LINE_INPUT_ID}
          type="text"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Command line"
          value={value}
          onKeyDown={(event) => {
            if (
              isAlwaysOnScopeKey(event.key) ||
              (event.ctrlKey && /^F\d+$/.test(event.key)) ||
              isHandoffKey(event)
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
            hiddenForRef.current = null;
            // PTT hit clears a persisted a/c call; the TX status arriving
            // next owns the line until release dismisses it to the input.
            setSticky("");
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
