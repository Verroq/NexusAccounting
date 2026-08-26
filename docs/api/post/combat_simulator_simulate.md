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

```json
{
  "report": {
    "outcome": "attacker",
    "rounds": [],
    "attackerLosses": {},
    "defenderLosses": {},
    "debris": {},
    "attackerRetreated": false,
    "defenderRetreated": false
  },
  "summary": {
    "averageRounds": 3.2
  },
  "exact": {
    "outcome": "attacker",
    "rounds": 3
  },
  "scale": {
    "mode": "exact",
    "factor": 1
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
- **Response shape is inferred** from the client's render code, not from a live call.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
