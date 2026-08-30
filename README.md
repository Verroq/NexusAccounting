# Nexus Accounting

Firefox addon that tracks survey mission data from [Nexus Legacy](https://s0.nexuslegacy.space).

<img width="1889" height="726" alt="image" src="https://github.com/user-attachments/assets/62757e1c-d4c6-422d-9889-4ad0144b8801" />

## What it does

- Scrapes survey reports from the game API every 15 minutes (or on demand)
- Aggregates resources collected: ore, hydrogen, silicates
- Tracks ship losses and computes their rebuild cost (ore, silicates, hydrogen, alloys, rare resources)
- Breaks down results by event type
- Displays all-time, daily, and hourly views
- Stores up to 500 survey reports locally (configurable, 0 = unlimited)

## How it works

The addon reads your `nexus_token` JWT directly from the browser cookies, no credentials to enter. You just need to be logged in to Nexus Legacy.

All data is stored locally in `browser.storage.local`. Nothing is sent anywhere, except spy intel you explicitly share to your alliance's Discord channel (see [Sharing spy intel](#sharing-spy-intel-with-your-alliance-discord)).

## Usage

1. Log in to [Nexus Legacy](https://s0.nexuslegacy.space)
2. Click the Nexus Accounting toolbar icon to open the dashboard
3. Click **Scrape Now** to fetch data immediately, or wait for the automatic 15-minute scrape

## Dashboard

| Section | Description |
|---|---|
| Resources collected | Ore, hydrogen, silicates, mission count, ships lost |
| Resources lost | Build cost of destroyed ships per resource type |
| Resources per period | Line chart over time |
| Event type breakdown | Doughnut chart of mission types |
| Resources by event type | Bar chart of yields per mission type |
| Recent reports | Paginated table of individual survey reports |

Use the **View** selector (All time / Daily / Hourly) to filter all stats and charts to the latest day or hour.

## Settings

- **Records cap**: max survey reports kept locally. Oldest are dropped when limit is reached. Set to `0` for unlimited.
- **Reset all data**: drops all stored reports (keeps your cap setting).

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


## Disclaimer

Web UI made with Claude Opus 4.8

## License

[Mozilla Public License](https://www.mozilla.org/en-US/MPL/2.0/)



