import { useState } from "react";
import type { Scenario } from "@scenario";
import { PpiPlaceholder } from "@scope";
import type { AppHandles } from "../app/create-app";
import { CommandLine } from "./command-line";
import { Disclaimer } from "./disclaimer";
import { submitCommand } from "./submitCommand";

export interface ShellProps {
  app: AppHandles;
  scenario: Scenario;
}

export function Shell({ app, scenario }: ShellProps) {
  const [readback, setReadback] = useState("");

  return (
    <div className="scope-shell" data-scenario={scenario.id} data-speech={app.speech.id}>
      <Disclaimer />
      <PpiPlaceholder />
      <CommandLine
        readback={readback}
        onSubmit={(input) => {
          const result = submitCommand(app.world, input, app.log);
          setReadback(result.readback);
        }}
      />
    </div>
  );
}
