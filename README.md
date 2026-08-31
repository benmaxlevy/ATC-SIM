# ATC-SIM

In-browser **STARS-like** terminal radar **simulator**: Canvas2D PPI, typed and spoken ATC commands, FMS procedures, simulated-pilot readbacks, Conflict Alert and MSAW.

## Quick start

- **Node.js** `v22.6.0+`, **npm** `v10.0.0+`
- **Python** `3.11+` optional (voice)

```bash
git clone https://github.com/benmaxlevy/ATC-SIM.git
cd ATC-SIM
npm install
npm run dev
```

Open `http://localhost:5173`. Operator commands, URL params, and Preview Area: [`docs/USER.md`](docs/USER.md). Press **F1** in the app for the key overlay.

Voice (local models): [`speech-api/README.md`](speech-api/README.md).

## Docs

| Doc | For |
| --- | --- |
| [`docs/USER.md`](docs/USER.md) | Operators: URL params, features, radio syntax, keys, Preview Area |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Contributors: v1 freeze, packages, tick, parse pipeline |
| [`docs/COORDINATE-SYSTEM.md`](docs/COORDINATE-SYSTEM.md) | ENU NM formulas |
| [`speech-api/README.md`](speech-api/README.md) | Local STT/TTS/Path C service |
| [`tools/cifp-import/README.md`](tools/cifp-import/README.md) | Offline CIFP → catalog JSON |
| [`tools/crc-videomap-import/README.md`](tools/crc-videomap-import/README.md) | CRC cache → trainer video maps |
| [`src/scenario/README.md`](src/scenario/README.md) | Playable scenarios and facility catalogs |
| [`phases/README.md`](phases/README.md) | Ticket / build order |

## Development

```bash
npm test
npm run ci
```

`npm run ci` is typecheck + lint + format check + tests. Speech service CI: `SPEECH_API_MOCK=1 pytest` in [`speech-api/`](speech-api/README.md).

## License

MIT. See the repository license file.
