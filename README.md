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

### 1. Create a Discord bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** tab → **Reset Token** → copy the token (you'll share it with members).

### 2. Invite the bot

1. **OAuth2 → URL Generator**: scope **`bot`**, permissions **View Channel**, **Send Messages**, **Attach Files**, **Read Message History**.
2. Open the generated URL and add the bot to your alliance server.
3. Make a **private channel** only alliance members can see, and let the bot see it. This is where intel lives.

### 3. Get the channel ID

**Settings → Advanced → Developer Mode: ON**, then right-click the channel → **Copy Channel ID**.

### 4. Configure the addon (each member)

In the dashboard status bar, paste your **Discord bot token** and **Channel ID** (both save automatically). Then:

- **Share spy intel** — posts your current spy reports to the channel.
- **Sync intel** — pulls everyone's shared reports into your local intel, so they appear in the **Combat Simulator** report picker.

### Security notes

- The bot token is **shared among all members and stored in each addon** — anyone with it can post to / read that channel as the bot. Scope the bot to only the intel channel, and reset the token if it leaks.
- Sync **only merges reports whose alliance tag and universe match yours**, so a mis-configured channel can't pull another alliance's intel into your data.
- Sync reads the **last 50 messages** — older intel ages out of the channel.

## Screens

<img width="1903" height="726" alt="nexus_accounting" src="https://github.com/user-attachments/assets/9a3fd91c-e3cf-4fec-88e1-0c1b973e693c" />

<img width="1893" height="728" alt="nexus_accounting_hourly" src="https://github.com/user-attachments/assets/1658ae94-12c2-42c1-b634-fab23f98bede" />

<img width="1901" height="883" alt="nexus_accounting_graph_bar" src="https://github.com/user-attachments/assets/723bf0e3-8251-4fe3-bc6b-57f1bb54629f" />


## Disclaimer

Web UI made with Claude Opus 4.8

## License

[Mozilla Public License](https://www.mozilla.org/en-US/MPL/2.0/)



