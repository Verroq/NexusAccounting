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

## Updating

The Companion screen in the dashboard checks GitHub's latest release on start
and shows it under **Updates**; the button downloads that release's zip and
replaces `nexus-addon/` and `nexus-desktop/` next to the exe. Restart
`nexus-companion.exe` to run the new version — no reinstall, no re-unzip.
`nexus-companion.exe` itself is left alone (Windows holds it open while it
runs); it only changes when Node does, and that release says so.
Set `NEXUS_UPDATE_CHECK=0` to skip the check on start.

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
| `NEXUS_UPDATE_CHECK` | `1` | `0` skips the release check on start |
| `NEXUS_REPO` | `Verroq/NexusAccounting` | repo the update check reads |

Data is separate from the Firefox addon's; use the dashboard backup/restore to
move it across.
