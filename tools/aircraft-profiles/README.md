# Aircraft profile generator

Build-time only. Install the pinned dependency once, then run offline:

```sh
python3 -m venv .venv
.venv/bin/pip install -r tools/aircraft-profiles/requirements.txt
npm run aircraft:profiles -- --preset terminal-v1
npm run aircraft:profiles:check -- --preset terminal-v1
```

`--types A320,B738 --types CRJ9` accepts arbitrary mapped ICAO ids. Input is
normalized, sorted in the artifact, and duplicate normalized ids fail. The
generator uses OpenAP `prop.aircraft` and `kinematic.WRAP`; no network request
is made by the command. Missing or unusable OpenAP data emits `UNRESOLVED`.

OpenAP is LGPL-3.0. Its values are open-literature/empirical trainer inputs,
not certified operating limits. Bank, caps, and missing-data values come from
`simulator-policies.json` and are explicitly marked `simulator-policy`.

The committed artifact is the runtime input. The browser does not import
OpenAP, start Python, or make network requests. Review generated changes by
running `npm run aircraft:profiles -- --preset terminal-v1 --report`, then
inspect the JSON diff and provenance before committing it. `--check` is the
release/CI gate and never writes the artifact.

The initial `terminal-v1` preset contains 33 ICAO ids. Arbitrary reviewed ids
can be generated without changing that preset:

```sh
npm run aircraft:profiles -- --types A320,B738 --types CRJ9 --out /tmp/profiles.json
```

Inputs are normalized, deduplicated, and sorted. Every requested id must have
a mapping entry; an unavailable OpenAP lookup is emitted as `UNRESOLVED` and
the TypeScript registry uses its safe default profile. Keep the selected
representative variant/engine and provenance in the mapping/data review.

For a clean local setup, install the pinned build dependency in a dedicated
virtual environment. The generator itself performs no downloads; dependency
installation is the only network-capable step:

```sh
python3 -m venv .venv
.venv/bin/pip install -r tools/aircraft-profiles/requirements.txt
npm run aircraft:profiles:test
npm run aircraft:profiles:check
```

OpenAP's LGPL-3.0 license and any changes to the pinned version require
provenance/license review before redistributing a regenerated artifact.
