# T02-230 FMA Active Flow Selection and Lifecycle

**Phase:** 02 Scope\
**Depends on:** T02-229\
**Blocks:** final T02-228 reconciliation\
**Merge target:** feature/fma\
**Branch:** ticket/T02-230-fma-active-flow-selection

## Mission

Resolve FMA geometry and eligible AMZ selection from the chosen scenario runway flow at boot and every scenario replacement.

## Authority and trainer policy

Supplied TI6191.409 Rev30 manual: §§6.16.1–2 pp.6-127–130 (PDF657–660), AMZ selection/preferences and mode lifecycle; §6.16.3 p.6-131 (PDF661), selected-course projection. Automatic filtering by scenario flow is user-approved trainer behavior, not a published STARS selection algorithm.

## Contract

1. Use scenario.activeRunwayId plus generic catalog approach/runway courses to determine inbound direction. Reuse wrapped heading comparison, magnetic-to-true conversion and existing parallel-course tolerance. No KATL/east/west string branch; reciprocal courses must not qualify together. Derive all catalog geometry before selecting/filtering eligible same-flow groups, preserving adaptation.
2. Honor scenario.fma.initialAmzId only if it resolves to an eligible same-flow AMZ. Otherwise use the eligible AMZ containing the active runway, then a deterministic eligible fallback. Invalid/stale/opposite-flow overrides produce an existing trainer diagnostic, not a new STARS error code. Unknown runway/course or no eligible geometry gives unavailable FMA rather than silently selecting the first opposite-flow group.
3. The AMZ control offers eligible same-flow groups only and retains valid manual choice within that set. Do not merge all airport runways into one oversized AMZ; preserve existing group/NTZ capacity and explicit offset/SOIA adaptation.
4. Wire one shared resolver/binder into BOTH initial application boot and actual Shell/session scenario replacement. Same-flow valid selection can survive replacement; incompatible old selection cannot. Clear old episodes, acknowledgment/silence, retained poses, pending Preview/spinners and obsolete speech through existing lifecycle/cancellation helpers; apply newly selected AMZ preferences. Missing preferences retain existing NO PREF SET FOUND warning semantics when selecting/enabling; no fabricated error family. If no eligible AMZ remains, FMA exits cleanly and its UI is unavailable.
5. Preserve radio instructions, aircraft intent, scratchpad assignments, ownership, association and geographic measurements. Flow matching is display context, never an aircraft runway-assignment inference. Existing F8, MODE, MAG and AMZ adjustment/commit grammar and modifier/focus protection remain unchanged.
6. Update USER/phase documentation with automatic flow context and manual same-flow AMZ selection; show accurate eligible labels/counts in the existing DCB. No new flow command or preference schema unless unavoidable and explicitly documented.

## Contract matrix

| Input/form | Expected result | State/side effect | Rejection/edge case | Evidence |
| --- | --- | --- | --- | --- |
| Active runway inbound090 versus270 | Eligible eastbound versus westbound groups | Local FMA context | No reciprocal group or facility branch | User-approved trainer policy |
| Boot with valid initialAmzId | Select that eligible adapted group | Apply local preferences | Opposite-flow/stale override cannot win | §6.16.2; trainer defaulting |
| Session east -> west while FMA active | Rebind selected geometry/course and clear stale runtime/speech | Existing lifecycle only | No old outlines, arms, freeze or MAG basis | §§6.16.1–3 |
| Multiple same-flow AMZs | Default contains active runway; other eligible choices retained | Existing AMZ control | Stable selection independent of catalog array order | §6.16.2; trainer policy |
| Unknown active runway or no parallel candidates | FMA unavailable, clean mode exit | No unrelated settings mutation | Never first arbitrary opposite-flow fallback | §6.16.1; trainer eligibility |

## Ownership and acceptance

Generic scenario/FMA resolver; src/main.tsx boot; src/ui/shell.tsx actual replacement; scopeView lifecycle; existing DCB helpers/preferences as needed; shared acceptance and docs.

- [x] AC1: synthetic reciprocal and same-flow groups with wrapped/nonzero-magnetic-variation headings; no facility-specific branches.
- [x] AC2: eligible initial override, stale/opposite override, ambiguous/missing course and no-candidate cases have deterministic safe results/diagnostics.
- [x] AC3: actual boot/binder and session replacement path reuse the resolver; east/west switch clears runtime/speech/pending entry and uses new preferences/projection.
- [x] AC4: manual AMZ choice remains within eligible groups, group capacity preserved, ordinary controls/World/radio state untouched.
- [x] AC5: KATL east/west data contract smoke and manual comparison; browser transition **UNRUN** (browser unavailable in this session).

## Validation and handoff

Use synthetic minimal catalogs and the shared `src/scope/test/fmaFidelity.integration.test.ts`; reuse `mockCanvas.ts`. Run focused checks, `npm run ci`, and `git diff --check` before explicit-path commits. Captain performs supplied-manual primary and independent review before squash, then CI and post-merge review. Browser evidence must be actual or explicitly UNRUN. Preserve unrelated worktrees and artifacts. No merge, push, spawn, reset, clean, force, radio/Command IR/speech-backend changes. Return READY TO MERGE or BLOCKED with AC, commit, test and manual evidence.
