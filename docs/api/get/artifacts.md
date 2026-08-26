# /api/artifacts

Returns every artifact the player owns, with its lifecycle state (studying / active / idle) and its full static definition inlined. The top level is a bare array.

## Method

`GET`

## Response Structure

```json
[
  {
    "id": 38108,
    "userId": 428,
    "artifactDefId": 79,
    "planetId": null,
    "hubId": null,
    "status": "studying",
    "activationStartedAt": null,
    "activationEndsAt": null,
    "activationJobId": null,
    "expiresAt": null,
    "expirationJobId": null,
    "acquiredAt": "2026-08-26T08:15:50.315Z",
    "studyPlanetId": 42432,
    "studyStartedAt": "2026-08-26T09:30:59.449Z",
    "studyEndsAt": "2026-08-26T10:30:59.449Z",
    "studyJobId": "artifact-study-428-38108-1787736659453",
    "definition": {
      "id": 79,
      "key": "dimensional_sieve",
      "name": "Dimensional Sieve",
      "description": "Filters materials across dimensional barriers, finding rare resources hidden from normal sensors.",
      "tier": "epic",
      "scope": "global",
      "effectType": "rare_resource_bonus",
      "effectValue": 0.2,
      "effectResource": null,
      "activationCostOre": 8000,
      "activationCostSilicates": 6000,
      "activationCostHydrogen": 2000,
      "activationCostAlloys": 0,
      "activationCostEnergy": 0,
      "activationTime": 14400,
      "duration": 259200
    }
  }
]
```

## Notes

- `status` drives which actions apply; the study and activation timers are separate (`studyStartedAt`/`studyEndsAt` vs `activationStartedAt`/`activationEndsAt`).
- `definition.scope` is `planet` or `global`; `planetId` is set for a planet-scoped artifact that is currently active somewhere.
- `expiresAt` is when an active effect lapses; `duration` in the definition is that lifetime in seconds.
- Every mutation endpoint below re-fetches this list in the client, so treat it as the single source of truth for artifact state.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/artifacts` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `(root)`=20.
