# Nexus Accounting

Companion for [Nexus Legacy](https://nexuslegacy.space): a browser addon (Firefox, Chrome) and a
desktop companion for the Steam client. It reads the reports you have already earned through the
game's own API, keeps them on your machine, and turns them into a dashboard — plus a few tools
injected straight into the game.

<img width="1889" height="726" alt="image" src="https://github.com/user-attachments/assets/62757e1c-d4c6-422d-9889-4ad0144b8801" />

## Install

| Platform | How |
|---|---|
| Firefox | `nexus-accounting-<version>.xpi` from [Releases](../../releases) → drag into Firefox, or *about:addons → Install Add-on From File* |
| Chrome / Edge | `nexus-accounting-<version>.zip` → unzip → *chrome://extensions → Developer mode → Load unpacked* |
| Steam client | `nexus-companion-<version>-win-x64.zip` — see [Steam support](#steam-support) |

Then log in to the game. There are no credentials to enter: the addon reads your session cookie
from the browser. Every universe you are logged into (S0, New Frontier, Beta, …) is scraped, and
the dashboard has a picker to browse each one's data.

## What it does

**Collects, every 15 minutes or on demand**

- Survey, pirate, mining, expedition, wormhole, xeno and PvP combat reports
- Debris fields, pirate camps, wormholes and asteroid fields with their zones
- Spy reports, and the alliance's station stock

**Dashboard** (opens from the toolbar icon or the in-game sidebar link)

| Group | Screens |
|---|---|
| Overview | Global — resources collected, ships lost and their rebuild cost, per period |
| Operations | Surveys · Pirates · Mining · Battles · Debris · Expeditions · Wormhole · Xeno · Shared Intel |
| Alliance | Stations — stock vs. caps, alerts, withdraw/deposit ledger, dispatch haulers and defense |
| Explore | Galaxy Scout · Asteroid Fields (with live search) · Scouting — collect debris, survey, investigate |
| Market & R&D | Market · Fleet Templates · Tech Tree · Combat Simulator (the game's own engine, with your intel as the defender) |

Every screen follows the top bar: universe, View (all time / daily / hourly), zone, and the
resource weights used for "weighted" totals.

**In the game itself**

- Sidebar link to the dashboard, plus **Empire View** (per-planet workforce, buildings,
  production) and **Quartermaster** (ships and resources across every planet, moon and
  outpost) overlays
- Quartermaster sends too: drag a resource or ship onto another colony to stage a
  delivery, transfer, supply, garrison or outpost collection — pick which hauler types
  to use, it plans the fleet and shows fuel, ETA and capacity before you confirm
- **⬆ upgrade** on every building and technology card, **🚀 build** on every ship card: a planner
  that totals the cost to a target level and queues it
- Asteroid field cards get an "optimal ships to clear" calculator

## Your data

Everything lives in the browser's extension storage (or `~/.nexus-accounting/` for the desktop
companion). Nothing leaves your machine except spy intel you explicitly share with your alliance
(below). A backup is written to `Downloads/NexusAccounting/` weekly and before anything
destructive; **Export JSON** makes one on demand and **Import** restores it — that is also how
you move history between the browser addon and the Steam companion.

## Steam support

The Steam version of the game is an Electron wrapper around the same web game, with no room for
extensions. `nexus-companion.exe` attaches to it over its debugging port and does what the
browser does for the addon: scraping, the in-game sidebar and overlays, and the dashboard.

1. In Steam, right-click the game → **Properties** → **Launch Options**:
   `--remote-debugging-port=9222`
2. Unzip `nexus-companion-<version>-win-x64.zip` anywhere and run `nexus-companion.exe`
   (before or after starting the game — it waits). Nothing to install.
3. The in-game sidebar link opens the dashboard in your default browser.

The exe is unsigned, so Windows SmartScreen warns the first time: *More info → Run anyway*.
Details, environment variables and the build in [`nexus-desktop/`](nexus-desktop/README.md).

## Sharing spy intel with your alliance (Discord)

The addon can share spy reports across your alliance through a **private Discord
channel**: one member posts intel, others pull it into their Combat Simulator.
The channel's own membership is the access control — only people in the channel
can read the intel, and Sync drops any report not from your alliance.

Set this up **once per alliance**, then every member pastes the same two values
into their addon.

### 1. Create the channel webhook (sharing)

1. Make a **private channel** only alliance members can see.
2. **Edit Channel → Integrations → Webhooks → New Webhook** → **Copy Webhook URL**.
3. Give that URL to every member. It is bound to that one channel — it cannot read messages,
   and it cannot post anywhere else.

### 2. Configure the addon (each member)

Open the **Shared Intel** tab and paste the webhook URL into the *Alliance sharing* panel
(it saves as you type). Then **Share spy intel** posts your reports to the channel, and the
**Share** button on an individual scan posts just that one.

Pulled intel appears in the same tab, grouped by target, with each scan's resources, defenses,
buildings and fleet — and in the **Combat Simulator** report picker.

### 3. Sync (pulling intel)

Sync needs no bot token. Discord has three webhook endpoints that take the webhook id+token in
the URL and need **no** `Authorization` header at all:

| Endpoint | Used for |
|---|---|
| `POST /webhooks/{id}/{token}?wait=true` | share, and it returns the created message's ID |
| `GET /webhooks/{id}/{token}/messages/{id}` | read a message this webhook sent |
| `PATCH /webhooks/{id}/{token}/messages/{id}` | update the index |

Because nothing carries `Authorization: Bot …`, Discord's edge rule (403 / code `40333` for a
bot token sent with a browser User-Agent) never applies — so **Sync works on Chromium too**, with
no header rewriting and no `webRequestBlocking` permission.

The one gap is that Discord has no endpoint to *enumerate* a webhook's messages. So the alliance
keeps an **index message**: a single webhook message whose content lists the ID of every intel
post. One member presses *Create index message* once, and shares the resulting ID alongside the
webhook URL. Share appends to it; Sync reads it and pulls each listed message.

Attachment CDN URLs are signed and expire (about 24h; expired ones return 404). The addon never
stores them — each Sync re-reads the message, which makes Discord hand back a freshly signed URL.

Known limits:

- **Concurrent shares can race.** Updating the index is read-modify-write and Discord offers no
  `If-Match` on webhook messages, so two members sharing in the same instant could clobber one
  another. The addon re-reads and retries three times, then reports failure rather than silently
  dropping intel.
- **The index holds 90 posts** (Discord's 2000-char message limit); the oldest fall off. The
  previous bot-based sync read the last 50 messages, so this is not a regression.
- **Delete the index message and Sync stops** until someone creates a new one and redistributes
  the ID.

### Security notes

- The **webhook URL is the credential** — anyone holding it can post to that channel, so treat it like a password. It is channel-scoped and write-only, so a leak cannot read your intel or touch other channels. Delete and recreate the webhook in Discord to rotate it.
- **No bot token is used anywhere.** A bot token is application-wide — anyone holding it acts as the bot in every server it has joined — so neither Share nor Sync uses one.
- The webhook URL now grants **more than posting**: whoever holds it can also read, edit and delete messages that webhook sent, including the index. It is still scoped to the one channel and cannot touch anything else, but treat a leak as "alliance intel can be rewritten", not just "someone can post".
- Sync **only merges reports whose alliance tag and universe match yours**, so a mis-configured channel can't pull another alliance's intel into your data.
- Sync reads only what the index message lists, capped at 90 posts — older intel ages out.

## Screens

<img width="1903" height="726" alt="nexus_accounting" src="https://github.com/user-attachments/assets/9a3fd91c-e3cf-4fec-88e1-0c1b973e693c" />

<img width="1893" height="728" alt="nexus_accounting_hourly" src="https://github.com/user-attachments/assets/1658ae94-12c2-42c1-b634-fab23f98bede" />

<img width="1901" height="883" alt="nexus_accounting_graph_bar" src="https://github.com/user-attachments/assets/723bf0e3-8251-4fe3-bc6b-57f1bb54629f" />


## Building

```
python3 nexus-addon/build.py        # .xpi + .zip
python3 nexus-desktop/build-exe.py  # Steam companion zip (Windows / WSL)
```

## License

[Mozilla Public License](https://www.mozilla.org/en-US/MPL/2.0/)
