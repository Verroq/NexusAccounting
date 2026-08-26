# /api/ark/announce

Announces a new Ark project for the caller's alliance. The caller becomes the project initiator.

## Method

`POST`

## Request Body

```text
(no request body)
```

## Response Structure

```json
{
  "projectId": 0
}
```

## Notes

- The Ark is an end-game **alliance** project: it needs alliance membership, three prerequisite
  researches (`megastructure_engineering`, `dark_matter_weapons`, `alcubierre_drive`) and three
  level-15 research labs contributed by alliance members.
- A lab only counts as qualifying when `level >= 15`, `powerLevel >= 100` and `damagePercent == 0`.
- Requires alliance membership and the three prerequisite researches.
- Announcing while `initiatorHasArk` is true is allowed: it starts another project so alliance
  members who missed the previous one can receive an Ark.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
