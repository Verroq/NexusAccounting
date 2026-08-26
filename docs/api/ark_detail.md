# /api/ark/{projectId}

Returns the full state of one Ark project: the project itself, every attached research lab, and whether the project can be started.

## Method

`GET`

## Response Structure

```json
{
  "project": {
    "id": 0,
    "status": "announced",
    "initiatorUserId": 0,
    "announcedAt": "",
    "completesAt": null
  },
  "labs": [
    {
      "planetBuildingId": 0,
      "userId": 0,
      "username": "",
      "planetName": "",
      "level": 15,
      "powerLevel": 100,
      "damagePercent": 0
    }
  ],
  "canStart": false,
  "qualifyingLabCount": 0,
  "requiredLevel15Labs": 3,
  "totalContribution": 0
}
```

## Notes

- The Ark is an end-game **alliance** project: it needs alliance membership, three prerequisite
  researches (`megastructure_engineering`, `dark_matter_weapons`, `alcubierre_drive`) and three
  level-15 research labs contributed by alliance members.
- A lab only counts as qualifying when `level >= 15`, `powerLevel >= 100` and `damagePercent == 0`.
- `labs[].planetBuildingId` is the building row id from the owner's planet, which is also what
  [ark_labs_attach.md](./ark_labs_attach.md) and [ark_labs_detach.md](./ark_labs_detach.md) take.
- `canStart` gates [ark_start.md](./ark_start.md); it turns true once `qualifyingLabCount`
  reaches `requiredLevel15Labs`.
- The client polls this every 30s alongside `GET /api/ark`.
- **Response shape is inferred** from the client's render code - the sweep account has no Ark
  project, so no live sample exists.

## Live Verification

- Not probed (the sweep account has no Ark project).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
