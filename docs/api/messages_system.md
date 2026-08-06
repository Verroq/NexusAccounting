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
      "id": 1,
      "subject": "Message subject",
      "body": "Message body",
      "messageType": "system",
      "senderId": null,
      "senderName": "System",
      "isRead": false,
      "createdAt": "2026-08-06T00:00:00.000Z"
    }
  ]
}
```

## Notes

- Live-validated on `s0` (200).
