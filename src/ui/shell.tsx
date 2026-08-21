/**
 * Analog: CRC/vNAS STARS TCW is a dark PPI with DCB on the glass (R07).
 * Browser ATC anti-pattern is a header banner, tutorial footer, and game HUD (R12).
 * Trainer delta: T00-01 disclaimer is first-run / F1, not a bar over the DCB.
 * Pause / 1× / 2× is a map-green corner readout (not a CRC analog).
 * DCB is a green cell grid on the PPI glass (T02-16). SSA and the
 * flight-strip list live on the PPI (T02-20), not a labeled right dock.
 * Command line is a narrow token strip at the bottom of the PPI column.
 * Not NAS STARS.
 */

import { useEffect, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import type { Scenario } from "@scenario";
import {
  cssPointFromClient,
  handlePpiCanvasClick,
  handlePpiDoubleClick,
  handlePpiPanDelta,
  handleScopeWheel,
  installAlwaysOnScopeKeys,
  scopeFocusFromDocument,
  focusRadioCommandLine,
  type ScopeView,
} from "@scope";
import type { AppHandles } from "../app/create-app";
import { CommandLine } from "./command-line";
import { Disclaimer } from "./disclaimer";
import { FlightStrips, focusPpi } from "./FlightStrips";
import { FpsDebug } from "./FpsDebug";
import { isFpsDebugEnabled } from "./fpsHud";
import { ScopeCanvas } from "./ScopeCanvas";
import { ScopeHelpOverlay } from "./ScopeHelpOverlay";
import { SimControls } from "./sim-controls";
import { submitCommand } from "./submitCommand";

export interface ShellProps {
  app: AppHandles;
  scenario: Scenario;
  scopeView: ScopeView;
}

export function Shell({ app, scenario, scopeView }: ShellProps) {
  const [readback, setReadback] = useState("");
  const [, setScopeUiTick] = useState(0);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);

  function refreshScopeUi(): void {
    setScopeUiTick((n) => n + 1);
  }

  useEffect(() => {
    return installAlwaysOnScopeKeys(scopeView, app.world, {
      onHandled: () => setScopeUiTick((n) => n + 1),
      focusRadio: focusRadioCommandLine,
      cycleFocus() {
        if (scopeFocusFromDocument(document) === "scope") {
          focusRadioCommandLine();
        } else {
          focusPpi();
        }
      },
    });
  }, [scopeView, app.world]);

  const fpsDebug = typeof window !== "undefined" && isFpsDebugEnabled(window.location.search);

  return (
    <div className="scope-shell" data-scenario={scenario.id} data-speech={app.speech.id}>
      <div className="scope-work">
        <ScopeCanvas
          scopeView={scopeView}
          world={app.world}
          onScopeChange={refreshScopeUi}
          onCanvasClick={(event) => {
            handlePpiCanvasClick(
              event.currentTarget,
              app.world,
              event.clientX,
              event.clientY,
              scopeView,
            );
            refreshScopeUi();
            event.currentTarget.focus();
          }}
          onCanvasDoubleClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const { x, y } = cssPointFromClient(event.clientX, event.clientY, rect);
            handlePpiDoubleClick(scopeView, app.world, x, y, rect.width, rect.height);
          }}
          onCanvasWheel={(event: WheelEvent<HTMLCanvasElement>) => {
            handleScopeWheel(event, scopeView);
          }}
          onCanvasPointerDown={(event: PointerEvent<HTMLCanvasElement>) => {
            if (event.button !== 1) {
              return;
            }
            event.preventDefault();
            panRef.current = { lastX: event.clientX, lastY: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onCanvasPointerMove={(event: PointerEvent<HTMLCanvasElement>) => {
            if (!panRef.current || (event.buttons & 4) === 0) {
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            handlePpiPanDelta(
              scopeView,
              event.clientX - panRef.current.lastX,
              event.clientY - panRef.current.lastY,
              rect.width,
              rect.height,
            );
            panRef.current = { lastX: event.clientX, lastY: event.clientY };
          }}
          onCanvasPointerUp={() => {
            panRef.current = null;
          }}
          onCanvasContextMenu={(event) => event.preventDefault()}
          footer={
            <CommandLine
              readback={readback}
              onSubmit={(input) => {
                void submitCommand(app.world, input, app.log).then((result) => {
                  setReadback(result.readback);
                });
              }}
            />
          }
        >
          {fpsDebug ? <FpsDebug /> : null}
          <SimControls world={app.world} />
          <Disclaimer />
          <ScopeHelpOverlay open={scopeView.helpOpen} />
          <FlightStrips
            world={app.world}
            tracks={scopeView.tracks}
            onSelectionChange={refreshScopeUi}
          />
        </ScopeCanvas>
      </div>
    </div>
  );
}
