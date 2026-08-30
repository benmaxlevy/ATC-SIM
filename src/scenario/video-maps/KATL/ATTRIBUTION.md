# KATL A80 video maps — attribution

Converted from permitted local CRC/vNAS STARS A80 videomaps.

- Source: ZTL ARTCC metadata plus ULID-named GeoJSON under the local CRC VideoMaps tree.
- Projection origin (ARP) is the playable scenario ARP; conversion is ARP-parameterized.
- Identity: catalog `id` is the CRC ULID. DCB and `*D` show sparse CRC `starsId`. DCB slots are layout, not identity.
- For training and entertainment only. Not NAS-certified.
- The trainer runtime does not read CRC files, does not call vNAS, and does not parse a national source pack.

## Local source (never commit)

A human confirmed permission to commit the converted trainer pack. Do not
commit local CRC cache JSON/GeoJSON.

- Metadata: `C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json`
- Geometry: `C:\Users\Ben\AppData\Local\CRC\VideoMaps\ZTL\<ULID>.geojson`

## Reproducible pack (local CRC; not CI)

```text
npm run crc:videomaps -- pack --metadata C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json --maps C:\Users\Ben\AppData\Local\CRC\VideoMaps\ZTL --arp 33.6367,-84.4278638888889 --out src/scenario/video-maps/KATL
```

See `tools/crc-videomap-import/README.md` for identity split, legal boundary, and
Chrome visual leftover (skip-with-reason).
