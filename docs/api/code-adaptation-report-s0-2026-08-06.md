# Code Adaptation Report (S0)

Generated: 2026-08-06
Reference host: `https://s0.nexuslegacy.space`

## Scope

- Map live-verified API behavior to current addon implementation.
- Identify required code changes (if any).

## Verified Against Live API

- Full sweep artifacts:
  - `live-sweep-s0-full-2026-08-06.md`
  - `live-sweep-s0-full-2026-08-06.get.csv`
  - `live-sweep-s0-full-2026-08-06.post.csv`
  - `live-sweep-s0-full-2026-08-06.schema.csv`

## Module Mapping

- `nexus-addon/background.js`
  - Uses live-valid endpoints for reports, missions, research, galaxy, market, and dispatch posts.
  - POST payload shapes for fleet actions and research start match server validation behavior.
- `nexus-addon/logistics-view.js`
  - Uses live-valid moon/outpost/dispatch routes and request bodies.
  - `fuel-estimate` behavior aligns with live validation and response fields.
- `nexus-addon/tabs/market.js`
  - Reads market/alliance order lists only; no direct-fill call present.

## Findings

1. No breaking endpoint mismatch was found in currently executed addon flows on S0.
2. `POST /api/market/orders/{orderId}/fill` is currently disabled server-side (`410 MARKET_DIRECT_FILL_DISABLED`).
3. The addon currently does not call direct-fill endpoint, so no runtime code change is required for this deprecation.
4. Coverage check confirms all code-referenced endpoints are now documented.

## Required Code Changes

- None required at this time for S0 compatibility.

## Recommended Follow-up

- If market fill UI or automation is introduced later, it must use the order-book flow instead of `/api/market/orders/{orderId}/fill`.
