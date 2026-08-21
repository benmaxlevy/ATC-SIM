import { type FormEvent, useState } from "react";

export const COMMAND_LINE_INPUT_ID = "command-line-input";

export interface CommandLineProps {
  readback: string;
  onSubmit: (value: string) => void;
}

/** Return key focus after a PPI click so the next keys are a radio command. */
export function focusCommandLine(): void {
  const el = globalThis.document?.getElementById(COMMAND_LINE_INPUT_ID);
  if (el instanceof HTMLInputElement) {
    el.focus();
  }
}

export function CommandLine({ readback, onSubmit }: CommandLineProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value);
    setValue("");
  }

  return (
    <form className="command-line" onSubmit={handleSubmit}>
      <div className="command-readback" aria-live="polite">
        {readback}
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
        value={value}
        onKeyDown={(event) => {
          if (
            event.key === "PageUp" ||
            event.key === "PageDown" ||
            event.key === "Home" ||
            event.key === "End" ||
            event.key === "F3" ||
            event.key === "F4" ||
            event.key === "F7" ||
            event.key === "F8"
          ) {
            event.preventDefault();
          }
        }}
        onChange={(event) => setValue(event.target.value)}
      />
    </form>
  );
}
