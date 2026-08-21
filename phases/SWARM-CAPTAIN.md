# Swarm phase captain

You **do not write application code**. You spawn ticket workers, hold the **merge lock** on `master`, and declare phase exit.

Workspace: `c:\Users\Ben\Documents\ATC-SIM`

## Inputs

- **Phase folder:** `phases/NN-name/` (this polish swarm: **`phases/02-scope/`**, tickets **T02-14–T02-21 only**)
- **Max in-flight workers:** 3
- **Waves:** use the wave table in `phases/SWARM.md` for **this run** (not the whole-phase `AGENT.md`, not T02-01–13)
- **Model:** every ticket worker Task sets `model: "cursor-grok-4.6-high"`

## Loop

1. Read `README.md` exit checklist and `phases/SWARM.md` waves.
2. While tickets remain:
   - Pick up to **3** tickets whose dependencies are **already merged on `master`** and whose files should not collide (wave table).
   - For each, spawn a **new** subagent whose **entire prompt** is `phases/SWARM-TICKET-WORKER.md` plus the ticket id/path.
   - Wait until a worker returns `READY TO MERGE` or `BLOCKED`.
   - **Merge lock (only you merge):**

```text
git checkout master
git merge --no-ff ticket/Txx-yy-slug -m "Merge ticket/Txx-yy-slug"
git branch -d ticket/Txx-yy-slug
npm test
```

   - If merge conflicts: stop. Return `BLOCKED` to the orchestrator. Do not `--force`.
   - If `npm test` fails after merge: stop. Do not start more workers.
   - If another worker is still running on a branch started **before** this merge: after merge, that worker may be stale. Prefer **not** to have overlapping writers on `src/core` vs `src/core`. If a stale worker returns, rebase their branch onto `master` yourself (`git checkout ticket/… && git rebase master`) and fix conflicts **or** discard and re-spawn the ticket from new `master`.
3. When all **polish** tickets in this run are on `master`, run the phase README **Phase 2 polish checklist** (not the original T02-01–13 exit). Tests + whatever you can verify without a long manual playtest; Manual ACs: do them if you can run the app, else list them for the human. Typed `DAL123 H270` must still work.
4. Append a short section to `phases/SWARM-STATUS.md`.
5. Return `PHASE EXIT GREEN` or `PHASE EXIT BLOCKED` to the orchestrator.

## Hard stops

- Do not implement tickets yourself (if a worker fails twice, report up — do not absorb a Size L ticket).
- Do not start phase 3 or redo T02-01–13.
- Do not spawn more than 3 ticket workers at once.
- Do not skip waves. Do **not** skip T02-16.
- Do not background a worker and end your turn.
- Do not point SpeechPort at paid APIs (`speech-port.md`).
- Workers: `model: "cursor-grok-4.6-high"` only.
