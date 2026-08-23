# T02-29 DCB PREF sets (localStorage)

**Phase:** 02 Scope (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-23, T02-24, T02-25, T02-26, T02-27
**Blocks:** T02-30
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

**PREF** submenu stores **8** named local display snapshots (not 32 NAS sets). DEFAULT / RESTORE / SAVE / SAVE AS / DELETE work without `window.prompt` / HTML inputs. Persistence is `localStorage`, schema-versioned, facility-keyed. Not a NAS preference host.

## Context

CRC PREF has 32 host slots. Trainer freeze: **8 slots**, KDEM only. Snapshot whatever display state T02-22–27 already put on `ScopeView` (and T02-28 TPA if present — optional field with defaults).

T02-21 greps forbade PREF; **this ticket** allows a PREF submenu. CSA/CRDA/FMA/OSM stay forbidden.

## Research

Read **R07** PREF. `phases/_shared/non-goals.md` (NAS pref host still out).

- Search: `STARS DCB PREF SAVE RESTORE DEFAULT`
- **Terms:** **PREF**, **preference set**. Not settings panel, profile modal, theme.
- Comment: analog CRC PREF; trainer 8 slots + localStorage; not NAS.

## Scope

- MAIN **PREF** opener → submenu replaces bar.
- Slots **PREF 1 … PREF 8** — select active slot (pressed). Empty slots allowed.
- **DEFAULT** — reset display state to factory `createScopeView()` display defaults (range 20, maps defaultOn, BRITE/CHAR defaults, dock TOP, etc.). Does not wipe aircraft / world.
- **RESTORE** — revert to the snapshot taken **when PREF was opened** (cancel edits).
- **SAVE** — write current display state into the **active** slot (overwrite).
- **SAVE AS** — first empty slot, auto-name `PREF n`. If all full, overwrite slot 8 **or** no-op with no browser prompt — pick one and test it. **No** `prompt()`, **no** `<input>`.
- **DELETE** — clear active slot.
- **DONE**
- Persist key e.g. `atc-sim.dcb.pref.v1.KDEM` (include ICAO). Load on boot if present; corrupt JSON → ignore and factory.
- Snapshot **display** fields only, including at least:
  - `dcbDock`, range preset, view center, ring interval + ring origin
  - map visibility
  - leader default dir + length
  - history count, PTL minutes / OWN / ALL
  - BRITE channels, CHAR SIZE fields
  - SSA/GI visibility
  - TPA on/radius and ATPA stub if T02-28 has landed; else omit
- Do **not** persist speech prefs (T03-10), command-line text, or world kinematics.
- Update T02-21 / tcw greps: PREF cell allowed; still no CSA/CRDA/FMA/OSM; still no weather paint.

## Out of scope

- 32 slots. Host download/upload. Cloud sync. Saving traffic. `window.prompt`. Dual FSL.

## Implementation notes

Pure `serializeDcbPref(view)` / `applyDcbPref(view, pref)` so tests fake storage.

```ts
interface DcbPrefFile {
  v: 1;
  icao: string;
  slots: Array<{ name: string; body: DcbPrefBody } | null>; // length 8
}
```

## Acceptance criteria

- [ ] **AC1 —** SAVE then reload helper restores range, a toggled map, and dock from the slot (unit, fake storage).
- [ ] **AC2 —** DEFAULT restores factory range 20 and default maps without clearing aircraft.
- [ ] **AC3 —** RESTORE undoes changes made after opening PREF.
- [ ] **AC4 —** SAVE AS fills the first empty slot named `PREF n` with no `prompt` / `<input>`.
- [ ] **AC5 —** DELETE clears the active slot; boot with bad JSON does not throw (falls back to factory).
- [ ] **AC6 —** Eight slots only. No Command IR. `DAL123 H270` still works.
- [ ] **AC7 — Research:** PREF comments; not settings/theme; 8-slot trainer delta vs CRC 32.

## Test plan

- Unit: serialize/apply round-trip; DEFAULT; RESTORE; corrupt JSON.
- Integration: PREF markup allowed in tcw grep; heading command.
- Manual: none required (T02-30).

## Suggested files

- `src/scope/dcbPref.ts` (new)
- `src/scope/dcbPref.test.ts`
- `src/scope/scopeView.ts`
- `src/ui/DisplayControlBar.tsx`
- `src/ui/tcwVisualAcceptance.test.ts`
- `src/ui/App.tsx` (load on boot, if that is where ScopeView is born)
