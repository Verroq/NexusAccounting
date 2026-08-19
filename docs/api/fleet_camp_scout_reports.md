# /api/fleet/camp-scout-reports

Returns camp scout reports for the authenticated user.

## Method

`GET`

## Query Parameters

```text
page={number}
limit={number}
```

## Response Structure

```json
{
  "reports": []
}
```

## Notes

- Live-validated on `s0` (200).
- Current account sample was empty; fields inside `reports[]` were not observable.
