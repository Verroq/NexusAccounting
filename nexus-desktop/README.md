# nexus-desktop — companion for the Steam build

The Steam client is an Electron wrapper around the web game with no extension
support. This companion attaches to it over the Chrome DevTools Protocol and
runs the addon unchanged: `background.js` in Node, content scripts injected
into the game window, dashboard served at `http://127.0.0.1:7777/dashboard.html`.
No npm dependencies — Node ≥ 22.

## Setup

1. Steam → Nexus Legacy → Properties → Launch Options:
   `--remote-debugging-port=9222`
2. Start the game, then:
   ```
   node nexus-desktop/companion.mjs
   ```
3. The in-game sidebar link opens the dashboard in your default browser.

The debugging port is bound to `127.0.0.1` on the Windows side. From WSL2
that is only reachable with mirrored networking (`[wsl2] networkingMode=mirrored`
in `%USERPROFILE%\.wslconfig`, then `wsl --shutdown`) — or run Node on Windows.

## Env

| Var | Default | |
|---|---|---|
| `NEXUS_CDP` | `http://127.0.0.1:9222` | DevTools endpoint |
| `NEXUS_PORT` | `7777` | dashboard / RPC port |
| `NEXUS_DATA` | `~/.nexus-accounting` | `storage.json` lives here |

Data is separate from the Firefox addon's; use the dashboard backup/restore to
move it across.
