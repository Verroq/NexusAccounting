# /api/fleet/reports/{id}

Returns full detail for one combat report.

## Method

`GET`

## Response Structure

```json
{
  "report": {
    "id": 1,
    "outcome": "attacker_won",
    "currentUserBattleSide": "attacker",
    "attackerFleet": [],
    "defenderFleet": [],
    "attackerLosses": [],
    "defenderLosses": [],
    "rounds": [],
    "debrisField": {},
    "lootStolen": {}
  }
}
```

## Notes

- Referenced by addon PvP processor to enrich list items.
- Live detail fetch depends on at least one available report ID.
