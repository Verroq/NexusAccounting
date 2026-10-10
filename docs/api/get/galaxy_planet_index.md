# /api/galaxy/planet-index

Galaxy-wide catalog of **unowned planets**, grouped by system: type, size and
the building slots of each free moon. The game uses it for its colonization
search. One call instead of walking `/api/galaxy/systems/{id}/planets`.

## Method

`GET /api/galaxy/planet-index?catalog=1`

- `catalog=1` is required: without it the response is `{"systems":[]}`.
- Supports `ETag` / `If-None-Match` (`304` when unchanged). `Cache-Control:
  private, no-cache`, so the browser revalidates on every fetch.

## Observed Response Shape

```json
{
  "systems": [
    {
      "systemId": 10,
      "systemName": "A1-10",
      "systemX": 882.6847,
      "systemY": 653.30585,
      "securityZone": "sentinel",
      "planets": [
        { "position": 2, "planetType": "crystalline", "size": 160, "freeMoonSlots": [7, 4] },
        { "position": 5, "planetType": "gas_giant", "size": 334, "freeMoonSlots": [3, 5, 5, 7] },
        { "position": 6, "planetType": "ice", "size": 160, "freeMoonSlots": [] }
      ]
    }
  ]
}
```

## Fields

| Field | Meaning |
|---|---|
| `systemId`, `systemName`, `systemX`, `systemY`, `securityZone` | System identity, coords, zone (`sentinel` / `open` / `dead` / `rift`). |
| `planets[].position` | Orbit position, same as `/planets` `position`. |
| `planets[].planetType` | `rocky`, `gas_giant`, `ice`, `crystalline`, `volcanic`, `terra`. |
| `planets[].size` | Planet size (90 – 399 seen). |
| `planets[].freeMoonSlots` | One entry per unowned moon of that planet, in moon position order; the value is the moon's `buildingSlots` (2 – 10 seen). `[]` = no free moon. |

## Notes

- **Owned planets are left out.** System A1-10 lists positions 1–6 and 8; P7
  (colonized) is absent. Moons owned by players are left out of
  `freeMoonSlots` (P7's free moons are therefore not listed either).
- No ids: planet/moon ids, owners, moon type/size need the per-system call.
- 2026-10-09: 13627 systems (= every `full`-visibility system on the map;
  the 474 `partial` ones are absent), 79890 planets. Types: rocky 17147,
  gas_giant 15566, ice 14962, crystalline 13421, volcanic 11870, terra 6924.
- Payload is ~6.8 MB; cache with the ETag.
- On the game's protected-endpoint list (Dynamic API transport). Plain calls work while that flag is off.
- Not currently used by the addon. Candidate for the Planet Finder when only
  free planets are wanted (the Finder also shows owned planets, which this
  index does not carry).

## Live Verification

- Verified 2026-10-09 on `s0`: `GET /api/galaxy/planet-index?catalog=1` ->
  `200`; revalidation with `If-None-Match` -> `304`. `freeMoonSlots` checked
  against system 10's `/planets` `moons[].buildingSlots`.
