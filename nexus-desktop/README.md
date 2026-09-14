# nexus-desktop — companion for the Steam build

The Steam client is an Electron wrapper around the web game with no extension
support. This companion attaches to it over the Chrome DevTools Protocol and
runs the addon unchanged: `background.js` in Node, content scripts injected
into the game window, dashboard served at `http://127.0.0.1:7777/dashboard.html`.
No npm dependencies — Node ≥ 22.

## Setup (release zip, no install)

1. Steam → Nexus Legacy → Properties → Launch Options:
   `--remote-debugging-port=9222`
2. Unzip `nexus-companion-<version>-win-x64.zip` anywhere, start the game,
   run `nexus-companion.exe`. It retries until the game is up.
3. The in-game sidebar link opens the dashboard in your default browser.

From a checkout instead: `node nexus-desktop/companion.mjs` (Node ≥ 22).

## Building the exe

```
python3 nexus-desktop/build-exe.py
```
Downloads the official `node.exe` once into `nexus-desktop/.cache/`, generates
the SEA blob with *that* node (blob and binary must be the same build) and
injects it with postject (`npx`, build-time only). The zip carries the exe plus
`nexus-desktop/` and `nexus-addon/` — nothing is bundled, so the companion
runs the exact files the Firefox addon ships. On WSL the blob step runs
node.exe through interop in `%TEMP%`.

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
