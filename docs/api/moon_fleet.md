# /api/moons/{moonId}/fleet

Returns moon fleet stationed on a moon when access is allowed.

## Method

`GET`

## Response Structure

```json
{
  "fleet": []
}
```

## Notes

- Live probe on `s0` returned `403` (`error`, `code`) for a moon not owned by the current user.
- Access is ownership/permission dependent.
