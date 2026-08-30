# /api/combat-simulator/simulate

Runs the official server-side battle simulation for two fleets and returns the resulting combat report. This is the same engine the game uses, so it is a reference for any local combat model.

## Method

`POST`

## Request Body

```json
{
  "attacker": {
    "type": "player",
    "fleet": [
      { "shipDefId": 4, "quantity": 50 }
    ],
    "useOwnBonuses": false,
    "attachLeadership": false,
    "bonuses": {
      "attackBonus": 0.15,
      "carrierHangarLevel": 3
    },
    "hangarAssignments": {},
    "scoutPriorityTarget": ""
  },
  "defender": {
    "type": "pirate",
    "fleet": [
      { "shipDefId": 101, "quantity": 20 }
    ],
    "useOwnBonuses": false,
    "attachLeadership": false,
    "pirateZone": "open",
    "scoutPriorityList": []
  }
}
```

## Response Structure

Real capture (s0, 2026-08-30), arrays trimmed:

```json
{
  "scale": {
    "mode": "exact",
    "factor": 1,
    "estimatedWorkUnits": 4543,
    "targetWorkUnits": 100000,
    "maxFactor": 5,
    "requiredFactor": 1
  },
  "summary": {
    "runs": 1,
    "outcomes": { "attacker_won": 1, "defender_won": 0, "draw": 0 },
    "averageRounds": 4,
    "averageAttackerLosses": { "5": 338, "16": 20 },
    "averageDefenderLosses": { "6": 1000, "-2100001": 10 },
    "averageDebris": { "ore": 895750, "silicates": 495825, "alloys": 161300, "cryo_ice": 175, "quantum_dust": 12250, "plasma_core": 33250 },
    "averageShieldAbsorbedDamage": 400
  },
  "exact": {
    "outcome": "attacker_won",
    "rounds": 4,
    "attackerRetreated": false,
    "defenderRetreated": false
  },
  "report": {
    "outcome": "attacker_won",
    "rounds": [
      {
        "round": 1,
        "events": [
          {
            "side": "attacker",
            "totalDamage": 237243,
            "shipsDestroyed": [
              { "key": "interceptor", "name": "Interceptor", "lost": 633 }
            ],
            "shieldAbsorbed": 100
          },
          {
            "side": "defender",
            "totalDamage": 116842,
            "shipsDestroyed": [
              { "key": "fighter", "name": "Fighter", "lost": 235 }
            ]
          }
        ],
        "attackerHpPercent": 96,
        "defenderHpPercent": 59,
        "attackerShieldHp": 653637,
        "attackerShieldMaxHp": 685469,
        "defenderShieldHp": 0,
        "defenderShieldMaxHp": 0
      }
    ],
    "attackerSurvivors": [
      { "shipDefId": 5, "key": "fighter", "quantity": 1462 },
      { "shipDefId": -9000432, "key": "leader_command_vessel", "quantity": 1 }
    ],
    "defenderSurvivors": [],
    "attackerLosses": [
      { "shipDefId": 5, "key": "fighter", "name": "Fighter", "lost": 338, "destroyed": 237, "damaged": 101 }
    ],
    "defenderLosses": [
      { "shipDefId": -2100001, "key": "missile_defense", "name": "Missile Defense System", "lost": 10, "destroyed": 7, "damaged": 3 }
    ],
    "debris": { "ore": 895750, "silicates": 495825, "alloys": 161300, "cryo_ice": 175, "plasma_core": 33250, "quantum_dust": 12250 },
    "attackerRetreated": false,
    "defenderRetreated": false,
    "shieldAbsorbedDamage": 400,
    "leadershipOutcomes": [
      {
        "side": "attacker",
        "shipDefId": -9000432,
        "key": "leader_command_vessel",
        "name": "Ika (Leadership Vessel)",
        "hullBefore": 845,
        "hullMax": 1685,
        "shieldBefore": 269,
        "shieldMax": 269,
        "hullAfter": 845,
        "shieldAfter": 269,
        "destroyed": false
      }
    ]
  }
}
```

## Notes

- `type` is `player`, `npc` or `pirate`. `pirateZone` applies only to `pirate`; `hangarAssignments` and `bonuses` only to `player`.
- `bonuses` is sent only when `useOwnBonuses` is `false`. Values are fractions (the UI takes a percent and divides by 100). `carrierHangarLevel` is the exception: an integer clamped to `0..5`.
- Bonus keys: `attackBonus`, `hpBonus`, `shipShieldBonus`, `damageReduction`, `shieldRegen`, `nanobotRepair`, `phaseShieldDodge`, `fleetTactics`, `armorPierce`, `torpedoBonus`, `ionDisableChance`, `laserAttackBonus`, `kineticAttackBonus`, `plasmaAttackBonus`, `missileAttackBonus`, `ionAttackBonus`, `bomberAttackBonus`, `dreadnoughtAttackBonus`, `carrierHangarLevel`.
- `useOwnBonuses: true` makes the server apply the caller's real researched bonuses and ignores `bonuses`. The client only allows it on one side at a time.
- `scoutPriorityTarget` (string) is sent for the attacker; the defender sends the same value wrapped in `scoutPriorityList`. Both are only set when the side actually contains scouts.
- `scale.mode` is `exact` or `scaled`. On `scaled`, the server simulated a smaller battle and extrapolated: `scale.factor` is the ratio, and per-round damage, losses, survivors and debris are estimates.
- Known error codes: `CALCULATOR_UNAVAILABLE`, `CALCULATOR_BUSY`, `SIMULATION_REJECTED`.
- `report.attackerLosses` / `defenderLosses` are **arrays**, not objects: `{ shipDefId, key, name, lost, destroyed, damaged }`, where `lost` is `destroyed + damaged`. `summary.average*Losses` are the object form, keyed by `shipDefId` as a string.
- `report.attackerSurvivors` / `defenderSurvivors` list what is left as `{ shipDefId, key, quantity }`. A ship absent from the list has no survivors, so do not derive survivors from `sent - lost`.
- Ids the bootstrap ship list does not carry appear here: planetary defence structures are negative (`-2100001` missile defence … `-2100006` EW system) and the leadership vessel is its own negative id (`-9000432`). Both come with a `name`.
- Round events are per side and list what THAT side destroyed, so the attacker's own losses are in the defender's event. Rounds also carry `attackerHpPercent` / `defenderHpPercent`, shield hp/max per side, and `shieldAbsorbed` per event.
- `debris` can include rares (`cryo_ice`, `quantum_dust`, `plasma_core`) alongside `ore`/`silicates`/`alloys` — do not assume only the three basics.
- `summary.runs` is how many battles the server actually ran; `summary.outcomes` are run counts (`attacker_won` / `defender_won` / `draw`), so a distribution is only meaningful when `runs > 1`.
- `scale` also carries `estimatedWorkUnits`, `targetWorkUnits`, `maxFactor` and `requiredFactor` alongside `mode` and `factor`.

## Live Verification

- Verified 2026-08-30 on `s0`: `POST /api/combat-simulator/simulate` -> `200`, captured from a
  real call (player vs player, attacker `useOwnBonuses` + `attachLeadership`, defender with
  planetary defence). The response above is that capture with arrays trimmed.
- The request body was extracted from the official game client bundle (`/assets/*.js`) and
  matches what the game itself sends.
- Shapes previously marked inferred are now confirmed: losses are arrays with a
  destroyed/damaged split, survivors are returned explicitly, and negative ship ids cover
  planetary defence and the leadership vessel.
