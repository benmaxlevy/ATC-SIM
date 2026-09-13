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
  bindingById,
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

function bindingsForIds(bindingIds: string[]): KeyBinding[] {
  // The behavior selectors (alwaysOnKeyBindings, scopeFocusKeyBindings,
  // mouseKeyBindings) remain available to scope code; Help intentionally
  // projects rows from the navigation registry by binding id.
  return bindingIds.flatMap((id) => {
    const binding = bindingById(id);
    return binding ? [binding] : [];
  });
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
  const filteredNavigationGroups = HELP_NAVIGATION_GROUPS.map((navigationGroup) => {
    const groups = navigationGroup.commandGroupIds
      .map((id) => filteredGroupById.get(id))
      .filter((group): group is (typeof filteredGroups)[number] => group !== undefined);
    const bindingSections = navigationGroup.bindingSections
      .map((section) => ({
        ...section,
        bindings: filterBindings(bindingsForIds(section.bindingIds)),
      }))
      .filter((section) => section.bindings.length > 0);
    return { ...navigationGroup, groups, bindingSections };
  }).filter(
    (navigationGroup) =>
      navigationGroup.groups.length > 0 || navigationGroup.bindingSections.length > 0,
  );
  const hasMatches = filteredNavigationGroups.length > 0;

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
        <p className="scope-help-radio">
          <strong>ATC-SIM trainer extension (not a supplied STARS-manual function):</strong>{" "}
          <code>*FP &lt;ACID&gt; Enter</code> opens a local flight-plan dialog. A two-digit index on
          the current visible TAB page is also accepted as <code>*FP &lt;TAB-index&gt; Enter</code>.
          Bare <code>*FP Enter</code> then click opens the uniquely beacon-correlated plan, or
          creates a draft only when the target has a usable ACID and no filed plan exists. A target
          whose reported beacon mismatches its filed plan, a stale/off-page TAB index, or a target
          with a blank ACID returns <code>NO FLIGHT</code>; use the FL list or ACID to open the
          uncorrelated filed record. Save changes filed metadata only; Cancel/Escape closes the
          dialog and restores opener focus. Filed route text is catalog-resolved with the compact
          grammar
          <code>SID:id[/transition] STAR:id[/transition] DCT fix</code>; <code>DCT</code> must be
          followed by one fix or navaid.
        </p>
        {filteredNavigationGroups.map((navigationGroup) => {
          return (
            <details
              key={navigationGroup.id}
              className="scope-help-top-section"
              open={normalizedQuery.length > 0 || navigationGroup.id === "aircraft"}
            >
              <summary>{navigationGroup.title}</summary>
              {navigationGroup.groups.map((group) => (
                <CommandTable
                  key={group.id}
                  title={group.title}
                  entries={group.entries}
                  open={normalizedQuery.length > 0 || navigationGroup.id === "aircraft"}
                />
              ))}
              {navigationGroup.bindingSections.map((section) => (
                <details
                  key={section.id}
                  className="scope-help-section"
                  open={normalizedQuery.length > 0 || navigationGroup.id === "aircraft"}
                >
                  <summary>{section.title}</summary>
                  <HelpTable caption={`${section.title} shortcuts`} bindings={section.bindings} />
                  {section.id === "scope-dcb" ? (
                    <p className="scope-help-dcb">
                      SHIFT swaps MAIN and AUX. AUX has HISTORY, PTL length/OWN/ALL, and DCB
                      TOP/LEFT/RIGHT/BOTTOM. VOL is disabled. FILTER stays on MAIN. Esc closes a DCB
                      submenu (DONE). RANGE / RR / LDR DIR / LDR LEN are spinners — click traps the
                      cursor in that cell. An open submenu traps the cursor in the DCB boxes. PLACE
                      CNTR then PPI click sets view center; OFF CNTR recenters the airport. PLACE RR
                      then PPI click sets range-ring origin; RR CNTR snaps origin to the view
                      center.
                    </p>
                  ) : null}
                </details>
              ))}
            </details>
          );
        })}
        {normalizedQuery && !hasMatches ? (
          <p className="scope-help-empty">No matching commands.</p>
        ) : null}
        <p className="scope-help-disclaimer">{DISCLAIMER_COPY}</p>
        <p className="scope-help-footer">{HELP_FOOTER}</p>
      </div>
    </div>
  );
}
