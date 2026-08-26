# /api/ark/{projectId}/start

Starts construction on an announced Ark project. Only allowed once enough qualifying labs are attached.

## Method

`POST`

## Request Body

```text
(no request body)
```

## Response Structure

```json
{}
```

## Notes

- Gated by `canStart` in [ark_detail.md](./ark_detail.md).
- Only the project initiator (`project.initiatorUserId`) can call this.
- After starting, `project.completesAt` carries the finish time.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
