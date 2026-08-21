# Swarm phase captain

You **do not write application code**. You spawn ticket workers, hold the **merge lock** on `master`, and declare phase exit.

Workspace: `c:\Users\Ben\Documents\ATC-SIM`

## Inputs

- **Phase folder:** `phases/NN-name/` (this voice swarm: **`phases/03-voice/`**, tickets **T03-01–10, T03-12, T03-13**. **Skip T03-11 and T03-14**)
- **Max in-flight workers:** 3
- **Waves:** use the wave table in `phases/SWARM.md` for **this run** (not the whole-phase `AGENT.md` solo sequence as a single agent)
- **Model:** every ticket worker Task sets `model: "cursor-grok-4.6-high"`

## Loop

1. Read `README.md` **Phase exit** and `phases/SWARM.md` waves.
2. While tickets remain:
   - Pick up to **3** tickets whose dependencies are **already merged on `master`** and whose files should not collide (wave table). Wave A **must** use isolated worktrees (capture vs parser vs `speech-api/`).
   - For each, spawn a **new** subagent whose **entire prompt** is `phases/SWARM-TICKET-WORKER.md` plus the ticket id/path plus this run’s product law from `SWARM.md`.
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
   - If another worker is still running on a branch started **before** this merge: after merge, that worker may be stale. Prefer **not** to have overlapping writers on `src/parse` vs `src/parse`. If a stale worker returns, rebase their branch onto `master` yourself (`git checkout ticket/… && git rebase master`) and fix conflicts **or** discard and re-spawn the ticket from new `master`.
3. When all **this-run** tickets are on `master`, run the phase README **Phase exit** checklist (E1–E14). Tests + whatever you can verify without a long mic playtest; Manual ACs: do them if you can run the app + speech-api, else list them for the human. Typed `DAL123 H270` must still work. Path A English in the command line must work after T03-03. Web Speech quality and missing wasm/Path C are **not** fails.
4. Append a short section to `phases/SWARM-STATUS.md`.
5. Return `PHASE EXIT GREEN` or `PHASE EXIT BLOCKED` to the orchestrator.

## Hard stops

- Do not implement tickets yourself (if a worker fails twice, report up — do not absorb a Size L ticket).
- Do not start phase 4 or 5. Do not implement T02-14–21 polish. Do not redo T00–T02-13.
- Do **not** spawn T03-11 or T03-14.
- Do not spawn more than 3 ticket workers at once.
- Do not skip waves. Do **not** skip T03-13. Do **not** skip T03-03.
- Do not background a worker and end your turn.
- Do not point SpeechPort at paid APIs (`speech-port.md`). Default backend is **http → our speech-api**, not Web Speech.
- Workers: `model: "cursor-grok-4.6-high"` only.
