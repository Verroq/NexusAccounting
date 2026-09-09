# /api/alliances/station-storage

Every station the viewer's alliance controls, with its resource stock, storage caps and the
viewer's own withdraw permission. One call covers all of them (up to 200), which is what the
addon's Stations screen is built on.

## Method

`GET`

## Response Structure

```json
{
  "stations": [
    {
      "id": 1033,
      "name": "Station Gamma",
      "ownerAllianceId": 48,
      "systemName": "G23-25",
      "systemX": 23.911692,
      "systemY": -459.00055,
      "sectorName": "Gamma Arm - Sector 23",
      "sectorIndex": 22,
      "securityZone": "open",
      "ore": 62097.184,
      "silicates": 20693.152,
      "hydrogen": 36504.273,
      "alloys": 0,
      "cryoIce": 1536.3071,
      "quantumDust": 0,
      "plasmaCore": 5389.1147,
      "bioExtract": 0,
      "darkMatter": 0,
      "antimatter": 0,
      "basicStorage": 160000,
      "rareStorage": 16000,
      "withdrawAccessRole": "leader",
      "canManageWithdrawAccess": false,
      "canWithdrawResources": false
    }
  ]
}
```

## Notes

- **The resource fields here are ABSOLUTE amounts**, unlike
  [stations_sector.md](./stations_sector.md) and [stations_detail.md](./stations_detail.md),
  where the same field names carry a *fraction of the cap*. Do not mix the two shapes.
- Caps are per resource: each basic resource has `basicStorage`, each rare has `rareStorage`.
- `canWithdrawResources` is the viewer's own permission at that station; `withdrawAccessRole`
  is the rank the station requires.
- No capture state, garrison or buildings — those need `/api/galaxy/station-index` (capture
  tags for every station in one call) or a per-station detail fetch.

## Live Verification

- Verified 2026-09-09 on `s0`: `GET /api/alliances/station-storage` -> `200`.
- Example above is a real response truncated to its first station (50 returned at capture time).
