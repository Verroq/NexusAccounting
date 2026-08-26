# /api/ark

Returns the calling player's alliance Ark status: every Ark project the alliance has, the highest research lab level available, and whether the caller already owns an Ark.

## Method

`GET`

## Response Structure

```json
{
  "allianceId": 48,
  "projects": [],
  "maxResearchLabLevel": 12,
  "initiatorHasArk": false
}
```

## Notes

- The Ark is an end-game **alliance** project: it needs alliance membership, three prerequisite
  researches (`megastructure_engineering`, `dark_matter_weapons`, `alcubierre_drive`) and three
  level-15 research labs contributed by alliance members.
- A lab only counts as qualifying when `level >= 15`, `powerLevel >= 100` and `damagePercent == 0`.
- `projects[]` items carry at least `id`, `status`, `initiatorUserId`, `announcedAt` and
  `completesAt`. `status` is `announced` or `in_progress` while a project is live; the client
  picks the most recently announced of those as the active one.
- `initiatorHasArk` distinguishes "announce your first Ark" from "announce another one so
  alliance members who missed the last project can get theirs".
- The client polls this every 30s while the Ark panel is open.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/ark` -> `200`.
- `projects` is empty on the sweep account (no Ark announced), so item fields come from the client bundle rather than a live sample.
