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
