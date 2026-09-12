/**
 * Help is a local command reference. It describes the trainer's actual input
 * surfaces and does not present an external-software comparison table.
 */

import {
  HELP_FOOTER,
  HELP_COMMAND_GROUPS,
  HELP_NAVIGATION_GROUPS,
  HELP_GLOSSARY_NOTE,
  HELP_OVERLAY_ID,
  RADIO_CONFLICT_WARNING,
  alwaysOnKeyBindings,
  mouseKeyBindings,
  scopeFocusKeyBindings,
  type KeyBinding,
} from "@scope";
import { useMemo, useState } from "react";
import { DISCLAIMER_COPY } from "./disclaimer";

export interface ScopeHelpOverlayProps {
  open: boolean;
}

export function normalizeHelpSearchText(value: string): string {
  return value.toLowerCase();
}

function localBindingAction(binding: KeyBinding): string {
  const overrides: Record<string, string> = {
    "mouse-pan": "Pan the view center (trainer control).",
    "mouse-accept-handoff": "Click to accept the pending inbound handoff.",
    "radio-focus": "Focus the command line; `/` is a Preview Area prefix when used there.",
  };
  const action = overrides[binding.id] ?? binding.action;
  return action
    .replace(/\bCRC\b/gi, "external comparison")
    .replace(/\bvNAS\b/gi, "external system")
    .replace(/\bSTARS\b/gi, "trainer")
    .replace(/\bNAS\b/gi, "network");
}

function HelpRow({ binding }: { binding: KeyBinding }) {
  return (
    <tr>
      <td className="scope-help-key">{binding.windowsKeys}</td>
      <td className="scope-help-input">
        {binding.focus === "always" ? "Any focus" : "PPI focused"}
      </td>
      <td className="scope-help-action">{localBindingAction(binding)}</td>
    </tr>
  );
}

function HelpTable({ caption, bindings }: { caption: string; bindings: KeyBinding[] }) {
  return (
    <table className="scope-help-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>Key / gesture</th>
          <th>Input</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {bindings.map((binding) => (
          <HelpRow key={binding.id} binding={binding} />
        ))}
      </tbody>
    </table>
  );
}

function CommandTable({
  title,
  entries,
  open,
}: {
  title: string;
  entries: (typeof HELP_COMMAND_GROUPS)[number]["entries"];
  open: boolean;
}) {
  return (
    <details className="scope-help-section" open={open}>
      <summary>{title}</summary>
      <table className="scope-help-table scope-help-command-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Example</th>
            <th>Input</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="scope-help-key">{entry.command}</td>
              <td className="scope-help-example">{entry.example}</td>
              <td className="scope-help-input">{entry.input}</td>
              <td className="scope-help-action">{entry.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function ScopeHelpOverlay({ open }: ScopeHelpOverlayProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeHelpSearchText(query.trim());
  const filteredGroups = useMemo(
    () =>
      HELP_COMMAND_GROUPS.map((group) => ({
        ...group,
        entries: group.entries.filter((entry) =>
          normalizeHelpSearchText(
            [entry.command, entry.example, entry.input, entry.result].join(" "),
          ).includes(normalizedQuery),
        ),
      })).filter((group) => group.entries.length > 0),
    [normalizedQuery],
  );
  const filteredGroupById = new Map(filteredGroups.map((group) => [group.id, group]));
  const filterBindings = (bindings: KeyBinding[]) =>
    normalizedQuery.length === 0
      ? bindings
      : bindings.filter((binding) =>
          normalizeHelpSearchText(`${binding.windowsKeys} ${localBindingAction(binding)}`).includes(
            normalizedQuery,
          ),
        );
  const filteredAlwaysOnBindings = filterBindings(alwaysOnKeyBindings());
  const filteredScopeBindings = filterBindings(scopeFocusKeyBindings());
  const filteredMouseBindings = filterBindings(mouseKeyBindings());
  const hasMatches =
    filteredGroups.length > 0 ||
    filteredAlwaysOnBindings.length > 0 ||
    filteredScopeBindings.length > 0 ||
    filteredMouseBindings.length > 0;

  if (!open) {
    return null;
  }

  return (
    <div
      id={HELP_OVERLAY_ID}
      className="scope-help-overlay"
      role="dialog"
      aria-label="Command reference"
      aria-modal="false"
    >
      <div className="scope-help-panel">
        <h2 className="scope-help-title">Command reference</h2>
        <label className="scope-help-search-label" htmlFor="scope-help-search">
          Find a command or description
        </label>
        <input
          id="scope-help-search"
          className="scope-help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands, examples, or results"
          autoComplete="off"
        />
        <p className="scope-help-glossary">{HELP_GLOSSARY_NOTE}</p>
        <p className="scope-help-radio">{RADIO_CONFLICT_WARNING}</p>
        {HELP_NAVIGATION_GROUPS.map((navigationGroup) => {
          const groups = navigationGroup.commandGroupIds
            .map((id) => filteredGroupById.get(id))
            .filter((group): group is (typeof filteredGroups)[number] => group !== undefined);
          if (groups.length === 0) return null;
          return (
            <details
              key={navigationGroup.id}
              className="scope-help-top-section"
              open={normalizedQuery.length > 0 || navigationGroup.id === "simulation"}
            >
              <summary>{navigationGroup.title}</summary>
              {groups.map((group) => (
                <CommandTable
                  key={group.id}
                  title={group.title}
                  entries={group.entries}
                  open={normalizedQuery.length > 0 || navigationGroup.id === "simulation"}
                />
              ))}
            </details>
          );
        })}
        {normalizedQuery && !hasMatches ? (
          <p className="scope-help-empty">No matching commands.</p>
        ) : null}
        <details className="scope-help-top-section" open={normalizedQuery.length === 0}>
          <summary>Keyboard shortcuts, mouse, and DCB</summary>
          {filteredAlwaysOnBindings.length > 0 ? (
            <HelpTable caption="Additional keyboard controls" bindings={filteredAlwaysOnBindings} />
          ) : null}
          {filteredScopeBindings.length > 0 ? (
            <HelpTable caption="Scope-focus shortcuts" bindings={filteredScopeBindings} />
          ) : null}
          {filteredMouseBindings.length > 0 ? (
            <HelpTable caption="Mouse controls" bindings={filteredMouseBindings} />
          ) : null}
          <p className="scope-help-dcb">
            SHIFT swaps MAIN and AUX. AUX has HISTORY, PTL length/OWN/ALL, and DCB
            TOP/LEFT/RIGHT/BOTTOM. VOL is disabled. FILTER stays on MAIN. Esc closes a DCB submenu
            (DONE). RANGE / RR / LDR DIR / LDR LEN are spinners — click traps the cursor in that
            cell. An open submenu traps the cursor in the DCB boxes. PLACE CNTR then PPI click sets
            view center; OFF CNTR recenters the airport. PLACE RR then PPI click sets range-ring
            origin; RR CNTR snaps origin to the view center.
          </p>
        </details>
        <p className="scope-help-disclaimer">{DISCLAIMER_COPY}</p>
        <p className="scope-help-footer">{HELP_FOOTER}</p>
      </div>
    </div>
  );
}
