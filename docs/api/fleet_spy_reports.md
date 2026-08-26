# /api/fleet/spy-reports

Returns scouting/spy reports.

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
  "reports": [
    {
      "id": 97673,
      "missionId": 11132317,
      "userId": 428,
      "targetPlanetId": 59414,
      "targetMoonId": null,
      "targetSystemId": 4639,
      "targetFieldId": null,
      "targetStationId": null,
      "targetUserId": 729,
      "outcome": "success",
      "fleetData": [
        {
          "key": "tanker",
          "name": "Tanker",
          "quantity": 1,
          "shipDefId": 23
        }
      ],
      "buildingData": [
        {
          "key": "ore_mine",
          "name": "Ore Mine",
          "level": 23
        }
      ],
      "defenseData": [
        {
          "key": "shield_generator",
          "name": "Shield Generator",
          "level": 6
        }
      ],
      "resourceData": {
        "ore": 430716,
        "tier": "exact",
        "alloys": 146124,
        "hydrogen": 206245,
        "silicates": 420384
      },
      "expiresAt": "2026-08-21T19:29:20.301Z",
      "isRead": true,
      "createdAt": "2026-08-20T19:29:20.302Z",
      "targetPlanetName": "Cristalline3",
      "targetMoonName": null,
      "targetFieldName": null,
      "targetStationName": null,
      "targetUsername": "Aza-zel",
      "targetAvatarUrl": null,
      "targetPortraitFrame": "/images/frames/command_center.png",
      "targetAllianceTag": null,
      "isSaved": false
    }
  ],
  "unreadCount": 0
}
```

## Notes

- Report objects are populated on the sweep account.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/spy-reports` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `reports`=33, `reports[].buildingData`=16, `reports[].defenseData`=3, `reports[].fleetData`=2.
