import { useState } from "react";
import type { Scenario } from "@scenario";
import { PpiPlaceholder } from "@scope";
import type { AppHandles } from "../app/create-app";
import { CommandLine } from "./command-line";
import { Disclaimer } from "./disclaimer";
import { submitCommandLine } from "./echo-command-line";

export interface ShellProps {
  app: AppHandles;
  scenario: Scenario;
}

export function Shell({ app, scenario }: ShellProps) {
  const [echo, setEcho] = useState("");

  return (
    <div className="scope-shell" data-scenario={scenario.id} data-speech={app.speech.id}>
      <Disclaimer />
      <PpiPlaceholder />
      <CommandLine
        echo={echo}
        onSubmit={(input) => setEcho((prev) => submitCommandLine(prev, input))}
      />
    </div>
  );
}
