# /api/messages/system

Returns paginated system notifications/messages.

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
  "notifications": [
    {
      "id": 1265887,
      "subject": "Artifact Expired",
      "body": "Your rare artifact \"Molecular Alloy Forge\" has expired after 2 day(s) and has been consumed.",
      "messageType": "system",
      "senderId": null,
      "senderName": null,
      "senderAvatar": null,
      "isRead": false,
      "createdAt": "2026-08-26T09:11:41.507Z"
    }
  ]
}
```

## Notes


## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/messages/system` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `notifications`=30.
