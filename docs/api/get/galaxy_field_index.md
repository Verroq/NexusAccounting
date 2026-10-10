# /api/galaxy/field-index

Galaxy-wide asteroid field summary: one row per **(system, fieldType)** pair,
aggregating every live field of that type in the system. Lets a client find
mineable fields across the whole galaxy in a single call instead of walking
`/api/galaxy/systems/{id}/planets` system by system.

## Method

`GET` — no parameters. Query strings are ignored (`?fieldType=ice`,
`?securityZone=dead` return the full list).

Supports `ETag` / `If-None-Match` (`304` when unchanged); `Cache-Control:
private, max-age=60, must-revalidate`, so a browser `fetch` reuses it for 60 s
and then revalidates on its own.

## Observed Response Shape

```json
{
  "systems": [
    {
      "systemId": 1843,
      "systemName": "A37-43",
      "systemX": 67.01018,
      "systemY": -239.25766,
      "securityZone": "dead",
      "fieldType": "gas",
      "fieldCount": 3,
      "totalRemaining": 202200,
      "totalCapacity": 202200,
      "minRichness": 1.92,
      "maxRichness": 2.44,
      "richestFieldId": 1414758,
      "richestFieldName": "A37-43-AF4",
      "allianceLocked": false,
      "questKey": null,
      "requiresDeadPlanetOrigin": false
    },
    {
      "systemId": 1843,
      "systemName": "A37-43",
      "systemX": 67.01018,
      "systemY": -239.25766,
      "securityZone": "dead",
      "fieldType": "dark",
      "fieldCount": 1,
      "totalRemaining": 52718,
      "totalCapacity": 54675,
      "minRichness": 3.645,
      "maxRichness": 3.645,
      "richestFieldId": 1420451,
      "richestFieldName": "A37-43-ERUPTION",
      "allianceLocked": false,
      "questKey": null,
      "requiresDeadPlanetOrigin": false
    }
  ]
}
```

## Fields

| Field | Meaning |
|---|---|
| `systemId`, `systemName`, `systemX`, `systemY` | System identity and map coords (same as `/api/galaxy/map`). |
| `securityZone` | `sentinel` / `open` / `dead`. No `rift` rows seen. |
| `fieldType` | `ore`, `ice`, `gas`, `plasma`, `dark`, `quantum`. |
| `fieldCount` | Number of fields of this type in the system. |
| `totalRemaining` | Sum of `remainingResources` over those fields. Can be float. |
| `totalCapacity` | Sum of `totalResources` over those fields. |
| `minRichness`, `maxRichness` | Richness range over those fields. |
| `richestFieldId`, `richestFieldName` | Field with `maxRichness` (`<system>-AF<n>` or `<system>-ERUPTION`). |
| `allianceLocked`, `questKey`, `requiresDeadPlanetOrigin` | Row-level flags. Always `false`/`null`/`false` in capture. |

## Notes

- **Not one row per system.** A system with several field types appears once
  per type (2026-10-09: 8611 rows, 7264 distinct systems; 5973 systems with 1
  type, 1235 with 2, 56 with 3). Key rows by `systemId + fieldType`.
- Systems without fields are absent (7264 of 14101 map systems listed).
- Row order is neither by `systemId` nor by `fieldType`.
- Aggregates match per-field data from `/api/galaxy/systems/{id}/planets`
  `asteroidFields[]` exactly (checked systems 10 and 1843).
- Not exposed here: per-field `expiresAt`, controller/outpost/alliance owner.
  `dark` and `quantum` rows are temporary `*-ERUPTION` fields (seen only in
  `dead`, with `expiresAt` set on the per-system endpoint); fetch the system
  for expiry and ownership.
- 2026-10-09 counts by type: ore 6102, ice 1052, gas 970, plasma 481, dark 3,
  quantum 3. Ore appears in every zone; ice/gas/plasma only in `open`/`dead`.
  Richness ranges 0.5 – 3.645.
- Payload is ~3 MB; cache it, don't poll.
- On the game's protected-endpoint list (Dynamic API transport). Plain calls
  work while that flag is off.
- Used by the addon's Asteroids tab and live search to pick systems before
  the per-system call. Planet counterpart: [galaxy_planet_index.md](./galaxy_planet_index.md).

## Live Verification

- Verified 2026-10-09 on `s0`: `GET /api/galaxy/field-index` -> `200`, 8611
  rows, single keyset, no rows with `totalRemaining` 0 or above `totalCapacity`.
- Previously verified 2026-08-26 (`systems`=8948).
- Examples above are real rows from the 2026-10-09 capture.
