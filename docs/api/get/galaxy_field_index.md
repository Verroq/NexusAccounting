# /api/galaxy/field-index

Returns a compact index of systems relevant for asteroid field syncing.

## Method

`GET`

## Observed Response Shape

```json
{
  "systems": [
    {
      "systemId": 1,
      "systemName": "A1-1",
      "systemX": 803.393,
      "systemY": 399.07312,
      "securityZone": "sentinel",
      "fieldType": "ore",
      "fieldCount": 1,
      "totalRemaining": 7100,
      "totalCapacity": 36500,
      "minRichness": 0.73,
      "maxRichness": 0.73,
      "richestFieldId": 625063,
      "richestFieldName": "A1-1-AF3",
      "allianceLocked": false,
      "questKey": null,
      "requiresDeadPlanetOrigin": false
    }
  ]
}
```

## Notes

- Only the `systemId` field is actively used by the addon.
- The server may provide more metadata, but the current implementation treats this as a compact work queue for background scans.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/galaxy/field-index` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `systems`=8948.
