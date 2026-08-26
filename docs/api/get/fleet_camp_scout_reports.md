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

- Current account sample is still empty; fields inside `reports[]` remain unobserved.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/camp-scout-reports` -> `200`.
- Live response was empty on the sweep account; the example above is kept as the documented shape.
