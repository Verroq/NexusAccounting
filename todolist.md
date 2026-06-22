# TODO List

## Dead code cleanup (from dead code report)

1. Remove `GET_STATUS` dead message handler and `getStatus()` function in `background.js`
2. Remove 4 unused exports from `loadBackground()` in `tests/helpers.js`
3. Add direct unit tests for 12 untested `engine.js` exports
4. Remove dead `.tech-label .est` CSS rule in `simulator.css`
5. Update misleading migration v7 comment about `system_coords` keys in `background.js`

## Fuel calculation

6. Simulator uses `COORD_TO_FUEL_AU = 1/57.4` to convert galaxy-map coordinates to fuel-AU — calibrated from one data point (595.3 coord → 10.37 fuel-AU). Verify scale factor holds for other system pairs and long-distance routes.
7. Dashboard `missionFuel` uses `rate × (FUEL_K × m.distance + FUEL_BASE)` — verified accurate for surveys. The `m.distance` API field uses different units than galaxy-map coordinates. May be inaccurate for attack/raid missions (untested).
