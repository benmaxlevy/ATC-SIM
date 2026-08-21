import { type FormEvent, useState } from "react";

export interface CommandLineProps {
  echo: string;
  onSubmit: (value: string) => void;
}

export function CommandLine({ echo, onSubmit }: CommandLineProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value);
    setValue("");
  }

  return (
    <form className="command-line" onSubmit={handleSubmit}>
      <div className="command-echo" aria-live="polite">
        {echo}
      </div>
      <input
        type="text"
        autoFocus
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Command line"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </form>
  );
}
