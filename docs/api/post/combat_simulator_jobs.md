# /api/combat-simulator/jobs

Asynchronous form of [`/api/combat-simulator/simulate`](combat_simulator_simulate.md). The
official client switched to it (seen in the client bundle 2026-10-27); `/simulate` still
answers.

## Flow

1. `POST /api/combat-simulator/jobs` with the same `{ attacker, defender }` body as
   `/simulate`. Answer: `{ "ticket": "<uuid>.<43-char base64url>", "status": "pending" }`.
2. `GET /api/combat-simulator/jobs/{ticket}`, polled every 2 s by the client:
   - `{ "status": "pending" }` - keep polling.
   - `{ "status": "complete", "result": { ... } }` - `result` has the same shape as the
     `/simulate` response: `scale`, `summary`, `exact`, `report`.
   - any other status - the client reports "Calculation failed".

Refusals carry the same codes as `/simulate` (`CALCULATOR_UNAVAILABLE`, `CALCULATOR_BUSY`,
`SIMULATION_REJECTED`).

- Verified 2026-10-27 on `s0`: 1000 Stealth Ship (id 3) vs 1000 Cruiser (id 8), both
  `type: player` with no bonuses -> ticket returned `pending`, first poll `complete` after
  0.5 s; `defender_won` in 3 rounds, all 1000 attackers lost, no defender losses.
