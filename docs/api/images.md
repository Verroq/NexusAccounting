# /api/images/*

These endpoints serve game assets used by the UI. They are not JSON APIs, but they are part of the game's HTTP surface.

## Methods

`GET`

## Observed Paths

```text
/api/images/research/{key}.webp
/api/images/buildings/terran/{key}.webp
/api/images/ships/{race}/{key}.webp
/api/images/planets/{type}.webp
```

## Notes

- Used for task tracker icons, ship thumbnails, and planet thumbnails.
- Paths are deterministic and keyed by game asset identifiers already present in other API payloads.
- The addon treats missing images as non-fatal and hides the broken image element on error.