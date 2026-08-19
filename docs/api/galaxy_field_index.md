# /api/galaxy/field-index

Returns a compact index of systems relevant for asteroid field syncing.

## Method

`GET`

## Observed Response Shape

```json
{
  "systems": [
    {
      "systemId": 5750
    },
    {
      "systemId": 5752
    }
  ]
}
```

## Notes

- Only the `systemId` field is actively used by the addon.
- The server may provide more metadata, but the current implementation treats this as a compact work queue for background scans.